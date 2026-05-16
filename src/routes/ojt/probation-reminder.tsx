import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { probationReminderEmail } from '@/lib/email-templates'
import { canSendProbationReminder } from '@/lib/probation-utils'
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

interface MenuPermissionRow {
  employee_id: string
  allowed_menus: string[]
}

const STAGES: ProbationStage[] = ['round1', 'round2', 'round3']
const STAGE_OFFSETS = [14, 42, 70] as const
const STAGE_LABELS: Record<ProbationStage, string> = {
  round1: '1회차',
  round2: '2회차',
  round3: '3회차',
}
const PROBATION_MENU_PATH = '/admin/probation'

interface MissingTarget {
  key: string
  empId: string
  empName: string
  empDeptId: string | null
  stage: ProbationStage
  stageLabel: string
  evaluatorId: string
  evaluatorName: string
  evaluatorEmail: string
  evaluatorRole: 'leader' | 'executive' | 'ceo'
  evaluatorPosition: string | null
  diffDays: number
}

const DEFAULT_EXTRA_MESSAGE = ''

export default function ProbationReminder() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [allEmployees, setAllEmployees] = useState<EmployeeRow[]>([])
  const [evaluations, setEvaluations] = useState<ProbationEvaluation[]>([])
  const [closures, setClosures] = useState<ClosureRow[]>([])
  const [menuPermissions, setMenuPermissions] = useState<MenuPermissionRow[]>([])

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [extraMessage, setExtraMessage] = useState(DEFAULT_EXTRA_MESSAGE)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<{ sent: number; failed: number; total: number } | null>(null)

  const isPrivileged = canSendProbationReminder(profile)

  useEffect(() => {
    if (!isPrivileged) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const [empRes, evalRes, closuresRes, mpRes] = await Promise.all([
        supabase.from('employees').select('id, name, email, department_id, hire_date, employment_type, position, role, is_active').eq('is_active', true).order('name'),
        supabase.from('probation_evaluations').select('*'),
        supabase.from('probation_round_closures').select('employee_id, stage'),
        supabase.from('menu_permissions').select('employee_id, allowed_menus'),
      ])
      if (cancelled) return
      setAllEmployees((empRes.data || []) as EmployeeRow[])
      setEvaluations((evalRes.data || []) as ProbationEvaluation[])
      setClosures((closuresRes.data || []) as ClosureRow[])
      setMenuPermissions((mpRes.data || []) as MenuPermissionRow[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [isPrivileged])

  // 활성 임원 수에 따른 필수 평가자 수
  const requiredCounts = useMemo(() => {
    const activeExecs = allEmployees.filter(
      (e) => ['executive', 'director', 'division_head'].includes(e.role || '') && e.is_active !== false
    ).length
    return { leader: 1, executive: Math.max(activeExecs, 1), ceo: 1 }
  }, [allEmployees])

  // 미평가자 계산
  const missingTargets = useMemo<MissingTarget[]>(() => {
    if (loading || allEmployees.length === 0) return []
    const today = new Date()
    const targets: MissingTarget[] = []

    const probationEmps = allEmployees.filter(
      (e) => e.employment_type === 'probation' || (e.position ?? '').includes('수습')
    )

    const permMap = new Map<string, string[]>()
    for (const mp of menuPermissions) permMap.set(mp.employee_id, mp.allowed_menus)
    const hasProbationPermission = (empId: string) => {
      const m = permMap.get(empId)
      return Array.isArray(m) && m.includes(PROBATION_MENU_PATH)
    }

    const activeExecutives = allEmployees.filter(
      (e) => ['executive', 'director', 'division_head'].includes(e.role || '') && e.is_active !== false
    )
    const activeCeo = allEmployees.filter((e) => e.role === 'ceo' && e.is_active !== false)
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
        if (closures.some((c) => c.employee_id === emp.id && c.stage === stage)) continue

        const stageEvals = evaluations.filter((ev) => ev.employee_id === emp.id && ev.stage === stage)
        // 예정일이 미래(diff > 0)인 회차는, 이미 평가가 시작된 경우에만 포함 (조기 평가 케이스)
        if (diff > 0 && stageEvals.length === 0) continue
        const leaderDone = stageEvals.filter((e) => e.evaluator_role === 'leader').length
        const execDone = stageEvals.filter((e) => e.evaluator_role === 'executive').length
        const ceoDone = stageEvals.filter((e) => e.evaluator_role === 'ceo').length
        if (
          leaderDone >= requiredCounts.leader &&
          execDone >= requiredCounts.executive &&
          ceoDone >= requiredCounts.ceo
        ) continue

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
          if (!evaluator.email) continue
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
            evaluatorPosition: evaluator.position || null,
            diffDays: diff,
          })
        }
      }
    }

    targets.sort((a, b) => {
      if (a.diffDays !== b.diffDays) return a.diffDays - b.diffDays
      return a.evaluatorName.localeCompare(b.evaluatorName)
    })
    return targets
  }, [loading, allEmployees, evaluations, closures, menuPermissions, requiredCounts])

  // 데이터 로드 후 기본 전체 선택
  useEffect(() => {
    if (!loading) setSelected(new Set(missingTargets.map((t) => t.key)))
  }, [loading, missingTargets])

  const groupedTargets = useMemo(() => {
    const map = new Map<string, { empName: string; stageLabel: string; diffDays: number; targets: MissingTarget[] }>()
    for (const t of missingTargets) {
      const k = `${t.empId}_${t.stage}`
      if (!map.has(k)) map.set(k, { empName: t.empName, stageLabel: t.stageLabel, diffDays: t.diffDays, targets: [] })
      map.get(k)!.targets.push(t)
    }
    return Array.from(map.entries())
  }, [missingTargets])

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function toggleAll() {
    if (selected.size === missingTargets.length) setSelected(new Set())
    else setSelected(new Set(missingTargets.map((t) => t.key)))
  }

  async function handleSendSample() {
    const sampleEmail = profile?.email || 'interohrigin.dev@gmail.com'
    setSending(true)
    const { subject, html } = probationReminderEmail({
      evaluatorName: '오영근',
      evaluatorRoleLabel: '대표',
      evaluatorPosition: '대표',
      employeeName: '김보미',
      stage: '1회차',
      diffDays: -3,
      customBodyText: extraMessage || '이번 주 금요일까지 평가 완료 부탁드립니다.',
    })
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: sampleEmail, subject: `[샘플] ${subject}`, html }),
      })
      if (res.ok) toast(`샘플 발송 완료: ${sampleEmail}`, 'success')
      else toast('샘플 발송 실패: API 오류', 'error')
    } catch (err) {
      toast('샘플 발송 실패: ' + (err instanceof Error ? err.message : '오류'), 'error')
    }
    setSending(false)
  }

  async function handleSend() {
    const toSend = missingTargets.filter((t) => selected.has(t.key))
    if (toSend.length === 0) return
    setSending(true)
    setProgress({ sent: 0, failed: 0, total: toSend.length })

    let sent = 0
    let failed = 0
    for (const target of toSend) {
      const roleLabel = target.evaluatorRole === 'leader' ? '리더' : target.evaluatorRole === 'executive' ? '임원' : '대표'
      const { subject, html } = probationReminderEmail({
        evaluatorName: target.evaluatorName,
        evaluatorRoleLabel: roleLabel,
        evaluatorPosition: target.evaluatorPosition,
        employeeName: target.empName,
        stage: target.stageLabel,
        diffDays: target.diffDays,
        customBodyText: extraMessage,
      })
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
    if (failed === 0) {
      toast(`${sent}건 알림 발송 완료`, 'success')
      navigate('/admin/probation')
    } else {
      toast(`${sent}건 발송 / ${failed}건 실패`, 'error')
    }
  }

  if (!isPrivileged) {
    return (
      <div className="p-8 text-center text-gray-500">
        이 페이지는 관리자만 접근할 수 있습니다.
      </div>
    )
  }
  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/probation')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> 수습 평가로
          </Button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail className="h-6 w-6 text-brand-600" /> 미평가자 알림 발송
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={handleSendSample} disabled={sending}>
          📧 본인에게 샘플 발송
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
        현재 평가가 진행되어야 하지만 아직 완료되지 않은 평가자 목록입니다. 선택한 평가자에게 이메일 알림이 발송됩니다.
        <div className="mt-1 font-semibold">
          전체 미평가 건수: {missingTargets.length}건 / 선택: {selected.size}건
        </div>
        <div className="mt-1 text-xs text-blue-700">
          ※ 리더 평가자는 메뉴 권한(설정 → 메뉴 권한 → "수습 평가") 부여된 사람만 자동 포함됩니다.
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">미평가 목록</CardTitle>
            {missingTargets.length > 0 && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={toggleAll} className="text-sm text-brand-600 hover:underline">
                  {selected.size === missingTargets.length ? '전체 해제' : '전체 선택'}
                </button>
                <span className="text-xs text-gray-500">{selected.size}/{missingTargets.length}</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {missingTargets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              현재 알림이 필요한 미평가 항목이 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {groupedTargets.map(([groupKey, group]) => (
                <div key={groupKey} className="py-3">
                  <div className="text-sm font-semibold text-gray-900 mb-2">
                    {group.empName} — {group.stageLabel}
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      group.diffDays < 0
                        ? 'bg-red-100 text-red-700'
                        : group.diffDays === 0
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}>
                      {group.diffDays < 0
                        ? `D+${Math.abs(group.diffDays)} 초과`
                        : group.diffDays === 0
                          ? 'D-day'
                          : `조기 진행중 (예정일 D-${group.diffDays})`}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
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
          )}
        </CardContent>
      </Card>

      {missingTargets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">이메일 내용</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-xs text-brand-800">
              제목·본문·평가 정보·CTA 버튼은 회사 톤앤매너 템플릿으로 자동 구성됩니다.
              아래 "추가 메시지" 칸에 평가자에게 특별히 전달할 내용이 있으면 입력해 주세요. (생략 가능)
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                추가 메시지 <span className="text-xs text-gray-500">(선택)</span>
              </label>
              <Textarea
                value={extraMessage}
                onChange={(e) => setExtraMessage(e.target.value)}
                disabled={sending}
                rows={5}
                placeholder="예: 이번 주 금요일까지 평가 완료 부탁드립니다."
                className="w-full text-sm"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {progress && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
          발송 진행: {progress.sent + progress.failed}/{progress.total}
          {progress.failed > 0 && <span className="text-red-600 ml-2">실패 {progress.failed}건</span>}
        </div>
      )}

      <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-6 px-6 py-3 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/admin/probation')} disabled={sending}>
          취소
        </Button>
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
  )
}
