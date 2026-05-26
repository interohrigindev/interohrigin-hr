import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3,
  // PenSquare, ClipboardList, // D2-3: 인사평가 그룹에서 제거되어 미사용
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
  // AlertTriangle, Zap, // D3-1: 긴급업무 그룹 CEO 리포트 통합으로 미사용
  LayoutGrid,
  Columns3,
  Plus,
  CalendarPlus,
  Clock,
  FileCheck,
  Award,
  // Wallet, // 급여관리 숨김으로 미사용
  BookOpen,
  Building,
  // Mic, // D2-1: 회의록 메뉴 숨김으로 미사용
  DollarSign,
  Package,
  ScrollText,
  ToggleRight,
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
  /** 법적 리스크 대응 P1+: feature_rollouts 키 — 미지정이면 항상 노출 / 지정되면 토글 ON 시에만 노출 */
  featureKey?: string
}

interface NavGroup {
  id: string
  label: string
  icon: React.ReactNode
  minRole?: EmployeeRole
  items: NavItem[]
}

// D2-1: 재편된 상위 메뉴 (그룹 없는 개별 항목)
// 자기평가/내 평가 결과 → 인사평가 그룹 하위로 통합
// 일일 보고서 / 전자결재 → 최상위로 승격
// 멘토링/회의록 → 숨김 (OJT 내부·게시판으로 대체)
const standaloneItems: NavItem[] = [
  {
    to: '/work/daily-report',
    label: '일일 보고서',
    icon: <CalendarDays className="h-5 w-5" />,
  },
  {
    to: '/admin/approval',
    label: '전자 결재',
    icon: <FileCheck className="h-5 w-5" />,
  },
  {
    to: '/ceo-report',
    label: 'CEO 리포트',
    icon: <BarChart3 className="h-5 w-5" />,
    // CEO·시스템 관리자만 접근 (director/division_head/hr_admin 제외)
    hideForRoles: ['employee', 'leader', 'director', 'division_head', 'hr_admin'] as EmployeeRole[],
  },
  {
    to: '/employee-signal',
    label: '직원 신호등',
    icon: <Users className="h-5 w-5" />,
    hideForRoles: ['employee', 'leader', 'director', 'division_head', 'hr_admin'] as EmployeeRole[],
  },
  {
    to: '/bulletin',
    label: '게시판',
    icon: <FileText className="h-5 w-5" />,
  },
  // OJT 학습자(enrollment 보유 직원)에게만 노출 — Sidebar 내부 필터에서 처리
  {
    to: '/my/ojt',
    label: '내 OJT',
    icon: <GraduationCap className="h-5 w-5" />,
  },
  // 인터랙티브 온라인 매뉴얼 (전 직원 노출 — 자기 학습 도구)
  {
    to: '/manual',
    label: '매뉴얼',
    icon: <BookOpen className="h-5 w-5" />,
  },
  // 법적 리스크 대응 P1-1: 직원 본인의 연장근로 신청 (feature toggle 로 노출)
  {
    to: '/my/overtime',
    label: '내 연장근로',
    icon: <Clock className="h-5 w-5" />,
    featureKey: 'overtime_approval',
  },
  // 법적 리스크 대응 P1-3: 직원 본인의 연차 촉진 회신
  {
    to: '/my/leave-promotion',
    label: '내 연차 촉진 회신',
    icon: <Clock className="h-5 w-5" />,
    featureKey: 'leave_promotion',
  },
  // D2-1: '나의 인수인계' → 프로젝트 그룹 하위로 이동
]

// 사이드바 가장 하단에 별도 노출되는 항목 (그룹 메뉴들 아래)
// — 시스템 관리자 전용 메뉴
const bottomItems: NavItem[] = [
  {
    to: '/admin/monitoring',
    label: '시스템 모니터링',
    icon: <ShieldCheck className="h-5 w-5" />,
    hideForRoles: ['employee', 'leader', 'director', 'division_head', 'hr_admin', 'ceo'] as EmployeeRole[],
  },
]

