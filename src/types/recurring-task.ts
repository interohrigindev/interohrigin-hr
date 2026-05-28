// =====================================================================
// 반복업무 (recurring-task) 타입 — PDCA #5
// migration 135_recurring_task.sql 스키마와 1:1 대응
// =====================================================================

export type RecurType = 'weekly' | 'monthly'
export type OccurrenceStatus = 'pending' | 'in_progress' | 'done' | 'missed'

export interface RecurringTask {
  id: string
  title: string
  description: string | null
  assignee_id: string
  created_by: string | null
  department: string | null
  recur_type: RecurType
  weekdays: number[] | null   // weekly: 0=일 ~ 6=토 (복수)
  month_day: number | null    // monthly: 1~31
  reminder_time: string       // 'HH:MM:SS'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RecurringTaskOccurrence {
  id: string
  template_id: string
  occurrence_date: string     // 'YYYY-MM-DD'
  assignee_id: string
  status: OccurrenceStatus
  completed_at: string | null
  note: string | null
  reminder_sent_at: string | null
  missed_notified_at: string | null
  created_at: string
  updated_at: string
}

// 화면 표시용 — occurrence + 템플릿 메타(title/description) 조인
export interface OccurrenceWithTemplate extends RecurringTaskOccurrence {
  title: string
  description: string | null
}

// 한글 요일 라벨 (weekdays int → UI). 인덱스 = EXTRACT(DOW) 컨벤션 (0=일)
export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

export function formatRecurrence(t: Pick<RecurringTask, 'recur_type' | 'weekdays' | 'month_day'>): string {
  if (t.recur_type === 'weekly') {
    const days = (t.weekdays ?? []).slice().sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join('·')
    return `매주 ${days}`
  }
  return `매월 ${t.month_day}일`
}
