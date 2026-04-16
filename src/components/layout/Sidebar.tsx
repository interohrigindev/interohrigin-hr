import { useState, useEffect } from 'react'
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
  FolderKanban,
  CalendarDays,
  // Bot, // AI 챗봇 메뉴 비활성화로 미사용
  LineChart,
  CalendarCheck,
  UsersRound,
  RefreshCw,
  FileBarChart,
  ShieldCheck,
  AlertTriangle,
  Zap,
  LayoutGrid,
  Columns3,
  Plus,
  CalendarPlus,
  // Clock, // 근태 메뉴 숨김으로 미사용
  FileCheck,
  Award,
  Wallet,
  BookOpen,
  Building,
  Mic,
  DollarSign,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
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
  // IO AI — 임시 숨김
  // {
  //   to: '/io-ai',
  //   label: 'IO AI',
  //   icon: <Sparkles className="h-5 w-5" />,
  // },
  {
    to: '/ceo-report',
    label: 'CEO 리포트',
    icon: <BarChart3 className="h-5 w-5" />,
    hideForRoles: ['employee', 'leader'] as EmployeeRole[],
  },
  {
    to: '/employee-signal',
    label: '직원 신호등',
    icon: <Users className="h-5 w-5" />,
    hideForRoles: ['employee', 'leader'] as EmployeeRole[],
  },
  {
    to: '/bulletin',
    label: '게시판',
    icon: <FileText className="h-5 w-5" />,
  },
  {
    to: '/meeting-notes',
    label: '회의록',
    icon: <Mic className="h-5 w-5" />,
  },
  {
    to: '/my-evaluations',
    label: '내 평가 결과',
    icon: <ClipboardCheck className="h-5 w-5" />,
  },
  // { to: '/calendar', label: '캘린더', icon: <CalendarDays className="h-5 w-5" /> }, // 일시 숨김
]

