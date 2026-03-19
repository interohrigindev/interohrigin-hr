// =====================================================================
// 프로젝트 협업 보드 TypeScript 타입
// =====================================================================

export type ProjectStatus = 'active' | 'holding' | 'completed' | 'cancelled'
export type StageStatus = '완료' | '진행중' | '시작전' | '홀딩'
export type RequestStatus = 'pending' | 'accepted' | 'completed' | 'rejected'
export type TemplateType = 'new_product' | 'renewal' | 'repackage' | 'custom'
export type ViewMode = 'table' | 'kanban' | 'timeline'

export interface ProjectBoard {
  id: string
  brand: string
  category: string
  project_name: string
  launch_date: string | null
  status: ProjectStatus
  priority: number
  assignee_ids: string[]
  department: string
  template_type: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PipelineStage {
  id: string
  project_id: string
  stage_name: string
  stage_order: number
  status: StageStatus
  deadline: string | null
  completed_at: string | null
  editable_departments: string[]
  stage_assignee_ids: string[] | null
  created_at: string
  updated_at: string
}

export interface ProjectUpdate {
  id: string
  project_id: string
  stage_id: string | null
  author_id: string
  content: string
  status_changed_from: string | null
  status_changed_to: string | null
  attachments: { url: string; name: string; size: number; type: string }[]
  is_cross_dept_request: boolean
  requested_department: string | null
  request_status: RequestStatus | null
  request_completed_at: string | null
  created_at: string
}

export interface BoardPermission {
  id: string
  department: string
  can_create_project: boolean
  can_delete_project: boolean
  can_edit_all_stages: boolean
  can_comment: boolean
  can_view: boolean
  editable_stages: string[]
  updated_at: string
}

export interface ProjectTemplate {
  id: string
  name: string
  template_type: string
  stages: TemplateStage[]
  avg_total_days: number | null
  created_at: string
}

export interface TemplateStage {
  name: string
  order: number
  default_duration_days: number
  editable_departments?: string[]
}

// ─── UI helpers ─────────────────────────────────────────────────

export interface ProjectWithStages extends ProjectBoard {
  stages: PipelineStage[]
  assignee_names?: string[]
}

export const DEFAULT_PIPELINE = ['시장조사', '제형', '패키지', '판매가', '상세페이지', '촬영', '마케팅']

export const STAGE_STATUS_COLORS: Record<StageStatus, string> = {
  '완료': 'bg-emerald-100 text-emerald-700',
  '진행중': 'bg-blue-100 text-blue-700',
  '시작전': 'bg-gray-100 text-gray-500',
  '홀딩': 'bg-amber-100 text-amber-700',
}

export const STAGE_STATUS_DOT: Record<StageStatus, string> = {
  '완료': 'bg-emerald-500',
  '진행중': 'bg-blue-500',
  '시작전': 'bg-gray-300',
  '홀딩': 'bg-amber-500',
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: '진행중',
  holding: '홀딩',
  completed: '완료',
  cancelled: '취소',
}

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  active: 'bg-blue-100 text-blue-700',
  holding: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
}

export const BRAND_COLORS: Record<string, string> = {
  AZH: 'bg-purple-100 text-purple-700',
  '드엘리사': 'bg-pink-100 text-pink-700',
  '기타': 'bg-gray-100 text-gray-600',
}
