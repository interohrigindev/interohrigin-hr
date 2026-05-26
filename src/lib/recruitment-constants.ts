import type { SourceChannel, CandidateStatus, PostingStatus } from '@/types/recruitment'

// ─── 유입 경로 라벨 (임원/대표 열람 시에도 한눈에 이해되도록 한국어 명확화) ─────────
// 3대 핵심 구분 (대표 요청, 2026-05-26):
//   1) 직접 지원 (direct)            — 지원자가 공개 폼에서 본인 지원
//   2) 인사팀 지원 (manual_upload)    — 인사담당이 받은 이력서를 시스템에 수동 업로드
//   3) 파견업체 (agency/headhunter)   — 외부 채용 대행 (상세에 업체명·구분 표기)
// 그 외: 잡코리아, 지인추천, 대학/커뮤니티, 기타
export const SOURCE_CHANNEL_LABELS: Record<SourceChannel, string> = {
  direct:        '직접 지원',
  manual_upload: '인사팀 지원',
  headhunter:    '파견업체 (헤드헌팅)',
  agency:        '파견업체 (파견)',
  referral:      '지인 추천',
  job_korea:     '잡코리아',
  university:    '대학/커뮤니티',
  other:         '기타',
}

export const SOURCE_CHANNEL_COLORS: Record<SourceChannel, string> = {
  direct:        'bg-emerald-100 text-emerald-700',   // 지원자 본인 — 가장 선호되는 채널 (초록)
  manual_upload: 'bg-sky-100 text-sky-700',           // 내부 직접 등록 (하늘색)
  headhunter:    'bg-purple-100 text-purple-700',
  agency:        'bg-orange-100 text-orange-700',
  referral:      'bg-green-100 text-green-700',
  job_korea:     'bg-blue-100 text-blue-700',
  university:    'bg-amber-100 text-amber-700',
  other:         'bg-slate-100 text-slate-700',
}

// ─── 지원자 상태 라벨 ───────────────────────────────────────────
export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  applied: '지원 접수',
  resume_reviewed: '이력서 검토',
  survey_sent: '질의서 발송',
  survey_done: '질의서 완료',
  interview_scheduled: '1차 면접 예정',
  video_done: '1차 화상면접 완료',
  face_to_face_scheduled: '2차 면접 예정',
  face_to_face_done: '2차 대면면접 완료',
  processing: '분석 중',
  analyzed: '분석 완료',
  decided: '결정 완료',
  hired: '합격',
  rejected: '불합격',
  no_show: '지원 불참',
}

export const CANDIDATE_STATUS_COLORS: Record<CandidateStatus, string> = {
  applied: 'bg-gray-100 text-gray-700',
  resume_reviewed: 'bg-blue-100 text-blue-700',
  survey_sent: 'bg-indigo-100 text-indigo-700',
  survey_done: 'bg-violet-100 text-violet-700',
  interview_scheduled: 'bg-amber-100 text-amber-700',
  video_done: 'bg-orange-100 text-orange-700',
  face_to_face_scheduled: 'bg-purple-100 text-purple-700',
  face_to_face_done: 'bg-brand-100 text-brand-700',
  processing: 'bg-yellow-100 text-yellow-700',
  analyzed: 'bg-teal-100 text-teal-700',
  decided: 'bg-cyan-100 text-cyan-700',
  hired: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  no_show: 'bg-gray-200 text-gray-600',
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
