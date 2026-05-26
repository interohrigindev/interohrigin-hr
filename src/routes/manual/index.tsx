/**
 * /manual — Help Center (검색 가능한 도움말 센터)
 *
 * 외부 SaaS 리서치(2026) 베스트 프랙티스 적용:
 *  - 검색 우선 (knowledge base 패턴)
 *  - 카테고리별 article 조직
 *  - 추천(featured) 글 상단 노출
 *  - 컨텍스트형 호출은 우하단 ? 버튼으로 별도 제공
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Search, Play, ArrowRight, Sparkles, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { HELP_ARTICLES, getAllCategories, searchArticles, type HelpArticle, type ArticleCategory } from '@/lib/manual/articles'
import { EMPLOYEE_CHAPTERS } from '@/lib/manual/chapters'

export default function ManualHub() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ArticleCategory | 'all'>('all')

  const categories = useMemo(() => getAllCategories(), [])
  const searchResults = useMemo(() => searchArticles(query), [query])
  const filtered = useMemo(() => {
    if (selectedCategory === 'all') return searchResults
    return searchResults.filter((a) => a.category === selectedCategory)
  }, [searchResults, selectedCategory])

  const featured = useMemo(() => HELP_ARTICLES.filter((a) => a.featured), [])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-brand-100 p-3">
          <BookOpen className="h-6 w-6 text-brand-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">도움말 센터</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            궁금한 것을 검색하거나 카테고리에서 찾아보세요. 어느 화면에서든 우하단 <strong>?</strong> 버튼으로 빠르게 도움말을 열 수 있습니다.
          </p>
        </div>
      </div>

      {/* 검색창 */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='무엇을 도와드릴까요? (예: "연차 신청", "비밀번호 재설정")'
          className="w-full pl-12 pr-12 py-4 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 bg-white shadow-sm"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="지우기"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-2">
        <CategoryChip
          label="전체"
          active={selectedCategory === 'all'}
          onClick={() => setSelectedCategory('all')}
        />
        {categories.map((cat) => (
          <CategoryChip
            key={cat}
            label={cat}
            active={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
          />
        ))}
      </div>

      {/* 추천 글 (검색 안 할 때만) */}
      {!query && selectedCategory === 'all' && featured.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-900">추천 도움말</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {featured.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                onOpen={() => navigate(`/manual/article/${article.id}`)}
                accent
              />
            ))}
          </div>
        </section>
      )}

      {/* 검색 결과 또는 전체 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {query ? `"${query}" 검색 결과 (${filtered.length}건)` : '전체 도움말'}
          </h2>
          {filtered.length === 0 && (
            <span className="text-xs text-gray-500">검색 결과가 없습니다. 다른 키워드로 시도해보세요.</span>
          )}
        </div>
        <div className="space-y-2">
          {filtered.map((article) => (
            <ArticleRow
              key={article.id}
              article={article}
              onOpen={() => navigate(`/manual/article/${article.id}`)}
            />
          ))}
        </div>
      </section>

      {/* 체험형 투어 (선택형) */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Play className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold text-gray-900">체험형 투어 (선택)</h2>
          <span className="text-xs text-gray-500">— 직접 화면에서 시연 받고 싶을 때</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {EMPLOYEE_CHAPTERS.map((chapter) => (
            <button
              key={chapter.id}
              onClick={() => navigate(`/manual/tour/${chapter.id}`)}
              className="text-left p-4 rounded-xl border border-gray-200 bg-white hover:border-brand-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-emerald-50 p-2 shrink-0 group-hover:bg-emerald-100 transition-colors">
                  <Play className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{chapter.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{chapter.description}</p>
                  <p className="text-xs text-gray-400 mt-1">약 {chapter.estimatedMinutes}분 · {chapter.steps.length}단계</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 안내 */}
      <Card className="bg-amber-50/50 border-amber-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3 text-sm text-amber-900">
            <Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">💡 도움말 활용 팁</p>
              <ul className="space-y-1 text-xs text-amber-800">
                <li>· <strong>검색</strong>: "연차", "결재 회수", "비밀번호" 등 키워드로 빠르게 찾기</li>
                <li>· <strong>우하단 ? 버튼</strong>: 어느 화면에서든 그 화면 관련 도움말 즉시 열기</li>
                <li>· <strong>체험형 투어</strong>: 글로 읽기보다 직접 화면에서 따라하고 싶을 때</li>
                <li>· 도움말로 해결 안 되면 인사담당 또는 메신저로 문의</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── 컴포넌트 ───────────────────────────────────────────────────

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  )
}

function ArticleCard({ article, onOpen, accent }: { article: HelpArticle; onOpen: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onOpen}
      className={`text-left p-4 rounded-xl border bg-white hover:shadow-md transition-all ${
        accent ? 'border-brand-200 hover:border-brand-400' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <Badge variant="info" className="mb-2">{article.category}</Badge>
      <p className="text-sm font-semibold text-gray-900 line-clamp-2 mb-1">{article.title}</p>
      <div className="flex items-center justify-end mt-2">
        <ArrowRight className="h-4 w-4 text-brand-500" />
      </div>
    </button>
  )
}

function ArticleRow({ article, onOpen }: { article: HelpArticle; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50/30 transition-all"
    >
      <Badge variant="default" className="shrink-0">{article.category}</Badge>
      <span className="text-sm font-medium text-gray-900 flex-1 truncate">{article.title}</span>
      <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
    </button>
  )
}
