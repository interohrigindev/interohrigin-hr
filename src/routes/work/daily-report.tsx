import { useState, useEffect, useCallback, useMemo } from 'react'
import { CalendarDays, Sparkles, Save, ChevronLeft, ChevronRight, Send } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { RichEditor } from '@/components/ui/RichEditor'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature } from '@/lib/ai-client'
import { notifyApprovalSubmitted } from '@/lib/approval-notification'
import type { DailyReport, DailyReportTask, Task } from '@/types/work'

// PDCA #5 FR-08: 반복업무(recurring_task_occurrences) 당일 진행분을 일일보고에 반영.
// 전용 체크 화면(recurring-check)에서 done/in_progress 로 체크된 occurrence 를
// 일일보고 완료/진행 섹션에 "추가"한다. 기존 자동수집 source(task/update/todo)는 불변.
// occurrence.id 를 DailyReportTask.id 로 사용 → autoMergeTodayActivity dedupe/편집보존과 자연 호환.
interface RecurringDailyResult {
  done: DailyReportTask[]
  inProgress: DailyReportTask[]
}
async function fetchRecurringForDaily(employeeId: string, date: string): Promise<RecurringDailyResult> {
  try {
    const { data } = await supabase
      .from('recurring_task_occurrences')
      .select('id, status, note, recurring_tasks!inner(title)')
      .eq('assignee_id', employeeId)
      .eq('occurrence_date', date)
      .in('status', ['done', 'in_progress'])
    const rows = (data || []) as {
      id: string; status: string; note: string | null
      recurring_tasks: { title: string } | { title: string }[]
    }[]
    const done: DailyReportTask[] = []
    const inProgress: DailyReportTask[] = []
    for (const r of rows) {
      const tpl = Array.isArray(r.recurring_tasks) ? r.recurring_tasks[0] : r.recurring_tasks
      const title = `[반복] ${tpl?.title ?? '반복업무'}`
      const item: DailyReportTask = {
        id: r.id, title, status: r.status, note: r.note || undefined,
        project_name: '반복업무', project_id: null,
      }
      if (r.status === 'done') done.push(item)
      else inProgress.push(item)
    }
    return { done, inProgress }
  } catch {
    return { done: [], inProgress: [] }  // 실패해도 일일보고 본 흐름 무영향
  }
}

