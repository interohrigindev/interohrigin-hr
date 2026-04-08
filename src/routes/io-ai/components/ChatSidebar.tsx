import { useState } from 'react'
import {
  Search, Bookmark, Archive, Trash2, Sparkles, PenSquare,
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
    <div className="flex flex-col h-full bg-gray-900 text-gray-300 w-full">
      {/* 헤더 — 새 대화 버튼 */}
      <div className="px-3 pt-4 pb-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-700 hover:bg-gray-800 transition-colors text-sm text-gray-200"
        >
          <PenSquare className="h-4 w-4" />
          <span>새 대화</span>
        </button>
      </div>

      {/* 검색 토글 */}
      <div className="px-3 pb-2">
        <button
          onClick={() => { setSearchMode(!searchMode); setSearchQuery(''); setSearchResults([]) }}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
            searchMode ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
          }`}
        >
          <Search className="h-3.5 w-3.5" />
          <span>대화 검색</span>
        </button>
        {searchMode && (
          <div className="flex gap-1.5 mt-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="검색..."
              className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-violet-500"
              autoFocus
            />
          </div>
        )}
      </div>

      {/* 대화 목록 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {searchMode ? (
          displayConvs && displayConvs.length === 0 ? (
            <p className="text-center py-8 text-xs text-gray-600">{searchQuery ? '결과 없음' : '검색어 입력'}</p>
          ) : (
            displayConvs?.map((conv) => (
              <ConvItem key={conv.id} conv={conv} isActive={conv.id === activeConvId}
                onSelect={onSelect} onBookmark={onBookmark} onArchive={onArchive} onDelete={onDelete} />
            ))
          )
        ) : (
          <>
            {activeConvs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                <Sparkles className="h-6 w-6 mb-2 text-gray-700" />
                <p className="text-xs">대화를 시작하세요</p>
              </div>
            )}
            {bookmarked.length > 0 && (
              <>
                <p className="text-[10px] font-medium text-gray-600 px-3 pt-2 pb-1">고정됨</p>
                {bookmarked.map((conv) => (
                  <ConvItem key={conv.id} conv={conv} isActive={conv.id === activeConvId}
                    onSelect={onSelect} onBookmark={onBookmark} onArchive={onArchive} onDelete={onDelete} />
                ))}
              </>
            )}
            {recent.length > 0 && (
              <>
                {bookmarked.length > 0 && <p className="text-[10px] font-medium text-gray-600 px-3 pt-3 pb-1">최근</p>}
                {recent.map((conv) => (
                  <ConvItem key={conv.id} conv={conv} isActive={conv.id === activeConvId}
                    onSelect={onSelect} onBookmark={onBookmark} onArchive={onArchive} onDelete={onDelete} />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* 하단 브랜딩 */}
      <div className="px-4 py-3 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="h-3 w-3 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-400">IO AI</p>
            <p className="text-[9px] text-gray-600">Smart AI Assistant</p>
          </div>
        </div>
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
      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group transition-all mb-0.5 ${
        isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      }`}
      onClick={() => onSelect(conv.id)}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${isActive ? 'font-medium' : ''}`}>
          {conv.title || '새 대화'}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {conv.context_type !== 'general' && (
            <span className="text-[9px] bg-gray-700 text-gray-400 px-1 rounded">
              {CONTEXT_LABELS[conv.context_type]}
            </span>
          )}
          {conv.is_bookmarked && <Bookmark className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />}
          <span className="text-[10px] text-gray-600">{formatTime(conv.last_message_at)}</span>
        </div>
      </div>
      {/* 호버 액션 */}
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onBookmark(conv.id)} className="p-1 text-gray-600 hover:text-amber-500" title="고정">
          <Bookmark className={`h-3 w-3 ${conv.is_bookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
        </button>
        <button onClick={() => onArchive(conv.id)} className="p-1 text-gray-600 hover:text-violet-400" title="아카이브">
          <Archive className="h-3 w-3" />
        </button>
        <button onClick={() => { if (confirm('삭제하시겠습니까?')) onDelete(conv.id) }} className="p-1 text-gray-600 hover:text-red-400" title="삭제">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
