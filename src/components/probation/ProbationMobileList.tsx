import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, Lock, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getDefaultEvaluatorRole, isProbationEvaluator, canSendProbationReminder } from '@/lib/probation-utils'
import type { ProbationStage, ProbationEvaluation } from '@/types/employee-lifecycle'

const STAGES: ProbationStage[] = ['round1', 'round2', 'round3']
const STAGE_SHORT_LABEL: Record<ProbationStage, string> = {
  round1: '1회차 (2주)',
  round2: '2회차 (6주)',
  round3: '3회차 (10주)',
}
const ROUND_OFFSET_DAYS = [14, 42, 70] as const

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

interface Profile {
  id?: string
  role?: string | null
  name?: string | null
  department_id?: string | null
}

interface Props {
  probEmps: EmployeeBasic[]
  evaluations: ProbationEvaluation[]
  closures: { employee_id: string; stage: string }[]
  departments: { id: string; name: string }[]
  employeeTeams: { employee_id: string; department_id: string }[]
  employees: EmployeeBasic[]
  menuPermissions: { employee_id: string; allowed_menus: string[] }[]
  profile: Profile | null | undefined
  today: Date
  kstDiffDays: (target: Date, base: Date) => number
  formatDate: (d: Date | null) => string
  isStageFullyEvaluated: (stageEvals: ProbationEvaluation[], emp: { department_id?: string | null }) => boolean
  getRequiredCountsFor: (emp: { department_id?: string | null }) => { leader: number; executive: number; ceo: number }
  getTotalScore: (scoreObj: Record<string, number>) => number
  lifecycleTab: 'in_progress' | 'passed' | 'failed'
  onOpenEval: (empId: string, stage: ProbationStage) => void
  onOpenReminder: (empId: string, empName: string, stage: ProbationStage, stageLabel: string, diffDays: number) => void
  onOpenCellAction: (empId: string, empName: string, stage: ProbationStage, stageLabel: string, isOverdue: boolean) => void
  onOpenLifecycle: (empId: string, empName: string, action: 'passed' | 'failed') => void
  onDeleteEvals: (empId: string, stage: ProbationStage, empName: string, stageLabel: string) => void
  onReopenClosure: (empId: string, stage: ProbationStage, empName: string, stageLabel: string) => void
}

