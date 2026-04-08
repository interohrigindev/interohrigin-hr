import { useRef, useEffect, useState } from 'react'
import { Send, Sparkles } from 'lucide-react'
import type { AgentMessage, AgentConversation } from '@/types/ai-agent'
import MessageBubble from './MessageBubble'
import TypingIndicator from './TypingIndicator'

const SUGGESTIONS = [
  { icon: '📊', text: '이번 분기 팀 성과를 분석해줘' },
  { icon: '📝', text: '회의 안건 초안 작성해줘' },
  { icon: '🔍', text: '경쟁사 동향을 조사해줘' },
  { icon: '💡', text: '신규 프로젝트 아이디어 브레인스토밍' },
  { icon: '📋', text: '업무 보고서 작성을 도와줘' },
  { icon: '🎯', text: '팀 OKR 수립을 도와줘' },
]

interface ChatAreaProps {
  conversation: AgentConversation | null
  messages: AgentMessage[]
  sending: boolean
  lastError: string | null
  onSendMessage: (content: string) => void
}

export default function ChatArea({
  conversation, messages, sending, lastError, onSendMessage,
}: ChatAreaProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  function handleSend() {
    if (!input.trim() || sending) return
    onSendMessage(input.trim())
    setInput('')
    // 높이 리셋
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleTextareaInput() {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
  }

  // 빈 상태 — 추천 질문
  if (messages.length === 0 && !sending) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-lg w-full px-6 animate-fade-in">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-200">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">IO AI</h1>
              <p className="text-sm text-gray-500">무엇을 도와드릴까요?</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => onSendMessage(s.text)}
                  className="flex items-start gap-2.5 p-3 bg-white border border-gray-200 rounded-xl text-left hover:border-violet-300 hover:shadow-sm transition-all group"
                >
                  <span className="text-lg mt-0.5">{s.icon}</span>
                  <span className="text-xs text-gray-600 group-hover:text-violet-700 leading-relaxed">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* 입력 */}
        <ChatInput
          input={input}
          setInput={setInput}
          sending={sending}
          textareaRef={textareaRef}
          onSend={handleSend}
          onKeyDown={handleKeyDown}
          onInput={handleTextareaInput}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 대화 헤더 */}
      {conversation && (
        <div className="px-6 py-2.5 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
          <p className="text-sm font-medium text-gray-700 truncate">{conversation.title || '새 대화'}</p>
        </div>
      )}

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {sending && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 에러 */}
      {lastError && (
        <div className="px-6 py-1.5 bg-red-50 border-t border-red-100">
          <p className="text-xs text-red-600 text-center">{lastError}</p>
        </div>
      )}

      {/* 입력 */}
      <ChatInput
        input={input}
        setInput={setInput}
        sending={sending}
        textareaRef={textareaRef}
        onSend={handleSend}
        onKeyDown={handleKeyDown}
        onInput={handleTextareaInput}
      />
    </div>
  )
}

function ChatInput({
  input, setInput, sending, textareaRef, onSend, onKeyDown, onInput,
}: {
  input: string; setInput: (v: string) => void; sending: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onSend: () => void; onKeyDown: (e: React.KeyboardEvent) => void
  onInput: () => void
}) {
  return (
    <div className="px-6 py-4 border-t border-gray-100 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onInput={onInput}
            placeholder="메시지를 입력하세요... (Shift+Enter로 줄바꿈)"
            disabled={sending}
            rows={1}
            className="flex-1 text-sm bg-transparent resize-none focus:outline-none disabled:opacity-50 max-h-40 leading-relaxed py-1"
          />
          <button
            onClick={onSend}
            disabled={sending || !input.trim()}
            className="p-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-30 disabled:hover:bg-violet-600 transition-colors shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 text-center mt-1.5">IO AI는 참고용이며, 중요한 결정은 반드시 확인하세요.</p>
      </div>
    </div>
  )
}
