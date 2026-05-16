import { useEffect, useMemo, useState } from 'react'
import { Mail, Loader2, AlertCircle } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import type { ProbationEvaluation, ProbationStage } from '@/types/employee-lifecycle'

interface EmployeeRow {
  id: string
  name: string
  email?: string | null
  department_id: string | null
  hire_date: string | null
  employment_type: string | null
  position: string | null
  role?: string | null
  is_active?: boolean | null
}

interface ClosureRow {
  employee_id: string
  stage: string
}

interface RequiredCounts {
  leader: number
  executive: number
  ceo: number
}

interface MenuPermissionRow {
  employee_id: string
  allowed_menus: string[]
}

interface EvaluationReminderDialogProps {
  open: boolean
  onClose: () => void
  /** 모든 활성 직원 (평가자 후보 + 수습 직원 모두 포함) */
  allEmployees: EmployeeRow[]
  evaluations: ProbationEvaluation[]
  closures: ClosureRow[]
  requiredCounts: RequiredCounts
  /** 메뉴 권한 — 리더는 /admin/probation 권한이 있어야 평가자로 인정 */
  menuPermissions: MenuPermissionRow[]
  /** 발송 후 호출 (예: toast 표시) */
  onAfterSend?: (sentCount: number, failedCount: number) => void
}

const PROBATION_MENU_PATH = '/admin/probation'

const STAGES: ProbationStage[] = ['round1', 'round2', 'round3']
const STAGE_OFFSETS = [14, 42, 70] as const
const STAGE_LABELS: Record<ProbationStage, string> = {
  round1: '1회차',
  round2: '2회차',
  round3: '3회차',
}

const ROLE_TO_EVALUATOR: Record<string, 'leader' | 'executive' | 'ceo' | null> = {
  leader: 'leader',
  executive: 'executive',
  director: 'executive',
  division_head: 'executive',
  ceo: 'ceo',
}

interface MissingTarget {
  key: string // {empId}_{stage}_{evaluatorId}
  empId: string
  empName: string
  empDeptId: string | null
  stage: ProbationStage
  stageLabel: string
  evaluatorId: string
  evaluatorName: string
  evaluatorEmail: string
  evaluatorRole: 'leader' | 'executive' | 'ceo'
  diffDays: number // D-day 기준 (음수: 초과)
}

const DEFAULT_SUBJECT = '[INTEROHRIGIN HR] 수습평가 진행 부탁드립니다'
const DEFAULT_BODY = `안녕하세요 {{evaluatorName}}님,

수습직원 {{employeeName}}님의 {{stage}} 평가가 아직 미완료 상태입니다.
{{dueText}}

평가 페이지에 로그인하시어 평가를 진행해 주시면 감사하겠습니다.
HR 시스템: https://interohrigin-hr2.pages.dev/ojt/probation

감사합니다.
— 인터오리진 HR 팀`

