import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Send, FileText, Bell,
  BarChart3, CheckCircle, Loader2, AlertTriangle, ListChecks,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useProjectBoard } from '@/hooks/useProjectBoard'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ProjectUpdate, StageStatus } from '@/types/project-board'
import type { Task, TaskPriority, TaskStatus } from '@/types/work'
import { STAGE_STATUS_COLORS, STAGE_STATUS_DOT, PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS } from '@/types/project-board'

const STATUS_OPTIONS: StageStatus[] = ['시작전', '진행중', '완료', '홀딩']

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { profile } = useAuth()
  const { projects, employees, updateStageStatus, updateStageDeadline, addUpdate, fetchUpdates, updateRequestStatus } = useProjectBoard()

  const project = projects.find((p) => p.id === id)

  const [activeTab, setActiveTab] = useState<'updates' | 'tasks' | 'requests' | 'stats'>('updates')
  const [updates, setUpdates] = useState<(ProjectUpdate & { author_name: string })[]>([])
  const [updatesLoading, setUpdatesLoading] = useState(false)

  // Tasks
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([])
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('normal')
  const [taskDueDate, setTaskDueDate] = useState('')

  // Update form
  const [showUpdateForm, setShowUpdateForm] = useState(false)
  const [updateContent, setUpdateContent] = useState('')
  const [updateStageId, setUpdateStageId] = useState('')
  const [saving, setSaving] = useState(false)

  // Request form
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [requestContent, setRequestContent] = useState('')
  const [requestDept, setRequestDept] = useState('')
  const [requestStageId, setRequestStageId] = useState('')

  const loadUpdates = useCallback(async () => {
    if (!id) return
    setUpdatesLoading(true)
    const data = await fetchUpdates(id)
    setUpdates(data)
    setUpdatesLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => { loadUpdates() }, [loadUpdates])

  // Load linked tasks
  const loadTasks = useCallback(async () => {
    if (!id) return
    const { data } = await supabase.from('tasks').select('*').eq('linked_board_id', id).order('sort_order').order('created_at', { ascending: false })
    setLinkedTasks((data || []) as Task[])
  }, [id])

  useEffect(() => { loadTasks() }, [loadTasks])

  async function handleAddTask() {
    if (!taskTitle.trim() || !profile?.id || !id) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      linked_board_id: id,
      title: taskTitle,
      assignee_id: taskAssignee || null,
      priority: taskPriority,
      status: 'todo',
      due_date: taskDueDate || null,
      sort_order: linkedTasks.length,
    })
    setSaving(false)
    if (error) { toast('작업 추가 실패: ' + error.message, 'error'); return }
    toast('작업이 추가되었습니다', 'success')
    setTaskTitle(''); setTaskAssignee(''); setTaskPriority('normal'); setTaskDueDate('')
    setShowTaskForm(false)
    loadTasks()
  }

  async function toggleTaskStatus(task: Task) {
    const next: Record<TaskStatus, TaskStatus> = { todo: 'in_progress', in_progress: 'done', done: 'todo', cancelled: 'todo' }
    await supabase.from('tasks').update({ status: next[task.status] }).eq('id', task.id)
    loadTasks()
  }

  if (!project) return <PageSpinner />

  const stages = [...project.stages].sort((a, b) => a.stage_order - b.stage_order)
  const completedStages = stages.filter((s) => s.status === '완료').length
  const progressPercent = stages.length > 0 ? Math.round((completedStages / stages.length) * 100) : 0

  async function handleStatusChange(stageId: string, newStatus: StageStatus) {
    const result = await updateStageStatus(stageId, newStatus, project!.id)
    if (result.error) toast('변경 실패', 'error')
    else { toast('상태 변경됨', 'success'); loadUpdates() }
  }

  async function handleDeadlineChange(stageId: string, deadline: string) {
    const result = await updateStageDeadline(stageId, deadline)
    if (result.error) toast('마감일 변경 실패', 'error')
  }

  async function handleAddUpdate() {
    if (!updateContent.trim()) { toast('내용을 입력하세요', 'error'); return }
    setSaving(true)
    const result = await addUpdate({
      project_id: project!.id,
      stage_id: updateStageId || undefined,
      content: updateContent,
    })
    setSaving(false)
    if (result.error) { toast('등록 실패', 'error'); return }
    toast('업데이트 등록됨', 'success')
    setUpdateContent('')
    setUpdateStageId('')
    setShowUpdateForm(false)
    loadUpdates()
  }

  async function handleAddRequest() {
    if (!requestContent.trim() || !requestDept) { toast('내용과 부서를 선택하세요', 'error'); return }
    setSaving(true)
    const result = await addUpdate({
      project_id: project!.id,
      stage_id: requestStageId || undefined,
      content: requestContent,
      is_cross_dept_request: true,
      requested_department: requestDept,
    })
    setSaving(false)
    if (result.error) { toast('요청 실패', 'error'); return }
    toast('요청이 전송되었습니다', 'success')
    setRequestContent('')
    setRequestDept('')
    setShowRequestForm(false)
    loadUpdates()
  }

  async function handleRequestAction(updateId: string, action: 'accepted' | 'completed' | 'rejected') {
    const result = await updateRequestStatus(updateId, action)
    if (result.error) toast('처리 실패', 'error')
    else { toast('처리 완료', 'success'); loadUpdates() }
  }

  const requests = updates.filter((u) => u.is_cross_dept_request)
  const regularUpdates = updates.filter((u) => !u.is_cross_dept_request)

  // Stats
  const avgDaysPerStage = stages.filter((s) => s.status === '완료' && s.completed_at).map((s) => {
    const created = new Date(s.created_at).getTime()
    const completed = new Date(s.completed_at!).getTime()
    return Math.ceil((completed - created) / (1000 * 60 * 60 * 24))
  })
  const avgDays = avgDaysPerStage.length > 0 ? Math.round(avgDaysPerStage.reduce((a, b) => a + b, 0) / avgDaysPerStage.length) : 0
  const delayedStages = stages.filter((s) => {
    if (s.status === '완료' || !s.deadline) return false
    return new Date(s.deadline) < new Date()
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/projects')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{project.project_name}</h1>
            <Badge className={PROJECT_STATUS_COLORS[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
          </div>
          <p className="text-sm text-gray-500">
            {project.brand} · {project.category} · 출시: {project.launch_date || '미정'} · 담당: {project.assignee_names?.join(', ')}
          </p>
        </div>
      </div>

      {/* Pipeline progress */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">파이프라인 진행 ({completedStages}/{stages.length})</span>
            <span className="text-sm font-bold text-brand-600">{progressPercent}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full mb-4">
            <div className="h-2 bg-brand-500 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
          </div>

          <div className="grid grid-cols-7 gap-2">
            {stages.map((stage) => {
              const today = new Date()
              const deadline = stage.deadline ? new Date(stage.deadline) : null
              const isOverdue = deadline && stage.status !== '완료' && deadline < today

              return (
                <div key={stage.id} className={`p-2 rounded-lg border ${isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-1 mb-1">
                    <div className={`w-2 h-2 rounded-full ${STAGE_STATUS_DOT[stage.status]}`} />
                    <span className="text-[11px] font-medium text-gray-700 truncate">{stage.stage_name}</span>
                  </div>
                  <select
                    value={stage.status}
                    onChange={(e) => handleStatusChange(stage.id, e.target.value as StageStatus)}
                    className={`w-full text-[10px] rounded px-1 py-0.5 border-0 ${STAGE_STATUS_COLORS[stage.status]}`}
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input
                    type="date"
                    value={stage.deadline || ''}
                    onChange={(e) => handleDeadlineChange(stage.id, e.target.value)}
                    className="w-full text-[9px] text-gray-500 mt-1 border-0 bg-transparent"
                  />
                  {isOverdue && (
                    <span className="text-[9px] text-red-600 font-bold flex items-center gap-0.5 mt-0.5">
                      <AlertTriangle className="h-2.5 w-2.5" /> 지연
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'updates' as const, icon: FileText, label: '업데이트', count: regularUpdates.length },
          { key: 'tasks' as const, icon: ListChecks, label: '작업', count: linkedTasks.length },
          { key: 'requests' as const, icon: Bell, label: '요청', count: requests.length },
          { key: 'stats' as const, icon: BarChart3, label: '통계' },
        ]).map(({ key, icon: Icon, label, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key ? 'text-brand-700 border-brand-500' : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
            {count !== undefined && <Badge variant="default" className="text-[10px] ml-1">{count}</Badge>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'updates' && (
        <div className="space-y-3">
          <Button size="sm" onClick={() => setShowUpdateForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> 업데이트 추가
          </Button>

          {showUpdateForm && (
            <Card>
              <CardContent className="space-y-3 py-4">
                <Select
                  label="관련 단계 (선택)"
                  value={updateStageId}
                  onChange={(e) => setUpdateStageId(e.target.value)}
                  options={[{ value: '', label: '전체' }, ...stages.map((s) => ({ value: s.id, label: s.stage_name }))]}
                />
                <Textarea label="내용" value={updateContent} onChange={(e) => setUpdateContent(e.target.value)} rows={3} placeholder="진행 상황을 기록하세요..." />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowUpdateForm(false)}>취소</Button>
                  <Button onClick={handleAddUpdate} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '등록'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {updatesLoading ? <PageSpinner /> : (
            <div className="space-y-2">
              {regularUpdates.length === 0 ? (
                <p className="text-center py-8 text-gray-400">아직 업데이트가 없습니다</p>
              ) : regularUpdates.map((u) => {
                const stage = stages.find((s) => s.id === u.stage_id)
                return (
                  <div key={u.id} className="flex gap-3 p-3 border border-gray-200 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold shrink-0">
                      {u.author_name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">{u.author_name}</span>
                        {stage && <Badge variant="default" className="text-[10px]">{stage.stage_name}</Badge>}
                        {u.status_changed_to && (
                          <Badge className={STAGE_STATUS_COLORS[u.status_changed_to as StageStatus] || ''}>
                            {u.status_changed_from} → {u.status_changed_to}
                          </Badge>
                        )}
                        <span className="text-[10px] text-gray-400">
                          {new Date(u.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{u.content}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="space-y-3">
          <Button size="sm" onClick={() => setShowTaskForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> 작업 추가
          </Button>

          {showTaskForm && (
            <Card>
              <CardContent className="space-y-3 py-4">
                <Input label="작업명 *" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="작업 제목" />
                <div className="grid grid-cols-3 gap-3">
                  <Select
                    label="담당자"
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value)}
                    options={[{ value: '', label: '미지정' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
                  />
                  <Select
                    label="우선순위"
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                    options={[{ value: 'urgent', label: '긴급' }, { value: 'high', label: '높음' }, { value: 'normal', label: '보통' }, { value: 'low', label: '낮음' }]}
                  />
                  <Input label="마감일" type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowTaskForm(false)}>취소</Button>
                  <Button onClick={handleAddTask} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '추가'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-1">
            {linkedTasks.length === 0 ? (
              <p className="text-center py-8 text-gray-400">이 프로젝트에 연결된 작업이 없습니다</p>
            ) : linkedTasks.map((task) => {
              const priorityColor = task.priority === 'urgent' ? 'bg-red-100 text-red-700' : task.priority === 'high' ? 'bg-amber-100 text-amber-700' : task.priority === 'normal' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              const statusIcon = task.status === 'done' ? '✅' : task.status === 'in_progress' ? '🔄' : '⬜'
              const isOverdue = task.status !== 'done' && task.due_date && new Date(task.due_date) < new Date()
              const assigneeName = employees.find((e) => e.id === task.assignee_id)?.name

              return (
                <div key={task.id} className={`flex items-center gap-3 p-3 border rounded-lg ${isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-200'} ${task.status === 'done' ? 'opacity-60' : ''}`}>
                  <button onClick={() => toggleTaskStatus(task)} className="text-lg shrink-0" title="상태 변경">
                    {statusIcon}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      {task.title}
                    </span>
                  </div>
                  <Badge className={`text-[10px] ${priorityColor}`}>{task.priority}</Badge>
                  {assigneeName && <span className="text-xs text-gray-500">{assigneeName}</span>}
                  {task.due_date && (
                    <span className={`text-[10px] ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                      {task.due_date.slice(5)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="space-y-3">
          <Button size="sm" onClick={() => setShowRequestForm(true)}>
            <Bell className="h-4 w-4 mr-1" /> 타부서 요청
          </Button>

          {showRequestForm && (
            <Card>
              <CardContent className="space-y-3 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="대상 부서"
                    value={requestDept}
                    onChange={(e) => setRequestDept(e.target.value)}
                    options={[
                      { value: '', label: '선택' },
                      { value: '디자인팀', label: '디자인팀' },
                      { value: '영업팀', label: '영업팀' },
                      { value: '경영지원팀', label: '경영지원팀' },
                    ]}
                  />
                  <Select
                    label="관련 단계"
                    value={requestStageId}
                    onChange={(e) => setRequestStageId(e.target.value)}
                    options={[{ value: '', label: '전체' }, ...stages.map((s) => ({ value: s.id, label: s.stage_name }))]}
                  />
                </div>
                <Textarea label="요청 내용" value={requestContent} onChange={(e) => setRequestContent(e.target.value)} rows={3} placeholder="요청 내용을 작성하세요..." />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowRequestForm(false)}>취소</Button>
                  <Button onClick={handleAddRequest} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> 요청 전송</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {requests.length === 0 ? (
              <p className="text-center py-8 text-gray-400">타부서 요청이 없습니다</p>
            ) : requests.map((r) => {
              const statusColor = r.request_status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                : r.request_status === 'accepted' ? 'bg-blue-100 text-blue-700'
                : r.request_status === 'rejected' ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-700'
              const statusLabel = r.request_status === 'completed' ? '완료'
                : r.request_status === 'accepted' ? '수락'
                : r.request_status === 'rejected' ? '반려'
                : '요청중'

              return (
                <div key={r.id} className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{r.author_name}</span>
                      <span className="text-xs text-gray-500">→ {r.requested_department}</span>
                      <Badge className={statusColor}>{statusLabel}</Badge>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {new Date(r.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{r.content}</p>
                  {r.request_status === 'pending' && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleRequestAction(r.id, 'accepted')}>수락</Button>
                      <Button size="sm" onClick={() => handleRequestAction(r.id, 'completed')}>
                        <CheckCircle className="h-3 w-3 mr-1" /> 완료
                      </Button>
                    </div>
                  )}
                  {r.request_status === 'accepted' && (
                    <Button size="sm" onClick={() => handleRequestAction(r.id, 'completed')}>
                      <CheckCircle className="h-3 w-3 mr-1" /> 완료 처리
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-brand-600">{progressPercent}%</p>
            <p className="text-xs text-gray-500">전체 진행률</p>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{completedStages}/{stages.length}</p>
            <p className="text-xs text-gray-500">완료 단계</p>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <p className={`text-2xl font-bold ${delayedStages.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{delayedStages.length}</p>
            <p className="text-xs text-gray-500">지연 단계</p>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{avgDays}일</p>
            <p className="text-xs text-gray-500">단계 평균 소요</p>
          </CardContent></Card>
          {delayedStages.length > 0 && (
            <div className="col-span-full">
              <Card><CardContent className="py-3">
                <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> 지연 단계
                </p>
                {delayedStages.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-gray-700">{s.stage_name}</span>
                    <span className="text-red-600 text-xs">마감: {s.deadline} (D+{Math.abs(Math.ceil((new Date(s.deadline!).getTime() - Date.now()) / 86400000))})</span>
                  </div>
                ))}
              </CardContent></Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
