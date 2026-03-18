import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReminderPenalty } from '@/types/urgent-tasks'
import type { Employee } from '@/types/database'

interface PenaltyWithEmployee extends ReminderPenalty {
  employee_name: string
  employee_role: string
}

export default function PenaltiesDashboard() {
  const { toast } = useToast()
  const [penalties, setPenalties] = useState<PenaltyWithEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)

    const [penRes, empRes] = await Promise.all([
      supabase.from('reminder_penalties').select('*').order('penalty_score', { ascending: true }),
      supabase.from('employees').select('id, name, role').eq('is_active', true),
    ])

    const emps = (empRes.data || []) as Employee[]

    if (penRes.data) {
      const mapped = penRes.data.map((p: ReminderPenalty) => {
        const emp = emps.find((e) => e.id === p.employee_id)
        return {
          ...p,
          employee_name: emp?.name ?? '알 수 없음',
          employee_role: emp?.role ?? '',
        }
      })
      setPenalties(mapped)
    }

    setLoading(false)
  }

  // 감점 재계산 (현재 분기 기준)
  async function recalculatePenalties() {
    setRecalculating(true)
    try {
      const now = new Date()
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
      const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0)

      const { data: tasks } = await supabase
        .from('urgent_tasks')
        .select('id, assigned_to, status, reminder_count, deadline, completed_at')
        .gte('created_at', quarterStart.toISOString())
        .lte('created_at', quarterEnd.toISOString())

      if (!tasks) { setRecalculating(false); return }

      // 직원별 집계
      const empStats: Record<string, {
        assigned: number
        onTime: number
        overdue: number
        reminders: number
      }> = {}

      for (const task of tasks) {
        const assignees = task.assigned_to || []
        for (const empId of assignees) {
          if (!empStats[empId]) {
            empStats[empId] = { assigned: 0, onTime: 0, overdue: 0, reminders: 0 }
          }
          empStats[empId].assigned++
          empStats[empId].reminders += task.reminder_count || 0

          if (task.status === 'completed') {
            const completedAt = new Date(task.completed_at)
            const deadline = new Date(task.deadline)
            if (completedAt <= deadline) {
              empStats[empId].onTime++
            } else {
              empStats[empId].overdue++
            }
          } else if (task.status === 'overdue') {
            empStats[empId].overdue++
          }
        }
      }

      // 감점 계산 및 upsert
      for (const [empId, s] of Object.entries(empStats)) {
        // 기한 초과 1건당 -2점, 리마인드 5회+ 업무 1건당 -1점, 기한내 완료 보너스 +0.5점 (최대 +5)
        let penalty = 0
        penalty -= s.overdue * 2

        // 리마인드 5회 이상 받은 업무 카운트
        const highReminderTasks = tasks.filter(
          (t) => t.assigned_to?.includes(empId) && (t.reminder_count || 0) >= 5
        ).length
        penalty -= highReminderTasks

        // 기한 내 완료 보너스
        penalty += Math.min(s.onTime * 0.5, 5)

        await supabase.from('reminder_penalties').upsert({
          employee_id: empId,
          period_start: quarterStart.toISOString().split('T')[0],
          period_end: quarterEnd.toISOString().split('T')[0],
          total_urgent_assigned: s.assigned,
          total_completed_on_time: s.onTime,
          total_overdue: s.overdue,
          total_reminders_received: s.reminders,
          penalty_score: Math.round(penalty * 10) / 10,
        }, { onConflict: 'employee_id,period_start' })
      }

      toast('감점이 재계산되었습니다')
      await fetchData()
    } catch {
      toast('재계산 중 오류가 발생했습니다', 'error')
    }
    setRecalculating(false)
  }

  if (loading) return <PageSpinner />

  // 통계 요약
  const totalPenalized = penalties.filter((p) => p.penalty_score < 0).length
  const totalBonus = penalties.filter((p) => p.penalty_score > 0).length
  const avgPenalty = penalties.length > 0
    ? Math.round((penalties.reduce((s, p) => s + p.penalty_score, 0) / penalties.length) * 10) / 10
    : 0

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-7 w-7 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">리마인드 감점 현황</h1>
            <p className="text-sm text-gray-500">긴급 업무 리마인드 경고 → 인사평가 감점 연동</p>
          </div>
        </div>
        <Button onClick={recalculatePenalties} disabled={recalculating} variant="outline">
          <RefreshCw className={cn('h-4 w-4', recalculating && 'animate-spin')} />
          {recalculating ? '계산 중...' : '재계산'}
        </Button>
      </div>

      {/* 감점 기준 안내 */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-3">
          <div className="text-sm text-amber-800 space-y-1">
            <p className="font-semibold">감점 계산 기준:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>기한 초과 1건당: <strong>-2점</strong></li>
              <li>리마인드 5회 이상 받은 업무 1건당: <strong>-1점</strong></li>
              <li>기한 내 완료 보너스: <strong>+0.5점/건</strong> (최대 +5점)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <TrendingDown className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-xs text-gray-500">감점 대상</p>
              <p className="text-xl font-bold text-red-600">{totalPenalized}명</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-xs text-gray-500">보너스 대상</p>
              <p className="text-xl font-bold text-emerald-600">{totalBonus}명</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <Minus className="h-5 w-5 text-gray-500" />
            <div>
              <p className="text-xs text-gray-500">평균 점수</p>
              <p className={cn('text-xl font-bold', avgPenalty < 0 ? 'text-red-600' : 'text-emerald-600')}>
                {avgPenalty > 0 ? '+' : ''}{avgPenalty}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 직원별 감점 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>직원별 감점 현황</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {penalties.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <p>감점 데이터가 없습니다. "재계산" 버튼을 클릭하세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">직원</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">할당</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">기한내 완료</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">기한 초과</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">리마인드</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">감점</th>
                  </tr>
                </thead>
                <tbody>
                  {penalties.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-gray-900">{p.employee_name}</span>
                          <span className="ml-2 text-xs text-gray-400">{p.employee_role}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">{p.total_urgent_assigned}</td>
                      <td className="px-4 py-3 text-center text-emerald-600">{p.total_completed_on_time}</td>
                      <td className="px-4 py-3 text-center text-red-600">{p.total_overdue}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          p.total_reminders_received >= 5 ? 'text-red-600 font-medium' : 'text-gray-600'
                        )}>
                          {p.total_reminders_received}회
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={p.penalty_score < 0 ? 'danger' : p.penalty_score > 0 ? 'success' : 'default'}>
                          {p.penalty_score > 0 ? '+' : ''}{p.penalty_score}점
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
