import { useMemo } from 'react'
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import type { ItemScoreComparison } from '@/hooks/useDashboard'
import type { EvaluationSummaryRow } from '@/hooks/useDashboard'

interface ItemRadarChartProps {
  data: ItemScoreComparison[]
  summaryRows?: EvaluationSummaryRow[]
  selectedDepartment?: string | null
  departments?: string[]
}

const DEPT_COLORS = [
  '#6B3FA0', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4',
]
const COMPANY_COLOR = '#9ca3af'

function calcAvgScore(row: ItemScoreComparison): number {
  const scores = [row.self_score, row.leader_score, row.director_score, row.ceo_score].filter(
    (s): s is number => s != null
  )
  return scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0
}

export function ItemRadarChart({ data, summaryRows, selectedDepartment, departments }: ItemRadarChartProps) {
  const useDeptMode = !!summaryRows && !!departments && departments.length > 0

  // Build department-average radar data
  const { radarData, seriesKeys } = useMemo(() => {
    if (!useDeptMode || data.length === 0) {
      return { radarData: [], seriesKeys: [] }
    }

    const itemNames = [...new Set(data.map((d) => d.item_name))]

    // Build employee→department mapping
    const empDeptMap = new Map<string, string>()
    summaryRows!.forEach((r) => {
      if (r.department_name) empDeptMap.set(r.employee_name, r.department_name)
    })

    // Company average per item
    const companyAvg = new Map<string, number>()
    itemNames.forEach((itemName) => {
      const itemRows = data.filter((d) => d.item_name === itemName)
      const scores = itemRows.map(calcAvgScore).filter((s) => s > 0)
      companyAvg.set(itemName, scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0)
    })

    if (selectedDepartment) {
      // Selected department vs company average
      const rd = itemNames.map((itemName) => {
        const itemRows = data.filter((d) => d.item_name === itemName && empDeptMap.get(d.employee_name) === selectedDepartment)
        const scores = itemRows.map(calcAvgScore).filter((s) => s > 0)
        const deptAvg = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0
        return {
          item: itemName,
          [selectedDepartment]: deptAvg,
          '전사 평균': companyAvg.get(itemName) ?? 0,
        }
      })
      return { radarData: rd, seriesKeys: [selectedDepartment, '전사 평균'] }
    }

    // All departments (limit to top 5 by employee count for readability)
    const deptsSorted = [...departments!]
      .map((d) => ({ name: d, count: summaryRows!.filter((r) => r.department_name === d).length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const keys = [...deptsSorted.map((d) => d.name), '전사 평균']
    const rd = itemNames.map((itemName) => {
      const point: Record<string, string | number> = { item: itemName, '전사 평균': companyAvg.get(itemName) ?? 0 }
      deptsSorted.forEach((dept) => {
        const itemRows = data.filter((d) => d.item_name === itemName && empDeptMap.get(d.employee_name) === dept.name)
        const scores = itemRows.map(calcAvgScore).filter((s) => s > 0)
        point[dept.name] = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0
      })
      return point
    })

    return { radarData: rd, seriesKeys: keys }
  }, [data, useDeptMode, summaryRows, selectedDepartment, departments])

  // Fallback: legacy per-employee mode
  const legacyData = useMemo(() => {
    if (useDeptMode && radarData.length > 0) return null
    if (data.length === 0) return null

    const itemNames = [...new Set(data.map((d) => d.item_name))]
    const employees = [...new Set(data.map((d) => d.employee_name))]

    return {
      radarData: itemNames.map((itemName) => {
        const point: Record<string, string | number> = { item: itemName }
        employees.forEach((emp) => {
          const row = data.find((d) => d.item_name === itemName && d.employee_name === emp)
          point[emp] = row ? calcAvgScore(row) : 0
        })
        return point
      }),
      employees,
    }
  }, [data, useDeptMode, radarData])

  // No data
  if (data.length === 0 || (radarData.length === 0 && !legacyData)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>항목별 레이더 차트</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center text-sm text-gray-400">
            아직 평가 데이터가 없습니다
          </div>
        </CardContent>
      </Card>
    )
  }

  // Department mode
  if (radarData.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            항목별 레이더 차트
            {selectedDepartment && <span className="ml-2 text-sm font-normal text-gray-400">vs 전사 평균</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="item" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 10]} tick={{ fill: '#9ca3af', fontSize: 10 }} tickCount={6} />
                  <Tooltip formatter={(value) => [`${value}점`]} />
                  {seriesKeys.map((key, idx) => (
                    <Radar
                      key={key}
                      name={key}
                      dataKey={key}
                      stroke={key === '전사 평균' ? COMPANY_COLOR : DEPT_COLORS[idx % DEPT_COLORS.length]}
                      fill={key === '전사 평균' ? COMPANY_COLOR : DEPT_COLORS[idx % DEPT_COLORS.length]}
                      fillOpacity={key === '전사 평균' ? 0.05 : 0.1}
                      strokeWidth={key === '전사 평균' ? 1.5 : 2}
                      strokeDasharray={key === '전사 평균' ? '4 4' : undefined}
                    />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Legacy per-employee mode
  const { radarData: lrd, employees } = legacyData!
  const EMPLOYEE_COLORS = [
    '#6B3FA0', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>항목별 레이더 차트</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[500px]">
            <ResponsiveContainer width="100%" height={400}>
              <RadarChart data={lrd} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="item" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 10]} tick={{ fill: '#9ca3af', fontSize: 10 }} tickCount={6} />
                <Tooltip formatter={(value) => [`${value}점`]} />
                {employees.map((emp, idx) => (
                  <Radar
                    key={emp}
                    name={emp}
                    dataKey={emp}
                    stroke={EMPLOYEE_COLORS[idx % EMPLOYEE_COLORS.length]}
                    fill={EMPLOYEE_COLORS[idx % EMPLOYEE_COLORS.length]}
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
