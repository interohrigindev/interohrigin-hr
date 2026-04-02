// =====================================================================
// 직원 생애주기 관련 TypeScript 타입 정의
// 사주/MBTI + OJT + 멘토 + 수습 + 특이사항 + 퇴사 + 업무
// =====================================================================

// ─── 사주/MBTI ───────────────────────────────────────────────────
export type MBTIType =
  | 'ISTJ' | 'ISFJ' | 'INFJ' | 'INTJ'
  | 'ISTP' | 'ISFP' | 'INFP' | 'INTP'
  | 'ESTP' | 'ESFP' | 'ENFP' | 'ENTP'
  | 'ESTJ' | 'ESFJ' | 'ENFJ' | 'ENTJ'

export type BloodType = 'A' | 'B' | 'O' | 'AB'

export interface EmployeeProfile {
  id: string
  employee_id: string
  birth_date: string | null
  birth_time: string | null
  lunar_birth: boolean
  mbti: MBTIType | null
  blood_type: BloodType | null
  hanja_name: string | null
  created_at: string
  updated_at: string
}

export type AnalysisType = 'saju' | 'mbti' | 'cross' | 'comprehensive'

export interface PersonalityAnalysis {
  id: string
  employee_id: string
  analysis_type: AnalysisType
  result: Record<string, unknown>
  strengths: string[]
  cautions: string[]
  job_fit: Record<string, unknown>
  team_fit: Record<string, unknown>
  provider: string | null
  model: string | null
  created_at: string
}

export interface ProfileVisibilitySettings {
  id: string
  employee_id: string
  show_mbti: boolean
  show_blood_type: boolean
  show_saju: boolean
  show_birth_date: boolean
  updated_at: string
}

// ─── OJT 프로그램 ───────────────────────────────────────────────
export interface OJTProgram {
  id: string
  name: string
  department_id: string | null
  job_type: string | null
  description: string | null
  modules: OJTModule[]
  quiz_questions: QuizQuestion[]
  duration_days: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface OJTModule {
  id: string
  title: string
  content: string
  order: number
}

export interface QuizQuestion {
  id: string
  question: string
  options: string[]
  correct_answer: number
  explanation?: string
}

export type EnrollmentStatus = 'enrolled' | 'in_progress' | 'completed' | 'dropped'

export interface OJTEnrollment {
  id: string
  employee_id: string
  program_id: string
  status: EnrollmentStatus
  progress: Record<string, unknown>
  quiz_scores: QuizScore[]
  total_quiz_score: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface QuizScore {
  quiz_id: string
  score: number
  max_score: number
  answered_at: string
}

// ─── 멘토-멘티 ──────────────────────────────────────────────────
export type AssignmentType = 'initial' | 'final'
export type AssignmentStatus = 'active' | 'completed' | 'cancelled'

export interface MentorAssignment {
  id: string
  mentee_id: string
  mentor_id: string
  assignment_type: AssignmentType
  start_date: string
  end_date: string | null
  status: AssignmentStatus
  mentor_rating_by_mentee: Record<string, unknown> | null
  mentee_rating_by_mentor: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type AttitudeLevel = 'excellent' | 'good' | 'average' | 'poor' | 'very_poor'

export interface MentorDailyReport {
  id: string
  assignment_id: string
  day_number: number
  mentor_mission: string | null
  mentee_mission: string | null
  mentor_completed: boolean
  mentee_completed: boolean
  learning_attitude: AttitudeLevel | null
  adaptation_level: AttitudeLevel | null
  mentor_comment: string | null
  mentee_feedback: string | null
  created_at: string
}

// ─── 수습 평가 ──────────────────────────────────────────────────
export type ProbationStage = 'round1' | 'round2' | 'round3'
export type ProbationEvaluatorRole = 'mentor' | 'leader' | 'executive' | 'ceo'
export type ContinuationRecommendation = 'continue' | 'warning' | 'terminate'

export const PROBATION_CRITERIA = [
  { key: 'understanding', label: '업무 이해도 & 숙련도', desc: '업무 프로세스 이해, 오류율, 처리 속도' },
  { key: 'attitude', label: '업무 태도 & 협업', desc: '소통 능력, 피드백 수용, 협업 자세' },
  { key: 'responsibility', label: '근태 & 책임감', desc: '규정 준수, 보고 체계, 책임감' },
  { key: 'growth', label: '열정 & 성장 의지', desc: '자기주도성, 학습 태도, 적극성' },
  { key: 'culture', label: '조직 문화 적응도', desc: '규칙 준수, 문화 적응, 예절, 기본자세' },
] as const

export type ProbationCriteriaKey = typeof PROBATION_CRITERIA[number]['key']

export interface ProbationEvaluation {
  id: string
  employee_id: string
  stage: ProbationStage
  evaluator_id: string | null
  evaluator_role: ProbationEvaluatorRole | string | null
  scores: Record<string, number>
  ai_assessment: string | null
  continuation_recommendation: ContinuationRecommendation | null
  comments: string | null
  praise: string | null
  improvement: string | null
  mentor_summary: string | null
  leader_summary: string | null
  exec_one_liner: string | null
  strengths: string | null
  created_at: string
  updated_at?: string
}

// ─── 월간 업무 점검 ────────────────────────────────────────────
export type CheckinTag = '이슈' | '칭찬' | '제안' | '기타'
export type SpecialNoteTag = '이슈' | '성과' | '칭찬' | '제안' | '기타'
export type CheckinStatus = 'draft' | 'submitted' | 'leader_reviewed' | 'exec_reviewed' | 'ceo_reviewed'

export interface CheckinNote {
  tag: SpecialNoteTag
  text: string
}

export interface MonthlyCheckin {
  id: string
  employee_id: string
  year: number
  month: number
  tag: CheckinTag
  content: string | null
  project_name: string | null
  special_notes: CheckinNote[]
  leader_feedback: string | null
  exec_feedback: string | null
  ceo_feedback: string | null
  status: CheckinStatus
  is_locked: boolean
  created_at: string
  updated_at: string
}

// ─── 동료 다면 평가 ────────────────────────────────────────────
export interface PeerReview {
  id: string
  period_id: string | null
  reviewer_id: string
  reviewee_id: string
  overall_score: number | null
  strengths: string | null
  improvements: string | null
  is_anonymous: boolean
  is_submitted: boolean
  created_at: string
  updated_at: string
}

export interface PeerReviewAssignment {
  id: string
  period_id: string
  reviewer_id: string
  reviewee_id: string
  created_at: string
}

// ─── 특이사항 ───────────────────────────────────────────────────
export type NoteType = 'positive' | 'negative'
export type Severity = 'minor' | 'moderate' | 'major'

export interface SpecialNote {
  id: string
  employee_id: string
  author_id: string
  note_type: NoteType
  content: string
  severity: Severity
  created_at: string
}

// ─── 퇴사 설문 ──────────────────────────────────────────────────
export interface ExitSurvey {
  id: string
  employee_id: string
  exit_date: string | null
  exit_reason_category: string | null
  exit_reason_detail: string | null
  best_experience: string | null
  worst_experience: string | null
  suggestions: string | null
  anonymous_feedback: string | null
  token: string
  completed_at: string | null
  created_at: string
}

// ─── 업무 메트릭 ────────────────────────────────────────────────
export interface WorkMetrics {
  id: string
  employee_id: string
  period_year: number
  period_quarter: number
  task_completion_rate: number | null
  deadline_compliance: number | null
  avg_daily_satisfaction: number | null
  total_tasks: number
  completed_tasks: number
  overdue_tasks: number
  details: Record<string, unknown>
  synced_at: string
  created_at: string
}
