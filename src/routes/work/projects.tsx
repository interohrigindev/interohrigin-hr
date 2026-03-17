import { useState, useEffect, useCallback } from 'react'
import { Plus, Sparkles, Trash2, Edit2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { generateAIContent, type AIConfig } from '@/lib/ai-client'
import type { Project, Task, ProjectStatus } from '@/types/work'
import type { Department, Employee } from '@/types/database'

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'planning', label: '기획' },
  { value: 'active', label: '진행중' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '취소' },
]

const STATUS_VARIANTS: Record<string, 'default' | 'primary' | 'success' | 'danger'> = {
  planning: 'default',
  active: 'primary',
  completed: 'success',
  cancelled: 'danger',
}

interface ProjectForm {
  name: string
  description: string
  department_id: string
  owner_id: string
  start_date: string
  end_date: string
  status: ProjectStatus
}

const emptyForm: ProjectForm = {
  name: '',
  description: '',
  department_id: '',
  owner_id: '',
  start_date: '',
  end_date: '',
  status: 'planning',
}

export default function ProjectManage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProjectForm>(emptyForm)

  // AI
  const [aiLoading, setAiLoading] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [projRes, taskRes, deptRes, empRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').order('sort_order', { ascending: true }),
      supabase.from('departments').select('*'),
      supabase.from('employees').select('*').eq('is_active', true),
    ])
    if (projRes.data) setProjects(projRes.data as Project[])
    if (taskRes.data) setTasks(taskRes.data as Task[])
    if (deptRes.data) setDepartments(deptRes.data)
    if (empRes.data) setEmployees(empRes.data as Employee[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(p: Project) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      description: p.description || '',
      department_id: p.department_id || '',
      owner_id: p.owner_id || '',
      start_date: p.start_date || '',
      end_date: p.end_date || '',
      status: p.status,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast('프로젝트 이름을 입력하세요.', 'error')
      return
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      department_id: form.department_id || null,
      owner_id: form.owner_id || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: form.status,
    }

    if (editingId) {
      const { error } = await supabase.from('projects').update(payload).eq('id', editingId)
      if (error) { toast('수정 실패: ' + error.message, 'error'); return }
      toast('프로젝트가 수정되었습니다.', 'success')
    } else {
      const { error } = await supabase.from('projects').insert(payload)
      if (error) { toast('생성 실패: ' + error.message, 'error'); return }
      toast('프로젝트가 생성되었습니다.', 'success')
    }

    setDialogOpen(false)
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 프로젝트를 삭제하시겠습니까?')) return
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) { toast('삭제 실패: ' + error.message, 'error'); return }
    toast('프로젝트가 삭제되었습니다.', 'success')
    fetchData()
  }

  // AI Task Decomposition
  async function handleAIDecompose(project: Project) {
    setAiLoading(project.id)
    try {
      const { data: aiSettings } = await supabase
        .from('ai_settings').select('*').eq('is_active', true).limit(1).single()

      if (!aiSettings) {
        toast('AI 설정이 필요합니다. 설정 > AI 탭에서 API 키를 등록하세요.', 'error')
        setAiLoading(null)
        return
      }

      const config: AIConfig = {
        provider: aiSettings.provider,
        apiKey: aiSettings.api_key,
        model: aiSettings.model,
      }

      const deptEmployees = employees.filter(
        (e) => !project.department_id || e.department_id === project.department_id
      )
      const employeeList = deptEmployees.map((e) => `- ${e.name} (${e.role})`).join('\n')

      const prompt = `프로젝트를 세부 작업으로 분해하고 담당자를 배정해주세요.

프로젝트: ${project.name}
설명: ${project.description || '없음'}
기간: ${project.start_date || '미정'} ~ ${project.end_date || '미정'}

가용 인력:
${employeeList || '등록된 직원 없음'}

다음 JSON 배열 형식으로만 응답해주세요 (다른 텍스트 없이):
[
  {
    "title": "작업 제목",
    "description": "작업 설명",
    "priority": "normal",
    "assignee_name": "직원 이름 또는 null",
    "estimated_hours": 8,
    "sort_order": 1
  }
]

priority는 urgent, high, normal, low 중 하나입니다.
5~10개의 작업을 생성하세요.`

      const result = await generateAIContent(config, prompt)

      // Parse JSON from response
      const jsonMatch = result.content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        toast('AI 응답을 파싱할 수 없습니다.', 'error')
        setAiLoading(null)
        return
      }

      const aiTasks = JSON.parse(jsonMatch[0]) as {
        title: string
        description: string
        priority: string
        assignee_name: string | null
        estimated_hours: number
        sort_order: number
      }[]

      // Map assignee names to IDs
      const inserts = aiTasks.map((t) => {
        const assignee = t.assignee_name
          ? deptEmployees.find((e) => e.name === t.assignee_name)
          : null
        return {
          project_id: project.id,
          title: t.title,
          description: t.description || null,
          priority: t.priority || 'normal',
          status: 'todo' as const,
          assignee_id: assignee?.id || null,
          estimated_hours: t.estimated_hours || null,
          ai_generated: true,
          sort_order: t.sort_order || 0,
        }
      })

      const { error } = await supabase.from('tasks').insert(inserts)
      if (error) {
        toast('작업 저장 실패: ' + error.message, 'error')
      } else {
        toast(`${inserts.length}개 작업이 AI로 생성되었습니다.`, 'success')
        fetchData()
      }
    } catch (err: any) {
      toast('AI 오류: ' + err.message, 'error')
    }
    setAiLoading(null)
  }

  if (loading) return <PageSpinner />

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
  const TASK_STATUS_LABELS: Record<string, string> = {
    todo: '예정',
    in_progress: '진행중',
    done: '완료',
    cancelled: '취소',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">프로젝트 관리</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> 새 프로젝트
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-400">등록된 프로젝트가 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        projects.map((project) => {
          const projectTasks = tasks.filter((t) => t.project_id === project.id)
          const owner = employees.find((e) => e.id === project.owner_id)
          const dept = departments.find((d) => d.id === project.department_id)

          return (
            <Card key={project.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{project.name}</CardTitle>
                    <p className="text-xs text-gray-500 mt-1">
                      {dept && `${dept.name} · `}
                      {owner && `담당: ${owner.name} · `}
                      {project.start_date && `${project.start_date}`}
                      {project.end_date && ` ~ ${project.end_date}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[project.status] || 'default'}>
                      {STATUS_OPTIONS.find((o) => o.value === project.status)?.label || project.status}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(project)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(project.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {project.description && (
                  <p className="text-sm text-gray-600 mb-4">{project.description}</p>
                )}

                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-700">작업 ({projectTasks.length})</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAIDecompose(project)}
                    disabled={aiLoading === project.id}
                  >
                    {aiLoading === project.id ? (
                      <><Spinner size="sm" /> 분석 중...</>
                    ) : (
                      <><Sparkles className="h-3.5 w-3.5" /> AI 작업 분해</>
                    )}
                  </Button>
                </div>

                {projectTasks.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">작업이 없습니다.</p>
                ) : (
                  <div className="space-y-1">
                    {projectTasks.map((t) => {
                      const assignee = employees.find((e) => e.id === t.assignee_id)
                      return (
                        <div key={t.id} className="flex items-center justify-between p-2 rounded bg-gray-50 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant={PRIORITY_VARIANTS[t.priority]} className="text-[10px] shrink-0">
                              {PRIORITY_LABELS[t.priority]}
                            </Badge>
                            <span className="truncate">{t.title}</span>
                            {t.ai_generated && (
                              <Sparkles className="h-3 w-3 text-purple-400 shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {assignee && <span className="text-xs text-gray-500">{assignee.name}</span>}
                            <span className="text-xs text-gray-400">
                              {TASK_STATUS_LABELS[t.status]}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? '프로젝트 수정' : '새 프로젝트'}
        className="max-w-lg"
      >
        <div className="space-y-4">
          <Input
            label="프로젝트명 *"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Textarea
            label="설명"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            rows={3}
          />
          <Select
            label="부서"
            value={form.department_id}
            onChange={(e) => setForm((p) => ({ ...p, department_id: e.target.value }))}
            options={[{ value: '', label: '선택 안 함' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
          />
          <Select
            label="담당자"
            value={form.owner_id}
            onChange={(e) => setForm((p) => ({ ...p, owner_id: e.target.value }))}
            options={[{ value: '', label: '선택 안 함' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="시작일"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
            />
            <Input
              label="종료일"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
            />
          </div>
          <Select
            label="상태"
            value={form.status}
            onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ProjectStatus }))}
            options={STATUS_OPTIONS}
          />
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave}>{editingId ? '수정' : '생성'}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
