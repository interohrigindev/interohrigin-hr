import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import type { Employee } from '@/types/database'
import type { WorkMetrics } from '@/types/employee-lifecycle'

export default function DataSync() {
  const { toast } = useToast()
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

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">데이터 동기화</h1>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
          동기화
        </Button>
      </div>

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
    </div>
  )
}