// 그룹 메뉴
const navGroups: NavGroup[] = [
  {
    id: 'urgent',
    label: '긴급 업무',
    icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
    items: [
      { to: '/admin/urgent', label: 'CEO 긴급 대시보드', icon: <Zap className="h-4 w-4" />, end: true },
      { to: '/admin/urgent/simple-eval', label: '간편 인사평가', icon: <ClipboardCheck className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
      { to: '/admin/urgent/penalties', label: '감점 현황', icon: <AlertTriangle className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
    ],
  },
  {
    id: 'recruitment',
    label: '채용관리',
    icon: <Briefcase className="h-5 w-5" />,
    minRole: 'director',
    items: [
      { to: '/admin/recruitment', label: '채용 대시보드', icon: <BarChart3 className="h-4 w-4" />, end: true },
      { to: '/admin/recruitment/jobs', label: '채용공고', icon: <FileSearch className="h-4 w-4" /> },
      { to: '/admin/recruitment/schedules', label: '면접 일정', icon: <Calendar className="h-4 w-4" /> },
      { to: '/admin/recruitment/survey', label: '사전 질의서', icon: <MessageSquare className="h-4 w-4" /> },
      { to: '/admin/recruitment/talent', label: '인재상 설정', icon: <Star className="h-4 w-4" /> },
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
      { to: '/admin/probation-results', label: '평가 결과', icon: <FileBarChart className="h-4 w-4" /> },
    ],
  },
  {
    id: 'projects',
    label: '프로젝트 & 업무',
    icon: <LayoutGrid className="h-5 w-5" />,
    items: [
      { to: '/admin/projects', label: '통합 대시보드', icon: <FolderKanban className="h-4 w-4" />, end: true },
      { to: '/admin/projects/board', label: '프로젝트 보드', icon: <Columns3 className="h-4 w-4" /> },
      { to: '/admin/projects/new', label: '새 프로젝트', icon: <Plus className="h-4 w-4" /> },
      { to: '/admin/work/tasks', label: '작업 관리', icon: <ClipboardCheck className="h-4 w-4" /> },
      { to: '/work/daily-report', label: '일일 보고서', icon: <CalendarDays className="h-4 w-4" /> },
      // { to: '/work/chat', label: 'AI 챗봇', icon: <Bot className="h-4 w-4" /> }, // 하단 AI 플로팅과 기능 중복으로 비활성화
      { to: '/admin/projects/settings', label: '권한 설정', icon: <Settings className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
    ],
  },
  {
    id: 'hr-ops',
    label: '인사노무',
    icon: <Building className="h-5 w-5" />,
    items: [
      { to: '/admin/leave', label: '연차 관리', icon: <CalendarPlus className="h-4 w-4" />, end: true },
      // { to: '/admin/attendance', label: '근태 관리', icon: <Clock className="h-4 w-4" /> }, // Sprint 0: 이번 배포 제외
      { to: '/admin/approval', label: '전자 결재', icon: <FileCheck className="h-4 w-4" /> },
      { to: '/admin/certificates', label: '증명서 발급', icon: <Award className="h-4 w-4" /> },
      { to: '/admin/organization', label: '조직도', icon: <Users className="h-4 w-4" /> },
      { to: '/admin/payroll', label: '급여 관리', icon: <Wallet className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
      { to: '/admin/training', label: '교육 관리', icon: <BookOpen className="h-4 w-4" /> },
    ],
  },
  {
    id: 'hr-eval',
    label: '인사평가',
    icon: <LineChart className="h-5 w-5" />,
    items: [
      { to: '/monthly-checkin', label: '월간 업무 점검', icon: <CalendarCheck className="h-4 w-4" /> },
      { to: '/peer-review', label: '동료 평가', icon: <UsersRound className="h-4 w-4" /> },
      { to: '/eval-dashboard', label: '평가 대시보드', icon: <BarChart3 className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
      { to: '/settings/evaluation', label: '평가 설정', icon: <Settings className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
      { to: '/admin/hr/ai-report', label: 'AI 평가 리포트', icon: <FileBarChart className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
      { to: '/admin/hr/verification', label: 'AI 검증', icon: <ShieldCheck className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
      { to: '/admin/hr/sync', label: '데이터 동기화', icon: <RefreshCw className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
    ],
  },
]

// ─── Component ──────────────────────────────────────────────────

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile, hasRole } = useAuth()
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [messengerUnread, setMessengerUnread] = useState(0)
  const [allowedMenus, setAllowedMenus] = useState<string[] | null>(null) // null = 로딩중 또는 권한 미설정 (전체 허용)

  // Fetch menu permissions
  useEffect(() => {
    if (!profile?.id) return

    async function fetchMenuPermissions() {
      const { data } = await supabase
        .from('menu_permissions')
        .select('allowed_menus')
        .eq('employee_id', profile!.id)
        .maybeSingle()

      if (data?.allowed_menus) {
        setAllowedMenus(data.allowed_menus as string[])
      } else {
        setAllowedMenus(null) // 권한 미설정 시 전체 허용
      }
    }

    fetchMenuPermissions()
  }, [profile?.id])

  // Fetch unread count for messenger badge
  useEffect(() => {
    if (!profile?.id) return

    async function fetchUnread() {
      const { data } = await supabase
        .from('chat_room_members')
        .select('unread_count')
        .eq('user_id', profile!.id)

      if (data) {
        const total = data.reduce((sum: number, m: { unread_count: number }) => sum + (m.unread_count || 0), 0)
        setMessengerUnread(total)
      }
    }

    fetchUnread()

    const channel = supabase
      .channel('sidebar-unread')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_room_members',
        filter: `user_id=eq.${profile.id}`,
      }, () => { fetchUnread() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  function resolvePath(item: NavItem): string {
    if (item.to === 'REPORT_SELF') return `/report/${profile?.id ?? ''}`
    return item.to as string
  }

  function isItemVisible(item: NavItem): boolean {
    if (item.hideForRoles && profile?.role && item.hideForRoles.includes(profile.role as EmployeeRole)) {
      return false
    }
    if (!item.minRole || hasRole(item.minRole)) {
      // 메뉴 권한이 설정되어 있으면 허용 목록에 있는지 확인
      // CEO/admin은 항상 전체 접근, 권한 미설정(null)이면 전체 허용
      if (allowedMenus === null || profile?.role === 'ceo' || profile?.role === 'admin') {
        return true
      }
      const path = typeof item.to === 'string' ? item.to : ''
      if (path === 'REPORT_SELF') return allowedMenus.includes('/report')
      return allowedMenus.includes(path)
    }
    return false
  }

  // 그룹이 보이려면 최소 1개 이상의 하위 메뉴가 보여야 함
  function isGroupVisible(group: NavGroup): boolean {
    if (group.minRole && !hasRole(group.minRole)) return false
    return group.items.some(isItemVisible)
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const visibleStandaloneItems = standaloneItems.filter(isItemVisible)
  const visibleGroups = navGroups.filter(isGroupVisible)

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
            <span className="flex-1">{item.label}</span>
            {item.to === '/messenger' && messengerUnread > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                {messengerUnread > 99 ? '99+' : messengerUnread}
              </span>
            )}
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
          <NavLink
            to="/settings/menu-permissions"
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
            <Shield className="h-5 w-5" />
            메뉴 권한 관리
          </NavLink>
          <NavLink
            to="/settings/billing"
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
            <DollarSign className="h-5 w-5" />
            비용 관리
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
