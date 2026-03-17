import { useState, useEffect, useRef, useCallback } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { generateAIContent, type AIConfig } from '@/lib/ai-client'
import type { ChatMessage } from '@/types/work'
import type { Employee } from '@/types/database'

export default function WorkChatbot() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const employeeId = profile?.id

  const fetchData = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    const [msgRes, empRes, deptRes] = await Promise.all([
      supabase
        .from('chat_messages')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: true })
        .limit(100),
      supabase.from('employees').select('*').eq('is_active', true),
      supabase.from('departments').select('id, name'),
    ])
    if (msgRes.data) setMessages(msgRes.data as ChatMessage[])
    if (empRes.data) setEmployees(empRes.data as Employee[])
    if (deptRes.data) setDepartments(deptRes.data)
    setLoading(false)
  }, [employeeId])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || !employeeId || sending) return

    const userMessage = input.trim()
    setInput('')
    setSending(true)

    // Save user message
    const { data: savedMsg, error: saveErr } = await supabase
      .from('chat_messages')
      .insert({
        employee_id: employeeId,
        role: 'user',
        content: userMessage,
        metadata: {},
      })
      .select()
      .single()

    if (saveErr) {
      toast('메시지 저장 실패', 'error')
      setSending(false)
      return
    }

    setMessages((prev) => [...prev, savedMsg as ChatMessage])

    // Get AI config
    try {
      const { data: aiSettings } = await supabase
        .from('ai_settings').select('*').eq('is_active', true).limit(1).single()

      if (!aiSettings) {
        toast('AI 설정이 필요합니다. 설정 > AI 탭에서 API 키를 등록하세요.', 'error')
        setSending(false)
        return
      }

      const config: AIConfig = {
        provider: aiSettings.provider,
        apiKey: aiSettings.api_key,
        model: aiSettings.model,
      }

      // Build context about employees
      const employeeContext = employees.map((e) => {
        const dept = departments.find((d) => d.id === e.department_id)
        return `- ${e.name} (${dept?.name || '미배정'}, ${e.role}, ${e.email})`
      }).join('\n')

      // Recent conversation for context
      const recentMsgs = messages.slice(-10).map((m) =>
        `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`
      ).join('\n')

      const prompt = `당신은 회사 인사/업무 AI 어시스턴트입니다. 한국어로 답변하세요.

회사 직원 목록:
${employeeContext}

최근 대화:
${recentMsgs}

사용자 질문: ${userMessage}

다음 기능을 수행할 수 있습니다:
1. "이거 누구한테 물어봐?" → 해당 업무/질문에 적합한 직원을 추천
2. "OO이 병가야" → 해당 직원의 업무를 대신할 수 있는 같은 부서/유사 역할 직원 제안
3. 업무 관련 일반 질문에 답변
4. 직원 정보 조회 도움

친절하고 간결하게 답변해주세요.`

      const result = await generateAIContent(config, prompt)

      // Save AI response
      const { data: aiMsg, error: aiErr } = await supabase
        .from('chat_messages')
        .insert({
          employee_id: employeeId,
          role: 'assistant',
          content: result.content,
          metadata: { provider: result.provider, model: result.model },
        })
        .select()
        .single()

      if (!aiErr && aiMsg) {
        setMessages((prev) => [...prev, aiMsg as ChatMessage])
      }
    } catch (err: any) {
      toast('AI 응답 오류: ' + err.message, 'error')
    }

    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">AI 업무 챗봇</h1>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl bg-gray-50 p-4 space-y-3 mb-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <p className="text-lg font-medium mb-2">안녕하세요! 업무 AI 어시스턴트입니다.</p>
              <p className="text-sm">업무 관련 질문을 해보세요.</p>
              <p className="text-xs mt-2 text-gray-300">
                예: "이 프로젝트는 누구한테 물어봐?", "김팀장이 병가면 누가 대체해?"
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-md'
                  : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md shadow-sm'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-brand-200' : 'text-gray-400'}`}>
                {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <Spinner size="sm" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요..."
          rows={1}
          className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-500"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="rounded-xl px-4"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
