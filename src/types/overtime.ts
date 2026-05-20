// 법적 리스크 대응 P1-1 — 연장근로 사전 승인제 타입
// 기준: supabase/migrations/101_overtime_approval.sql

export type OvertimeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type OvertimeReviewStatus = 'pending' | 'approved' | 'rejected' | 'exempt'

export interface OvertimeRequestRow {
  id: string
  requester_uid: string
  request_date: string             // YYYY-MM-DD
  start_at_planned: string         // ISO timestamp
  end_at_planned: string
  reason: string
  expected_minutes: number
  status: OvertimeRequestStatus
  approver_uid: string | null
  approver_decision_at: string | null
  approver_comment: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
}

export interface OvertimeActualRow {
  id: string
  request_id: string | null
  employee_uid: string
  actual_start_at: string
  actual_end_at: string
  actual_minutes: number
  source: 'attendance' | 'manual' | 'inferred'
  notes: string | null
  deviation_minutes: number | null
  needs_review: boolean
  review_status: OvertimeReviewStatus
  reviewer_uid: string | null
  review_comment: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface OvertimePolicySnapshotRow {
  id: string
  effective_from: string
  daily_limit_minutes: number
  weekly_limit_minutes: number
  approval_required: boolean
  deviation_alert_minutes: number
  notes: string | null
  created_by: string | null
  created_at: string
}

export const STATUS_LABELS: Record<OvertimeRequestStatus, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '반려',
  cancelled: '취소',
}
