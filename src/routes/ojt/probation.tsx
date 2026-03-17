import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Sparkles, Loader2, TrendingUp, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
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
import { generateAIContent, type AIConfig } from '@/lib/ai-client'
import type { ProbationEvaluation, ProbationStage, ContinuationRecommendation } from '@/types/employee-lifecycle'

// ─── Constants ──────────────────────────────────────────────────
const STAGES: ProbationStage[] = ['week1', 'week2', 'week3', 'month1', 'month2', 'month3']

const STAGE_LABELS: Record<ProbationStage, string> = {
  week1: '1주차',
  week2: '2주차',
  week3: '3주차',
  month1: '1개월',
  month2: '2개월',
  month3: '3개월',
}

const STAGE_ORDER: Record<ProbationStage, number> = {
  week1: 1,
  week2: 2,
  week3: 3,
  month1: 4,
  month2: 5,
  month3: 6,
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

// Evaluation criteria
const SCORE_CRITERIA = [
  { key: 'work_quality', label: '업무 품질' },
  { key: 'work_speed', label: '업무 속도' },
  { key: 'communication', label: '의사소통' },
  { key: 'teamwork', label: '팀워크' },
  { key: 'initiative', label: '주도성' },
  { key: 'learning', label: '학습 능력' },
  { key: 'attendance', label: '출근/근태' },
  { key: 'attitude', label: '근무 태도' },
]

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
  const [selectedStage, setSelectedStage] = useState<ProbationStage>('week1')
  const [scores, setScores] = useState<Record<string, number>>({})
  const [comments, setComments] = useState('')
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
    // Sort evals by stage order
    for (const entry of map.values()) {
      entry.evals.sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage])
    }
    return map
  }, [evaluations, filterEmployee])

  // ─── New evaluation ───────────────────────────────────────────
  function openNewEval() {
    setSelectedEmployeeId('')
    setSelectedStage('week1')
    setScores(Object.fromEntries(SCORE_CRITERIA.map((c) => [c.key, 3])))
    setComments('')
    setRecommendation('continue')
    setAiAssessment('')
    setEvalDialogOpen(true)
  }

  function updateScore(key: string, value: number) {
    setScores((prev) => ({ ...prev, [key]: value }))
  }

  async function generateAIAssessment() {
    if (!selectedEmployeeId) { toast('직원을 선택하세요.', 'error'); return }
    setGeneratingAI(true)
    try {
      const { data: aiSettings } = await supabase
        .from('ai_settings').select('*').eq('is_active', true).limit(1).single()

      if (!aiSettings) {
        toast('AI 설정이 필요합니다.', 'error')
        setGeneratingAI(false)
        return
      }

      const config: AIConfig = {
        provider: aiSettings.provider,
        apiKey: aiSettings.api_key,
        model: aiSettings.model,
      }

      const empName = employees.find((e) => e.id === selectedEmployeeId)?.name || '미정'
      const scoreStr = SCORE_CRITERIA.map((c) => `${c.label}: ${scores[c.key] || 0}/5`).join(', ')

      // Get previous evaluations for this employee
      const prevEvals = evaluations.filter((e) => e.employee_id === selectedEmployeeId)
      const prevSummary = prevEvals.length > 0
        ? prevEvals.map((e) => {
            const s = e.scores as Record<string, number>
            const avg = SCORE_CRITERIA.reduce((sum, c) => sum + (s[c.key] || 0), 0) / SCORE_CRITERIA.length
            return `${STAGE_LABELS[e.stage]}: 평균 ${avg.toFixed(1)}/5, 권고=${e.continuation_recommendation || '없음'}`
          }).join('\n')
        : '이전 평가 없음'

      const prompt = `수습 직원 평가 분석을 해주세요.

직원: ${empName}
현재 단계: ${STAGE_LABELS[selectedStage]}
현재 평가 점수: ${scoreStr}
평가 코멘트: ${comments || '없음'}

이전 평가 기록:
${prevSummary}

다음 내용을 포함하여 3~5문장으로 분석해주세요:
1. 현재 단계에서의 전반적 평가
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
      evaluator_role: profile?.role || null,
      scores,
      comments: comments || null,
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
      (a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]
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
      const { data: aiSettings } = await supabase
        .from('ai_settings').select('*').eq('is_active', true).limit(1).single()

      if (!aiSettings) { toast('AI 설정이 필요합니다.', 'error'); setTrendAnalyzing(false); return }

      const config: AIConfig = {
        provider: aiSettings.provider,
        apiKey: aiSettings.api_key,
        model: aiSettings.model,
      }

      const evalsSummary = trendEvaluations.map((ev) => {
        const s = ev.scores as Record<string, number>
        const scoreStr = SCORE_CRITERIA.map((c) => `${c.label}=${s[c.key] || 0}`).join(', ')
        return `${STAGE_LABELS[ev.stage]}: ${scoreStr} | 권고: ${ev.continuation_recommendation || '없음'} | 코멘트: ${ev.comments || '없음'}`
      }).join('\n')

      const prompt = `수습 직원의 단계별 평가 추이를 종합 분석해주세요.

직원: ${trendEmployeeName}
평가 기록:
${evalsSummary}

다음 항목을 포함하여 분석해주세요:
1. 전체 성장 추이 요약
2. 가장 크게 성장한 영역과 정체된 영역
3. 각 단계별 변화 포인트
4. 수습 통과 종합 의견 및 권고
5. 향후 성장을 위한 제안

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

  // ─── Chart helper ─────────────────────────────────────────────
  function getAvgScore(ev: ProbationEvaluation): number {
    const s = ev.scores as Record<string, number>
    const vals = SCORE_CRITERIA.map((c) => s[c.key] || 0)
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">수습 단계별 평가</h1>
        <Button onClick={openNewEval}><Plus className="h-4 w-4 mr-1" /> 새 평가</Button>
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
            const completedStages = evals.map((e) => e.stage)

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
                      const completed = completedStages.includes(stage)
                      return (
                        <div
                          key={stage}
                          className={`flex-1 text-center py-2 rounded text-xs font-medium ${
                            completed ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {STAGE_LABELS[stage]}
                        </div>
                      )
                    })}
                  </div>

                  {/* Visual progress chart */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 mb-3">평균 점수 추이</p>
                    <div className="flex items-end gap-2 h-24">
                      {evals.map((ev) => {
                        const avg = getAvgScore(ev)
                        const heightPercent = (avg / 5) * 100
                        const color = avg >= 4 ? 'bg-emerald-500' : avg >= 3 ? 'bg-brand-500' : avg >= 2 ? 'bg-amber-500' : 'bg-red-500'
                        return (
                          <div key={ev.id} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-xs font-medium text-gray-700">{avg.toFixed(1)}</span>
                            <div className="w-full bg-gray-200 rounded-t relative" style={{ height: '80px' }}>
                              <div
                                className={`absolute bottom-0 left-0 right-0 rounded-t ${color} transition-all duration-500`}
                                style={{ height: `${heightPercent}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-500">{STAGE_LABELS[ev.stage]}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Score detail for each stage */}
                  <div className="space-y-2">
                    {evals.map((ev) => {
                      const s = ev.scores as Record<string, number>
                      const avg = getAvgScore(ev)
                      const rec = ev.continuation_recommendation as ContinuationRecommendation | null
                      const RecIcon = rec ? RECOMMENDATION_ICONS[rec] : null
                      return (
                        <div key={ev.id} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="primary">{STAGE_LABELS[ev.stage]}</Badge>
                              <span className="text-sm font-medium text-gray-700">평균 {avg.toFixed(1)}/5</span>
                              {rec && RecIcon && (
                                <span className={`flex items-center gap-1 text-xs ${RECOMMENDATION_VARIANTS[rec] === 'success' ? 'text-emerald-600' : RECOMMENDATION_VARIANTS[rec] === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>
                                  <RecIcon className="h-3 w-3" />
                                  {RECOMMENDATION_LABELS[rec]}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {SCORE_CRITERIA.map((c) => (
                              <div key={c.key}>
                                <ProgressBar
                                  value={s[c.key] || 0}
                                  max={5}
                                  label={c.label}
                                  size="sm"
                                  color={(s[c.key] || 0) >= 4 ? 'emerald' : (s[c.key] || 0) >= 3 ? 'brand' : (s[c.key] || 0) >= 2 ? 'amber' : 'red'}
                                />
                              </div>
                            ))}
                          </div>
                          {ev.comments && <p className="text-xs text-gray-500 mt-2">코멘트: {ev.comments}</p>}
                          {ev.ai_assessment && <p className="text-xs text-blue-600 mt-1">AI 평가: {ev.ai_assessment}</p>}
                        </div>
                      )
                    })}
                  </div>
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
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="직원 *"
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
              placeholder="직원 선택"
            />
            <Select
              label="평가 단계 *"
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value as ProbationStage)}
              options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
            />
          </div>

          {/* Score sliders */}
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-3">평가 항목 (1~5점)</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {SCORE_CRITERIA.map((c) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{c.label}</span>
                    <span className="text-sm font-medium text-brand-600">{scores[c.key] || 0}점</span>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        onClick={() => updateScore(c.key, v)}
                        className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                          (scores[c.key] || 0) >= v
                            ? v >= 4 ? 'bg-emerald-500 text-white' : v >= 3 ? 'bg-brand-500 text-white' : v >= 2 ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
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

          {/* Comments */}
          <Textarea
            label="평가 코멘트"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            placeholder="이 단계에서의 관찰 사항, 피드백..."
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
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        <div className="space-y-5">
          {/* Chart: score by criteria across stages */}
          {trendEvaluations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">항목별 점수 추이</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3 text-gray-500">항목</th>
                      {trendEvaluations.map((ev) => (
                        <th key={ev.id} className="text-center py-2 px-2 text-gray-500">
                          {STAGE_LABELS[ev.stage]}
                        </th>
                      ))}
                      <th className="text-center py-2 px-2 text-gray-500">변화</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCORE_CRITERIA.map((c) => {
                      const firstScore = (trendEvaluations[0].scores as Record<string, number>)[c.key] || 0
                      const lastScore = (trendEvaluations[trendEvaluations.length - 1].scores as Record<string, number>)[c.key] || 0
                      const diff = lastScore - firstScore
                      return (
                        <tr key={c.key} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium text-gray-700">{c.label}</td>
                          {trendEvaluations.map((ev) => {
                            const val = (ev.scores as Record<string, number>)[c.key] || 0
                            const color = val >= 4 ? 'text-emerald-600' : val >= 3 ? 'text-brand-600' : val >= 2 ? 'text-amber-600' : 'text-red-600'
                            return (
                              <td key={ev.id} className={`text-center py-2 px-2 font-medium ${color}`}>
                                {val}
                              </td>
                            )
                          })}
                          <td className={`text-center py-2 px-2 font-medium ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {diff > 0 ? `+${diff}` : diff === 0 ? '-' : diff}
                          </td>
                        </tr>
                      )
                    })}
                    {/* Average row */}
                    <tr className="border-t-2 font-semibold">
                      <td className="py-2 pr-3 text-gray-900">평균</td>
                      {trendEvaluations.map((ev) => {
                        const avg = getAvgScore(ev)
                        return (
                          <td key={ev.id} className="text-center py-2 px-2 text-brand-700">
                            {avg.toFixed(1)}
                          </td>
                        )
                      })}
                      <td className="text-center py-2 px-2">
                        {(() => {
                          const firstAvg = getAvgScore(trendEvaluations[0])
                          const lastAvg = getAvgScore(trendEvaluations[trendEvaluations.length - 1])
                          const diff = lastAvg - firstAvg
                          return (
                            <span className={diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}>
                              {diff > 0 ? `+${diff.toFixed(1)}` : diff === 0 ? '-' : diff.toFixed(1)}
                            </span>
                          )
                        })()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Visual bar chart */}
          {trendEvaluations.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-medium text-gray-500 mb-3">단계별 평균 점수</p>
              <div className="flex items-end gap-3 h-28">
                {trendEvaluations.map((ev) => {
                  const avg = getAvgScore(ev)
                  const heightPercent = (avg / 5) * 100
                  const color = avg >= 4 ? 'bg-emerald-500' : avg >= 3 ? 'bg-brand-500' : avg >= 2 ? 'bg-amber-500' : 'bg-red-500'
                  const rec = ev.continuation_recommendation as ContinuationRecommendation | null
                  return (
                    <div key={ev.id} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-bold text-gray-700">{avg.toFixed(1)}</span>
                      <div className="w-full bg-gray-200 rounded-t relative" style={{ height: '90px' }}>
                        <div
                          className={`absolute bottom-0 left-0 right-0 rounded-t ${color} transition-all duration-500`}
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500">{STAGE_LABELS[ev.stage]}</span>
                      {rec && (
                        <Badge variant={RECOMMENDATION_VARIANTS[rec]} className="text-[9px] px-1">
                          {RECOMMENDATION_LABELS[rec]}
                        </Badge>
                      )}
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
