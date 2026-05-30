/**
 * /manual/article/:articleId — 도움말 article 상세
 */
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, ArrowRight, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ArticleContent } from '@/components/manual/ArticleContent'
import { PwaSetupTutorial } from '@/components/manual/tutorials/PwaSetupTutorial'
import { getArticleById } from '@/lib/manual/articles'
import { getChapterById } from '@/lib/manual/chapters'

export default function ManualArticle() {
  const { articleId } = useParams<{ articleId: string }>()
  const navigate = useNavigate()
  const article = articleId ? getArticleById(articleId) : null

  if (!article) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-gray-600 mb-3">도움말을 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => navigate('/manual')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 도움말 센터로
        </Button>
      </div>
    )
  }

  const tour = article.relatedTourId ? getChapterById(article.relatedTourId) : null
  const related = (article.relatedArticleIds ?? [])
    .map((id) => getArticleById(id))
    .filter(Boolean)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* 뒤로가기 */}
      <button
        onClick={() => navigate('/manual')}
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> 도움말 센터로
      </button>

      {/* 헤더 */}
      <div>
        <Badge variant="info" className="mb-2">{article.category}</Badge>
        <h1 className="text-2xl font-bold text-gray-900">{article.title}</h1>
      </div>

      {/* 본문 — 특정 article 은 시각적 튜토리얼 컴포넌트로 렌더링 */}
      {article.id === 'pwa-notification-setup' ? (
        <PwaSetupTutorial />
      ) : (
        <Card>
          <CardContent className="p-6">
            <ArticleContent content={article.content} />
          </CardContent>
        </Card>
      )}

      {/* 체험형 투어 추천 */}
      {tour && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-emerald-100 p-2 shrink-0">
                <Play className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 mb-1">화면에서 직접 시연 받기</p>
                <p className="text-xs text-gray-600 mb-3">
                  글로 읽기 어려우시면, 실제 화면에서 단계별로 안내 받을 수 있어요. 약 {tour.estimatedMinutes}분 소요.
                </p>
                <Button size="sm" onClick={() => navigate(`/manual/tour/${tour.id}`)}>
                  <Play className="h-3.5 w-3.5 mr-1" /> 체험형 투어 시작
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 관련 글 */}
      {related.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-brand-500" />
            <h3 className="text-sm font-semibold text-gray-900">함께 보면 좋은 글</h3>
          </div>
          <div className="space-y-2">
            {related.map((a) => a && (
              <button
                key={a.id}
                onClick={() => navigate(`/manual/article/${a.id}`)}
                className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:border-brand-300 transition-colors"
              >
                <Badge variant="default" className="shrink-0">{a.category}</Badge>
                <span className="text-sm font-medium text-gray-900 flex-1 truncate">{a.title}</span>
                <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
