import { useState, useEffect, useMemo } from 'react'
import { Users, Send, Loader2, UserPlus, Eye, EyeOff, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { usePeerReview } from '@/hooks/usePeerReview'
import { supabase } from '@/lib/supabase'
import type { PeerReview, PeerReviewCriteriaKey } from '@/types/employee-lifecycle'
import { PEER_REVIEW_CRITERIA, PEER_REVIEW_MAX_PER_ITEM } from '@/types/employee-lifecycle'

interface EmployeeBasic {
  id: string
  name: string
  department_id: string | null
}

interface EvaluationPeriod {
  id: string
  year: number
  quarter: number
  status: string
}

export default function PeerReviewPage() {
  const { hasRole } = useAuth()
  const { toast } = useToast()

  const [periods, setPeriods] = useState<EvaluationPeriod[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [employees, setEmployees] = useState<EmployeeBasic[]>([])
  const [empLoaded, setEmpLoaded] = useState(false)

  const { assignments, myReviews, allReviews, loading, saving, saveReview, submitReview, assignReviewer } = usePeerReview(selectedPeriod || undefined)

  // Review dialog (C2: 10항목 × 10점)
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<string>('')
  const [reviewItemScores, setReviewItemScores] = useState<Record<PeerReviewCriteriaKey, number>>(
    () => PEER_REVIEW_CRITERIA.reduce((acc, c) => ({ ...acc, [c.key]: 0 }), {} as Record<PeerReviewCriteriaKey, number>)
  )
  const [reviewStrengths, setReviewStrengths] = useState('')
  const [reviewImprovements, setReviewImprovements] = useState('')

  const reviewTotalScore = PEER_REVIEW_CRITERIA.reduce((sum, c) => sum + (reviewItemScores[c.key] || 0), 0)

  // Assignment dialog (admin)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assignReviewer_, setAssignReviewer_] = useState('')
  const [assignReviewee, setAssignReviewee] = useState('')

  // Load periods
  useEffect(() => {
    supabase.from('evaluation_periods').select('id, year, quarter, status').order('year', { ascending: false }).order('quarter', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setPeriods(data as EvaluationPeriod[])
          if (data.length > 0 && !selectedPeriod) setSelectedPeriod(data[0].id)
        }
      })
  }, [])

  // Load employees
  useMemo(() => {
    if (empLoaded) return
    supabase.from('employees').select('id, name, department_id').eq('is_active', true).order('name')
      .then(({ data }) => {
        if (data) setEmployees(data)
        setEmpLoaded(true)
      })
  }, [empLoaded])

  const getEmployeeName = (id: string) => employees.find((e) => e.id === id)?.name || '알 수 없음'

  const isAdmin = hasRole('director')

  // Get existing review for a target
  function getMyReview(revieweeId: string): PeerReview | undefined {
    return myReviews.find((r) => r.reviewee_id === revieweeId)
  }

  // Open review dialog
  function openReviewDialog(revieweeId: string) {
    const existing = getMyReview(revieweeId)
    setReviewTarget(revieweeId)
    // 기존 item_scores가 있으면 복원, 없으면 0으로 초기화
    const restored = PEER_REVIEW_CRITERIA.reduce((acc, c) => ({
      ...acc,
      [c.key]: (existing?.item_scores as Record<string, number> | null | undefined)?.[c.key] ?? 0,
    }), {} as Record<PeerReviewCriteriaKey, number>)
    setReviewItemScores(restored)
    setReviewStrengths(existing?.strengths || '')
    setReviewImprovements(existing?.improvements || '')
    setReviewDialogOpen(true)
  }

  function setItemScore(key: PeerReviewCriteriaKey, value: number) {
    const clamped = Math.min(PEER_REVIEW_MAX_PER_ITEM, Math.max(0, value))
    setReviewItemScores((prev) => ({ ...prev, [key]: clamped }))
  }

  async function handleSaveReview() {
    if (!reviewTarget) return
    const result = await saveReview({
      reviewee_id: reviewTarget,
      overall_score: reviewTotalScore,
      item_scores: reviewItemScores,
      strengths: reviewStrengths,
      improvements: reviewImprovements,
    })
    if (result.error) { toast('저장 실패: ' + result.error, 'error'); return }
    toast('임시 저장되었습니다.', 'success')
  }

  async function handleSubmitReview() {
    if (!reviewTarget) return
    // 제출 전 검증: 모든 항목이 1점 이상
    const unfilled = PEER_REVIEW_CRITERIA.filter((c) => (reviewItemScores[c.key] || 0) < 1)
    if (unfilled.length > 0) {
      toast(`모든 항목에 1~10점을 부여해주세요 (미입력: ${unfilled.length}개)`, 'error')
      return
    }
    const result = await submitReview({
      reviewee_id: reviewTarget,
      overall_score: reviewTotalScore,
      item_scores: reviewItemScores,
      strengths: reviewStrengths,
      improvements: reviewImprovements,
    })
    if (result.error) { toast('제출 실패: ' + result.error, 'error'); return }
    toast('동료 평가가 제출되었습니다.', 'success')
    setReviewDialogOpen(false)
  }

  async function handleAssign() {
    if (!assignReviewer_ || !assignReviewee) { toast('평가자와 대상자를 선택하세요.', 'error'); return }
    if (assignReviewer_ === assignReviewee) { toast('같은 사람을 선택할 수 없습니다.', 'error'); return }
    const result = await assignReviewer(assignReviewer_, assignReviewee)
    if (result.error) { toast('배정 실패: ' + result.error, 'error'); return }
    toast('동료 평가가 배정되었습니다.', 'success')
    setAssignDialogOpen(false)
  }

  // Group all reviews by reviewee for summary view
  const revieweeSummary = useMemo(() => {
    const map = new Map<string, { total: number; count: number; reviews: PeerReview[] }>()
    for (const r of allReviews) {
      if (!r.is_submitted || r.overall_score == null) continue
      if (!map.has(r.reviewee_id)) {
        map.set(r.reviewee_id, { total: 0, count: 0, reviews: [] })
      }
      const entry = map.get(r.reviewee_id)!
      entry.total += r.overall_score
      entry.count += 1
      entry.reviews.push(r)
    }
    return map
  }, [allReviews])

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">동료 다면 평가</h1>
        <div className="flex gap-2">
          <Select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            options={periods.map((p) => ({ value: p.id, label: `${p.year}년 ${p.quarter}분기` }))}
            placeholder="평가 기간 선택"
          />
          {isAdmin && (
            <Button onClick={() => setAssignDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" /> 배정
            </Button>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        익명으로 동료를 평가합니다 (100점 만점). 리더는 합산 점수만 확인 가능하며, 개별 코멘트는 임원 이상만 열람할 수 있습니다.
        동료 평가 점수는 최종 평가의 15%에 반영됩니다.
      </div>

      {/* My assignments - peers to review */}
      {assignments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" /> 내 평가 대상
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {assignments.map((assign) => {
                const existing = getMyReview(assign.reviewee_id)
                const isSubmitted = existing?.is_submitted

                return (
                  <div key={assign.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-800">{getEmployeeName(assign.reviewee_id)}</span>
                      {isSubmitted ? (
                        <Badge variant="success">제출 완료</Badge>
                      ) : existing ? (
                        <Badge variant="warning">작성 중</Badge>
                      ) : (
                        <Badge variant="default">미작성</Badge>
                      )}
                      {existing?.overall_score != null && (
                        <span className="text-sm text-brand-600 font-medium">{existing.overall_score}점</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={isSubmitted ? 'outline' : 'primary'}
                      onClick={() => openReviewDialog(assign.reviewee_id)}
                      disabled={isSubmitted}
                    >
                      {isSubmitted ? '제출됨' : existing ? '계속 작성' : '평가 작성'}
                    </Button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary view: for leaders (avg score only) and admins/executives (full detail) */}
      {hasRole('leader') && revieweeSummary.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-5 w-5" /> 동료 평가 결과 요약
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from(revieweeSummary.entries()).map(([revieweeId, data]) => {
                const avg = data.total / data.count
                const canSeeDetails = hasRole('director')

                return (
                  <div key={revieweeId} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-800">{getEmployeeName(revieweeId)}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-brand-600">{avg.toFixed(1)}점</span>
                        <span className="text-xs text-gray-500">{data.count}명 평가</span>
                        {canSeeDetails ? (
                          <Eye className="h-4 w-4 text-gray-400" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                    <ProgressBar
                      value={avg}
                      max={100}
                      size="sm"
                      color={avg >= 85 ? 'emerald' : avg >= 70 ? 'brand' : avg >= 50 ? 'amber' : 'red'}
                    />

                    {/* Detail comments visible only to director+ */}
                    {canSeeDetails && (
                      <div className="mt-3 space-y-2">
                        {/* C2: 항목별 평균 (리뷰어들 합산) */}
                        {(() => {
                          const itemAggr: Partial<Record<PeerReviewCriteriaKey, { sum: number; count: number }>> = {}
                          data.reviews.forEach((r) => {
                            const scores = r.item_scores as Record<string, number> | null | undefined
                            if (!scores) return
                            for (const c of PEER_REVIEW_CRITERIA) {
                              const v = scores[c.key]
                              if (typeof v !== 'number') continue
                              if (!itemAggr[c.key]) itemAggr[c.key] = { sum: 0, count: 0 }
                              itemAggr[c.key]!.sum += v
                              itemAggr[c.key]!.count += 1
                            }
                          })
                          const hasItemData = Object.keys(itemAggr).length > 0
                          if (!hasItemData) return null
                          return (
                            <div className="bg-gray-50 rounded p-2.5">
                              <p className="text-[11px] font-semibold text-gray-600 mb-1.5">항목별 평균 (10점 만점)</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {PEER_REVIEW_CRITERIA.map((c) => {
                                  const a = itemAggr[c.key]
                                  if (!a) return null
                                  const avg = a.sum / a.count
                                  return (
                                    <div key={c.key} className="flex items-center justify-between text-xs">
                                      <span className="text-gray-600">{c.label}</span>
                                      <span className="font-medium text-brand-600">{avg.toFixed(1)}/10</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}

                        {data.reviews.map((r, i) => (
                          <div key={r.id} className="bg-gray-50 rounded p-2 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-gray-500">익명 평가자 #{i + 1}</span>
                              <span className="font-medium text-brand-600">{r.overall_score}점</span>
                            </div>
                            {r.strengths && <p className="text-emerald-600">강점: {r.strengths}</p>}
                            {r.improvements && <p className="text-amber-600">개선: {r.improvements}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {assignments.length === 0 && revieweeSummary.size === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 mb-2">배정된 동료 평가가 없습니다.</p>
            {isAdmin && (
              <Button onClick={() => setAssignDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-1" /> 평가 배정하기
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Review dialog */}
      <Dialog
        open={reviewDialogOpen}
        onClose={() => setReviewDialogOpen(false)}
        title={`동료 평가 - ${getEmployeeName(reviewTarget)}`}
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
            10개 항목을 각 <strong>1~10점</strong>으로 평가합니다 (총 100점). 익명 처리되며 리더는 합산 점수만 확인 가능합니다.
          </div>

          {/* 총점 요약 (고정 상단) */}
          <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b pb-3 z-10">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">총점</span>
              <span className={`text-2xl font-bold ${
                reviewTotalScore >= 85 ? 'text-emerald-600'
                : reviewTotalScore >= 70 ? 'text-brand-600'
                : reviewTotalScore >= 50 ? 'text-amber-600'
                : 'text-red-500'
              }`}>{reviewTotalScore}</span>
              <span className="text-sm text-gray-500">/ 100</span>
              <div className="flex-1">
                <ProgressBar
                  value={reviewTotalScore}
                  max={100}
                  size="sm"
                  color={reviewTotalScore >= 85 ? 'emerald' : reviewTotalScore >= 70 ? 'brand' : reviewTotalScore >= 50 ? 'amber' : 'red'}
                />
              </div>
            </div>
          </div>

          {/* 10개 항목 × 10점 */}
          <div className="space-y-2">
            {PEER_REVIEW_CRITERIA.map((c) => {
              const value = reviewItemScores[c.key] || 0
              return (
                <div key={c.key} className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{c.label}</p>
                      <p className="text-[11px] text-gray-500 truncate">{c.desc}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-base font-bold text-brand-600 w-8 text-right">{value}</span>
                      <span className="text-xs text-gray-400">/ {PEER_REVIEW_MAX_PER_ITEM}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={PEER_REVIEW_MAX_PER_ITEM}
                      value={value}
                      onChange={(e) => setItemScore(c.key, parseInt(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-200 rounded appearance-none cursor-pointer accent-brand-500"
                    />
                    {/* 0~10 점 버튼 */}
                    <div className="flex gap-0.5">
                      {[...Array(PEER_REVIEW_MAX_PER_ITEM + 1)].map((_, n) => (
                        <button
                          key={n}
                          onClick={() => setItemScore(c.key, n)}
                          className={`w-5 h-5 rounded text-[10px] font-semibold transition-colors ${
                            n === value ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <Textarea
            label="강점"
            value={reviewStrengths}
            onChange={(e) => setReviewStrengths(e.target.value)}
            rows={3}
            placeholder="이 동료의 강점을 작성하세요..."
          />

          <Textarea
            label="개선 사항"
            value={reviewImprovements}
            onChange={(e) => setReviewImprovements(e.target.value)}
            rows={3}
            placeholder="개선이 필요한 부분을 작성하세요..."
          />

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>취소</Button>
            <Button variant="outline" onClick={handleSaveReview} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '임시 저장'}
            </Button>
            <Button onClick={handleSubmitReview} disabled={saving}>
              <Send className="h-4 w-4 mr-1" /> 제출
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Assignment dialog (admin) */}
      <Dialog
        open={assignDialogOpen}
        onClose={() => setAssignDialogOpen(false)}
        title="동료 평가 배정"
      >
        <div className="space-y-4">
          <Select
            label="평가자 (리뷰어)"
            value={assignReviewer_}
            onChange={(e) => setAssignReviewer_(e.target.value)}
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
            placeholder="평가자 선택"
          />
          <Select
            label="평가 대상 (리뷰이)"
            value={assignReviewee}
            onChange={(e) => setAssignReviewee(e.target.value)}
            options={employees.filter((e) => e.id !== assignReviewer_).map((e) => ({ value: e.id, label: e.name }))}
            placeholder="대상자 선택"
          />
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>취소</Button>
            <Button onClick={handleAssign} disabled={saving}>
              <UserPlus className="h-4 w-4 mr-1" /> 배정
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
