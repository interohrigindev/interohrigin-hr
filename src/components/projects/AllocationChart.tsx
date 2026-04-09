/**
 * 프로젝트 업무 할당 원형 차트
 * 담당자별 업무 비율을 시각화
 */
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

const COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#8B5CF6',
]

interface TaskData {
  assignee_id: string | null
  assignee_name: string
  status: string
}

interface AllocationChartProps {
  tasks: TaskData[]
  employees: { id: string; name: string }[]
}

export default function AllocationChart({ tasks, employees }: AllocationChartProps) {
  if (tasks.length === 0) return null

  // 담당자별 업무 수 집계
  const assigneeCounts: Record<string, { name: string; total: number; done: number }> = {}

  for (const task of tasks) {
    const id = task.assignee_id || 'unassigned'
    const name = task.assignee_id
      ? (employees.find((e) => e.id === task.assignee_id)?.name || '알 수 없음')
      : '미배정'

    if (!assigneeCounts[id]) {
      assigneeCounts[id] = { name, total: 0, done: 0 }
    }
    assigneeCounts[id].total++
    if (task.status === 'done') assigneeCounts[id].done++
  }

  const chartData = Object.entries(assigneeCounts)
    .map(([id, { name, total, done }]) => ({
      id,
      name,
      value: total,
      done,
      percent: Math.round((total / tasks.length) * 100),
      completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">업무 할당 현황</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          {/* 원형 차트 */}
          <div className="w-40 h-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={65}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 범례 + 상세 */}
          <div className="flex-1 space-y-1.5">
            {chartData.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <span className="text-sm font-medium text-gray-800 w-16 truncate">{item.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${item.percent}%`,
                      backgroundColor: COLORS[idx % COLORS.length],
                    }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right">{item.percent}%</span>
                <span className="text-[10px] text-gray-400 w-12 text-right">{item.done}/{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 요약 */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs text-gray-500">
          <span>전체 {tasks.length}건</span>
          <span>완료 {tasks.filter((t) => t.status === 'done').length}건</span>
          <span>담당자 {chartData.filter((d) => d.id !== 'unassigned').length}명</span>
        </div>
      </CardContent>
    </Card>
  )
}
