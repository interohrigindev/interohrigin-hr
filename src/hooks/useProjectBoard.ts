import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type {
  ProjectBoard, PipelineStage, ProjectUpdate,
  ProjectWithStages, ProjectTemplate, BoardPermission,
  StageStatus, TemplateStage,
} from '@/types/project-board'

interface EmployeeBasic { id: string; name: string; department_id: string | null }
interface DepartmentBasic { id: string; name: string }

export function useProjectBoard(statusFilter?: string) {
  const { profile } = useAuth()
  const [projects, setProjects] = useState<ProjectWithStages[]>([])
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [permissions, setPermissions] = useState<BoardPermission[]>([])
  const [employees, setEmployees] = useState<EmployeeBasic[]>([])
  const [departments, setDepartments] = useState<DepartmentBasic[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)

    // 1단계: 프로젝트 + 스테이지 (핵심 데이터) 먼저 로드
    let projQuery = supabase.from('project_boards').select('*').order('priority').order('created_at', { ascending: false })
    if (statusFilter && statusFilter !== 'all') {
      projQuery = projQuery.eq('status', statusFilter)
    }

    const [projRes, stageRes] = await Promise.all([
      projQuery,
      supabase.from('pipeline_stages').select('*').order('stage_order'),
    ])

    const allProjects = (projRes.data || []) as ProjectBoard[]
    const allStages = (stageRes.data || []) as PipelineStage[]

    // O(n) Map으로 스테이지 그룹핑 (filter 반복 대신)
    const stageMap = new Map<string, PipelineStage[]>()
    for (const s of allStages) {
      const arr = stageMap.get(s.project_id) || []
      arr.push(s)
      stageMap.set(s.project_id, arr)
    }

    // 2단계: 보조 데이터 병렬 로드 (직원, 부서, 템플릿, 권한)
    const [tmplRes, permRes, empRes, deptRes] = await Promise.all([
      supabase.from('project_templates').select('*').order('name'),
      supabase.from('board_permissions').select('*'),
      supabase.from('employees').select('id, name, department_id').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name').order('name'),
    ])

    const emps = (empRes.data || []) as EmployeeBasic[]
    const empMap = new Map<string, string>()
    for (const e of emps) empMap.set(e.id, e.name)

    const enriched: ProjectWithStages[] = allProjects.map((p) => ({
      ...p,
      stages: stageMap.get(p.id) || [],
      assignee_names: p.assignee_ids?.map((id) => empMap.get(id) || '?') || [],
      manager_name: p.manager_id ? empMap.get(p.manager_id) : undefined,
      leader_name: p.leader_id ? empMap.get(p.leader_id) : undefined,
      executive_name: p.executive_id ? empMap.get(p.executive_id) : undefined,
    }))

    setProjects(enriched)
    setTemplates((tmplRes.data || []) as ProjectTemplate[])
    setPermissions((permRes.data || []) as BoardPermission[])
    setEmployees(emps)
    setDepartments((deptRes.data || []) as DepartmentBasic[])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // Realtime for stage changes
  useEffect(() => {
    const channel = supabase
      .channel('board-stages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_stages' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_boards' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  // ─── Create project from template ──────────────────────────
  async function createProject(data: {
    brand: string
    category: string
    project_name: string
    launch_date: string | null
    template_type: string
    assignee_ids: string[]
    shared_departments?: string[]
    custom_stages?: TemplateStage[]
  }): Promise<{ error: string | null; id?: string }> {
    if (!profile?.id) return { error: '로그인 필요' }

    const { shared_departments, custom_stages, ...rest } = data
    const { data: project, error } = await supabase
      .from('project_boards')
      .insert({
        ...rest,
        shared_departments: shared_departments || [],
        status: 'active',
        created_by: profile.id,
      })
      .select()
      .single()

    if (error || !project) return { error: error?.message || '생성 실패' }

    // custom_stages가 있으면 사용, 없으면 템플릿에서 가져옴
    const template = templates.find((t) => t.template_type === data.template_type)
    const stageSource = custom_stages || (template?.stages as TemplateStage[]) || []

    if (stageSource.length > 0) {
      let cursor = new Date()

      const stages = stageSource.map((s) => {
        // deadline이 직접 지정되었으면 사용, 아니면 기간으로 계산
        let stageDeadline: string
        if (s.deadline) {
          stageDeadline = s.deadline
          cursor = new Date(s.deadline)
        } else {
          const dl = new Date(cursor)
          dl.setDate(dl.getDate() + s.default_duration_days)
          stageDeadline = dl.toISOString().split('T')[0]
          cursor = dl
        }
        return {
          project_id: project.id,
          stage_name: s.name,
          stage_order: s.order,
          status: '시작전',
          deadline: stageDeadline,
          editable_departments: s.editable_departments || [data.brand],
        }
      })

      await supabase.from('pipeline_stages').insert(stages)
    }

    await fetchData()
    return { error: null, id: project.id }
  }

  // ─── 부서별 템플릿 필터 ──────────────────────────────────
  function getTemplatesForDepartment(department: string): ProjectTemplate[] {
    return templates.filter((t) => t.department === department)
  }

  // ─── 커스텀 템플릿 저장 ──────────────────────────────────
  async function saveTemplate(data: {
    name: string
    department: string
    stages: TemplateStage[]
  }): Promise<{ error: string | null }> {
    const templateType = 'custom_' + Date.now()
    const totalDays = data.stages.reduce((sum, s) => sum + s.default_duration_days, 0)
    const { error } = await supabase.from('project_templates').insert({
      name: data.name,
      template_type: templateType,
      department: data.department,
      stages: data.stages.map((s) => ({ name: s.name, order: s.order, default_duration_days: s.default_duration_days })),
      avg_total_days: totalDays,
    })
    if (error) return { error: error.message }
    await fetchData()
    return { error: null }
  }

  // ─── Update stage status ───────────────────────────────────
  async function updateStageStatus(
    stageId: string,
    newStatus: StageStatus,
    projectId: string
  ): Promise<{ error: string | null }> {
    if (!profile?.id) return { error: '로그인 필요' }

    const stage = projects.flatMap((p) => p.stages).find((s) => s.id === stageId)
    const oldStatus = stage?.status

    const updateData: Record<string, unknown> = { status: newStatus }
    if (newStatus === '완료') updateData.completed_at = new Date().toISOString()

    const { error } = await supabase
      .from('pipeline_stages')
      .update(updateData)
      .eq('id', stageId)

    if (error) return { error: error.message }

    // Auto-log update
    if (oldStatus && oldStatus !== newStatus) {
      await supabase.from('project_updates').insert({
        project_id: projectId,
        stage_id: stageId,
        author_id: profile.id,
        content: `${stage?.stage_name}: ${oldStatus} → ${newStatus}`,
        status_changed_from: oldStatus,
        status_changed_to: newStatus,
      })
    }

    await fetchData()
    return { error: null }
  }

  // ─── Update project ────────────────────────────────────────
  async function updateProject(
    projectId: string,
    data: Partial<ProjectBoard>
  ): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('project_boards')
      .update(data)
      .eq('id', projectId)

    if (error) return { error: error.message }
    await fetchData()
    return { error: null }
  }

  // ─── Add update log ────────────────────────────────────────
  async function addUpdate(data: {
    project_id: string
    stage_id?: string
    content: string
    is_cross_dept_request?: boolean
    requested_department?: string
    attachments?: { url: string; name: string; size: number; type: string }[]
  }): Promise<{ error: string | null }> {
    if (!profile?.id) return { error: '로그인 필요' }

    const { error } = await supabase.from('project_updates').insert({
      project_id: data.project_id,
      stage_id: data.stage_id || null,
      author_id: profile.id,
      content: data.content,
      is_cross_dept_request: data.is_cross_dept_request || false,
      requested_department: data.requested_department || null,
      request_status: data.is_cross_dept_request ? 'pending' : null,
      attachments: data.attachments || [],
    })

    if (error) return { error: error.message }
    return { error: null }
  }

  // ─── Fetch updates for a project ───────────────────────────
  async function fetchUpdates(projectId: string): Promise<(ProjectUpdate & { author_name: string })[]> {
    const [updRes, empRes] = await Promise.all([
      supabase
        .from('project_updates')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name').eq('is_active', true),
    ])

    const emps = (empRes.data || []) as { id: string; name: string }[]

    return ((updRes.data || []) as ProjectUpdate[]).map((u) => ({
      ...u,
      author_name: emps.find((e) => e.id === u.author_id)?.name || '?',
    }))
  }

  // ─── Update request status ─────────────────────────────────
  async function updateRequestStatus(
    updateId: string,
    status: 'accepted' | 'completed' | 'rejected'
  ): Promise<{ error: string | null }> {
    const data: Record<string, unknown> = { request_status: status }
    if (status === 'completed') data.request_completed_at = new Date().toISOString()

    const { error } = await supabase
      .from('project_updates')
      .update(data)
      .eq('id', updateId)

    if (error) return { error: error.message }
    return { error: null }
  }

  // ─── Update stage deadline ─────────────────────────────────
  async function updateStageDeadline(stageId: string, deadline: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('pipeline_stages')
      .update({ deadline })
      .eq('id', stageId)
    if (error) return { error: error.message }
    await fetchData()
    return { error: null }
  }

  // ─── Pipeline stage CRUD (기존 프로젝트 편집용) ────────────
  async function addStage(projectId: string, stageName: string, order: number, deadline?: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('pipeline_stages').insert({
      project_id: projectId,
      stage_name: stageName,
      stage_order: order,
      status: '시작전',
      deadline: deadline || null,
    })
    if (error) return { error: error.message }
    await fetchData()
    return { error: null }
  }

  async function removeStage(stageId: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('pipeline_stages').delete().eq('id', stageId)
    if (error) return { error: error.message }
    await fetchData()
    return { error: null }
  }

  async function updateStageName(stageId: string, name: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('pipeline_stages').update({ stage_name: name }).eq('id', stageId)
    if (error) return { error: error.message }
    return { error: null }
  }

  async function reorderStages(stages: { id: string; order: number }[]): Promise<{ error: string | null }> {
    for (const s of stages) {
      const { error } = await supabase.from('pipeline_stages').update({ stage_order: s.order }).eq('id', s.id)
      if (error) return { error: error.message }
    }
    await fetchData()
    return { error: null }
  }

  // ─── Delete project ────────────────────────────────────────
  async function deleteProject(projectId: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('project_boards')
      .delete()
      .eq('id', projectId)
    if (error) return { error: error.message }
    await fetchData()
    return { error: null }
  }

  // ─── Permission helper ─────────────────────────────────────
  function getMyPermission(): BoardPermission | null {
    if (!profile) return null
    if (profile.role === 'ceo' || profile.role === 'admin' || profile.role === 'director' || profile.role === 'division_head') {
      return permissions.find((p) => p.department === '임원') || null
    }
    // Match by department name (simplified)
    return permissions.find((p) => p.can_view) || null
  }

  function canEditProject(): boolean {
    if (!profile?.role) return false
    return ['director', 'division_head', 'ceo', 'admin'].includes(profile.role)
  }

  function canDeleteProject(): boolean {
    if (!profile?.role) return false
    return ['director', 'division_head', 'ceo', 'admin'].includes(profile.role)
  }

  return {
    projects, templates, permissions, employees, departments, loading,
    createProject, updateProject, deleteProject,
    updateStageStatus, updateStageDeadline,
    addStage, removeStage, updateStageName, reorderStages,
    addUpdate, fetchUpdates, updateRequestStatus,
    getMyPermission, getTemplatesForDepartment, saveTemplate,
    canEditProject, canDeleteProject,
    refresh: fetchData,
  }
}
