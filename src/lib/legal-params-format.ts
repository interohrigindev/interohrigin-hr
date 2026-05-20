/**
 * legal_params 한국어 라벨 + 사람이 읽기 좋은 포맷
 *  - 관리자 페이지의 raw JSON 표시를 친숙한 한국어 문구로 변환
 */

export interface ParamMeta {
  label: string          // 한국어 명칭
  category: string       // 분류 (임금/보험/근로시간/연차/공휴일/시스템)
  desc: string           // 한 줄 설명
  format: (v: any) => string  // 값 → 한국어 문구
  legalRef?: string      // 근거 법령 (있을 때)
}

const pct = (n: number, digits = 2) => `${(n * 100).toFixed(digits)}%`
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

export const PARAM_META: Record<string, ParamMeta> = {
  min_wage_hourly: {
    label: '최저임금 (시급)',
    category: '임금',
    desc: '법정 시간당 최저임금',
    legalRef: '최저임금법',
    format: (v) => `시간당 ${won(v.amount || 0)}`,
  },
  national_pension_rate: {
    label: '국민연금 요율',
    category: '4대보험',
    desc: '근로자와 사업주가 절반씩 부담',
    legalRef: '국민연금법',
    format: (v) =>
      `근로자 ${pct(v.employee_rate || 0)} + 사업주 ${pct(v.employer_rate || 0)} (합계 ${pct(v.total || 0, 1)})`,
  },
  health_insurance_rate: {
    label: '건강보험 요율',
    category: '4대보험',
    desc: '근로자와 사업주가 절반씩 부담 + 장기요양보험료 추가',
    legalRef: '국민건강보험법',
    format: (v) =>
      `근로자 ${pct(v.employee_rate || 0)} + 사업주 ${pct(v.employer_rate || 0)} (합계 ${pct(v.total || 0)}) · 장기요양 ${pct(v.long_term_care_rate || 0, 3)}`,
  },
  employment_insurance_rate: {
    label: '고용보험 요율',
    category: '4대보험',
    desc: '실업급여분 (근로자/사업주 분담) + 사업주 추가 부담분',
    legalRef: '고용보험법',
    format: (v) =>
      `근로자 ${pct(v.employee_rate || 0)} + 사업주 ${pct(v.employer_rate || 0)} · 사업주 추가 ${pct(v.additional_employer_rate_lt150 || 0)} (150인 미만)`,
  },
  industrial_accident_rate: {
    label: '산재보험 요율',
    category: '4대보험',
    desc: '사업주 전액 부담. 업종별로 요율이 다름',
    legalRef: '산업재해보상보험법',
    format: (v) => `평균 ${pct(v.employer_rate_avg || 0)} (사업주 전액, 업종별 차등)`,
  },
  weekly_max_hours: {
    label: '주 최대 근로시간',
    category: '근로시간',
    desc: '5인 이상 사업장의 1주 근로시간 한도',
    legalRef: '근로기준법 §50, §53',
    format: (v) =>
      `기본 ${v.regular || 0}시간 + 연장 ${v.overtime_max || 0}시간 = 최대 ${v.total_max || 0}시간`,
  },
  annual_leave_grant: {
    label: '연차 휴가 부여 기준',
    category: '연차',
    desc: '입사 후 근속연수에 따른 연차 일수',
    legalRef: '근로기준법 §60',
    format: (v) =>
      `1년 미만: 매월 ${v.first_year_monthly || 0}일 · 1년 이상: ${v.after_year_base || 0}일 · 장기근속 ${v.long_service_add_per_2y || 0}일/2년 추가 (최대 ${v.max_with_long_service || 0}일)`,
  },
  api_keys: {
    label: 'API 인증키 (시스템)',
    category: '시스템',
    desc: '공공 API 자동 동기화용 인증키 저장소',
    format: (v) => {
      const keys = Object.keys(v || {}).filter((k) => v[k])
      if (keys.length === 0) return '등록된 키 없음'
      return keys.map((k) => `${k}: ${maskKey(v[k])}`).join(' · ')
    },
  },
}

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '***'
  return `${key.slice(0, 4)}...${key.slice(-4)} (${key.length}자)`
}

/**
 * 키에 매칭되는 메타 정보 조회. 매칭 없으면 fallback 으로 raw 키 + JSON 반환
 */
export function getParamMeta(paramKey: string): ParamMeta {
  // 공휴일 동적 키 처리 (public_holidays_2026 등)
  const holidayMatch = paramKey.match(/^public_holidays_(\d{4})$/)
  if (holidayMatch) {
    return {
      label: `${holidayMatch[1]}년 공휴일`,
      category: '공휴일',
      desc: '한국천문연구원 특일정보 API 기반',
      legalRef: '관공서의 공휴일에 관한 규정',
      format: (v) => {
        const list = v?.holidays || []
        return `${list.length}일 등록${list.length > 0 ? ` (${list[0]?.name || ''} ~ ${list[list.length - 1]?.name || ''})` : ''}`
      },
    }
  }
  return (
    PARAM_META[paramKey] || {
      label: paramKey,
      category: '기타',
      desc: '커스텀 파라미터',
      format: (v) => JSON.stringify(v),
    }
  )
}

export const CATEGORY_COLORS: Record<string, string> = {
  '임금': 'bg-rose-100 text-rose-700',
  '4대보험': 'bg-blue-100 text-blue-700',
  '근로시간': 'bg-amber-100 text-amber-700',
  '연차': 'bg-emerald-100 text-emerald-700',
  '공휴일': 'bg-purple-100 text-purple-700',
  '시스템': 'bg-gray-100 text-gray-600',
  '기타': 'bg-slate-100 text-slate-600',
}
