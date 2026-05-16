import type { ProbationEvaluatorRole } from '@/types/employee-lifecycle'

/**
 * 로그인 사용자의 employees.role 값을 수습평가 평가자 역할(ProbationEvaluatorRole)로 매핑.
 * 평가 다이얼로그의 "평가자 역할" 기본값 결정에 사용.
 *
 * 매핑:
 *  - ceo                                    → ceo
 *  - director / executive / division_head   → executive
 *  - leader                                 → leader
 *  - 그 외 (admin/일반 직원/null/undefined)   → leader (안전한 fallback)
 *
 * admin도 leader로 fallback되지만, admin이 직접 평가하는 케이스는 사실상 없으며
 * 필요 시 다이얼로그에서 수동 변경 가능.
 */
export function getDefaultEvaluatorRole(role: string | null | undefined): ProbationEvaluatorRole {
  switch (role) {
    case 'ceo':
      return 'ceo'
    case 'director':
    case 'executive':
    case 'division_head':
      return 'executive'
    case 'leader':
      return 'leader'
    default:
      return 'leader'
  }
}
