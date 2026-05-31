import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Sparkles, Loader2, AlertTriangle, Trash2, Lock, RotateCcw, Pencil, Mail, CheckCircle2, Clock } from 'lucide-react'
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
import { useNavigate } from 'react-router-dom'
import { getDefaultEvaluatorRole, isProbationEvaluator, canSendProbationReminder } from '@/lib/probation-utils'
import { probationReminderEmail } from '@/lib/email-templates'
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
  email?: string | null
  department_id: string | null
  hire_date: string | null
  employment_type: string | null
  position: string | null
  role?: string | null
  is_active?: boolean | null
  probation_completed_at?: string | null
  probation_result?: 'passed' | 'failed' | 'pending' | null
  converted_to_regular_at?: string | null
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

  // 수습 라이프사이클 탭: in_progress(수습중) | passed(정규직 전환) | failed(계약 종료)
  const [lifecycleTab, setLifecycleTab] = useState<'in_progress' | 'passed' | 'failed'>('in_progress')
  // 통과/탈락 처리 다이얼로그
  const [lifecycleAction, setLifecycleAction] = useState<{ empId: string; empName: string; action: 'passed' | 'failed' } | null>(null)
  const [lifecycleSubmitting, setLifecycleSubmitting] = useState(false)

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
  // 회차 마감 처리 (관리자 skip)
  const [closures, setClosures] = useState<{ employee_id: string; stage: string; reason: string | null; closed_at: string }[]>([])
  // 메뉴 권한 (수습평가 권한자 식별용)
  const [menuPermissions, setMenuPermissions] = useState<{ employee_id: string; allowed_menus: string[] }[]>([])
  // 클릭한 셀에 대해 평가/마감 선택 다이얼로그
  const [cellAction, setCellAction] = useState<{ empId: string; empName: string; stage: ProbationStage; stageLabel: string; isOverdue: boolean } | null>(null)
  const [reminderCell, setReminderCell] = useState<{ empId: string; empName: string; stage: ProbationStage; stageLabel: string; diffDays: number } | null>(null)
  const [reminderSendingId, setReminderSendingId] = useState<string | null>(null)
  // 미평가자 알림 발송 다이얼로그
  const navigate = useNavigate()

  // 활성 임원 수 (전사 공통)
  const activeExecCount = useMemo(() => {
    return employees.filter(
      (e) => ['executive', 'director', 'division_head'].includes(e.role || '') && e.is_active !== false
    ).length
  }, [employees])

  // 피평가자 부서에 수습평가 권한을 가진 활성 리더가 있는지 → 리더 쿼터 동적 계산
  // (예: 경영관리본부에 권한 가진 리더가 없으면 리더 쿼터 0)
  const getRequiredCountsFor = useCallback((emp: { department_id?: string | null }) => {
    const hasEligibleLeader = employees.some((e) => {
      if (e.role !== 'leader') return false
      if (e.is_active === false) return false
      if (e.employment_type === 'probation') return false
      if (!emp.department_id || e.department_id !== emp.department_id) return false
      const menus = menuPermissions.find((m) => m.employee_id === e.id)?.allowed_menus || []
      return menus.includes('/admin/probation')
    })
    return { leader: hasEligibleLeader ? 1 : 0, executive: Math.max(activeExecCount, 1), ceo: 1 }
  }, [employees, menuPermissions, activeExecCount])

  // 피평가자 셀에 대한 평가자 후보 + 완료 여부
  type EvaluatorPending = {
    id: string
    name: string
    email: string | null
    position: string | null
    role: 'leader' | 'executive' | 'ceo'
    done: boolean
  }
  function getCellEvaluators(emp: { id: string; department_id?: string | null }, stageEvals: typeof evaluations): EvaluatorPending[] {
    const out: EvaluatorPending[] = []
    const eligibleLeaders = employees.filter((e) => {
      if (e.role !== 'leader') return false
      if (e.is_active === false) return false
      if (e.employment_type === 'probation') return false
      if (!emp.department_id || e.department_id !== emp.department_id) return false
      const menus = menuPermissions.find((m) => m.employee_id === e.id)?.allowed_menus || []
      return menus.includes('/admin/probation')
    })
    for (const l of eligibleLeaders) {
      out.push({ id: l.id, name: l.name, email: l.email || null, position: l.position || null, role: 'leader', done: false })
    }
    const activeExecs = employees.filter(
      (e) => ['executive', 'director', 'division_head'].includes(e.role || '') && e.is_active !== false
    )
    for (const x of activeExecs) {
      out.push({ id: x.id, name: x.name, email: x.email || null, position: x.position || null, role: 'executive', done: false })
    }
    const ceos = employees.filter((e) => e.role === 'ceo' && e.is_active !== false)
    for (const c of ceos) {
      out.push({ id: c.id, name: c.name, email: c.email || null, position: c.position || null, role: 'ceo', done: false })
    }
    return out.map((ev) => ({
      ...ev,
      done: stageEvals.some((se) => se.evaluator_id === ev.id && se.evaluator_role === ev.role),
    }))
  }

  async function sendCellReminder(empName: string, stage: ProbationStage, evaluator: EvaluatorPending, diffDays: number) {
    if (!evaluator.email) { toast('평가자 이메일이 없어 발송할 수 없습니다.', 'error'); return }
    setReminderSendingId(evaluator.id)
    const stageLabel = stage === 'round1' ? '1회차' : stage === 'round2' ? '2회차' : '3회차'
    const roleLabel = evaluator.role === 'leader' ? '리더' : evaluator.role === 'executive' ? '임원' : '대표'
    const { subject, html } = probationReminderEmail({
      evaluatorName: evaluator.name,
      evaluatorRoleLabel: roleLabel,
      evaluatorPosition: evaluator.position,
      employeeName: empName,
      stage: stageLabel,
      diffDays,
    })
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: evaluator.email, subject, html }),
      })
      if (res.ok) toast(`${evaluator.name} ${roleLabel}님에게 독려 메일 발송 완료`, 'success')
      else toast('발송 실패: API 오류', 'error')
    } catch (err) {
      toast('발송 실패: ' + (err instanceof Error ? err.message : '오류'), 'error')
    }
    setReminderSendingId(null)
  }

  // 수습 통과/탈락 처리
  async function processLifecycleAction(empId: string, action: 'passed' | 'failed') {
    setLifecycleSubmitting(true)
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const patch: Record<string, unknown> = {
      probation_result: action,
      probation_completed_at: todayStr,
    }
    if (action === 'passed') {
      patch.employment_type = 'full_time'
      patch.converted_to_regular_at = todayStr
    } else {
      patch.is_active = false
    }
    const { error } = await supabase.from('employees').update(patch).eq('id', empId)
    setLifecycleSubmitting(false)
    if (error) {
      toast('처리 실패: ' + error.message, 'error')
      return
    }
    toast(action === 'passed' ? '수습 통과 (정규직 전환) 처리 완료' : '수습 탈락 (계약 종료) 처리 완료', 'success')
    setLifecycleAction(null)
    if (action === 'passed') setLifecycleTab('passed')
    else setLifecycleTab('failed')
    fetchData()
  }

  // 회차의 모든 필수 평가자(피평가자 부서 기준 리더+임원+대표)가 평가 완료했는지 판정
  function isStageFullyEvaluated(stageEvals: typeof evaluations, emp: { department_id?: string | null }) {
    const counts = getRequiredCountsFor(emp)
    const leader = stageEvals.filter((e) => e.evaluator_role === 'leader').length
    const executive = stageEvals.filter((e) => e.evaluator_role === 'executive').length
    const ceo = stageEvals.filter((e) => e.evaluator_role === 'ceo').length
    return leader >= counts.leader && executive >= counts.executive && ceo >= counts.ceo
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [evalRes, empRes, deptRes, hrRes, teamsRes, closuresRes, mpRes] = await Promise.all([
      supabase.from('probation_evaluations').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name, email, department_id, hire_date, employment_type, position, role, is_active, probation_completed_at, probation_result, converted_to_regular_at').order('name'),
      supabase.from('departments').select('id, name'),
      supabase.from('employee_hr_details').select('employee_id, job_title, annual_salary'),
      supabase.from('employee_teams').select('employee_id, department_id'),
      supabase.from('probation_round_closures').select('employee_id, stage, reason, closed_at'),
      supabase.from('menu_permissions').select('employee_id, allowed_menus'),
    ])

    if (deptRes.data) setDepartments(deptRes.data)
    if (teamsRes.data) setEmployeeTeams(teamsRes.data)
    if (closuresRes.data) setClosures(closuresRes.data as any)
    if (mpRes.data) setMenuPermissions(mpRes.data as { employee_id: string; allowed_menus: string[] }[])

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
  function openNewEval(empId?: string, stage?: ProbationStage) {
    setSelectedEmployeeId(empId || '')
    setSelectedStage(stage || 'round1')
    setSelectedRole(getDefaultEvaluatorRole(profile?.role))
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
    // 폼 영역으로 스크롤 (DOM 렌더 후)
    setTimeout(() => {
      document.getElementById('probation-eval-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  function updateScore(key: string, value: number) {
    setScores((prev) => ({ ...prev, [key]: Math.min(MAX_SCORE_PER_ITEM, Math.max(0, value)) }))
  }

  function getTotalScore(scoreObj: Record<string, number>): number {
    return PROBATION_CRITERIA.reduce((sum, c) => sum + (scoreObj[c.key] || 0), 0)
  }

  // 평가 삭제 — admin/ceo/director/division_head 만 가능 (RLS 정책에 의해 강제됨)
  async function deleteEvaluations(employeeId: string, stage: ProbationStage, employeeName: string, stageLabel: string) {
    const canDelete = profile?.role && ['admin','ceo','director','division_head'].includes(profile.role)
    if (!canDelete) { toast('삭제 권한이 없습니다 (관리자/대표/이사/본부장만 가능).', 'error'); return }

    const targets = evaluations.filter((ev) => ev.employee_id === employeeId && ev.stage === stage)
    if (targets.length === 0) { toast('삭제할 평가가 없습니다.', 'error'); return }
    const evaluatorList = targets.map((t) => {
      const evname = employees.find((e) => e.id === t.evaluator_id)?.name || '미상'
      return `${EVALUATOR_LABELS[t.evaluator_role as ProbationEvaluatorRole] || t.evaluator_role} (${evname})`
    }).join(', ')
    if (!confirm(`${employeeName} - ${stageLabel} 평가 ${targets.length}건을 삭제합니다.\n\n작성자: ${evaluatorList}\n\n복구할 수 없습니다. 계속하시겠습니까?`)) return

    const ids = targets.map((t) => t.id)
    const { error } = await supabase.from('probation_evaluations').delete().in('id', ids)
    if (error) { toast(`삭제 실패: ${error.message}`, 'error'); return }
    toast(`${targets.length}건 삭제되었습니다.`, 'success')
    fetchData()
  }

  // 회차 마감 처리 — 평가 시기 초과로 작성되지 않은 회차를 skip 처리
  async function closeRound(employeeId: string, stage: ProbationStage, reason?: string) {
    if (!profile?.id) return
    const { error } = await supabase.from('probation_round_closures').insert({
      employee_id: employeeId,
      stage,
      reason: reason || null,
      closed_by: profile.id,
    })
    if (error) { toast(`마감 처리 실패: ${error.message}`, 'error'); return }
    toast('회차가 마감 처리되었습니다.', 'success')
    fetchData()
  }

  // 마감 취소
  async function reopenClosure(employeeId: string, stage: ProbationStage, employeeName: string, stageLabel: string) {
    const canDelete = profile?.role && ['admin','ceo','director','division_head'].includes(profile.role)
    if (!canDelete) { toast('권한이 없습니다.', 'error'); return }
    if (!confirm(`${employeeName} - ${stageLabel} 마감을 취소합니다. 다시 평가 가능 상태로 돌립니다. 계속하시겠습니까?`)) return
    const { error } = await supabase.from('probation_round_closures').delete().eq('employee_id', employeeId).eq('stage', stage)
    if (error) { toast(`취소 실패: ${error.message}`, 'error'); return }
    toast('마감이 취소되었습니다.', 'success')
    fetchData()
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

      const prevEvals = evaluations.filter((e) => e.employee_id === selectedEmployeeId && e.evaluator_id === profile?.id && e.evaluator_role === selectedRole)
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

    // P0-A: 회차 검증 (정책 완화 — 2026.05.19)
    //  - 관리자급: 모든 제약 우회
    //  - 일반 평가자(리더/임원/대표): 확인 다이얼로그로 우회 가능
    //  - 7일 자동 마감은 hard block 에서 confirm 으로 완화
    const isAdminLvl = !!(profile?.role && ['admin','ceo','director','division_head'].includes(profile.role))
    const targetEmp = employees.find((e) => e.id === selectedEmployeeId)
    if (targetEmp) {
      const ROUND_OFFSET = [14, 42, 70] as const
      const idx = STAGES.indexOf(selectedStage)
      // KST 자정 기준 — UTC 자정 파싱 시 KST 새벽 시간대 하루 어긋남 방지
      const hire = targetEmp.hire_date ? new Date(`${targetEmp.hire_date}T00:00:00+09:00`) : null

      // 캐시된 closures 가 stale 일 수 있어 — DB 에서 최신 상태 재조회
      const { data: freshClosuresRaw } = await supabase
        .from('probation_round_closures')
        .select('employee_id, stage')
        .eq('employee_id', selectedEmployeeId)
      const freshClosures: { employee_id: string; stage: string }[] = freshClosuresRaw || []

      // 이전 회차 미완료 체크 — confirm 으로 모든 평가자가 우회 가능
      for (let i = 0; i < idx; i++) {
        const prevDone = evaluations.some(
          (ev) => ev.employee_id === selectedEmployeeId && ev.stage === STAGES[i]
        )
        const prevClosed = freshClosures.some(
          (c) => c.employee_id === selectedEmployeeId && c.stage === STAGES[i]
        )
        if (!prevDone && !prevClosed) {
          if (isAdminLvl) break // 관리자급은 통과
          if (!confirm(`${STAGE_LABELS[STAGES[i]]} 평가가 아직 완료되지 않았습니다. 그래도 ${STAGE_LABELS[selectedStage]} 평가를 진행하시겠습니까?`)) return
          break
        }
      }

      // 회차 시작일 체크 — 미도래 차수도 confirm 으로 우회 가능
      if (hire) {
        const start = new Date(hire.getTime() + ROUND_OFFSET[idx] * 86400 * 1000).getTime()
        const now = Date.now()
        if (now < start) {
          if (!isAdminLvl && !confirm(`${STAGE_LABELS[selectedStage]} 예정일이 아직 도래하지 않았습니다. 조기 평가로 진행하시겠습니까?`)) return
        }
        // 7일 자동 마감은 사용성 개선 위해 hard block 제거 (수습 기간 90일 내 언제든 가능)
        // 평가 예정일 + 30일 이상 경과 시에만 경고 토스트
        const overdue = (now - start) / 86400000
        if (overdue > 30) {
          if (!confirm(`${STAGE_LABELS[selectedStage]} 예정일에서 ${Math.floor(overdue)}일 경과했습니다. 그래도 평가하시겠습니까?`)) return
        }
      }
    }

    // SECURITY DEFINER RPC 로 저장 (RLS 우회 — 권한 검증은 함수 내부에서 수행)
    // 배경: 093/094/095 마이그레이션 모두 RLS 정책 변형으로 시도했으나 리더 계정에서
    //       반복적으로 42501 차단 발생. 098 부터 RPC 우회로 전환하여 변수 제거.
    const { data: result, error } = await supabase.rpc('save_probation_evaluation', {
      p_employee_id: selectedEmployeeId,
      p_stage: selectedStage,
      p_evaluator_role: selectedRole,
      p_scores: scores,
      p_continuation_recommendation: recommendation,
      p_comments: comments || null,
      p_praise: praise || null,
      p_improvement: improvement || null,
      p_mentor_summary: null,
      p_leader_summary: selectedRole === 'leader' ? (leaderSummary || null) : null,
      p_exec_one_liner: (selectedRole === 'executive' || selectedRole === 'ceo') ? (execOneLiner || null) : null,
      p_strengths: (selectedRole === 'executive' || selectedRole === 'ceo') ? (strengthsText || null) : null,
      p_ai_assessment: aiAssessment || null,
    })

    if (error) { toast('평가 저장 실패: ' + error.message, 'error'); return }
    const existed = (result as { existed?: boolean } | null)?.existed === true
    toast(existed ? '평가가 수정되었습니다.' : '수습 평가가 저장되었습니다.', 'success')
    setEvalDialogOpen(false)
    fetchData()
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">수습 단계별 평가</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {canSendProbationReminder(profile) && (
            <Button variant="outline" className="shrink-0" onClick={() => navigate('/admin/probation/reminder')}>
              <Mail className="h-4 w-4 mr-1" /> 미평가자 알림 발송
            </Button>
          )}
          <Button className="shrink-0" onClick={() => openNewEval()}><Plus className="h-4 w-4 mr-1" /> 새 평가</Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-base text-blue-800">
        5개 항목 × 20점 (100점 만점) | 3회차 (2주/6주/10주) | 3인 평가 (리더/임원/대표)
      </div>

      {/* 수습 라이프사이클 탭 (수습중 / 정규직 전환 / 계약 종료) */}
      {(() => {
        const evaluatedIds = new Set(evaluations.map((ev) => ev.employee_id))
        const isLeaderRole = profile?.role === 'leader'
        const allLifecycle = employees.filter((e) => !isLeaderRole || (profile?.department_id && e.department_id === profile.department_id))
        // 현재 수습 상태 (employment_type/position 기반)
        const isCurrentlyProbation = (e: typeof allLifecycle[number]) =>
          e.employment_type === 'probation' || (e.position ?? '').includes('수습')
        // 정규직 전환 = 입사구분(employment_type)이 정규직(full_time) 이면 전환된 것으로 판정
        // (수습평가 이력 유무와 무관 — 일부 직원은 평가 기록이 없을 수도 있음)
        const isPassed = (e: typeof allLifecycle[number]) =>
          e.is_active !== false
          && e.probation_result !== 'failed'
          && (e.probation_result === 'passed' || e.employment_type === 'full_time')
        const inProgressEmps = allLifecycle.filter((e) =>
          e.is_active !== false && isCurrentlyProbation(e)
          && e.probation_result !== 'passed' && e.probation_result !== 'failed'
        )
        const passedEmps = allLifecycle.filter((e) => isPassed(e) && evaluatedIds.has(e.id))
        const failedEmps = allLifecycle.filter((e) =>
          (e.probation_result === 'failed' || e.is_active === false) && evaluatedIds.has(e.id)
        )
        return (
          <div className="flex items-center gap-2 border-b border-gray-200">
            {([
              { key: 'in_progress', label: '수습 중', count: inProgressEmps.length, cls: 'text-amber-700 border-amber-500' },
              { key: 'passed',      label: '정규직 전환', count: passedEmps.length,     cls: 'text-emerald-700 border-emerald-500' },
              { key: 'failed',      label: '계약 종료',  count: failedEmps.length,     cls: 'text-gray-600 border-gray-500' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setLifecycleTab(tab.key)}
                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  lifecycleTab === tab.key
                    ? tab.cls
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                {tab.label} <span className="ml-1 text-xs font-normal">({tab.count})</span>
              </button>
            ))}
          </div>
        )
      })()}

      {/* 수습 직원 평가 일정 테이블 */}
      {(() => {
        // Module 5: 리더는 본인 부서만 노출 / 임원·대표·관리자는 전체
        const isLeaderRole = profile?.role === 'leader'
        const evaluatedIds = new Set(evaluations.map((ev) => ev.employee_id))
        const isCurrentlyProbation = (e: typeof employees[number]) =>
          e.employment_type === 'probation' || (e.position ?? '').includes('수습')
        const probEmpsRaw = employees
          .filter((e) => !isLeaderRole || (profile?.department_id && e.department_id === profile.department_id))
          .filter((e) => {
            if (lifecycleTab === 'in_progress') {
              return e.is_active !== false
                && isCurrentlyProbation(e)
                && e.probation_result !== 'passed' && e.probation_result !== 'failed'
            }
            if (lifecycleTab === 'passed') {
              // employment_type='full_time' = 정규직 전환 (또는 명시적 passed)
              return e.is_active !== false
                && e.probation_result !== 'failed'
                && evaluatedIds.has(e.id)
                && (e.probation_result === 'passed' || e.employment_type === 'full_time')
            }
            // failed: probation_result=failed 또는 퇴사자 (단 수습평가 이력이 있는 경우)
            return (e.probation_result === 'failed' || e.is_active === false) && evaluatedIds.has(e.id)
          })
        if (probEmpsRaw.length === 0) {
          const emptyLabel = lifecycleTab === 'in_progress' ? '현재 수습 중인 직원이 없습니다.'
            : lifecycleTab === 'passed' ? '정규직으로 전환된 직원이 없습니다.'
            : '수습 종료 후 계약이 종료된 직원이 없습니다.'
          return <div className="p-8 text-center text-sm text-gray-500">{emptyLabel}</div>
        }

        // KST(Asia/Seoul) 기준 자정 시각을 ms 로 반환 — D-day 계산 시 UTC/KST 혼동으로
        // KST 오전 9시 이전에 하루 일찍 D-1 로 표시되던 버그 fix (2026-06-01)
        function kstMidnightMs(d: Date): number {
          // d 의 KST 자정 시각을 UTC ms 로 환산
          const kstDateStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(d)
          // kstDateStr 예: '2026-06-01' → KST 자정 = UTC 전날 15:00
          return new Date(`${kstDateStr}T00:00:00+09:00`).getTime()
        }
        function kstDiffDays(target: Date, base: Date): number {
          return Math.round((kstMidnightMs(target) - kstMidnightMs(base)) / 86400000)
        }
        const today = new Date()
        // KST 기준 YYYY.MM.DD 포맷 (UTC getMonth/getDate 사용 시 시각대 혼동 방지)
        const formatDate = (d: Date | null) => {
          if (!d) return '-'
          const s = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(d)
          return s.replace(/-/g, '.')
        }

        // 회차별 일자 + 활성 회차 판정 + D-day 정렬
        const ROUND_OFFSET_DAYS = [14, 42, 70] as const // 1·2·6주차→14일, 2회차→42일, 3회차→70일
        const ACTIVE_WINDOW_DAYS = 7 // 시작일부터 7일간만 활성

        type RoundMeta = { stage: ProbationStage; date: Date | null; isCompleted: boolean; isClosed: boolean }
        const buildRounds = (emp: typeof probEmpsRaw[number]): RoundMeta[] => {
          // 입사일을 KST 자정 기준으로 파싱 (UTC 자정으로 파싱하면 KST 새벽 시간대에 하루 어긋남)
          const hire = emp.hire_date ? new Date(`${emp.hire_date}T00:00:00+09:00`) : null
          return STAGES.map((stage, i) => {
            const date = hire ? new Date(hire.getTime() + ROUND_OFFSET_DAYS[i] * 86400 * 1000) : null
            const empEvals = evaluations.filter((ev) => ev.employee_id === emp.id && ev.stage === stage)
            const isClosed = closures.some((c) => c.employee_id === emp.id && c.stage === stage)
            const isCompleted = empEvals.length > 0 || isClosed
            return { stage, date, isCompleted, isClosed }
          })
        }

        // 활성 회차 = 가장 작은 미완료 회차 (이전 회차 모두 완료여야 함)
        const getActiveRound = (rounds: RoundMeta[]): RoundMeta | null => {
          for (const r of rounds) {
            if (!r.isCompleted) return r
          }
          return null
        }

        // 회차 평가 가능 여부 — 이전 회차 모두 완료 + 활성 윈도우 7일 이내
        const canEvaluate = (rounds: RoundMeta[], target: ProbationStage): { allowed: boolean; reason?: string } => {
          const idx = STAGES.indexOf(target)
          if (idx === -1) return { allowed: false, reason: '잘못된 회차' }
          // 이전 회차 미완료
          for (let i = 0; i < idx; i++) {
            if (!rounds[i].isCompleted) return { allowed: false, reason: `${STAGE_LABELS[STAGES[i]]} 평가가 먼저 완료되어야 합니다.` }
          }
          // 7일 자동 마감 — KST 자정 기준 비교
          const r = rounds[idx]
          if (!r.date) return { allowed: false, reason: '입사일이 등록되지 않았습니다.' }
          const startMs = kstMidnightMs(r.date)
          const endMs = startMs + ACTIVE_WINDOW_DAYS * 86400 * 1000
          const todayMs = kstMidnightMs(today)
          if (todayMs < startMs) return { allowed: false, reason: '회차 시작일 전입니다.' }
          if (todayMs > endMs && !r.isCompleted) return { allowed: false, reason: '7일 자동 마감되었습니다 (관리자 강제 해제 필요).' }
          return { allowed: true }
        }

        // 정렬: 직원의 모든 미완료 회차 중 "가장 가까운 다가올 평가(D-)" 기준
        // ① 미완료 중 D- 최소 → 다가옴 그룹(작은 D- 우선)
        // ② 미완료 모두 D+ → 지남 그룹(작은 D+ = 최근에 지난 것 우선)
        // ③ 모든 회차 완료/마감 → 맨 아래
        const sortKey = (emp: typeof probEmpsRaw[number]) => {
          const rounds = buildRounds(emp)
          const uncompleted = rounds.filter((r) => !r.isCompleted && r.date)
          if (uncompleted.length === 0) return { group: 3, value: 0 }
          const diffs = uncompleted.map((r) => kstDiffDays(r.date!, today))
          const upcoming = diffs.filter((d) => d >= 0)
          if (upcoming.length > 0) return { group: 1, value: Math.min(...upcoming) }
          // 미완료 모두 지남 → 가장 최근에 지난 것 (절대값 최소)
          return { group: 2, value: Math.min(...diffs.map(Math.abs)) }
        }
        const probEmps = [...probEmpsRaw].sort((a, b) => {
          const ka = sortKey(a)
          const kb = sortKey(b)
          if (ka.group !== kb.group) return ka.group - kb.group
          return ka.value - kb.value
        })

        // 미사용 변수 경고 회피 (canEvaluate 는 handleSave 에서 직접 사용)
        void canEvaluate

        // 본인이 평가해야 할 셀 개수 (테이블 헤더 카운트 표시용)
        const myRoleForCount = getDefaultEvaluatorRole(profile?.role)
        const myMenusForCount = menuPermissions.find((m) => m.employee_id === profile?.id)?.allowed_menus || []
        const isProbationSelfForCount = profile?.role === 'leader' && employees.find((e) => e.id === profile?.id)?.employment_type === 'probation'
        const leaderBlocked = profile?.role === 'leader' && (!myMenusForCount.includes('/admin/probation') || isProbationSelfForCount)
        const myTodoCount = profile?.id && isProbationEvaluator(profile?.role) && !leaderBlocked ? probEmps.reduce((acc, e) => {
          const isLeaderOther = profile?.role === 'leader' && (!profile?.department_id || e.department_id !== profile.department_id)
          if (isLeaderOther) return acc
          if (!e.hire_date) return acc
          // KST 자정 기준 — UTC 새벽 시각대 하루 어긋남 방지
          const hire = new Date(`${e.hire_date}T00:00:00+09:00`)
          const offsets = [14, 42, 70]
          let count = 0
          STAGES.forEach((stg, i) => {
            const sDate = new Date(hire.getTime() + offsets[i] * 86400000)
            const d = kstDiffDays(sDate, today)
            if (d > 0) return
            if (closures.some((c) => c.employee_id === e.id && c.stage === stg)) return
            const stEvals = evaluations.filter((ev) => ev.employee_id === e.id && ev.stage === stg)
            const mine = stEvals.some((ev) => ev.evaluator_id === profile?.id && ev.evaluator_role === myRoleForCount)
            if (!mine) count++
          })
          return acc + count
        }, 0) : 0

        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                평가 예정 현황
                {myTodoCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500 text-white font-bold">
                    내가 평가해야 할 항목 {myTodoCount}건
                  </span>
                )}
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
                      <th className="text-center py-2.5 px-3 font-semibold">결과 처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {probEmps.map((emp) => {
                      // KST 자정 기준 — UTC 자정 파싱 시 KST 새벽 시간대 하루 어긋남 방지
                      const hire = emp.hire_date ? new Date(`${emp.hire_date}T00:00:00+09:00`) : null
                      const endDate = hire ? new Date(hire.getTime() + 90 * 24 * 60 * 60 * 1000) : null
                      const empEvals = evaluations.filter((ev) => ev.employee_id === emp.id)

                      const roundDates = hire ? [
                        new Date(hire.getTime() + 14 * 24 * 60 * 60 * 1000),
                        new Date(hire.getTime() + 42 * 24 * 60 * 60 * 1000),
                        new Date(hire.getTime() + 70 * 24 * 60 * 60 * 1000),
                      ] : [null, null, null]

                      // 활성 회차 = 가장 작은 미완료 회차 (윈도우 무관 — 항상 강조)
                      const activeStage: ProbationStage | null = (() => {
                        const rounds = buildRounds(emp)
                        const active = getActiveRound(rounds)
                        return active ? active.stage : null
                      })()

                      const canDeleteRole = profile?.role && ['admin','ceo','director','division_head'].includes(profile.role)
                      const isClosedFor = (stage: string) => closures.some((c) => c.employee_id === emp.id && c.stage === stage)
                      const getRoundCell = (stage: string, roundDate: Date | null) => {
                        if (isClosedFor(stage)) {
                          const stageLabel = stage === 'round1' ? '1회차' : stage === 'round2' ? '2회차' : '3회차'
                          return (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">관리자 마감</span>
                              {canDeleteRole && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); reopenClosure(emp.id, stage as ProbationStage, emp.name, stageLabel) }}
                                  className="text-gray-300 hover:text-amber-500"
                                  title="마감 취소"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </button>
                              )}
                            </span>
                          )
                        }
                        const stageEvals = empEvals.filter((ev) => ev.stage === stage)
                        if (stageEvals.length > 0) {
                          const avg = stageEvals.reduce((sum, ev) => sum + getTotalScore(ev.scores as Record<string, number>), 0) / stageEvals.length
                          const stageLabel = stage === 'round1' ? '1회차' : stage === 'round2' ? '2회차' : '3회차'
                          const latestTs = stageEvals.reduce((max, ev) => {
                            const t = new Date(ev.updated_at || ev.created_at).getTime()
                            return t > max ? t : max
                          }, 0)
                          const latestDate = latestTs > 0 ? formatDate(new Date(latestTs)) : null
                          // 피드백: 진행 중이어도 현재까지 평균 점수 노출, 완료 여부는 라벨로 구분
                          const fullyDone = isStageFullyEvaluated(stageEvals, emp)
                          const reqForEmp = getRequiredCountsFor(emp)
                          const requiredTotal = reqForEmp.leader + reqForEmp.executive + reqForEmp.ceo
                          // 진행중이면 예정일을, 완료면 최종 제출일을 노출 (조기 평가 케이스 대비)
                          const displayDate = fullyDone ? latestDate : (roundDate ? formatDate(roundDate) : latestDate)
                          return (
                            <span className="inline-flex flex-col items-center leading-tight">
                              <span className="inline-flex items-center gap-1">
                                <span className={`text-sm font-bold ${fullyDone ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {avg.toFixed(0)}점{fullyDone ? ' 완료' : ' (진행중)'}
                                </span>
                                {canDeleteRole && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); deleteEvaluations(emp.id, stage as ProbationStage, emp.name, stageLabel) }}
                                    className="text-gray-300 hover:text-red-500 transition-colors"
                                    title={`${emp.name} ${stageLabel} 평가 삭제`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                {stageEvals.length}/{requiredTotal}명 평가
                              </span>
                              {displayDate && <span className="text-[10px] text-gray-400">{displayDate}</span>}
                            </span>
                          )
                        }
                        if (!roundDate) return <span className="text-gray-400">-</span>
                        const diff = kstDiffDays(roundDate, today)
                        const dateLabel = formatDate(roundDate)
                        // 입사일 기준 평가 예정일을 함께 표시 (D-day 와 함께)
                        if (diff < 0) {
                          return (
                            <span className="inline-flex flex-col items-center leading-tight">
                              <span className="text-brand-700 font-bold text-sm">D+{Math.abs(diff)} 초과</span>
                              <span className="text-[10px] text-brand-400">{dateLabel}</span>
                            </span>
                          )
                        }
                        if (diff === 0) {
                          return (
                            <span className="inline-flex flex-col items-center leading-tight">
                              <span className="text-brand-700 font-bold text-sm">D-day</span>
                              <span className="text-[10px] text-brand-500">{dateLabel}</span>
                            </span>
                          )
                        }
                        if (diff <= 7) {
                          return (
                            <span className="inline-flex flex-col items-center leading-tight">
                              <span className="text-amber-600 font-semibold text-sm">D-{diff}</span>
                              <span className="text-[10px] text-gray-500">{dateLabel}</span>
                            </span>
                          )
                        }
                        return (
                          <span className="inline-flex flex-col items-center leading-tight">
                            <span className="text-gray-700 text-sm font-medium">{dateLabel}</span>
                            <span className="text-[10px] text-gray-400">D-{diff}</span>
                          </span>
                        )
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
                          {(['round1','round2','round3'] as const).map((stg, sIdx) => {
                            const isActive = activeStage === stg
                            const stageEvals = empEvals.filter((ev) => ev.stage === stg)
                            const isClosed = isClosedFor(stg)
                            const isCompleted = stageEvals.length > 0 || isClosed
                            const stageLabel = stg === 'round1' ? '1회차' : stg === 'round2' ? '2회차' : '3회차'
                            const rdate = roundDates[sIdx]
                            const diff = rdate ? kstDiffDays(rdate, today) : null
                            const isOverdue = diff !== null && diff < 0
                            const isFuture = diff !== null && diff > 0
                            // D-day 도달(diff <= 0) + 미완료 → 보라(brand) 강조 / 그 외 활성 → 앰버
                            const isDuePast = !isCompleted && diff !== null && diff <= 0
                            const isAdminLevel = profile?.role && ['admin','ceo','director','division_head'].includes(profile.role)
                            // 피드백: 본인이 평가해야 할 셀 강조 (To-Do 카드 대신 셀에 직접 표시)
                            const myRole = getDefaultEvaluatorRole(profile?.role)
                            const isLeaderForOtherDept = profile?.role === 'leader' && (!profile?.department_id || emp.department_id !== profile.department_id)
                            // 리더의 경우: 수습평가 메뉴 권한 + 본인이 수습 상태가 아닌 경우만 평가 가능
                            const myMenus = menuPermissions.find((m) => m.employee_id === profile?.id)?.allowed_menus || []
                            const isProbationSelf = profile?.role === 'leader' && employees.find((e) => e.id === profile?.id)?.employment_type === 'probation'
                            const leaderLacksPermission = profile?.role === 'leader' && (!myMenus.includes('/admin/probation') || isProbationSelf)
                            const myAlreadyEvaluated = stageEvals.some(
                              (ev) => ev.evaluator_id === profile?.id && ev.evaluator_role === myRole
                            )
                            // 라이프사이클 종료된 직원의 평가는 신규 입력 불가 (정규직 전환/탈락/수습 90일 종료)
                            const _probEnd = hire ? new Date(hire.getTime() + 90 * 86400000) : null
                            const _probPeriodOver = !!_probEnd && _probEnd.getTime() < today.getTime()
                            const _lifecycleSettled = emp.probation_result === 'passed'
                              || emp.probation_result === 'failed'
                              || emp.employment_type === 'full_time'
                              || emp.is_active === false
                              || _probPeriodOver
                            const needsMyEval = !!profile?.id
                              && isProbationEvaluator(profile?.role)
                              && !isClosed
                              && !isFuture
                              && !!hire
                              && !isLeaderForOtherDept
                              && !leaderLacksPermission
                              && !myAlreadyEvaluated
                              && !_lifecycleSettled
                            // 미도래(diff > 0): 평가 기간이 시작되지 않았으므로 클릭 차단 (요구사항 #2)
                            // 피드백: 다른 사람이 이미 평가했어도(=isCompleted), 내가 평가해야 한다면(needsMyEval) 클릭 가능
                            // 관리자 권한자: 예정일 도달 이후 진행 중 셀 클릭 시 독려 모달
                            // (조기 평가 케이스는 예정일 전이라 독려 대상에서 제외)
                            const cellFullyDone = stageEvals.length > 0 && isStageFullyEvaluated(stageEvals, emp)
                            // (위에서 계산된 _lifecycleSettled 재사용)
                            const isLifecycleSettled = _lifecycleSettled
                            const reminderEligible = canSendProbationReminder(profile) && !!hire && !isFuture && !isClosed && !cellFullyDone && !isLifecycleSettled
                            const canClick = !!hire && !isFuture && !isClosed && !isLifecycleSettled && (!isCompleted || needsMyEval || reminderEligible)
                            return (
                              <td
                                key={stg}
                                className={[
                                  'py-2.5 px-3 text-center transition-colors relative',
                                  needsMyEval ? 'bg-blue-50 ring-2 ring-inset ring-blue-400 font-semibold' :
                                    isDuePast ? 'bg-brand-50 ring-2 ring-inset ring-brand-400 font-semibold' :
                                    isActive ? 'animate-amber-blink font-semibold' : '',
                                  canClick ? 'cursor-pointer hover:bg-brand-50' : '',
                                  isFuture && !isCompleted ? 'opacity-60 cursor-not-allowed' : '',
                                ].filter(Boolean).join(' ')}
                                onClick={canClick ? () => {
                                  // 1순위: 본인이 평가 필요 → 평가 폼 (관리자라도 평가자 역할이면 폼 우선)
                                  if (needsMyEval) {
                                    openNewEval(emp.id, stg)
                                    return
                                  }
                                  // 2순위: 독려 가능자 (admin/ceo/강제묵) → 독려 모달
                                  if (reminderEligible) {
                                    setReminderCell({
                                      empId: emp.id, empName: emp.name, stage: stg, stageLabel,
                                      diffDays: diff ?? 0,
                                    })
                                    return
                                  }
                                  // 초과 + 관리자 → 작성/마감 선택 다이얼로그
                                  if (isOverdue && isAdminLevel) {
                                    setCellAction({ empId: emp.id, empName: emp.name, stage: stg, stageLabel, isOverdue: true })
                                  } else {
                                    openNewEval(emp.id, stg)
                                  }
                                } : undefined}
                                title={
                                  isLifecycleSettled
                                    ? `${emp.name} - ${stageLabel}: 수습 기간이 종료되어 평가가 잠겼습니다`
                                    : needsMyEval
                                      ? `📝 내가 평가해야 합니다 — ${emp.name} ${stageLabel}`
                                      : canClick
                                        ? `${emp.name} - ${stageLabel} ${isOverdue ? '(초과)' : ''}`
                                        : isFuture && !isCompleted
                                          ? `${emp.name} - ${stageLabel}: 평가 기간이 아직 도래하지 않았습니다`
                                          : undefined
                                }
                              >
                                {needsMyEval && (
                                  <span className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-bold">내 평가</span>
                                )}
                                {getRoundCell(stg, rdate)}
                              </td>
                            )
                          })}
                          <td className="py-2.5 px-3 text-center text-gray-700">{formatDate(endDate)}</td>
                          <td className="py-2.5 px-3 text-center text-gray-700">
                            {(() => {
                              // 정규직 전환 — 명시적(passed) 또는 employment_type='full_time' 기준
                              const isConverted = emp.probation_result === 'passed'
                                || (emp.is_active !== false && emp.employment_type === 'full_time')
                              if (isConverted) {
                                return (
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                    정규직 전환
                                    {emp.converted_to_regular_at && <span className="text-[10px] text-emerald-500">({emp.converted_to_regular_at.replaceAll('-', '.')})</span>}
                                  </span>
                                )
                              }
                              if (emp.probation_result === 'failed') {
                                return (
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                                    계약 종료
                                    {emp.probation_completed_at && <span className="text-[10px] text-gray-500">({emp.probation_completed_at.replaceAll('-', '.')})</span>}
                                  </span>
                                )
                              }
                              if (canSendProbationReminder(profile) && lifecycleTab === 'in_progress') {
                                return (
                                  <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                                      onClick={() => setLifecycleAction({ empId: emp.id, empName: emp.name, action: 'passed' })}>
                                      통과
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
                                      onClick={() => setLifecycleAction({ empId: emp.id, empName: emp.name, action: 'failed' })}>
                                      탈락
                                    </Button>
                                  </div>
                                )
                              }
                              return <span className="text-xs text-gray-400">-</span>
                            })()}
                          </td>
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
        <Card id="probation-eval-form">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>수습 평가 작성</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setEvalDialogOpen(false)}>닫기</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 직원/회차/역할 선택 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select
                label="직원 *"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                options={employees.filter((e) => {
                  // 수습 중인 활성 직원만 표시 (라이프사이클 종료자 제외)
                  if (e.is_active === false) return false
                  if (e.probation_result === 'passed' || e.probation_result === 'failed') return false
                  if (e.employment_type === 'full_time') return false
                  const hasProbType = e.employment_type === 'probation' || (e.position ?? '').includes('수습')
                  if (!hasProbType) return false
                  // 수습 90일 종료된 직원도 제외 (KST 자정 기준)
                  if (e.hire_date) {
                    const probEnd = new Date(new Date(`${e.hire_date}T00:00:00+09:00`).getTime() + 90 * 86400000)
                    if (probEnd.getTime() < new Date().getTime()) return false
                  }
                  // 리더는 본인 부서 직원만 평가 가능 (임원/대표/관리자는 전체)
                  if (profile?.role === 'leader') {
                    if (!profile?.department_id || e.department_id !== profile.department_id) return false
                  }
                  return true
                }).map((e) => ({ value: e.id, label: e.name }))}
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
              // KST 자정 기준 — UTC 자정 파싱 시 KST 새벽 시간대 하루 어긋남 방지
              const hireDate = emp.hire_date ? new Date(`${emp.hire_date}T00:00:00+09:00`) : null
              const endDate = hireDate ? new Date(hireDate.getTime() + 90 * 24 * 60 * 60 * 1000) : null
              const formatDate = (d: Date | null) => {
                if (!d) return '-'
                // KST 기준 YY년 M월 D일
                const parts = new Intl.DateTimeFormat('ko-KR', {
                  timeZone: 'Asia/Seoul', year: '2-digit', month: 'numeric', day: 'numeric',
                }).formatToParts(d)
                const yy = parts.find(p => p.type === 'year')?.value || ''
                const mm = parts.find(p => p.type === 'month')?.value || ''
                const dd = parts.find(p => p.type === 'day')?.value || ''
                return `${yy}년 ${mm}월 ${dd}일`
              }

              const STAGE_INTROS: Record<ProbationStage, string> = {
                round1: '본 평가는 1회차(입사 2주 차) 평가입니다.\n실무 성과보다는 조직 적응력, 기본 태도, 업무 파악 노력에 초점을 맞춰 평가해 주시기 바랍니다.',
                round2: '본 평가는 2회차(입사 6주 차) 평가입니다.\n초기 적응 단계를 넘어, 실질적인 업무 지시에 대한 이해도와 실행력, 그리고 직무 수행의 안정성에 초점을 맞춰 평가해 주시기 바랍니다.',
                round3: '본 평가는 3회차(입사 10주 차) 최종 평가입니다.\n수습 기간을 마무리하며, 해당 직무를 독립적으로 수행할 수 있는 역량을 갖추었는지, 그리고 정규직 전환에 적합한지에 초점을 맞춰 종합적으로 평가해 주시기 바랍니다.',
              }

              return (
                <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 space-y-2">
                  <h3 className="text-lg font-bold text-brand-900">수습 평가_{emp.name}({STAGE_SHORT[selectedStage]})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-brand-800">
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

      {/* ─── 초과 회차 액션 다이얼로그 (관리자: 평가 작성 / 마감 처리) ─── */}
      {cellAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCellAction(null)}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-gray-900">{cellAction.empName} — {cellAction.stageLabel} 초과</h3>
                <p className="text-sm text-gray-600 mt-1">평가 시기를 초과한 회차입니다. 평가를 작성하거나 마감 처리할 수 있습니다.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 pt-2">
              <Button onClick={() => { openNewEval(cellAction.empId, cellAction.stage); setCellAction(null) }}>
                <Pencil className="h-4 w-4 mr-1.5" /> 평가 작성
              </Button>
              <Button
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={async () => {
                  const reason = prompt('마감 사유를 입력해주세요 (선택)') || ''
                  if (!confirm(`${cellAction.empName} ${cellAction.stageLabel} 평가를 평가 없이 마감 처리합니다. 계속하시겠습니까?`)) return
                  await closeRound(cellAction.empId, cellAction.stage, reason)
                  setCellAction(null)
                }}
              >
                <Lock className="h-4 w-4 mr-1.5" /> 마감 처리 (평가 없이 skip)
              </Button>
              <Button variant="ghost" onClick={() => setCellAction(null)}>닫기</Button>
            </div>
          </div>
        </div>
      )}

      {/* 수습 통과/탈락 확정 다이얼로그 */}
      {lifecycleAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !lifecycleSubmitting && setLifecycleAction(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              {lifecycleAction.action === 'passed'
                ? <Sparkles className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                : <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />}
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {lifecycleAction.action === 'passed' ? '수습 통과 처리 — 정규직 전환' : '수습 탈락 처리 — 계약 종료'}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  <strong>{lifecycleAction.empName}</strong> 직원의 수습평가를 {lifecycleAction.action === 'passed' ? '통과로 확정' : '탈락으로 확정'}하시겠습니까?
                </p>
                {lifecycleAction.action === 'passed' ? (
                  <ul className="text-xs text-gray-500 mt-2 list-disc pl-4 space-y-0.5">
                    <li>고용 형태가 <b>정규직(full_time)</b> 으로 변경됩니다.</li>
                    <li>정규직 전환일이 오늘로 기록됩니다.</li>
                    <li>이후 인사평가 화면에서 수습 이력이 함께 조회됩니다.</li>
                  </ul>
                ) : (
                  <ul className="text-xs text-gray-500 mt-2 list-disc pl-4 space-y-0.5">
                    <li>재직 상태가 <b>퇴사(is_active=false)</b> 로 변경됩니다.</li>
                    <li>수습 종료일이 오늘로 기록됩니다.</li>
                    <li>로그인이 제한되며 '계약 종료' 탭으로 이동합니다.</li>
                  </ul>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="ghost" onClick={() => setLifecycleAction(null)} disabled={lifecycleSubmitting}>취소</Button>
              <Button
                onClick={() => processLifecycleAction(lifecycleAction.empId, lifecycleAction.action)}
                disabled={lifecycleSubmitting}
                className={lifecycleAction.action === 'passed' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
              >
                {lifecycleSubmitting
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 처리 중...</>
                  : (lifecycleAction.action === 'passed' ? '통과 확정' : '탈락 확정')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 독려 메일 발송 모달 (관리자/대표/강제묵 이사 전용) */}
      {reminderCell && (() => {
        const cell = reminderCell
        const emp = employees.find((e) => e.id === cell.empId)
        if (!emp) return null
        const stageEvals = evaluations.filter((ev) => ev.employee_id === cell.empId && ev.stage === cell.stage)
        const evaluators = getCellEvaluators(emp, stageEvals)
        const pending = evaluators.filter((ev) => !ev.done)
        const diffBadge = cell.diffDays < 0
          ? { txt: `D+${Math.abs(cell.diffDays)} 초과`, cls: 'bg-red-100 text-red-700' }
          : cell.diffDays === 0
            ? { txt: 'D-day', cls: 'bg-amber-100 text-amber-700' }
            : { txt: `조기 진행중 (예정일 D-${cell.diffDays})`, cls: 'bg-blue-100 text-blue-700' }
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setReminderCell(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-2">
                <Mail className="h-5 w-5 text-brand-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900">
                    {cell.empName} — {cell.stageLabel} 평가 독려
                    <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full ${diffBadge.cls}`}>{diffBadge.txt}</span>
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">아래 미완료 평가자에게 개별 독려 이메일을 발송할 수 있습니다.</p>
                </div>
              </div>

              {(['leader', 'executive', 'ceo'] as const).map((roleKey) => {
                const list = evaluators.filter((e) => e.role === roleKey)
                if (list.length === 0) return null
                const roleLabel = roleKey === 'leader' ? '리더' : roleKey === 'executive' ? '임원' : '대표'
                return (
                  <div key={roleKey} className="border border-gray-200 rounded-md">
                    <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-700 border-b border-gray-200">
                      {roleLabel} ({list.filter((e) => e.done).length}/{list.length})
                    </div>
                    <ul className="divide-y divide-gray-100">
                      {list.map((ev) => (
                        <li key={ev.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            {ev.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <Clock className="h-4 w-4 text-amber-500 shrink-0" />}
                            <span className="font-medium text-gray-900 truncate">{ev.name}</span>
                            {ev.position && <span className="text-xs text-gray-500 truncate">{ev.position}</span>}
                            <span className={`text-[11px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${ev.done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              {ev.done ? '완료' : '미완료'}
                            </span>
                          </div>
                          {!ev.done && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => sendCellReminder(cell.empName, cell.stage, ev, cell.diffDays)}
                              disabled={!ev.email || reminderSendingId === ev.id}
                              className="ml-2 shrink-0"
                            >
                              {reminderSendingId === ev.id
                                ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 발송중</>
                                : <><Mail className="h-3 w-3 mr-1" /> 독려 발송</>}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}

              {pending.length === 0 && (
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                  모든 평가자가 평가를 완료했습니다.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setReminderCell(null)}>닫기</Button>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
