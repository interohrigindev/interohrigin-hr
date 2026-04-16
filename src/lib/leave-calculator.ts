/**
 * 연차 자동 부여 계산기 — 근로기준법 기반
 *
 * 1년 미만: 1개월 개근 시 1일 (최대 11일)
 * 1년 이상: 15일
 * 3년 이상: 15일 + (근속연수-1)/2 (소수점 버림, 최대 25일)
 */

export interface LeaveCalcResult {
  totalDays: number        // 연간 부여 일수
  yearsOfService: number   // 근속 연수
  monthsOfService: number  // 근속 개월수
  description: string      // 설명
}

/**
 * 입사일 기반 연차 일수 계산
 * @param hireDate 입사일 (YYYY-MM-DD)
 * @param baseDate 기준일 (기본: 오늘)
 */
export function calculateAnnualLeave(hireDate: string, baseDate?: string): LeaveCalcResult {
  const hire = new Date(hireDate)
  const base = baseDate ? new Date(baseDate) : new Date()

  const diffMs = base.getTime() - hire.getTime()
  if (diffMs < 0) {
    return { totalDays: 0, yearsOfService: 0, monthsOfService: 0, description: '미입사' }
  }

  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  const yearsOfService = Math.floor(diffDays / 365)
  const monthsOfService = Math.floor(diffDays / 30)

  let totalDays: number
  let description: string

  if (yearsOfService < 1) {
    // 1년 미만: 만근 월수 × 1일 (최대 11일)
    totalDays = Math.min(monthsOfService, 11)
    description = `입사 ${monthsOfService}개월 (1년 미만: 월 1일 × ${totalDays}개월)`
  } else if (yearsOfService < 3) {
    // 1~2년: 15일
    totalDays = 15
    description = `근속 ${yearsOfService}년 (기본 15일)`
  } else {
    // 3년 이상: 15일 + (근속연수-1)/2 가산 (최대 25일)
    const bonus = Math.floor((yearsOfService - 1) / 2)
    totalDays = Math.min(15 + bonus, 25)
    description = `근속 ${yearsOfService}년 (15일 + 가산 ${bonus}일)`
  }

  return { totalDays, yearsOfService, monthsOfService, description }
}

/**
 * 반차 차감 일수 (0.5일)
 */
export const HALF_DAY = 0.5

/**
 * 연차 촉진 대상 여부 (잔여 연차 기준)
 */
export function isPromotionTarget(remaining: number, threshold: number = 5): boolean {
  return remaining >= threshold
}
