import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ClipboardList, CalendarDays, CalendarPlus, FileCheck, MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BottomTab {
  to: string
  label: string
  icon: typeof ClipboardList
  matchPaths: string[]
}

const TABS: BottomTab[] = [
  {
    to: '/admin/projects',
    label: '업무',
    icon: ClipboardList,
    matchPaths: ['/admin/projects', '/admin/work'],
  },
  {
    to: '/work/daily-report',
    label: '일일보고',
    icon: CalendarDays,
    matchPaths: ['/work/daily-report'],
  },
  {
    to: '/admin/leave',
    label: '연차',
    icon: CalendarPlus,
    matchPaths: ['/admin/leave', '/admin/attendance'],
  },
  {
    to: '/admin/approval',
    label: '결재',
    icon: FileCheck,
    matchPaths: ['/admin/approval'],
  },
  {
    to: '/bulletin',
    label: '게시판',
    icon: MessageSquareText,
    matchPaths: ['/bulletin'],
  },
]

const HIDDEN_PATHS = ['/login', '/careers', '/apply', '/survey/', '/accept-offer', '/io-ai']

export function MobileBottomNav() {
  const { profile } = useAuth()
  const location = useLocation()

  if (!profile) return null
  if (HIDDEN_PATHS.some((p) => location.pathname.startsWith(p))) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden safe-area-bottom bg-white border-t border-gray-200">
      <div className="grid grid-cols-5 h-14">
        {TABS.map((tab) => {
          const isActive = tab.matchPaths.some((p) => location.pathname.startsWith(p))
          const Icon = tab.icon

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className="flex flex-col items-center justify-center gap-[2px]"
            >
              <Icon className={cn(
                'h-5 w-5 transition-colors',
                isActive ? 'text-brand-600 stroke-[2.5]' : 'text-gray-400 stroke-[1.5]'
              )} />
              <span className={cn(
                'text-[10px] leading-none',
                isActive ? 'text-brand-600 font-semibold' : 'text-gray-400'
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
