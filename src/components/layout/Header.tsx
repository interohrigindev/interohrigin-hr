import { LogOut, Menu, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import logoSvg from '@/assets/logo.svg'
import { ROLE_LABELS } from '@/lib/constants'
import { Badge } from '@/components/ui/Badge'
import type { EmployeeRole } from '@/types/database'

interface HeaderProps {
  onMenuToggle: () => void
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white safe-area-top">
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        {/* Left: hamburger + title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuToggle}
            className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 md:hidden"
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 rounded-lg px-1.5 py-1 -ml-1.5 hover:bg-gray-100 transition-colors"
            aria-label="메인으로 이동"
            title="메인으로 이동"
          >
            <img src={logoSvg} alt="InterOhrigin" className="h-7 w-7 md:h-8 md:w-8" />
            <h1 className="text-base md:text-lg font-bold tracking-tight text-gray-900">
              <span className="hidden sm:inline">인터오리진 </span>
              <span className="sm:hidden">IO </span>
              <span className="text-brand-600">HR Platform</span>
            </h1>
          </button>
        </div>

        {/* Right: user info + logout */}
        {profile && (
          <div className="flex items-center gap-3">
            {/* 내 정보 링크 */}
            <button
              onClick={() => navigate('/my-profile')}
              className="hidden sm:flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              title="내 정보"
            >
              <User className="h-4 w-4 text-gray-400" />
              {profile.name}
            </button>
            <Badge variant="primary">{ROLE_LABELS[profile.role as EmployeeRole] ?? profile.role}</Badge>

            <div className="h-5 w-px bg-gray-200" />

            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
