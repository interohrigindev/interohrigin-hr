/**
 * D2-3: 정규직 평가 통합 컨테이너
 * 목표 설정 → 매월 점검 → 자기평가 → 리더 평가 → 임원 평가 → 대표 평가 전 단계를 한 페이지에서 네비게이션
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import {
  ClipboardList, CalendarCheck, PenSquare, FileText, CheckCircle, Circle,
  ArrowRight, Users, Award, TrendingUp,
} from 'lucide-react'

interface EvaluationTargetRow {
  id: string
  employee_id: string
  status: string
  period_id: string
}

interface PeriodRow { id: string; year: number; quarter: number; is_active: boolean }

const STATUS_ORDER = ['pending', 'self_done', 'leader_done', 'director_done', 'ceo_done', 'completed']

const STEP_LABELS: { key: string; label: string; description: string; icon: typeof ClipboardList }[] = [
  { key: 'pending',       label: '목표 설정 & 자기평가', description: '분기 목표 수립 + 자기 점검', icon: PenSquare },
  { key: 'self_done',     label: '리더 평가',           description: '팀장·리더 검토 단계',       icon: Users },
  { key: 'leader_done',   label: '임원 평가',           description: '이사·본부장 검토 단계',     icon: Users },
  { key: 'director_done', label: '대표 평가',           description: '대표이사 최종 검토',        icon: Award },
  { key: 'ceo_done',      label: '완료',                description: '평가 결과 조회 가능',       icon: CheckCircle },
  { key: 'completed',     label: '완료',                description: '평가 결과 조회 가능',       icon: CheckCircle },
]

export default function EvaluationHub() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activePeriod, setActivePeriod] = useState<PeriodRow | null>(null)
  const [myTarget, setMyTarget] = useState<EvaluationTargetRow | null>(null)

  useEffect(() => {
    if (!profile?.id) return
    async function fetchData() {
      setLoading(true)
      const { data: period } = await supabase
        .from('evaluation_periods')
        .select('id, year, quarter, is_active')
        .eq('is_active', true)
        .maybeSingle()
      setActivePeriod(period as PeriodRow | null)

      if (period?.id) {
        const { data: t } = await supabase
          .from('evaluation_targets')
          .select('*')
          .eq('period_id', period.id)
          .eq('employee_id', profile!.id)
          .maybeSingle()
        setMyTarget(t as EvaluationTargetRow | null)
      }
      setLoading(false)
    }
    fetchData()
  }, [profile?.id])

  if (loading) return <PageSpinner />

  const currentIdx = myTarget ? STATUS_ORDER.indexOf(myTarget.status) : -1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">정규직 평가</h1>
        <p className="text-sm text-gray-500 mt-1">
          {activePeriod
            ? `${activePeriod.year}년 ${activePeriod.quarter}분기 진행 중`
            : '현재 진행 중인 평가 기간이 없습니다'}
        </p>
      </div>

      {/* 진행 단계 스텝퍼 */}
      {myTarget && (
        <Card>
          <CardContent className="py-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">내 평가 진행 상황</p>
            <div className="flex items-center justify-between gap-1 overflow-x-auto">
              {STEP_LABELS.slice(0, 5).map((s, i) => {
                const isCurrent = currentIdx === i
                const completed = currentIdx > i
                return (
                  <div key={s.key} className="flex items-center gap-1 flex-1 min-w-0">
                    <div className={`flex flex-col items-center text-center gap-1 ${i === 0 ? '' : 'flex-1'}`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        completed ? 'bg-emerald-500 text-white' :
                        isCurrent ? 'bg-brand-500 text-white ring-4 ring-brand-100' :
                        'bg-gray-100 text-gray-400'
                      }`}>
                        {completed ? <CheckCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                      </div>
                      <div className="text-center">
                        <p className={`text-[11px] font-semibold ${isCurrent ? 'text-brand-700' : completed ? 'text-emerald-700' : 'text-gray-500'}`}>
                          {s.label}
                        </p>
                        <p className="text-[9px] text-gray-400 line-clamp-1">{s.description}</p>
                      </div>
                    </div>
                    {i < 4 && (
                      <div className={`h-0.5 flex-1 ${completed ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 하위 메뉴 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <NavCard
          icon={<CalendarCheck className="h-5 w-5" />}
          title="월간 업무 점검"
          description="월별 목표·이슈·성과를 기록하고 리더/임원 코멘트를 받습니다."
          href="/monthly-checkin"
          accent="blue"
          onClick={() => navigate('/monthly-checkin')}
        />
        <NavCard
          icon={<PenSquare className="h-5 w-5" />}
          title="자기평가"
          description="분기 자기평가 작성 + 목표 달성 점검."
          href="/self-evaluation"
          accent="violet"
          onClick={() => navigate('/self-evaluation')}
          hideForRoles={['director', 'division_head', 'ceo', 'admin']}
          profileRole={profile?.role}
        />
        <NavCard
          icon={<ClipboardList className="h-5 w-5" />}
          title="평가하기"
          description="본부·부서 소속 직원의 평가 대기 리스트."
          href="/evaluate"
          accent="amber"
          onClick={() => navigate('/evaluate')}
          showForRoles={['leader', 'director', 'division_head', 'ceo']}
          profileRole={profile?.role}
        />
        <NavCard
          icon={<FileText className="h-5 w-5" />}
          title="내 평가 결과"
          description="완료된 평가 결과 · 이력 조회 · PDF 다운로드."
          href="/my-evaluations"
          accent="emerald"
          onClick={() => navigate('/my-evaluations')}
        />
        <NavCard
          icon={<TrendingUp className="h-5 w-5" />}
          title="동료 평가"
          description="팀원 10항목 100점 척도 동료평가."
          href="/peer-review"
          accent="rose"
          onClick={() => navigate('/peer-review')}
        />
      </div>

      {/* 수습 평가 안내 */}
      <Card className="bg-amber-50/60 border-amber-200">
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-3">
            <Badge variant="warning" className="shrink-0 mt-0.5">수습</Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">수습 평가는 별도 관리</p>
              <p className="text-xs text-amber-700 mt-0.5">
                수습 3개월 기간 동안의 평가는 <strong>OJT / 수습 평가</strong> 메뉴에서 별도로 진행됩니다.
                정규직 전환 후에는 이 페이지의 단계를 따릅니다.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/probation')} className="shrink-0">
              수습 평가 <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function NavCard({
  icon, title, description, accent, onClick,
  showForRoles, hideForRoles, profileRole,
}: {
  icon: React.ReactNode
  title: string
  description: string
  href: string
  accent: 'blue' | 'violet' | 'amber' | 'emerald' | 'rose'
  onClick: () => void
  showForRoles?: string[]
  hideForRoles?: string[]
  profileRole?: string | null
}) {
  if (showForRoles && !showForRoles.includes(profileRole || '')) return null
  if (hideForRoles && hideForRoles.includes(profileRole || '')) return null
  const accentCls: Record<string, string> = {
    blue: 'from-blue-50 to-sky-50 border-blue-200 text-blue-700',
    violet: 'from-violet-50 to-purple-50 border-violet-200 text-violet-700',
    amber: 'from-amber-50 to-orange-50 border-amber-200 text-amber-700',
    emerald: 'from-emerald-50 to-teal-50 border-emerald-200 text-emerald-700',
    rose: 'from-rose-50 to-pink-50 border-rose-200 text-rose-700',
  }
  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all bg-gradient-to-br border ${accentCls[accent]}`}
      onClick={onClick}
    >
      <CardContent className="py-4 px-4 flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg bg-white/60 flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900">{title}</p>
          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{description}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-gray-400 mt-1 shrink-0" />
      </CardContent>
    </Card>
  )
}
