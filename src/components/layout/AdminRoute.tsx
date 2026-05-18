import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { PageSpinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'
import { ShieldX } from 'lucide-react'

const ADMIN_ROLES = ['director', 'division_head', 'ceo', 'admin']

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  const location = useLocation()
  const [allowedMenus, setAllowedMenus] = useState<string[] | null>(null)
  const [permLoading, setPermLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) {
      setPermLoading(false)
      return
    }
    let cancelled = false
    setPermLoading(true)
    supabase.from('menu_permissions')
      .select('allowed_menus')
      .eq('employee_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setAllowedMenus((data?.allowed_menus as string[]) || null)
        setPermLoading(false)
      })
    return () => { cancelled = true }
  }, [profile?.id])

  if (loading || permLoading) {
    return <PageSpinner />
  }

  const isAdminRole = !!profile?.role && ADMIN_ROLES.includes(profile.role)
  // 명시적 menu_permissions 권한 보유 시 우회 허용 (예: 리더에게 '수습 평가' 권한 부여 케이스)
  // location.pathname 의 정확 매칭 또는 prefix(자식 경로) 매칭 — '/admin/probation' 권한이면 '/admin/probation/reminder' 도 허용
  const hasMenuPermission = !!allowedMenus && allowedMenus.some((p) =>
    location.pathname === p || location.pathname.startsWith(p + '/')
  )

  if (!isAdminRole && !hasMenuPermission) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <ShieldX className="h-12 w-12 text-gray-300" />
        <p className="text-lg font-medium text-gray-600">접근 권한이 없습니다</p>
        <p className="text-sm text-gray-400">이 페이지는 본부장, 이사, 대표이사, 관리자 또는 메뉴 권한이 부여된 사용자만 접근할 수 있습니다</p>
        <a href="/" className="mt-2 text-sm text-brand-600 hover:underline">
          대시보드로 돌아가기
        </a>
      </div>
    )
  }

  return <>{children}</>
}
