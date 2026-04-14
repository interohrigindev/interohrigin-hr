import { useState, useEffect, useCallback, useMemo } from 'react'
import { Sparkles, Loader2, TrendingUp, AlertTriangle, CheckCircle, XCircle, Users, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature } from '@/lib/ai-client'
import { getProbationGrade, PROBATION_GRADE_CONFIG } from '@/lib/constants'
import {
  PROBATION_CRITERIA,
  type ProbationEvaluation,
  type ProbationStage,
  type ProbationEvaluatorRole,
  type ContinuationRecommendation,
} from '@/types/employee-lifecycle'

// ─── Constants ──────────────────────────────────────────────────
const STAGES: ProbationStage[] = ['round1', 'round2', 'round3']

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

const EVALUATOR_ROLES: ProbationEvaluatorRole[] = ['leader', 'executive', 'ceo']

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
const RECOMMENDATION_ICONS: Record<ContinuationRecommendation, typeof CheckCircle> = {
  continue: CheckCircle,
  warning: AlertTriangle,
  terminate: XCircle,
}

const MAX_SCORE_PER_ITEM = 20

interface EmployeeBasic {
  id: string
  name: string
  department_id: string | null
  hire_date: string | null
  employment_type: string | null
  position: string | null
  job_title?: string | null
  annual_salary?: number | null
}

interface EvalWithEmployee extends ProbationEvaluation {
  employee_name?: string
}

// ─── Helpers ────────────────────────────────────────────────────
function getTotalScore(scoreObj: Record<string, number>): number {
  return PROBATION_CRITERIA.reduce((sum, c) => sum + (scoreObj[c.key] || 0), 0)
}

function getAvgScoreForStage(evals: EvalWithEmployee[], stage: ProbationStage): number {
  const stageEvals = evals.filter((e) => e.stage === stage)
  if (stageEvals.length === 0) return 0
  const totals = stageEvals.map((e) => getTotalScore(e.scores as Record<string, number>))
  return totals.reduce((a, b) => a + b, 0) / totals.length
}

function getEvalsGroupedByStage(evals: EvalWithEmployee[]): Map<ProbationStage, EvalWithEmployee[]> {
  const map = new Map<ProbationStage, EvalWithEmployee[]>()
  for (const stage of STAGES) {
    const stageEvals = evals.filter((e) => e.stage === stage)
    if (stageEvals.length > 0) map.set(stage, stageEvals)
  }
  return map
}

