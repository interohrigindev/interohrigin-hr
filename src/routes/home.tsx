import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BlockItem {
  title: string
  description: string
  icon: React.ElementType
  color: string
  bg: string
  path: string
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
]

const QUICK_LINKS: { label: string; icon: React.ElementType; path: string }[] = [
  { label: '직원 검색', icon: Search, path: '/admin/employees/search' },
  { label: '채용공고', icon: Briefcase, path: '/admin/recruitment/jobs' },
  { label: '면접 일정', icon: CalendarDays, path: '/admin/recruitment/schedules' },
  { label: 'AI 챗봇', icon: Bot, path: '/work/chat' },
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
    <div className="space-y-8">
      {/* 인사말 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          안녕하세요, {profile?.name}님
        </h1>
        <p className="text-sm text-gray-500 mt-1">인터오리진 HR Platform에 오신 것을 환영합니다.</p>
      </div>

      {/* CEO 긴급 업무 배너 */}
      <UrgentTasksBanner navigate={navigate} />

      {/* 메인 블록 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_BLOCKS.map((block) => (
          <button
            key={block.path}
            onClick={() => navigate(block.path)}
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
    {
      title: 'AI 챗봇',
      description: '업무 관련 질문을 AI에게 물어봅니다',
      icon: Bot,
      color: 'text-violet-600',
      bg: 'bg-violet-50 hover:bg-violet-100 border-violet-200',
      path: '/work/chat',
    },
    {
      title: '내 정보',
      description: '개인 정보를 확인하고 수정합니다',
      icon: Users,
      color: 'text-gray-600',
      bg: 'bg-gray-50 hover:bg-gray-100 border-gray-200',
      path: '/my-profile',
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          안녕하세요, {profile?.name}님
        </h1>
        <p className="text-sm text-gray-500 mt-1">오늘도 좋은 하루 되세요.</p>
      </div>

      {/* CEO 긴급 업무 배너 */}
      <UrgentTasksBanner navigate={navigate} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {blocks.map((block) => (
          <button
            key={block.path}
            onClick={() => navigate(block.path)}
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
