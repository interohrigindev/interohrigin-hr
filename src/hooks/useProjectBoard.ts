import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type {
  ProjectBoard, PipelineStage, ProjectUpdate,
  ProjectWithStages, ProjectTemplate, BoardPermission,
  StageStatus,
} from '@/types/project-board'

interface EmployeeBasic { id: string; name: string; department_id: string | null }

export function useProjectBoard() {
  const { profile } = useAuth()
  const [projects, setProjects] = useState<ProjectWithStages[]>([])
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [permissions, setPermissions] = useState<BoardPermission[]>([])
  const [employees, setEmployees] = useState<EmployeeBasic[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [projRes, stageRes, tmplRes, permRes, empRes] = await Promise.all([
      supabase.from('project_boards').select('*').order('priority').order('created_at', { ascending: false }),
      supabase.from('pipeline_stages').select('*').order('stage_order'),
      supabase.from('project_templates').select('*').order('name'),
      supabase.from('board_permissions').select('*'),
      supabase.from('employees').select('id, name, department_id').eq('is_active', true).order('name'),
    ])

    const allProjects = (projRes.data || []) as ProjectBoard[]
    const allStages = (stageRes.data || []) as PipelineStage[]
    const emps = (empRes.data || []) as EmployeeBasic[]

    const enriched: ProjectWithStages[] = allProjects.map((p) => ({
      ...p,
      stages: allStages.filter((s) => s.project_id === p.id),
      assignee_names: p.assignee_ids?.map((id) => emps.find((e) => e.id === id)?.name || '?') || [],
    }))

    setProjects(enriched)
    setTemplates((tmplRes.data || []) as ProjectTemplate[])
    setPermissions((permRes.data || []) as BoardPermission[])
    setEmployees(emps)
    setLoading(false)
  }, [])

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
  }): Promise<{ error: string | null; id?: string }> {
    if (!profile?.id) return { error: '로그인 필요' }

    const { data: project, error } = await supabase
      .from('project_boards')
      .insert({
        ...data,
        status: 'active',
        created_by: profile.id,
      })
      .select()
      .single()

    if (error || !project) return { error: error?.message || '생성 실패' }

    // Find template and create stages
    const template = templates.find((t) => t.template_type === data.template_type)
    if (template) {
      let cursor = new Date()

      const stages = (template.stages as { name: string; order: number; default_duration_days: number; editable_departments?: string[] }[]).map((s) => {
        const deadline = new Date(cursor)
        deadline.setDate(deadline.getDate() + s.default_duration_days)
        const stageDeadline = deadline.toISOString().split('T')[0]
        cursor = deadline
        return {
          project_id: project.id,
          stage_name: s.name,
          stage_order: s.order,
          status: '시작전',
          deadline: stageDeadline,
          editable_departments: s.editable_departments || ['브랜드사업본부'],
        }
      })

      await supabase.from('pipeline_stages').insert(stages)
    }

    await fetchData()
    return { error: null, id: project.id }
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
    const { data } = await supabase
      .from('project_updates')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    return ((data || []) as ProjectUpdate[]).map((u) => ({
      ...u,
      author_name: employees.find((e) => e.id === u.author_id)?.name || '?',
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

  return {
    projects, templates, permissions, employees, loading,
    createProject, updateProject, deleteProject,
    updateStageStatus, updateStageDeadline,
    addUpdate, fetchUpdates, updateRequestStatus,
    getMyPermission,
    refresh: fetchData,
  }
}
