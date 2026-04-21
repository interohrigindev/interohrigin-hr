import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import DOMPurify from 'dompurify'
import {
  Bot, X, Send, Plus, Bookmark, Archive,
  Trash2, ArrowLeft, Search, Sparkles, MessageSquare,
  Mic, MicOff, Square, FileText, Users, CheckCircle, Maximize2,
  Package,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAIAgent } from '@/hooks/useAIAgent'
import { useMeetingRecorder } from '@/hooks/useMeetingRecorder'
import { useProjectBoard } from '@/hooks/useProjectBoard'
import { supabase } from '@/lib/supabase'
import type { AgentConversation, AgentMessage } from '@/types/ai-agent'

// ─── 상수 ────────────────────────────────────────────────
const CONTEXT_LABELS: Record<string, string> = {
  general: '일반', project: '프로젝트', recruitment: '채용',
  ojt: 'OJT', evaluation: '평가', hr: '인사', urgent: '긴급', handover: '인수인계',
}
const PUBLIC_PATHS = ['/careers', '/apply', '/survey', '/interview', '/exit-survey', '/accept', '/login', '/reset-password', '/io-ai']

// ─── 애니메이션 키프레임 (전역 1회) ──────────────────────
const CHAT_STYLES = `
@keyframes msgSlideIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.msg-in { animation: msgSlideIn 0.18s ease-out both; }
@keyframes dotBounce {
  0%, 60%, 100% { transform: translateY(0); }
  30%           { transform: translateY(-5px); }
}
.dot1 { animation: dotBounce 1.2s ease-in-out infinite; }
.dot2 { animation: dotBounce 1.2s ease-in-out 0.2s infinite; }
.dot3 { animation: dotBounce 1.2s ease-in-out 0.4s infinite; }
`

function formatMsgTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function formatTimeShort(dateStr: string | null) {
  if (!dateStr) return ''
  const d = new Date(dateStr), now = new Date(), diff = now.getTime() - d.getTime()
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))}분`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간`
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

// ─── 메시지 그룹핑 (카카오톡 방식) ──────────────────────
interface MsgGroup { role: 'user' | 'assistant'; msgs: AgentMessage[]; showTime: boolean }
function groupMsgs(msgs: AgentMessage[]): MsgGroup[] {
  const groups: MsgGroup[] = []
  for (const msg of msgs) {
    const last = groups[groups.length - 1]
    if (last && last.role === msg.role) {
      last.msgs.push(msg)
    } else {
      groups.push({ role: msg.role as 'user' | 'assistant', msgs: [msg], showTime: true })
    }
  }
  return groups
}

