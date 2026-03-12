import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import type { DepartmentStats } from '@/hooks/useDepartmentFilter'

interface DepartmentScoreRankingProps {
  departmentStats: Map<string, DepartmentStats>
  selectedDepartment: string | null
}

export function DepartmentScoreRanking({ departmentStats, selectedDepartment }: DepartmentScoreRankingProps) {
  const chartData = useMemo(() => {
    return [...departmentStats.values()]
      .filter((s) => s.avgScore != null)
      .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
      .map((s) => ({
        name: s.name,
        score: s.avgScore,
        count: s.count,
      }))
  }, [departmentStats])

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>부서별 점수 랭킹</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center text-sm text-gray-400">
            아직 점수 데이터가 없습니다
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartHeight = Math.max(200, chartData.length * 48 + 40)

  return (
    <Card>
      <CardHeader>
        <CardTitle>부서별 점수 랭킹</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value) => [`${value}점`, '평균 점수']}
              labelFormatter={(label) => {
                const d = chartData.find((c) => c.name === label)
                return `${label} (${d?.count ?? 0}명)`
              }}
            />
            <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={28}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={
                    selectedDepartment == null
                      ? '#6B3FA0'
                      : entry.name === selectedDepartment
                        ? '#a78bdb'
                        : '#d1d5db'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
