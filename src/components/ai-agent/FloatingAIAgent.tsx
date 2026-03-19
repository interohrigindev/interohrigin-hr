import { useState, useRef, useEffect } from 'react'
import {
  Bot, X, Send, Plus, Loader2, Bookmark, Archive,
  Trash2, ArrowLeft, Search, Sparkles, MessageSquare,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAIAgent } from '@/hooks/useAIAgent'
import type { AgentConversation } from '@/types/ai-agent'

const CONTEXT_LABELS: Record<string, string> = {
  general: '일반',
  project: '프로젝트',
  recruitment: '채용',
  ojt: 'OJT',
  evaluation: '평가',
  hr: '인사',
  urgent: '긴급',
}

export default function FloatingAIAgent() {
  const { profile } = useAuth()
  const {
    conversations, activeConversation, messages, sending,
    startNewConversation, selectConversation, sendMessage,
    toggleBookmark, archiveConversation, deleteConversation, searchArchive,
  } = useAIAgent()

  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [view, setView] = useState<'list' | 'chat' | 'search'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AgentConversation[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 로그인 안 되어 있으면 렌더링 안 함
  if (!profile) return null

  // 메시지 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || sending) return
    const msg = input
    setInput('')
    setView('chat')
    await sendMessage(msg)
  }

  async function handleNewChat() {
    await startNewConversation()
    setView('chat')
  }

  async function handleSelectConv(conv: AgentConversation) {
    await selectConversation(conv.id)
    setView('chat')
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    const results = await searchArchive(searchQuery)
    setSearchResults(results)
  }

  const activeConvs = conversations.filter((c) => !c.is_archived)
  const bookmarkedConvs = activeConvs.filter((c) => c.is_bookmarked)
  const recentConvs = activeConvs.filter((c) => !c.is_bookmarked)

  return (
    <>
      {/* ─── 플로팅 버튼 ─── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-600/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        >
          <Bot className="h-6 w-6" />
          {activeConvs.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full text-[10px] font-bold flex items-center justify-center">
              {activeConvs.length}
            </span>
          )}
        </button>
      )}

      {/* ─── 채팅 패널 ─── */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[400px] h-[600px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">

          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 bg-violet-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              {view !== 'list' && (
                <button onClick={() => { setView('list'); setSearchQuery(''); setSearchResults([]) }} className="p-1 hover:bg-violet-500 rounded">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <Sparkles className="h-5 w-5" />
              <span className="font-bold text-sm">InterOhrigin AI</span>
              {activeConversation && view === 'chat' && (
                <span className="text-violet-200 text-xs truncate max-w-[150px]">
                  · {activeConversation.title || '새 대화'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {view === 'list' && (
                <button onClick={() => setView('search')} className="p-1.5 hover:bg-violet-500 rounded" title="아카이브 검색">
                  <Search className="h-4 w-4" />
                </button>
              )}
              <button onClick={handleNewChat} className="p-1.5 hover:bg-violet-500 rounded" title="새 대화">
                <Plus className="h-4 w-4" />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-violet-500 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ─── 대화 목록 ─── */}
          {view === 'list' && (
            <div className="flex-1 overflow-y-auto">
              {activeConvs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6 text-center">
                  <Bot className="h-12 w-12 mb-3 text-violet-300" />
                  <p className="text-sm font-medium text-gray-600 mb-1">AI 어시스턴트에게 물어보세요</p>
                  <p className="text-xs">프로젝트 진행, 시장 조사, 경쟁사 분석 등<br />업무 전반을 지원합니다.</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {bookmarkedConvs.length > 0 && (
                    <>
                      <p className="text-[10px] font-bold text-gray-400 uppercase px-2 pt-1">고정됨</p>
                      {bookmarkedConvs.map((conv) => (
                        <ConvItem key={conv.id} conv={conv} onSelect={handleSelectConv} onBookmark={toggleBookmark} onArchive={archiveConversation} onDelete={deleteConversation} />
                      ))}
                    </>
                  )}
                  {recentConvs.length > 0 && (
                    <>
                      {bookmarkedConvs.length > 0 && <p className="text-[10px] font-bold text-gray-400 uppercase px-2 pt-2">최근</p>}
                      {recentConvs.map((conv) => (
                        <ConvItem key={conv.id} conv={conv} onSelect={handleSelectConv} onBookmark={toggleBookmark} onArchive={archiveConversation} onDelete={deleteConversation} />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── 검색 ─── */}
          {view === 'search' && (
            <div className="flex-1 overflow-y-auto">
              <div className="p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="아카이브된 대화 검색..."
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
                    autoFocus
                  />
                  <button onClick={handleSearch} className="px-3 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700">
                    <Search className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="px-2 space-y-1">
                {searchResults.length === 0 ? (
                  <p className="text-center py-8 text-xs text-gray-400">
                    {searchQuery ? '검색 결과가 없습니다' : '아카이브된 대화를 검색하세요'}
                  </p>
                ) : searchResults.map((conv) => (
                  <ConvItem key={conv.id} conv={conv} onSelect={handleSelectConv} onBookmark={toggleBookmark} onArchive={archiveConversation} onDelete={deleteConversation} />
                ))}
              </div>
            </div>
          )}

          {/* ─── 채팅 ─── */}
          {view === 'chat' && (
            <>
              {/* 컨텍스트 배지 */}
              {activeConversation && activeConversation.context_type !== 'general' && (
                <div className="px-4 py-1.5 bg-violet-50 border-b border-violet-100 flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-violet-500 uppercase">
                    {CONTEXT_LABELS[activeConversation.context_type]}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => activeConversation && toggleBookmark(activeConversation.id)} className="p-0.5 text-gray-400 hover:text-amber-500">
                      <Bookmark className={`h-3 w-3 ${activeConversation.is_bookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
                    </button>
                    <button onClick={() => activeConversation && archiveConversation(activeConversation.id)} className="p-0.5 text-gray-400 hover:text-violet-500" title="아카이브">
                      <Archive className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* 메시지 목록 */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && !sending && (
                  <div className="text-center py-8">
                    <Sparkles className="h-8 w-8 text-violet-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">무엇을 도와드릴까요?</p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-violet-600 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{
                          __html: msg.content
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br/>')
                        }} />
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                        AI가 생각하고 있습니다...
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 입력 */}
              <div className="px-3 py-3 border-t border-gray-100 shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                    }}
                    placeholder="메시지를 입력하세요..."
                    disabled={sending}
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-400 disabled:opacity-50"
                    autoFocus
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !input.trim()}
                    className="px-3 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 disabled:hover:bg-violet-600 transition-colors"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 목록/검색 뷰에서도 빠른 입력 */}
          {(view === 'list' || view === 'search') && (
            <div className="px-3 py-3 border-t border-gray-100 shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                  }}
                  placeholder="새 대화 시작..."
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-400"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="px-3 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ─── 대화 아이템 컴포넌트 ────────────────────────────────────
function ConvItem({
  conv, onSelect, onBookmark, onArchive, onDelete,
}: {
  conv: AgentConversation
  onSelect: (c: AgentConversation) => void
  onBookmark: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors"
      onClick={() => onSelect(conv)}
    >
      <MessageSquare className="h-4 w-4 text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {conv.title || '새 대화'}
        </p>
        <div className="flex items-center gap-1.5">
          {conv.context_type !== 'general' && (
            <span className="text-[10px] bg-violet-100 text-violet-600 px-1 rounded">
              {CONTEXT_LABELS[conv.context_type]}
            </span>
          )}
          {conv.is_bookmarked && <Bookmark className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />}
          <span className="text-[10px] text-gray-400">{conv.message_count}개</span>
        </div>
      </div>
      <span className="text-[10px] text-gray-400 shrink-0">
        {formatTimeShort(conv.last_message_at)}
      </span>
      {/* 액션 버튼 (hover 시 표시) */}
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onBookmark(conv.id)} className="p-1 text-gray-300 hover:text-amber-500" title="고정">
          <Bookmark className={`h-3 w-3 ${conv.is_bookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
        </button>
        <button onClick={() => onArchive(conv.id)} className="p-1 text-gray-300 hover:text-violet-500" title="아카이브">
          <Archive className="h-3 w-3" />
        </button>
        <button onClick={() => { if (confirm('삭제하시겠습니까?')) onDelete(conv.id) }} className="p-1 text-gray-300 hover:text-red-500" title="삭제">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function formatTimeShort(dateStr: string | null) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))}분`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간`
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}
