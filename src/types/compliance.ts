// 법적 리스크 대응 P0 — 공통 인프라 타입
// 기준: supabase/migrations/100_compliance_p0_infrastructure.sql

export type AuditActionType =
  | 'create' | 'update' | 'delete'
  | 'approve' | 'reject'
  | 'send' | 'export'
  | 'enable' | 'disable'
  | 'login' | 'logout'
  | string  // 모듈별 확장 허용

export type AuditEntityType =
  | 'feature_rollout'
  | 'overtime_request'
  | 'leave_promotion'
  | 'disciplinary_case'
  | 'anonymous_report'
  | 'legal_param'
  | string

export interface AuditLogRow {
  id: string
  actor_uid: string | null
  actor_role: string | null
  action_type: AuditActionType
  entity_type: AuditEntityType
  entity_id: string | null
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  diff_summary: string | null
  request_source: string
  ip_hash: string | null
  user_agent: string | null
  created_at: string
}

export type NotificationChannel = 'email' | 'push' | 'slack' | 'webhook' | 'in_app' | 'kakao_work'
export type NotificationStatus = 'queued' | 'sent' | 'failed' | 'skipped'

export interface NotificationDeliveryRow {
  id: string
  template_key: string | null
  channel: NotificationChannel
  recipient_uid: string | null
  recipient_email: string | null
  subject: string | null
  payload: Record<string, unknown>
  status: NotificationStatus
  error_message: string | null
  related_entity_type: string | null
  related_entity_id: string | null
  sent_at: string | null
  read_at: string | null
  created_at: string
}

export interface NotificationTemplateRow {
  id: string
  key: string
  channel: NotificationChannel
  subject_tpl: string | null
  body_tpl: string
  variables: string[] | Record<string, unknown>
  description: string | null
  is_active: boolean
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type FeatureRolloutScope = 'none' | 'admin_only' | 'department' | 'company_wide'

export interface FeatureRolloutRow {
  id: string
  feature_key: string
  display_name: string
  description: string | null
  is_enabled: boolean
  scope: FeatureRolloutScope
  scope_filter: Record<string, unknown>
  enabled_at: string | null
  enabled_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ComplianceRunLogRow {
  id: string
  job_key: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'success' | 'partial' | 'failed'
  processed_count: number
  success_count: number
  failed_count: number
  result_summary: Record<string, unknown>
  error_message: string | null
  triggered_by: string
  triggered_uid: string | null
}

// 알려진 feature key 상수 — 신규 모듈 추가 시 여기에 등록
export const FEATURE_KEYS = {
  AUDIT_LOG_VIEW: 'audit_log_view',
  OVERTIME_APPROVAL: 'overtime_approval',
  WEEKLY_52H_WARNING: 'weekly_52h_warning',
  LEAVE_PROMOTION: 'leave_promotion',
  LEAVE_LIABILITY_DASHBOARD: 'leave_liability_dashboard',
  DISCIPLINARY_CASE: 'disciplinary_case',
  PROBATION_COMPLIANCE: 'probation_compliance',
  ANONYMOUS_REPORT: 'anonymous_report',
  LEGAL_PARAMS_SYNC: 'legal_params_sync',
} as const

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS]
