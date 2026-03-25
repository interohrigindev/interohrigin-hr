import { useAuth } from '@/hooks/useAuth'
import { PageSpinner } from '@/components/ui/Spinner'
import { ShieldX } from 'lucide-react'

const ADMIN_ROLES = ['director', 'division_head', 'ceo', 'admin']

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return <PageSpinner />
  }

  if (!profile?.role || !ADMIN_ROLES.includes(profile.role)) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <ShieldX className="h-12 w-12 text-gray-300" />
        <p className="text-lg font-medium text-gray-600">접근 권한이 없습니다</p>
        <p className="text-sm text-gray-400">이 페이지는 본부장, 이사, 대표이사 또는 관리자만 접근할 수 있습니다</p>
        <a href="/" className="mt-2 text-sm text-brand-600 hover:underline">
          대시보드로 돌아가기
        </a>
      </div>
    )
  }

  return <>{children}</>
}