export function EvaluationReminderDialog({
  open,
  onClose,
  allEmployees,
  evaluations,
  closures,
  requiredCounts,
  menuPermissions,
  onAfterSend,
}: EvaluationReminderDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [emailSubject, setEmailSubject] = useState(DEFAULT_SUBJECT)
  const [emailBody, setEmailBody] = useState(DEFAULT_BODY)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<{ sent: number; failed: number; total: number } | null>(null)

  // 미평가자 계산
  const missingTargets = useMemo<MissingTarget[]>(() => {
    if (!open) return []
    const today = new Date()
    const targets: MissingTarget[] = []

    const probationEmps = allEmployees.filter(
      (e) => e.employment_type === 'probation' || (e.position ?? '').includes('수습')
    )

    // 메뉴 권한 매핑 (직원ID → 메뉴 path 배열)
    const permMap = new Map<string, string[]>()
    for (const mp of menuPermissions) {
      permMap.set(mp.employee_id, mp.allowed_menus)
    }
    const hasProbationPermission = (employeeId: string) => {
      const menus = permMap.get(employeeId)
      // 메뉴 권한이 명시적으로 설정된 경우만 체크 (미설정 = 권한 없음으로 간주)
      return Array.isArray(menus) && menus.includes(PROBATION_MENU_PATH)
    }

    // 각 역할별 활성 평가자 풀
    // 임원/대표는 자동 포함 (role이 명확)
    const activeExecutives = allEmployees.filter(
      (e) => ['executive', 'director', 'division_head'].includes(e.role || '') && e.is_active !== false
    )
    const activeCeo = allEmployees.filter((e) => e.role === 'ceo' && e.is_active !== false)
    // 리더는 추가 조건: 수습 상태 아님 + 수습평가 메뉴 권한 보유
    const activeLeaders = allEmployees.filter(
      (e) =>
        e.role === 'leader' &&
        e.is_active !== false &&
        e.employment_type !== 'probation' &&
        !(e.position ?? '').includes('수습') &&
        hasProbationPermission(e.id)
    )

    for (const emp of probationEmps) {
      if (!emp.hire_date) continue
      const hire = new Date(emp.hire_date)

      for (let i = 0; i < STAGES.length; i++) {
        const stage = STAGES[i]
        const stageDate = new Date(hire.getTime() + STAGE_OFFSETS[i] * 86400 * 1000)
        const diff = Math.ceil((stageDate.getTime() - today.getTime()) / 86400000)
        if (diff > 0) continue // 미도래
        if (closures.some((c) => c.employee_id === emp.id && c.stage === stage)) continue

        const stageEvals = evaluations.filter((ev) => ev.employee_id === emp.id && ev.stage === stage)

        // 회차 완료 여부 — 완료된 회차는 알림 대상에서 제외
        const leaderDone = stageEvals.filter((e) => e.evaluator_role === 'leader').length
        const execDone = stageEvals.filter((e) => e.evaluator_role === 'executive').length
        const ceoDone = stageEvals.filter((e) => e.evaluator_role === 'ceo').length
        if (
          leaderDone >= requiredCounts.leader &&
          execDone >= requiredCounts.executive &&
          ceoDone >= requiredCounts.ceo
        ) {
          continue
        }

        // 필요한 평가자 풀 결정
        const requiredLeaders = activeLeaders.filter((l) => l.department_id === emp.department_id)
        const requiredEvaluators: { evaluator: EmployeeRow; role: 'leader' | 'executive' | 'ceo' }[] = [
          ...requiredLeaders.map((l) => ({ evaluator: l, role: 'leader' as const })),
          ...activeExecutives.map((x) => ({ evaluator: x, role: 'executive' as const })),
          ...activeCeo.map((c) => ({ evaluator: c, role: 'ceo' as const })),
        ]

        for (const { evaluator, role } of requiredEvaluators) {
          const done = stageEvals.some(
            (ev) => ev.evaluator_id === evaluator.id && ev.evaluator_role === role
          )
          if (done) continue
          if (!evaluator.email) continue // 이메일 없는 평가자는 발송 불가
          targets.push({
            key: `${emp.id}_${stage}_${evaluator.id}`,
            empId: emp.id,
            empName: emp.name,
            empDeptId: emp.department_id,
            stage,
            stageLabel: STAGE_LABELS[stage],
            evaluatorId: evaluator.id,
            evaluatorName: evaluator.name,
            evaluatorEmail: evaluator.email,
            evaluatorRole: role,
            diffDays: diff,
          })
        }
      }
    }

    // 정렬: 초과(음수) 먼저 → 평가자 이름순
    targets.sort((a, b) => {
      if (a.diffDays !== b.diffDays) return a.diffDays - b.diffDays
      return a.evaluatorName.localeCompare(b.evaluatorName)
    })

    return targets
  }, [open, allEmployees, evaluations, closures, requiredCounts, menuPermissions])

  // 다이얼로그 열릴 때 기본 전체 선택
  useEffect(() => {
    if (open) {
      setSelected(new Set(missingTargets.map((t) => t.key)))
      setProgress(null)
    }
  }, [open, missingTargets])

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === missingTargets.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(missingTargets.map((t) => t.key)))
    }
  }

  function fillTemplate(target: MissingTarget): { subject: string; body: string } {
    const dueText = target.diffDays < 0
      ? `평가 기한이 ${Math.abs(target.diffDays)}일 초과되었습니다.`
      : target.diffDays === 0
        ? '오늘이 평가 기한입니다.'
        : `평가 기한까지 ${target.diffDays}일 남았습니다.`
    const replace = (s: string) =>
      s
        .replaceAll('{{evaluatorName}}', target.evaluatorName)
        .replaceAll('{{employeeName}}', target.empName)
        .replaceAll('{{stage}}', target.stageLabel)
        .replaceAll('{{dueText}}', dueText)
    return { subject: replace(emailSubject), body: replace(emailBody) }
  }

  async function handleSend() {
    const toSend = missingTargets.filter((t) => selected.has(t.key))
    if (toSend.length === 0) return
    setSending(true)
    setProgress({ sent: 0, failed: 0, total: toSend.length })

    let sent = 0
    let failed = 0
    for (const target of toSend) {
      const { subject, body } = fillTemplate(target)
      // 줄바꿈을 <br>로 변환한 단순 HTML
      const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6;">${body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')}</div>`
      try {
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: target.evaluatorEmail, subject, html }),
        })
        if (res.ok) sent++
        else failed++
      } catch {
        failed++
      }
      setProgress({ sent, failed, total: toSend.length })
    }
    setSending(false)
    onAfterSend?.(sent, failed)
    if (failed === 0) onClose()
  }

  // 그룹화: 직원×회차 단위
  const groupedTargets = useMemo(() => {
    const map = new Map<string, { empName: string; stageLabel: string; diffDays: number; targets: MissingTarget[] }>()
    for (const t of missingTargets) {
      const k = `${t.empId}_${t.stage}`
      if (!map.has(k)) {
        map.set(k, { empName: t.empName, stageLabel: t.stageLabel, diffDays: t.diffDays, targets: [] })
      }
      map.get(k)!.targets.push(t)
    }
    return Array.from(map.entries())
  }, [missingTargets])

  if (!open) return null

  return (
    <Dialog open={open} onClose={onClose} title="📧 미평가자에게 알림 발송" className="max-w-3xl">
      <div className="space-y-4">
        {/* 전체 진행 요약 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
          현재 평가가 진행되어야 하지만 아직 완료되지 않은 평가자 목록입니다. 선택한 평가자에게 이메일 알림이 발송됩니다.
          <div className="mt-1 font-semibold">
            전체 미평가 건수: {missingTargets.length}건 / 선택: {selected.size}건
          </div>
          <div className="mt-1 text-xs text-blue-700">
            ※ 리더 평가자는 메뉴 권한(설정 → 메뉴 권한 → "수습 평가") 부여된 사람만 자동 포함됩니다.
          </div>
        </div>

        {/* 미평가자 목록 */}
        {missingTargets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <AlertCircle className="h-10 w-10 mx-auto mb-2 text-gray-300" />
            현재 알림이 필요한 미평가 항목이 없습니다.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={toggleAll}
                className="text-sm text-brand-600 hover:underline"
              >
                {selected.size === missingTargets.length ? '전체 해제' : '전체 선택'}
              </button>
              <span className="text-xs text-gray-500">{selected.size}/{missingTargets.length} 선택됨</span>
            </div>

            <div className="border rounded-lg max-h-80 overflow-y-auto divide-y divide-gray-100">
              {groupedTargets.map(([groupKey, group]) => (
                <div key={groupKey} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-900">
                      {group.empName} — {group.stageLabel}
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                        group.diffDays < 0
                          ? 'bg-red-100 text-red-700'
                          : group.diffDays === 0
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {group.diffDays < 0 ? `D+${Math.abs(group.diffDays)} 초과` : group.diffDays === 0 ? 'D-day' : `D-${group.diffDays}`}
                      </span>
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {group.targets.map((t) => (
                      <li key={t.key} className="flex items-center gap-2 pl-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.has(t.key)}
                          onChange={() => toggle(t.key)}
                          disabled={sending}
                          className="h-4 w-4"
                        />
                        <span className="font-medium text-gray-700">{t.evaluatorName}</span>
                        <span className="text-xs text-gray-500">({t.evaluatorRole === 'leader' ? '리더' : t.evaluatorRole === 'executive' ? '임원' : '대표'})</span>
                        <span className="text-xs text-gray-400">{t.evaluatorEmail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* 이메일 템플릿 */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                이메일 제목 <span className="text-xs text-gray-500">(편집 가능)</span>
              </label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                disabled={sending}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <label className="block text-sm font-semibold text-gray-700">
                이메일 본문 <span className="text-xs text-gray-500">(치환자: {`{{evaluatorName}}, {{employeeName}}, {{stage}}, {{dueText}}`})</span>
              </label>
              <Textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                disabled={sending}
                rows={8}
                className="w-full text-sm font-mono"
              />
            </div>
          </>
        )}

        {/* 진행/결과 */}
        {progress && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
            발송 진행: {progress.sent + progress.failed}/{progress.total}
            {progress.failed > 0 && <span className="text-red-600 ml-2">실패 {progress.failed}건</span>}
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>닫기</Button>
          <Button
            onClick={handleSend}
            disabled={sending || selected.size === 0 || missingTargets.length === 0}
          >
            {sending
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 발송 중...</>
              : <><Mail className="h-4 w-4 mr-1" /> 선택한 {selected.size}명에게 알림 발송</>}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
