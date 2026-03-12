import { useState, useMemo } from 'react'
import type { EvaluationSummaryRow } from '@/hooks/useDashboard'

export interface DepartmentStats {
  name: string
  count: number
  avgScore: number | null
  completionRate: number
  gradeDistribution: Record<string, number>
}

export function useDepartmentFilter(summaryRows: EvaluationSummaryRow[]) {
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)

  // Extract unique department names (sorted)
  const departments = useMemo(() => {
    const names = new Set<string>()
    summaryRows.forEach((r) => {
      if (r.department_name) names.add(r.department_name)
    })
    return [...names].sort()
  }, [summaryRows])

  // Department stats
  const departmentStats = useMemo(() => {
    const map = new Map<string, DepartmentStats>()

    for (const dept of departments) {
      const rows = summaryRows.filter((r) => r.department_name === dept)
      const scored = rows.filter((r) => r.weighted_score != null)
      const completed = rows.filter((r) => r.status === 'completed')
      const gradeDistribution: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 }
      rows.forEach((r) => {
        if (r.grade && gradeDistribution[r.grade] !== undefined) gradeDistribution[r.grade]++
      })

      map.set(dept, {
        name: dept,
        count: rows.length,
        avgScore:
          scored.length > 0
            ? Math.round(
                (scored.reduce((sum, r) => sum + (r.weighted_score ?? 0), 0) / scored.length) * 10
              ) / 10
            : null,
        completionRate: rows.length > 0 ? Math.round((completed.length / rows.length) * 100) : 0,
        gradeDistribution,
      })
    }

    return map
  }, [summaryRows, departments])

  // Company-wide stats
  const companyStats = useMemo((): DepartmentStats => {
    const scored = summaryRows.filter((r) => r.weighted_score != null)
    const completed = summaryRows.filter((r) => r.status === 'completed')
    const gradeDistribution: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 }
    summaryRows.forEach((r) => {
      if (r.grade && gradeDistribution[r.grade] !== undefined) gradeDistribution[r.grade]++
    })

    return {
      name: '전체',
      count: summaryRows.length,
      avgScore:
        scored.length > 0
          ? Math.round(
              (scored.reduce((sum, r) => sum + (r.weighted_score ?? 0), 0) / scored.length) * 10
            ) / 10
          : null,
      completionRate:
        summaryRows.length > 0
          ? Math.round((completed.length / summaryRows.length) * 100)
          : 0,
      gradeDistribution,
    }
  }, [summaryRows])

  // Filtered rows
  const filteredRows = useMemo(
    () =>
      selectedDepartment
        ? summaryRows.filter((r) => r.department_name === selectedDepartment)
        : summaryRows,
    [summaryRows, selectedDepartment]
  )

  // Current stats (selected dept or company)
  const currentStats = useMemo(
    () =>
      selectedDepartment
        ? departmentStats.get(selectedDepartment) ?? companyStats
        : companyStats,
    [selectedDepartment, departmentStats, companyStats]
  )

  return {
    departments,
    selectedDepartment,
    setSelectedDepartment,
    departmentStats,
    companyStats,
    currentStats,
    filteredRows,
  }
}
