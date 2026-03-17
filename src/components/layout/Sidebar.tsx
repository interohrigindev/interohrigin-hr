import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  PenSquare,
  ClipboardList,
  FileText,
  Settings,
  X,
  Briefcase,
  FileSearch,
  MessageSquare,
  Star,
  Shield,
  Users,
  Search,
  Sparkles,
  AlertCircle,
  LogOut,
  GraduationCap,
  UserCheck,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  Calendar,
  Clipboard,
  FolderKanban,
  ListChecks,
  CalendarDays,
  Bot,
  LineChart,
  RefreshCw,
  FileBarChart,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import type { EmployeeRole } from '@/types/database'
import logoSvg from '@/assets/logo.svg'

// ─── Sidebar props ──────────────────────────────────────────────

interface SidebarProps {
  open: boolean
  onClose: () => void
}

// ─── Menu definition ────────────────────────────────────────────

interface NavItem {
  to: string | (() => string)
  label: string
  icon: React.ReactNode
  minRole?: EmployeeRole
  hideForRoles?: EmployeeRole[]
  end?: boolean
}

interface NavGroup {
  id: string
  label: string
  icon: React.ReactNode
  minRole?: EmployeeRole
  items: NavItem[]
}

// 기존 평가 시스템 메뉴 (그룹 없는 개별 항목)
const standaloneItems: NavItem[] = [
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
    to: 'REPORT_SELF',
    label: '내 결과',
    icon: <FileText className="h-5 w-5" />,
    hideForRoles: ['director', 'division_head', 'ceo', 'admin'],
  },
]

// 그룹 메뉴
const navGroups: NavGroup[] = [
  {
    id: 'recruitment',
    label: '채용관리',
    icon: <Briefcase className="h-5 w-5" />,
    minRole: 'director',
    items: [
      { to: '/admin/recruitment', label: '채용 대시보드', icon: <BarChart3 className="h-4 w-4" />, end: true },
      { to: '/admin/recruitment/jobs', label: '채용공고', icon: <FileSearch className="h-4 w-4" /> },
      { to: '/admin/recruitment/survey', label: '사전 질의서', icon: <MessageSquare className="h-4 w-4" /> },
      { to: '/admin/recruitment/talent', label: '인재상 설정', icon: <Star className="h-4 w-4" /> },
      { to: '/admin/recruitment/schedules', label: '면접 일정', icon: <Calendar className="h-4 w-4" /> },
      { to: '/admin/recruitment/trust', label: 'AI 신뢰도', icon: <Shield className="h-4 w-4" /> },
    ],
  },
  {
    id: 'employees',
    label: '직원관리',
    icon: <Users className="h-5 w-5" />,
    minRole: 'director',
    items: [
      { to: '/admin/employees/search', label: '통합 프로필 검색', icon: <Search className="h-4 w-4" /> },
      { to: '/admin/employees/analysis', label: '사주/MBTI 분석', icon: <Sparkles className="h-4 w-4" /> },
      { to: '/admin/employees/notes', label: '특이사항 관리', icon: <AlertCircle className="h-4 w-4" /> },
      { to: '/admin/employees/exit', label: '퇴사 관리', icon: <LogOut className="h-4 w-4" /> },
    ],
  },
  {
    id: 'ojt',
    label: 'OJT/수습',
    icon: <GraduationCap className="h-5 w-5" />,
    minRole: 'director',
    items: [
      { to: '/admin/ojt', label: 'OJT 프로그램', icon: <GraduationCap className="h-4 w-4" />, end: true },
      { to: '/admin/ojt/mentor', label: '멘토-멘티', icon: <UserCheck className="h-4 w-4" /> },
      { to: '/admin/probation', label: '수습 평가', icon: <ClipboardCheck className="h-4 w-4" /> },
    ],
  },
  {
    id: 'work',
    label: '업무관리',
    icon: <Clipboard className="h-5 w-5" />,
    items: [
      { to: '/admin/work', label: '업무 대시보드', icon: <FolderKanban className="h-4 w-4" />, end: true, minRole: 'director' as EmployeeRole },
      { to: '/admin/work/projects', label: '프로젝트', icon: <ListChecks className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
      { to: '/admin/work/tasks', label: '작업 관리', icon: <ClipboardCheck className="h-4 w-4" /> },
      { to: '/work/daily-report', label: '일일 보고서', icon: <CalendarDays className="h-4 w-4" /> },
      { to: '/work/chat', label: 'AI 챗봇', icon: <Bot className="h-4 w-4" /> },
    ],
  },
  {
    id: 'hr-eval',
    label: '인사평가',
    icon: <LineChart className="h-5 w-5" />,
    minRole: 'director',
    items: [
      { to: '/eval-dashboard', label: '평가 대시보드', icon: <BarChart3 className="h-4 w-4" /> },
      { to: '/settings/evaluation', label: '평가 설정', icon: <Settings className="h-4 w-4" /> },
      { to: '/admin/hr/ai-report', label: 'AI 평가 리포트', icon: <FileBarChart className="h-4 w-4" /> },
      { to: '/admin/hr/verification', label: 'AI 검증', icon: <ShieldCheck className="h-4 w-4" /> },
      { to: '/admin/hr/sync', label: '데이터 동기화', icon: <RefreshCw className="h-4 w-4" /> },
    ],
  },
]

// ─── Component ──────────────────────────────────────────────────

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile, hasRole } = useAuth()
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  function resolvePath(item: NavItem): string {
    if (item.to === 'REPORT_SELF') return `/report/${profile?.id ?? ''}`
    return item.to as string
  }

  function isItemVisible(item: NavItem): boolean {
    if (item.hideForRoles && profile?.role && item.hideForRoles.includes(profile.role as EmployeeRole)) {
      return false
    }
    return !item.minRole || hasRole(item.minRole)
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const visibleStandaloneItems = standaloneItems.filter(isItemVisible)
  const visibleGroups = navGroups.filter((g) => !g.minRole || hasRole(g.minRole))

  const navContent = (
    <nav className="flex flex-col gap-1 p-4 overflow-y-auto">
      {/* 기존 개별 메뉴 */}
      {visibleStandaloneItems.map((item) => {
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

      {/* 구분선 */}
      {visibleGroups.length > 0 && (
        <div className="my-2 border-t border-gray-200" />
      )}

      {/* 그룹 메뉴 */}
      {visibleGroups.map((group) => {
        const isExpanded = expandedGroups[group.id] ?? false
        return (
          <div key={group.id}>
            <button
              onClick={() => toggleGroup(group.id)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              {group.icon}
              <span className="flex-1 text-left">{group.label}</span>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
            </button>

            {isExpanded && (
              <div className="ml-4 flex flex-col gap-0.5">
                {group.items.filter(isItemVisible).map((item) => {
                  const path = resolvePath(item)
                  return (
                    <NavLink
                      key={path}
                      to={path}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-brand-50 text-brand-700 font-medium'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                        )
                      }
                    >
                      {item.icon}
                      {item.label}
                    </NavLink>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* 구분선 + 일반 설정 */}
      {hasRole('director') && (
        <>
          <div className="my-2 border-t border-gray-200" />
          <NavLink
            to="/settings/general"
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
            <Settings className="h-5 w-5" />
            일반 설정
          </NavLink>
        </>
      )}
    </nav>
  )

  return (
    <>
      {/* ─── Desktop sidebar ──────────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white md:flex md:flex-col md:h-full">
        {navContent}
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
                  인터오리진 <span className="text-brand-600">HR Platform</span>
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
          </aside>
        </div>
      )}
    </>
  )
}
