import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  PenSquare,
  ClipboardList,
  FileText,
  Settings,
  X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import type { EmployeeRole } from '@/types/database'
import { MethodologyFooter } from '@/components/layout/MethodologyFooter'
import logoSvg from '@/assets/logo.svg'

// ─── Sidebar props ──────────────────────────────────────────────

interface SidebarProps {
  open: boolean
  onClose: () => void
}

// ─── Menu definition ────────────────────────────────────────────

interface NavItem {
  to: string | (() => string) // static path or factory
  label: string
  icon: React.ReactNode
  minRole?: EmployeeRole
  /** 이 역할 목록에 포함되면 메뉴 숨김 */
  hideForRoles?: EmployeeRole[]
  end?: boolean
}

const navItems: NavItem[] = [
  {
    to: '/',
    label: '대시보드',
    icon: <BarChart3 className="h-5 w-5" />,
    minRole: 'director',
    end: true,
  },
  {
    to: '/self-evaluation',
    label: '자기평가',
    icon: <PenSquare className="h-5 w-5" />,
    hideForRoles: ['director', 'division_head', 'ceo', 'admin'],
  },
  {
    to: '/evaluate',
    label: '평가하기',
    icon: <ClipboardList className="h-5 w-5" />,
    minRole: 'leader',
    hideForRoles: ['admin'],
  },
  {
    to: 'REPORT_SELF', // placeholder – resolved at render time
    label: '내 결과',
    icon: <FileText className="h-5 w-5" />,
    hideForRoles: ['director', 'division_head', 'ceo', 'admin'],
  },
  {
    to: '/settings',
    label: '설정',
    icon: <Settings className="h-5 w-5" />,
    minRole: 'director',
  },
]

// ─── Component ──────────────────────────────────────────────────

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile, hasRole } = useAuth()

  function resolvePath(item: NavItem): string {
    if (item.to === 'REPORT_SELF') return `/report/${profile?.id ?? ''}`
    return item.to as string
  }

  const visibleItems = navItems.filter((item) => {
    if (item.hideForRoles && profile?.role && item.hideForRoles.includes(profile.role as EmployeeRole)) {
      return false
    }
    return !item.minRole || hasRole(item.minRole)
  })

  const navContent = (
    <nav className="flex flex-col gap-1 p-4">
      {visibleItems.map((item) => {
        const path = resolvePath(item)
        return (
          <NavLink
            key={path}
            to={path}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* ─── Desktop sidebar ──────────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white md:flex md:flex-col md:h-full">
        {navContent}
        <div className="mt-auto">
          <MethodologyFooter mode="compact" />
        </div>
      </aside>

      {/* ─── Mobile overlay ───────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <aside className="relative z-50 flex h-full w-60 flex-col bg-white shadow-xl">
            {/* Drawer header */}
            <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
              <div className="flex items-center gap-2">
                <img src={logoSvg} alt="InterOhrigin" className="h-7 w-7" />
                <span className="text-lg font-bold text-gray-900">
                  인터오리진 <span className="text-brand-600">인사평가</span>
                </span>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                aria-label="메뉴 닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {navContent}
            <div className="mt-auto">
              <MethodologyFooter mode="compact" />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
