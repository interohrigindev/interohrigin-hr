// =====================================================================
// 채용관리 + 직원 생애주기 관련 TypeScript 타입 정의
// =====================================================================

// ─── 채용공고 ─────────────────────────────────────────────────────
export type EmploymentType = 'full_time' | 'contract' | 'intern' | 'part_time'
export type ExperienceLevel = 'any' | 'entry' | 'junior' | 'mid' | 'senior' | 'executive'
export type PostingStatus = 'draft' | 'open' | 'closed' | 'cancelled'

export interface JobPosting {
  id: string
  title: string
  department_id: string | null
  position: string | null
  employment_type: EmploymentType
  experience_level: ExperienceLevel
  description: string | null
  requirements: string | null
  preferred: string | null
  salary_range: string | null
  ai_questions: string[]
  status: PostingStatus
  deadline: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─── 지원자 ───────────────────────────────────────────────────────
export type SourceChannel = 'job_korea' | 'headhunter' | 'referral' | 'university' | 'agency' | 'direct' | 'other'

export type CandidateStatus =
  | 'applied'
  | 'resume_reviewed'
  | 'survey_sent'
  | 'survey_done'
  | 'interview_scheduled'
  | 'video_done'
  | 'face_to_face_done'
  | 'processing'
  | 'analyzed'
  | 'decided'
  | 'hired'
  | 'rejected'

export interface Candidate {
  id: string
  job_posting_id: string | null
  name: string
  email: string
  phone: string | null
  source_channel: SourceChannel
  source_detail: string | null
  resume_url: string | null
  cover_letter_url: string | null
  cover_letter_text: string | null
  status: CandidateStatus
  metadata: Record<string, unknown>
  invite_token: string
  pre_survey_data: Record<string, unknown> | null
  pre_survey_analysis: Record<string, unknown> | null
  talent_match_score: number | null
  similar_employees: Record<string, unknown>[] | null
  processing_step: string | null
  created_at: string
  updated_at: string
}

// ─── 이력서 AI 분석 ──────────────────────────────────────────────
export type ResumeRecommendation = 'PROCEED' | 'REVIEW' | 'REJECT'

export interface ResumeAnalysis {
  id: string
  candidate_id: string
  resume_text: string | null
  ai_summary: string | null
  strengths: string[]
  weaknesses: string[]
  position_fit: number | null
  organization_fit: number | null
  suggested_department: string | null
  suggested_position: string | null
  suggested_salary_range: string | null
  red_flags: string[]
  recommendation: ResumeRecommendation | null
  analyzed_at: string
  created_at: string
}

// ─── 사전 질의서 템플릿 ──────────────────────────────────────────
export type SurveyExperienceType = 'entry' | 'experienced' | 'any'

export interface PreSurveyTemplate {
  id: string
  name: string
  job_type: string | null
  experience_type: SurveyExperienceType | null
  questions: SurveyQuestion[]
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SurveyQuestion {
  id: string
  question: string
  type: 'text' | 'choice' | 'scale'
  options?: string[]
  required?: boolean
}

// ─── 면접 일정 ───────────────────────────────────────────────────
export type InterviewType = 'video' | 'face_to_face'
export type InterviewPriority = 'urgent' | 'normal' | 'low'
export type ScheduleStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

export interface InterviewSchedule {
  id: string
  candidate_id: string
  interviewer_ids: string[]
  interview_type: InterviewType
  scheduled_at: string
  duration_minutes: number
  priority: InterviewPriority
  pre_materials_sent: boolean
  pre_materials_sent_at: string | null
  meeting_link: string | null
  location_info: string | null
  status: ScheduleStatus
  created_at: string
  updated_at: string
}

// ─── 면접 녹화 ───────────────────────────────────────────────────
export type RecordingStatus = 'uploading' | 'uploaded' | 'processing' | 'completed' | 'error'

export interface InterviewRecording {
  id: string
  candidate_id: string
  recording_url: string | null
  recording_type: 'video' | 'audio'
  duration_seconds: number | null
  file_size_bytes: number | null
  status: RecordingStatus
  created_at: string
}

// ─── 대면 면접 평가 ─────────────────────────────────────────────
export type ArrivalStatus = 'early' | 'on_time' | 'late'

export interface FaceToFaceEval {
  id: string
  candidate_id: string
  evaluator_id: string | null
  arrival_time: string | null
  scheduled_time: string | null
  arrival_status: ArrivalStatus | null
  minutes_early_or_late: number
  pre_arrival_contact: boolean
  appearance_score: number | null
  attitude_score: number | null
  pre_material_read: boolean
  pre_material_verification: Record<string, unknown>
  answer_consistency: number | null
  personality_questions: PersonalityQuestion[]
  free_comments: string | null
  total_score: number | null
  created_at: string
  updated_at: string
}

export interface PersonalityQuestion {
  question: string
  answer: string
  score: number
}

// ─── 음성 분석 ───────────────────────────────────────────────────
export interface VoiceAnalysis {
  id: string
  candidate_id: string
  recording_id: string | null
  confidence_score: number | null
  speech_speed: number | null
  filler_word_count: number | null
  voice_stability: number | null
  response_time_avg: number | null
  sentiment_score: number | null
  analysis_details: Record<string, unknown>
  created_at: string
}

// ─── STT 결과 ────────────────────────────────────────────────────
export interface Transcription {
  id: string
  recording_id: string
  candidate_id: string | null
  full_text: string | null
  segments: TranscriptionSegment[]
  language: string
  provider: string
  created_at: string
}

export interface TranscriptionSegment {
  start: number
  end: number
  text: string
}

// ─── AI 종합 분석 리포트 ─────────────────────────────────────────
export type AIRecommendation = 'STRONG_HIRE' | 'HIRE' | 'REVIEW' | 'NO_HIRE'
export type ReportType = 'comprehensive' | 'resume' | 'interview' | 'final'

export interface RecruitmentReport {
  id: string
  candidate_id: string
  report_type: ReportType
  overall_score: number | null
  summary: string | null
  detailed_analysis: Record<string, unknown>
  talent_match: Record<string, unknown>
  saju_mbti_analysis: Record<string, unknown>
  salary_recommendation: string | null
  department_recommendation: string | null
  position_recommendation: string | null
  ai_recommendation: AIRecommendation | null
  provider: string | null
  model: string | null
  created_at: string
}

// ─── 채용 결정 ───────────────────────────────────────────────────
export type HiringDecision = 'hired' | 'rejected' | 'hold'

export interface HiringDecisionRecord {
  id: string
  candidate_id: string
  decision: HiringDecision
  decided_by: string | null
  reason: string | null
  offered_salary: string | null
  offered_department_id: string | null
  offered_position: string | null
  start_date: string | null
  ai_recommendation: string | null
  ai_score: number | null
  created_at: string
}

// ─── 인재상 프로필 ───────────────────────────────────────────────
export interface TalentProfile {
  id: string
  name: string
  department_id: string | null
  traits: string[]
  skills: string[]
  values: string[]
  description: string | null
  reference_employees: string[]
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─── AI 신뢰도 ───────────────────────────────────────────────────
export type MatchResult = 'match' | 'partial' | 'mismatch'
export type AIPhase = 'A' | 'B' | 'C'

export interface AIAccuracyLog {
  id: string
  candidate_id: string | null
  employee_id: string | null
  ai_recommendation: string | null
  ai_score: number | null
  actual_decision: string | null
  match_result: MatchResult | null
  context_type: 'hiring' | 'probation' | 'performance'
  notes: string | null
  created_at: string
}

export interface AITrustMetrics {
  id: string
  period_start: string
  period_end: string
  total_predictions: number
  correct_predictions: number
  accuracy_rate: number | null
  current_phase: AIPhase
  details: Record<string, unknown>
  created_at: string
}

export interface AIPhaseTransition {
  id: string
  from_phase: AIPhase
  to_phase: AIPhase
  reason: string | null
  accuracy_at_transition: number | null
  approved_by: string | null
  created_at: string
}
