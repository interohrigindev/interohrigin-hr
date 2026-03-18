import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { UrgentTask, TaskReminder } from '@/types/urgent-tasks'

// ─── 긴급 업무 목록 ──────────────────────────────────────────────
export function useUrgentTasks() {
  const [tasks, setTasks] = useState<UrgentTask[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('urgent_tasks')
      .select('*')
      .order('priority', { ascending: true })
      .order('deadline', { ascending: true })

    if (!error && data) setTasks(data as UrgentTask[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  return { tasks, loading, refetch: fetchTasks }
}

// ─── 긴급 업무 통계 ──────────────────────────────────────────────
export interface UrgentTaskStats {
  total: number
  pending: number
  inProgress: number
  completed: number
  overdue: number
  avgReminderCount: number
}

export function useUrgentTaskStats() {
  const [stats, setStats] = useState<UrgentTaskStats>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
    avgReminderCount: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      const { data, error } = await supabase
        .from('urgent_tasks')
        .select('status, reminder_count')

      if (!error && data) {
        const total = data.length
        const pending = data.filter((t) => t.status === 'pending').length
        const inProgress = data.filter((t) => t.status === 'in_progress').length
        const completed = data.filter((t) => t.status === 'completed').length
        const overdue = data.filter((t) => t.status === 'overdue').length
        const totalReminders = data.reduce((sum, t) => sum + (t.reminder_count || 0), 0)

        setStats({
          total,
          pending,
          inProgress,
          completed,
          overdue,
          avgReminderCount: total > 0 ? Math.round((totalReminders / total) * 10) / 10 : 0,
        })
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { stats, loading }
}

// ─── 리마인드 이력 ───────────────────────────────────────────────
export function useTaskReminders(taskId?: string) {
  const [reminders, setReminders] = useState<TaskReminder[]>([])
  const [loading, setLoading] = useState(true)

  const fetchReminders = useCallback(async () => {
    if (!taskId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('task_reminders')
      .select('*')
      .eq('urgent_task_id', taskId)
      .order('sent_at', { ascending: false })

    if (!error && data) setReminders(data as TaskReminder[])
    setLoading(false)
  }, [taskId])

  useEffect(() => { fetchReminders() }, [fetchReminders])

  return { reminders, loading, refetch: fetchReminders }
}

// ─── 긴급 업무 CRUD ─────────────────────────────────────────────
export function useUrgentTaskMutations() {
  async function createTask(data: {
    title: string
    description?: string
    assigned_to: string[]
    deadline: string
    priority: number
    reminder_interval_hours?: number
    created_by: string
  }) {
    const { data: result, error } = await supabase
      .from('urgent_tasks')
      .insert(data)
      .select()
      .single()
    return { data: result, error }
  }

  async function updateTask(id: string, data: Partial<UrgentTask>) {
    const { data: result, error } = await supabase
      .from('urgent_tasks')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    return { data: result, error }
  }

  async function deleteTask(id: string) {
    const { error } = await supabase
      .from('urgent_tasks')
      .delete()
      .eq('id', id)
    return { error }
  }

  async function completeTask(id: string, completedBy: string, completionNote: string) {
    const { data: result, error } = await supabase
      .from('urgent_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: completedBy,
        completion_note: completionNote,
      })
      .eq('id', id)
      .select()
      .single()
    return { data: result, error }
  }

  async function updateTaskStatus(id: string, status: string) {
    const { data: result, error } = await supabase
      .from('urgent_tasks')
      .update({ status })
      .eq('id', id)
      .select()
      .single()
    return { data: result, error }
  }

  async function acknowledgeReminder(reminderId: string, responseNote?: string) {
    const { error } = await supabase
      .from('task_reminders')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        response_note: responseNote || null,
      })
      .eq('id', reminderId)
    return { error }
  }

  return {
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    updateTaskStatus,
    acknowledgeReminder,
  }
}

// ─── 직원 목록 (담당자 선택용) ───────────────────────────────────
export function useEmployeeList() {
  const [employees, setEmployees] = useState<{ id: string; name: string; role: string; department_id: string | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, role, department_id')
        .eq('is_active', true)
        .order('name')

      if (!error && data) setEmployees(data)
      setLoading(false)
    }
    fetch()
  }, [])

  return { employees, loading }
}
