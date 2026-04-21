import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MessageCircle, Send, Bot, User, ChevronDown, ChevronUp, FileText, Package, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { generateAIContentSafe } from '@/lib/ai-client'
import type { HandoverDocument, HandoverChat, HandoverAsset } from '@/types/employee-lifecycle'
import { HANDOVER_ASSET_TYPE_LABELS } from '@/types/employee-lifecycle'

const ADMIN_ROLES = ['ceo', 'director', 'division_head', 'admin']

interface EmployeeLite {
  id: string
  name: string
  is_active: boolean
}

interface ChatBubble {
  role: 'user' | 'assistant'
  content: string
  sources?: HandoverChat['sources']
  id?: string
}

function buildContext(doc: HandoverDocument, assets: HandoverAsset[]): string {
  const c = doc.content
  if (!c) return '인수인계 내용이 아직 생성되지 않았습니다.'

  const lines: string[] = []
  if (c.overview) lines.push(`[개요]\n${c.overview}`)
  if (c.daily_summary) lines.push(`[일상 루틴]\n${c.daily_summary}`)
  if (c.knowhow) lines.push(`[노하우·주의사항]\n${c.knowhow}`)
  if (c.projects?.length) {
    lines.push('[프로젝트 목록]')
    for (const p of c.projects) {
      lines.push(`- ${p.name}${p.role ? ` (${p.role})` : ''}: ${p.status || ''}`)
      if (p.handover_points?.length) lines.push(`  인수포인트: ${p.handover_points.join(' / ')}`)
      if (p.successor_action?.length) lines.push(`  후임자 액션: ${p.successor_action.join(' / ')}`)
    }
  }
  if (c.pending_tasks?.length) {
    lines.push('[미완료 업무]')
    for (const t of c.pending_tasks) lines.push(`- ${t.title}${t.note ? ': ' + t.note : ''}`)
  }
  if (c.contacts?.length) {
    lines.push('[주요 연락처]')
    for (const ct of c.contacts) lines.push(`- ${ct.name}${ct.role ? ` (${ct.role})` : ''}${ct.contact ? ': ' + ct.contact : ''}`)
  }
  if (assets.length) {
    lines.push('[자산·문서 목록]')
    for (const a of assets) {
      lines.push(`- [${HANDOVER_ASSET_TYPE_LABELS[a.asset_type]}] ${a.name}${a.location ? ' 위치: ' + a.location : ''}${a.url ? ' URL: ' + a.url : ''}`)
    }
  }
  return lines.join('\n\n')
}

