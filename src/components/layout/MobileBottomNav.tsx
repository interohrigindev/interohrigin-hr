import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface BottomTab {
  to: string
  label: string
  emoji: string
  matchPaths?: string[]
  minRole?: string
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
    minRole: 'director',
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
    emoji: '⚙️',
    matchPaths: ['/settings'],
  },
]

// 일반 직원용 탭 (채용 대신 게시판)
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
    emoji: '⚙️',
    matchPaths: ['/my-evaluations', '/settings'],
  },
]

const ADMIN_ROLES = ['director', 'division_head', 'ceo', 'admin']

export function MobileBottomNav() {
  const { profile } = useAuth()
  const location = useLocation()

  // 공개 페이지에서는 숨김
  const hiddenPaths = ['/login', '/careers', '/apply', '/survey/', '/accept-offer']
  if (hiddenPaths.some((p) => location.pathname.startsWith(p))) return null

  const isAdmin = profile?.role && ADMIN_ROLES.includes(profile.role)
  const tabs = isAdmin ? TABS : EMPLOYEE_TABS

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 md:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-14 px-1">
        {tabs.map((tab) => {
          const isActive = tab.matchPaths
            ? tab.matchPaths.some((p) => location.pathname.startsWith(p))
            : location.pathname === tab.to

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={cn(
                'flex flex-col items-center justify-center flex-1 py-1 min-w-0 transition-colors',
                isActive ? 'text-brand-600' : 'text-gray-400'
              )}
            >
              <span className="text-xl leading-none">{tab.emoji}</span>
              <span className={cn(
                'text-[10px] mt-0.5 truncate',
                isActive ? 'font-bold' : 'font-medium'
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