export default function ProbationResults() {
  const { profile } = useAuth()
  const { toast } = useToast()

  const [evaluations, setEvaluations] = useState<EvalWithEmployee[]>([])
  const [employees, setEmployees] = useState<EmployeeBasic[]>([])
  const [, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Trend dialog
  const [trendDialogOpen, setTrendDialogOpen] = useState(false)
  const [trendEmployeeId, setTrendEmployeeId] = useState<string | null>(null)
  const [trendEmployeeName, setTrendEmployeeName] = useState('')
  const [trendEvaluations, setTrendEvaluations] = useState<ProbationEvaluation[]>([])
  const [trendAnalyzing, setTrendAnalyzing] = useState(false)
  const [trendAiResult, setTrendAiResult] = useState('')

  // Filter
  const [filterEmployee, setFilterEmployee] = useState('')

  // Expand/collapse
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) => {
    setExpandedEmployees(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [evalRes, empRes, deptRes, hrRes] = await Promise.all([
      supabase.from('probation_evaluations').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name, department_id, hire_date, employment_type, position').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name'),
      supabase.from('employee_hr_details').select('employee_id, job_title, annual_salary'),
    ])

    if (deptRes.data) setDepartments(deptRes.data)

    if (empRes.data) {
      const hrMap = new Map((hrRes.data || []).map((h: any) => [h.employee_id, h]))
      const enrichedEmps = empRes.data.map((e: any) => {
        const hr = hrMap.get(e.id)
        return { ...e, job_title: hr?.job_title || null, annual_salary: hr?.annual_salary || null }
      })
      setEmployees(enrichedEmps)
    }

    if (evalRes.data && empRes.data) {
      const enriched: EvalWithEmployee[] = (evalRes.data as ProbationEvaluation[]).map((ev) => ({
        ...ev,
        employee_name: empRes.data.find((e: EmployeeBasic) => e.id === ev.employee_id)?.name || '알 수 없음',
      }))
      setEvaluations(enriched)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Group evaluations by employee ────────────────────────────
  const groupedByEmployee = useMemo(() => {
    const map = new Map<string, { name: string; evals: EvalWithEmployee[] }>()
    for (const ev of evaluations) {
      if (filterEmployee && ev.employee_id !== filterEmployee) continue
      if (!map.has(ev.employee_id)) {
        map.set(ev.employee_id, { name: ev.employee_name || '알 수 없음', evals: [] })
      }
      map.get(ev.employee_id)!.evals.push(ev)
    }
    for (const entry of map.values()) {
      entry.evals.sort((a, b) => {
        const stageDiff = (STAGE_ORDER[a.stage as ProbationStage] || 0) - (STAGE_ORDER[b.stage as ProbationStage] || 0)
        if (stageDiff !== 0) return stageDiff
        const roleOrder = { mentor: 1, leader: 2, executive: 3, ceo: 4 }
        return (roleOrder[a.evaluator_role as ProbationEvaluatorRole] || 99) - (roleOrder[b.evaluator_role as ProbationEvaluatorRole] || 99)
      })
    }
    return map
  }, [evaluations, filterEmployee])

  // ─── Trend analysis ───────────────────────────────────────────
  async function openTrendDialog(employeeId: string, employeeName: string) {
    setTrendEmployeeId(employeeId)
    setTrendEmployeeName(employeeName)
    setTrendAiResult('')

    const { data } = await supabase
      .from('probation_evaluations')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: true })

    const evals = ((data || []) as ProbationEvaluation[]).sort(
      (a, b) => (STAGE_ORDER[a.stage as ProbationStage] || 0) - (STAGE_ORDER[b.stage as ProbationStage] || 0)
    )
    setTrendEvaluations(evals)
    setTrendDialogOpen(true)
  }

  async function runTrendAnalysis() {
    if (!trendEmployeeId || trendEvaluations.length < 2) {
      toast('추이 분석은 2개 이상의 평가가 필요합니다.', 'error')
      return
    }
    setTrendAnalyzing(true)
    try {
      const config = await getAIConfigForFeature('probation_eval')

      if (!config) { toast('AI 설정이 필요합니다.', 'error'); setTrendAnalyzing(false); return }

      const evalsSummary = trendEvaluations.map((ev) => {
        const s = ev.scores as Record<string, number>
        const scoreStr = PROBATION_CRITERIA.map((c) => `${c.label}=${s[c.key] || 0}/${MAX_SCORE_PER_ITEM}`).join(', ')
        const total = getTotalScore(s)
        return `${STAGE_SHORT[ev.stage as ProbationStage] || ev.stage} (${EVALUATOR_LABELS[ev.evaluator_role as ProbationEvaluatorRole] || ev.evaluator_role}): 총 ${total}/100 | ${scoreStr} | 권고: ${ev.continuation_recommendation || '없음'}`
      }).join('\n')

      const prompt = `수습 직원의 단계별 평가 추이를 종합 분석해주세요.

직원: ${trendEmployeeName}
평가 기록:
${evalsSummary}

다음 항목을 포함하여 분석해주세요:
1. 전체 성장 추이 요약 (100점 기준)
2. 가장 크게 성장한 영역과 정체된 영역
3. 각 단계별 변화 포인트
4. 4인 평가자(멘토/리더/임원/대표) 간 평가 차이 분석
5. 수습 통과 종합 의견 및 권고
6. 향후 성장을 위한 제안

마크다운 없이 일반 텍스트로 작성해주세요. 각 항목은 번호로 구분해주세요.`

      const result = await generateAIContent(config, prompt)
      setTrendAiResult(result.content.trim())
      toast('추이 분석이 완료되었습니다.', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      toast('추이 분석 실패: ' + message, 'error')
    }
    setTrendAnalyzing(false)
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">수습 평가 결과</h1>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-base text-blue-800">
        5개 항목 x 20점 (100점 만점) | 3회차 (2주/6주/10주) | 3인 평가 (리더/임원/대표)
      </div>

      {/* Filter */}
      <div className="flex gap-4">
        <Select
          value={filterEmployee}
          onChange={(e) => setFilterEmployee(e.target.value)}
          options={[{ value: '', label: '전체 직원' }, ...employees.filter((e) => e.employment_type === 'probation' || (e.position ?? '').includes('수습')).map((e) => ({ value: e.id, label: e.name }))]}
          placeholder="수습 직원 선택"
        />
      </div>

      {/* Employee cards with evaluations */}
      {groupedByEmployee.size === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">등록된 수습 평가가 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(groupedByEmployee.entries()).map(([empId, { name, evals }]) => {
            const latestEval = evals[evals.length - 1]
            const latestRec = latestEval?.continuation_recommendation as ContinuationRecommendation | null
            const stageGrouped = getEvalsGroupedByStage(evals)
            const isExpanded = expandedEmployees.has(empId)
            const allVisible = evals.every(ev => (ev as any).is_visible_to_employee)

            return (
              <Card key={empId}>
                <CardHeader className="cursor-pointer" onClick={() => toggleExpand(empId)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle className="text-lg">{name}</CardTitle>
                      {latestRec && (
                        <Badge variant={RECOMMENDATION_VARIANTS[latestRec]}>
                          {RECOMMENDATION_LABELS[latestRec]}
                        </Badge>
                      )}
                      <Badge variant="primary">
                        <Users className="h-3 w-3 mr-1" />
                        {evals.length}건 평가
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {STAGES.filter(s => stageGrouped.has(s)).map(s => `${STAGE_SHORT[s].split(' ')[0]}: ${getAvgScoreForStage(evals, s).toFixed(0)}점`).join(', ')}
                      </span>
                      {/* 직원 공개 토글 */}
                      <div className="flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            const newVal = !allVisible
                            for (const ev of evals) {
                              await supabase.from('probation_evaluations').update({ is_visible_to_employee: newVal }).eq('id', ev.id)
                            }
                            toast(newVal ? '직원에게 공개됨' : '공개 해제됨', 'success')
                            fetchData()
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${allVisible ? 'bg-emerald-500' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${allVisible ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <span className="text-sm text-gray-500">{allVisible ? '직원에게 공개' : '비공개'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={(e: React.MouseEvent) => { e.stopPropagation(); openTrendDialog(empId, name) }}>
                        <TrendingUp className="h-3 w-3 mr-1" /> 추이 분석
                      </Button>
                      {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                <CardContent className="space-y-4">
                  {/* Stage progress */}
                  <div className="flex gap-1">
                    {STAGES.map((stage) => {
                      const hasEvals = stageGrouped.has(stage)
                      const avg = hasEvals ? getAvgScoreForStage(evals, stage) : 0
                      return (
                        <div
                          key={stage}
                          className={`flex-1 text-center py-2.5 rounded text-sm font-semibold ${
                            hasEvals ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          <div>{STAGE_SHORT[stage]}</div>
                          {hasEvals && <div className="text-xs mt-0.5">평균 {avg.toFixed(1)}점</div>}
                        </div>
                      )
                    })}
                  </div>

                  {/* Visual progress chart - avg score per round */}
                  <div className="bg-gray-50 rounded-lg p-5">
                    <p className="text-sm font-semibold text-gray-600 mb-4">회차별 평균 점수 추이 (100점 만점)</p>
                    <div className="flex items-end gap-4" style={{ height: '140px' }}>
                      {STAGES.filter((s) => stageGrouped.has(s)).map((stage) => {
                        const avg = getAvgScoreForStage(evals, stage)
                        const heightPercent = avg
                        const color = avg >= 85 ? 'bg-emerald-500' : avg >= 70 ? 'bg-brand-500' : avg >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        return (
                          <div key={stage} className="flex-1 flex flex-col items-center gap-1.5">
                            <span className="text-sm font-bold text-gray-700">{avg.toFixed(1)}</span>
                            <div className="w-full bg-gray-200 rounded-t relative" style={{ height: '100px' }}>
                              <div
                                className={`absolute bottom-0 left-0 right-0 rounded-t ${color} transition-all duration-500`}
                                style={{ height: `${heightPercent}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-500 font-medium">{STAGE_SHORT[stage]}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Detail per stage with evaluators */}
                  {STAGES.filter((s) => stageGrouped.has(s)).map((stage) => {
                    const stageEvals = stageGrouped.get(stage) || []
                    const stageAvg = getAvgScoreForStage(evals, stage)

                    // 리더는 이사/대표 평가를 볼 수 없음
                    const visibleEvals = profile?.role === 'leader'
                      ? stageEvals.filter((ev) => ev.evaluator_role !== 'executive' && ev.evaluator_role !== 'ceo')
                      : stageEvals
                    if (visibleEvals.length === 0) return null

                    return (
                      <div key={stage} className="border rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b">
                          <div className="flex items-center gap-2">
                            <Badge variant="primary">{STAGE_SHORT[stage]}</Badge>
                            <span className="text-base font-semibold text-gray-700">평균 {stageAvg.toFixed(1)}/100</span>
                          </div>
                          <span className="text-sm text-gray-500">{visibleEvals.length}명 평가</span>
                        </div>
                        <div className="divide-y divide-gray-200">
                          {visibleEvals.map((ev) => {
                            const s = ev.scores as Record<string, number>
                            const total = getTotalScore(s)
                            const rec = ev.continuation_recommendation as ContinuationRecommendation | null
                            const RecIcon = rec ? RECOMMENDATION_ICONS[rec] : null
                            const evaluatorName = employees.find((e) => e.id === ev.evaluator_id)?.name || ''
                            const roleColorMap: Record<string, string> = {
                              mentor: 'border-l-purple-500 bg-purple-50/30',
                              leader: 'border-l-blue-500 bg-blue-50/30',
                              executive: 'border-l-emerald-500 bg-emerald-50/30',
                              ceo: 'border-l-amber-500 bg-amber-50/30',
                            }
                            const roleBadgeMap: Record<string, string> = {
                              mentor: 'bg-purple-100 text-purple-800',
                              leader: 'bg-blue-100 text-blue-800',
                              executive: 'bg-emerald-100 text-emerald-800',
                              ceo: 'bg-amber-100 text-amber-800',
                            }
                            return (
                              <div key={ev.id} className={`p-4 border-l-4 ${roleColorMap[ev.evaluator_role || ''] || 'border-l-gray-300'}`}>
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${roleBadgeMap[ev.evaluator_role || ''] || 'bg-gray-100 text-gray-700'}`}>
                                      {EVALUATOR_LABELS[ev.evaluator_role as ProbationEvaluatorRole] || ev.evaluator_role}
                                    </span>
                                    {evaluatorName && <span className="text-sm text-gray-600">{evaluatorName}</span>}
                                    <span className="text-base font-bold text-gray-800">{total}/100</span>
                                    {rec && RecIcon && (
                                      <span className={`flex items-center gap-1 text-sm font-medium ${RECOMMENDATION_VARIANTS[rec] === 'success' ? 'text-emerald-600' : RECOMMENDATION_VARIANTS[rec] === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>
                                        <RecIcon className="h-4 w-4" />
                                        {RECOMMENDATION_LABELS[rec]}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {/* 5 criteria scores */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-3">
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
                                {ev.praise && <p className="text-sm text-emerald-600 mt-1.5">칭찬: {ev.praise}</p>}
                                {ev.improvement && <p className="text-sm text-amber-600 mt-1.5">보완: {ev.improvement}</p>}
                                {ev.mentor_summary && <p className="text-sm text-gray-600 mt-1.5">멘토 총평: {ev.mentor_summary}</p>}
                                {ev.leader_summary && <p className="text-sm text-gray-600 mt-1.5">리더 총평: {ev.leader_summary}</p>}
                                {ev.strengths && <p className="text-sm text-blue-600 mt-1.5">강점: {ev.strengths}</p>}
                                {ev.exec_one_liner && <p className="text-sm text-purple-600 mt-1.5">한줄 코멘트: {ev.exec_one_liner}</p>}
                                {ev.comments && <p className="text-sm text-gray-500 mt-1.5">총평: {ev.comments}</p>}
                                {ev.ai_assessment && <p className="text-sm text-blue-600 mt-1.5">AI: {ev.ai_assessment}</p>}

                                {/* 직원 답변 표시 */}
                                {(ev as any).employee_response && (
                                  <div className="mt-2.5 p-3 bg-violet-50 rounded-lg">
                                    <p className="text-xs font-semibold text-violet-600 mb-1">직원 답변</p>
                                    <p className="text-sm text-violet-800">{(ev as any).employee_response}</p>
                                    {(ev as any).responded_at && (
                                      <p className="text-xs text-violet-400 mt-1">{new Date((ev as any).responded_at).toLocaleDateString('ko-KR')}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Trend Analysis Dialog ───────────────────────────────── */}
      <Dialog
        open={trendDialogOpen}
        onClose={() => setTrendDialogOpen(false)}
        title={`추이 분석 - ${trendEmployeeName}`}
        className="max-w-3xl max-h-[85vh] overflow-y-auto"
      >
        <div className="space-y-5">
          {/* Summary table: per stage, per evaluator */}
          {trendEvaluations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">회차별 평가자별 점수</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3 text-gray-500">회차</th>
                      <th className="text-center py-2 px-2 text-gray-500">멘토</th>
                      <th className="text-center py-2 px-2 text-gray-500">리더</th>
                      <th className="text-center py-2 px-2 text-gray-500">임원</th>
                      <th className="text-center py-2 px-2 text-gray-500">대표</th>
                      <th className="text-center py-2 px-2 text-gray-500 font-bold">평균</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAGES.map((stage) => {
                      const stageEvals = trendEvaluations.filter((e) => e.stage === stage)
                      if (stageEvals.length === 0) return null
                      const getRoleScore = (role: ProbationEvaluatorRole) => {
                        const ev = stageEvals.find((e) => e.evaluator_role === role)
                        return ev ? getTotalScore(ev.scores as Record<string, number>) : null
                      }
                      const allScores = stageEvals.map((e) => getTotalScore(e.scores as Record<string, number>))
                      const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length

                      return (
                        <tr key={stage} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium text-gray-700">{STAGE_SHORT[stage]}</td>
                          {EVALUATOR_ROLES.map((role) => {
                            const score = getRoleScore(role)
                            if (score === null) return <td key={role} className="text-center py-2 px-2 text-gray-300">-</td>
                            const color = score >= 85 ? 'text-emerald-600' : score >= 70 ? 'text-brand-600' : score >= 50 ? 'text-amber-600' : 'text-red-600'
                            return <td key={role} className={`text-center py-2 px-2 font-medium ${color}`}>{score}</td>
                          })}
                          <td className="text-center py-2 px-2 font-bold text-brand-700">{avg.toFixed(1)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Criteria breakdown across rounds */}
          {trendEvaluations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">항목별 평균 점수 추이</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3 text-gray-500">항목</th>
                      {STAGES.filter((s) => trendEvaluations.some((e) => e.stage === s)).map((stage) => (
                        <th key={stage} className="text-center py-2 px-2 text-gray-500">{STAGE_SHORT[stage]}</th>
                      ))}
                      <th className="text-center py-2 px-2 text-gray-500">변화</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PROBATION_CRITERIA.map((c) => {
                      const stageValues = STAGES
                        .filter((s) => trendEvaluations.some((e) => e.stage === s))
                        .map((stage) => {
                          const stageEvals = trendEvaluations.filter((e) => e.stage === stage)
                          const vals = stageEvals.map((e) => (e.scores as Record<string, number>)[c.key] || 0)
                          return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
                        })
                      const firstVal = stageValues[0] || 0
                      const lastVal = stageValues[stageValues.length - 1] || 0
                      const diff = lastVal - firstVal

                      return (
                        <tr key={c.key} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium text-gray-700">{c.label.split(' & ')[0]}</td>
                          {stageValues.map((val, i) => {
                            const color = val >= 16 ? 'text-emerald-600' : val >= 13 ? 'text-brand-600' : val >= 10 ? 'text-amber-600' : 'text-red-600'
                            return <td key={i} className={`text-center py-2 px-2 font-medium ${color}`}>{val.toFixed(1)}</td>
                          })}
                          <td className={`text-center py-2 px-2 font-medium ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {diff > 0 ? `+${diff.toFixed(1)}` : diff === 0 ? '-' : diff.toFixed(1)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Visual bar chart */}
          {trendEvaluations.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-medium text-gray-500 mb-3">회차별 평균 총점</p>
              <div className="flex items-end gap-3 h-28">
                {STAGES.filter((s) => trendEvaluations.some((e) => e.stage === s)).map((stage) => {
                  const stageEvals = trendEvaluations.filter((e) => e.stage === stage)
                  const totals = stageEvals.map((e) => getTotalScore(e.scores as Record<string, number>))
                  const avg = totals.reduce((a, b) => a + b, 0) / totals.length
                  const heightPercent = avg
                  const color = avg >= 85 ? 'bg-emerald-500' : avg >= 70 ? 'bg-brand-500' : avg >= 50 ? 'bg-amber-500' : 'bg-red-500'
                  return (
                    <div key={stage} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-bold text-gray-700">{avg.toFixed(1)}</span>
                      <div className="w-full bg-gray-200 rounded-t relative" style={{ height: '90px' }}>
                        <div
                          className={`absolute bottom-0 left-0 right-0 rounded-t ${color} transition-all duration-500`}
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500">{STAGE_SHORT[stage]}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* AI trend analysis */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-900">AI 종합 추이 분석</span>
              <Button
                variant="outline"
                size="sm"
                onClick={runTrendAnalysis}
                disabled={trendAnalyzing || trendEvaluations.length < 2}
              >
                {trendAnalyzing ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 분석 중...</>
                ) : (
                  <><Sparkles className="h-3 w-3 mr-1" /> 추이 분석 실행</>
                )}
              </Button>
            </div>
            {trendEvaluations.length < 2 && (
              <p className="text-xs text-gray-400">추이 분석은 2개 이상의 평가가 필요합니다.</p>
            )}
            {trendAiResult && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800 whitespace-pre-wrap">{trendAiResult}</p>
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  )
}
