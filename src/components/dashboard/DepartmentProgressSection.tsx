import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import type { EvaluationSummaryRow } from '@/hooks/useDashboard'
import { EVALUATION_STATUS_LABELS } from '@/lib/constants'

interface DepartmentProgressSectionProps {
  rows: EvaluationSummaryRow[]
  selectedDepartment: string | null
  departments: string[]
}

const STATUS_ORDER = ['pending', 'self_done', 'leader_done', 'director_done', 'ceo_done', 'completed'] as const
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-300',
  self_done: 'bg-blue-400',
  leader_done: 'bg-brand-400',
  director_done: 'bg-violet-400',
  ceo_done: 'bg-orange-400',
  completed: 'bg-emerald-500',
}

interface DeptProgress {
  name: string
  total: number
  counts: Record<string, number>
}

export function DepartmentProgressSection({ rows, selectedDepartment, departments }: DepartmentProgressSectionProps) {
  const deptProgress = useMemo(() => {
    const map = new Map<string, DeptProgress>()
    for (const dept of departments) {
      const deptRows = rows.filter((r) => r.department_name === dept)
      const counts: Record<string, number> = {}
      STATUS_ORDER.forEach((s) => { counts[s] = 0 })
      // 누계 카운트:
      //   - 'pending' 은 정확 매칭 (자기평가 안 한 대기 인원)
      //   - 그 외는 해당 단계 이상 도달한 모든 건을 누계
      //     (예: 이사 평가 완료 → 자기/리더/이사 모두 +1)
      deptRows.forEach((r) => {
        const idx = STATUS_ORDER.indexOf(r.status as typeof STATUS_ORDER[number])
        if (idx === -1) return
        STATUS_ORDER.forEach((s, sIdx) => {
          if (s === 'pending') {
            if (r.status === 'pending') counts[s]++
          } else if (sIdx <= idx) {
            counts[s]++
          }
        })
      })
      map.set(dept, { name: dept, total: deptRows.length, counts })
    }
    return map
  }, [rows, departments])

  // Department selected → single progress bar view
  if (selectedDepartment) {
    const dp = deptProgress.get(selectedDepartment)
    if (!dp || dp.total === 0) {
      return (
        <Card>
          <CardHeader><CardTitle>부서 진행현황</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-400">데이터가 없습니다</p></CardContent>
        </Card>
      )
    }

    return (
      <Card>
        <CardHeader><CardTitle>{selectedDepartment} 진행현황</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {STATUS_ORDER.map((status) => {
            const count = dp.counts[status] ?? 0
            const pct = Math.round((count / dp.total) * 100)
            return (
              <div key={status}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-gray-600">{EVALUATION_STATUS_LABELS[status]}</span>
                  <span className="tabular-nums text-gray-500">{count}/{dp.total} ({pct}%)</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all ${STATUS_COLORS[status]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    )
  }

  // All departments → mini cards with stacked bar
  if (departments.length === 0) return null

  return (
    <Card>
      <CardHeader><CardTitle>부서별 진행현황</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => {
            const dp = deptProgress.get(dept)
            if (!dp || dp.total === 0) return null
            const completedCount = dp.counts['completed'] ?? 0
            const completionPct = Math.round((completedCount / dp.total) * 100)

            return (
              <div key={dept} className="rounded-lg border border-gray-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{dept}</span>
                  <span className="text-xs text-gray-500">{dp.total}명</span>
                </div>
                {/* Stacked bar */}
                <div className="flex h-3 w-full overflow-hidden rounded-full">
                  {STATUS_ORDER.map((status) => {
                    const count = dp.counts[status] ?? 0
                    if (count === 0) return null
                    const pct = (count / dp.total) * 100
                    return (
                      <div
                        key={status}
                        className={`${STATUS_COLORS[status]} transition-all`}
                        style={{ width: `${pct}%` }}
                        title={`${EVALUATION_STATUS_LABELS[status]}: ${count}명`}
                      />
                    )
                  })}
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  완료 {completionPct}% ({completedCount}/{dp.total})
                </p>
              </div>
            )
          })}
        </div>
        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-3">
          {STATUS_ORDER.map((status) => (
            <div key={status} className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[status]}`} />
              {EVALUATION_STATUS_LABELS[status]}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
