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

export interface TaskImage {
  url: string
  name: string
  size: number
}

export interface Task {
  id: string
  project_id: string | null
  linked_board_id: string | null
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
  images: TaskImage[]
  created_at: string
  updated_at: string
}

export interface DailyReportTask {
  id: string
  title: string
  status: string
  note?: string
  // 0512: 프로젝트별 그룹핑용 — 자동 import 시 채워짐. 수동 추가는 비어있을 수 있음.
  project_id?: string | null
  project_name?: string | null
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
  // 한 줄 총평 AI 요약 (저장 시 1회 생성, 결재자 표시용)
  ai_summary: { work?: string[]; personal?: string[] } | null
  ai_summary_source: string | null
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
