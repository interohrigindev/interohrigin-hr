// ─── employees 테이블 ────────────────────────────────────────────
export type EmployeeRole =
  | 'employee'
  | 'leader'
  | 'director'
  | 'division_head'
  | 'ceo'
  | 'admin'

export type EmploymentType = 'full_time' | 'contract' | 'intern' | 'part_time'

export interface Employee {
  id: string
  name: string
  email: string
  department_id: string | null
  role: EmployeeRole
  is_active: boolean
  phone: string | null
  address: string | null
  birth_date: string | null
  avatar_url: string | null
  employee_number: string | null
  hire_date: string | null
  position: string | null
  employment_type: EmploymentType | null
  emergency_contact: string | null
  created_at: string
  updated_at: string
}

// ─── departments 테이블 ─────────────────────────────────────────
export interface Department {
  id: string
  name: string
  created_at: string
}

// ─── evaluation_periods 테이블 ──────────────────────────────────
export type PeriodStatus = 'draft' | 'in_progress' | 'completed'

export interface EvaluationPeriod {
  id: string
  year: number
  quarter: number
  status: PeriodStatus
  start_date: string | null
  end_date: string | null
  created_at: string
}

// ─── evaluation_categories 테이블 ───────────────────────────────
export interface EvaluationCategory {
  id: string
  name: string
  weight: number
  sort_order: number
}

// ─── evaluation_items 테이블 ────────────────────────────────────
export type EvaluationType = 'quantitative' | 'qualitative' | 'mixed'

export interface EvaluationItem {
  id: string
  category_id: string
  name: string
  description: string | null
  max_score: number
  sort_order: number
  is_active: boolean
  evaluation_type: EvaluationType
}

// ─── evaluation_targets 테이블 ──────────────────────────────────
export type TargetStatus =
  | 'pending'
  | 'self_done'
  | 'leader_done'
  | 'director_done'
  | 'ceo_done'
  | 'completed'

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D'

export interface EvaluationTarget {
  id: string
  period_id: string
  employee_id: string
  status: TargetStatus
  final_score: number | null
  grade: Grade | null
  created_at: string
  updated_at: string
}

// ─── self_evaluations 테이블 ────────────────────────────────────
export interface SelfEvaluation {
  id: string
  target_id: string
  item_id: string
  personal_goal: string | null
  achievement_method: string | null
  self_comment: string | null
  score: number | null
  is_draft: boolean
  created_at: string
  updated_at: string
}

// ─── evaluator_scores 테이블 ────────────────────────────────────
export type EvaluatorRole =
  | 'leader'
  | 'director'
  | 'ceo'

export interface EvaluatorScore {
  id: string
  target_id: string
  item_id: string
  evaluator_id: string
  evaluator_role: EvaluatorRole
  score: number | null
  comment: string | null
  is_draft: boolean
  created_at: string
  updated_at: string
}

// ─── evaluator_comments 테이블 ──────────────────────────────────
export interface EvaluatorComment {
  id: string
  target_id: string
  evaluator_id: string
  evaluator_role: string
  strength: string | null
  improvement: string | null
  overall: string | null
  created_at: string
  updated_at: string
}

// ─── evaluation_weights 테이블 ──────────────────────────────────
export interface EvaluationWeight {
  id: string
  period_id: string
  evaluator_role: string
  weight: number
}

// ─── grade_criteria 테이블 ──────────────────────────────────────
export interface GradeCriteria {
  id: string
  grade: Grade
  min_score: number
  max_score: number
  label: string | null
}
