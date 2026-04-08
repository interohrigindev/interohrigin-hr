import { useRef, useEffect, useState } from 'react'
import { Sparkles, ArrowUp } from 'lucide-react'
import type { AgentMessage } from '@/types/ai-agent'
import MessageBubble from './MessageBubble'
import TypingIndicator from './TypingIndicator'
import SuggestionChips from './SuggestionChips'

const SUGGESTIONS = [
  { icon: '📊', text: '이번 분기 팀 성과를 분석해줘' },
  { icon: '📝', text: '회의 안건 초안 작성해줘' },
  { icon: '🔍', text: '경쟁사 동향을 조사해줘' },
  { icon: '💡', text: '신규 프로젝트 아이디어 브레인스토밍' },
  { icon: '📋', text: '업무 보고서 작성을 도와줘' },
  { icon: '🎯', text: '팀 OKR 수립을 도와줘' },
]

interface ChatAreaProps {
  messages: AgentMessage[]
  sending: boolean
  lastError: string | null
  onSendMessage: (content: string) => void
}

export default function ChatArea({
  messages, sending, lastError, onSendMessage,
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

  const isEmpty = messages.length === 0 && !sending

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* 스크롤 가능한 메시지 영역 */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          /* ─── 빈 상태: 중앙 로고 + 하단 입력 ─── */
          <div className="flex flex-col items-center justify-center h-full px-6 animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-5 shadow-lg shadow-violet-200/50">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-1">무엇을 도와드릴까요?</h1>
            <p className="text-sm text-gray-400 mb-8">IO AI가 업무를 지원합니다</p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-lg px-4">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => onSendMessage(s.text)}
                  className="flex items-center gap-2.5 p-3 bg-gray-50 border border-gray-100 rounded-xl text-left hover:bg-violet-50 hover:border-violet-200 transition-all group"
                >
                  <span className="text-lg shrink-0">{s.icon}</span>
                  <span className="text-xs text-gray-600 group-hover:text-violet-700 leading-snug">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ─── 메시지 목록 ─── */
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-5 pb-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {sending && <TypingIndicator />}
            {!sending && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && (
              <SuggestionChips
                lastAssistantMessage={messages[messages.length - 1].content}
                onSelect={onSendMessage}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 에러 */}
      {lastError && (
        <div className="mx-6 mb-2">
          <div className="max-w-3xl mx-auto px-4 py-2 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-xs text-red-600 text-center">{lastError}</p>
          </div>
        </div>
      )}

      {/* ─── 입력 영역 — 채팅 영역 하단 고정 ─── */}
      <div className="px-6 pb-4 pt-2">
        <div className="max-w-3xl mx-auto">
          <div className="relative bg-gray-50 border border-gray-200 rounded-2xl focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 focus-within:bg-white transition-all shadow-sm">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleTextareaInput}
              placeholder="IO AI에게 메시지 보내기..."
              disabled={sending}
              rows={1}
              className="w-full text-sm bg-transparent resize-none focus:outline-none disabled:opacity-50 max-h-40 leading-relaxed px-4 pt-3 pb-10"
            />
            {/* 하단 도구 영역 */}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <div className="flex items-center gap-1 px-2">
                <span className="text-[10px] text-gray-400">Shift+Enter 줄바꿈</span>
              </div>
              <button
                onClick={handleSend}
                disabled={sending || !input.trim()}
                className="p-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-2">IO AI는 실수할 수 있습니다. 중요한 정보는 반드시 확인하세요.</p>
        </div>
      </div>
    </div>
  )
}
