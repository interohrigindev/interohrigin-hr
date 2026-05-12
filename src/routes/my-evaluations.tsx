import { useState, useEffect, useCallback } from 'react'
import { ClipboardCheck, MessageSquare, Send, History, Lock } from 'lucide-react'
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

// 0512: 평가자 히스토리 — 분기 종료 여부 무관, 내가 평가한 모든 이력
type EvaluatorHistoryItem = {
  target_id: string
  employee_id: string
  employee_name: string
  employee_position: string | null
  scores: { item_id: string; score: number | null }[]
  avg_score: number | null
}

type EvaluatorHistoryPeriod = {
  period_id: string
  year: number
  quarter: number
  is_locked: boolean
  items: EvaluatorHistoryItem[]
}

export default function MyEvaluations() {
  const { profile } = useAuth()
  const { toast } = useToast()

  const [evaluations, setEvaluations] = useState<ProbationEvaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [responseTexts, setResponseTexts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  // 0512: 평가자 히스토리
  const [evaluatorHistory, setEvaluatorHistory] = useState<EvaluatorHistoryPeriod[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  // 펼친 target row
  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(new Set())
  // 항목 ID → label 매핑 (펼쳤을 때 조회)
  const [itemLabels, setItemLabels] = useState<Record<string, string>>({})

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

  // 0512: 내가 평가한 직원 이력 — 분기 종료 무관, evaluator_id = me 인 모든 평가 점수 조회
  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      setHistoryLoading(true)
      try {
        // 1) 내 평가 점수 (확정된 것만)
        const { data: scores } = await supabase
          .from('evaluator_scores')
          .select('target_id, item_id, score')
          .eq('evaluator_id', profile.id)
          .eq('is_draft', false)
        if (cancelled) return
        if (!scores || scores.length === 0) {
          setEvaluatorHistory([])
          return
        }

        // 2) target → employee / period 조인
        const targetIds = [...new Set(scores.map((s: { target_id: string }) => s.target_id))]
        const { data: targets } = await supabase
          .from('evaluation_targets')
          .select('id, employee_id, period_id')
          .in('id', targetIds)
        if (cancelled || !targets) return

        const empIds = [...new Set(targets.map((t: { employee_id: string }) => t.employee_id))]
        const periodIds = [...new Set(targets.map((t: { period_id: string }) => t.period_id))]

        const [{ data: emps }, { data: periods }] = await Promise.all([
          supabase.from('employees').select('id, name, position').in('id', empIds),
          supabase.from('evaluation_periods').select('id, year, quarter, is_locked').in('id', periodIds),
        ])
        if (cancelled) return

        const empMap = new Map((emps || []).map((e: { id: string; name: string; position: string | null }) => [e.id, e]))
        const periodMap = new Map((periods || []).map((p: { id: string; year: number; quarter: number; is_locked: boolean }) => [p.id, p]))
        const targetMap = new Map((targets as { id: string; employee_id: string; period_id: string }[]).map((t) => [t.id, t]))

        // 3) target 별 점수 그룹핑
        const byTarget = new Map<string, { item_id: string; score: number | null }[]>()
        for (const s of scores as { target_id: string; item_id: string; score: number | null }[]) {
          if (!byTarget.has(s.target_id)) byTarget.set(s.target_id, [])
          byTarget.get(s.target_id)!.push({ item_id: s.item_id, score: s.score })
        }

        // 4) period 별 그룹핑
        const periodGroups = new Map<string, EvaluatorHistoryPeriod>()
        for (const [targetId, scoreList] of byTarget) {
          const target = targetMap.get(targetId)
          if (!target) continue
          const emp = empMap.get(target.employee_id)
          const period = periodMap.get(target.period_id)
          if (!emp || !period) continue

          const validScores = scoreList.filter((s) => s.score !== null).map((s) => s.score as number)
          const avg = validScores.length > 0
            ? validScores.reduce((a, b) => a + b, 0) / validScores.length
            : null

          if (!periodGroups.has(period.id)) {
            periodGroups.set(period.id, {
              period_id: period.id,
              year: period.year,
              quarter: period.quarter,
              is_locked: period.is_locked,
              items: [],
            })
          }
          periodGroups.get(period.id)!.items.push({
            target_id: targetId,
            employee_id: emp.id,
            employee_name: emp.name,
            employee_position: emp.position,
            scores: scoreList,
            avg_score: avg,
          })
        }

        // 5) 최신 분기부터 정렬
        const result = Array.from(periodGroups.values())
          .sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter))
        // 분기 내부는 이름순
        result.forEach((p) => {
          p.items.sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'ko'))
        })

        setEvaluatorHistory(result)
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [profile?.id])

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
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">내 평가 결과</h1>

      {/* ── Section 1: 내가 받은 수습 평가 ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-bold text-gray-900">내가 받은 수습 평가</h2>
        </div>

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
      </section>

      {/* ── Section 2: 내가 평가한 직원 이력 (평가자 전용) ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold text-gray-900">내가 평가한 직원 이력</h2>
          <span className="text-xs text-gray-500">— 분기 종료 후에도 조회 가능</span>
        </div>

        {historyLoading ? (
          <Card><CardContent className="py-8 text-center text-sm text-gray-400">불러오는 중...</CardContent></Card>
        ) : evaluatorHistory.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <History className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">평가한 이력이 없습니다.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {evaluatorHistory.map((period) => (
              <Card key={period.period_id}>
                <CardHeader>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-900">
                      {period.year}년 {period.quarter}분기
                    </span>
                    {period.is_locked && (
                      <Badge variant="default" className="text-[10px]">
                        <Lock className="h-3 w-3 mr-0.5 inline" /> 분기 종료
                      </Badge>
                    )}
                    <span className="text-xs text-gray-500">· {period.items.length}명 평가</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-100">
                    {period.items.map((it) => {
                      const isExpanded = expandedTargets.has(it.target_id)
                      const toggleExpand = async () => {
                        const next = new Set(expandedTargets)
                        if (next.has(it.target_id)) {
                          next.delete(it.target_id)
                        } else {
                          next.add(it.target_id)
                          // 미로드 item label 가져오기
                          const missingIds = it.scores
                            .map((s) => s.item_id)
                            .filter((id) => !(id in itemLabels))
                          if (missingIds.length > 0) {
                            const { data: items } = await supabase
                              .from('evaluation_items')
                              .select('id, item_name')
                              .in('id', missingIds)
                            if (items) {
                              setItemLabels((prev) => ({
                                ...prev,
                                ...Object.fromEntries(items.map((i: { id: string; item_name: string }) => [i.id, i.item_name])),
                              }))
                            }
                          }
                        }
                        setExpandedTargets(next)
                      }
                      return (
                        <div key={it.target_id}>
                          <button
                            onClick={toggleExpand}
                            className="w-full px-5 py-3 hover:bg-blue-50/40 transition-colors text-left flex items-center gap-4"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-900">{it.employee_name}</span>
                                {it.employee_position && (
                                  <span className="text-xs text-gray-500">{it.employee_position}</span>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                내가 입력한 항목: {it.scores.length}개
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {it.avg_score !== null ? (
                                <div className="text-right">
                                  <p className="text-xs text-gray-500">내 평균</p>
                                  <p className="text-base font-bold text-blue-700">
                                    {it.avg_score.toFixed(1)}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">점수 없음</span>
                              )}
                              <span className="text-xs text-blue-500 font-medium">
                                {isExpanded ? '접기 ▲' : '펼치기 ▼'}
                              </span>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="px-5 pb-4 bg-blue-50/30">
                              <div className="bg-white rounded-lg border border-blue-100 p-3 space-y-1.5">
                                <p className="text-xs font-medium text-gray-500 mb-2">내가 입력한 항목별 점수</p>
                                {it.scores.length === 0 ? (
                                  <p className="text-xs text-gray-400">기록 없음</p>
                                ) : (
                                  it.scores.map((s, i) => (
                                    <div key={i} className="flex items-center justify-between text-sm">
                                      <span className="text-gray-700 break-keep">
                                        {itemLabels[s.item_id] || s.item_id.slice(0, 8) + '...'}
                                      </span>
                                      <span className="font-semibold text-gray-900">
                                        {s.score !== null ? s.score : '-'}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