// 그룹 메뉴
const navGroups: NavGroup[] = [
  // D3-1: 긴급 업무 그룹은 CEO 리포트에 통합 → Sidebar 에서 숨김 (라우트는 유지)
  // {
  //   id: 'urgent',
  //   label: '긴급 업무',
  //   icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
  //   items: [
  //     { to: '/admin/urgent', label: 'CEO 긴급 대시보드', icon: <Zap className="h-4 w-4" />, end: true },
  //     { to: '/admin/urgent/simple-eval', label: '간편 인사평가', icon: <ClipboardCheck className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
  //     { to: '/admin/urgent/penalties', label: '감점 현황', icon: <AlertTriangle className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
  //   ],
  // },
  {
    id: 'recruitment',
    label: '채용관리',
    icon: <Briefcase className="h-5 w-5" />,
    minRole: 'director',
    items: [
      { to: '/admin/recruitment', label: '채용 대시보드', icon: <BarChart3 className="h-4 w-4" />, end: true },
      { to: '/admin/recruitment/jobs', label: '채용공고', icon: <FileSearch className="h-4 w-4" /> },
      { to: '/admin/recruitment/schedules', label: '면접 일정', icon: <Calendar className="h-4 w-4" /> },
      { to: '/admin/recruitment/survey-test', label: '사전 질의서 v2 (PBD)', icon: <MessageSquare className="h-4 w-4" /> },
      { to: '/admin/recruitment/survey', label: '사전 질의서 v1 (구버전)', icon: <MessageSquare className="h-4 w-4" /> },
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
      { to: '/admin/employees/handover', label: '인수인계', icon: <Package className="h-4 w-4" /> },
    ],
  },
  {
    id: 'ojt',
    label: 'OJT/수습',
    icon: <GraduationCap className="h-5 w-5" />,
    minRole: 'director',
    items: [
      { to: '/admin/ojt', label: 'OJT 프로그램', icon: <GraduationCap className="h-4 w-4" />, end: true },
      // D2-1: 멘토-멘티는 OJT 프로그램 내부에서 관리 → 독립 메뉴 숨김
      { to: '/admin/ojt/weekly-reports', label: '주차별 보고서', icon: <CalendarCheck className="h-4 w-4" /> },
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
      // D2-1: 일일 보고서는 상위 standalone 으로 이동
      { to: '/my/handover', label: '나의 인수인계', icon: <Package className="h-4 w-4" /> },
      { to: '/admin/projects/settings', label: '권한 설정', icon: <Settings className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
    ],
  },
  {
    id: 'hr-ops',
    label: '인사노무',
    icon: <Building className="h-5 w-5" />,
    items: [
      { to: '/admin/leave', label: '연차 관리', icon: <CalendarPlus className="h-4 w-4" />, end: true },
      // 법적 리스크 대응 P1-1: 연장근로 사전 승인제 (feature toggle 로 노출)
      { to: '/admin/overtime', label: '연장근로 승인', icon: <Clock className="h-4 w-4" />, featureKey: 'overtime_approval' },
      // P1-2: 주 52시간 사전 경고
      { to: '/admin/hours-warning', label: '52시간 경고', icon: <Clock className="h-4 w-4" />, featureKey: 'weekly_52h_warning' },
      // P1-3: 연차 촉진
      { to: '/admin/leave-promotion', label: '연차 촉진', icon: <CalendarPlus className="h-4 w-4" />, featureKey: 'leave_promotion' },
      // P2-1: 징계
      { to: '/admin/disciplinary', label: '징계/면담', icon: <AlertCircle className="h-4 w-4" />, featureKey: 'disciplinary_case' },
      // P2-2: 수습 컴플라이언스
      { to: '/admin/probation-compliance', label: '수습 컴플라이언스', icon: <GraduationCap className="h-4 w-4" />, featureKey: 'probation_compliance' },
      // { to: '/admin/attendance', label: '근태 관리', icon: <Clock className="h-4 w-4" /> }, // Sprint 0: 이번 배포 제외
      // D2-1: 전자결재는 상위 standalone 으로 승격
      { to: '/admin/certificates', label: '증명서 발급', icon: <Award className="h-4 w-4" /> },
      { to: '/admin/organization', label: '조직도', icon: <Users className="h-4 w-4" /> },
      // { to: '/admin/payroll', label: '급여 관리', icon: <Wallet className="h-4 w-4" />, minRole: 'director' as EmployeeRole }, // 임시 숨김
      // 0512 미팅: 콘텐츠 미입력 — 콘텐츠 준비 완료까지 director 이상만 노출
      { to: '/admin/training', label: '교육 관리', icon: <BookOpen className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
    ],
  },
  {
    id: 'hr-eval',
    label: '인사평가',
    icon: <LineChart className="h-5 w-5" />,
    items: [
      // D2-3: 정규직 평가 통합 허브 (자기평가/평가하기/내 평가 결과는 허브 내부에서 네비게이션)
      // 회귀 fix 2026-05-26: minRole='director' 라 leader 가 메뉴를 못 봐서 본인 부서 직원
      // 평가 진행 불가 (예: 김보미 팀장 → 유지혜 평가 차단). hub 내부 NavCard 는 leader 노출이므로
      // 메뉴와 내부 로직 일치를 위해 minRole='leader' 로 변경 (employee 만 자기평가 화면으로 유도).
      { to: '/evaluation', label: '정규직 평가', icon: <Award className="h-4 w-4" />, end: true, minRole: 'leader' as EmployeeRole },
      { to: '/monthly-checkin', label: '월간 업무 점검', icon: <CalendarCheck className="h-4 w-4" /> },
      { to: '/peer-review', label: '동료 평가', icon: <UsersRound className="h-4 w-4" /> },
      { to: '/eval-dashboard', label: '평가 대시보드', icon: <BarChart3 className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
      { to: '/settings/evaluation', label: '평가 설정', icon: <Settings className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
      { to: '/admin/hr/ai-report', label: 'AI 평가 리포트', icon: <FileBarChart className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
      { to: '/admin/hr/verification', label: 'AI 검증', icon: <ShieldCheck className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
      { to: '/admin/hr/sync', label: '데이터 동기화', icon: <RefreshCw className="h-4 w-4" />, minRole: 'director' as EmployeeRole },
    ],
  },
  // 시스템 관리 — 법적 리스크 대응 P0 인프라 (감사 로그 / 기능 토글)
  // CEO/admin/hr_admin 등 상위 권한만 노출
  {
    id: 'system',
    label: '시스템 관리',
    icon: <Shield className="h-5 w-5" />,
    minRole: 'hr_admin' as EmployeeRole,
    items: [
      { to: '/admin/system/feature-rollouts', label: '기능 토글', icon: <ToggleRight className="h-4 w-4" /> },
      { to: '/admin/system/audit-logs',       label: '감사 로그', icon: <ScrollText className="h-4 w-4" /> },
      // P2-3 익명 신고
      { to: '/admin/system/anonymous-reports', label: '익명 신고 처리', icon: <ShieldCheck className="h-4 w-4" />, featureKey: 'anonymous_report' },
      // P3-1 법령 파라미터
      { to: '/admin/system/legal-params',     label: '법령 파라미터', icon: <ToggleRight className="h-4 w-4" />, featureKey: 'legal_params_sync' },
      // 알림 채널 설정 (Slack/Webhook/Push)
      { to: '/admin/system/notification-channels', label: '알림 채널 설정', icon: <ShieldCheck className="h-4 w-4" /> },
    ],
  },
]

// ─── Component ──────────────────────────────────────────────────

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile, hasRole } = useAuth()
  const location = useLocation()
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  // 현재 경로가 그룹 내부 메뉴이면 해당 그룹 자동 펼침 (매뉴얼 Tour 시 selector 매칭 보장)
  useEffect(() => {
    const auto: Record<string, boolean> = {}
    navGroups.forEach((group) => {
      const inGroup = group.items.some(
        (it) => typeof it.to === 'string' && location.pathname.startsWith(it.to)
      )
      if (inGroup) auto[group.id] = true
    })
    if (Object.keys(auto).length > 0) {
      setExpandedGroups((prev) => ({ ...prev, ...auto }))
    }
  }, [location.pathname])
  const [messengerUnread, setMessengerUnread] = useState(0)
  const [allowedMenus, setAllowedMenus] = useState<string[] | null>(null) // null = 로딩중 또는 권한 미설정 (전체 허용)
  const [hasOjtEnrollment, setHasOjtEnrollment] = useState(false)
  const [isResigning, setIsResigning] = useState(false)
  // 법적 리스크 대응 P1+ : 활성화된 feature_rollouts 키 집합 (메뉴 표시 제어)
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(new Set())

  // feature_rollouts 로드
  useEffect(() => {
    if (!profile?.id) return
    ;(async () => {
      const { data } = await supabase
        .from('feature_rollouts')
        .select('feature_key, is_enabled')
      const set = new Set<string>()
      ;(data || []).forEach((r: { feature_key: string; is_enabled: boolean }) => {
        if (r.is_enabled) set.add(r.feature_key)
      })
      setEnabledFeatures(set)
    })()
  }, [profile?.id])

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

  // OJT enrollment 보유 여부 — "내 OJT" 사이드바 노출 조건
  useEffect(() => {
    if (!profile?.id) return
    ;(async () => {
      const { count } = await supabase
        .from('ojt_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', profile.id)
      setHasOjtEnrollment((count || 0) > 0)
    })()
  }, [profile?.id])

  // 0512: 퇴사 예정자 플래그 — '나의 인수인계' 사이드바 노출 조건
  useEffect(() => {
    if (!profile?.id) return
    ;(async () => {
      const { data } = await supabase
        .from('employees')
        .select('is_resigning')
        .eq('id', profile.id)
        .maybeSingle()
      setIsResigning(Boolean((data as { is_resigning?: boolean } | null)?.is_resigning))
    })()
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

  // 사이드바 경로 ↔ 메뉴 권한 페이지(/settings/menu-permissions) 경로 별칭 매핑
  // (메뉴 권한 페이지에서 저장한 키가 사이드바 to 경로와 다를 경우, 어느 쪽이 저장돼 있어도 인식)
  const PATH_ALIASES: Record<string, string[]> = {
    '/monthly-checkin':        ['/admin/monthly-checkin'],
    '/peer-review':            ['/admin/peer-review'],
    '/eval-dashboard':         ['/admin/evaluation'],
    '/settings/evaluation':    ['/admin/settings/evaluation'],
    '/admin/hr/ai-report':     ['/admin/evaluation/ai-report'],
    '/admin/hr/verification':  ['/admin/evaluation/ai-verify'],
    '/admin/hr/sync':          ['/admin/evaluation/sync'],
    '/admin/employees/search': ['/admin/employees'],
    '/admin/projects':         ['/admin/dashboard'],
    '/admin/projects/board':   ['/admin/projects'],
    '/admin/work/tasks':       ['/admin/work'],
    '/work/daily-report':      ['/admin/work/daily'],
    '/admin/recruitment/jobs': ['/admin/recruitment/postings'],
    '/admin/recruitment/schedules': ['/admin/recruitment/interviews'],
    '/admin/recruitment/trust': ['/admin/recruitment/ai-trust'],
    // v2 PBD 결과 — v1 사전질의서 권한이 있으면 v2 도 보이도록
    '/admin/recruitment/survey-test': ['/admin/recruitment/survey'],
    '/admin/probation-results':['/admin/probation-results'],
  }

  // 조직 의사결정 권한자 — minRole / menu_permissions 모두 우회 (전체 메뉴 접근)
  const AUTO_BYPASS_ROLES = ['ceo', 'admin', 'director', 'division_head', 'hr_admin']

  function isItemVisible(item: NavItem): boolean {
    if (item.hideForRoles && profile?.role && item.hideForRoles.includes(profile.role as EmployeeRole)) {
      return false
    }
    // 법적 리스크 대응 P1+: feature toggle 미활성 메뉴 숨김 (admin/ceo 도 동일하게 숨김 — 기능 토글 화면에서 활성화 후 노출)
    if (item.featureKey && !enabledFeatures.has(item.featureKey)) {
      return false
    }
    // 우회 역할은 minRole 충족 여부와 무관하게 노출
    // (hr_admin 은 ROLE_HIERARCHY 가 2 라서 hasRole('director')=false 이지만 채용/직원/OJT 접근 필요)
    if (profile?.role && AUTO_BYPASS_ROLES.includes(profile.role)) {
      return true
    }
    if (!item.minRole || hasRole(item.minRole)) {
      if (allowedMenus === null) {
        return true
      }
      const path = typeof item.to === 'string' ? item.to : ''
      if (path === 'REPORT_SELF') return allowedMenus.includes('/report')
      if (allowedMenus.includes(path)) return true
      // 별칭 경로도 인식
      const aliases = PATH_ALIASES[path] || []
      return aliases.some((a) => allowedMenus.includes(a))
    }
    return false
  }

  // 그룹이 보이려면 최소 1개 이상의 하위 메뉴가 보여야 함
  // minRole 미충족 사용자라도 menu_permissions 에 명시적으로 권한이 부여된 하위 항목이 있으면 노출
  // (예: 리더에게 '수습 평가' 권한만 부여한 경우 OJT/수습 그룹이 열림)
  function isGroupVisible(group: NavGroup): boolean {
    // 우회 역할은 group.minRole 무관하게 — 하위 가시 항목이 1개라도 있으면 노출
    if (profile?.role && AUTO_BYPASS_ROLES.includes(profile.role)) {
      return group.items.some(isItemVisible)
    }
    const meetsRole = !group.minRole || hasRole(group.minRole)
    if (meetsRole) return group.items.some(isItemVisible)
    // minRole 미충족 — 명시적 menu_permissions 권한 보유 항목이 있으면 노출
    if (!allowedMenus) return false
    return group.items.some((item) => {
      if (item.hideForRoles && profile?.role && item.hideForRoles.includes(profile.role as EmployeeRole)) return false
      // featureKey 미활성 메뉴는 그룹 가시성 계산에서 제외 (feature OFF 면 권한 보유해도 노출 X)
      if (item.featureKey && !enabledFeatures.has(item.featureKey)) return false
      const path = typeof item.to === 'string' ? item.to : ''
      if (!path) return false
      if (allowedMenus.includes(path)) return true
      const aliases = PATH_ALIASES[path] || []
      return aliases.some((a) => allowedMenus.includes(a))
    })
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const visibleStandaloneItems = standaloneItems.filter((item) => {
    // "내 OJT" 는 enrollment 보유 직원에게만 노출
    if (typeof item.to === 'string' && item.to === '/my/ojt' && !hasOjtEnrollment) return false
    return isItemVisible(item)
  })
  // 빠른 메뉴 (사이드바 상단 그룹): 일일 보고서, 전자 결재, 게시판
  const QUICK_MENU_PATHS = ['/work/daily-report', '/admin/approval', '/bulletin']
  const visibleQuickItems = visibleStandaloneItems.filter(
    (item) => typeof item.to === 'string' && QUICK_MENU_PATHS.includes(item.to)
  )
  const visibleOtherStandalone = visibleStandaloneItems.filter(
    (item) => !(typeof item.to === 'string' && QUICK_MENU_PATHS.includes(item.to))
  )
  const visibleGroups = navGroups.filter(isGroupVisible)
  const visibleBottomItems = bottomItems.filter(isItemVisible)

  // standalone 항목 렌더링 헬퍼
  // wrapper div + data-tour — NavLink prop forward 보장 X 회피 (querySelector 안정성)
  const renderStandaloneItem = (item: typeof standaloneItems[number]) => {
    const path = resolvePath(item)
    const tourKey = `nav:${typeof item.to === 'string' ? item.to : path}`
    return (
      <div key={path} data-tour={tourKey}>
        <NavLink
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
      </div>
    )
  }

  const navContent = (
    <nav className="flex flex-col gap-1 p-4 overflow-y-auto">
      {/* 빠른 메뉴 — 자주 쓰는 일일 보고서/전자 결재/게시판 */}
      {visibleQuickItems.length > 0 && (
        <>
          <div className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            빠른 메뉴
          </div>
          {visibleQuickItems.map(renderStandaloneItem)}
          {visibleOtherStandalone.length > 0 && (
            <div className="my-2 border-t border-gray-200" />
          )}
        </>
      )}

      {/* 기타 개별 메뉴 (CEO 리포트, 직원 신호등, 내 OJT 등) */}
      {visibleOtherStandalone.map(renderStandaloneItem)}

      {/* 구분선 */}
      {visibleGroups.length > 0 && (
        <div className="my-2 border-t border-gray-200" />
      )}

      {/* 그룹 메뉴 */}
      {visibleGroups.map((group) => {
        const isExpanded = expandedGroups[group.id] ?? false
        return (
          <div key={group.id} data-tour={`group:${group.id}`}>
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
                {group.items.filter((it) => {
                  // 0512: '나의 인수인계' 는 퇴사 예정자에게만 노출
                  if (typeof it.to === 'string' && it.to === '/my/handover' && !isResigning) return false
                  return isItemVisible(it)
                }).map((item) => {
                  const path = resolvePath(item)
                  const tourKey = `nav:${typeof item.to === 'string' ? item.to : path}`
                  return (
                    <div key={path} data-tour={tourKey}>
                      <NavLink
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
                    </div>
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

      {/* 사이드바 진짜 최하단 — 시스템 관리자 전용 (비용 관리 아래) */}
      {visibleBottomItems.length > 0 && (
        <>
          <div className="my-2 border-t border-gray-200" />
          {visibleBottomItems.map((item) => {
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
              </NavLink>
            )
          })}
        </>
      )}
    </nav>
  )

  return (
    <>
      {/* ─── Desktop sidebar ──────────────────────────────────── */}
      <aside data-tour="sidebar" className="hidden w-60 shrink-0 border-r border-gray-200 bg-white md:flex md:flex-col md:h-full">
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