// ─── 컴포넌트 ─────────────────────────────────────────────
export default function FloatingAIAgent() {
  const location = useLocation()
  const navigate = useNavigate()
  const isPublicPage = PUBLIC_PATHS.some((p) => location.pathname.startsWith(p))
  const { profile } = useAuth()
  const {
    conversations, activeConversation, messages, sending, lastError,
    startNewConversation, selectConversation, sendMessage,
    toggleBookmark, archiveConversation, deleteConversation, searchArchive,
  } = useAIAgent()
  const meeting = useMeetingRecorder()
  const { employees } = useProjectBoard()

  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [view, setView] = useState<'list' | 'chat' | 'search' | 'meeting'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AgentConversation[]>([])
  const [meetingTitle, setMeetingTitle] = useState('')
  const [meetingParticipants, setMeetingParticipants] = useState<string[]>([])
  const [meetingSent, setMeetingSent] = useState(false)
  const [handoverMode, setHandoverMode] = useState(false)
  const [handoverContext, setHandoverContext] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  // 인수인계 모드 감지
  useEffect(() => {
    const isHandover = location.pathname.includes('/handover')
    if (!isHandover) { setHandoverMode(false); setHandoverContext(''); return }
    if (!profile?.id) return
    supabase
      .from('handover_documents')
      .select('content, handover_assets(asset_type, name, location, url)')
      .eq('employee_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.content) return
        const c = data.content as Record<string, unknown>
        const lines: string[] = []
        if (c.overview) lines.push(`[개요] ${c.overview}`)
        if (c.daily_summary) lines.push(`[루틴] ${c.daily_summary}`)
        if (c.knowhow) lines.push(`[노하우] ${c.knowhow}`)
        if (Array.isArray(c.projects)) {
          for (const p of c.projects as Array<Record<string,unknown>>) {
            lines.push(`[프로젝트] ${p.name}${p.role ? ` (${String(p.role)})` : ''}`)
            if (Array.isArray(p.handover_points)) lines.push(`  인수포인트: ${(p.handover_points as string[]).join(' / ')}`)
          }
        }
        if (Array.isArray(c.pending_tasks)) {
          for (const t of c.pending_tasks as Array<Record<string,unknown>>) lines.push(`[미완료] ${t.title}${t.note ? ': ' + t.note : ''}`)
        }
        const assets = (data.handover_assets || []) as Array<Record<string,unknown>>
        for (const a of assets) lines.push(`[자산] ${a.asset_type} - ${a.name}${a.location ? ' (' + a.location + ')' : ''}`)
        setHandoverContext(lines.join('\n'))
        setHandoverMode(true)
      })
  }, [location.pathname, profile?.id])

  if (isPublicPage || !profile) return null

  const activeConvs = conversations.filter((c) => !c.is_archived)
  const bookmarkedConvs = activeConvs.filter((c) => c.is_bookmarked)
  const recentConvs = activeConvs.filter((c) => !c.is_bookmarked)
  const groups = useMemo(() => groupMsgs(messages.filter(m => m.role !== 'system')), [messages])

  async function handleSend() {
    if (!input.trim() || sending) return
    const msg = input.trim()
    setInput('')
    setView('chat')
    await sendMessage(msg, handoverMode && handoverContext ? { extraContext: `이 대화는 인수인계 관련 질문입니다.\n${handoverContext}` } : undefined)
  }
  async function handleNewChat() { await startNewConversation(); setView('chat') }
  async function handleSelectConv(conv: AgentConversation) { await selectConversation(conv.id); setView('chat') }
  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearchResults(await searchArchive(searchQuery))
  }

  const QUICK_QUESTIONS = handoverMode
    ? ['현재 진행 중인 프로젝트가 뭐가 있어?', '미완료 업무를 알려줘', '주요 연락처를 알려줘', '어떤 계정/권한을 이어받아야 해?']
    : ['이번 분기 팀 성과를 분석해줘', '회의 안건 초안 작성해줘', '신규 프로젝트 아이디어 브레인스토밍', '업무 보고서 작성을 도와줘']

  return (
    <>
      <style>{CHAT_STYLES}</style>

      {/* 플로팅 버튼 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 w-12 h-12 md:w-14 md:h-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-600/30 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        >
          <Bot className="h-6 w-6" />
          {activeConvs.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full text-[10px] font-bold flex items-center justify-center">
              {activeConvs.length}
            </span>
          )}
          {handoverMode && (
            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />
          )}
        </button>
      )}

      {/* 채팅 패널 */}
      {isOpen && (
        <div className="fixed bottom-16 md:bottom-6 right-2 md:right-6 z-50 w-[calc(100vw-16px)] md:w-[400px] h-[72vh] md:h-[620px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">

          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-violet-500 text-white shrink-0">
            <div className="flex items-center gap-2">
              {view !== 'list' && (
                <button onClick={() => { setView('list'); setSearchQuery(''); setSearchResults([]) }} className="p-1 hover:bg-violet-500/50 rounded-lg transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <span className="font-bold text-sm">InterOhrigin AI</span>
                {handoverMode && <span className="ml-1.5 text-[10px] bg-emerald-400/30 text-emerald-100 px-1.5 py-0.5 rounded-full">인수인계 모드</span>}
              </div>
              {activeConversation && view === 'chat' && (
                <span className="text-violet-200 text-xs truncate max-w-[100px]">· {activeConversation.title || '새 대화'}</span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {view === 'list' && (
                <>
                  <button onClick={() => setView('search')} className="p-1.5 hover:bg-violet-500/50 rounded-lg transition-colors" title="아카이브 검색"><Search className="h-4 w-4" /></button>
                  <button onClick={() => { setView('meeting'); setMeetingTitle(''); setMeetingParticipants([]); setMeetingSent(false) }} className="p-1.5 hover:bg-violet-500/50 rounded-lg transition-colors" title="회의 녹음"><Mic className="h-4 w-4" /></button>
                </>
              )}
              <button onClick={handleNewChat} className="p-1.5 hover:bg-violet-500/50 rounded-lg transition-colors" title="새 대화"><Plus className="h-4 w-4" /></button>
              <button onClick={() => { setIsOpen(false); navigate('/io-ai', { state: { conversationId: activeConversation?.id } }) }} className="p-1.5 hover:bg-violet-500/50 rounded-lg transition-colors" title="전체 화면"><Maximize2 className="h-4 w-4" /></button>
              <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-violet-500/50 rounded-lg transition-colors"><X className="h-4 w-4" /></button>
            </div>
          </div>

          {/* ─── 대화 목록 ─── */}
          {view === 'list' && (
            <div className="flex-1 overflow-y-auto bg-gray-50/50">
              {activeConvs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6 text-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-violet-50 flex items-center justify-center">
                    <Bot className="h-8 w-8 text-violet-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">AI 어시스턴트에게 물어보세요</p>
                    <p className="text-xs text-gray-400">프로젝트 진행, 시장 조사, 경쟁사 분석 등<br />업무 전반을 지원합니다.</p>
                  </div>
                </div>
              ) : (
                <div className="p-2 space-y-0.5">
                  {bookmarkedConvs.length > 0 && (<>
                    <p className="text-[10px] font-bold text-gray-400 uppercase px-2 pt-2 pb-1">📌 고정됨</p>
                    {bookmarkedConvs.map((conv) => <ConvItem key={conv.id} conv={conv} onSelect={handleSelectConv} onBookmark={toggleBookmark} onArchive={archiveConversation} onDelete={deleteConversation} />)}
                  </>)}
                  {recentConvs.length > 0 && (<>
                    {bookmarkedConvs.length > 0 && <p className="text-[10px] font-bold text-gray-400 uppercase px-2 pt-3 pb-1">최근</p>}
                    {recentConvs.map((conv) => <ConvItem key={conv.id} conv={conv} onSelect={handleSelectConv} onBookmark={toggleBookmark} onArchive={archiveConversation} onDelete={deleteConversation} />)}
                  </>)}
                </div>
              )}
            </div>
          )}

          {/* ─── 검색 ─── */}
          {view === 'search' && (
            <div className="flex-1 overflow-y-auto">
              <div className="p-3">
                <div className="flex gap-2">
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="아카이브된 대화 검색..." className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-violet-400" autoFocus />
                  <button onClick={handleSearch} className="px-3 py-2 bg-violet-600 text-white rounded-xl text-sm hover:bg-violet-700 transition-colors"><Search className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="px-2 space-y-0.5">
                {searchResults.length === 0
                  ? <p className="text-center py-8 text-xs text-gray-400">{searchQuery ? '검색 결과가 없습니다' : '아카이브된 대화를 검색하세요'}</p>
                  : searchResults.map((conv) => <ConvItem key={conv.id} conv={conv} onSelect={handleSelectConv} onBookmark={toggleBookmark} onArchive={archiveConversation} onDelete={deleteConversation} />)
                }
              </div>
            </div>
          )}

          {/* ─── 회의 녹음 ─── */}
          {view === 'meeting' && (
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {meeting.status === 'idle' && (
                <div className="space-y-3">
                  <div className="text-center py-2">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-2">
                      <Mic className="h-7 w-7 text-red-400" />
                    </div>
                    <p className="text-sm font-semibold text-gray-700">회의 녹음</p>
                    <p className="text-xs text-gray-400">녹음 → 텍스트 변환 → AI 회의록 생성</p>
                  </div>
                  <input type="text" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} placeholder="회의 제목 *" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-400" />
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Users className="h-3 w-3" /> 참석자 선택</p>
                    <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-0.5">
                      {employees.map((emp) => (
                        <label key={emp.id} className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={meetingParticipants.includes(emp.id)} onChange={(e) => { if (e.target.checked) setMeetingParticipants((p) => [...p, emp.id]); else setMeetingParticipants((p) => p.filter((id) => id !== emp.id)) }} className="rounded border-gray-300 text-violet-600" />
                          <span className="text-xs text-gray-700">{emp.name}</span>
                        </label>
                      ))}
                    </div>
                    {meetingParticipants.length > 0 && <p className="text-[10px] text-gray-400 mt-1">{meetingParticipants.length}명 선택</p>}
                  </div>
                  <button onClick={() => { if (!meetingTitle.trim()) return; meeting.startRecording() }} disabled={!meetingTitle.trim()} className="w-full flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white rounded-2xl font-medium text-sm transition-colors">
                    <Mic className="h-4 w-4" /> 녹음 시작
                  </button>
                </div>
              )}
              {meeting.status === 'recording' && (
                <div className="text-center space-y-4 py-8">
                  <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto animate-pulse">
                    <Mic className="h-8 w-8 text-red-600" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 font-mono">{meeting.formatTime(meeting.elapsed)}</p>
                  <p className="text-xs text-red-500 font-semibold tracking-wide">● 녹음 중</p>
                  <p className="text-sm text-gray-600 font-medium">{meetingTitle}</p>
                  <button onClick={() => meeting.stopRecording(meetingTitle, meetingParticipants, profile?.department_id || undefined)} className="flex items-center justify-center gap-2 mx-auto px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl font-medium text-sm transition-colors">
                    <Square className="h-4 w-4" /> 녹음 종료
                  </button>
                </div>
              )}
              {['uploading', 'transcribing', 'summarizing'].includes(meeting.status) && (
                <div className="text-center space-y-4 py-8">
                  <div className="flex gap-2 justify-center"><span className="dot1 w-3 h-3 bg-violet-400 rounded-full inline-block" /><span className="dot2 w-3 h-3 bg-violet-400 rounded-full inline-block" /><span className="dot3 w-3 h-3 bg-violet-400 rounded-full inline-block" /></div>
                  <p className="text-sm font-medium text-gray-700">
                    {meeting.status === 'uploading' ? '파일 업로드 중...' : meeting.status === 'transcribing' ? '음성을 텍스트로 변환 중...' : 'AI가 회의록을 작성 중...'}
                  </p>
                </div>
              )}
              {meeting.status === 'completed' && meeting.result && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600"><CheckCircle className="h-5 w-5" /><span className="text-sm font-bold">회의록 생성 완료</span></div>
                  {meeting.result.summary && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">AI 회의록</p>
                      <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(meeting.result.summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/## (.*)/g, '<p class="font-bold text-gray-900 mt-2 mb-1">$1</p>').replace(/\n/g, '<br/>')) }} />
                    </div>
                  )}
                  {!meetingSent ? (
                    <button onClick={async () => { const res = await meeting.sendToParticipants(meeting.result!.id); if (!res.error) setMeetingSent(true) }} className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-sm font-medium transition-colors">
                      <FileText className="h-4 w-4" /> 참석자에게 발송 & 아카이브
                    </button>
                  ) : (
                    <div className="flex items-center justify-center gap-2 py-2.5 bg-emerald-50 text-emerald-700 rounded-2xl text-sm font-medium"><CheckCircle className="h-4 w-4" /> 발송 및 아카이브 완료</div>
                  )}
                  <button onClick={() => setView('list')} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">돌아가기</button>
                </div>
              )}
              {meeting.status === 'error' && (
                <div className="text-center space-y-3 py-8">
                  <MicOff className="h-10 w-10 text-red-400 mx-auto" />
                  <p className="text-sm text-red-600">{meeting.error}</p>
                  <button onClick={() => setView('list')} className="text-sm text-gray-400 hover:text-gray-600">돌아가기</button>
                </div>
              )}
            </div>
          )}

          {/* ─── 채팅 (카카오톡 스타일) ─── */}
          {view === 'chat' && (
            <>
              {/* 컨텍스트 배지 */}
              {activeConversation && (activeConversation.context_type !== 'general' || handoverMode) && (
                <div className="px-4 py-1.5 bg-violet-50 border-b border-violet-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {handoverMode && <Package className="h-3 w-3 text-emerald-500" />}
                    <span className="text-[10px] font-bold text-violet-500 uppercase">
                      {handoverMode ? '인수인계 모드 — 인수인계서 기반 답변' : CONTEXT_LABELS[activeConversation.context_type]}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => activeConversation && toggleBookmark(activeConversation.id)} className="p-0.5 text-gray-400 hover:text-amber-500 transition-colors">
                      <Bookmark className={`h-3 w-3 ${activeConversation.is_bookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
                    </button>
                    <button onClick={() => activeConversation && archiveConversation(activeConversation.id)} className="p-0.5 text-gray-400 hover:text-violet-500 transition-colors"><Archive className="h-3 w-3" /></button>
                  </div>
                </div>
              )}

              {/* 메시지 영역 */}
              <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 bg-[#f2f3f5]">
                {messages.filter(m => m.role !== 'system').length === 0 && !sending && (
                  <div className="space-y-4 py-2">
                    <div className="text-center">
                      <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto mb-2">
                        <Sparkles className="h-7 w-7 text-violet-400" />
                      </div>
                      <p className="text-sm font-semibold text-gray-700">무엇을 도와드릴까요?</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">아래 질문을 선택하거나 직접 입력하세요</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {QUICK_QUESTIONS.map((q) => (
                        <button key={q} onClick={() => { setView('chat'); sendMessage(q, handoverMode && handoverContext ? { extraContext: `인수인계 질문:\n${handoverContext}` } : undefined) }} className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white hover:bg-violet-50 border border-gray-200 hover:border-violet-300 rounded-2xl text-left transition-all shadow-sm group">
                          <span className="text-base">{handoverMode ? '📋' : '✨'}</span>
                          <span className="text-xs text-gray-600 group-hover:text-violet-700">{q}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 그룹별 메시지 렌더링 */}
                {groups.map((group, gi) => (
                  <div key={gi} className={`flex flex-col gap-0.5 ${group.role === 'user' ? 'items-end' : 'items-start'} mb-2`}>
                    {group.msgs.map((msg, mi) => {
                      const isFirst = mi === 0
                      const isLast = mi === group.msgs.length - 1
                      const isUser = group.role === 'user'
                      return (
                        <div key={msg.id} className={`flex gap-2 items-end max-w-[85%] msg-in ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                          {/* AI 아바타 — 그룹 마지막 메시지에만 */}
                          {!isUser && (
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 self-end ${isLast ? 'bg-violet-600' : 'opacity-0 pointer-events-none'}`}>
                              <Bot className="h-4 w-4 text-white" />
                            </div>
                          )}
                          <div className="flex flex-col gap-0.5">
                            {/* 이름 — AI의 첫 메시지에만 */}
                            {!isUser && isFirst && (
                              <span className="text-[11px] font-semibold text-gray-500 ml-0.5 mb-0.5">InterOhrigin AI</span>
                            )}
                            <div className="flex items-end gap-1.5">
                              {/* 시간 — 사용자 버블 왼쪽 */}
                              {isUser && isLast && (
                                <span className="text-[10px] text-gray-400 shrink-0 self-end mb-0.5">{formatMsgTime(msg.created_at)}</span>
                              )}
                              <div className={`px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                                isUser
                                  ? `bg-violet-600 text-white ${isFirst && !isLast ? 'rounded-t-2xl rounded-l-2xl rounded-br-md' : isLast && !isFirst ? 'rounded-b-2xl rounded-l-2xl rounded-tr-md' : group.msgs.length === 1 ? 'rounded-2xl rounded-br-sm' : 'rounded-l-2xl rounded-r-md'}`
                                  : `bg-white text-gray-800 ${isFirst && !isLast ? 'rounded-t-2xl rounded-r-2xl rounded-bl-md' : isLast && !isFirst ? 'rounded-b-2xl rounded-r-2xl rounded-tl-md' : group.msgs.length === 1 ? 'rounded-2xl rounded-bl-sm' : 'rounded-r-2xl rounded-l-md'}`
                              }`}>
                                {isUser ? (
                                  <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                                ) : (
                                  <div className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')) }} />
                                )}
                              </div>
                              {/* 시간 — AI 버블 오른쪽 */}
                              {!isUser && isLast && (
                                <span className="text-[10px] text-gray-400 shrink-0 self-end mb-0.5">{formatMsgTime(msg.created_at)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}

                {/* 타이핑 인디케이터 */}
                {sending && (
                  <div className="flex gap-2 items-end mb-2 msg-in">
                    <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3.5 shadow-sm">
                      <div className="flex gap-1.5 items-center">
                        <span className="dot1 w-2 h-2 bg-gray-400 rounded-full inline-block" />
                        <span className="dot2 w-2 h-2 bg-gray-400 rounded-full inline-block" />
                        <span className="dot3 w-2 h-2 bg-gray-400 rounded-full inline-block" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 에러 */}
              {lastError && (
                <div className="px-3 py-1.5 bg-red-50 border-t border-red-100 shrink-0">
                  <p className="text-[11px] text-red-600 truncate">{lastError}</p>
                </div>
              )}

              {/* 입력창 — 카카오톡 스타일 */}
              <div className="px-3 py-2.5 border-t border-gray-100 bg-white shrink-0">
                <div className="flex gap-2 items-end bg-gray-100 rounded-2xl px-3 py-2">
                  <textarea
                    value={input}
                    onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px' }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder={handoverMode ? '인수인계 관련 질문을 입력하세요...' : '메시지를 입력하세요...'}
                    disabled={sending}
                    rows={1}
                    className="flex-1 text-sm bg-transparent border-none outline-none resize-none placeholder:text-gray-400 max-h-24 py-0.5 leading-relaxed disabled:opacity-50"
                    autoFocus
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !input.trim()}
                    className="w-8 h-8 bg-violet-600 text-white rounded-xl flex items-center justify-center hover:bg-violet-700 disabled:opacity-40 disabled:hover:bg-violet-600 transition-all shrink-0 active:scale-95"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 text-right mt-1 pr-1">Enter 전송 · Shift+Enter 줄바꿈</p>
              </div>
            </>
          )}

          {/* 목록/검색 뷰에서 빠른 입력 */}
          {(view === 'list' || view === 'search') && (
            <div className="px-3 py-2.5 border-t border-gray-100 bg-white shrink-0">
              <div className="flex gap-2 items-center bg-gray-100 rounded-2xl px-3 py-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="새 대화 시작..."
                  className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-gray-400"
                />
                <button onClick={handleSend} disabled={!input.trim()} className="w-8 h-8 bg-violet-600 text-white rounded-xl flex items-center justify-center hover:bg-violet-700 disabled:opacity-40 transition-all active:scale-95">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ─── 대화 아이템 ──────────────────────────────────────────
function ConvItem({ conv, onSelect, onBookmark, onArchive, onDelete }: {
  conv: AgentConversation
  onSelect: (c: AgentConversation) => void
  onBookmark: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white cursor-pointer group transition-all" onClick={() => onSelect(conv)}>
      <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
        <MessageSquare className="h-4 w-4 text-violet-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{conv.title || '새 대화'}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {conv.context_type !== 'general' && (
            <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full">{CONTEXT_LABELS[conv.context_type]}</span>
          )}
          {conv.is_bookmarked && <Bookmark className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />}
          <span className="text-[10px] text-gray-400">{conv.message_count}개</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-gray-400">{formatTimeShort(conv.last_message_at)}</span>
        <div className="hidden group-hover:flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onBookmark(conv.id)} className="p-0.5 text-gray-300 hover:text-amber-500 transition-colors" title="고정"><Bookmark className={`h-3 w-3 ${conv.is_bookmarked ? 'fill-amber-500 text-amber-500' : ''}`} /></button>
          <button onClick={() => onArchive(conv.id)} className="p-0.5 text-gray-300 hover:text-violet-500 transition-colors" title="아카이브"><Archive className="h-3 w-3" /></button>
          <button onClick={() => { if (confirm('삭제하시겠습니까?')) onDelete(conv.id) }} className="p-0.5 text-gray-300 hover:text-red-500 transition-colors" title="삭제"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
    </div>
  )
}
