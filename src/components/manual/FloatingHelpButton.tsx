/**
 * FloatingHelpButton — 우하단 ? 버튼 + 슬라이드 패널
 *
 * 외부 리서치 결과 베스트 프랙티스:
 *  - 사용자가 막혔을 때 즉시 호출 (강제 X)
 *  - 현재 페이지 기준으로 관련 도움말 추천 (컨텍스트형)
 *  - 검색 기능 포함
 *  - 매뉴얼 페이지가 아닐 때만 노출 (중복 회피)
 */
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HelpCircle, X, Search, ArrowRight, BookOpen, Play } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  HELP_ARTICLES,
  getArticlesForRoute,
  searchArticles,
  type HelpArticle,
} from '@/lib/manual/articles'

export function FloatingHelpButton() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  // 매뉴얼/로그인 페이지에서는 숨김 (중복)
  const hideOnPaths = ['/manual', '/login', '/reset-password']
  const isHidden = hideOnPaths.some((p) => location.pathname.startsWith(p))

  // ESC 닫기
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // 패널 열릴 때 검색 초기화
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const contextual = useMemo(() => getArticlesForRoute(location.pathname), [location.pathname])
  const searchResults = useMemo(() => searchArticles(query), [query])
  const featured = useMemo(() => HELP_ARTICLES.filter((a) => a.featured), [])

  if (isHidden) return null

  const openArticle = (id: string) => {
    setOpen(false)
    navigate(`/manual/article/${id}`)
  }

  return (
    <>
      {/* 우하단 floating button — z-index 는 FloatingAIAgent 보다 낮게 (메신저 위로 가지 않도록) */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-6 z-40 h-12 w-12 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-300/50 flex items-center justify-center transition-all hover:scale-105 md:bottom-6 md:right-24"
        aria-label="도움말 열기"
        title="도움말 (?)"
      >
        <HelpCircle className="h-6 w-6" />
      </button>

      {/* 슬라이드 패널 */}
      {open && (
        <>
          {/* backdrop */}
          <div
            className="fixed inset-0 z-[9998] bg-black/30"
            onClick={() => setOpen(false)}
          />

          {/* 패널 */}
          <aside
            className="fixed top-0 right-0 bottom-0 z-[9999] w-full sm:w-[420px] bg-white shadow-2xl flex flex-col"
            role="dialog"
            aria-label="도움말 센터"
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-brand-100 p-1.5">
                  <HelpCircle className="h-4 w-4 text-brand-600" />
                </div>
                <h2 className="text-base font-bold text-gray-900">도움말</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 검색 */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="검색 (예: 연차, 결재 회수)"
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
                />
              </div>
            </div>

            {/* 내용 — 스크롤 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {query ? (
                <SectionList
                  title={`"${query}" 검색 결과`}
                  articles={searchResults}
                  onOpen={openArticle}
                  emptyMessage="검색 결과가 없습니다."
                />
              ) : (
                <>
                  {/* 컨텍스트 추천 (현재 페이지 기준) */}
                  {contextual.length > 0 && (
                    <SectionList
                      title="이 화면 관련 도움말"
                      subtitle="지금 화면에서 자주 묻는 내용"
                      articles={contextual}
                      onOpen={openArticle}
                      accent
                    />
                  )}

                  {/* 추천 글 */}
                  {featured.length > 0 && (
                    <SectionList
                      title="추천 도움말"
                      articles={featured.filter((a) => !contextual.includes(a))}
                      onOpen={openArticle}
                    />
                  )}
                </>
              )}
            </div>

            {/* 푸터 — 매뉴얼 센터 전체 보기 */}
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setOpen(false)
                  navigate('/manual')
                }}
              >
                <BookOpen className="h-3.5 w-3.5 mr-1" /> 전체 도움말
              </Button>
            </div>
          </aside>
        </>
      )}
    </>
  )
}

// ─── 섹션 컴포넌트 ──────────────────────────────────────────────

interface SectionListProps {
  title: string
  subtitle?: string
  articles: HelpArticle[]
  onOpen: (id: string) => void
  accent?: boolean
  emptyMessage?: string
}

function SectionList({ title, subtitle, articles, onOpen, accent, emptyMessage }: SectionListProps) {
  if (articles.length === 0 && emptyMessage) {
    return (
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h3>
        <p className="text-sm text-gray-500 text-center py-6">{emptyMessage}</p>
      </div>
    )
  }
  if (articles.length === 0) return null

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mb-2">{subtitle}</p>}
      <div className="space-y-1.5">
        {articles.map((a) => (
          <button
            key={a.id}
            onClick={() => onOpen(a.id)}
            className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors ${
              accent
                ? 'border-brand-200 bg-brand-50/40 hover:bg-brand-50 hover:border-brand-300'
                : 'border-gray-100 hover:bg-gray-50 hover:border-gray-200'
            }`}
          >
            <Badge variant="default" className="shrink-0">{a.category}</Badge>
            <span className="text-sm font-medium text-gray-900 flex-1 line-clamp-2">{a.title}</span>
            {a.relatedTourId && <Play className="h-3 w-3 text-emerald-500 shrink-0 mt-1" aria-label="투어 가능" />}
            <ArrowRight className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
          </button>
        ))}
      </div>
    </div>
  )
}