/* ─── TaskSection: 컴포넌트 외부 정의 (re-render 시 unmount 방지) ─── */
function TaskSection({
  title,
  tasks: sectionTasks,
  onAdd,
  onUpdate,
  onRemove,
  highlight,
  onImportFromProjects,
  importLoading,
}: {
  title: string
  tasks: DailyReportTask[]
  onAdd: () => void
  onUpdate: (idx: number, field: keyof DailyReportTask, value: string) => void
  onRemove: (idx: number) => void
  highlight?: boolean
  onImportFromProjects?: () => void
  importLoading?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className={`text-base ${highlight ? 'text-red-700' : ''}`}>{title}</CardTitle>
          <div className="flex items-center gap-1.5">
            {onImportFromProjects && (
              <Button
                size="sm"
                variant="outline"
                onClick={onImportFromProjects}
                disabled={importLoading}
                title="내가 담당한 프로젝트의 진행중 단계를 불러옵니다"
              >
                {importLoading ? '불러오는 중...' : '📁 프로젝트에서 가져오기'}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onAdd}>+ 추가</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sectionTasks.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">항목이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {sectionTasks.map((task, idx) => (
              <div
                key={task.id}
                className={`flex gap-2 items-start ${highlight ? 'bg-red-50 p-2 rounded-lg' : ''}`}
              >
                <Input
                  value={task.title}
                  onChange={(e) => onUpdate(idx, 'title', e.target.value)}
                  placeholder="작업 제목"
                  className="flex-1"
                  title={task.title}
                />
                <Input
                  value={task.note || ''}
                  onChange={(e) => onUpdate(idx, 'note', e.target.value)}
                  placeholder="메모"
                  className="w-24 sm:w-40"
                  title={task.note || ''}
                />
                <button
                  onClick={() => onRemove(idx)}
                  className="text-red-400 hover:text-red-600 text-sm mt-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// 0513: toISOString() 은 UTC 기준 → 한국(UTC+9) 에서 새벽 시간에 하루 밀리는 버그.
// 로컬 날짜 컴포넌트로 YYYY-MM-DD 생성.
function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function prevDay(date: string): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return formatDate(d)
}

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return formatDate(d)
}

// 0513: 오늘 이후(미래) 날짜로 이동 차단
function isFutureDate(date: string): boolean {
  return date > formatDate(new Date())
}

export default function DailyReportPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [importingProjects, setImportingProjects] = useState(false)

  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [report, setReport] = useState<DailyReport | null>(null)
  const [myTasks, setMyTasks] = useState<Task[]>([])

  // Editable report fields
  const [completed, setCompleted] = useState<DailyReportTask[]>([])
  const [inProgress, setInProgress] = useState<DailyReportTask[]>([])
  const [planned, setPlanned] = useState<DailyReportTask[]>([])
  const [carryover, setCarryover] = useState<DailyReportTask[]>([])
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null)
  const [satisfaction, setSatisfaction] = useState<number>(5)
  const [satisfactionComment, setSatisfactionComment] = useState('')
  const [blockers, setBlockers] = useState('')
  // 0512: 작업 현황 아래 자유 입력 메모
  const [workMemo, setWorkMemo] = useState('')
  // 0512: 프로젝트별 추가 메모 — { project_id: html }
  const [projectMemos, setProjectMemos] = useState<Record<string, string>>({})
  // 2026.05.19: 사용자가 이 보고서에서 숨긴 프로젝트 ID 목록 (내용 없는 프로젝트 숨기기)
  const [dismissedProjects, setDismissedProjects] = useState<Set<string>>(new Set())
  // 0512: 내가 속한 프로젝트 목록 (오늘 이벤트 유무 무관, 항상 노출)
  // 0513: + 파이프라인 단계 담당자로 지정된 경우도 포함, my_stages 메타로 내 담당 단계 표시
  const [myProjects, setMyProjects] = useState<{
    id: string
    project_name: string
    today_activity_count: number
    my_stages: { name: string; status: string }[]
    completed?: boolean
    completed_at?: string | null
  }[]>([])
  const [myProjectsLoading, setMyProjectsLoading] = useState(true)
  // 0512: 작업 현황 — 다시 불러오기 진행 표시
  const [refreshingCompleted, setRefreshingCompleted] = useState(false)

  // 0512: AI 우선순위 / TaskSection / 진행 중 등 UI 임시 숨김. state·함수는 향후 복원 위해 보존.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void [Sparkles, TaskSection, aiLoading, importingProjects, addTask, updateTask, removeTask, importInProgressFromProjects, handleAISuggestion, refreshCompletedFromProjects]

  // 결재 전송 다이얼로그
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false)
  // D1-7: 신청자 수동 결재자 지정 UI 제거 — 상태 미사용
  const [approvalSending, setApprovalSending] = useState(false)
  const [allEmployees, setAllEmployees] = useState<{ id: string; name: string; role: string; department_id: string | null }[]>([])
  // 이 보고서가 이미 결재 전송되었는지 체크
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  // 일일보고 결재선 템플릿 — 활성 전체 로드 후 신청자 부서 기반 매칭
  // (leave.tsx 54f435e 패턴 동일 — 부서별 템플릿 "일일업무보고 - 브랜드사업본부" 등 지원)
  interface DailyReportTemplateRow {
    id: string
    name: string
    department_id?: string | null
    team_id?: string | null
    steps: { role: string; label: string; approver_ids?: string[] }[]
  }
  const [reportTemplates, setReportTemplates] = useState<DailyReportTemplateRow[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string; parent_id: string | null }[]>([])

  // D2-4: OJT 진행 상황 (멘티인 경우)
  const [ojtInfo, setOjtInfo] = useState<{
    program_id: string
    program_name: string
    current_week: number
    total_weeks: number
    weekly_report_status: 'none' | 'draft' | 'submitted' | 'reviewed'
  } | null>(null)

  const employeeId = profile?.id

  // 결재선 선택용 직원 로드
  useEffect(() => {
    supabase.from('employees').select('id, name, role, department_id').eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setAllEmployees(data) })
  }, [])

  // 일일보고 결재선 템플릿 — 활성 전체 로드 (부서별 매칭은 reportTemplate 에서 처리)
  useEffect(() => {
    supabase.from('approval_templates')
      .select('id, name, department_id, team_id, steps')
      .eq('doc_type', 'daily_report')
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) setReportTemplates((data as unknown) as DailyReportTemplateRow[])
      })
  }, [])

  // 부서 계층 (본부 ↔ 팀 매칭용)
  useEffect(() => {
    supabase.from('departments').select('id, name, parent_id')
      .then(({ data }) => { if (data) setDepartments(data) })
  }, [])

  // 신청자 부서 기반 결재선 매칭 — 우선순위:
  //   1) team_id = 본인 팀  →  2) department_id = 본인 본부 (team_id NULL)  →  3) 둘 다 NULL (전체 fallback)
  // ⚠️ 4) 마지막 fallback 으로 reportTemplates[0] 을 반환하면 '다른 부서 템플릿'이 잡혀서
  //     관리자가 등록하지 않은 결재선이 노출되는 회귀 발생 (사용자 실보고) — null 반환으로 명시적 안내.
  const reportTemplate = useMemo<DailyReportTemplateRow | null>(() => {
    if (reportTemplates.length === 0) return null
    const me = allEmployees.find((e) => e.id === profile?.id)
    const myDeptId = me?.department_id || null
    const myDept = departments.find((d) => d.id === myDeptId)
    const myDivisionId = myDept?.parent_id || myDeptId

    const teamMatch = reportTemplates.filter((t) => t.team_id && t.team_id === myDeptId)
    if (teamMatch.length > 0) return teamMatch[0]
    const deptMatch = reportTemplates.filter((t) => t.department_id && t.department_id === myDivisionId && !t.team_id)
    if (deptMatch.length > 0) return deptMatch[0]
    const globalFallback = reportTemplates.filter((t) => !t.team_id && !t.department_id)
    if (globalFallback.length > 0) return globalFallback[0]
    // 본인 부서 매칭도 없고 전사 fallback 도 없으면 — 무작위 다른 부서 템플릿을 잡지 말고 null
    return null
  }, [reportTemplates, allEmployees, departments, profile?.id])

  // D2-4: 내 OJT 진행 상황 로드 (멘티인 경우)
  useEffect(() => {
    if (!profile?.id) return
    async function fetchOJT() {
      const { data: enrollment } = await supabase
        .from('ojt_enrollments')
        .select('program_id, started_at, status, ojt_programs!inner(name, duration_days)')
        .eq('employee_id', profile!.id)
        .in('status', ['enrolled', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!enrollment) { setOjtInfo(null); return }

      const rawProg = (enrollment as unknown as { ojt_programs: { name: string; duration_days: number } }).ojt_programs
      if (!rawProg) { setOjtInfo(null); return }

      const startDate = enrollment.started_at ? new Date(enrollment.started_at) : new Date()
      const now = new Date()
      const daysSince = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      const currentWeek = Math.max(1, Math.ceil((daysSince + 1) / 5))
      const totalWeeks = Math.max(1, Math.ceil(rawProg.duration_days / 5))

      // 이번 주차의 보고서 상태
      const { data: rpt } = await supabase
        .from('ojt_weekly_reports')
        .select('status')
        .eq('program_id', enrollment.program_id)
        .eq('mentee_id', profile!.id)
        .eq('week_number', currentWeek)
        .maybeSingle()

      setOjtInfo({
        program_id: enrollment.program_id,
        program_name: rawProg.name,
        current_week: currentWeek,
        total_weeks: totalWeeks,
        weekly_report_status: (rpt?.status as 'draft' | 'submitted' | 'reviewed' | undefined) || 'none',
      })
    }
    fetchOJT()
  }, [])

  // 0512: 내가 속한 모든 프로젝트 로드 — 이벤트 유무 무관, 항상 노출
  useEffect(() => {
    if (!employeeId) return
    let cancelled = false
    ;(async () => {
      setMyProjectsLoading(true)
      try {
        // 0512: 진행중(active) 프로젝트만 — 완료/홀딩/취소 제외
        // 0513: + 모든 stage 가 '완료' 인 active 프로젝트도 사실상 완료된 것으로 간주하여 제외
        //       (unified-dashboard.tsx 의 완료 판정 로직과 동일)
        // 0513-2: + 프로젝트 멤버가 아니어도 pipeline_stages.stage_assignee_ids 에 본인이 있으면 포함
        // 0528: 완료 프로젝트도 완료 시점 7일 이내면 노출 유지 → active + completed 모두 로드
        const { data: allProjects } = await supabase
          .from('project_boards')
          .select('id, project_name, assignee_ids, manager_id, leader_id, executive_id, status, updated_at')
          .in('status', ['active', 'completed'])
        if (cancelled) return

        // 1) 프로젝트 멤버로 참여 중인 active 프로젝트
        const memberProjects = (allProjects || []).filter((p: {
          assignee_ids?: string[] | null
          manager_id?: string | null
          leader_id?: string | null
          executive_id?: string | null
        }) =>
          (p.assignee_ids || []).includes(employeeId) ||
          p.manager_id === employeeId ||
          p.leader_id === employeeId ||
          p.executive_id === employeeId
        )

        // 2) 단계 담당자(stage_assignee_ids) 인 단계가 있는 active 프로젝트도 포함
        //    → 전체 active 프로젝트의 stages 한 번에 조회
        const allActiveIds = (allProjects || []).map((p: { id: string }) => p.id)
        let allStages: { project_id: string; stage_name: string; status: string; stage_assignee_ids: string[] | null; stage_order: number; completed_at: string | null }[] = []
        if (allActiveIds.length > 0) {
          const { data: stagesData } = await supabase
            .from('pipeline_stages')
            .select('project_id, stage_name, status, stage_assignee_ids, stage_order, completed_at')
            .in('project_id', allActiveIds)
          allStages = (stagesData || []) as typeof allStages
        }

        const stagesByProject = new Map<string, typeof allStages>()
        allStages.forEach((s) => {
          const arr = stagesByProject.get(s.project_id) ?? []
          arr.push(s)
          stagesByProject.set(s.project_id, arr)
        })

        // 단계 담당으로 잡힌 프로젝트 id 수집 (member 가 아니어도 포함)
        const stageOwnerProjectIds = new Set<string>()
        allStages.forEach((s) => {
          if ((s.stage_assignee_ids || []).includes(employeeId)) {
            stageOwnerProjectIds.add(s.project_id)
          }
        })

        // 3) 합집합 — 멤버 ∪ 단계담당자
        const candidateMap = new Map<string, { id: string; project_name: string }>()
        memberProjects.forEach((p: { id: string; project_name: string }) => candidateMap.set(p.id, { id: p.id, project_name: p.project_name }))
        ;(allProjects || []).forEach((p: { id: string; project_name: string }) => {
          if (stageOwnerProjectIds.has(p.id)) candidateMap.set(p.id, { id: p.id, project_name: p.project_name })
        })

        // 0528: 완료 판정 + 완료 시점 7일 이내만 노출 (unified-dashboard 완료 판정 동일)
        //   - 완료 판정: status='completed' 또는 모든 stage='완료'
        //   - 완료 시점: stage.completed_at 중 가장 늦은 값, 없으면 project_boards.updated_at
        //   - 완료 7일 경과 시 자동 숨김
        const projectMetaById = new Map<string, { status: string; updated_at: string | null }>()
        ;(allProjects || []).forEach((p: { id: string; status: string; updated_at: string | null }) =>
          projectMetaById.set(p.id, { status: p.status, updated_at: p.updated_at })
        )
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
        const nowMs = Date.now()

        const mine: { id: string; project_name: string; my_stages: { name: string; status: string }[]; completed: boolean; completed_at: string | null }[] = []
        for (const [pid, info] of candidateMap) {
          const stages = stagesByProject.get(pid) ?? []
          const meta = projectMetaById.get(pid)
          const allStagesDone = stages.length > 0 && stages.every((s) => s.status === '완료')
          const isCompleted = meta?.status === 'completed' || allStagesDone

          let completedAt: string | null = null
          if (isCompleted) {
            const stageDates = stages.map((s) => s.completed_at).filter((d): d is string => !!d)
            completedAt = stageDates.length > 0
              ? stageDates.reduce((a, b) => (a > b ? a : b))
              : (meta?.updated_at ?? null)
            // 완료 시점 미상 또는 7일 경과 → 숨김
            const ts = completedAt ? new Date(completedAt).getTime() : 0
            if (!completedAt || nowMs - ts > SEVEN_DAYS_MS) continue
          }

          // 본인이 담당으로 지정된 stage 만 my_stages 로 노출 (완료 단계 포함, 정렬 유지)
          const my_stages = stages
            .filter((s) => (s.stage_assignee_ids || []).includes(employeeId))
            .sort((a, b) => a.stage_order - b.stage_order)
            .map((s) => ({ name: s.stage_name, status: s.status }))
          mine.push({ id: pid, project_name: info.project_name, my_stages, completed: isCompleted, completed_at: completedAt })
        }

        // 정렬: 진행중 우선 → 내 단계가 있는 프로젝트 우선 → 프로젝트명 (완료는 맨 아래)
        mine.sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1
          if ((a.my_stages.length > 0) !== (b.my_stages.length > 0)) {
            return a.my_stages.length > 0 ? -1 : 1
          }
          return a.project_name.localeCompare(b.project_name, 'ko')
        })

        setMyProjects(mine.map((p) => ({
          id: p.id,
          project_name: p.project_name,
          today_activity_count: 0,
          my_stages: p.my_stages,
          completed: p.completed,
          completed_at: p.completed_at,
        })))
      } finally {
        if (!cancelled) setMyProjectsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [employeeId])

  // 현재 보고서가 이미 결재 전송되었는지 체크
  useEffect(() => {
    if (!report?.id) { setAlreadySubmitted(false); return }
    supabase.from('approval_documents')
      .select('id')
      .like('title', `%${selectedDate}%`)
      .eq('requester_id', profile?.id || '')
      .in('doc_type', ['daily_report', 'general'])
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setAlreadySubmitted(!!data))
  }, [report?.id, selectedDate, profile?.id])

  const fetchData = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)

    // Fetch existing report for the selected date
    const { data: existingReport } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('report_date', selectedDate)
      .limit(1)
      .maybeSingle()

    // Fetch employee's tasks
    const { data: taskData } = await supabase
      .from('tasks')
      .select('*')
      .eq('assignee_id', employeeId)
      .order('sort_order', { ascending: true })

    if (taskData) setMyTasks(taskData as Task[])

    if (existingReport) {
      const r = existingReport as DailyReport
      setReport(r)
      setCompleted(r.tasks_completed || [])
      setInProgress(r.tasks_in_progress || [])
      setPlanned(r.tasks_planned || [])
      setCarryover(r.carryover_tasks || [])
      setAiSuggestion(r.ai_priority_suggestion)
      setSatisfaction(r.satisfaction_score ?? 5)
      setSatisfactionComment(r.satisfaction_comment || '')
      setBlockers(r.blockers || '')
      setWorkMemo(((r as unknown) as { work_memo?: string }).work_memo || '')
      setProjectMemos(((r as unknown) as { project_memos?: Record<string, string> }).project_memos || {})
      // 099: 해당 보고서에서 제외된 프로젝트 ID 복원
      const excluded = ((r as unknown) as { excluded_projects?: string[] }).excluded_projects || []
      setDismissedProjects(new Set(excluded))
      // 기존 보고서가 있어도 오늘 활동을 머지해서 자동 노출 (편집한 내용은 보존)
      autoMergeTodayActivity(r.tasks_completed || [])
    } else {
      setReport(null)
      setSatisfaction(5)
      setSatisfactionComment('')
      setBlockers('')
      setWorkMemo('')
      setProjectMemos({})
      setDismissedProjects(new Set())
      setAiSuggestion(null)

      // ─── 금일 프로젝트 활동 자동 수집 ─────────────────
      const todayStart = `${selectedDate}T00:00:00`
      const todayEnd = `${selectedDate}T23:59:59`

      // 1) 오늘의 project_updates (내가 작성한 업데이트)
      const { data: todayUpdates } = await supabase
        .from('project_updates')
        .select('*, project_id')
        .eq('author_id', employeeId)
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd)
        .order('created_at')

      // 2) 오늘의 pipeline_stages 변경 (내가 작성한 상태변경 로그)
      const stageChanges = (todayUpdates || []).filter(
        (u: { status_changed_to: string | null }) => u.status_changed_to
      )

      // 3) 오늘 완료된 내 작업
      const { data: todayDoneTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('assignee_id', employeeId)
        .eq('status', 'done')
        .gte('updated_at', todayStart)
        .lte('updated_at', todayEnd)

      // 4) 현재 진행중인 내 작업
      const { data: currentInProgress } = await supabase
        .from('tasks')
        .select('*')
        .eq('assignee_id', employeeId)
        .eq('status', 'in_progress')

      // 프로젝트 이름 매핑용
      const projectIds = [...new Set((todayUpdates || []).map((u: { project_id: string }) => u.project_id))]
      let projectNames: Record<string, string> = {}
      if (projectIds.length > 0) {
        const { data: projData } = await supabase
          .from('project_boards')
          .select('id, project_name')
          .in('id', projectIds)
        if (projData) {
          projectNames = Object.fromEntries(projData.map((p: { id: string; project_name: string }) => [p.id, p.project_name]))
        }
      }

      // ─── 완료 섹션 자동 채우기 (프로젝트 메타데이터 보존) ─────────
      const autoCompleted: DailyReportTask[] = []

      // 완료된 작업 — 프로젝트와 무관한 일반 task. project_id 비움.
      for (const t of (todayDoneTasks || []) as Task[]) {
        autoCompleted.push({
          id: t.id,
          title: t.title,
          status: 'done',
          project_id: null,
          project_name: null,
        })
      }

      // 스테이지 상태 변경 — project_id 보존
      for (const u of stageChanges as { id: string; content: string; project_id: string }[]) {
        autoCompleted.push({
          id: u.id,
          title: u.content,
          status: 'done',
          project_id: u.project_id,
          project_name: projectNames[u.project_id] || null,
        })
      }

      // 일반 업데이트 (상태변경 아닌 것) — project_id 보존
      const regularUpdates = (todayUpdates || []).filter(
        (u: { status_changed_to: string | null }) => !u.status_changed_to
      )
      for (const u of regularUpdates as { id: string; content: string; project_id: string }[]) {
        // HTML 태그 제거하여 텍스트만 추출
        const plainText = u.content.replace(/<[^>]*>/g, '').trim().slice(0, 200)
        if (plainText) {
          autoCompleted.push({
            id: u.id,
            title: plainText,
            status: 'done',
            project_id: u.project_id,
            project_name: projectNames[u.project_id] || null,
          })
        }
      }

      setCompleted(autoCompleted)

      // ─── 진행중 섹션 자동 채우기 ───────────────────────
      // 진행중 작업의 프로젝트 이름도 가져오기
      const inProgressBoardIds = [...new Set((currentInProgress || []).filter((t: Task) => t.linked_board_id).map((t: Task) => t.linked_board_id))]
      let inProgressProjectNames: Record<string, string> = {}
      if (inProgressBoardIds.length > 0) {
        const { data: ipProjData } = await supabase.from('project_boards').select('id, project_name').in('id', inProgressBoardIds)
        if (ipProjData) inProgressProjectNames = Object.fromEntries(ipProjData.map((p: { id: string; project_name: string }) => [p.id, p.project_name]))
      }

      const autoInProgress: DailyReportTask[] = (currentInProgress || []).map((t: Task) => {
        const projName = t.linked_board_id ? inProgressProjectNames[t.linked_board_id] : null
        return {
          id: t.id,
          title: projName ? `[${projName}] ${t.title}` : t.title,
          status: 'in_progress' as const,
        }
      })
      setInProgress(autoInProgress)

      // ─── 이월/계획 ────────────────────────────────────
      // Load carryover from yesterday's uncompleted tasks
      const yesterday = prevDay(selectedDate)
      const { data: yesterdayReport } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('report_date', yesterday)
        .limit(1)
        .maybeSingle()

      if (yesterdayReport) {
        const yr = yesterdayReport as DailyReport
        const carry = [
          ...(yr.tasks_in_progress || []),
          ...(yr.tasks_planned || []).filter((t) => t.status !== 'done'),
        ]
        setCarryover(carry)
      } else {
        setCarryover([])
      }

      // 계획 섹션: todo 상태 작업 자동 채우기
      const { data: todoTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('assignee_id', employeeId)
        .eq('status', 'todo')
        .order('due_date')
        .limit(10)
      const autoPlanned: DailyReportTask[] = (todoTasks || []).map((t: Task) => ({
        id: t.id,
        title: t.title,
        status: 'todo' as const,
      }))
      setPlanned(autoPlanned)
    }

    setLoading(false)
  }, [employeeId, selectedDate])

  useEffect(() => { fetchData() }, [fetchData])

  // PDCA #5 FR-08: 반복업무 당일 진행분을 일일보고 완료/진행 섹션에 추가 (append only).
  // 별도 effect 로 loading=false 이후 실행 — fetchData + autoMergeTodayActivity(비동기 setCompleted,
  // full-replace)가 모두 정착한 뒤 동작해 덮어쓰기 race 회피. 기존 source 코드는 불변.
  // id 중복 시 기존 항목 우선(편집 보존), 반복분은 누락분만 추가.
  useEffect(() => {
    if (loading || !employeeId) return
    let cancelled = false
    ;(async () => {
      const recurring = await fetchRecurringForDaily(employeeId, selectedDate)
      if (cancelled) return
      if (recurring.done.length > 0) {
        setCompleted((prev) => {
          const ids = new Set(prev.map((t) => t.id))
          const add = recurring.done.filter((t) => !ids.has(t.id))
          return add.length > 0 ? [...prev, ...add] : prev
        })
      }
      if (recurring.inProgress.length > 0) {
        setInProgress((prev) => {
          const ids = new Set(prev.map((t) => t.id))
          const add = recurring.inProgress.filter((t) => !ids.has(t.id))
          return add.length > 0 ? [...prev, ...add] : prev
        })
      }
    })()
    return () => { cancelled = true }
  }, [loading, employeeId, selectedDate])

  // Add task to section
  function addTask(
    setter: React.Dispatch<React.SetStateAction<DailyReportTask[]>>,
    projectId?: string | null,
    projectName?: string | null,
  ) {
    setter((prev) => [...prev, {
      id: crypto.randomUUID(),
      title: '',
      status: 'todo',
      project_id: projectId ?? null,
      project_name: projectName ?? null,
    }])
  }

  // 0512: 오늘의 프로젝트 활동을 자동으로 머지 — 기존 보고서가 있어도 새 활동 자동 표출
  async function autoMergeTodayActivity(existingCompleted: DailyReportTask[]) {
    if (!employeeId) return
    try {
      const todayStart = `${selectedDate}T00:00:00`
      const todayEnd = `${selectedDate}T23:59:59`
      const { data: todayUpdates } = await supabase
        .from('project_updates').select('*')
        .eq('author_id', employeeId).gte('created_at', todayStart).lte('created_at', todayEnd)
      const { data: todayDoneTasks } = await supabase
        .from('tasks').select('*')
        .eq('assignee_id', employeeId).eq('status', 'done')
        .gte('completed_at', todayStart).lte('completed_at', todayEnd)
      const stageChanges = (todayUpdates || []).filter(
        (u: { status_changed_to: string | null }) => u.status_changed_to
      ) as { id: string; content: string; project_id: string }[]
      const projectIds = [...new Set((todayUpdates || []).map((u: { project_id: string }) => u.project_id))]
      let projectNames: Record<string, string> = {}
      if (projectIds.length > 0) {
        const { data: projData } = await supabase
          .from('project_boards').select('id, project_name').in('id', projectIds)
        if (projData) projectNames = Object.fromEntries(projData.map((p: { id: string; project_name: string }) => [p.id, p.project_name]))
      }
      const fresh: DailyReportTask[] = []
      for (const t of (todayDoneTasks || []) as Task[]) {
        fresh.push({ id: t.id, title: t.title, status: 'done', project_id: null, project_name: null })
      }
      for (const u of stageChanges) {
        fresh.push({ id: u.id, title: u.content, status: 'done', project_id: u.project_id, project_name: projectNames[u.project_id] || null })
      }
      const regular = (todayUpdates || []).filter(
        (u: { status_changed_to: string | null }) => !u.status_changed_to
      ) as { id: string; content: string; project_id: string }[]
      for (const u of regular) {
        const plain = u.content.replace(/<[^>]*>/g, '').trim().slice(0, 200)
        if (!plain) continue
        fresh.push({ id: u.id, title: plain, status: 'done', project_id: u.project_id, project_name: projectNames[u.project_id] || null })
      }
      // 기존 편집 보존 (id 일치 → 사용자 title 우선)
      const freshIds = new Set(fresh.map((t) => t.id))
      const userAdded = existingCompleted.filter((t) => !freshIds.has(t.id))
      const existingMap = new Map(existingCompleted.map((t) => [t.id, t]))
      const merged = fresh.map((t) => {
        const ex = existingMap.get(t.id)
        if (ex && ex.title && ex.title !== t.title) return { ...t, title: ex.title, note: ex.note }
        return ex ? { ...t, note: ex.note } : t
      })
      setCompleted([...merged, ...userAdded])
    } catch {
      // 실패시 silently — 기존 데이터는 그대로
    }
  }

  // 0512: 작업 현황 — 프로젝트에서 다시 불러오기 (수동 트리거)
  async function refreshCompletedFromProjects() {
    if (!employeeId) return
    setRefreshingCompleted(true)
    try {
      const todayStart = `${selectedDate}T00:00:00`
      const todayEnd = `${selectedDate}T23:59:59`

      const { data: todayUpdates } = await supabase
        .from('project_updates')
        .select('*')
        .eq('author_id', employeeId)
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd)

      const { data: todayDoneTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('assignee_id', employeeId)
        .eq('status', 'done')
        .gte('completed_at', todayStart)
        .lte('completed_at', todayEnd)

      const stageChanges = (todayUpdates || []).filter(
        (u: { status_changed_to: string | null }) => u.status_changed_to
      ) as { id: string; content: string; project_id: string }[]

      const projectIds = [...new Set((todayUpdates || []).map((u: { project_id: string }) => u.project_id))]
      let projectNames: Record<string, string> = {}
      if (projectIds.length > 0) {
        const { data: projData } = await supabase
          .from('project_boards')
          .select('id, project_name')
          .in('id', projectIds)
        if (projData) {
          projectNames = Object.fromEntries(
            projData.map((p: { id: string; project_name: string }) => [p.id, p.project_name])
          )
        }
      }

      // 새 task 목록 빌드
      const fresh: DailyReportTask[] = []
      for (const t of (todayDoneTasks || []) as Task[]) {
        fresh.push({ id: t.id, title: t.title, status: 'done', project_id: null, project_name: null })
      }
      for (const u of stageChanges) {
        fresh.push({
          id: u.id, title: u.content, status: 'done',
          project_id: u.project_id, project_name: projectNames[u.project_id] || null,
        })
      }
      const regular = (todayUpdates || []).filter(
        (u: { status_changed_to: string | null }) => !u.status_changed_to
      ) as { id: string; content: string; project_id: string }[]
      for (const u of regular) {
        const plain = u.content.replace(/<[^>]*>/g, '').trim().slice(0, 200)
        if (!plain) continue
        fresh.push({
          id: u.id, title: plain, status: 'done',
          project_id: u.project_id, project_name: projectNames[u.project_id] || null,
        })
      }

      // 기존에 사용자가 직접 추가/편집한 항목 보존 (id 기준 dedupe)
      const freshIds = new Set(fresh.map((t) => t.id))
      const userAdded = completed.filter((t) => !freshIds.has(t.id))
      // 기존 편집 내용 보존: 같은 id 인 경우 사용자 편집한 title 우선
      const existingMap = new Map(completed.map((t) => [t.id, t]))
      const merged = fresh.map((t) => {
        const ex = existingMap.get(t.id)
        if (ex && ex.title && ex.title !== t.title) {
          return { ...t, title: ex.title, note: ex.note }
        }
        return ex ? { ...t, note: ex.note } : t
      })
      setCompleted([...merged, ...userAdded])
      toast(`${fresh.length}개 항목 새로 불러왔습니다.`, 'success')
    } catch (err: unknown) {
      toast('불러오기 실패: ' + (err instanceof Error ? err.message : '오류'), 'error')
    } finally {
      setRefreshingCompleted(false)
    }
  }

  // C6: 내가 담당한 프로젝트의 "진행중" 단계들을 일일보고 "진행 중 작업"으로 가져오기
  async function importInProgressFromProjects() {
    if (!profile?.id) return
    setImportingProjects(true)
    try {
      // 1) 내가 assignee 인 프로젝트
      const { data: myProjects } = await supabase
        .from('project_boards')
        .select('id, project_name')
        .contains('assignee_ids', [profile.id])
        .in('status', ['active', 'planning'])

      if (!myProjects || myProjects.length === 0) {
        toast('담당 프로젝트가 없습니다.', 'info')
        setImportingProjects(false)
        return
      }

      // 2) 그 프로젝트들의 "진행중" 단계
      const projectIds = myProjects.map((p) => p.id)
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('project_id, stage_name, status, stage_assignee_ids')
        .in('project_id', projectIds)
        .eq('status', '진행중')

      // 3) 단계 필터 — 정책:
      //    (a) stage_assignee_ids 에 본인이 명시적으로 포함된 경우 → 포함
      //    (b) stage_assignee_ids 가 NULL/빈 배열 → 프로젝트 전체 담당이 수행 → 본인도 포함
      //        (이미 project_boards.assignee_ids 에 본인이 들어가 있음이 1)에서 보장됨)
      //    (c) 다른 사람 이름만 들어 있으면 제외
      const myStages = (stages || []).filter((s) => {
        const ids = (s.stage_assignee_ids || []) as string[]
        if (!ids || ids.length === 0) return true  // 단계별 담당자 미지정 → 프로젝트 담당자 전체
        return ids.includes(profile.id)
      })

      if (myStages.length === 0) {
        toast('진행중 단계가 없습니다.', 'info')
        setImportingProjects(false)
        return
      }

      const projectNameMap = new Map(myProjects.map((p) => [p.id, p.project_name as string]))

      // 4) 기존 진행중 작업 title 목록 (중복 방지)
      const existingTitles = new Set(inProgress.map((t) => t.title.trim().toLowerCase()))

      // 긴 제목 처리: 단계명이 기본 title, 프로젝트명이 길면 note로 분리
      const STAGE_LABEL_LIMIT = 60
      const newTasks: DailyReportTask[] = []
      for (const s of myStages) {
        const projName = projectNameMap.get(s.project_id) || '프로젝트'
        const combined = `[${projName}] ${s.stage_name}`
        let title: string
        let note: string
        if (combined.length <= STAGE_LABEL_LIMIT) {
          title = combined
          note = ''
        } else {
          // 프로젝트명이 길면 단계명만 title, 프로젝트명은 note로
          title = s.stage_name
          note = projName
        }
        const dedupeKey = `${projName}|${s.stage_name}`.toLowerCase()
        if (existingTitles.has(dedupeKey)) continue
        existingTitles.add(dedupeKey)
        // 기존 title 중복 체크 (동일 text 이미 있는 경우)
        if (existingTitles.has(title.trim().toLowerCase())) continue
        newTasks.push({
          id: crypto.randomUUID(),
          title,
          status: 'in_progress' as const,
          note,
        })
      }

      if (newTasks.length === 0) {
        toast('이미 모두 추가되어 있습니다.', 'info')
      } else {
        setInProgress((prev) => [...prev, ...newTasks])
        toast(`${newTasks.length}개 단계를 불러왔습니다.`, 'success')
      }
    } catch (err: unknown) {
      toast('불러오기 실패: ' + (err instanceof Error ? err.message : '오류'), 'error')
    }
    setImportingProjects(false)
  }

  function updateTask(
    setter: React.Dispatch<React.SetStateAction<DailyReportTask[]>>,
    idx: number,
    field: keyof DailyReportTask,
    value: string
  ) {
    setter((prev) => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t))
  }

  function removeTask(
    setter: React.Dispatch<React.SetStateAction<DailyReportTask[]>>,
    idx: number
  ) {
    setter((prev) => prev.filter((_, i) => i !== idx))
  }

  // AI Priority suggestion
  async function handleAISuggestion() {
    setAiLoading(true)
    try {
      const config = await getAIConfigForFeature('daily_report')

      if (!config) {
        toast('AI 설정이 필요합니다.', 'error')
        setAiLoading(false)
        return
      }

      // ─── 실제 업무 데이터 수집 ───────────────────────────
      // 1) 담당 프로젝트 + 파이프라인 단계
      const { data: myProjects } = await supabase
        .from('project_boards')
        .select('id, project_name, status, priority, launch_date')
        .contains('assignee_ids', [employeeId])
        .in('status', ['active', 'planning'])
        .order('priority')

      let projectContext = ''
      if (myProjects && myProjects.length > 0) {
        const projectIds = myProjects.map((p) => p.id)
        const { data: stages } = await supabase
          .from('pipeline_stages')
          .select('project_id, stage_name, status, deadline')
          .in('project_id', projectIds)
          .neq('status', '완료')
          .order('stage_order')

        const today = new Date(selectedDate)
        const stagesByProject = new Map<string, string[]>()
        for (const s of (stages || [])) {
          const lines = stagesByProject.get(s.project_id) || []
          const deadline = s.deadline ? new Date(s.deadline) : null
          const isOverdue = deadline && deadline < today
          const daysLeft = deadline ? Math.ceil((deadline.getTime() - today.getTime()) / 86400000) : null
          let deadlineInfo = ''
          if (isOverdue) deadlineInfo = ` ⚠️ D+${Math.abs(daysLeft!)}일 지연`
          else if (daysLeft !== null && daysLeft <= 3) deadlineInfo = ` (D-${daysLeft}일)`
          else if (s.deadline) deadlineInfo = ` (마감: ${s.deadline})`
          lines.push(`  - [${s.status}] ${s.stage_name}${deadlineInfo}`)
          stagesByProject.set(s.project_id, lines)
        }

        projectContext = myProjects.map((p) => {
          const stageLines = stagesByProject.get(p.id)?.join('\n') || '  - (진행중 단계 없음)'
          return `📁 ${p.project_name} (우선순위: ${p.priority}, 출시: ${p.launch_date || '미정'})\n${stageLines}`
        }).join('\n\n')
      }

      // 2) 할당된 작업
      const myTasksText = myTasks
        .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
        .map((t) => `- [${t.priority}] ${t.title} (마감: ${t.due_date || '없음'}, 상태: ${t.status})`)
        .join('\n')

      // 3) 이월 작업
      const carryoverText = carryover.map((t) => `- ${t.title}`).join('\n')

      // 4) 오늘 이미 완료한 항목
      const completedText = completed.map((t) => `- ${t.title}`).join('\n')

      // ─── 프롬프트 구성 ──────────────────────────────────
      const prompt = `오늘(${selectedDate}) 업무 우선순위를 제안해주세요.

## 담당 프로젝트 및 파이프라인 현황
${projectContext || '담당 프로젝트 없음'}

## 할당된 작업
${myTasksText || '없음'}

## 어제 이월(미완료) 작업
${carryoverText || '없음'}

## 오늘 이미 완료한 항목
${completedText || '아직 없음'}

---
위 데이터를 분석하여 다음 형식으로 우선순위를 제안해주세요:
1. 지연된 단계나 마감 임박 작업을 최우선으로 배치
2. 각 항목에 프로젝트명/작업명을 구체적으로 명시
3. 이미 완료한 항목은 제외
4. 5줄 이내로 간결하게 작성
5. 데이터가 없는 경우 "등록된 프로젝트/작업이 없습니다. 프로젝트 보드에서 작업을 추가해주세요."라고 안내`

      const result = await generateAIContent(config, prompt)
      setAiSuggestion(result.content)
    } catch (err: any) {
      toast('AI 오류: ' + err.message, 'error')
    }
    setAiLoading(false)
  }

  // Save report
  async function handleSave() {
    if (!employeeId) return
    setSaving(true)

    const commentText = satisfactionComment.trim()

    // 한 줄 총평 AI 요약 — 저장 시 1회 생성, 동일 텍스트면 재호출 스킵(토큰 절약).
    // 결재자는 저장된 요약을 그대로 표시(반복 AI 호출 없음).
    let nextAiSummary: { work: string[]; personal: string[] } | null = null
    let nextAiSummarySource: string | null = null
    const prevSource = (report as { ai_summary_source?: string | null } | null)?.ai_summary_source ?? null
    const prevSummary = (report as { ai_summary?: { work?: string[]; personal?: string[] } | null } | null)?.ai_summary ?? null

    if (!commentText) {
      // 총평 비어있으면 요약 클리어
      nextAiSummary = null
      nextAiSummarySource = null
    } else if (commentText.length < 80) {
      // 너무 짧으면 굳이 요약 안 함
      nextAiSummary = null
      nextAiSummarySource = commentText
    } else if (prevSource === commentText && prevSummary && (prevSummary.work?.length || prevSummary.personal?.length)) {
      // 직전 요약과 같은 본문 — 재호출 스킵, 기존 값 유지
      nextAiSummary = { work: prevSummary.work || [], personal: prevSummary.personal || [] }
      nextAiSummarySource = prevSource
    } else {
      // 새로 요약 (실패해도 저장은 진행 — 다음 저장 때 재시도)
      try {
        const cfg = await getAIConfigForFeature('daily_report')
        if (cfg) {
          const sumPrompt = `아래는 직원이 일일 업무보고서에 작성한 "한 줄 총평" 원문입니다.\n결재자가 빠르게 파악하도록 정리된 짧은 문장 리스트로 분리해 주세요.\n\n[원문]\n${commentText}\n\n[요구사항]\n1) 업무내용(work): 오늘 한 일/성과/이슈를 사실 위주 짧은 문장 2~4개 (한 문장 30자 내외, 종결 어미 포함)\n2) 개인 소견(personal): 감정·소감·다짐·감사 등 주관적 내용 짧은 문장 1~3개 (한 문장 30자 내외, 종결 어미 포함)\n3) 한 항목에 적절한 내용이 없으면 빈 배열 [] 로 둘 것 (추측 금지)\n4) 해석·평가·권고는 절대 추가하지 말 것 (요약만)\n5) 마크다운/번호/불릿 기호 없이 순수 문장만\n\n반드시 아래 JSON 한 줄만 출력 (코드펜스/설명 금지):\n{"work":["...","..."],"personal":["..."]}`
          const res = await generateAIContent(cfg, sumPrompt, undefined, 'daily_report_summary')
          const raw = (res.content || '').trim()
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
          const m = cleaned.match(/\{[\s\S]*\}/)
          if (m) {
            const parsed = JSON.parse(m[0]) as { work?: unknown; personal?: unknown }
            const toArr = (v: unknown): string[] => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []
            const w = toArr(parsed.work)
            const p = toArr(parsed.personal)
            if (w.length || p.length) {
              nextAiSummary = { work: w, personal: p }
              nextAiSummarySource = commentText
            }
          }
        }
      } catch {
        // 실패해도 저장은 진행
      }
    }

    const payload = {
      employee_id: employeeId,
      report_date: selectedDate,
      tasks_completed: completed.filter((t) => t.title.trim()),
      tasks_in_progress: inProgress.filter((t) => t.title.trim()),
      tasks_planned: planned.filter((t) => t.title.trim()),
      carryover_tasks: carryover.filter((t) => t.title.trim()),
      ai_priority_suggestion: aiSuggestion,
      satisfaction_score: satisfaction,
      satisfaction_comment: commentText || null,
      blockers: blockers.trim() || null,
      work_memo: workMemo.trim() || null,
      project_memos: projectMemos,
      excluded_projects: Array.from(dismissedProjects),
      ai_summary: nextAiSummary,
      ai_summary_source: nextAiSummarySource,
    }

    if (report?.id) {
      const { error } = await supabase
        .from('daily_reports').update(payload).eq('id', report.id)
      if (error) { toast('저장 실패: ' + error.message, 'error'); setSaving(false); return }
    } else {
      const { error } = await supabase.from('daily_reports').insert(payload)
      if (error) { toast('저장 실패: ' + error.message, 'error'); setSaving(false); return }
    }

    toast('보고서가 저장되었습니다.', 'success')
    setSaving(false)
    fetchData()
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* D2-4: OJT 중인 멘티에게 주차별 보고서 바로가기 배너 표시 */}
      {ojtInfo && (
        <Card className="bg-gradient-to-r from-brand-50 to-violet-50 border-brand-200">
          <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-sm font-bold text-brand-800">🎓 OJT 진행 중</span>
                <Badge variant="primary" className="text-[10px]">
                  {ojtInfo.current_week}/{ojtInfo.total_weeks}주차
                </Badge>
                {ojtInfo.weekly_report_status === 'reviewed' && <Badge variant="success" className="text-[10px]">이번 주 검토완료</Badge>}
                {ojtInfo.weekly_report_status === 'submitted' && <Badge variant="info" className="text-[10px]">이번 주 제출됨</Badge>}
                {ojtInfo.weekly_report_status === 'draft' && <Badge variant="warning" className="text-[10px]">이번 주 작성 중</Badge>}
                {ojtInfo.weekly_report_status === 'none' && <Badge variant="danger" className="text-[10px]">이번 주 미작성</Badge>}
              </div>
              <p className="text-xs text-gray-600 line-clamp-1">{ojtInfo.program_name}</p>
            </div>
            <Button
              size="sm"
              variant={ojtInfo.weekly_report_status === 'none' || ojtInfo.weekly_report_status === 'draft' ? 'primary' : 'outline'}
              onClick={() => window.location.assign('/ojt/weekly')}
              className="shrink-0"
            >
              {ojtInfo.weekly_report_status === 'none' ? '주차별 보고서 작성' :
               ojtInfo.weekly_report_status === 'draft' ? '이어 쓰기' :
               '주차별 보고서 보기'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">일일 업무 보고서</h1>
        <div className="flex gap-2 shrink-0">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
            저장
          </Button>
          {report?.id && (
            alreadySubmitted ? (
              <Badge variant="success" className="px-3 py-2">
                <Send className="h-3.5 w-3.5 mr-1" /> 결재 전송됨
              </Badge>
            ) : (
              <Button variant="outline" onClick={() => setApprovalDialogOpen(true)}>
                <Send className="h-4 w-4" /> 결재 전송
              </Button>
            )
          )}
        </div>
      </div>

      {/* Date selector — 오늘 이후 미래 날짜 선택 불가 */}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => setSelectedDate(prevDay(selectedDate))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-gray-500" />
          <Input
            type="date"
            value={selectedDate}
            max={formatDate(new Date())}
            onChange={(e) => {
              const v = e.target.value
              if (!v) return
              if (isFutureDate(v)) {
                toast('미래 날짜의 일일 업무보고는 작성할 수 없습니다.', 'info')
                return
              }
              setSelectedDate(v)
            }}
            className="w-40"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={isFutureDate(nextDay(selectedDate)) || selectedDate >= formatDate(new Date())}
          onClick={() => {
            const n = nextDay(selectedDate)
            if (isFutureDate(n)) {
              toast('오늘 이후의 일일 업무보고는 작성할 수 없습니다.', 'info')
              return
            }
            setSelectedDate(n)
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSelectedDate(formatDate(new Date()))}>
          오늘
        </Button>
        {report && <Badge variant="success">저장됨</Badge>}
      </div>

      {/* 전일 피드백 */}
      <YesterdayFeedback employeeId={employeeId} selectedDate={selectedDate} />

      {/* 0512: AI 우선순위 제안 숨김 (state 는 유지) */}
      {/* 0512: 미완료 이월 작업 숨김 (블록 단순화) — state 는 유지하여 자동 이월 데이터 보존 */}

      {/* 작업 현황 — 내가 속한 모든 프로젝트 자동 노출 + 색상 헤더 블럭 + 그룹 메모 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">작업 현황</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={refreshCompletedFromProjects}
              disabled={refreshingCompleted}
              title="오늘의 프로젝트 활동을 다시 불러옵니다 (편집/메모는 보존)"
            >
              {refreshingCompleted ? '불러오는 중...' : '🔄 새로고침'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const HEADER_PALETTES = [
              { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-900', accent: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700' },
              { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', accent: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
              { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', accent: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
              { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', accent: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
              { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', accent: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700' },
              { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-900', accent: 'bg-cyan-500', badge: 'bg-cyan-100 text-cyan-700' },
            ]
            const paletteFor = (id: string) => {
              let h = 0
              for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
              return HEADER_PALETTES[Math.abs(h) % HEADER_PALETTES.length]
            }

            // 1) 노출 대상 프로젝트 — myProjects 기반 (진행중 + 완료 7일 이내)
            const idSet = new Set<string>()
            const nameMap = new Map<string, string>()
            const completedMap = new Map<string, boolean>()
            myProjects.forEach((p) => { idSet.add(p.id); nameMap.set(p.id, p.project_name); completedMap.set(p.id, !!p.completed) })

            // 2) 비프로젝트 + 노출대상 외 프로젝트 task 는 "기타" 로 흡수
            const otherTasks: { task: DailyReportTask; idx: number }[] = []
            const projectTasksMap = new Map<string, { task: DailyReportTask; idx: number }[]>()
            completed.forEach((t, idx) => {
              if (t.project_id && idSet.has(t.project_id)) {
                // 노출 대상 프로젝트 → 그룹
                const arr = projectTasksMap.get(t.project_id) ?? []
                arr.push({ task: t, idx })
                projectTasksMap.set(t.project_id, arr)
              } else {
                // project_id 없음 OR 완료 7일 경과/홀딩/취소된 프로젝트 → 기타
                otherTasks.push({ task: t, idx })
              }
            })

            // 4) 그룹 리스트 — 활동 많은 순으로 정렬, my_stages 포함
            const myStagesByProject = new Map<string, { name: string; status: string }[]>()
            myProjects.forEach((p) => myStagesByProject.set(p.id, p.my_stages))
            // 빈 메모 판정 (RichEditor 가 빈 상태에 <p></p> 등을 남기는 경우 처리)
            const isMemoEmpty = (html: string | undefined): boolean => {
              if (!html) return true
              const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
              return text.length === 0
            }
            const groups = Array.from(idSet)
              .filter((pid) => !dismissedProjects.has(pid))
              .map((pid) => ({
                projectId: pid,
                projectName: nameMap.get(pid) || '프로젝트',
                tasks: projectTasksMap.get(pid) ?? [],
                myStages: myStagesByProject.get(pid) ?? [],
                completed: completedMap.get(pid) ?? false,
              })).sort((a, b) =>
                (a.completed === b.completed ? 0 : a.completed ? 1 : -1) ||
                b.tasks.length - a.tasks.length ||
                a.projectName.localeCompare(b.projectName))

            if (groups.length === 0 && otherTasks.length === 0 && !myProjectsLoading) {
              return (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-4 text-center">
                  소속된 프로젝트가 없습니다. 프로젝트 보드에서 본인을 담당자로 추가해주세요.
                </p>
              )
            }

            const activeGroups = groups.filter((g) => !g.completed)
            const completedGroups = groups.filter((g) => g.completed)
            const renderGroup = (g: typeof groups[number]) => {
                  const palette = paletteFor(g.projectId)
                  return (
                    <div key={g.projectId} className={`rounded-lg border ${palette.border} overflow-hidden`}>
                      {/* 색상 헤더 블럭 */}
                      <div className={`${palette.bg} px-4 py-2.5 border-b ${palette.border} flex items-start justify-between flex-wrap gap-2`}>
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`inline-block w-1 h-5 rounded-full ${palette.accent} shrink-0`} />
                            <span className="text-base shrink-0">📁</span>
                            <h3 className={`font-bold ${palette.text} text-lg break-keep [word-break:keep-all]`}>{g.projectName}</h3>
                            {g.completed && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 shrink-0">완료</span>
                            )}
                            {g.tasks.length > 0 && (
                              <span className={`inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-[10px] font-bold ${palette.badge} shrink-0`}>
                                {g.tasks.length}
                              </span>
                            )}
                          </div>
                          {/* 내가 담당으로 지정된 파이프라인 단계 */}
                          {g.myStages.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pl-4">
                              <span className={`text-[10px] font-medium ${palette.text} opacity-70 shrink-0`}>내 담당 단계</span>
                              {g.myStages.map((s, i) => {
                                const dotCls =
                                  s.status === '완료' ? 'bg-emerald-500' :
                                  s.status === '진행중' ? 'bg-blue-500' :
                                  s.status === '홀딩' ? 'bg-amber-500' :
                                  'bg-gray-300'
                                return (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/80 border border-white text-[10px] font-medium text-gray-700 shrink-0"
                                    title={`${s.name} · ${s.status}`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${dotCls} shrink-0`} />
                                    {s.name}
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* 작업/메모 없는 프로젝트만 '오늘은 작업 없음' 체크 가능 */}
                          {g.tasks.length === 0 && isMemoEmpty(projectMemos[g.projectId]) && (
                            <label className={`inline-flex items-center gap-1 text-[11px] ${palette.text} opacity-75 cursor-pointer select-none px-1.5 py-1 rounded hover:bg-white/60`}>
                              <input
                                type="checkbox"
                                checked={false}
                                onChange={() => {
                                  setDismissedProjects((prev) => {
                                    const next = new Set(prev)
                                    next.add(g.projectId)
                                    return next
                                  })
                                  setProjectMemos((prev) => {
                                    if (!(g.projectId in prev)) return prev
                                    const next = { ...prev }
                                    delete next[g.projectId]
                                    return next
                                  })
                                }}
                                className="rounded shrink-0"
                              />
                              오늘은 작업 없음
                            </label>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => addTask(setCompleted, g.projectId, g.projectName)}
                          >
                            + 항목 추가
                          </Button>
                        </div>
                      </div>

                      {/* 바디 */}
                      <div className="p-3 space-y-3 bg-white">
                        {g.tasks.length > 0 && (
                          <div className="space-y-1.5">
                            {g.tasks.map(({ task, idx }) => (
                              <div key={task.id} className="flex gap-2 items-start">
                                <span className="text-emerald-500 shrink-0 mt-2.5 text-sm">✓</span>
                                <Input
                                  value={task.title}
                                  onChange={(e) => updateTask(setCompleted, idx, 'title', e.target.value)}
                                  placeholder="작업 내용"
                                  className="flex-1"
                                />
                                <button
                                  onClick={() => removeTask(setCompleted, idx)}
                                  className="text-red-400 hover:text-red-600 text-sm mt-2 shrink-0"
                                  title="삭제"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 프로젝트별 메모 — RichEditor */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            📝 작업 현황 메모
                          </label>
                          <RichEditor
                            value={projectMemos[g.projectId] || ''}
                            onChange={(html) => setProjectMemos((prev) => ({ ...prev, [g.projectId]: html }))}
                            placeholder={`${g.projectName} 관련 작업 현황을 자유롭게 작성하세요 (이미지/링크/파일 첨부 가능).`}
                            minHeight="120px"
                          />
                        </div>
                      </div>
                    </div>
                  )
            }

            return (
              <div className="space-y-3">
                {/* 진행중 프로젝트 */}
                {activeGroups.map(renderGroup)}

                {/* 완료된 프로젝트 — 완료 후 7일간 표시 */}
                {completedGroups.length > 0 && (
                  <div className="space-y-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-emerald-700">✅ 완료된 프로젝트 ({completedGroups.length})</span>
                      <span className="text-[11px] text-gray-500">완료 후 7일간 표시됩니다</span>
                    </div>
                    {completedGroups.map(renderGroup)}
                  </div>
                )}

                {/* 제외된 프로젝트 — 복원 칩 */}
                {dismissedProjects.size > 0 && (() => {
                  const excludedList = Array.from(dismissedProjects)
                    .filter((pid) => idSet.has(pid))
                    .map((pid) => ({ pid, name: nameMap.get(pid) || '프로젝트' }))
                  if (excludedList.length === 0) return null
                  return (
                    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
                      <p className="text-[11px] text-gray-500 mb-2">
                        이 보고서에서 제외된 프로젝트 ({excludedList.length}건) — 칩 클릭 시 다시 노출
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {excludedList.map((p) => (
                          <button
                            key={p.pid}
                            type="button"
                            onClick={() => setDismissedProjects((prev) => {
                              const next = new Set(prev)
                              next.delete(p.pid)
                              return next
                            })}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700 transition"
                            title={`${p.name} 다시 노출`}
                          >
                            ↺ {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* 비프로젝트 항목 — 회색 헤더 */}
                {otherTasks.length > 0 && (
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-1 h-5 rounded-full bg-gray-400 shrink-0" />
                        <span className="text-base">🗒️</span>
                        <h3 className="font-bold text-gray-900 text-sm">기타 작업 (프로젝트 외)</h3>
                        <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 shrink-0">
                          {otherTasks.length}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => addTask(setCompleted, null, null)}
                      >
                        + 항목 추가
                      </Button>
                    </div>
                    <div className="p-3 space-y-1.5 bg-white">
                      {otherTasks.map(({ task, idx }) => (
                        <div key={task.id} className="flex gap-2 items-start">
                          <span className="text-emerald-500 shrink-0 mt-2.5 text-sm">✓</span>
                          <Input
                            value={task.title}
                            onChange={(e) => updateTask(setCompleted, idx, 'title', e.target.value)}
                            placeholder="작업 내용"
                            className="flex-1"
                          />
                          <button
                            onClick={() => removeTask(setCompleted, idx)}
                            className="text-red-400 hover:text-red-600 text-sm mt-2 shrink-0"
                            title="삭제"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 비프로젝트 항목이 없을 때 추가 버튼 */}
                {otherTasks.length === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-center"
                    onClick={() => addTask(setCompleted, null, null)}
                  >
                    + 프로젝트 외 작업 추가
                  </Button>
                )}
              </div>
            )
          })()}

          {/* 전체 자유 메모 — 프로젝트와 무관한 종합 메모 */}
          <div className="pt-3 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              🧾 작업 현황 종합 메모 (자유 입력)
            </label>
            <RichEditor
              value={workMemo}
              onChange={setWorkMemo}
              placeholder="오늘 하루의 작업에 대해 자유롭게 정리하세요. 이미지 · 링크 · 파일 첨부 모두 가능합니다."
              minHeight="150px"
            />
          </div>
        </CardContent>
      </Card>

      {/* 0512: 진행 중 작업 숨김 — state 는 유지 (저장/이월용) */}
      {/* 0512: 내일 계획 숨김 — state 는 유지하되 UI 미노출 */}

      {/* 오늘의 총평 — 만족도 + 한 줄 메모 + 이슈/블로커 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">오늘의 총평</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 만족도 점수 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              오늘 업무 만족도: <span className="text-brand-600 font-bold">{satisfaction}</span>
            </label>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setSatisfaction(n)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    n <= satisfaction
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="오늘의 한 줄 총평"
            value={satisfactionComment}
            onChange={(e) => setSatisfactionComment(e.target.value)}
            placeholder="오늘 하루를 자유롭게 정리해주세요."
            rows={3}
          />

          <Textarea
            label="이슈 / 블로커 (선택)"
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            placeholder="업무 진행에 방해가 된 요인이 있으면 적어주세요. (없으면 비워두세요)"
            rows={3}
          />
        </CardContent>
      </Card>

      {/* 상위자 코멘트 (리더/임원/대표 → 직원 피드백) */}
      {report?.id && <ReportComments reportId={report.id} />}

      {/* ── 결재 전송 다이얼로그 ── */}
      <Dialog open={approvalDialogOpen} onClose={() => setApprovalDialogOpen(false)} title="결재선 지정 및 전송" className="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">업무보고 ({selectedDate})를 결재 전송합니다.</p>

          {/* 템플릿 기반 고정 결재선 */}
          {reportTemplate ? (
            <div className="border border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50/30">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-blue-800">🔒 고정 결재라인</h4>
                <span className="text-[10px] text-blue-500">관리자 설정 — 변경 불가</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white border border-blue-200">
                  <span className="text-[10px] font-bold text-blue-400 w-5 text-center">0</span>
                  <span className="text-xs font-medium text-gray-700">본인 (신청)</span>
                </div>
                {reportTemplate.steps.map((step, idx) => {
                  const approverId = step.approver_ids?.[0] || ''
                  const approverName = approverId ? allEmployees.find(e => e.id === approverId)?.name : null
                  return (
                    <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-blue-100 border-l-2 border-blue-500">
                      <span className="text-[10px] font-bold text-blue-500 w-5 text-center">{idx + 1}</span>
                      <span className="text-xs font-medium text-blue-800">{step.label}</span>
                      {approverName && <span className="text-[10px] text-blue-700 ml-auto">👤 {approverName}</span>}
                      {!approverName && <span className="text-[10px] text-amber-600 ml-auto">⚠ 담당자 미지정</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            // D1-7: 템플릿이 없으면 결재 전송 불가 (신청자 수동 지정 UI 제거)
            <div className="border-2 border-red-200 bg-red-50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-bold text-red-800">⚠️ 결재선이 설정되지 않았습니다</p>
              <p className="text-xs text-red-700">
                일일 업무보고 결재선은 <strong>결재선 관리</strong>에서 사전 설정된 템플릿만 사용 가능합니다.
                신청자가 직접 결재자를 지정할 수 없으니, 관리자에게 문의해 해당 본부·팀 결재선 등록을 요청하세요.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>취소</Button>
            <Button
              disabled={!reportTemplate || approvalSending}
              onClick={async () => {
                if (!report?.id || !profile?.id) return
                setApprovalSending(true)
                try {
                  // D1-7: 템플릿 기반만 사용. 신청자 수동 지정 제거.
                  const steps: { step_order: number; approver_id: string; approver_role: string; action: string }[] = []
                  if (!reportTemplate) {
                    toast('결재선이 설정되지 않아 전송할 수 없습니다. 관리자에게 문의하세요.', 'error')
                    setApprovalSending(false)
                    return
                  }
                  // 병렬 결재 (dfa976d): 같은 step_order 에 N명 fan-out 해야
                  // approval.tsx 의 pending_approval 필터(steps.some(...))가 본인 row 를 찾을 수 있음
                  reportTemplate.steps.forEach((step, idx) => {
                    const ids = (step.approver_ids || []).filter(Boolean)
                    ids.forEach((approverId) => {
                      steps.push({
                        step_order: idx + 1,
                        approver_id: approverId,
                        approver_role: step.role,
                        action: 'pending',
                      })
                    })
                  })
                  if (steps.length === 0) {
                    toast('결재선 템플릿에 담당자가 지정되지 않았습니다. 관리자에게 문의하세요.', 'error')
                    setApprovalSending(false)
                    return
                  }

                  // 1) approval_documents 생성
                  // D2-4: OJT 멘티는 이번 주차 보고서 참조 포함 → 결재자가 함께 확인 가능
                  const ojtContext = ojtInfo ? {
                    ojt_program_id: ojtInfo.program_id,
                    ojt_program_name: ojtInfo.program_name,
                    ojt_current_week: ojtInfo.current_week,
                    ojt_weekly_report_status: ojtInfo.weekly_report_status,
                  } : {}

                  // 결재자 가독성: 저장 시 daily_reports.ai_summary 에 만들어둔 요약을 그대로 사본 저장.
                  // 결재 전송 시 AI 재호출 없음 — 토큰/중복 호출 방지.
                  const aiSummary = (report as { ai_summary?: { work?: string[]; personal?: string[] } | null } | null)?.ai_summary ?? null

                  const { data: doc, error: docErr } = await supabase.from('approval_documents').insert({
                    doc_type: 'daily_report',
                    title: `일일 업무보고 (${selectedDate})`,
                    content: {
                      report_id: report.id,
                      report_date: selectedDate,
                      completed,
                      in_progress: inProgress,
                      planned,
                      // P1-#8 #9: 업무 만족도 + 한 줄 총평 누락 보강
                      satisfaction_score: satisfaction,
                      satisfaction_comment: satisfactionComment.trim() || null,
                      // 결재자 가독성: 업무/소견 분리 요약 (실패 시 null, 뷰는 원문만 표시)
                      ai_summary: aiSummary,
                      ...ojtContext,
                    },
                    requester_id: profile.id,
                    department: profile.department_id || '',
                    status: 'submitted',
                    current_step: 1,
                    total_steps: steps.length,
                    submitted_at: new Date().toISOString(),
                  }).select().single()

                  if (docErr) throw docErr

                  // 2) approval_steps 생성
                  const { error: stepErr } = await supabase.from('approval_steps').insert(
                    steps.map(s => ({ ...s, document_id: doc.id }))
                  )
                  if (stepErr) throw stepErr

                  // PDCA #6 Phase 2 — 1단계 결재자에게 in_app + push + email + (kakao_work) 4채널 발송
                  // Design Ref: §4.1, Plan SC-02. silent fail — 결재 흐름 무차단.
                  notifyApprovalSubmitted(doc.id).catch(() => {})

                  toast('결재가 전송되었습니다. 결재선은 변경할 수 없습니다.', 'success')
                  setAlreadySubmitted(true)
                  setApprovalDialogOpen(false)
                } catch (err: unknown) {
                  toast('결재 전송 실패: ' + (err instanceof Error ? err.message : '오류'), 'error')
                }
                setApprovalSending(false)
              }}
            >
              {approvalSending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
              결재 전송
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

// ─── 상위자 코멘트 컴포넌트 ─────────────────────────────────────

function ReportComments({ reportId }: { reportId: string }) {
  const { profile, hasRole } = useAuth()
  const { toast } = useToast()
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [sentiment, setSentiment] = useState<'positive' | 'negative' | 'neutral'>('neutral')
  const [submitting, setSubmitting] = useState(false)

  const canComment = hasRole('leader') || hasRole('director') || hasRole('division_head') || hasRole('ceo') || hasRole('admin')

  useEffect(() => {
    fetchComments()
  }, [reportId])

  async function fetchComments() {
    const { data } = await supabase
      .from('report_comments')
      .select('*, author:employees!author_id(name, role)')
      .eq('report_type', 'daily_report')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true })
    setComments(data || [])
  }

  async function handleSubmit() {
    if (!newComment.trim() || !profile?.id) return
    setSubmitting(true)
    const { error } = await supabase.from('report_comments').insert({
      report_type: 'daily_report',
      report_id: reportId,
      author_id: profile.id,
      content: newComment.trim(),
      sentiment,
    })
    if (error) {
      toast('코멘트 저장 실패: ' + error.message, 'error')
    } else {
      toast('코멘트가 등록되었습니다.')
      setNewComment('')
      setSentiment('neutral')
      fetchComments()
    }
    setSubmitting(false)
  }

  const SENTIMENT_CONFIG = {
    positive: { label: 'P', color: 'bg-emerald-500 text-white', desc: '긍정' },
    negative: { label: 'N', color: 'bg-red-500 text-white', desc: '부정' },
    neutral: { label: '-', color: 'bg-gray-300 text-gray-700', desc: '중립' },
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          상위자 코멘트
          <span className="text-[10px] font-normal text-gray-500">
            {canComment ? '(리더·임원·대표 전용 · 아래 입력창에 작성)' : '(리더/임원이 작성한 피드백을 확인할 수 있습니다)'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 기존 코멘트 목록 */}
        {comments.length > 0 && (
          <div className="space-y-2">
            {comments.map((c) => {
              const cfg = SENTIMENT_CONFIG[c.sentiment as keyof typeof SENTIMENT_CONFIG] || SENTIMENT_CONFIG.neutral
              return (
                <div key={c.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                  <span className={`w-6 h-6 rounded-full ${cfg.color} flex items-center justify-center text-xs font-bold shrink-0`}>
                    {cfg.label}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-gray-800">{c.author?.name || '알 수 없음'}</span>
                      <span className="text-[10px] text-gray-400">{new Date(c.created_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                    <p className="text-sm text-gray-700">{c.content}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 새 코멘트 입력 (리더 이상만) */}
        {canComment && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">평가:</span>
              {(['positive', 'negative', 'neutral'] as const).map((s) => {
                const cfg = SENTIMENT_CONFIG[s]
                const isActive = sentiment === s
                return (
                  <button
                    key={s}
                    onClick={() => setSentiment(s)}
                    className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                      isActive ? cfg.color + ' ring-2 ring-offset-1 ring-gray-400' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                    title={cfg.desc}
                  >
                    {cfg.label}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <Input
                value={newComment}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewComment(e.target.value)}
                placeholder="코멘트를 입력하세요..."
                className="flex-1"
                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleSubmit()}
              />
              <Button size="sm" onClick={handleSubmit} disabled={submitting || !newComment.trim()}>
                {submitting ? '저장 중...' : '등록'}
              </Button>
            </div>
          </div>
        )}

        {comments.length === 0 && !canComment && (
          <p className="text-xs text-gray-400 text-center py-4">코멘트가 없습니다.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── 전일 피드백 배너 ───────────────────────────────────────────
import { MessageCircle } from 'lucide-react'

function YesterdayFeedback({ employeeId, selectedDate }: { employeeId?: string; selectedDate: string }) {
  const [feedbacks, setFeedbacks] = useState<{ author_name: string; content: string; created_at: string }[]>([])

  useEffect(() => {
    if (!employeeId) return
    async function load() {
      // 전일 보고서 찾기
      const yesterday = new Date(new Date(selectedDate).getTime() - 86400000).toISOString().slice(0, 10)
      const { data: yesterdayReport } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('employee_id', employeeId)
        .eq('report_date', yesterday)
        .maybeSingle()

      if (!yesterdayReport?.id) { setFeedbacks([]); return }

      // 해당 보고서의 코멘트 가져오기
      const { data: comments } = await supabase
        .from('report_comments')
        .select('content, created_at, author_id')
        .eq('report_id', yesterdayReport.id)
        .neq('author_id', employeeId) // 본인 코멘트 제외
        .order('created_at')

      if (!comments || comments.length === 0) { setFeedbacks([]); return }

      // 작성자 이름 조회
      const authorIds = [...new Set(comments.map((c: any) => c.author_id))]
      const { data: authors } = await supabase.from('employees').select('id, name').in('id', authorIds)
      const nameMap = new Map((authors || []).map((a: any) => [a.id, a.name]))

      setFeedbacks(comments.map((c: any) => ({
        author_name: nameMap.get(c.author_id) || '관리자',
        content: c.content,
        created_at: c.created_at,
      })))
    }
    load()
  }, [employeeId, selectedDate])

  if (feedbacks.length === 0) return null

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="py-3">
        <div className="flex items-center gap-2 mb-2">
          <MessageCircle className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-800">전일 피드백 ({feedbacks.length}건)</span>
        </div>
        <div className="space-y-1.5">
          {feedbacks.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="font-medium text-amber-700 shrink-0">{f.author_name}:</span>
              <span className="text-gray-700">{f.content}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
