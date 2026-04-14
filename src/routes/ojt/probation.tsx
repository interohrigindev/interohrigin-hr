import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Sparkles, Loader2, TrendingUp, AlertTriangle, CheckCircle, XCircle, Users } from 'lucide-react'
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

const STAGE_LABELS: Record<ProbationStage, string> = {
  round1: '1회차 (입사 2주)',
  round2: '2회차 (입사 6주)',
  round3: '3회차 (입사 10주)',
}

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

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: '정규직',
  contract: '계약직',
  intern: '인턴',
  part_time: '파트타임',
  probation: '수습',
}

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

export default function ProbationManage() {
  const { profile } = useAuth()
  const { toast } = useToast()

  const [evaluations, setEvaluations] = useState<EvalWithEmployee[]>([])
  const [employees, setEmployees] = useState<EmployeeBasic[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  // New evaluation dialog
  const [evalDialogOpen, setEvalDialogOpen] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedStage, setSelectedStage] = useState<ProbationStage>('round1')
  const [selectedRole, setSelectedRole] = useState<ProbationEvaluatorRole>('leader')
  const [scores, setScores] = useState<Record<string, number>>({})
  const [comments, setComments] = useState('')
  const [praise, setPraise] = useState('')
  const [improvement, setImprovement] = useState('')
  const [leaderSummary, setLeaderSummary] = useState('')
  const [execOneLiner, setExecOneLiner] = useState('')
  const [strengthsText, setStrengthsText] = useState('')
  const [recommendation, setRecommendation] = useState<ContinuationRecommendation>('continue')
  const [aiAssessment, setAiAssessment] = useState('')
  const [generatingAI, setGeneratingAI] = useState(false)

  // Detail / trend dialog
  const [trendDialogOpen, setTrendDialogOpen] = useState(false)
  const [trendEmployeeId, setTrendEmployeeId] = useState<string | null>(null)
  const [trendEmployeeName, setTrendEmployeeName] = useState('')
  const [trendEvaluations, setTrendEvaluations] = useState<ProbationEvaluation[]>([])
  const [trendAnalyzing, setTrendAnalyzing] = useState(false)
  const [trendAiResult, setTrendAiResult] = useState('')

  // Filter
  const [filterEmployee, setFilterEmployee] = useState('')

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
      // HR 상세 정보 병합
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
    // Sort evals by stage order then evaluator role
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

  // ─── New evaluation ───────────────────────────────────────────
  function openNewEval() {
    setSelectedEmployeeId('')
    setSelectedStage('round1')
    setSelectedRole('leader')
    setScores(Object.fromEntries(PROBATION_CRITERIA.map((c) => [c.key, 15])))
    setComments('')
    setPraise('')
    setImprovement('')
    setLeaderSummary('')
    setExecOneLiner('')
    setStrengthsText('')
    setRecommendation('continue')
    setAiAssessment('')
    setEvalDialogOpen(true)
  }

  function updateScore(key: string, value: number) {
    setScores((prev) => ({ ...prev, [key]: Math.min(MAX_SCORE_PER_ITEM, Math.max(0, value)) }))
  }

  function getTotalScore(scoreObj: Record<string, number>): number {
    return PROBATION_CRITERIA.reduce((sum, c) => sum + (scoreObj[c.key] || 0), 0)
  }

  async function generateAIAssessment() {
    if (!selectedEmployeeId) { toast('직원을 선택하세요.', 'error'); return }
    setGeneratingAI(true)
    try {
      const config = await getAIConfigForFeature('probation_eval')

      if (!config) {
        toast('AI 설정이 필요합니다.', 'error')
        setGeneratingAI(false)
        return
      }

      const empName = employees.find((e) => e.id === selectedEmployeeId)?.name || '미정'
      const scoreStr = PROBATION_CRITERIA.map((c) => `${c.label}: ${scores[c.key] || 0}/${MAX_SCORE_PER_ITEM}`).join(', ')
      const total = getTotalScore(scores)

      const prevEvals = evaluations.filter((e) => e.employee_id === selectedEmployeeId)
      const prevSummary = prevEvals.length > 0
        ? prevEvals.map((e) => {
            const s = e.scores as Record<string, number>
            const t = getTotalScore(s)
            return `${STAGE_SHORT[e.stage as ProbationStage] || e.stage} (${EVALUATOR_LABELS[e.evaluator_role as ProbationEvaluatorRole] || e.evaluator_role}): ${t}/100, 권고=${e.continuation_recommendation || '없음'}`
          }).join('\n')
        : '이전 평가 없음'

      const prompt = `수습 직원 평가 분석을 해주세요.

직원: ${empName}
현재 단계: ${STAGE_LABELS[selectedStage]}
평가자 역할: ${EVALUATOR_LABELS[selectedRole]}
현재 평가 점수 (각 20점 만점, 총 100점): ${scoreStr}
총점: ${total}/100
칭찬할 점: ${praise || '없음'}
보완 점: ${improvement || '없음'}
평가 코멘트: ${comments || '없음'}

이전 평가 기록:
${prevSummary}

다음 내용을 포함하여 3~5문장으로 분석해주세요:
1. 현재 단계에서의 전반적 평가 (100점 기준)
2. 강점과 보완이 필요한 영역
3. 이전 평가 대비 변화 추이 (있는 경우)
4. 수습 통과 가능성 및 권고 사항

마크다운 없이 일반 텍스트로 작성해주세요.`

      const result = await generateAIContent(config, prompt)
      setAiAssessment(result.content.trim())
      toast('AI 평가가 생성되었습니다.', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      toast('AI 평가 생성 실패: ' + message, 'error')
    }
    setGeneratingAI(false)
  }

  async function handleSaveEval() {
    if (!selectedEmployeeId) { toast('직원을 선택하세요.', 'error'); return }

    const { error } = await supabase.from('probation_evaluations').insert({
      employee_id: selectedEmployeeId,
      stage: selectedStage,
      evaluator_id: profile?.id || null,
      evaluator_role: selectedRole,
      scores,
      comments: comments || null,
      praise: praise || null,
      improvement: improvement || null,
      mentor_summary: null,
      leader_summary: selectedRole === 'leader' ? (leaderSummary || null) : null,
      exec_one_liner: (selectedRole === 'executive' || selectedRole === 'ceo') ? (execOneLiner || null) : null,
      strengths: (selectedRole === 'executive' || selectedRole === 'ceo') ? (strengthsText || null) : null,
      ai_assessment: aiAssessment || null,
      continuation_recommendation: recommendation,
    })

    if (error) { toast('평가 저장 실패: ' + error.message, 'error'); return }
    toast('수습 평가가 저장되었습니다.', 'success')
    setEvalDialogOpen(false)
    fetchData()
  }

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

  // ─── Helpers ────────────────────────────────────────────────────
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

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">수습 단계별 평가</h1>
        <Button onClick={openNewEval}><Plus className="h-4 w-4 mr-1" /> 새 평가</Button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-base text-blue-800">
        5개 항목 × 20점 (100점 만점) | 3회차 (2주/6주/10주) | 3인 평가 (리더/임원/대표)
      </div>

      {/* 수습 직원 평가 일정 테이블 */}
      {(() => {
        const probEmps = employees.filter((e) => e.employment_type === 'probation' || (e.position ?? '').includes('수습'))
        if (probEmps.length === 0) return null

        const today = new Date()
        const formatDate = (d: Date | null) => d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '-'

        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                평가 예정 현황
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200 text-gray-600">
                      <th className="text-left py-2.5 px-3 font-semibold">성함</th>
                      <th className="text-left py-2.5 px-3 font-semibold">소속</th>
                      <th className="text-center py-2.5 px-3 font-semibold">구분</th>
                      <th className="text-left py-2.5 px-3 font-semibold">직무</th>
                      <th className="text-center py-2.5 px-3 font-semibold">수습 연봉</th>
                      <th className="text-center py-2.5 px-3 font-semibold">입사일</th>
                      <th className="text-center py-2.5 px-3 font-semibold">1회차 (2주)</th>
                      <th className="text-center py-2.5 px-3 font-semibold">2회차 (6주)</th>
                      <th className="text-center py-2.5 px-3 font-semibold">3회차 (10주)</th>
                      <th className="text-center py-2.5 px-3 font-semibold">수습 종료일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {probEmps.map((emp) => {
                      const hire = emp.hire_date ? new Date(emp.hire_date) : null
                      const endDate = hire ? new Date(hire.getTime() + 90 * 24 * 60 * 60 * 1000) : null
                      const empEvals = evaluations.filter((ev) => ev.employee_id === emp.id)

                      const roundDates = hire ? [
                        new Date(hire.getTime() + 14 * 24 * 60 * 60 * 1000),
                        new Date(hire.getTime() + 42 * 24 * 60 * 60 * 1000),
                        new Date(hire.getTime() + 70 * 24 * 60 * 60 * 1000),
                      ] : [null, null, null]

                      const getRoundCell = (stage: string, roundDate: Date | null) => {
                        const stageEvals = empEvals.filter((ev) => ev.stage === stage)
                        if (stageEvals.length > 0) {
                          const avg = stageEvals.reduce((sum, ev) => sum + getTotalScore(ev.scores as Record<string, number>), 0) / stageEvals.length
                          return <span className="text-sm font-bold text-emerald-600">{avg.toFixed(0)}점 완료</span>
                        }
                        if (!roundDate) return <span className="text-gray-400">-</span>
                        const diff = Math.ceil((roundDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                        if (diff < 0) return <span className="text-red-600 font-bold">D+{Math.abs(diff)} 초과</span>
                        if (diff <= 7) return <span className="text-amber-600 font-semibold">D-{diff}</span>
                        return <span className="text-gray-400">예정</span>
                      }

                      return (
                        <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2.5 px-3 font-semibold text-gray-900">{emp.name}</td>
                          <td className="py-2.5 px-3 text-gray-600">{emp.department_id ? (departments.find(d => d.id === emp.department_id)?.name || '-') : '-'}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${emp.employment_type === 'probation' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                              {EMPLOYMENT_TYPE_LABELS[emp.employment_type || ''] || emp.employment_type || '-'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-gray-600">{emp.job_title || emp.position || '-'}</td>
                          <td className="py-2.5 px-3 text-center text-gray-700">
                            {emp.annual_salary ? `${(emp.annual_salary / 10000).toFixed(0)}만원` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-center text-gray-700">{formatDate(hire)}</td>
                          <td className="py-2.5 px-3 text-center">{getRoundCell('round1', roundDates[0])}</td>
                          <td className="py-2.5 px-3 text-center">{getRoundCell('round2', roundDates[1])}</td>
                          <td className="py-2.5 px-3 text-center">{getRoundCell('round3', roundDates[2])}</td>
                          <td className="py-2.5 px-3 text-center text-gray-700">{formatDate(endDate)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      })()}

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
            <p className="text-gray-400 mb-4">등록된 수습 평가가 없습니다.</p>
            <Button onClick={openNewEval}>첫 평가 작성</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(groupedByEmployee.entries()).map(([empId, { name, evals }]) => {
            const latestEval = evals[evals.length - 1]
            const latestRec = latestEval?.continuation_recommendation as ContinuationRecommendation | null
            const stageGrouped = getEvalsGroupedByStage(evals)

            return (
              <Card key={empId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
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
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openTrendDialog(empId, name)}>
                      <TrendingUp className="h-3 w-3 mr-1" /> 추이 분석
                    </Button>
                  </div>
                </CardHeader>
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

                  {/* Detail per stage with 4 evaluators */}
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

                                {/* 직원 공개 토글 + 답변 */}
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        const newVal = !(ev as any).is_visible_to_employee
                                        await supabase.from('probation_evaluations').update({ is_visible_to_employee: newVal }).eq('id', ev.id)
                                        toast(newVal ? '직원에게 공개됨' : '공개 해제됨')
                                        fetchData()
                                      }}
                                      className={`relative w-9 h-5 rounded-full transition-colors ${(ev as any).is_visible_to_employee ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                    >
                                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${(ev as any).is_visible_to_employee ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                    </button>
                                    <span className="text-sm text-gray-500">{(ev as any).is_visible_to_employee ? '직원 공개' : '비공개'}</span>
                                  </div>
                                </div>
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
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── 인라인 평가 폼 ───────────────────────────────────────── */}
      {evalDialogOpen && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>수습 평가 작성</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setEvalDialogOpen(false)}>닫기</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 직원/회차/역할 선택 */}
            <div className="grid grid-cols-3 gap-3">
              <Select
                label="직원 *"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                options={employees.filter((e) => e.employment_type === 'probation' || (e.position ?? '').includes('수습')).map((e) => ({ value: e.id, label: e.name }))}
                placeholder="수습 직원 선택"
              />
              <Select
                label="평가 회차 *"
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value as ProbationStage)}
                options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
              />
              <Select
                label="평가자 역할 *"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as ProbationEvaluatorRole)}
                options={EVALUATOR_ROLES.map((r) => ({ value: r, label: EVALUATOR_LABELS[r] }))}
              />
            </div>

            {/* 직원 정보 카드 + 회차별 안내 멘트 */}
            {selectedEmployeeId && (() => {
              const emp = employees.find((e) => e.id === selectedEmployeeId)
              if (!emp) return null
              const hireDate = emp.hire_date ? new Date(emp.hire_date) : null
              const endDate = hireDate ? new Date(hireDate.getTime() + 90 * 24 * 60 * 60 * 1000) : null
              const formatDate = (d: Date | null) => d ? `${d.getFullYear().toString().slice(2)}년 ${d.getMonth() + 1}월 ${d.getDate()}일` : '-'

              const STAGE_INTROS: Record<ProbationStage, string> = {
                round1: '본 평가는 1회차(입사 2주 차) 평가입니다.\n실무 성과보다는 조직 적응력, 기본 태도, 업무 파악 노력에 초점을 맞춰 평가해 주시기 바랍니다.',
                round2: '본 평가는 2회차(입사 6주 차) 평가입니다.\n초기 적응 단계를 넘어, 실질적인 업무 지시에 대한 이해도와 실행력, 그리고 직무 수행의 안정성에 초점을 맞춰 평가해 주시기 바랍니다.',
                round3: '본 평가는 3회차(입사 10주 차) 최종 평가입니다.\n수습 기간을 마무리하며, 해당 직무를 독립적으로 수행할 수 있는 역량을 갖추었는지, 그리고 정규직 전환에 적합한지에 초점을 맞춰 종합적으로 평가해 주시기 바랍니다.',
              }

              return (
                <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 space-y-2">
                  <h3 className="text-lg font-bold text-brand-900">수습 평가_{emp.name}({STAGE_SHORT[selectedStage]})</h3>
                  <div className="grid grid-cols-3 gap-2 text-sm text-brand-800">
                    <span>부서 / 직급 : {emp.position || '-'}</span>
                    <span>입사 일자 : {formatDate(hireDate)}</span>
                    <span>수습 종료 일자 : {formatDate(endDate)}</span>
                  </div>
                  <p className="text-sm text-brand-700 whitespace-pre-line mt-2">{STAGE_INTROS[selectedStage]}</p>
                </div>
              )
            })()}

            {/* 평가 가이드 */}
            <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-5">
              <p className="text-base font-bold text-gray-800 mb-3">{'<평가 가이드>'} 각 항목별 점수 (20점 만점 / 총 100점 만점)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-center">
                  <span className="text-lg font-bold text-brand-700">S</span>
                  <p className="text-sm text-gray-700 mt-1">20~18점</p>
                  <p className="text-sm font-medium text-brand-600">기대 상회</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <span className="text-lg font-bold text-blue-700">A</span>
                  <p className="text-sm text-gray-700 mt-1">17~14점</p>
                  <p className="text-sm font-medium text-blue-600">기대 충족</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                  <span className="text-lg font-bold text-emerald-700">B</span>
                  <p className="text-sm text-gray-700 mt-1">13~10점</p>
                  <p className="text-sm font-medium text-emerald-600">보완 필요</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                  <span className="text-lg font-bold text-amber-700">C</span>
                  <p className="text-sm text-gray-700 mt-1">9~6점</p>
                  <p className="text-sm font-medium text-amber-600">기대 미달</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <span className="text-lg font-bold text-red-700">D</span>
                  <p className="text-sm text-gray-700 mt-1">5~0점</p>
                  <p className="text-sm font-medium text-red-600">수행 어려움</p>
                </div>
              </div>
            </div>

            {/* 점수 입력 — 1~20 클릭 선택 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-900">평가 항목</p>
                <span className="text-sm font-bold text-brand-600">총점: {getTotalScore(scores)}/100</span>
              </div>
              <div className="space-y-4">
                {PROBATION_CRITERIA.map((c, idx) => {
                  const val = scores[c.key] || 0
                  const grade = getProbationGrade(val)
                  return (
                    <div key={c.key} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-sm font-semibold text-gray-900">{idx + 1}. {c.label}</span>
                          <p className="text-xs text-gray-500 mt-0.5">{c.desc}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${PROBATION_GRADE_CONFIG[grade].bg}`}>{grade}</span>
                          <span className="text-sm font-bold text-brand-600">{val}점</span>
                        </div>
                      </div>
                      {/* 1~20 클릭 버튼 */}
                      <div className="flex flex-wrap gap-1">
                        {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => {
                          const isSelected = val === n
                          let bg = 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          if (isSelected) {
                            if (n >= 18) bg = 'bg-brand-600 text-white'
                            else if (n >= 14) bg = 'bg-blue-600 text-white'
                            else if (n >= 10) bg = 'bg-emerald-600 text-white'
                            else if (n >= 6) bg = 'bg-amber-600 text-white'
                            else bg = 'bg-red-600 text-white'
                          }
                          return (
                            <button
                              key={n}
                              onClick={() => updateScore(c.key, n)}
                              className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${bg}`}
                            >
                              {n}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 수습 지속 권고 */}
            <Select
              label="수습 지속 권고"
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value as ContinuationRecommendation)}
              options={[
                { value: 'continue', label: '계속 근무 권고' },
                { value: 'warning', label: '경고/주의' },
                { value: 'terminate', label: '수습 종료 권고' },
              ]}
            />

            {/* 총평 — 회차별 안내 통합 */}
            <Textarea
              label={selectedStage === 'round3'
                ? '총평 (최종 면담 직전이므로 가장 구체적인 피드백 요구)'
                : '총평'}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
              placeholder={selectedStage === 'round3'
                ? '칭찬할 점 혹은 보완할 점이 있다면 같이 적어주세요. (최종 면담 직전이므로 가장 구체적인 피드백 요구)'
                : '수습 직원의 총평을 적어주세요 =) 칭찬할 점 혹은 보완할 점이 있다면 포함하여 적어주세요.'}
            />

            {/* AI 평가 (3회차에서만 자동 표시) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">AI 평가 (참고용)</span>
                <Button variant="outline" size="sm" onClick={generateAIAssessment} disabled={generatingAI}>
                  {generatingAI ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 분석 중...</>
                  ) : (
                    <><Sparkles className="h-3 w-3 mr-1" /> AI 평가 생성</>
                  )}
                </Button>
              </div>
              {aiAssessment && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800 whitespace-pre-wrap">{aiAssessment}</p>
                </div>
              )}
            </div>

            {/* 저장 버튼 */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setEvalDialogOpen(false)}>취소</Button>
              <Button onClick={handleSaveEval}>평가 저장</Button>
            </div>
          </CardContent>
        </Card>
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
