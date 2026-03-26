import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertTriangle, Search, Hash, User, Calendar as CalIcon, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useImportedData, type ImportSource } from '@/hooks/useImportedData'
import type { Employee } from '@/types/database'
import type { WorkMetrics } from '@/types/employee-lifecycle'

// ─── Tab: 외부 연동 데이터 뷰어 ──────────────────────────────────

const SOURCE_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'slack', label: 'Slack' },
  { value: 'notion', label: 'Notion' },
  { value: 'naver_works', label: 'Naver Works' },
]

const SOURCE_COLORS: Record<string, string> = {
  slack: 'bg-purple-100 text-purple-700',
  notion: 'bg-gray-100 text-gray-700',
  naver_works: 'bg-green-100 text-green-700',
}

function ImportedDataViewer() {
  const {
    records, loading, source, setSource, search, setSearch,
    channel, setChannel, employee, setEmployee,
    dateRange, setDateRange, stats,
  } = useImportedData()

  const formatDate = (d: string | null) => {
    if (!d) return '-'
    return new Date(d).toLocaleDateString('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">전체 데이터</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-purple-600">{stats.bySource['slack'] || 0}</p>
            <p className="text-xs text-gray-500">Slack</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-gray-600">{stats.bySource['notion'] || 0}</p>
            <p className="text-xs text-gray-500">Notion</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.byChannel.length}</p>
            <p className="text-xs text-gray-500">활성 채널</p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap gap-2">
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as ImportSource | 'all')}
              options={SOURCE_OPTIONS}
            />
            <div className="relative flex-1 min-w-[150px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="내용 검색..."
                className="pl-8"
              />
            </div>
            <Input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="#채널"
              className="w-32"
            />
            <Input
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              placeholder="직원명"
              className="w-28"
            />
            <Input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange(p => ({ ...p, from: e.target.value }))}
              className="w-36"
            />
            <Input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange(p => ({ ...p, to: e.target.value }))}
              className="w-36"
            />
          </div>
        </CardContent>
      </Card>

      {/* 주요 채널 / 직원 */}
      {(stats.byChannel.length > 0 || stats.byEmployee.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {stats.byChannel.length > 0 && (
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">채널별 메시지</CardTitle></CardHeader>
              <CardContent className="py-2 space-y-1">
                {stats.byChannel.slice(0, 5).map(ch => (
                  <div key={ch.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1 text-gray-700"><Hash className="h-3.5 w-3.5 text-gray-400" />{ch.name}</span>
                    <span className="text-gray-500">{ch.count}건</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {stats.byEmployee.length > 0 && (
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">직원별 활동</CardTitle></CardHeader>
              <CardContent className="py-2 space-y-1">
                {stats.byEmployee.slice(0, 5).map(emp => (
                  <div key={emp.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1 text-gray-700"><User className="h-3.5 w-3.5 text-gray-400" />{emp.name}</span>
                    <span className="text-gray-500">{emp.count}건</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 데이터 목록 */}
      <Card>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">가져온 데이터가 없습니다</p>
              <p className="text-xs mt-1">일반 설정 &gt; 외부 연동에서 데이터를 가져오세요</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {records.map(r => (
                <div key={r.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={cn('text-[10px]', SOURCE_COLORS[r.source] || 'bg-gray-100 text-gray-600')}>
                      {r.source}
                    </Badge>
                    {r.metadata?.channel_name && (
                      <span className="text-xs text-gray-400 flex items-center gap-0.5">
                        <Hash className="h-3 w-3" />{r.metadata.channel_name}
                      </span>
                    )}
                    {r.employee_name && (
                      <span className="text-xs font-medium text-gray-600">{r.employee_name}</span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto flex items-center gap-0.5">
                      <CalIcon className="h-3 w-3" />{formatDate(r.original_date)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2">{r.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────

export default function DataSync() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<'metrics' | 'imported'>('metrics')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [metrics, setMetrics] = useState<(WorkMetrics & { employee_name?: string })[]>([])
  const [selfEvals, setSelfEvals] = useState<{ employee_id: string; avg_score: number }[]>([])

  // Filters
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [quarter, setQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3).toString())

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [empRes, metRes] = await Promise.all([
      supabase.from('employees').select('*').eq('is_active', true),
      supabase.from('work_metrics').select('*')
        .eq('period_year', parseInt(year))
        .eq('period_quarter', parseInt(quarter))
        .order('employee_id'),
    ])

    const emps = (empRes.data || []) as Employee[]
    setEmployees(emps)

    if (metRes.data) {
      const enriched = (metRes.data as WorkMetrics[]).map((m) => ({
        ...m,
        employee_name: emps.find((e) => e.id === m.employee_id)?.name || '알 수 없음',
      }))
      setMetrics(enriched)
    }

    // Fetch self evaluation avg scores per employee
    const { data: evalData } = await supabase
      .from('evaluation_targets')
      .select('employee_id, final_score')
      .not('final_score', 'is', null)

    if (evalData) {
      const grouped: Record<string, number[]> = {}
      for (const e of evalData as { employee_id: string; final_score: number }[]) {
        if (!grouped[e.employee_id]) grouped[e.employee_id] = []
        grouped[e.employee_id].push(e.final_score)
      }
      const avgs = Object.entries(grouped).map(([id, scores]) => ({
        employee_id: id,
        avg_score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      }))
      setSelfEvals(avgs)
    }

    setLoading(false)
  }, [year, quarter])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSync() {
    setSyncing(true)
    const yr = parseInt(year)
    const qtr = parseInt(quarter)

    try {
      // For each active employee, aggregate their task data
      for (const emp of employees) {
        const { data: taskData } = await supabase
          .from('tasks')
          .select('*')
          .eq('assignee_id', emp.id)

        if (!taskData) continue

        const totalTasks = taskData.length
        const completedTasks = taskData.filter((t: any) => t.status === 'done').length
        const overdueTasks = taskData.filter(
          (t: any) => t.status !== 'done' && t.status !== 'cancelled' && t.due_date && t.due_date < new Date().toISOString().slice(0, 10)
        ).length
        const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

        // Deadline compliance: tasks completed on or before due date
        const tasksWithDueDate = taskData.filter((t: any) => t.due_date && t.status === 'done')
        const onTime = tasksWithDueDate.filter((t: any) => {
          const completed = t.updated_at?.slice(0, 10) || ''
          return completed <= t.due_date
        }).length
        const deadlineCompliance = tasksWithDueDate.length > 0
          ? Math.round((onTime / tasksWithDueDate.length) * 100) : null

        // Daily satisfaction average
        const { data: reports } = await supabase
          .from('daily_reports')
          .select('satisfaction_score')
          .eq('employee_id', emp.id)
          .not('satisfaction_score', 'is', null)

        const scores = (reports || []).map((r: any) => r.satisfaction_score as number)
        const avgSatisfaction = scores.length > 0
          ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
          : null

        // Upsert work_metrics
        const existing = metrics.find(
          (m) => m.employee_id === emp.id && m.period_year === yr && m.period_quarter === qtr
        )

        const payload = {
          employee_id: emp.id,
          period_year: yr,
          period_quarter: qtr,
          task_completion_rate: taskCompletionRate,
          deadline_compliance: deadlineCompliance,
          avg_daily_satisfaction: avgSatisfaction,
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          overdue_tasks: overdueTasks,
          details: {},
          synced_at: new Date().toISOString(),
        }

        if (existing) {
          await supabase.from('work_metrics').update(payload).eq('id', existing.id)
        } else {
          await supabase.from('work_metrics').insert(payload)
        }
      }

      toast('동기화가 완료되었습니다.', 'success')
      fetchData()
    } catch (err: any) {
      toast('동기화 실패: ' + err.message, 'error')
    }
    setSyncing(false)
  }

  if (loading && activeTab === 'metrics') return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">데이터 동기화</h1>
        {activeTab === 'metrics' && (
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
            동기화
          </Button>
        )}
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1">
          <button
            onClick={() => setActiveTab('metrics')}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'metrics'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            )}
          >
            업무 메트릭
          </button>
          <button
            onClick={() => setActiveTab('imported')}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'imported'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            )}
          >
            외부 연동 데이터
          </button>
        </nav>
      </div>

      {activeTab === 'imported' && <ImportedDataViewer />}

      {activeTab === 'metrics' && (<>
      {/* 기존 메트릭 영역 시작 */}

      {/* Period filter */}
      <Card>
        <CardContent className="py-3">
          <div className="flex gap-3 items-end">
            <Select
              label="연도"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              options={[2024, 2025, 2026].map((y) => ({ value: y.toString(), label: `${y}년` }))}
            />
            <Select
              label="분기"
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              options={[1, 2, 3, 4].map((q) => ({ value: q.toString(), label: `${q}분기` }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Metrics table */}
      <Card>
        <CardHeader>
          <CardTitle>업무 메트릭 ({year}년 {quarter}분기)</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">동기화된 데이터가 없습니다. 동기화 버튼을 눌러주세요.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-4">직원</th>
                    <th className="py-2 pr-4">전체 작업</th>
                    <th className="py-2 pr-4">완료</th>
                    <th className="py-2 pr-4">완료율</th>
                    <th className="py-2 pr-4">마감 준수</th>
                    <th className="py-2 pr-4">지연</th>
                    <th className="py-2 pr-4">평균 만족도</th>
                    <th className="py-2 pr-4">평가 점수</th>
                    <th className="py-2">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => {
                    const selfEval = selfEvals.find((s) => s.employee_id === m.employee_id)
                    const evalScore = selfEval?.avg_score ?? null
                    const completionRate = m.task_completion_rate ?? 0
                    const gap = evalScore !== null ? Math.abs(completionRate - evalScore) : null
                    const bigDiscrepancy = gap !== null && gap > 20

                    return (
                      <tr key={m.id} className={`border-b ${bigDiscrepancy ? 'bg-amber-50' : ''}`}>
                        <td className="py-2 pr-4 font-medium">{m.employee_name}</td>
                        <td className="py-2 pr-4">{m.total_tasks}</td>
                        <td className="py-2 pr-4">{m.completed_tasks}</td>
                        <td className="py-2 pr-4">{completionRate}%</td>
                        <td className="py-2 pr-4">{m.deadline_compliance !== null ? `${m.deadline_compliance}%` : '-'}</td>
                        <td className="py-2 pr-4">
                          {m.overdue_tasks > 0 ? (
                            <Badge variant="danger">{m.overdue_tasks}</Badge>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">{m.avg_daily_satisfaction ?? '-'}</td>
                        <td className="py-2 pr-4">{evalScore ?? '-'}</td>
                        <td className="py-2">
                          {bigDiscrepancy ? (
                            <Badge variant="warning" className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> {gap}%p
                            </Badge>
                          ) : gap !== null ? (
                            <span className="text-gray-500">{gap}%p</span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discrepancy explanation */}
      {metrics.some((m) => {
        const se = selfEvals.find((s) => s.employee_id === m.employee_id)
        return se && Math.abs((m.task_completion_rate ?? 0) - se.avg_score) > 20
      }) && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">큰 차이 감지</p>
                <p className="text-xs text-amber-600 mt-1">
                  노란색으로 강조된 직원은 업무 완료율과 평가 점수 간 차이가 20%p를 초과합니다.
                  자기평가의 객관성을 재검토하거나 업무 배분을 확인해 주세요.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </>)}
    </div>
  )
}
