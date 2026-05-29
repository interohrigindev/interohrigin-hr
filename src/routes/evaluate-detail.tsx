import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEvaluateDetail, type EvaluatorFormData, type CommentFormData } from '@/hooks/useEvaluateDetail'
import { useToast } from '@/components/ui/Toast'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { Dialog } from '@/components/ui/Dialog'
import { ROLE_LABELS, SCORE_LABELS, EVALUATION_STATUS_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { generateAIContent, getAIConfigForFeature } from '@/lib/ai-client'
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Eye, EyeOff, Sparkles, Loader2 } from 'lucide-react'

export default function EvaluateDetail() {
  const { employeeId } = useParams<{ employeeId: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const {
    period,
    employee,
    target,
    categories,
    items,
    selfEvals,
    myScores,
    prevScores,
    myComment,
    evaluatorRole,
    loading,
    saving,
    submitting,
    evaluableTargets,
    currentIndex,
    prevEmployeeId,
    nextEmployeeId,
    saveAll,
    submitEvaluation,
    resubmitEvaluation,
  } = useEvaluateDetail(employeeId)

  // ─── Local state ──────────────────────────────────────────
  const [scoreData, setScoreData] = useState<Record<string, EvaluatorFormData>>({})
  const [commentData, setCommentData] = useState<CommentFormData>({
    strength: '',
    improvement: '',
    overall: '',
  })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  const [showPrevScores, setShowPrevScores] = useState(false)
  const [mobileTab, setMobileTab] = useState<'self' | 'mine'>('mine')
  // 종합 코멘트 AI 검토 의견 (수습평가 패턴) — 생성 후 수정/등록 가능
  const [aiReview, setAiReview] = useState('')
  const [generatingAI, setGeneratingAI] = useState(false)

  // ─── Hydrate from loaded data ─────────────────────────────
  useEffect(() => {
    const map: Record<string, EvaluatorFormData> = {}
    items.forEach((item) => {
      const existing = myScores.find((s) => s.item_id === item.id)
      map[item.id] = {
        score: existing?.score ?? null,
        comment: existing?.comment ?? '',
      }
    })
    setScoreData(map)
  }, [items, myScores])

  useEffect(() => {
    setCommentData({
      strength: myComment?.strength ?? '',
      improvement: myComment?.improvement ?? '',
      overall: myComment?.overall ?? '',
    })
  }, [myComment])

  // Expand all self-eval items by default
  useEffect(() => {
    const map: Record<string, boolean> = {}
    items.forEach((item) => { map[item.id] = true })
    setExpandedItems(map)
  }, [items])

  if (loading) return <PageSpinner />

  if (!period || !employee || !target) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/evaluate')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          목록으로
        </Button>
        <div className="flex h-64 flex-col items-center justify-center gap-2">
          <p className="text-lg font-medium text-gray-600">정보를 찾을 수 없습니다</p>
        </div>
      </div>
    )
  }

  // ─── Computed ─────────────────────────────────────────────
  const isExecutive = evaluatorRole === 'director' || evaluatorRole === 'ceo'
  const mineFinalized = myScores.some((s) => !s.is_draft)
  const statusOrder = [
    'pending', 'self_done', 'leader_done',
    'director_done', 'ceo_done', 'completed',
  ]
  // 읽기전용 판정
  //   · 임원(이사/대표): 본인 차례 이후(완료 포함)면 확정 후에도 수정 가능 (#4). 차례 전이면 읽기전용.
  //   · 리더 등: 본인 확정(is_draft=false) 또는 단계가 본인 이후로 진행되면 읽기전용 (기존 동작 유지).
  const isReadOnly = (() => {
    if (!evaluatorRole) return true
    if (isExecutive) {
      const turnStatus = evaluatorRole === 'director' ? 'leader_done' : 'director_done'
      return statusOrder.indexOf(target.status) < statusOrder.indexOf(turnStatus)
    }
    if (mineFinalized) return true
    const roleDoneStatus = `${evaluatorRole}_done`
    return statusOrder.indexOf(target.status) > statusOrder.indexOf(roleDoneStatus)
  })()
  // 임원이 이미 본인 평가를 확정한 뒤 다시 저장 → 단계 전이 없이 재수정 경로 사용
  const isExecutiveResubmit = isExecutive && mineFinalized

  const groupedItems = categories
    .map((cat) => ({
      category: cat,
      items: items.filter((item) => item.category_id === cat.id),
    }))
    .filter((g) => g.items.length > 0)

  function getSelfEval(itemId: string) {
    return selfEvals.find((se) => se.item_id === itemId)
  }

  function getPrevScore(itemId: string) {
    return prevScores.find((s) => s.item_id === itemId)
  }

  function toggleExpand(itemId: string) {
    setExpandedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  // ─── Handlers ─────────────────────────────────────────────
  function updateScore(itemId: string, patch: Partial<EvaluatorFormData>) {
    setScoreData((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }))
  }

  async function handleSave() {
    const { error } = await saveAll(scoreData, commentData)
    if (error) {
      toast(error, 'error')
    } else {
      toast('임시저장되었습니다')
    }
  }

  function handleSubmitClick() {
    const missing = items.filter((item) => scoreData[item.id]?.score == null)
    if (missing.length > 0) {
      toast(`점수가 입력되지 않은 항목이 ${missing.length}개 있습니다`, 'error')
      return
    }
    const hasComment = commentData.strength.trim() || commentData.improvement.trim() || commentData.overall.trim()
    if (!hasComment) {
      toast('종합 코멘트를 1개 이상 작성해주세요', 'error')
      return
    }
    setConfirmOpen(true)
  }

  async function handleConfirmSubmit() {
    setConfirmOpen(false)
    const { error } = isExecutiveResubmit
      ? await resubmitEvaluation(scoreData, commentData)
      : await submitEvaluation(scoreData, commentData)
    if (error) {
      toast('제출 중 오류가 발생했습니다: ' + error, 'error')
    } else {
      toast(isExecutiveResubmit ? '평가가 수정되었습니다' : '평가가 확정되었습니다')
    }
  }

  // ─── AI 검토 의견 생성 (수습평가 패턴) ─────────────────────
  async function generateAIReview() {
    const hasScore = items.some((item) => scoreData[item.id]?.score != null)
    if (!hasScore) {
      toast('먼저 항목 점수를 입력해주세요', 'error')
      return
    }
    setGeneratingAI(true)
    try {
      const config = await getAIConfigForFeature('evaluation_review')
      if (!config) {
        toast('AI 설정이 필요합니다.', 'error')
        return
      }

      const scoreLines = items.map((item) => {
        const mine = scoreData[item.id]?.score
        const self = getSelfEval(item.id)?.score
        return `- ${item.name}: 평가 ${mine ?? '-'}/${item.max_score}점` +
          (self != null ? ` (자기평가 ${self})` : '')
      }).join('\n')

      const draft = [
        commentData.strength && `강점: ${commentData.strength}`,
        commentData.improvement && `개선 필요: ${commentData.improvement}`,
        commentData.overall && `종합: ${commentData.overall}`,
      ].filter(Boolean).join('\n') || '없음'

      const prompt = `당신은 인사 평가 전문가입니다. 아래 평가 정보를 바탕으로 직원에 대한 "종합 평가 의견"을 한국어로 작성해주세요.

대상 직원: ${employee?.name ?? '미정'}
평가 시기: ${period?.year}년 ${period?.quarter}분기
평가자 역할: ${evaluatorRole ? (ROLE_LABELS[evaluatorRole as keyof typeof ROLE_LABELS] ?? evaluatorRole) : '평가자'}

항목별 점수:
${scoreLines}

평가자가 작성한 코멘트 초안:
${draft}

작성 지침:
1. 항목별 점수의 강점·보완 영역을 균형 있게 짚어 3~5문장으로 작성
2. 단정적 판정이 아닌 "제안/권장" 어조 (예: ~로 보입니다, ~을 권장합니다)
3. 마크다운 없이 일반 텍스트로 작성`

      const result = await generateAIContent(config, prompt, undefined, 'evaluation_review')
      setAiReview(result.content.trim())
      toast('AI 검토 의견이 생성되었습니다')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      toast('AI 검토 의견 생성 실패: ' + message, 'error')
    } finally {
      setGeneratingAI(false)
    }
  }

  // ─── Self-eval panel (reusable for desktop & mobile) ──────
  function renderSelfEvalPanel() {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-gray-900">직원 자기평가</h3>
        {groupedItems.map((group) => (
          <div key={group.category.id} className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              {group.category.name}
              <span className="ml-1 text-xs text-gray-400">
                ({Math.round(group.category.weight * 100)}%)
              </span>
            </p>
            {group.items.map((item) => {
              const se = getSelfEval(item.id)
              const expanded = expandedItems[item.id] ?? false
              return (
                <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{item.name}</span>
                      {se?.score != null && (
                        <Badge variant="primary">{se.score}점</Badge>
                      )}
                    </div>
                    {expanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                  {expanded && se && (
                    <div className="border-t border-gray-200 px-4 py-3 space-y-2 text-sm">
                      {se.personal_goal && (
                        <div>
                          <p className="text-xs font-medium text-gray-500">🎯 목표</p>
                          <p className="text-gray-700">{se.personal_goal}</p>
                        </div>
                      )}
                      {se.achievement_method && (
                        <div>
                          <p className="text-xs font-medium text-gray-500">🔧 달성 방법</p>
                          <p className="text-gray-700">{se.achievement_method}</p>
                        </div>
                      )}
                      {se.self_comment && (
                        <div>
                          <p className="text-xs font-medium text-gray-500">💬 코멘트</p>
                          <p className="text-gray-700">{se.self_comment}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  // ─── My evaluation panel (reusable for desktop & mobile) ──
  function renderMyEvalPanel() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">내 평가</h3>
          {prevScores.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPrevScores(!showPrevScores)}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
            >
              {showPrevScores ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              이전 평가자 점수 {showPrevScores ? '숨기기' : '보기'}
            </button>
          )}
        </div>

        {groupedItems.map((group) => (
          <Card key={group.category.id}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">
                {group.category.name}
                <span className="ml-1 text-xs font-normal text-gray-400">
                  ({Math.round(group.category.weight * 100)}%)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 py-3">
              {group.items.map((item) => {
                const se = getSelfEval(item.id)
                const prev = getPrevScore(item.id)
                const d = scoreData[item.id] ?? { score: null, comment: '' }
                return (
                  <div key={item.id} className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {item.name}
                          <span className="ml-1 text-xs text-gray-400">({item.max_score}점 만점)</span>
                        </p>
                        {item.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {se?.score != null && (
                          <span className="text-xs text-brand-600">자기: {se.score}</span>
                        )}
                        {showPrevScores && prev?.score != null && (
                          <span className="text-xs text-purple-600">
                            {ROLE_LABELS[prev.evaluator_role as keyof typeof ROLE_LABELS] ?? prev.evaluator_role}: {prev.score}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Score selector — 가로형 1~10 버튼 그리드 */}
                    <div>
                      <div className="flex flex-wrap gap-1">
                        {Array.from({ length: item.max_score }, (_, i) => i + 1).map((score) => {
                          const selected = d.score === score
                          return (
                            <button
                              key={score}
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => updateScore(item.id, { score })}
                              title={`${score}점${SCORE_LABELS[score] ? ' — ' + SCORE_LABELS[score] : ''}`}
                              className={cn(
                                'h-9 min-w-9 px-2 rounded-lg text-sm font-medium border transition-colors',
                                selected
                                  ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-brand-50 hover:border-brand-300',
                                isReadOnly && 'cursor-not-allowed opacity-50'
                              )}
                            >
                              {score}
                            </button>
                          )
                        })}
                      </div>
                      {d.score != null && SCORE_LABELS[d.score] && (
                        <p className="text-[11px] text-gray-500 mt-1">{d.score}점 — {SCORE_LABELS[d.score]}</p>
                      )}
                    </div>
                    {/* 항목별 코멘트 입력칸 제거 — 종합 코멘트로 일원화 */}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Top nav */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/evaluate')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          목록으로
        </Button>
      </div>

      {/* Header info */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {period.year}년 {period.quarter}분기 |{' '}
              {evaluatorRole ? ROLE_LABELS[evaluatorRole as keyof typeof ROLE_LABELS] : ''} 평가 |{' '}
              대상: {employee.name}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {EVALUATION_STATUS_LABELS[target.status]}
              {isReadOnly && ' (읽기 전용)'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {currentIndex >= 0 ? `${currentIndex + 1}/${evaluableTargets.length}명` : ''}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={!prevEmployeeId}
                onClick={() => prevEmployeeId && navigate(`/evaluate/${prevEmployeeId}`)}
              >
                <ChevronLeft className="h-4 w-4" />
                이전
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!nextEmployeeId}
                onClick={() => nextEmployeeId && navigate(`/evaluate/${nextEmployeeId}`)}
              >
                다음
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 md:hidden">
        <button
          type="button"
          onClick={() => setMobileTab('self')}
          className={cn(
            'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
            mobileTab === 'self'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          자기평가
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('mine')}
          className={cn(
            'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
            mobileTab === 'mine'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          내 평가
        </button>
      </div>

      {/* Desktop: side-by-side / Mobile: tab content */}
      <div className="hidden md:grid md:grid-cols-2 md:gap-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5 overflow-y-auto max-h-[calc(100vh-20rem)]">
          {renderSelfEvalPanel()}
        </div>
        <div className="overflow-y-auto max-h-[calc(100vh-20rem)]">
          {renderMyEvalPanel()}
        </div>
      </div>

      <div className="md:hidden">
        {mobileTab === 'self' ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            {renderSelfEvalPanel()}
          </div>
        ) : (
          renderMyEvalPanel()
        )}
      </div>

      {/* Overall comments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>종합 코멘트</CardTitle>
            {!isReadOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={generateAIReview}
                disabled={generatingAI}
              >
                {generatingAI ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                {generatingAI ? '생성 중...' : 'AI 검토 의견'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            label="▶ 강점"
            placeholder="직원의 강점을 작성하세요"
            rows={3}
            value={commentData.strength}
            onChange={(e) => setCommentData((prev) => ({ ...prev, strength: e.target.value }))}
            disabled={isReadOnly}
          />
          <Textarea
            label="▶ 개선 필요"
            placeholder="개선이 필요한 부분을 작성하세요"
            rows={3}
            value={commentData.improvement}
            onChange={(e) => setCommentData((prev) => ({ ...prev, improvement: e.target.value }))}
            disabled={isReadOnly}
          />
          <Textarea
            label="▶ 종합 평가"
            placeholder="종합 평가 의견을 작성하세요"
            rows={3}
            value={commentData.overall}
            onChange={(e) => setCommentData((prev) => ({ ...prev, overall: e.target.value }))}
            disabled={isReadOnly}
          />

          {/* AI 검토 의견 — 생성 후 수정/등록 가능 (제안용, 결정 아님) */}
          {!isReadOnly && aiReview && (
            <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-brand-700">
                <Sparkles className="h-4 w-4" />
                AI 검토 의견 (제안)
              </div>
              <Textarea
                rows={4}
                value={aiReview}
                onChange={(e) => setAiReview(e.target.value)}
                placeholder="AI 검토 의견"
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setAiReview('')}>
                  닫기
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setCommentData((prev) => ({ ...prev, overall: aiReview }))
                    setAiReview('')
                    toast('종합 평가에 등록되었습니다')
                  }}
                >
                  종합 평가에 등록
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky bottom bar */}
      {!isReadOnly && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 md:px-6">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {saving && (
                <>
                  <Spinner size="sm" />
                  저장 중...
                </>
              )}
              {submitting && (
                <>
                  <Spinner size="sm" />
                  제출 중...
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!isExecutiveResubmit && (
                <Button variant="outline" onClick={handleSave} disabled={saving || submitting}>
                  임시저장
                </Button>
              )}
              <Button onClick={handleSubmitClick} disabled={saving || submitting}>
                {submitting ? '제출 중...' : (isExecutiveResubmit ? '수정 저장' : '평가 확정')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title={isExecutiveResubmit ? '평가 수정' : '평가 확정'}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {isExecutive
              ? '임원은 확정 후에도 평가를 수정할 수 있습니다. 진행하시겠습니까?'
              : '확정 후에는 평가를 수정할 수 없습니다. 평가를 확정하시겠습니까?'}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button onClick={handleConfirmSubmit}>{isExecutiveResubmit ? '수정 저장' : '확정'}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
