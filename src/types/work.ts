// =====================================================================
// 업무 관리 모듈 TypeScript 타입 정의
// =====================================================================

export type ProjectStatus = 'planning' | 'active' | 'completed' | 'cancelled'

export interface Project {
  id: string
  name: string
  description: string | null
  department_id: string | null
  owner_id: string | null
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'

export interface Task {
  id: string
  project_id: string | null
  title: string
  description: string | null
  assignee_id: string | null
  priority: TaskPriority
  status: TaskStatus
  due_date: string | null
  estimated_hours: number | null
  actual_hours: number | null
  ai_generated: boolean
  parent_task_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DailyReportTask {
  id: string
  title: string
  status: string
  note?: string
}

export interface DailyReport {
  id: string
  employee_id: string
  report_date: string
  tasks_completed: DailyReportTask[]
  tasks_in_progress: DailyReportTask[]
  tasks_planned: DailyReportTask[]
  carryover_tasks: DailyReportTask[]
  ai_priority_suggestion: string | null
  satisfaction_score: number | null
  satisfaction_comment: string | null
  blockers: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  employee_id: string
  role: 'user' | 'assistant'
  content: string
  metadata: Record<string, unknown>
  created_at: string
}
