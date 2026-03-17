import type { SourceChannel, CandidateStatus, PostingStatus } from '@/types/recruitment'

// ─── 유입 경로 라벨 ─────────────────────────────────────────────
export const SOURCE_CHANNEL_LABELS: Record<SourceChannel, string> = {
  job_korea: '잡코리아',
  headhunter: '헤드헌터',
  referral: '지인추천',
  university: '대학/커뮤니티',
  agency: '파견업체',
  direct: '직접지원',
  other: '기타',
}

export const SOURCE_CHANNEL_COLORS: Record<SourceChannel, string> = {
  job_korea: 'bg-blue-100 text-blue-700',
  headhunter: 'bg-purple-100 text-purple-700',
  referral: 'bg-green-100 text-green-700',
  university: 'bg-amber-100 text-amber-700',
  agency: 'bg-orange-100 text-orange-700',
  direct: 'bg-gray-100 text-gray-700',
  other: 'bg-slate-100 text-slate-700',
}

// ─── 지원자 상태 라벨 ───────────────────────────────────────────
export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  applied: '지원 접수',
  resume_reviewed: '이력서 검토',
  survey_sent: '질의서 발송',
  survey_done: '질의서 완료',
  interview_scheduled: '면접 예정',
  video_done: '화상면접 완료',
  face_to_face_done: '대면면접 완료',
  processing: '분석 중',
  analyzed: '분석 완료',
  decided: '결정 완료',
  hired: '합격',
  rejected: '불합격',
}

export const CANDIDATE_STATUS_COLORS: Record<CandidateStatus, string> = {
  applied: 'bg-gray-100 text-gray-700',
  resume_reviewed: 'bg-blue-100 text-blue-700',
  survey_sent: 'bg-indigo-100 text-indigo-700',
  survey_done: 'bg-violet-100 text-violet-700',
  interview_scheduled: 'bg-amber-100 text-amber-700',
  video_done: 'bg-orange-100 text-orange-700',
  face_to_face_done: 'bg-brand-100 text-brand-700',
  processing: 'bg-yellow-100 text-yellow-700',
  analyzed: 'bg-teal-100 text-teal-700',
  decided: 'bg-cyan-100 text-cyan-700',
  hired: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

// ─── 공고 상태 라벨 ─────────────────────────────────────────────
export const POSTING_STATUS_LABELS: Record<PostingStatus, string> = {
  draft: '임시저장',
  open: '모집 중',
  closed: '마감',
  cancelled: '취소',
}

export const POSTING_STATUS_COLORS: Record<PostingStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
}

// ─── 경력 수준 라벨 ─────────────────────────────────────────────
export const EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
  any: '무관',
  entry: '신입',
  junior: '주니어 (1~3년)',
  mid: '미드 (3~5년)',
  senior: '시니어 (5년+)',
  executive: '임원급',
}

// ─── 고용 형태 라벨 ─────────────────────────────────────────────
export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: '정규직',
  contract: '계약직',
  intern: '인턴',
  part_time: '파트타임',
}
