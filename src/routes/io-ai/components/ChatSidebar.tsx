import { useState } from 'react'
import {
  Plus, Search, Bookmark, Archive, Trash2, MessageSquare, Sparkles,
} from 'lucide-react'
import type { AgentConversation } from '@/types/ai-agent'

const CONTEXT_LABELS: Record<string, string> = {
  general: '일반', project: '프로젝트', recruitment: '채용',
  ojt: 'OJT', evaluation: '평가', hr: '인사', urgent: '긴급',
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))}분`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간`
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

interface ChatSidebarProps {
  conversations: AgentConversation[]
  activeConvId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onBookmark: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onSearchArchive: (query: string) => Promise<AgentConversation[]>
}

export default function ChatSidebar({
  conversations, activeConvId, onSelect, onNewChat,
  onBookmark, onArchive, onDelete, onSearchArchive,
}: ChatSidebarProps) {
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AgentConversation[]>([])

  async function handleSearch() {
    if (!searchQuery.trim()) return
    const results = await onSearchArchive(searchQuery)
    setSearchResults(results)
  }

  const activeConvs = conversations.filter((c) => !c.is_archived)
  const bookmarked = activeConvs.filter((c) => c.is_bookmarked)
  const recent = activeConvs.filter((c) => !c.is_bookmarked)
  const displayConvs = searchMode ? searchResults : null

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* 헤더 */}
      <div className="px-4 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">IO AI</h2>
              <p className="text-[10px] text-gray-400">AI Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setSearchMode(!searchMode); setSearchQuery(''); setSearchResults([]) }}
              className={`p-1.5 rounded-lg transition-colors ${searchMode ? 'bg-violet-100 text-violet-600' : 'text-gray-400 hover:bg-gray-100'}`}
              title="아카이브 검색"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={onNewChat}
              className="p-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
              title="새 대화"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 검색 */}
        {searchMode && (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="아카이브 검색..."
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-400"
              autoFocus
            />
            <button onClick={handleSearch} className="px-2 py-1.5 bg-violet-600 text-white rounded-lg text-xs hover:bg-violet-700">
              검색
            </button>
          </div>
        )}
      </div>

      {/* 대화 목록 */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {searchMode ? (
          displayConvs && displayConvs.length === 0 ? (
            <p className="text-center py-8 text-xs text-gray-400">{searchQuery ? '결과 없음' : '검색어를 입력하세요'}</p>
          ) : (
            displayConvs?.map((conv) => (
              <ConvItem key={conv.id} conv={conv} isActive={conv.id === activeConvId}
                onSelect={onSelect} onBookmark={onBookmark} onArchive={onArchive} onDelete={onDelete} />
            ))
          )
        ) : (
          <>
            {activeConvs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Sparkles className="h-8 w-8 mb-2 text-violet-300" />
                <p className="text-xs">새 대화를 시작하세요</p>
              </div>
            )}
            {bookmarked.length > 0 && (
              <>
                <p className="text-[10px] font-bold text-gray-400 uppercase px-2 pt-1 pb-1">고정됨</p>
                {bookmarked.map((conv) => (
                  <ConvItem key={conv.id} conv={conv} isActive={conv.id === activeConvId}
                    onSelect={onSelect} onBookmark={onBookmark} onArchive={onArchive} onDelete={onDelete} />
                ))}
              </>
            )}
            {recent.length > 0 && (
              <>
                {bookmarked.length > 0 && <p className="text-[10px] font-bold text-gray-400 uppercase px-2 pt-3 pb-1">최근</p>}
                {recent.map((conv) => (
                  <ConvItem key={conv.id} conv={conv} isActive={conv.id === activeConvId}
                    onSelect={onSelect} onBookmark={onBookmark} onArchive={onArchive} onDelete={onDelete} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ConvItem({
  conv, isActive, onSelect, onBookmark, onArchive, onDelete,
}: {
  conv: AgentConversation; isActive: boolean
  onSelect: (id: string) => void; onBookmark: (id: string) => void
  onArchive: (id: string) => void; onDelete: (id: string) => void
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer group transition-all mb-0.5 ${
        isActive
          ? 'bg-violet-100 border border-violet-200'
          : 'hover:bg-white hover:shadow-sm border border-transparent'
      }`}
      onClick={() => onSelect(conv.id)}
    >
      <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? 'text-violet-600' : 'text-gray-400'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${isActive ? 'font-semibold text-violet-900' : 'font-medium text-gray-800'}`}>
          {conv.title || '새 대화'}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {conv.context_type !== 'general' && (
            <span className="text-[9px] bg-violet-100 text-violet-600 px-1 rounded font-medium">
              {CONTEXT_LABELS[conv.context_type]}
            </span>
          )}
          {conv.is_bookmarked && <Bookmark className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />}
          <span className="text-[10px] text-gray-400">{formatTime(conv.last_message_at)}</span>
        </div>
      </div>
      {/* 호버 액션 */}
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
