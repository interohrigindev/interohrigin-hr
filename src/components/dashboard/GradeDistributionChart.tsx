import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import type { EvaluationSummaryRow } from '@/hooks/useDashboard'
import type { GradeDistributionItem } from '@/hooks/useDashboard'

const GRADE_COLORS: Record<string, string> = {
  S: '#9333ea',
  A: '#2563eb',
  B: '#16a34a',
  C: '#ca8a04',
  D: '#dc2626',
}

const GRADES = ['S', 'A', 'B', 'C', 'D']

interface GradeDistributionChartProps {
  data: GradeDistributionItem[]
  rows?: EvaluationSummaryRow[]
  departments?: string[]
  selectedDepartment?: string | null
}

export function GradeDistributionChart({ data, rows, departments, selectedDepartment }: GradeDistributionChartProps) {
  // Department grouped bar mode
  const deptChartData = useMemo(() => {
    if (!rows || !departments || departments.length === 0 || selectedDepartment) return null

    return departments.map((dept) => {
      const deptRows = rows.filter((r) => r.department_name === dept)
      const entry: Record<string, string | number> = { department: dept }
      GRADES.forEach((g) => {
        entry[g] = deptRows.filter((r) => r.grade === g).length
      })
      return entry
    })
  }, [rows, departments, selectedDepartment])

  // Render department-grouped chart
  if (deptChartData && deptChartData.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>부서별 등급 분포</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[300px]">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={deptChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value, name) => [`${value}명`, `${name}등급`]} />
                  <Legend />
                  {GRADES.map((grade) => (
                    <Bar key={grade} dataKey={grade} fill={GRADE_COLORS[grade]} stackId="grade" />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Single bar chart (selected department or fallback)
  return (
    <Card>
      <CardHeader>
        <CardTitle>등급 분포{selectedDepartment ? ` — ${selectedDepartment}` : ''}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.every((d) => d.count === 0) ? (
          <div className="flex h-64 items-center justify-center text-sm text-gray-400">
            아직 평가 데이터가 없습니다
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[300px]">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="grade" />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    formatter={(value) => [`${value}명`, '인원']}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.map((entry) => (
                      <Cell key={entry.grade} fill={GRADE_COLORS[entry.grade] ?? '#6b7280'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
