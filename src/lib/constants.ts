import type { EmployeeRole, EvaluationType } from '@/types/database'

// ─── 역할 계층 (숫자가 클수록 상위) ────────────────────────────
export const ROLE_HIERARCHY: Record<EmployeeRole, number> = {
  employee: 1,
  leader: 2,
  hr_admin: 2,
  director: 3,
  division_head: 3,
  ceo: 4,
  admin: 5,
}

// ─── 역할 한글 라벨 ────────────────────────────────────────────
export const ROLE_LABELS: Record<EmployeeRole, string> = {
  employee: '직원',
  leader: '리더',
  director: '이사',
  division_head: '본부장',
  ceo: '대표이사',
  admin: '관리자',
  hr_admin: '인사담당',
}

// ─── 평가 상태 순서 ────────────────────────────────────────────
export const EVALUATION_STATUS_ORDER = [
  'pending',
  'self_done',
  'leader_done',
  'director_done',
  'ceo_done',
  'completed',
] as const

export const EVALUATION_STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  self_done: '자기평가 완료',
  leader_done: '리더 평가 완료',
  director_done: '이사 평가 완료',
  ceo_done: '대표 평가 완료',
  completed: '최종 확정',
}

export const EVALUATION_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  self_done: 'bg-blue-100 text-blue-700',
  leader_done: 'bg-brand-100 text-brand-700',
  director_done: 'bg-violet-100 text-violet-700',
  ceo_done: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
}

// ─── 등급 설정 ─────────────────────────────────────────────────
export const GRADE_CONFIG = {
  S: { min: 95, color: 'amber', label: 'S (탁월)', bg: 'bg-amber-100 text-amber-800' },
  A: { min: 85, color: 'blue', label: 'A (우수)', bg: 'bg-blue-100 text-blue-800' },
  B: { min: 70, color: 'green', label: 'B (보통)', bg: 'bg-green-100 text-green-800' },
  C: { min: 50, color: 'yellow', label: 'C (미흡)', bg: 'bg-yellow-100 text-yellow-800' },
  D: { min: 0, color: 'red', label: 'D (부진)', bg: 'bg-red-100 text-red-800' },
} as const

// ─── 수습 평가 등급 (항목별 20점 만점) ──────────────────────────
export const PROBATION_GRADE_CONFIG = {
  S: { min: 19, label: 'S (탁월)', bg: 'bg-amber-100 text-amber-800' },
  A: { min: 16, label: 'A (우수)', bg: 'bg-blue-100 text-blue-800' },
  B: { min: 13, label: 'B (보통)', bg: 'bg-green-100 text-green-800' },
  C: { min: 10, label: 'C (미흡)', bg: 'bg-yellow-100 text-yellow-800' },
  D: { min: 0, label: 'D (부진)', bg: 'bg-red-100 text-red-800' },
} as const

export function getProbationGrade(score: number): keyof typeof PROBATION_GRADE_CONFIG {
  if (score >= 19) return 'S'
  if (score >= 16) return 'A'
  if (score >= 13) return 'B'
  if (score >= 10) return 'C'
  return 'D'
}

export const GRADES = ['S', 'A', 'B', 'C', 'D'] as const

export const GRADE_LABELS: Record<string, string> = {
  S: 'S (탁월)',
  A: 'A (우수)',
  B: 'B (보통)',
  C: 'C (미흡)',
  D: 'D (부진)',
}

export const GRADE_COLORS: Record<string, string> = {
  S: 'bg-amber-100 text-amber-800',
  A: 'bg-blue-100 text-blue-800',
  B: 'bg-green-100 text-green-800',
  C: 'bg-yellow-100 text-yellow-800',
  D: 'bg-red-100 text-red-800',
}

// ─── 평가 기간 상태 ────────────────────────────────────────────
export const PERIOD_STATUS_LABELS: Record<string, string> = {
  draft: '준비 중',
  in_progress: '진행 중',
  completed: '종료',
}

// ─── 점수 라벨 (0~10) ──────────────────────────────────────────
export const SCORE_LABELS: Record<number, string> = {
  0: '해당없음',
  1: '매우 부족',
  2: '부족',
  3: '다소 부족',
  4: '약간 부족',
  5: '보통',
  6: '약간 우수',
  7: '우수',
  8: '매우 우수',
  9: '탁월',
  10: '최우수',
}

// ─── 평가 유형 (정량/정성) ──────────────────────────────────────
export const EVALUATION_TYPE_LABELS: Record<EvaluationType, string> = {
  quantitative: '정량',
  qualitative: '정성',
  mixed: '정량+정성',
}

export const EVALUATION_TYPE_COLORS: Record<EvaluationType, string> = {
  quantitative: 'bg-blue-100 text-blue-700',
  qualitative: 'bg-purple-100 text-purple-700',
  mixed: 'bg-teal-100 text-teal-700',
}

// ─── 카테고리 ──────────────────────────────────────────────────
export const CATEGORIES = ['업적평가', '역량평가'] as const
