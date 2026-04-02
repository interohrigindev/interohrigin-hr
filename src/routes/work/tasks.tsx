import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, ImagePlus, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import type { Task, TaskStatus, TaskPriority, Project, TaskImage } from '@/types/work'
import type { Employee } from '@/types/database'

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '긴급',
  high: '높음',
  normal: '보통',
  low: '낮음',
}
const PRIORITY_VARIANTS: Record<string, 'danger' | 'warning' | 'default' | 'info'> = {
  urgent: 'danger',
  high: 'warning',
  normal: 'default',
  low: 'info',
}
const STATUS_LABELS: Record<string, string> = {
  todo: '예정',
  in_progress: '진행중',
  done: '완료',
  cancelled: '취소',
}
const STATUS_CYCLE: Record<string, TaskStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
}

interface TaskForm {
  title: string
  description: string
  project_id: string
  assignee_id: string
  priority: TaskPriority
  status: TaskStatus
  due_date: string
  estimated_hours: string
  images: TaskImage[]
}

const emptyForm: TaskForm = {
  title: '',
  description: '',
  project_id: '',
  assignee_id: '',
  priority: 'normal',
  status: 'todo',
  due_date: '',
  estimated_hours: '',
  images: [],
}

export default function TaskManage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')
  const [filterProject, setFilterProject] = useState<string>('')
  const [filterAssignee, setFilterAssignee] = useState<string>('')

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TaskForm>(emptyForm)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [taskRes, projRes, empRes] = await Promise.all([
      supabase.from('tasks').select('*').order('sort_order', { ascending: true }),
      supabase.from('projects').select('*'),
      supabase.from('employees').select('*').eq('is_active', true),
    ])
    if (taskRes.data) setTasks(taskRes.data as Task[])
    if (projRes.data) setProjects(projRes.data as Project[])
    if (empRes.data) setEmployees(empRes.data as Employee[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Filter
  const filtered = tasks.filter((t) => {
    if (filterStatus && t.status !== filterStatus) return false
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterProject && t.project_id !== filterProject) return false
    if (filterAssignee && t.assignee_id !== filterAssignee) return false
    return true
  })

  // Status toggle
  async function toggleStatus(task: Task) {
    const next = STATUS_CYCLE[task.status] || 'todo'
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (error) { toast('상태 변경 실패', 'error'); return }
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: next } : t))
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(t: Task) {
    setEditingId(t.id)
    setForm({
      title: t.title,
      description: t.description || '',
      project_id: t.project_id || '',
      assignee_id: t.assignee_id || '',
      priority: t.priority,
      status: t.status,
      due_date: t.due_date || '',
      estimated_hours: t.estimated_hours?.toString() || '',
      images: t.images || [],
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast('작업 제목을 입력하세요.', 'error')
      return
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      project_id: form.project_id || null,
      assignee_id: form.assignee_id || null,
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
      images: form.images,
    }

    if (editingId) {
      const { error } = await supabase.from('tasks').update(payload).eq('id', editingId)
      if (error) { toast('수정 실패: ' + error.message, 'error'); return }
      toast('작업이 수정되었습니다.', 'success')
    } else {
      const { error } = await supabase.from('tasks').insert(payload)
      if (error) { toast('생성 실패: ' + error.message, 'error'); return }
      toast('작업이 생성되었습니다.', 'success')
    }

    setDialogOpen(false)
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 작업을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) { toast('삭제 실패: ' + error.message, 'error'); return }
    toast('작업이 삭제되었습니다.', 'success')
    fetchData()
  }

  if (loading) return <PageSpinner />

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">작업 관리</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> 새 작업
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              options={[{ value: '', label: '전체 상태' }, ...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))]}
            />
            <Select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              options={[{ value: '', label: '전체 우선순위' }, ...Object.entries(PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l }))]}
            />
            <Select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              options={[{ value: '', label: '전체 프로젝트' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
            />
            <Select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              options={[{ value: '', label: '전체 담당자' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Task List */}
      <Card>
        <CardHeader>
          <CardTitle>작업 목록 ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">조건에 맞는 작업이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((task) => {
                const assignee = employees.find((e) => e.id === task.assignee_id)
                const project = projects.find((p) => p.id === task.project_id)
                const isOverdue = task.status !== 'done' && task.status !== 'cancelled' && task.due_date && task.due_date < today

                return (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isOverdue ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Status toggle button */}
                      <button
                        onClick={() => toggleStatus(task)}
                        className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                          task.status === 'done'
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : task.status === 'in_progress'
                              ? 'bg-blue-100 border-blue-400 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-400'
                        }`}
                        title={`클릭하여 상태 변경: ${STATUS_LABELS[task.status]}`}
                      >
                        {task.status === 'done' ? '✓' : task.status === 'in_progress' ? '▶' : ''}
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant={PRIORITY_VARIANTS[task.priority]} className="text-[10px] shrink-0">
                            {PRIORITY_LABELS[task.priority]}
                          </Badge>
                          <span className={`text-sm font-medium truncate ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                            {task.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                          {project && <span>{project.name}</span>}
                          {assignee && <span>| {assignee.name}</span>}
                          {task.due_date && (
                            <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                              | {task.due_date}
                            </span>
                          )}
                          {(task.images || []).length > 0 && (
                            <span className="text-brand-600">| <ImagePlus className="h-3 w-3 inline" /> {task.images.length}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(task)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(task.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? '작업 수정' : '새 작업'}
        className="max-w-lg"
      >
        <div className="space-y-4">
          <Input
            label="작업 제목 *"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          />
          <Textarea
            label="설명"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            rows={3}
          />

          {/* 이미지 첨부 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이미지 첨부</label>
            {form.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {form.images.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img src={img.url} alt={img.name} className="w-20 h-20 object-cover rounded-lg border" />
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <p className="text-[10px] text-gray-500 text-center mt-0.5 truncate w-20">{img.name}</p>
                  </div>
                ))}
              </div>
            )}
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors">
              <ImagePlus className="h-4 w-4" />
              이미지 추가
              <input
                type="file"
                accept="image/*"
                className="hidden"
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files || [])
                  if (files.length === 0) return
                  for (const file of files) {
                    if (file.size > 5 * 1024 * 1024) {
                      toast('이미지는 5MB 이하만 가능합니다.', 'error')
                      continue
                    }
                    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
                    const path = `task-images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
                    const { error: uploadErr } = await supabase.storage.from('chat-attachments').upload(path, file)
                    if (uploadErr) {
                      toast('업로드 실패: ' + uploadErr.message, 'error')
                      continue
                    }
                    const { data: urlData } = supabase.storage.from('chat-attachments').getPublicUrl(path)
                    setForm(p => ({
                      ...p,
                      images: [...p.images, { url: urlData.publicUrl, name: file.name, size: file.size }],
                    }))
                  }
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <Select
            label="프로젝트"
            value={form.project_id}
            onChange={(e) => setForm((p) => ({ ...p, project_id: e.target.value }))}
            options={[{ value: '', label: '선택 안 함' }, ...projects.map((pr) => ({ value: pr.id, label: pr.name }))]}
          />
          <Select
            label="담당자"
            value={form.assignee_id}
            onChange={(e) => setForm((p) => ({ ...p, assignee_id: e.target.value }))}
            options={[{ value: '', label: '선택 안 함' }, ...employees.map((em) => ({ value: em.id, label: em.name }))]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="우선순위"
              value={form.priority}
              onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as TaskPriority }))}
              options={Object.entries(PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
            <Select
              label="상태"
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as TaskStatus }))}
              options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="마감일"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
            />
            <Input
              label="예상 시간(h)"
              type="number"
              value={form.estimated_hours}
              onChange={(e) => setForm((p) => ({ ...p, estimated_hours: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave}>{editingId ? '수정' : '생성'}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
