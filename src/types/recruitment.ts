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
  location: string | null
  work_hours: string | null
  headcount: number | null
  benefits: string | null
  hiring_process: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  company_intro: string | null
  team_intro: string | null
  survey_template_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─── 지원자 ───────────────────────────────────────────────────────
export type SourceChannel = 'job_korea' | 'headhunter' | 'referral' | 'university' | 'agency' | 'direct' | 'manual_upload' | 'other'

export type CandidateStatus =
  | 'applied'
  | 'resume_reviewed'
  | 'survey_sent'
  | 'survey_done'
  | 'interview_scheduled'    // 1차 화상면접 예정
  | 'video_done'             // 1차 화상면접 완료
  | 'face_to_face_scheduled' // 2차 대면면접 예정
  | 'face_to_face_done'      // 2차 대면면접 완료
  | 'processing'
  | 'analyzed'
  | 'decided'
  | 'hired'
  | 'rejected'
  | 'no_show'                // 지원 불참 (면접 무단 불참 등)

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
  survey_send_history: { sent_at: string }[] | null
  talent_match_score: number | null
  similar_employees: Record<string, unknown>[] | null
  processing_step: string | null
  interviewer_comments: { author_id: string; author_name: string; content: string; created_at: string }[] | null
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

// ─── 사전 질의서 응답 entries (PDCA #2 external-pre-survey-import) ─────
// Design Ref: §3 — entries 배열 통합 + v1 deprecate 동시 처리 (Option C)
// Plan SC: R1 (덮어쓰기) / R3 (id 매칭) 모두 해결.
//
// 데이터 모델 핵심:
//   - pre_survey_data jsonb 안에 entries: PreSurveyEntry[] 배열 추가
//   - 기존 top-level answers/meta/completed_at 은 backward-compat 유지
//     (readPreSurveyEntries 헬퍼가 읽기 시점에 entry 1개로 변환)
//   - DB ALTER 없음 — CLAUDE.md 절대 규칙 준수

/** 사전질의서 응답 출처. 신규 source 추가 시 여기에만 확장 */
export type PreSurveySource = 'pbd' | 'manual_upload'

/** 사용자 친화적 출처 배지 텍스트 (UI 표시용) */
export const PRE_SURVEY_SOURCE_LABEL: Record<PreSurveySource, string> = {
  pbd: 'v2.0 PBD',
  manual_upload: 'Google Form (수동 업로드)',
}

/** 사전질의서 응답 1건 (source 별) */
export interface PreSurveyEntry {
  /** 안정적 식별자. 패턴: `{source}_{timestamp}` (예: `manual_upload_1716800000`, `pbd_legacy`) */
  id: string
  /** 응답 출처 */
  source: PreSurveySource
  /** 사용자 친화적 배지 텍스트. UI 에 그대로 표시 */
  source_label: string
  /** 답변 — key 는 entry 안의 questions[i].id 와 매칭 */
  answers: Record<string, string>
  /** 질문 텍스트 (self-contained, 외부 출처는 필수, pbd legacy 는 생략 가능) */
  questions?: PreSurveyEntryQuestion[]
  /** 출처별 추가 메타데이터 */
  source_meta?: PreSurveyEntrySourceMeta
  /** entry 생성 시각 (정렬 기준, ISO timestamp) */
  created_at: string
}

/** entry 안의 self-contained 질문 */
export interface PreSurveyEntryQuestion {
  /** entry 내부에서만 유일한 id (예: `manual_${ts}_${i}`) */
  id: string
  /** 질문 텍스트 (원문) */
  text: string
  /** 표시 순서 (0-based) */
  order: number
  /** 필수 응답 여부 (manual_upload 는 보통 미지정) */
  required?: boolean
}

/** entry 출처별 메타데이터 */
export interface PreSurveyEntrySourceMeta {
  // ── manual_upload 전용 ──────────────────────────────
  /** 원본 PDF Storage path (resumes 버킷 기준) */
  original_pdf_path?: string
  /** 원본 PDF 파일명 (UI 표시용, 한글 보존) */
  original_pdf_filename?: string
  /** 업로더 profile.id */
  uploaded_by?: string
  /** 업로더 표시명 (캐시용 — profile 조회 회피) */
  uploaded_by_name?: string
  /** 업로드 시각 (ISO timestamp) */
  uploaded_at?: string
  /** Gemini 추출 신뢰도 (0.0~1.0). < 0.7 시 UI 에 ⚠️ 경고 */
  extraction_confidence?: number
  /** Gemini 가 못 처리한 텍스트 일부 (사람 검수 힌트) */
  extraction_notes?: string
  /** admin 이 미리보기에서 questions/answers 를 수정했는지 */
  edited?: boolean
  // ── pbd 전용 ────────────────────────────────────────
  /** survey_test_responses.id 참조 (옵션 — legacy entry 변환 시 미설정) */
  pbd_response_id?: string
}

/** pre_survey_data jsonb 의 신규 구조 (Option C) */
export interface PreSurveyData {
  /** 모든 응답 entries 배열 (정렬 안 됨 — 헬퍼가 정렬) */
  entries?: PreSurveyEntry[]
  // ── 기존 v2.0 top-level 필드 (backward compat, 신규 코드는 entries 만 사용) ──
  answers?: Record<string, string>
  meta?: {
    birth_date?: string
    mbti?: string
    hanja_name?: string
    blood_type?: string
  }
  completed_at?: string
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
  google_event_id: string | null
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
