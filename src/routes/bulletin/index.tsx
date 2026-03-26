import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Megaphone, MessageCircle, HelpCircle, Lightbulb,
  Search, Plus, Pin, Eye, MessageSquare,
  ChevronLeft, ChevronRight, Star,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'
import { useBulletin, CATEGORY_MAP, type BulletinCategory } from '@/hooks/useBulletin'

const CATEGORY_ICONS: Record<BulletinCategory, React.ReactNode> = {
  notice: <Megaphone className="h-4 w-4" />,
  general: <MessageCircle className="h-4 w-4" />,
  qa: <HelpCircle className="h-4 w-4" />,
  suggestion: <Lightbulb className="h-4 w-4" />,
}

const TABS: { key: BulletinCategory | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'notice', label: '공지사항' },
  { key: 'general', label: '자유게시판' },
  { key: 'qa', label: 'Q&A' },
  { key: 'suggestion', label: '건의함' },
]

const PAGE_SIZE = 15

export default function BulletinIndex() {
  const navigate = useNavigate()
  const { posts, loading, category, setCategory, search, setSearch } = useBulletin()
  const [page, setPage] = useState(0)

  // Pagination
  const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE))
  const paginatedPosts = posts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // 카테고리 변경 시 페이지 리셋
  const handleCategoryChange = (cat: BulletinCategory | 'all') => {
    setCategory(cat)
    setPage(0)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHour = Math.floor(diffMs / 3600000)

    if (diffMin < 1) return '방금 전'
    if (diffMin < 60) return `${diffMin}분 전`
    if (diffHour < 24) return `${diffHour}시간 전`

    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace('.', '')
  }

  const isNew = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime()
    return diffMs < 24 * 60 * 60 * 1000
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">게시판</h2>
          <p className="text-sm text-gray-500 mt-1">사내 공지사항 및 소통 공간입니다</p>
        </div>
        <Button onClick={() => navigate('/bulletin/write')}>
          <Plus className="h-4 w-4 mr-1.5" />
          글쓰기
        </Button>
      </div>

      {/* 카테고리 탭 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="게시판 카테고리">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleCategoryChange(tab.key)}
              className={cn(
                'whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                category === tab.key
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="제목 또는 내용으로 검색..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="pl-10"
        />
      </div>

      {/* 게시글 목록 */}
      <Card>
        {paginatedPosts.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">게시글이 없습니다</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {paginatedPosts.map((post) => {
              const catInfo = CATEGORY_MAP[post.category as BulletinCategory]
              return (
                <button
                  key={post.id}
                  onClick={() => navigate(`/bulletin/${post.id}`)}
                  className="w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors flex items-start gap-3"
                >
                  {/* 카테고리 뱃지 */}
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shrink-0 mt-0.5',
                    catInfo?.bgColor, catInfo?.color,
                  )}>
                    {CATEGORY_ICONS[post.category as BulletinCategory]}
                    {catInfo?.label}
                  </span>

                  {/* 본문 영역 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {post.is_pinned && <Pin className="h-3.5 w-3.5 text-brand-600 shrink-0" />}
                      {post.is_important && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                      <span className={cn(
                        'text-sm font-medium text-gray-900 truncate',
                        post.is_pinned && 'text-brand-700',
                      )}>
                        {post.title}
                      </span>
                      {isNew(post.created_at) && (
                        <Badge variant="danger" className="text-[10px] px-1 py-0">N</Badge>
                      )}
                      {post.comment_count > 0 && (
                        <span className="text-xs text-brand-600 font-medium">[{post.comment_count}]</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>{post.author_name}</span>
                      {post.department && <span>{post.department}</span>}
                      <span>{formatDate(post.created_at)}</span>
                      <span className="flex items-center gap-0.5">
                        <Eye className="h-3 w-3" />{post.view_count}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MessageSquare className="h-3 w-3" />{post.comment_count}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-600">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
