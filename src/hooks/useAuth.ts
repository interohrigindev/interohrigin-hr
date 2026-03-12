import { useAuth as useAuthContext } from '@/contexts/AuthContext'
import { ROLE_HIERARCHY } from '@/lib/constants'
import type { EmployeeRole } from '@/types/database'

export function useAuth() {
  const context = useAuthContext()

  const role = context.profile?.role ?? null

  /** director, ceo 또는 admin인지 여부 */
  const isAdmin = role === 'director' || role === 'division_head' || role === 'ceo' || role === 'admin'

  /**
   * 현재 사용자 역할이 minRole 이상인지 확인
   * 예: hasRole('leader') → leader, director, ceo 모두 true
   */
  function hasRole(minRole: EmployeeRole): boolean {
    if (!role) return false
    return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole]
  }

  return {
    ...context,
    isAdmin,
    hasRole,
  }
}
