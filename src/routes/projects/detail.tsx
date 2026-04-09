import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import DOMPurify from 'dompurify'
import {
  ArrowLeft, Plus, Send, FileText, Bell,
  BarChart3, CheckCircle, Loader2, AlertTriangle, ListChecks,
  Pencil, X, ChevronUp, ChevronDown, Trash2, ChevronRight, Download,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { RichEditor } from '@/components/ui/RichEditor'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useProjectBoard } from '@/hooks/useProjectBoard'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ProjectUpdate, ProjectStatus, StageStatus } from '@/types/project-board'
import type { Task, TaskPriority, TaskStatus } from '@/types/work'
import AllocationChart from '@/components/projects/AllocationChart'
import { STAGE_STATUS_COLORS, STAGE_STATUS_DOT, PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS } from '@/types/project-board'

const STATUS_OPTIONS: StageStatus[] = ['시작전', '진행중', '완료', '홀딩']

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { profile } = useAuth()
  const {
    projects, employees, departments,
    updateStageStatus, updateStageDeadline,
    addStage, removeStage, updateStageName, reorderStages,
    addUpdate, fetchUpdates, updateRequestStatus,
    updateProject, deleteProject, canDeleteProject,
  } = useProjectBoard()

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
  const [taskDescription, setTaskDescription] = useState('')
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())

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

  // Project edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editForm, setEditForm] = useState({
    project_name: '',
    brand: '',
    category: '',
    launch_date: '',
    status: 'active' as ProjectStatus,
    priority: 5,
    assignee_ids: [] as string[],
    manager_id: '',
    leader_id: '',
    executive_id: '',
    shared_departments: [] as string[],
  })

  // Pipeline editing
  const [pipelineEditMode, setPipelineEditMode] = useState(false)
  const [editingNames, setEditingNames] = useState<Record<string, string>>({})
  const [newStageName, setNewStageName] = useState('')
  const [pipelineSaving, setPipelineSaving] = useState(false)

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
      description: taskDescription || null,
      assignee_id: taskAssignee || null,
      priority: taskPriority,
      status: 'todo',
      due_date: taskDueDate || null,
      sort_order: linkedTasks.length,
    })
    setSaving(false)
    if (error) { toast('작업 추가 실패: ' + error.message, 'error'); return }
    toast('작업이 추가되었습니다', 'success')
    setTaskTitle(''); setTaskAssignee(''); setTaskPriority('normal'); setTaskDueDate(''); setTaskDescription('')
    setShowTaskForm(false)
    loadTasks()
  }

  async function toggleTaskStatus(task: Task) {
    const next: Record<TaskStatus, TaskStatus> = { todo: 'in_progress', in_progress: 'done', done: 'todo', cancelled: 'todo' }
    await supabase.from('tasks').update({ status: next[task.status] }).eq('id', task.id)
    loadTasks()
  }

  function toggleExpandTask(taskId: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / 1048576).toFixed(1)}MB`
  }

  function openEditDialog() {
    if (!project) return
    setEditForm({
      project_name: project.project_name,
      brand: project.brand,
      category: project.category,
      launch_date: project.launch_date || '',
      status: project.status,
      priority: project.priority || 5,
      assignee_ids: project.assignee_ids || [],
      manager_id: project.manager_id || '',
      leader_id: project.leader_id || '',
      executive_id: project.executive_id || '',
      shared_departments: project.shared_departments || [],
    })
    setShowEditDialog(true)
  }

  async function handleSaveEdit() {
    if (!project) return
    setSaving(true)
    const result = await updateProject(project.id, {
      project_name: editForm.project_name,
      brand: editForm.brand,
      category: editForm.category,
      launch_date: editForm.launch_date || null,
      status: editForm.status,
      priority: editForm.priority,
      assignee_ids: editForm.assignee_ids,
      manager_id: editForm.manager_id || null,
      leader_id: editForm.leader_id || null,
      executive_id: editForm.executive_id || null,
      shared_departments: editForm.shared_departments,
    } as any)
    setSaving(false)
    if (result.error) { toast('수정 실패: ' + result.error, 'error'); return }
    toast('프로젝트가 수정되었습니다', 'success')
    setShowEditDialog(false)
  }

  async function handleDeleteProject() {
    if (!project) return
    if (!confirm(`"${project.project_name}" 프로젝트를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    const result = await deleteProject(project.id)
    if (result.error) { toast('삭제 실패: ' + result.error, 'error'); return }
    toast('프로젝트가 삭제되었습니다', 'success')
    navigate('/admin/projects')
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
            {project.brand} · {project.category} · 출시: {project.launch_date || '미정'} · 참여: {project.assignee_names?.join(', ')}
            {project.manager_name && ` · 담당: ${project.manager_name}`}
            {project.leader_name && ` · 리더: ${project.leader_name}`}
            {project.executive_name && ` · 이사: ${project.executive_name}`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={openEditDialog}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> 수정
          </Button>
          {canDeleteProject() && (
            <Button size="sm" variant="outline" onClick={handleDeleteProject} className="text-red-600 hover:bg-red-50">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> 삭제
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline progress */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">파이프라인 진행 ({completedStages}/{stages.length})</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-brand-600">{progressPercent}%</span>
              <button
                onClick={() => {
                  if (pipelineEditMode) {
                    setEditingNames({})
                    setNewStageName('')
                  }
                  setPipelineEditMode(!pipelineEditMode)
                }}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors ${
                  pipelineEditMode
                    ? 'bg-brand-50 border-brand-300 text-brand-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {pipelineEditMode ? <><X className="h-3 w-3" /> 편집 종료</> : <><Pencil className="h-3 w-3" /> 편집</>}
              </button>
            </div>
          </div>

          {!pipelineEditMode && (
            <div className="h-2 bg-gray-100 rounded-full mb-4">
              <div className="h-2 bg-brand-500 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          )}

          {pipelineEditMode ? (
            /* ── 편집 모드 ── */
            <div className="space-y-2">
              {stages.map((stage, i) => (
                <div key={stage.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <Badge variant="default" className="shrink-0 w-6 justify-center text-[10px]">{i + 1}</Badge>
                  <input
                    type="text"
                    value={editingNames[stage.id] ?? stage.stage_name}
                    onChange={(e) => setEditingNames((prev) => ({ ...prev, [stage.id]: e.target.value }))}
                    onBlur={async () => {
                      const newName = editingNames[stage.id]
                      if (newName && newName !== stage.stage_name) {
                        await updateStageName(stage.id, newName)
                      }
                    }}
                    className="flex-1 text-sm font-medium bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-brand-400"
                  />
                  <select
                    value={stage.status}
                    onChange={(e) => handleStatusChange(stage.id, e.target.value as StageStatus)}
                    className={`text-[10px] rounded px-1.5 py-1 border-0 ${STAGE_STATUS_COLORS[stage.status]}`}
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input
                    type="date"
                    value={stage.deadline || ''}
                    onChange={(e) => handleDeadlineChange(stage.id, e.target.value)}
                    className="text-[10px] text-gray-500 border border-gray-200 rounded px-1 py-1 bg-white"
                  />
                  <div className="flex flex-col shrink-0">
                    <button
                      onClick={async () => {
                        if (i === 0) return
                        const reordered = stages.map((s, j) => ({
                          id: s.id,
                          order: j === i ? i : j === i - 1 ? i + 1 : j + 1,
                        }))
                        setPipelineSaving(true)
                        await reorderStages(reordered)
                        setPipelineSaving(false)
                      }}
                      disabled={i === 0 || pipelineSaving}
                      className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={async () => {
                        if (i === stages.length - 1) return
                        const reordered = stages.map((s, j) => ({
                          id: s.id,
                          order: j === i ? i + 2 : j === i + 1 ? i + 1 : j + 1,
                        }))
                        setPipelineSaving(true)
                        await reorderStages(reordered)
                        setPipelineSaving(false)
                      }}
                      disabled={i === stages.length - 1 || pipelineSaving}
                      className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm(`"${stage.stage_name}" 단계를 삭제하시겠습니까?`)) return
                      setPipelineSaving(true)
                      await removeStage(stage.id)
                      setPipelineSaving(false)
                      toast('단계가 삭제되었습니다', 'success')
                    }}
                    disabled={pipelineSaving}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {/* 단계 추가 */}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="새 단계 이름"
                  className="flex-1 text-sm bg-white border border-dashed border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-brand-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newStageName.trim()) {
                      (async () => {
                        setPipelineSaving(true)
                        await addStage(project.id, newStageName.trim(), stages.length + 1)
                        setNewStageName('')
                        setPipelineSaving(false)
                        toast('단계가 추가되었습니다', 'success')
                      })()
                    }
                  }}
                />
                <Button
                  size="sm"
                  disabled={!newStageName.trim() || pipelineSaving}
                  onClick={async () => {
                    setPipelineSaving(true)
                    await addStage(project.id, newStageName.trim(), stages.length + 1)
                    setNewStageName('')
                    setPipelineSaving(false)
                    toast('단계가 추가되었습니다', 'success')
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> 추가
                </Button>
              </div>
            </div>
          ) : (
            /* ── 기본 보기 ── */
            <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${Math.min(stages.length, 7)}, minmax(0, 1fr))` }}>
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
          )}
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">내용</label>
                  <RichEditor
                    value={updateContent}
                    onChange={setUpdateContent}
                    placeholder="진행 상황을 기록하세요... (이미지 붙여넣기, 파일 드래그 가능)"
                    minHeight="150px"
                  />
                </div>
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
                      <div className="text-sm text-gray-700 prose prose-sm max-w-none [&_img]:rounded-lg [&_img]:max-w-full [&_a]:text-blue-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(u.content || '') }} />
                      {u.attachments && u.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {u.attachments.map((att: { url: string; name: string; size: number; type: string }, ai: number) => (
                            <a
                              key={ai}
                              href={att.url}
                              download={att.name}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
                            >
                              <Download className="h-3.5 w-3.5 text-gray-400" />
                              <span className="text-gray-700 truncate max-w-[200px]">{att.name}</span>
                              <span className="text-xs text-gray-400">({formatFileSize(att.size)})</span>
                            </a>
                          ))}
                        </div>
                      )}
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
          {/* 업무 할당 차트 */}
          {linkedTasks.length > 0 && (
            <AllocationChart
              tasks={linkedTasks.map((t) => ({
                assignee_id: t.assignee_id,
                assignee_name: employees.find((e) => e.id === t.assignee_id)?.name || '미배정',
                status: t.status,
              }))}
              employees={employees}
            />
          )}

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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">상세 내용</label>
                  <RichEditor
                    value={taskDescription}
                    onChange={setTaskDescription}
                    placeholder="작업 내용을 상세히 작성하세요... (이미지 붙여넣기, 파일 드래그 가능)"
                    minHeight="180px"
                  />
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
            ) : [...linkedTasks]
              .sort((a, b) => {
                // 완료된 건 맨 아래
                if (a.status === 'done' && b.status !== 'done') return 1
                if (a.status !== 'done' && b.status === 'done') return -1
                // 긴급 → 마감 임박 순서
                const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
                const pDiff = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
                if (pDiff !== 0) return pDiff
                // 마감일 빠른 순
                if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
                if (a.due_date) return -1
                return 1
              })
              .map((task) => {
              const priorityColor = task.priority === 'urgent' ? 'bg-red-100 text-red-700' : task.priority === 'high' ? 'bg-amber-100 text-amber-700' : task.priority === 'normal' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              const statusIcon = task.status === 'done' ? '✅' : task.status === 'in_progress' ? '🔄' : '⬜'
              const isOverdue = task.status !== 'done' && task.due_date && new Date(task.due_date) < new Date()
              const daysUntilDue = task.due_date && task.status !== 'done' ? Math.ceil((new Date(task.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
              const isUrgentSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3
              const assigneeName = employees.find((e) => e.id === task.assignee_id)?.name
              const isExpanded = expandedTasks.has(task.id)

              return (
                <div key={task.id} className={`border rounded-lg overflow-hidden ${isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-200'} ${task.status === 'done' ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-3 p-3">
                    <button onClick={(e) => { e.stopPropagation(); toggleTaskStatus(task) }} className="text-lg shrink-0" title="상태 변경">
                      {statusIcon}
                    </button>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpandTask(task.id)}>
                      <span className={`text-sm ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {task.title}
                      </span>
                    </div>
                    <Badge className={`text-[10px] ${priorityColor}`}>{task.priority}</Badge>
                    {assigneeName && <span className="text-xs text-gray-500">{assigneeName}</span>}
                    {task.due_date && (
                      <span className={`text-[10px] ${isOverdue ? 'text-red-600 font-bold' : isUrgentSoon ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                        {isOverdue ? `⚠️ ${Math.abs(daysUntilDue!)}일 지연` : isUrgentSoon ? `🔥 D-${daysUntilDue}` : task.due_date.slice(5)}
                      </span>
                    )}
                    <button onClick={() => toggleExpandTask(task.id)} className="p-1 rounded hover:bg-gray-100 shrink-0 transition-colors">
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-gray-400" />
                        : <ChevronRight className="h-4 w-4 text-gray-400" />
                      }
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-0 ml-10 border-t border-gray-100">
                      {task.description ? (
                        <div className="text-sm text-gray-700 prose prose-sm max-w-none mt-2 [&_img]:rounded-lg [&_img]:max-w-full [&_a]:text-blue-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(task.description) }} />
                      ) : (
                        <p className="text-sm text-gray-400 mt-2">상세 내용 없음</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-2">
                        작성일: {new Date(task.created_at).toLocaleDateString('ko-KR')}
                        {task.updated_at !== task.created_at && ` · 수정일: ${new Date(task.updated_at).toLocaleDateString('ko-KR')}`}
                      </p>
                    </div>
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
                      ...departments.map((d) => ({ value: d.name, label: d.name })),
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

      {/* ─── 프로젝트 수정 다이얼로그 ──────────────────────── */}
      <Dialog open={showEditDialog} onClose={() => setShowEditDialog(false)} title="프로젝트 수정" className="max-w-xl">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input
            id="edit-project-name"
            label="프로젝트명 *"
            value={editForm.project_name}
            onChange={(e) => setEditForm(f => ({ ...f, project_name: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="edit-brand"
              label="브랜드"
              value={editForm.brand}
              onChange={(e) => setEditForm(f => ({ ...f, brand: e.target.value }))}
            />
            <Input
              id="edit-category"
              label="구분"
              value={editForm.category}
              onChange={(e) => setEditForm(f => ({ ...f, category: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              id="edit-launch-date"
              label="출시일"
              type="date"
              value={editForm.launch_date}
              onChange={(e) => setEditForm(f => ({ ...f, launch_date: e.target.value }))}
            />
            <Select
              id="edit-status"
              label="상태"
              value={editForm.status}
              onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value as ProjectStatus }))}
              options={[
                { value: 'active', label: '진행중' },
                { value: 'holding', label: '홀딩' },
                { value: 'completed', label: '완료' },
                { value: 'cancelled', label: '취소' },
              ]}
            />
            <Select
              id="edit-priority"
              label="우선순위"
              value={String(editForm.priority)}
              onChange={(e) => setEditForm(f => ({ ...f, priority: parseInt(e.target.value) }))}
              options={[1,2,3,4,5,6,7,8,9,10].map(n => ({ value: String(n), label: `P${n}` }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select
              id="edit-manager"
              label="담당자"
              value={editForm.manager_id}
              onChange={(e) => setEditForm(f => ({ ...f, manager_id: e.target.value }))}
              options={[{ value: '', label: '미지정' }, ...employees.map(e => ({ value: e.id, label: e.name }))]}
            />
            <Select
              id="edit-leader"
              label="리더"
              value={editForm.leader_id}
              onChange={(e) => setEditForm(f => ({ ...f, leader_id: e.target.value }))}
              options={[{ value: '', label: '미지정' }, ...employees.map(e => ({ value: e.id, label: e.name }))]}
            />
            <Select
              id="edit-executive"
              label="이사"
              value={editForm.executive_id}
              onChange={(e) => setEditForm(f => ({ ...f, executive_id: e.target.value }))}
              options={[{ value: '', label: '미지정' }, ...employees.map(e => ({ value: e.id, label: e.name }))]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">참여자</label>
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-0.5">
              {employees.map(emp => (
                <label key={emp.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.assignee_ids.includes(emp.id)}
                    onChange={(e) => {
                      if (e.target.checked) setEditForm(f => ({ ...f, assignee_ids: [...f.assignee_ids, emp.id] }))
                      else setEditForm(f => ({ ...f, assignee_ids: f.assignee_ids.filter(id => id !== emp.id) }))
                    }}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700">{emp.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">공유 부서</label>
            <div className="flex flex-wrap gap-2 border border-gray-200 rounded-lg p-2">
              {departments.map(dept => (
                <label key={dept.id} className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.shared_departments.includes(dept.name)}
                    onChange={(e) => {
                      if (e.target.checked) setEditForm(f => ({ ...f, shared_departments: [...f.shared_departments, dept.name] }))
                      else setEditForm(f => ({ ...f, shared_departments: f.shared_departments.filter(d => d !== dept.name) }))
                    }}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700">{dept.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>취소</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '저장'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
