import { useState, useEffect, useCallback } from 'react'
import { ClipboardCheck, MessageSquare, Send } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { PageSpinner } from '@/components/ui/Spinner'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { getProbationGrade, PROBATION_GRADE_CONFIG } from '@/lib/constants'
import {
  PROBATION_CRITERIA,
  type ProbationEvaluation,
  type ProbationStage,
  type ProbationEvaluatorRole,
  type ContinuationRecommendation,
} from '@/types/employee-lifecycle'

// ─── Constants ──────────────────────────────────────────────────
const STAGE_SHORT: Record<ProbationStage, string> = {
  round1: '1회차 (2주차)',
  round2: '2회차 (6주차)',
  round3: '3회차 (10주차)',
}

const STAGE_ORDER: Record<ProbationStage, number> = {
  round1: 1,
  round2: 2,
  round3: 3,
}

const EVALUATOR_LABELS: Record<ProbationEvaluatorRole, string> = {
  leader: '리더',
  executive: '임원',
  ceo: '대표',
}

const RECOMMENDATION_LABELS: Record<ContinuationRecommendation, string> = {
  continue: '계속 근무',
  warning: '경고/주의',
  terminate: '수습 종료',
}
const RECOMMENDATION_VARIANTS: Record<ContinuationRecommendation, 'success' | 'warning' | 'danger'> = {
  continue: 'success',
  warning: 'warning',
  terminate: 'danger',
}

const MAX_SCORE_PER_ITEM = 20

function getTotalScore(scoreObj: Record<string, number>): number {
  return PROBATION_CRITERIA.reduce((sum, c) => sum + (scoreObj[c.key] || 0), 0)
}

export default function MyEvaluations() {
  const { profile } = useAuth()
  const { toast } = useToast()

  const [evaluations, setEvaluations] = useState<ProbationEvaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [responseTexts, setResponseTexts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)

    const { data, error } = await supabase
      .from('probation_evaluations')
      .select('*')
      .eq('employee_id', profile.id)
      .eq('is_visible_to_employee', true)
      .order('created_at', { ascending: false })

    if (error) {
      toast('평가 데이터를 불러오지 못했습니다.', 'error')
    }

    if (data) {
      const sorted = (data as ProbationEvaluation[]).sort((a, b) => {
        const stageDiff = (STAGE_ORDER[a.stage as ProbationStage] || 0) - (STAGE_ORDER[b.stage as ProbationStage] || 0)
        if (stageDiff !== 0) return stageDiff
        const roleOrder = { mentor: 1, leader: 2, executive: 3, ceo: 4 }
        return (roleOrder[a.evaluator_role as ProbationEvaluatorRole] || 99) - (roleOrder[b.evaluator_role as ProbationEvaluatorRole] || 99)
      })
      setEvaluations(sorted)

      // 기존 답변 초기화
      const existing: Record<string, string> = {}
      for (const ev of sorted) {
        if ((ev as any).employee_response) {
          existing[ev.id] = (ev as any).employee_response
        }
      }
      setResponseTexts(existing)
    }

    setLoading(false)
  }, [profile?.id, toast])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSaveResponse(evalId: string) {
    const text = responseTexts[evalId]?.trim()
    if (!text) { toast('답변을 입력해주세요.', 'error'); return }

    setSavingId(evalId)
    const { error } = await supabase
      .from('probation_evaluations')
      .update({
        employee_response: text,
        responded_at: new Date().toISOString(),
      })
      .eq('id', evalId)

    if (error) {
      toast('답변 저장 실패: ' + error.message, 'error')
    } else {
      toast('답변이 저장되었습니다.', 'success')
      fetchData()
    }
    setSavingId(null)
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">내 수습 평가 결과</h1>

      {evaluations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">공개된 평가 결과가 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {evaluations.map((ev) => {
            const s = ev.scores as Record<string, number>
            const total = getTotalScore(s)
            const rec = ev.continuation_recommendation as ContinuationRecommendation | null
            const hasExistingResponse = !!(ev as any).employee_response

            const roleBadgeMap: Record<string, string> = {
              mentor: 'bg-purple-100 text-purple-800',
              leader: 'bg-blue-100 text-blue-800',
              executive: 'bg-emerald-100 text-emerald-800',
              ceo: 'bg-amber-100 text-amber-800',
            }
            const roleColorMap: Record<string, string> = {
              mentor: 'border-l-purple-500',
              leader: 'border-l-blue-500',
              executive: 'border-l-emerald-500',
              ceo: 'border-l-amber-500',
            }

            return (
              <Card key={ev.id} className={`border-l-4 ${roleColorMap[ev.evaluator_role || ''] || 'border-l-gray-300'}`}>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="primary">{STAGE_SHORT[ev.stage as ProbationStage]}</Badge>
                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${roleBadgeMap[ev.evaluator_role || ''] || 'bg-gray-100 text-gray-700'}`}>
                      {EVALUATOR_LABELS[ev.evaluator_role as ProbationEvaluatorRole] || ev.evaluator_role}
                    </span>
                    <span className="text-base font-bold text-gray-800">{total}/100</span>
                    {rec && (
                      <Badge variant={RECOMMENDATION_VARIANTS[rec]}>
                        {RECOMMENDATION_LABELS[rec]}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 5 criteria progress bars */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {PROBATION_CRITERIA.map((c) => {
                      const val = s[c.key] || 0
                      const grade = getProbationGrade(val)
                      return (
                        <div key={c.key} className="text-center">
                          <ProgressBar
                            value={val}
                            max={MAX_SCORE_PER_ITEM}
                            label={c.label.split(' & ')[0]}
                            size="sm"
                            color={val >= 16 ? 'emerald' : val >= 13 ? 'brand' : val >= 10 ? 'amber' : 'red'}
                          />
                          <span className={`text-xs font-semibold ${PROBATION_GRADE_CONFIG[grade].bg} px-1.5 py-0.5 rounded mt-1 inline-block`}>
                            {grade}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Comments */}
                  <div className="space-y-1.5">
                    {ev.praise && <p className="text-sm text-emerald-600">칭찬: {ev.praise}</p>}
                    {ev.improvement && <p className="text-sm text-amber-600">보완: {ev.improvement}</p>}
                    {ev.comments && <p className="text-sm text-gray-500">총평: {ev.comments}</p>}
                    {ev.ai_assessment && <p className="text-sm text-blue-600">AI 평가: {ev.ai_assessment}</p>}
                  </div>

                  {/* Employee response */}
                  <div className="border-t border-gray-100 pt-4">
                    {hasExistingResponse ? (
                      <div className="p-3 bg-violet-50 rounded-lg">
                        <p className="text-xs font-semibold text-violet-600 mb-1">
                          <MessageSquare className="h-3 w-3 inline mr-1" />
                          내 답변
                        </p>
                        <p className="text-sm text-violet-800">{(ev as any).employee_response}</p>
                        {(ev as any).responded_at && (
                          <p className="text-xs text-violet-400 mt-1">
                            {new Date((ev as any).responded_at).toLocaleDateString('ko-KR')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Textarea
                          label="답변 작성"
                          value={responseTexts[ev.id] || ''}
                          onChange={(e) => setResponseTexts((prev) => ({ ...prev, [ev.id]: e.target.value }))}
                          rows={3}
                          placeholder="평가에 대한 의견이나 느낀 점을 작성해주세요."
                        />
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => handleSaveResponse(ev.id)}
                            disabled={savingId === ev.id}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            {savingId === ev.id ? '저장 중...' : '답변 저장'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