export default function HandoverChatPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const isAdmin = !!profile?.role && ADMIN_ROLES.includes(profile.role)

  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [doc, setDoc] = useState<HandoverDocument | null>(null)
  const [assets, setAssets] = useState<HandoverAsset[]>([])
  const [chats, setChats] = useState<ChatBubble[]>([])
  const [input, setInput] = useState('')
  const [contextExpanded, setContextExpanded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    const q = isAdmin
      ? supabase.from('employees').select('id, name, is_active').order('is_active', { ascending: true }).order('name')
      : supabase.from('employees').select('id, name, is_active').eq('id', profile?.id || '')
    const { data } = await q
    const list = (data || []) as EmployeeLite[]
    setEmployees(list)
    if (!isAdmin && profile?.id) setSelectedEmpId(profile.id)
    setLoading(false)
  }, [isAdmin, profile?.id])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  useEffect(() => {
    if (!selectedEmpId) { setDoc(null); setAssets([]); setChats([]); return }
    let cancelled = false
    async function load() {
      const [docRes, assetRes] = await Promise.all([
        supabase.from('handover_documents').select('*').eq('employee_id', selectedEmpId).maybeSingle(),
        supabase.from('handover_assets').select('*').eq('employee_id', selectedEmpId).order('created_at'),
      ])
      if (cancelled) return
      setDoc((docRes.data as HandoverDocument | null) || null)
      setAssets((assetRes.data || []) as HandoverAsset[])

      // 이전 채팅 히스토리 로드
      if (docRes.data) {
        const { data: chatHistory } = await supabase
          .from('handover_chats')
          .select('*')
          .eq('handover_id', docRes.data.id)
          .order('created_at', { ascending: true })
          .limit(50)
        if (!cancelled && chatHistory) {
          const bubbles: ChatBubble[] = []
          for (const c of chatHistory) {
            bubbles.push({ role: 'user', content: c.question, id: c.id })
            if (c.answer) bubbles.push({ role: 'assistant', content: c.answer, sources: c.sources, id: c.id + '_a' })
          }
          setChats(bubbles)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedEmpId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chats])

  const contextText = useMemo(() => doc ? buildContext(doc, assets) : '', [doc, assets])
  const selectedEmp = useMemo(() => employees.find(e => e.id === selectedEmpId) || null, [employees, selectedEmpId])

  async function handleSend() {
    if (!input.trim() || !doc || sending) return
    const question = input.trim()
    setInput('')
    setSending(true)

    // 낙관적 UI
    setChats((prev) => [...prev, { role: 'user', content: question }])

    const prompt = `당신은 "${selectedEmp?.name || '직원'}"의 인수인계서를 기반으로 답변하는 AI 어시스턴트입니다.
아래 인수인계 데이터만을 근거로 질문에 답변하세요. 데이터에 없는 내용은 "인수인계서에 해당 내용이 없습니다"라고 답변하세요.
간결하고 실용적으로 답변하며, 중요한 경우 관련 자산/프로젝트를 언급해주세요.

=== 인수인계 데이터 ===
${contextText}

=== 질문 ===
${question}`

    const result = await generateAIContentSafe('handover_chat', prompt, { maxAttempts: 3 })
    const answer = result.success ? result.content : (result.error || 'AI 응답에 실패했습니다.')

    // DB 저장
    const { data: saved } = await supabase
      .from('handover_chats')
      .insert({
        handover_id: doc.id,
        asker_id: profile?.id || null,
        question,
        answer,
        sources: null,
      })
      .select()
      .single()

    setChats((prev) => [
      ...prev,
      { role: 'assistant', content: answer, id: saved?.id },
    ])
    setSending(false)

    if (!result.success) toast(answer, 'error')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (loading) return <PageSpinner />

  const hasContent = !!doc?.content

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">인수인계 챗봇</h1>
        <p className="text-sm text-gray-500 mt-0.5">인수인계서 내용을 바탕으로 궁금한 사항을 질문하세요.</p>
      </div>

      {/* 직원 선택 */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              options={[
                { value: '', label: isAdmin ? '대상 직원 선택' : '로딩 중...' },
                ...employees.map(e => ({ value: e.id, label: `${e.name}${e.is_active ? '' : ' (퇴사)'}` })),
              ]}
              disabled={!isAdmin}
            />
            {doc && (
              <Badge variant={doc.content ? 'success' : 'warning'}>
                {doc.content ? 'AI 초안 완성' : '초안 미생성'}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedEmpId && !doc && (
        <Card>
          <CardContent className="py-10 text-center text-gray-400">
            <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">인수인계서가 아직 생성되지 않았습니다.</p>
            <p className="text-xs mt-1">관리자 &gt; 인수인계 메뉴에서 AI 초안을 먼저 생성해주세요.</p>
          </CardContent>
        </Card>
      )}

      {doc && (
        <>
          {/* 인수인계 컨텍스트 미리보기 */}
          <Card>
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              onClick={() => setContextExpanded((v) => !v)}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <FileText className="h-4 w-4 text-brand-500" />
                인수인계 요약 보기
                <span className="text-xs font-normal text-gray-400 ml-1">
                  (프로젝트 {doc.content?.projects?.length ?? 0}건 · 자산 {assets.length}건)
                </span>
              </span>
              {contextExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
            {contextExpanded && (
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                  {doc.content?.projects && doc.content.projects.length > 0 && (
                    <ContextChip icon={<Briefcase className="h-3.5 w-3.5" />} label="프로젝트" items={doc.content.projects.map(p => p.name)} />
                  )}
                  {doc.content?.pending_tasks && doc.content.pending_tasks.length > 0 && (
                    <ContextChip icon={<FileText className="h-3.5 w-3.5" />} label="미완료 업무" items={doc.content.pending_tasks.map(t => t.title)} />
                  )}
                  {assets.length > 0 && (
                    <ContextChip icon={<Package className="h-3.5 w-3.5" />} label="자산" items={assets.map(a => a.name)} />
                  )}
                </div>
                {!hasContent && (
                  <p className="text-xs text-amber-600 mt-2 bg-amber-50 rounded p-2">
                    AI 초안이 생성되지 않아 챗봇 응답 품질이 낮을 수 있습니다.
                  </p>
                )}
              </CardContent>
            )}
          </Card>

          {/* 채팅 영역 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-brand-600" />
                {selectedEmp?.name} 님의 인수인계 Q&A
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* 메시지 목록 */}
              <div className="h-[420px] overflow-y-auto px-4 py-3 space-y-3">
                {chats.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                    <Bot className="h-10 w-10 text-gray-200" />
                    <p>인수인계서 관련 질문을 입력해보세요.</p>
                    <div className="flex flex-wrap gap-2 mt-2 justify-center">
                      {SAMPLE_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          onClick={() => setInput(q)}
                          className="text-xs bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-full px-3 py-1 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {chats.map((msg, i) => (
                  <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-4 w-4 text-brand-600" />
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-brand-600 text-white rounded-tr-sm'
                          : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="h-4 w-4 text-gray-500" />
                      </div>
                    )}
                  </div>
                ))}
                {sending && (
                  <div className="flex gap-2.5 justify-start">
                    <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-brand-600" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                      <Spinner size="sm" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 입력창 */}
              <div className="border-t px-4 py-3 flex gap-2 items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="질문을 입력하세요... (Enter로 전송, Shift+Enter 줄바꿈)"
                  rows={2}
                  className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-brand-400 placeholder:text-gray-400"
                  disabled={sending || !hasContent}
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || sending || !hasContent}
                  className="shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {!hasContent && (
                <p className="text-xs text-center text-amber-500 pb-2">AI 초안을 먼저 생성해야 챗봇을 사용할 수 있습니다.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

const SAMPLE_QUESTIONS = [
  '현재 진행 중인 프로젝트가 뭐가 있어?',
  '미완료 업무를 알려줘',
  '주요 연락처를 알려줘',
  '어떤 계정/권한을 이어받아야 해?',
]

function ContextChip({ icon, label, items }: { icon: React.ReactNode; label: string; items: string[] }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1.5">
        {icon} {label} ({items.length})
      </div>
      <div className="flex flex-wrap gap-1">
        {items.slice(0, 5).map((item, i) => (
          <span key={i} className="text-[11px] bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 truncate max-w-[120px]">{item}</span>
        ))}
        {items.length > 5 && <span className="text-[11px] text-gray-400">+{items.length - 5}개</span>}
      </div>
    </div>
  )
}
