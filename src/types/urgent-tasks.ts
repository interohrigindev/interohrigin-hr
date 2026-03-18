// ─── urgent_tasks 테이블 ────────────────────────────────────────
export type UrgentTaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue'
export type ReminderChannel = 'push' | 'sms' | 'email' | 'popup'

export interface UrgentTask {
  id: string
  title: string
  description: string | null
  priority: number
  assigned_to: string[]
  created_by: string | null

  deadline: string
  is_overdue: boolean

  status: UrgentTaskStatus
  completed_at: string | null
  completed_by: string | null
  completion_note: string | null

  reminder_count: number
  last_reminder_at: string | null
  reminder_interval_hours: number

  project_id: string | null
  related_employee_id: string | null

  created_at: string
  updated_at: string
}

// JOIN 결과용 확장 타입
export interface UrgentTaskWithDetails extends UrgentTask {
  creator?: { id: string; name: string; role: string } | null
  assignees?: { id: string; name: string; department_id: string | null }[]
}

// ─── task_reminders 테이블 ──────────────────────────────────────
export interface TaskReminder {
  id: string
  urgent_task_id: string
  sent_to: string
  sent_via: ReminderChannel
  sent_at: string
  acknowledged: boolean
  acknowledged_at: string | null
  response_note: string | null
}

// ─── reminder_penalties 테이블 ──────────────────────────────────
export interface ReminderPenalty {
  id: string
  employee_id: string
  period_start: string | null
  period_end: string | null

  total_urgent_assigned: number
  total_completed_on_time: number
  total_overdue: number
  total_reminders_received: number

  penalty_score: number

  evaluation_id: string | null
  created_at: string
}

// ─── 폼 데이터 ──────────────────────────────────────────────────
export interface UrgentTaskFormData {
  title: string
  description: string
  assigned_to: string[]
  deadline: string
  priority: number
  reminder_interval_hours: number
}

export interface CompletionFormData {
  completion_note: string
}

export interface ExtensionRequestData {
  reason: string
  new_deadline: string
}
