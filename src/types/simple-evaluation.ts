// ─── P-23: 인사평가 간소화 타입 ──────────────────────────────────

export type SimpleScoreValue = 1 | 2 | 3 | 4 | 5
export type OverallRecommendation = 'promote' | 'maintain' | 'observe' | 'warning'

export const SIMPLE_SCORE_LABELS: Record<SimpleScoreValue, string> = {
  1: '매우미흡',
  2: '미흡',
  3: '보통',
  4: '우수',
  5: '매우우수',
}

export const RECOMMENDATION_LABELS: Record<OverallRecommendation, string> = {
  promote: '승진추천',
  maintain: '유지',
  observe: '주의관찰',
  warning: '경고',
}

export const RECOMMENDATION_COLORS: Record<OverallRecommendation, string> = {
  promote: 'bg-emerald-100 text-emerald-700',
  maintain: 'bg-blue-100 text-blue-700',
  observe: 'bg-amber-100 text-amber-700',
  warning: 'bg-red-100 text-red-700',
}

// 간소화 평가 10개 항목
export const SIMPLE_EVAL_ITEMS = [
  { key: 'performance', label: '업무 성과', description: '목표 달성도와 업무 결과물의 질' },
  { key: 'responsibility', label: '책임감', description: '맡은 업무에 대한 책임감과 완수 의지' },
  { key: 'communication', label: '소통/협업', description: '팀원 및 타부서와의 소통과 협업 능력' },
  { key: 'expertise', label: '전문성', description: '직무 관련 전문 지식과 기술 수준' },
  { key: 'growth', label: '성장 가능성', description: '학습 의지와 발전 가능성' },
  { key: 'culture_fit', label: '조직 적합도', description: '회사 문화와 가치에 대한 부합도' },
  { key: 'attendance', label: '근태/태도', description: '출퇴근 성실도와 근무 태도' },
  { key: 'leadership', label: '리더십', description: '팀 이끌기 및 후배 육성 (팀장급)' },
  { key: 'creativity', label: '창의성/주도성', description: '새로운 아이디어 제안 및 자발적 업무 수행' },
  { key: 'recommendation', label: '종합 추천', description: '승진추천 / 유지 / 주의관찰 / 경고' },
] as const

export type SimpleEvalItemKey = typeof SIMPLE_EVAL_ITEMS[number]['key']

// 한 직원에 대한 간소화 평가 데이터
export interface SimpleEvalData {
  employee_id: string
  scores: Record<string, SimpleScoreValue | null>  // key → 1~5 (recommendation 제외)
  recommendation: OverallRecommendation | null
  overall_comment: string  // 총평 (2줄 이내)
  special_note: string     // 특이사항 (선택)
}

// AI 참고 데이터
export interface AIReferenceData {
  task_completion_rate: number | null
  deadline_compliance_rate: number | null
  urgent_reminder_count: number
  ojt_score: number | null
  mentor_rating: string | null
  positive_notes: number
  negative_notes: number
  penalty_score: number
}
