import { useState, useEffect, useCallback } from 'react'
import { CalendarDays, Sparkles, Save, ChevronLeft, ChevronRight, Send } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature } from '@/lib/ai-client'
import type { DailyReport, DailyReportTask, Task } from '@/types/work'

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

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function prevDay(date: string): string {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)
  return formatDate(d)
}

function nextDay(date: string): string {
  const d = new Date(date)
  d.setDate(d.getDate() + 1)
  return formatDate(d)
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

  // 결재 전송 다이얼로그
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false)
  // D1-7: 신청자 수동 결재자 지정 UI 제거 — 상태 미사용
  const [approvalSending, setApprovalSending] = useState(false)
  const [allEmployees, setAllEmployees] = useState<{ id: string; name: string; role: string; department_id: string | null }[]>([])
  // 이 보고서가 이미 결재 전송되었는지 체크
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  // 일일보고 결재선 템플릿 (관리자가 결재선 관리에서 설정)
  const [reportTemplate, setReportTemplate] = useState<{ id: string; steps: { role: string; label: string; approver_ids?: string[] }[] } | null>(null)

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

  // 일일보고 결재선 템플릿 로드
  useEffect(() => {
    supabase.from('approval_templates')
      .select('id, steps')
      .eq('doc_type', 'daily_report')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setReportTemplate(data as typeof reportTemplate)
      })
  }, [])

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
    } else {
      setReport(null)
      setSatisfaction(5)
      setSatisfactionComment('')
      setBlockers('')
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

      // ─── 완료 섹션 자동 채우기 ─────────────────────────
      const autoCompleted: DailyReportTask[] = []

      // 완료된 작업
      for (const t of (todayDoneTasks || []) as Task[]) {
        autoCompleted.push({ id: t.id, title: `[작업 완료] ${t.title}`, status: 'done' })
      }

      // 스테이지 상태 변경
      for (const u of stageChanges as { id: string; content: string; project_id: string }[]) {
        const projName = projectNames[u.project_id] || ''
        autoCompleted.push({
          id: u.id,
          title: `[${projName}] ${u.content}`,
          status: 'done',
        })
      }

      // 일반 업데이트 (상태변경 아닌 것)
      const regularUpdates = (todayUpdates || []).filter(
        (u: { status_changed_to: string | null }) => !u.status_changed_to
      )
      for (const u of regularUpdates as { id: string; content: string; project_id: string }[]) {
        const projName = projectNames[u.project_id] || ''
        // HTML 태그 제거하여 텍스트만 추출
        const plainText = u.content.replace(/<[^>]*>/g, '').trim().slice(0, 100)
        if (plainText) {
          autoCompleted.push({
            id: u.id,
            title: `[${projName}] ${plainText}`,
            status: 'done',
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

  // Add task to section
  function addTask(
    setter: React.Dispatch<React.SetStateAction<DailyReportTask[]>>
  ) {
    setter((prev) => [...prev, { id: crypto.randomUUID(), title: '', status: 'todo' }])
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

    const payload = {
      employee_id: employeeId,
      report_date: selectedDate,
      tasks_completed: completed.filter((t) => t.title.trim()),
      tasks_in_progress: inProgress.filter((t) => t.title.trim()),
      tasks_planned: planned.filter((t) => t.title.trim()),
      carryover_tasks: carryover.filter((t) => t.title.trim()),
      ai_priority_suggestion: aiSuggestion,
      satisfaction_score: satisfaction,
      satisfaction_comment: satisfactionComment.trim() || null,
      blockers: blockers.trim() || null,
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

      {/* Date selector */}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => setSelectedDate(prevDay(selectedDate))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-gray-500" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => setSelectedDate(nextDay(selectedDate))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSelectedDate(formatDate(new Date()))}>
          오늘
        </Button>
        {report && <Badge variant="success">저장됨</Badge>}
      </div>

      {/* 전일 피드백 */}
      <YesterdayFeedback employeeId={employeeId} selectedDate={selectedDate} />

      {/* AI Priority */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" /> AI 우선순위 제안
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAISuggestion}
              disabled={aiLoading}
            >
              {aiLoading ? <Spinner size="sm" /> : '제안 받기'}
            </Button>
          </div>
        </CardHeader>
        {aiSuggestion && (
          <CardContent>
            <div className="bg-purple-50 p-3 rounded-lg text-sm text-purple-900 whitespace-pre-wrap">
              {aiSuggestion}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Carryover (yesterday's uncompleted) */}
      <TaskSection
        title="미완료 이월 작업"
        tasks={carryover}
        onAdd={() => addTask(setCarryover)}
        onUpdate={(idx, field, value) => updateTask(setCarryover, idx, field, value)}
        onRemove={(idx) => removeTask(setCarryover, idx)}
        highlight
      />

      {/* Completed */}
      <TaskSection
        title="작업 현황"
        tasks={completed}
        onAdd={() => addTask(setCompleted)}
        onUpdate={(idx, field, value) => updateTask(setCompleted, idx, field, value)}
        onRemove={(idx) => removeTask(setCompleted, idx)}
      />

      {/* In Progress */}
      <TaskSection
        title="진행 중 작업"
        tasks={inProgress}
        onAdd={() => addTask(setInProgress)}
        onUpdate={(idx, field, value) => updateTask(setInProgress, idx, field, value)}
        onRemove={(idx) => removeTask(setInProgress, idx)}
        onImportFromProjects={importInProgressFromProjects}
        importLoading={importingProjects}
      />

      {/* Planned for Tomorrow */}
      <TaskSection
        title="내일 계획"
        tasks={planned}
        onAdd={() => addTask(setPlanned)}
        onUpdate={(idx, field, value) => updateTask(setPlanned, idx, field, value)}
        onRemove={(idx) => removeTask(setPlanned, idx)}
      />

      {/* Satisfaction + Blockers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">만족도 및 코멘트</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Satisfaction score */}
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

          <Input
            label="한 줄 코멘트"
            value={satisfactionComment}
            onChange={(e) => setSatisfactionComment(e.target.value)}
            placeholder="오늘 하루를 한 줄로 표현하면?"
          />

          <Textarea
            label="블로커/장애요인"
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            placeholder="업무 진행에 방해가 된 요인이 있으면 적어주세요."
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
                  reportTemplate.steps.forEach((step, idx) => {
                    const approverId = step.approver_ids?.[0]
                    if (approverId) {
                      steps.push({
                        step_order: idx + 1,
                        approver_id: approverId,
                        approver_role: step.role,
                        action: 'pending',
                      })
                    }
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

                  const { data: doc, error: docErr } = await supabase.from('approval_documents').insert({
                    doc_type: 'daily_report',
                    title: `일일 업무보고 (${selectedDate})`,
                    content: {
                      report_id: report.id,
                      report_date: selectedDate,
                      completed,
                      in_progress: inProgress,
                      planned,
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
