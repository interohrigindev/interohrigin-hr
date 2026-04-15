import { useState, useEffect, useCallback } from 'react'
import { Plus, Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'

import { PageSpinner } from '@/components/ui/Spinner'

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

const EVALUATOR_ROLES: ProbationEvaluatorRole[] = ['leader', 'executive', 'ceo']

const EVALUATOR_LABELS: Record<ProbationEvaluatorRole, string> = {
  leader: '리더',
  executive: '임원',
  ceo: '대표',
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

  // employee_teams: 복수 소속 팀 매핑
  const [employeeTeams, setEmployeeTeams] = useState<{ employee_id: string; department_id: string }[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [evalRes, empRes, deptRes, hrRes, teamsRes] = await Promise.all([
      supabase.from('probation_evaluations').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name, department_id, hire_date, employment_type, position').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name'),
      supabase.from('employee_hr_details').select('employee_id, job_title, annual_salary'),
      supabase.from('employee_teams').select('employee_id, department_id'),
    ])

    if (deptRes.data) setDepartments(deptRes.data)
    if (teamsRes.data) setEmployeeTeams(teamsRes.data)

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

    // 기존 평가 존재 여부 확인 (upsert 메시지 구분용)
    const existing = evaluations.find(
      (ev) => ev.employee_id === selectedEmployeeId && ev.stage === selectedStage
        && ev.evaluator_id === (profile?.id || null) && ev.evaluator_role === selectedRole
    )

    const { error } = await supabase.from('probation_evaluations').upsert({
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
    }, { onConflict: 'employee_id,stage,evaluator_id,evaluator_role' })

    if (error) { toast('평가 저장 실패: ' + error.message, 'error'); return }
    toast(existing ? '평가가 수정되었습니다.' : '수습 평가가 저장되었습니다.', 'success')
    setEvalDialogOpen(false)
    fetchData()
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
                          <td className="py-2.5 px-3 text-gray-600">{(() => {
                            const deptNames: string[] = []
                            if (emp.department_id) {
                              const d = departments.find(d => d.id === emp.department_id)
                              if (d) deptNames.push(d.name)
                            }
                            const extraTeams = employeeTeams.filter(t => t.employee_id === emp.id && t.department_id !== emp.department_id)
                            for (const t of extraTeams) {
                              const d = departments.find(d => d.id === t.department_id)
                              if (d) deptNames.push(d.name)
                            }
                            return deptNames.length > 0 ? deptNames.join(', ') : '-'
                          })()}</td>
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

    </div>
  )
}