export function ProbationMobileList(props: Props) {
  const {
    probEmps, evaluations, closures, departments, employeeTeams, employees,
    menuPermissions, profile, today, kstDiffDays, formatDate,
    isStageFullyEvaluated, getRequiredCountsFor, getTotalScore,
    lifecycleTab, onOpenEval, onOpenReminder, onOpenCellAction,
    onOpenLifecycle, onDeleteEvals, onReopenClosure,
  } = props

  // 직원별 펼침 상태 — 기본: D-7 이내 활성회차 보유 시 자동 펼침
  const autoExpanded = useMemo(() => {
    const set = new Set<string>()
    for (const emp of probEmps) {
      if (!emp.hire_date) continue
      const hire = new Date(`${emp.hire_date}T00:00:00+09:00`)
      for (let i = 0; i < STAGES.length; i++) {
        const stg = STAGES[i]
        const stageEvals = evaluations.filter((ev) => ev.employee_id === emp.id && ev.stage === stg)
        const isClosed = closures.some((c) => c.employee_id === emp.id && c.stage === stg)
        const isCompleted = stageEvals.length > 0 || isClosed
        if (isCompleted) continue
        const rdate = new Date(hire.getTime() + ROUND_OFFSET_DAYS[i] * 86400000)
        const diff = kstDiffDays(rdate, today)
        // D-day 도래(diff<=0) 또는 7일 이내(D-7~D-1) 또는 진행중 미완료 → 자동 펼침
        if (diff <= 7) { set.add(emp.id); break }
      }
    }
    return set
  }, [probEmps, evaluations, closures, kstDiffDays, today])

  const [expandedOverride, setExpandedOverride] = useState<Record<string, boolean>>({})

  const isExpanded = (empId: string): boolean => {
    if (expandedOverride[empId] !== undefined) return expandedOverride[empId]
    return autoExpanded.has(empId)
  }

  const toggleExpand = (empId: string) => {
    setExpandedOverride((prev) => ({ ...prev, [empId]: !isExpanded(empId) }))
  }

  if (probEmps.length === 0) {
    return <div className="p-8 text-center text-sm text-gray-500">표시할 직원이 없습니다.</div>
  }

  return (
    <div className="space-y-3">
      {probEmps.map((emp) => {
        const hire = emp.hire_date ? new Date(`${emp.hire_date}T00:00:00+09:00`) : null
        const endDate = hire ? new Date(hire.getTime() + 90 * 86400000) : null
        const empEvals = evaluations.filter((ev) => ev.employee_id === emp.id)
        const expanded = isExpanded(emp.id)

        // 부서명 (메인 + employee_teams 의 보조 팀)
        const deptNames: string[] = []
        if (emp.department_id) {
          const d = departments.find((d) => d.id === emp.department_id)
          if (d) deptNames.push(d.name)
        }
        const extraTeams = employeeTeams.filter((t) => t.employee_id === emp.id && t.department_id !== emp.department_id)
        for (const t of extraTeams) {
          const d = departments.find((d) => d.id === t.department_id)
          if (d) deptNames.push(d.name)
        }
        const deptLabel = deptNames.length > 0 ? deptNames.join(', ') : '-'

        // 활성 회차 + D-day 라벨 (헤더에 노출)
        let activeBadge: { label: string; color: string } | null = null
        if (hire) {
          for (let i = 0; i < STAGES.length; i++) {
            const stg = STAGES[i]
            const stageEvals = empEvals.filter((ev) => ev.stage === stg)
            const isClosed = closures.some((c) => c.employee_id === emp.id && c.stage === stg)
            if (stageEvals.length > 0 || isClosed) continue
            const rdate = new Date(hire.getTime() + ROUND_OFFSET_DAYS[i] * 86400000)
            const diff = kstDiffDays(rdate, today)
            const labelPrefix = `${i + 1}회차`
            if (diff < 0) activeBadge = { label: `${labelPrefix} D+${Math.abs(diff)} 초과`, color: 'bg-red-100 text-red-700 border-red-200' }
            else if (diff === 0) activeBadge = { label: `${labelPrefix} D-day`, color: 'bg-brand-100 text-brand-700 border-brand-300' }
            else if (diff <= 7) activeBadge = { label: `${labelPrefix} D-${diff}`, color: 'bg-amber-100 text-amber-700 border-amber-200' }
            else activeBadge = { label: `${labelPrefix} D-${diff}`, color: 'bg-gray-100 text-gray-600 border-gray-200' }
            break
          }
        }
        // 라이프사이클 상태 (정규직 전환/계약 종료)
        const isConverted = emp.probation_result === 'passed' || (emp.is_active !== false && emp.employment_type === 'full_time')
        const isFailed = emp.probation_result === 'failed'

        // 본인이 평가해야 할 셀 개수 (배지)
        const myRole = getDefaultEvaluatorRole(profile?.role)
        const myMenus = menuPermissions.find((m) => m.employee_id === profile?.id)?.allowed_menus || []
        const isProbationSelf = profile?.role === 'leader' && employees.find((e) => e.id === profile?.id)?.employment_type === 'probation'
        const leaderBlocked = profile?.role === 'leader' && (!myMenus.includes('/admin/probation') || isProbationSelf)
        const isLeaderOther = profile?.role === 'leader' && (!profile?.department_id || emp.department_id !== profile.department_id)
        let myTodoForEmp = 0
        if (profile?.id && isProbationEvaluator(profile?.role) && !leaderBlocked && !isLeaderOther && hire) {
          for (let i = 0; i < STAGES.length; i++) {
            const stg = STAGES[i]
            const rdate = new Date(hire.getTime() + ROUND_OFFSET_DAYS[i] * 86400000)
            const diff = kstDiffDays(rdate, today)
            if (diff > 0) continue
            if (closures.some((c) => c.employee_id === emp.id && c.stage === stg)) continue
            const stEvals = empEvals.filter((ev) => ev.stage === stg)
            const mine = stEvals.some((ev) => ev.evaluator_id === profile?.id && ev.evaluator_role === myRole)
            if (!mine) myTodoForEmp++
          }
        }

        return (
          <div
            key={emp.id}
            className={`border rounded-lg overflow-hidden ${myTodoForEmp > 0 ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-white'}`}
          >
            {/* 헤더 — 항상 표시, 탭으로 펼침 토글 */}
            <button
              type="button"
              onClick={() => toggleExpand(emp.id)}
              className="w-full px-3 py-3 flex items-start justify-between gap-2 hover:bg-gray-50 active:bg-gray-100 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-900">{emp.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${emp.employment_type === 'probation' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                    {EMPLOYMENT_TYPE_LABELS[emp.employment_type || ''] || emp.employment_type || '-'}
                  </span>
                  {myTodoForEmp > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-bold">
                      내 평가 {myTodoForEmp}건
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">
                  {deptLabel}{emp.job_title ? ` · ${emp.job_title}` : (emp.position ? ` · ${emp.position}` : '')}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  입사 {formatDate(hire)} · 수습종료 {formatDate(endDate)}
                </div>
                {activeBadge && !isConverted && !isFailed && (
                  <span className={`inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full border font-semibold ${activeBadge.color}`}>
                    {activeBadge.label}
                  </span>
                )}
                {isConverted && (
                  <span className="inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                    정규직 전환
                  </span>
                )}
                {isFailed && (
                  <span className="inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-semibold">
                    계약 종료
                  </span>
                )}
              </div>
              <div className="shrink-0 text-gray-400 pt-1">
                {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </button>

            {/* 펼침 영역 — 회차별 상세 */}
            {expanded && (
              <div className="border-t border-gray-100 px-3 py-2.5 space-y-2 bg-white">
                {STAGES.map((stg, i) => {
                  const stageLabel = STAGE_SHORT_LABEL[stg]
                  const stageEvals = empEvals.filter((ev) => ev.stage === stg)
                  const isClosed = closures.some((c) => c.employee_id === emp.id && c.stage === stg)
                  const rdate = hire ? new Date(hire.getTime() + ROUND_OFFSET_DAYS[i] * 86400000) : null
                  const diff = rdate ? kstDiffDays(rdate, today) : null
                  const isFuture = diff !== null && diff > 0
                  const isOverdue = diff !== null && diff < 0
                  const fullyDone = stageEvals.length > 0 && isStageFullyEvaluated(stageEvals, emp)
                  const reqs = getRequiredCountsFor(emp)
                  const requiredTotal = reqs.leader + reqs.executive + reqs.ceo

                  // 권한 체크 (테이블과 동일 로직)
                  const myAlreadyEvaluated = stageEvals.some(
                    (ev) => ev.evaluator_id === profile?.id && ev.evaluator_role === myRole
                  )
                  const probEnd = hire ? new Date(hire.getTime() + 90 * 86400000) : null
                  const probPeriodOver = !!probEnd && probEnd.getTime() < today.getTime()
                  const lifecycleSettled = emp.probation_result === 'passed'
                    || emp.probation_result === 'failed'
                    || emp.employment_type === 'full_time'
                    || emp.is_active === false
                    || probPeriodOver
                  const needsMyEval = !!profile?.id
                    && isProbationEvaluator(profile?.role)
                    && !isClosed
                    && !isFuture
                    && !!hire
                    && !isLeaderOther
                    && !leaderBlocked
                    && !myAlreadyEvaluated
                    && !lifecycleSettled
                  const isAdminLevel = profile?.role && ['admin','ceo','director','division_head'].includes(profile.role)
                  const reminderEligible = canSendProbationReminder(profile) && !!hire && !isFuture && !isClosed && !fullyDone && !lifecycleSettled
                  const canClick = !!hire && !isFuture && !isClosed && !lifecycleSettled && (stageEvals.length === 0 || needsMyEval || reminderEligible)
                  const canDeleteRole = profile?.role && ['admin','ceo','director','division_head'].includes(profile.role)

                  // 색상 결정
                  let bgClass = 'bg-gray-50 border-gray-200'
                  if (needsMyEval) bgClass = 'bg-blue-50 border-blue-300 ring-1 ring-blue-300'
                  else if (isClosed) bgClass = 'bg-gray-100 border-gray-200'
                  else if (fullyDone) bgClass = 'bg-emerald-50 border-emerald-200'
                  else if (stageEvals.length > 0) bgClass = 'bg-amber-50 border-amber-200'
                  else if (!isFuture && diff !== null && diff <= 0) bgClass = 'bg-brand-50 border-brand-300'
                  else if (isFuture) bgClass = 'bg-gray-50 border-gray-200 opacity-70'

                  // 상태 라벨
                  let statusLabel: React.ReactNode = null
                  if (isClosed) {
                    statusLabel = <span className="text-xs text-gray-500">관리자 마감</span>
                  } else if (stageEvals.length > 0) {
                    const avg = stageEvals.reduce((sum, ev) => sum + getTotalScore(ev.scores as Record<string, number>), 0) / stageEvals.length
                    statusLabel = (
                      <span className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold ${fullyDone ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {avg.toFixed(0)}점
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {fullyDone ? '완료' : `진행중 ${stageEvals.length}/${requiredTotal}`}
                        </span>
                      </span>
                    )
                  } else if (rdate) {
                    if (isOverdue) statusLabel = <span className="text-sm font-bold text-red-600">D+{Math.abs(diff!)} 초과</span>
                    else if (diff === 0) statusLabel = <span className="text-sm font-bold text-brand-700">D-day</span>
                    else if (diff! <= 7) statusLabel = <span className="text-sm font-semibold text-amber-600">D-{diff}</span>
                    else statusLabel = <span className="text-sm text-gray-500">D-{diff}</span>
                  } else {
                    statusLabel = <span className="text-sm text-gray-400">-</span>
                  }

                  return (
                    <div key={stg} className={`rounded-lg border ${bgClass} px-3 py-2.5`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-gray-800">{stageLabel}</span>
                            {rdate && <span className="text-[11px] text-gray-500">{formatDate(rdate)}</span>}
                            {needsMyEval && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-bold">내 평가</span>
                            )}
                            {isFuture && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">
                                <Lock className="h-3 w-3" /> 미도래
                              </span>
                            )}
                          </div>
                          <div className="mt-1">{statusLabel}</div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          {/* 평가 작성 / 독려 버튼 */}
                          {canClick && (
                            <Button
                              size="sm"
                              variant={needsMyEval ? 'primary' : 'outline'}
                              className="text-xs px-2 py-1 h-7"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (needsMyEval) {
                                  onOpenEval(emp.id, stg)
                                } else if (reminderEligible) {
                                  onOpenReminder(emp.id, emp.name, stg, stageLabel, diff ?? 0)
                                } else if (isOverdue && isAdminLevel) {
                                  onOpenCellAction(emp.id, emp.name, stg, stageLabel, true)
                                } else {
                                  onOpenEval(emp.id, stg)
                                }
                              }}
                            >
                              {needsMyEval ? '평가 작성' : reminderEligible ? '독려' : '열기'}
                            </Button>
                          )}
                          {/* 삭제 / 마감 취소 */}
                          {canDeleteRole && stageEvals.length > 0 && !isClosed && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onDeleteEvals(emp.id, stg, emp.name, stageLabel) }}
                              className="text-gray-300 hover:text-red-500 p-1"
                              title={`${emp.name} ${stageLabel} 평가 삭제`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                          {canDeleteRole && isClosed && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onReopenClosure(emp.id, stg, emp.name, stageLabel) }}
                              className="text-gray-300 hover:text-amber-500 p-1"
                              title="마감 취소"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* 통과/탈락 처리 — 수습중 탭 + 권한자만 */}
                {canSendProbationReminder(profile) && lifecycleTab === 'in_progress' && !isConverted && !isFailed && (
                  <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-gray-100 mt-2">
                    <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                      onClick={(e) => { e.stopPropagation(); onOpenLifecycle(emp.id, emp.name, 'passed') }}>
                      통과
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={(e) => { e.stopPropagation(); onOpenLifecycle(emp.id, emp.name, 'failed') }}>
                      탈락
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* 안내 — D-day/D-7 자동 펼침 */}
      <div className="text-[11px] text-gray-400 text-center pt-2 flex items-center justify-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        D-7 이내 직원 카드는 자동으로 펼쳐집니다. 카드 헤더를 탭해 접거나 펼칠 수 있어요.
      </div>
    </div>
  )
}
