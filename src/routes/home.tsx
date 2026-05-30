import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/Card'
import {
  Briefcase,
  Users,
  GraduationCap,
  Clipboard,
  BarChart3,
  Settings,
  Search,
  CalendarDays,
  Bot,
  PenSquare,
  FileText,
  ClipboardList,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  UserPlus,
  FolderKanban,
  Clock,
  ShoppingBag,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { openIoMall } from '@/lib/iomall'
import { openIoCs as openIoCsSso } from '@/lib/iocs'
import { DateWeatherWidget } from '@/components/DateWeatherWidget'

// 0513: IO CS 고객관리 플랫폼 접근 — 역할/부서 기반 자동 판정
// 허용: 시스템 관리자(admin), 대표(ceo), 임원(director/division_head),
//       BM 리더(role=leader & 부서명에 'BM'), CS 부서(부서명에 'CS' 또는 '고객')
const IOCS_ALWAYS_ALLOWED_ROLES = ['admin', 'director', 'division_head', 'ceo']

async function checkIoCsAccess(profile: { id?: string; role?: string | null; department_id?: string | null } | null): Promise<boolean> {
  if (!profile?.role) return false
  // 1) 시스템 관리자 / 대표 / 임원 — 항상 허용
  if (IOCS_ALWAYS_ALLOWED_ROLES.includes(profile.role)) return true

  // 1-2) 개별 허용 플래그 (직원정보에서 'CS 접근 허용' 켠 경우)
  if (profile.id) {
    const { data: emp } = await supabase
      .from('employees').select('iocs_access').eq('id', profile.id).single()
    if (emp?.iocs_access === true) return true
  }

  // 2) 부서명 조회 (BM 리더 + CS 부서 판정용)
  if (!profile.department_id) return false
  const { data: dept } = await supabase
    .from('departments').select('name').eq('id', profile.department_id).single()
  const deptName = dept?.name ?? ''

  // 3) CS 부서 소속이면 누구나 허용
  if (/(CS|고객)/i.test(deptName)) return true

  // 4) BM 리더 — role=leader AND 부서명에 BM
  if (profile.role === 'leader' && /BM/i.test(deptName)) return true

  return false
}

async function openIoCs(profile: { id?: string; role?: string | null; department_id?: string | null } | null) {
  const ok = await checkIoCsAccess(profile)
  if (!ok) {
    alert('IO CS 고객관리 플랫폼은 승인된 사용자만 사용할 수 있습니다.\n(허용: CS 부서 · 임원 · BM 리더 · 대표 · 시스템 관리자)')
    return
  }
  // IO Mall 과 동일 방식 — /sso 라우트로 토큰 전달 (Supabase 세션 공유)
  await openIoCsSso('/')
}

interface BlockItem {
  title: string
  description: string
  icon: React.ElementType
  color: string
  bg: string
  path: string
  onClick?: () => void  // path 대신 custom action (SSO 등)
}

const ADMIN_BLOCKS: BlockItem[] = [
  {
    title: '채용관리',
    description: '채용공고, 지원자 관리, 면접 일정, AI 분석',
    icon: Briefcase,
    color: 'text-violet-600',
    bg: 'bg-violet-50 hover:bg-violet-100 border-violet-200',
    path: '/admin/recruitment',
  },
  {
    title: '직원관리',
    description: '통합 프로필 검색, 사주/MBTI, 특이사항',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
    path: '/admin/employees/search',
  },
  {
    title: 'OJT / 수습',
    description: 'OJT 프로그램, 멘토-멘티, 수습 평가',
    icon: GraduationCap,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200',
    path: '/admin/ojt',
  },
  {
    title: '업무관리',
    description: '프로젝트, 작업, 일일 보고서, AI 챗봇',
    icon: Clipboard,
    color: 'text-amber-600',
    bg: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
    path: '/admin/work',
  },
  {
    title: '인사평가',
    description: '평가 대시보드, 평가 설정, AI 리포트',
    icon: BarChart3,
    color: 'text-rose-600',
    bg: 'bg-rose-50 hover:bg-rose-100 border-rose-200',
    path: '/eval-dashboard',
  },
  {
    title: '일반 설정',
    description: '직원 등록, AI 설정, 시스템 관리',
    icon: Settings,
    color: 'text-gray-600',
    bg: 'bg-gray-50 hover:bg-gray-100 border-gray-200',
    path: '/settings/general',
  },
  {
    title: 'IO Mall',
    description: '복지 포인트 몰 (별도 탭에서 열림)',
    icon: ShoppingBag,
    color: 'text-gold-600',
    bg: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
    path: 'iomall',
    onClick: () => openIoMall('/'),
  },
  // 0513: IO CS — onClick 은 컴포넌트 내부에서 profile 주입해 덮어씀
  {
    title: 'IO CS',
    description: '고객관리 플랫폼 (승인된 사용자만 / 별도 탭)',
    icon: MessageSquare,
    color: 'text-sky-600',
    bg: 'bg-sky-50 hover:bg-sky-100 border-sky-200',
    path: 'iocs',
  },
]

const QUICK_LINKS: { label: string; icon: React.ElementType; path: string }[] = [
  { label: '직원 검색', icon: Search, path: '/admin/employees/search' },
  { label: '채용공고', icon: Briefcase, path: '/admin/recruitment/jobs' },
  { label: '면접 일정', icon: CalendarDays, path: '/admin/recruitment/schedules' },
  // AI 챗봇 일시 숨김 (사용자 요청 2026-05-30) — 필요 시 주석 해제
  // { label: 'AI 챗봇', icon: Bot, path: '/work/chat' },
  { label: '일일 보고서', icon: CalendarDays, path: '/work/daily-report' },
]

export default function Home() {
  const { profile, hasRole } = useAuth()
  const navigate = useNavigate()

  // 관리자/임원이 아니면 기존 자기평가 또는 일일보고서로
  if (!hasRole('director')) {
    return <EmployeeHome navigate={navigate} />
  }

  return (
    <div className="space-y-6">
      {/* 인사말 + 날짜·날씨 위젯 */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            안녕하세요, {profile?.name}님
          </h1>
          <p className="text-sm text-gray-500 mt-1">인터오리진 HR Platform에 오신 것을 환영합니다.</p>
        </div>
        <DateWeatherWidget />
      </div>

      {/* KPI 위젯 카드 */}
      <KPIWidgets />

      {/* CEO 긴급 업무 배너 */}
      <UrgentTasksBanner navigate={navigate} />

      {/* 오늘의 일정 */}
      <TodayScheduleWidget navigate={navigate} />

      {/* 메인 블록 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_BLOCKS.map((block) => (
          <button
            key={block.path}
            onClick={() => {
              if (block.path === 'iocs') { openIoCs(profile as { id?: string; role?: string | null; department_id?: string | null } | null); return }
              if (block.onClick) block.onClick()
              else navigate(block.path)
            }}
            className={`flex items-start gap-4 rounded-2xl border p-5 text-left transition-all ${block.bg}`}
          >
            <div className={`rounded-xl p-3 bg-white shadow-sm ${block.color}`}>
              <block.icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900">{block.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{block.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* 빠른 링크 */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 mb-3">빠른 링크</h2>
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <link.icon className="h-4 w-4 text-gray-400" />
              {link.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// 일반 직원용 홈
function EmployeeHome({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { profile } = useAuth()

  const blocks: BlockItem[] = [
    {
      title: '자기평가',
      description: '이번 분기 자기평가를 작성합니다',
      icon: PenSquare,
      color: 'text-brand-600',
      bg: 'bg-brand-50 hover:bg-brand-100 border-brand-200',
      path: '/self-evaluation',
    },
    {
      title: '내 평가 결과',
      description: '평가 결과와 AI 분석 리포트를 확인합니다',
      icon: FileText,
      color: 'text-blue-600',
      bg: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      path: `/report/${profile?.id ?? ''}`,
    },
    {
      title: '일일 보고서',
      description: '오늘의 업무를 기록합니다',
      icon: CalendarDays,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200',
      path: '/work/daily-report',
    },
    {
      title: '작업 관리',
      description: '나에게 배정된 작업을 확인합니다',
      icon: ClipboardList,
      color: 'text-amber-600',
      bg: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      path: '/admin/work/tasks',
    },
    // AI 챗봇 카드 일시 숨김 (사용자 요청 2026-05-30) — 필요 시 주석 해제
    // {
    //   title: 'AI 챗봇',
    //   description: '업무 관련 질문을 AI에게 물어봅니다',
    //   icon: Bot,
    //   color: 'text-violet-600',
    //   bg: 'bg-violet-50 hover:bg-violet-100 border-violet-200',
    //   path: '/work/chat',
    // },
    {
      title: '내 정보',
      description: '개인 정보를 확인하고 수정합니다',
      icon: Users,
      color: 'text-gray-600',
      bg: 'bg-gray-50 hover:bg-gray-100 border-gray-200',
      path: '/my-profile',
    },
    {
      title: 'IO Mall',
      description: '복지 포인트로 쇼핑하기 (별도 탭에서 열림)',
      icon: ShoppingBag,
      color: 'text-amber-600',
      bg: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      path: 'iomall',
      onClick: () => openIoMall('/'),
    },
    // 0513: IO CS — 승인된 사용자만 접근
    {
      title: 'IO CS',
      description: '고객관리 플랫폼 (승인된 사용자만 / 별도 탭)',
      icon: MessageSquare,
      color: 'text-sky-600',
      bg: 'bg-sky-50 hover:bg-sky-100 border-sky-200',
      path: 'iocs',
    },
  ]

  return (
    <div className="space-y-8">
      {/* 인사말 + 날짜·날씨 위젯 */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            안녕하세요, {profile?.name}님
          </h1>
          <p className="text-sm text-gray-500 mt-1">오늘도 좋은 하루 되세요.</p>
        </div>
        <DateWeatherWidget />
      </div>

      {/* 내 업무 현황 카드 */}
      <MyWorkKPI userId={profile?.id} />

      {/* CEO 긴급 업무 배너 */}
      <UrgentTasksBanner navigate={navigate} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {blocks.map((block) => (
          <button
            key={block.path}
            onClick={() => {
              if (block.path === 'iocs') { openIoCs(profile as { id?: string; role?: string | null; department_id?: string | null } | null); return }
              if (block.onClick) block.onClick()
              else navigate(block.path)
            }}
            className={`flex items-start gap-4 rounded-2xl border p-5 text-left transition-all ${block.bg}`}
          >
            <div className={`rounded-xl p-3 bg-white shadow-sm ${block.color}`}>
              <block.icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900">{block.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{block.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── KPI 위젯 카드 ───────────────────────────────────────────────
function KPIWidgets() {
  const [kpis, setKpis] = useState({ urgentCount: 0, projectCount: 0, candidateCount: 0, pendingApprovals: 0 })

  useEffect(() => {
    async function fetch() {
      const [urgentRes, projRes, candRes, approvalRes] = await Promise.all([
        supabase.from('urgent_tasks').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress', 'overdue']),
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('candidates').select('id', { count: 'exact', head: true }).eq('status', 'applied'),
        supabase.from('approval_documents').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ])
      setKpis({
        urgentCount: urgentRes.count || 0,
        projectCount: projRes.count || 0,
        candidateCount: candRes.count || 0,
        pendingApprovals: approvalRes.count || 0,
      })
    }
    fetch()
  }, [])

  const cards = [
    { label: '긴급 업무', value: kpis.urgentCount, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: '진행 프로젝트', value: kpis.projectCount, icon: FolderKanban, color: 'text-brand-600', bg: 'bg-brand-50' },
    { label: '신규 지원자', value: kpis.candidateCount, icon: UserPlus, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: '미처리 결재', value: kpis.pendingApprovals, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map(c => (
        <Card key={c.label}>
          <CardContent className="py-4 flex items-center gap-3">
            <div className={cn('rounded-lg p-2', c.bg)}>
              <c.icon className={cn('h-5 w-5', c.color)} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
              <p className="text-xs text-gray-500">{c.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── 오늘의 일정 위젯 ────────────────────────────────────────────
function TodayScheduleWidget({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [todayEvents, setTodayEvents] = useState<{ id: string; title: string; event_type: string; start_datetime: string; all_day: boolean }[]>([])

  useEffect(() => {
    async function fetch() {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const { data } = await supabase
        .from('company_events')
        .select('id, title, event_type, start_datetime, all_day')
        .gte('start_datetime', todayStart.toISOString())
        .lte('start_datetime', todayEnd.toISOString())
        .order('start_datetime')
        .limit(5)

      if (data) setTodayEvents(data)
    }
    fetch()
  }, [])

  if (todayEvents.length === 0) return null

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand-600" />
            오늘의 일정
          </h3>
          <button
            onClick={() => navigate('/calendar')}
            className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-0.5"
          >
            전체 <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-2">
          {todayEvents.map(evt => (
            <div key={evt.id} className="flex items-center gap-3 text-sm">
              <span className="text-xs text-gray-400 w-12 shrink-0">
                {evt.all_day ? '종일' : new Date(evt.start_datetime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
              <span className="text-gray-700">{evt.title}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── CEO 긴급 업무 배너 (전 직원 표시) ───────────────────────────
function UrgentTasksBanner({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [urgentTasks, setUrgentTasks] = useState<{
    id: string
    title: string
    priority: number
    deadline: string
    status: string
    reminder_count: number
  }[]>([])

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('urgent_tasks')
        .select('id, title, priority, deadline, status, reminder_count')
        .in('status', ['pending', 'in_progress', 'overdue'])
        .order('priority', { ascending: true })
        .limit(5)

      if (data) setUrgentTasks(data)
    }
    fetch()
  }, [])

  if (urgentTasks.length === 0) return null

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <h2 className="font-semibold text-gray-900">CEO 긴급 업무</h2>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            {urgentTasks.length}건
          </span>
        </div>
        <button
          onClick={() => navigate('/admin/urgent')}
          className="flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-700"
        >
          전체 보기
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {urgentTasks.map((task, i) => {
          const dl = new Date(task.deadline)
          const now = new Date()
          const diffDays = Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          const ddayLabel = diffDays > 0 ? `D-${diffDays}` : diffDays === 0 ? 'D-Day' : `D+${Math.abs(diffDays)}`

          return (
            <button
              key={task.id}
              onClick={() => navigate('/admin/urgent')}
              className="flex w-full items-center gap-3 rounded-lg bg-white p-3 text-left hover:bg-gray-50 transition-colors border border-red-100"
            >
              <span className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                task.priority <= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              )}>
                {i + 1}
              </span>
              <span className="flex-1 text-sm font-medium text-gray-900 truncate">
                {task.title}
              </span>
              <span className={cn(
                'text-xs font-medium',
                diffDays <= 1 ? 'text-red-600' : 'text-gray-500'
              )}>
                {ddayLabel}
              </span>
              {task.reminder_count > 0 && (
                <span className="text-xs text-gray-400">
                  {task.reminder_count}회
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── 내 업무 현황 카드 (직원/관리자 공통) ──────────────────────────
import { CheckCircle, ListTodo, MessageCircle } from 'lucide-react'

function MyWorkKPI({ userId }: { userId?: string }) {
  const navigate = useNavigate()
  const [kpi, setKpi] = useState({ done: 0, inProgress: 0, projects: 0, feedbacks: 0 })

  useEffect(() => {
    if (!userId) return
    async function load() {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

      const [doneRes, progressRes, projRes, feedbackRes] = await Promise.all([
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assignee_id', userId).eq('status', 'done'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assignee_id', userId).eq('status', 'in_progress'),
        supabase.from('project_boards').select('id', { count: 'exact', head: true }).contains('assignee_ids', [userId]),
        // 전일 업무보고에 달린 코멘트 수
        supabase.from('daily_reports').select('id, comments').eq('employee_id', userId).eq('report_date', yesterday).maybeSingle(),
      ])

      const comments = (feedbackRes.data?.comments as unknown[] || [])

      setKpi({
        done: doneRes.count || 0,
        inProgress: progressRes.count || 0,
        projects: projRes.count || 0,
        feedbacks: comments.length,
      })
    }
    load()
  }, [userId])

  const cards = [
    { label: '완료 작업', value: kpi.done, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', path: '/admin/work/tasks' },
    { label: '진행중 작업', value: kpi.inProgress, icon: ListTodo, color: 'text-blue-600', bg: 'bg-blue-50', path: '/admin/work/tasks' },
    { label: '내 프로젝트', value: kpi.projects, icon: FolderKanban, color: 'text-brand-600', bg: 'bg-brand-50', path: '/admin/projects' },
    { label: '전일 피드백', value: kpi.feedbacks, icon: MessageCircle, color: 'text-amber-600', bg: 'bg-amber-50', path: '/work/daily-report' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map(c => (
        <button key={c.label} onClick={() => navigate(c.path)} className="text-left">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="py-4 flex items-center gap-3">
              <div className={cn('rounded-lg p-2', c.bg)}>
                <c.icon className={cn('h-5 w-5', c.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  )
}
