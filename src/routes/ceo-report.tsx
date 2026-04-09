import { useState, useEffect } from 'react'
import {
  Users, Briefcase, TrendingUp, AlertCircle, Clock,
  Mic, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface ReportData {
  totalEmployees: number
  probationEmployees: { id: string; name: string; position: string | null; hire_date: string | null }[]
  activePostings: number
  candidateCount: number
  projectStats: Record<string, number>
  recentMeetings: { title: string; status: string; duration_min: number | null; date: string }[]
  probationEvals: any[]
}

const SIGNAL_CONFIG = {
  green: { label: '우수', color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  yellow: { label: '보통', color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  red: { label: '주의', color: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
  black: { label: '위험', color: 'bg-gray-800', text: 'text-gray-700', bg: 'bg-gray-100' },
}

export default function CEOReport() {
  const { hasRole } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ReportData | null>(null)
  const [signals, setSignals] = useState<any[]>([])
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview', 'probation', 'recruitment']))

  // CEO 또는 admin만 접근
  const canAccess = hasRole('ceo') || hasRole('admin')

  useEffect(() => {
    if (canAccess) fetchReport()
  }, [canAccess])

  async function fetchReport() {
    setLoading(true)
    try {
      const [empRes, probRes, postRes, candRes, projRes, meetRes] = await Promise.all([
        supabase.from('employees').select('id, name, role, position, department_id, employment_type, hire_date').eq('is_active', true),
        supabase.from('probation_evaluations').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('job_postings').select('id, title, status').eq('status', 'published'),
        supabase.from('candidates').select('id, status').order('created_at', { ascending: false }).limit(100),
        supabase.from('projects').select('id, name, status, priority').order('updated_at', { ascending: false }).limit(20),
        supabase.from('meeting_records').select('id, title, status, duration_seconds, created_at').order('created_at', { ascending: false }).limit(5),
      ])

      const employees = empRes.data || []
      const probationEmps = employees.filter((e) => e.employment_type === 'probation' || (e.position ?? '').includes('수습'))

      const projectStats: Record<string, number> = {}
      for (const p of (projRes.data || [])) {
        projectStats[p.status] = (projectStats[p.status] || 0) + 1
      }

      setData({
        totalEmployees: employees.length,
        probationEmployees: probationEmps,
        activePostings: postRes.data?.length || 0,
        candidateCount: candRes.data?.length || 0,
        projectStats,
        recentMeetings: (meetRes.data || []).map((m: any) => ({
          title: m.title,
          status: m.status,
          duration_min: m.duration_seconds ? Math.round(m.duration_seconds / 60) : null,
          date: m.created_at,
        })),
        probationEvals: probRes.data || [],
      })

      // 신호등 간이 계산
      const sigs = employees.map((emp) => {
        const evals = (probRes.data || []).filter((e: any) => e.employee_id === emp.id)
        const scores = evals.map((e: any) => {
          const s = e.scores || {}
          return Object.values(s).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
        })
        const avg = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null

        let signal: keyof typeof SIGNAL_CONFIG = 'yellow'
        if (avg !== null) {
          if (avg >= 80) signal = 'green'
          else if (avg >= 60) signal = 'yellow'
          else if (avg >= 40) signal = 'red'
          else signal = 'black'
        }

        return { ...emp, signal, avgScore: avg ? Math.round(avg) : null, evalCount: evals.length }
      })
      setSignals(sigs)
    } catch (err) {
      console.error('CEO Report fetch error:', err)
    }
    setLoading(false)
  }

  function toggleSection(id: string) {
    setExpandedSections((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <p className="text-gray-500">CEO 또는 관리자만 접근할 수 있습니다.</p>
        </div>
      </div>
    )
  }

  if (loading) return <PageSpinner />

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const signalCounts = {
    green: signals.filter((s) => s.signal === 'green').length,
    yellow: signals.filter((s) => s.signal === 'yellow').length,
    red: signals.filter((s) => s.signal === 'red').length,
    black: signals.filter((s) => s.signal === 'black').length,
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CEO 리포트</h1>
          <p className="text-sm text-gray-500 mt-1">{today}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchReport}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> 새로고침
        </Button>
      </div>

      {/* 핵심 지표 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-[11px] text-gray-500">전체 직원</p>
                <p className="text-2xl font-bold text-gray-900">{data?.totalEmployees}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] text-gray-500">수습 직원</p>
                <p className="text-2xl font-bold text-amber-600">{data?.probationEmployees.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-[11px] text-gray-500">채용 공고</p>
                <p className="text-2xl font-bold text-blue-600">{data?.activePostings}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] text-gray-500">지원자</p>
                <p className="text-2xl font-bold text-emerald-600">{data?.candidateCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 직원 신호등 */}
      <Card>
        <CardHeader>
          <button className="flex items-center justify-between w-full" onClick={() => toggleSection('signal')}>
            <CardTitle className="text-base">직원 신호등</CardTitle>
            {expandedSections.has('signal') ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
        </CardHeader>
        {expandedSections.has('signal') && (
          <CardContent>
            {/* 신호등 요약 */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {(Object.entries(SIGNAL_CONFIG) as [keyof typeof SIGNAL_CONFIG, typeof SIGNAL_CONFIG[keyof typeof SIGNAL_CONFIG]][]).map(([key, cfg]) => (
                <div key={key} className={`${cfg.bg} rounded-lg p-3 text-center`}>
                  <div className={`w-4 h-4 rounded-full ${cfg.color} mx-auto mb-1`} />
                  <p className={`text-lg font-bold ${cfg.text}`}>{signalCounts[key]}</p>
                  <p className="text-[10px] text-gray-500">{cfg.label}</p>
                </div>
              ))}
            </div>

            {/* 직원 목록 */}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {signals
                .sort((a, b) => {
                  const order = { black: 0, red: 1, yellow: 2, green: 3 }
                  return (order[a.signal as keyof typeof order] ?? 2) - (order[b.signal as keyof typeof order] ?? 2)
                })
                .map((emp) => {
                  const cfg = SIGNAL_CONFIG[emp.signal as keyof typeof SIGNAL_CONFIG]
                  return (
                    <div key={emp.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${cfg.color}`} />
                        <span className="text-sm font-medium text-gray-800">{emp.name}</span>
                        <span className="text-xs text-gray-400">{emp.position || emp.role}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {emp.avgScore !== null && (
                          <span className="text-xs text-gray-500">{emp.avgScore}점</span>
                        )}
                        <span className="text-[10px] text-gray-400">{emp.evalCount}건</span>
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 수습 직원 현황 */}
      {data && data.probationEmployees.length > 0 && (
        <Card>
          <CardHeader>
            <button className="flex items-center justify-between w-full" onClick={() => toggleSection('probation')}>
              <CardTitle className="text-base">수습 직원 현황</CardTitle>
              {expandedSections.has('probation') ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
          </CardHeader>
          {expandedSections.has('probation') && (
            <CardContent>
              <div className="space-y-2">
                {data.probationEmployees.map((emp) => {
                  const hireDate = emp.hire_date ? new Date(emp.hire_date) : null
                  const endDate = hireDate ? new Date(hireDate.getTime() + 90 * 24 * 60 * 60 * 1000) : null
                  const daysLeft = endDate ? Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
                  const evals = data.probationEvals.filter((e) => e.employee_id === emp.id)

                  return (
                    <div key={emp.id} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{emp.name}</p>
                        <p className="text-[11px] text-gray-500">
                          {hireDate?.toLocaleDateString('ko-KR')} 입사
                          {daysLeft !== null && ` · 수습 종료까지 ${daysLeft > 0 ? `${daysLeft}일` : '만료'}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={evals.length >= 3 ? 'success' : evals.length > 0 ? 'warning' : 'default'}>
                          {evals.length}회 평가
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* 최근 회의록 */}
      {data && data.recentMeetings.length > 0 && (
        <Card>
          <CardHeader>
            <button className="flex items-center justify-between w-full" onClick={() => toggleSection('meetings')}>
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-gray-400" />
                <CardTitle className="text-base">최근 회의</CardTitle>
              </div>
              {expandedSections.has('meetings') ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
          </CardHeader>
          {expandedSections.has('meetings') && (
            <CardContent>
              <div className="space-y-2">
                {data.recentMeetings.map((m, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{m.title}</p>
                      <p className="text-[11px] text-gray-500">
                        {new Date(m.date).toLocaleDateString('ko-KR')}
                        {m.duration_min && ` · ${m.duration_min}분`}
                      </p>
                    </div>
                    <Badge variant={m.status === 'completed' ? 'success' : m.status === 'error' ? 'danger' : 'default'}>
                      {m.status === 'completed' ? '완료' : m.status === 'error' ? '오류' : m.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}
