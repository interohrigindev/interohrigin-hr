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
  round1: '1회차',
  round2: '2회차',
  round3: '3회차',
}

const STAGE_ORDER: Record<ProbationStage, number> = {
  round1: 1,
  round2: 2,
  round3: 3,
}

const EVALUATOR_ROLES: ProbationEvaluatorRole[] = ['mentor', 'leader', 'executive', 'ceo']

const EVALUATOR_LABELS: Record<ProbationEvaluatorRole, string> = {
  mentor: '멘토',
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
}

interface EvalWithEmployee extends ProbationEvaluation {
  employee_name?: string
}

export default function ProbationManage() {
  const { profile } = useAuth()
  const { toast } = useToast()

  const [evaluations, setEvaluations] = useState<EvalWithEmployee[]>([])
  const [employees, setEmployees] = useState<EmployeeBasic[]>([])
  const [loading, setLoading] = useState(true)

  // New evaluation dialog
  const [evalDialogOpen, setEvalDialogOpen] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedStage, setSelectedStage] = useState<ProbationStage>('round1')
  const [selectedRole, setSelectedRole] = useState<ProbationEvaluatorRole>('mentor')
  const [scores, setScores] = useState<Record<string, number>>({})
  const [comments, setComments] = useState('')
  const [praise, setPraise] = useState('')
  const [improvement, setImprovement] = useState('')
  const [mentorSummary, setMentorSummary] = useState('')
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
    const [evalRes, empRes] = await Promise.all([
      supabase.from('probation_evaluations').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name, department_id').eq('is_active', true).order('name'),
    ])

    if (empRes.data) setEmployees(empRes.data)

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
    setSelectedRole('mentor')
    setScores(Object.fromEntries(PROBATION_CRITERIA.map((c) => [c.key, 15])))
    setComments('')
    setPraise('')
    setImprovement('')
    setMentorSummary('')
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
      mentor_summary: selectedRole === 'mentor' ? (mentorSummary || null) : null,
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
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        5개 항목 × 20점 (100점 만점) | 3회차 (2주/6주/10주) | 4인 평가 (멘토/리더/임원/대표)
      </div>

      {/* Filter */}
      <div className="flex gap-4">
        <Select
          value={filterEmployee}
          onChange={(e) => setFilterEmployee(e.target.value)}
          options={[{ value: '', label: '전체 직원' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
          placeholder="직원 선택"
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
                      <CardTitle className="text-base">{name}</CardTitle>
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
                          className={`flex-1 text-center py-2 rounded text-xs font-medium ${
                            hasEvals ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          <div>{STAGE_SHORT[stage]}</div>
                          {hasEvals && <div className="text-[10px] mt-0.5">평균 {avg.toFixed(1)}점</div>}
                        </div>
                      )
                    })}
                  </div>

                  {/* Visual progress chart - avg score per round */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 mb-3">회차별 평균 점수 추이 (100점 만점)</p>
                    <div className="flex items-end gap-2 h-24">
                      {STAGES.filter((s) => stageGrouped.has(s)).map((stage) => {
                        const avg = getAvgScoreForStage(evals, stage)
                        const heightPercent = avg
                        const color = avg >= 85 ? 'bg-emerald-500' : avg >= 70 ? 'bg-brand-500' : avg >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        return (
                          <div key={stage} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-xs font-medium text-gray-700">{avg.toFixed(1)}</span>
                            <div className="w-full bg-gray-200 rounded-t relative" style={{ height: '80px' }}>
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

                  {/* Detail per stage with 4 evaluators */}
                  {STAGES.filter((s) => stageGrouped.has(s)).map((stage) => {
                    const stageEvals = stageGrouped.get(stage) || []
                    const stageAvg = getAvgScoreForStage(evals, stage)

                    return (
                      <div key={stage} className="border rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b">
                          <div className="flex items-center gap-2">
                            <Badge variant="primary">{STAGE_SHORT[stage]}</Badge>
                            <span className="text-sm font-medium text-gray-700">평균 {stageAvg.toFixed(1)}/100</span>
                          </div>
                          <span className="text-xs text-gray-500">{stageEvals.length}명 평가</span>
                        </div>
                        <div className="divide-y">
                          {stageEvals.map((ev) => {
                            const s = ev.scores as Record<string, number>
                            const total = getTotalScore(s)
                            const rec = ev.continuation_recommendation as ContinuationRecommendation | null
                            const RecIcon = rec ? RECOMMENDATION_ICONS[rec] : null
                            return (
                              <div key={ev.id} className="p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="info">
                                      {EVALUATOR_LABELS[ev.evaluator_role as ProbationEvaluatorRole] || ev.evaluator_role}
                                    </Badge>
                                    <span className="text-sm font-bold text-gray-800">{total}/100</span>
                                    {rec && RecIcon && (
                                      <span className={`flex items-center gap-1 text-xs ${RECOMMENDATION_VARIANTS[rec] === 'success' ? 'text-emerald-600' : RECOMMENDATION_VARIANTS[rec] === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>
                                        <RecIcon className="h-3 w-3" />
                                        {RECOMMENDATION_LABELS[rec]}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {/* 5 criteria scores */}
                                <div className="grid grid-cols-5 gap-2 mb-2">
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
                                        <span className={`text-[10px] font-medium ${PROBATION_GRADE_CONFIG[grade].bg} px-1 rounded mt-0.5 inline-block`}>
                                          {grade}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                                {/* Comments */}
                                {ev.praise && <p className="text-xs text-emerald-600 mt-1">칭찬: {ev.praise}</p>}
                                {ev.improvement && <p className="text-xs text-amber-600 mt-1">보완: {ev.improvement}</p>}
                                {ev.mentor_summary && <p className="text-xs text-gray-600 mt-1">멘토 총평: {ev.mentor_summary}</p>}
                                {ev.leader_summary && <p className="text-xs text-gray-600 mt-1">리더 총평: {ev.leader_summary}</p>}
                                {ev.strengths && <p className="text-xs text-blue-600 mt-1">강점: {ev.strengths}</p>}
                                {ev.exec_one_liner && <p className="text-xs text-purple-600 mt-1">한줄 코멘트: {ev.exec_one_liner}</p>}
                                {ev.comments && <p className="text-xs text-gray-500 mt-1">비고: {ev.comments}</p>}
                                {ev.ai_assessment && <p className="text-xs text-blue-600 mt-1">AI: {ev.ai_assessment}</p>}
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

      {/* ─── New Evaluation Dialog ───────────────────────────────── */}
      <Dialog
        open={evalDialogOpen}
        onClose={() => setEvalDialogOpen(false)}
        title="수습 평가 작성"
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="직원 *"
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
              placeholder="직원 선택"
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

          {/* Score inputs (0~20 per criterion) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900">평가 항목 (각 20점 만점, 총 100점)</p>
              <span className="text-sm font-bold text-brand-600">
                총점: {getTotalScore(scores)}/100
              </span>
            </div>
            <div className="space-y-3">
              {PROBATION_CRITERIA.map((c) => {
                const val = scores[c.key] || 0
                const grade = getProbationGrade(val)
                return (
                  <div key={c.key} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-sm font-medium text-gray-800">{c.label}</span>
                        <span className="text-xs text-gray-500 ml-2">{c.desc}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${PROBATION_GRADE_CONFIG[grade].bg}`}>
                          {grade}
                        </span>
                        <span className="text-sm font-bold text-brand-600 w-12 text-right">{val}점</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={MAX_SCORE_PER_ITEM}
                        value={val}
                        onChange={(e) => updateScore(c.key, parseInt(e.target.value))}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500"
                      />
                      <input
                        type="number"
                        min={0}
                        max={MAX_SCORE_PER_ITEM}
                        value={val}
                        onChange={(e) => updateScore(c.key, parseInt(e.target.value) || 0)}
                        className="w-14 text-center text-sm border rounded px-1 py-0.5"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recommendation */}
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

          {/* Role-specific comments */}
          {(selectedRole === 'mentor' || selectedRole === 'leader') && (
            <>
              <Textarea
                label="칭찬할 점"
                value={praise}
                onChange={(e) => setPraise(e.target.value)}
                rows={2}
                placeholder="이 직원의 잘하고 있는 부분..."
              />
              <Textarea
                label="보완 점"
                value={improvement}
                onChange={(e) => setImprovement(e.target.value)}
                rows={2}
                placeholder="개선이 필요한 부분..."
              />
            </>
          )}
          {selectedRole === 'mentor' && (
            <Textarea
              label="멘토 총평"
              value={mentorSummary}
              onChange={(e) => setMentorSummary(e.target.value)}
              rows={2}
              placeholder="멘토로서의 종합 의견..."
            />
          )}
          {selectedRole === 'leader' && (
            <Textarea
              label="리더 총평"
              value={leaderSummary}
              onChange={(e) => setLeaderSummary(e.target.value)}
              rows={2}
              placeholder="리더로서의 종합 의견..."
            />
          )}
          {(selectedRole === 'executive' || selectedRole === 'ceo') && (
            <>
              <Textarea
                label="강점"
                value={strengthsText}
                onChange={(e) => setStrengthsText(e.target.value)}
                rows={2}
                placeholder="이 직원의 강점..."
              />
              <Textarea
                label="보완점"
                value={improvement}
                onChange={(e) => setImprovement(e.target.value)}
                rows={2}
                placeholder="보완이 필요한 부분..."
              />
              <Textarea
                label={`${EVALUATOR_LABELS[selectedRole]} 한줄 코멘트`}
                value={execOneLiner}
                onChange={(e) => setExecOneLiner(e.target.value)}
                rows={1}
                placeholder="한줄 코멘트..."
              />
            </>
          )}

          {/* General comments */}
          <Textarea
            label="비고"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={2}
            placeholder="기타 참고 사항..."
          />

          {/* AI Assessment */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">AI 평가</span>
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

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setEvalDialogOpen(false)}>취소</Button>
            <Button onClick={handleSaveEval}>평가 저장</Button>
          </div>
        </div>
      </Dialog>

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
