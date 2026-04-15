import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface BottomTab {
  to: string
  label: string
  emoji: string
  matchPaths?: string[]
}

const TABS: BottomTab[] = [
  {
    to: '/admin/projects',
    label: '업무',
    emoji: '📋',
    matchPaths: ['/admin/projects', '/admin/work', '/work/daily-report'],
  },
  {
    to: '/admin/attendance',
    label: '근태',
    emoji: '⏰',
    matchPaths: ['/admin/attendance', '/admin/leave', '/admin/approval'],
  },
  {
    to: '/admin/recruitment',
    label: '채용',
    emoji: '💼',
    matchPaths: ['/admin/recruitment'],
  },
  {
    to: '/meeting-notes',
    label: '회의',
    emoji: '🎙️',
    matchPaths: ['/meeting-notes'],
  },
  {
    to: '/settings/general',
    label: '더보기',
    emoji: '☰',
    matchPaths: ['/settings'],
  },
]

const EMPLOYEE_TABS: BottomTab[] = [
  {
    to: '/admin/projects',
    label: '업무',
    emoji: '📋',
    matchPaths: ['/admin/projects', '/admin/work', '/work/daily-report'],
  },
  {
    to: '/admin/attendance',
    label: '근태',
    emoji: '⏰',
    matchPaths: ['/admin/attendance', '/admin/leave', '/admin/approval'],
  },
  {
    to: '/bulletin',
    label: '게시판',
    emoji: '📌',
    matchPaths: ['/bulletin'],
  },
  {
    to: '/meeting-notes',
    label: '회의',
    emoji: '🎙️',
    matchPaths: ['/meeting-notes'],
  },
  {
    to: '/my-evaluations',
    label: '더보기',
    emoji: '☰',
    matchPaths: ['/my-evaluations', '/settings'],
  },
]

const ADMIN_ROLES = ['director', 'division_head', 'ceo', 'admin']
const HIDDEN_PATHS = ['/login', '/careers', '/apply', '/survey/', '/accept-offer', '/io-ai']

export function MobileBottomNav() {
  const { profile } = useAuth()
  const location = useLocation()

  if (HIDDEN_PATHS.some((p) => location.pathname.startsWith(p))) return null
  if (!profile) return null

  const isAdmin = profile.role && ADMIN_ROLES.includes(profile.role)
  const tabs = isAdmin ? TABS : EMPLOYEE_TABS

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden safe-area-bottom bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-[0_-1px_6px_rgba(0,0,0,0.06)]">
      <div className="grid grid-cols-5 h-[56px]">
        {tabs.map((tab) => {
          const isActive = tab.matchPaths
            ? tab.matchPaths.some((p) => location.pathname.startsWith(p))
            : location.pathname === tab.to

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className="flex flex-col items-center justify-center gap-0.5 relative"
            >
              {/* 활성 표시 점 */}
              {isActive && (
                <span className="absolute top-1 w-1 h-1 rounded-full bg-brand-500" />
              )}
              <span className={cn(
                'text-[22px] leading-none mt-1 transition-transform',
                isActive && 'scale-110'
              )}>
                {tab.emoji}
              </span>
              <span className={cn(
                'text-[10px] leading-tight',
                isActive ? 'text-brand-600 font-bold' : 'text-gray-400 font-medium'
              )}>
                {tab.label}
              </span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
