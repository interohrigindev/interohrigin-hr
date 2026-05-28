import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type {
  RecurringTask, RecurringTaskOccurrence, OccurrenceWithTemplate,
} from '@/types/recurring-task'

interface EmployeeBasic { id: string; name: string; department_id: string | null }

// 반복업무 템플릿 CRUD + 발생 인스턴스 조회 훅 (PDCA #5)
export function useRecurringTasks() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState<RecurringTask[]>([])
  const [employees, setEmployees] = useState<EmployeeBasic[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [tplRes, empRes] = await Promise.all([
      supabase.from('recurring_tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name, department_id').eq('is_active', true).order('name'),
    ])
    setTasks((tplRes.data || []) as RecurringTask[])
    setEmployees((empRes.data || []) as EmployeeBasic[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // 템플릿 생성. created_by 는 현재 사용자(RLS WITH CHECK 충족)
  async function createTask(input: {
    title: string
    description?: string | null
    assignee_id: string
    department?: string | null
    recur_type: 'weekly' | 'monthly'
    weekdays?: number[] | null
    month_day?: number | null
    reminder_time?: string
  }) {
    const payload = {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      assignee_id: input.assignee_id,
      created_by: profile?.id ?? null,
      department: input.department ?? null,
      recur_type: input.recur_type,
      weekdays: input.recur_type === 'weekly' ? (input.weekdays ?? []) : null,
      month_day: input.recur_type === 'monthly' ? (input.month_day ?? null) : null,
      reminder_time: input.reminder_time || '09:00:00',
    }
    const { error } = await supabase.from('recurring_tasks').insert(payload)
    if (error) throw error
    await fetchData()
  }

  async function updateTask(id: string, patch: Partial<RecurringTask>) {
    const { error } = await supabase.from('recurring_tasks').update(patch).eq('id', id)
    if (error) throw error
    await fetchData()
  }

  // 비활성(soft) — 기본 권장. is_active=false
  async function deactivateTask(id: string) {
    return updateTask(id, { is_active: false })
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from('recurring_tasks').delete().eq('id', id)
    if (error) throw error
    await fetchData()
  }

  return {
    tasks, employees, loading,
    refetch: fetchData,
    createTask, updateTask, deactivateTask, deleteTask,
  }
}

// 특정 날짜에 내가 담당한 발생 occurrence 조회 (체크 화면용)
// occurrence + 템플릿 title/description 조인
export async function fetchMyOccurrences(
  employeeId: string,
  date: string,
): Promise<OccurrenceWithTemplate[]> {
  const { data, error } = await supabase
    .from('recurring_task_occurrences')
    .select('*, recurring_tasks!inner(title, description)')
    .eq('assignee_id', employeeId)
    .eq('occurrence_date', date)
    .order('created_at')
  if (error) throw error
  return ((data || []) as (RecurringTaskOccurrence & {
    recurring_tasks: { title: string; description: string | null }
  })[]).map((o) => ({
    ...o,
    title: o.recurring_tasks?.title ?? '(제목 없음)',
    description: o.recurring_tasks?.description ?? null,
  }))
}

// occurrence 진행여부 갱신 (체크 화면 — 본인 RLS)
export async function updateOccurrenceStatus(
  id: string,
  status: 'pending' | 'in_progress' | 'done',
  note?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    note: note ?? null,
    completed_at: status === 'done' ? new Date().toISOString() : null,
  }
  const { error } = await supabase.from('recurring_task_occurrences').update(patch).eq('id', id)
  if (error) throw error
}
