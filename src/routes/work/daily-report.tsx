import { useState, useEffect, useCallback } from 'react'
import { CalendarDays, Sparkles, Save, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { generateAIContent, type AIConfig } from '@/lib/ai-client'
import type { DailyReport, DailyReportTask, Task } from '@/types/work'

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

  const employeeId = profile?.id

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
      const autoInProgress: DailyReportTask[] = (currentInProgress || []).map((t: Task) => ({
        id: t.id,
        title: t.title,
        status: 'in_progress' as const,
      }))
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

      // 계획 섹션은 비워두고 사용자가 추가
      setPlanned([])
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
      const { data: aiSettings } = await supabase
        .from('ai_settings').select('*').eq('is_active', true).limit(1).single()

      if (!aiSettings) {
        toast('AI 설정이 필요합니다.', 'error')
        setAiLoading(false)
        return
      }

      const config: AIConfig = {
        provider: aiSettings.provider,
        apiKey: aiSettings.api_key,
        model: aiSettings.model,
      }

      const carryoverText = carryover.map((t) => `- ${t.title}`).join('\n')
      const myTasksText = myTasks
        .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
        .map((t) => `- [${t.priority}] ${t.title} (마감: ${t.due_date || '없음'})`)
        .join('\n')

      const prompt = `오늘(${selectedDate}) 업무 우선순위를 제안해주세요.

어제 미완료 작업:
${carryoverText || '없음'}

현재 할당된 작업:
${myTasksText || '없음'}

3줄 이내로 "오늘 이것부터 하세요" 형식으로 우선순위를 제안해주세요.`

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

  function TaskSection({
    title,
    tasks: sectionTasks,
    setter,
    highlight,
  }: {
    title: string
    tasks: DailyReportTask[]
    setter: React.Dispatch<React.SetStateAction<DailyReportTask[]>>
    highlight?: boolean
  }) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className={`text-base ${highlight ? 'text-red-700' : ''}`}>{title}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => addTask(setter)}>+ 추가</Button>
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
                    onChange={(e) => updateTask(setter, idx, 'title', e.target.value)}
                    placeholder="작업 제목"
                    className="flex-1"
                  />
                  <Input
                    value={task.note || ''}
                    onChange={(e) => updateTask(setter, idx, 'note', e.target.value)}
                    placeholder="메모"
                    className="w-40"
                  />
                  <button
                    onClick={() => removeTask(setter, idx)}
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">일일 업무 보고서</h1>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
          저장
        </Button>
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
        setter={setCarryover}
        highlight
      />

      {/* Completed */}
      <TaskSection title="완료한 작업" tasks={completed} setter={setCompleted} />

      {/* In Progress */}
      <TaskSection title="진행 중 작업" tasks={inProgress} setter={setInProgress} />

      {/* Planned for Tomorrow */}
      <TaskSection title="내일 계획" tasks={planned} setter={setPlanned} />

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
            <div className="flex gap-1">
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
    </div>
  )
}
