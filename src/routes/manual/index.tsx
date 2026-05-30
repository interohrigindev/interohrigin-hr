/**
 * /manual — 사용 매뉴얼 (Help Center)
 *
 * 구조:
 *  - 검색 (전체 매뉴얼 통합 검색)
 *  - 추천 매뉴얼 (featured)
 *  - 📚 전 직원 공통 매뉴얼 (시작하기/메뉴 안내/FAQ)
 *  - 🎯 메뉴별 사용 매뉴얼 (결재·근태/연차·평가·프로젝트 등 카테고리별)
 *  - 체험형 투어 (선택)
 *
 * 사용자 요청 (2026-05-30): "본인 권한 메뉴 사용 내용 + 공통 내용" 두 섹션 분리.
 *   모든 article 은 검색·열람 가능 (권한 무관, SaaS 표준 패턴). 분류만 함.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Search, Play, ArrowRight, Sparkles, X, Users, Target } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import {
  HELP_ARTICLES,
  getCommonArticles,
  getMenuArticles,
  searchArticles,
  type HelpArticle,
  type ArticleCategory,
} from '@/lib/manual/articles'
import { EMPLOYEE_CHAPTERS } from '@/lib/manual/chapters'

export default function ManualHub() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const featured = useMemo(() => HELP_ARTICLES.filter((a) => a.featured), [])
  const common = useMemo(() => getCommonArticles(), [])
  const menu = useMemo(() => getMenuArticles(), [])

  // 검색 시: 전체 통합 결과 표시 (그룹 분류 무시)
  const searchResults = useMemo(() => (query.trim() ? searchArticles(query) : null), [query])

  // 메뉴별 매뉴얼: 카테고리별 그룹핑
  const menuByCategory = useMemo(() => {
    const map = new Map<ArticleCategory, HelpArticle[]>()
    for (const a of menu) {
      if (!map.has(a.category)) map.set(a.category, [])
      map.get(a.category)!.push(a)
    }
    return map
  }, [menu])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-brand-100 p-3">
          <BookOpen className="h-6 w-6 text-brand-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">사용 매뉴얼</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            전 직원 공통 가이드와 메뉴별 사용법을 한 곳에서 확인하세요. 어느 화면에서든 우하단 <strong>?</strong> 버튼으로 그 화면 관련 매뉴얼을 즉시 열 수 있습니다.
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
          placeholder='무엇을 도와드릴까요? (예: "연차 신청", "비밀번호 재설정", "PWA 알림")'
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

      {/* 검색 모드 — 전체 통합 결과 */}
      {searchResults !== null && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">
              "{query}" 검색 결과 ({searchResults.length}건)
            </h2>
            {searchResults.length === 0 && (
              <span className="text-xs text-gray-500">검색 결과가 없습니다. 다른 키워드로 시도해보세요.</span>
            )}
          </div>
          <div className="space-y-2">
            {searchResults.map((article) => (
              <ArticleRow key={article.id} article={article} onOpen={() => navigate(`/manual/article/${article.id}`)} />
            ))}
          </div>
        </section>
      )}

      {/* 일반 모드 — 두 섹션 + 추천 */}
      {searchResults === null && (
        <>
          {/* 추천 매뉴얼 */}
          {featured.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-gray-900">추천 매뉴얼</h2>
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

          {/* 📚 전 직원 공통 매뉴얼 */}
          {common.length > 0 && (
            <SectionGroup
              icon={<Users className="h-5 w-5 text-sky-600" />}
              accent="sky"
              title="전 직원 공통 매뉴얼"
              subtitle="신규 입사·시스템 사용법·자주 묻는 질문 등 누구나 알아둘 기본 내용"
            >
              <div className="space-y-2">
                {common.map((article) => (
                  <ArticleRow key={article.id} article={article} onOpen={() => navigate(`/manual/article/${article.id}`)} />
                ))}
              </div>
            </SectionGroup>
          )}

          {/* 🎯 메뉴별 사용 매뉴얼 */}
          {menu.length > 0 && (
            <SectionGroup
              icon={<Target className="h-5 w-5 text-brand-600" />}
              accent="brand"
              title="메뉴별 사용 매뉴얼"
              subtitle="본인이 자주 쓰는 메뉴(결재·연차·평가·프로젝트 등) 의 화면별 사용법"
            >
              <div className="space-y-5">
                {Array.from(menuByCategory.entries()).map(([cat, articles]) => (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-gray-700">{cat}</span>
                      <span className="text-[10px] text-gray-400">{articles.length}건</span>
                    </div>
                    <div className="space-y-2">
                      {articles.map((article) => (
                        <ArticleRow key={article.id} article={article} onOpen={() => navigate(`/manual/article/${article.id}`)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionGroup>
          )}

          {/* 체험형 투어 */}
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
        </>
      )}

      {/* 안내 */}
      <Card className="bg-amber-50/50 border-amber-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3 text-sm text-amber-900">
            <Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">💡 사용 매뉴얼 활용 팁</p>
              <ul className="space-y-1 text-xs text-amber-800">
                <li>· <strong>검색</strong>: "연차", "결재 회수", "비밀번호", "PWA 알림" 등 키워드로 빠르게 찾기</li>
                <li>· <strong>우하단 ? 버튼</strong>: 어느 화면에서든 그 화면 관련 매뉴얼 즉시 열기</li>
                <li>· <strong>체험형 투어</strong>: 글로 읽기보다 직접 화면에서 따라하고 싶을 때</li>
                <li>· 매뉴얼로 해결 안 되면 인사담당 또는 메신저로 문의</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── 컴포넌트 ───────────────────────────────────────────────────

function SectionGroup({
  icon, title, subtitle, accent, children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  accent: 'sky' | 'brand'
  children: React.ReactNode
}) {
  const styles = {
    sky: 'from-sky-50 to-blue-50 border-sky-200',
    brand: 'from-violet-50 to-fuchsia-50 border-brand-200',
  }
  return (
    <section className={`rounded-xl border bg-gradient-to-br ${styles[accent]} p-5`}>
      <div className="flex items-start gap-3 mb-4">
        <div className="rounded-lg bg-white p-2 shadow-sm shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
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
