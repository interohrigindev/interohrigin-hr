import { useState, useEffect, useCallback, useMemo } from 'react'
import { Sparkles, Loader2, TrendingUp, AlertTriangle, CheckCircle, XCircle, Users, ChevronDown, ChevronUp, Pencil } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
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

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editEval, setEditEval] = useState<EvalWithEmployee | null>(null)
  const [editScores, setEditScores] = useState<Record<string, number>>({})
  const [editComments, setEditComments] = useState('')
  const [editPraise, setEditPraise] = useState('')
  const [editImprovement, setEditImprovement] = useState('')
  const [editRecommendation, setEditRecommendation] = useState<ContinuationRecommendation>('continue')
  const [editLeaderSummary, setEditLeaderSummary] = useState('')
  const [editExecOneLiner, setEditExecOneLiner] = useState('')
  const [editStrengths, setEditStrengths] = useState('')
  const [editAiAssessment, setEditAiAssessment] = useState('')
  const [editGeneratingAI, setEditGeneratingAI] = useState(false)
  const [polishingField, setPolishingField] = useState<string | null>(null)

  async function polishText(field: 'comments' | 'praise' | 'improvement' | 'leader_summary' | 'exec_one_liner' | 'strengths') {
    const current = field === 'comments' ? editComments
      : field === 'praise' ? editPraise
      : field === 'improvement' ? editImprovement
      : field === 'leader_summary' ? editLeaderSummary
      : field === 'exec_one_liner' ? editExecOneLiner
      : editStrengths
    if (!current.trim()) { toast('먼저 내용을 입력해주세요.', 'error'); return }
    setPolishingField(field)
    try {
      const config = await getAIConfigForFeature('probation_eval')
      if (!config) { toast('AI 설정이 필요합니다.', 'error'); setPolishingField(null); return }
      const FIELD_LABEL: Record<string, string> = {
        comments: '총평', praise: '칭찬할 점', improvement: '보완할 점',
        leader_summary: '리더 총평', exec_one_liner: '임원 한줄 코멘트', strengths: '강점',
      }
      const prompt = `다음은 수습직원 평가의 "${FIELD_LABEL[field]}" 항목 초안입니다. 의미는 유지하면서 가독성 좋게 자연스러운 한국어 문장으로 다듬어 주세요. 새로운 내용을 만들어내지 말고, 주어진 내용만 매끄럽게 정리해주세요. 마크다운 없이 일반 텍스트로, 원문과 비슷한 분량(1~3문장)으로 작성해주세요.\n\n[초안]\n${current}`
      const result = await generateAIContent(config, prompt)
      const polished = result.content.trim()
      if (field === 'comments') setEditComments(polished)
      else if (field === 'praise') setEditPraise(polished)
      else if (field === 'improvement') setEditImprovement(polished)
      else if (field === 'leader_summary') setEditLeaderSummary(polished)
      else if (field === 'exec_one_liner') setEditExecOneLiner(polished)
      else setEditStrengths(polished)
      toast('AI가 문장을 다듬었습니다.', 'success')
    } catch (err: unknown) {
      toast('다듬기 실패: ' + (err instanceof Error ? err.message : '오류'), 'error')
    }
    setPolishingField(null)
  }

  function openEditDialog(ev: EvalWithEmployee) {
    setEditEval(ev)
    const s = ev.scores as Record<string, number>
    setEditScores({ ...s })
    setEditComments(ev.comments || '')
    setEditPraise(ev.praise || '')
    setEditImprovement(ev.improvement || '')
    setEditRecommendation((ev.continuation_recommendation as ContinuationRecommendation) || 'continue')
    setEditLeaderSummary(ev.leader_summary || '')
    setEditExecOneLiner(ev.exec_one_liner || '')
    setEditStrengths(ev.strengths || '')
    setEditAiAssessment(ev.ai_assessment || '')
    setEditDialogOpen(true)
  }

  async function generateEditAI() {
    if (!editEval) return
    setEditGeneratingAI(true)
    try {
      const config = await getAIConfigForFeature('probation_eval')
      if (!config) { toast('AI 설정이 필요합니다.', 'error'); setEditGeneratingAI(false); return }

      const empName = editEval.employee_name || '미정'
      const scoreStr = PROBATION_CRITERIA.map((c) => `${c.label}: ${editScores[c.key] || 0}/${MAX_SCORE_PER_ITEM}`).join(', ')
      const total = getTotalScore(editScores)

      // 본인의 이전 회차 평가만 비교
      const prevEvals = evaluations.filter(
        (e) => e.employee_id === editEval.employee_id
          && e.evaluator_id === editEval.evaluator_id
          && e.evaluator_role === editEval.evaluator_role
          && e.id !== editEval.id
      )
      const prevSummary = prevEvals.length > 0
        ? prevEvals.map((e) => {
            const s = e.scores as Record<string, number>
            const t = getTotalScore(s)
            return `${STAGE_SHORT[e.stage as ProbationStage] || e.stage}: ${t}/100, 권고=${e.continuation_recommendation || '없음'}`
          }).join('\n')
        : '이전 평가 없음'

      const STAGE_LABELS: Record<string, string> = { round1: '1회차 (입사 2주)', round2: '2회차 (입사 6주)', round3: '3회차 (입사 10주)' }

      const prompt = `수습 직원 평가 분석을 해주세요.

직원: ${empName}
현재 단계: ${STAGE_LABELS[editEval.stage] || editEval.stage}
평가자 역할: ${EVALUATOR_LABELS[editEval.evaluator_role as ProbationEvaluatorRole] || editEval.evaluator_role}
현재 평가 점수 (각 20점 만점, 총 100점): ${scoreStr}
총점: ${total}/100
칭찬할 점: ${editPraise || '없음'}
보완 점: ${editImprovement || '없음'}
평가 코멘트: ${editComments || '없음'}

이전 평가 기록 (동일 평가자):
${prevSummary}

다음 내용을 포함하여 3~5문장으로 분석해주세요:
1. 현재 단계에서의 전반적 평가 (100점 기준)
2. 강점과 보완이 필요한 영역
3. 이전 평가 대비 변화 추이 (있는 경우)
4. 수습 통과 가능성 및 권고 사항

마크다운 없이 일반 텍스트로 작성해주세요.`

      const result = await generateAIContent(config, prompt)
      setEditAiAssessment(result.content.trim())
      toast('AI 평가가 재생성되었습니다.', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      toast('AI 평가 생성 실패: ' + message, 'error')
    }
    setEditGeneratingAI(false)
  }

  async function handleSaveEdit() {
    if (!editEval) return
    const { error } = await supabase.from('probation_evaluations').update({
      evaluator_role: editEval.evaluator_role,
      scores: editScores,
      comments: editComments || null,
      praise: editPraise || null,
      improvement: editImprovement || null,
      leader_summary: editEval.evaluator_role === 'leader' ? (editLeaderSummary || null) : editEval.leader_summary,
      exec_one_liner: (editEval.evaluator_role === 'executive' || editEval.evaluator_role === 'ceo') ? (editExecOneLiner || null) : editEval.exec_one_liner,
      strengths: (editEval.evaluator_role === 'executive' || editEval.evaluator_role === 'ceo') ? (editStrengths || null) : editEval.strengths,
      continuation_recommendation: editRecommendation,
      ai_assessment: editAiAssessment || null,
    }).eq('id', editEval.id)

    if (error) { toast('수정 실패: ' + error.message, 'error'); return }
    toast('평가가 수정되었습니다.', 'success')
    setEditDialogOpen(false)
    fetchData()
  }

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
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3 flex-wrap min-w-0">
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
                    <div className="flex items-center gap-2 shrink-0">
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
                                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                  <div className="flex items-center gap-3 flex-wrap">
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
                                  {/* 수정 버튼: 본인 평가이거나 수습 평가자 역할(리더/이사/임원/대표/관리자) */}
                                  {(
                                    ev.evaluator_id === profile?.id ||
                                    ['admin', 'ceo', 'division_head', 'director', 'leader'].includes(profile?.role || '')
                                  ) && (
                                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => openEditDialog(ev)}>
                                      <Pencil className="h-3 w-3 mr-1" /> 수정
                                    </Button>
                                  )}
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

      {/* ─── Edit Evaluation Dialog ─────────────────────────────── */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title={`평가 수정 — ${editEval?.employee_name || ''}`}
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {editEval && (
          <div className="space-y-5">
            {/* 메타 정보 */}
            <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
              <Badge variant="primary">{STAGE_SHORT[editEval.stage as ProbationStage] || editEval.stage}</Badge>
              <span>총점: <strong className="text-brand-600">{PROBATION_CRITERIA.reduce((sum, c) => sum + (editScores[c.key] || 0), 0)}/100</strong></span>
            </div>

            {/* 평가자 역할 수정 (잘못 체크한 경우 변경 가능) */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <label className="block text-xs font-semibold text-amber-800 mb-1.5">
                ⚠️ 평가자 역할 (잘못 선택했다면 변경)
              </label>
              <select
                value={editEval.evaluator_role || ''}
                onChange={(e) => setEditEval({ ...editEval, evaluator_role: e.target.value as ProbationEvaluatorRole })}
                className="w-full px-3 py-2 text-sm border border-amber-300 rounded-md bg-white focus:outline-none focus:border-amber-500"
              >
                {EVALUATOR_ROLES.map(role => (
                  <option key={role} value={role}>
                    {EVALUATOR_LABELS[role]} ({role === 'leader' ? '팀장/리더' : role === 'executive' ? '이사/임원' : '대표'})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-amber-600 mt-1">
                예: 김형석 이사가 실수로 "리더"로 평가한 경우 "임원"으로 변경하세요.
              </p>
            </div>

            {/* 점수 수정 */}
            <div className="space-y-3">
              {PROBATION_CRITERIA.map((c, idx) => {
                const val = editScores[c.key] || 0
                const grade = getProbationGrade(val)
                return (
                  <div key={c.key} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-semibold text-gray-900">{idx + 1}. {c.label}</span>
                        <p className="text-xs text-gray-500">{c.desc}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${PROBATION_GRADE_CONFIG[grade].bg}`}>{grade}</span>
                        <span className="text-sm font-bold text-brand-600">{val}점</span>
                      </div>
                    </div>
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
                            onClick={() => setEditScores(prev => ({ ...prev, [c.key]: n }))}
                            className={`w-7 h-7 rounded text-xs font-medium transition-all ${bg}`}
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

            {/* 수습 지속 권고 */}
            <Select
              label="수습 지속 권고"
              value={editRecommendation}
              onChange={(e) => setEditRecommendation(e.target.value as ContinuationRecommendation)}
              options={[
                { value: 'continue', label: '계속 근무 권고' },
                { value: 'warning', label: '경고/주의' },
                { value: 'terminate', label: '수습 종료 권고' },
              ]}
            />

            {/* 코멘트 수정 */}
            <div className="relative">
              <Textarea
                label="총평"
                value={editComments}
                onChange={(e) => setEditComments(e.target.value)}
                rows={3}
              />
              <Button type="button" variant="outline" size="sm" className="absolute top-0 right-0 h-6 px-2 text-[11px]" onClick={() => polishText('comments')} disabled={polishingField === 'comments'}>
                {polishingField === 'comments' ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-1" />AI 다듬기</>}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <Textarea label="칭찬할 점" value={editPraise} onChange={(e) => setEditPraise(e.target.value)} rows={2} />
                <Button type="button" variant="outline" size="sm" className="absolute top-0 right-0 h-6 px-2 text-[11px]" onClick={() => polishText('praise')} disabled={polishingField === 'praise'}>
                  {polishingField === 'praise' ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-1" />다듬기</>}
                </Button>
              </div>
              <div className="relative">
                <Textarea label="보완할 점" value={editImprovement} onChange={(e) => setEditImprovement(e.target.value)} rows={2} />
                <Button type="button" variant="outline" size="sm" className="absolute top-0 right-0 h-6 px-2 text-[11px]" onClick={() => polishText('improvement')} disabled={polishingField === 'improvement'}>
                  {polishingField === 'improvement' ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-1" />다듬기</>}
                </Button>
              </div>
            </div>

            {/* 역할별 추가 필드 */}
            {editEval.evaluator_role === 'leader' && (
              <div className="relative">
                <Textarea label="리더 총평" value={editLeaderSummary} onChange={(e) => setEditLeaderSummary(e.target.value)} rows={2} />
                <Button type="button" variant="outline" size="sm" className="absolute top-0 right-0 h-6 px-2 text-[11px]" onClick={() => polishText('leader_summary')} disabled={polishingField === 'leader_summary'}>
                  {polishingField === 'leader_summary' ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-1" />다듬기</>}
                </Button>
              </div>
            )}
            {(editEval.evaluator_role === 'executive' || editEval.evaluator_role === 'ceo') && (
              <>
                <div className="relative">
                  <Textarea label="한줄 코멘트" value={editExecOneLiner} onChange={(e) => setEditExecOneLiner(e.target.value)} rows={2} />
                  <Button type="button" variant="outline" size="sm" className="absolute top-0 right-0 h-6 px-2 text-[11px]" onClick={() => polishText('exec_one_liner')} disabled={polishingField === 'exec_one_liner'}>
                    {polishingField === 'exec_one_liner' ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-1" />다듬기</>}
                  </Button>
                </div>
                <div className="relative">
                  <Textarea label="강점" value={editStrengths} onChange={(e) => setEditStrengths(e.target.value)} rows={2} />
                  <Button type="button" variant="outline" size="sm" className="absolute top-0 right-0 h-6 px-2 text-[11px]" onClick={() => polishText('strengths')} disabled={polishingField === 'strengths'}>
                    {polishingField === 'strengths' ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-1" />다듬기</>}
                  </Button>
                </div>
              </>
            )}

            {/* AI 재평가 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">AI 평가 (참고용)</span>
                <Button variant="outline" size="sm" onClick={generateEditAI} disabled={editGeneratingAI}>
                  {editGeneratingAI ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 분석 중...</>
                  ) : (
                    <><Sparkles className="h-3 w-3 mr-1" /> AI 재평가</>
                  )}
                </Button>
              </div>
              {editAiAssessment && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800 whitespace-pre-wrap">{editAiAssessment}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>취소</Button>
              <Button onClick={handleSaveEdit}>
                <Pencil className="h-4 w-4 mr-1" /> 수정 저장
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
