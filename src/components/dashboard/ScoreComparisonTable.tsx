import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { GradeBadge } from '@/components/evaluation/GradeBadge'
import { EVALUATION_STATUS_LABELS, EVALUATION_STATUS_COLORS } from '@/lib/constants'
import type { EvaluationSummaryRow } from '@/hooks/useDashboard'
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react'

interface ScoreComparisonTableProps {
  rows: EvaluationSummaryRow[]
  groupByDepartment?: boolean
}

type SortKey = 'employee_name' | 'self_total' | 'leader_total' | 'director_total' | 'ceo_total' | 'weighted_score' | 'grade'
type SortDir = 'asc' | 'desc'

const GRADE_ORDER: Record<string, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 }

function renderScore(value: number | null) {
  if (value == null) return <span className="text-gray-300">&mdash;</span>
  return <span>{value}</span>
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="inline h-3.5 w-3.5 text-gray-300" />
  return dir === 'asc'
    ? <ArrowUp className="inline h-3.5 w-3.5 text-brand-600" />
    : <ArrowDown className="inline h-3.5 w-3.5 text-brand-600" />
}

export function ScoreComparisonTable({ rows, groupByDepartment = false }: ScoreComparisonTableProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set())

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // Filter by search
  const searched = useMemo(
    () =>
      search.trim()
        ? rows.filter((r) => r.employee_name.includes(search.trim()))
        : rows,
    [rows, search]
  )

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return searched
    return [...searched].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'employee_name') {
        cmp = a.employee_name.localeCompare(b.employee_name)
      } else if (sortKey === 'grade') {
        cmp = (GRADE_ORDER[a.grade ?? ''] ?? 0) - (GRADE_ORDER[b.grade ?? ''] ?? 0)
      } else {
        cmp = (a[sortKey] ?? -1) - (b[sortKey] ?? -1)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [searched, sortKey, sortDir])

  // Group by department if needed
  const departments = useMemo(() => {
    if (!groupByDepartment) return null
    const depts: string[] = []
    const seen = new Set<string>()
    sorted.forEach((r) => {
      const d = r.department_name ?? '미지정'
      if (!seen.has(d)) { seen.add(d); depts.push(d) }
    })
    return depts
  }, [sorted, groupByDepartment])

  function toggleDept(dept: string) {
    setCollapsedDepts((prev) => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
  }

  function toggleAllDepts() {
    if (!departments) return
    if (collapsedDepts.size === departments.length) {
      setCollapsedDepts(new Set())
    } else {
      setCollapsedDepts(new Set(departments))
    }
  }

  const allCollapsed = departments != null && collapsedDepts.size === departments.length

  const thClass = 'px-3 py-3 font-medium text-gray-500 text-center whitespace-nowrap cursor-pointer select-none hover:text-gray-700'

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>직원별 점수 비교</CardTitle>
          <div className="flex items-center gap-2">
            {groupByDepartment && departments && departments.length > 0 && (
              <button
                onClick={toggleAllDepts}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                title={allCollapsed ? '전체 펼치기' : '전체 접기'}
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />
                {allCollapsed ? '전체 펼치기' : '전체 접기'}
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="직원명 검색..."
                className="w-full rounded-lg border border-gray-300 py-1.5 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 sm:w-56"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {sorted.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-gray-400">
            {search ? '검색 결과가 없습니다' : '아직 평가 데이터가 없습니다'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-3 py-3 font-medium text-gray-400 text-center w-10">#</th>
                  <th
                    className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    onClick={() => handleSort('employee_name')}
                  >
                    직원명 <SortIcon active={sortKey === 'employee_name'} dir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => handleSort('self_total')}>
                    자기 <SortIcon active={sortKey === 'self_total'} dir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => handleSort('leader_total')}>
                    리더 <SortIcon active={sortKey === 'leader_total'} dir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => handleSort('director_total')}>
                    이사 <SortIcon active={sortKey === 'director_total'} dir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => handleSort('ceo_total')}>
                    대표 <SortIcon active={sortKey === 'ceo_total'} dir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => handleSort('weighted_score')}>
                    최종 <SortIcon active={sortKey === 'weighted_score'} dir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => handleSort('grade')}>
                    등급 <SortIcon active={sortKey === 'grade'} dir={sortDir} />
                  </th>
                  <th className="px-3 py-3 font-medium text-gray-500 text-center whitespace-nowrap">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {groupByDepartment && departments
                  ? departments.map((dept) => {
                      const deptRows = sorted.filter(
                        (r) => (r.department_name ?? '미지정') === dept
                      )
                      const deptScored = deptRows.filter((r) => r.weighted_score != null)
                      const deptAvg =
                        deptScored.length > 0
                          ? Math.round(
                              (deptScored.reduce((s, r) => s + (r.weighted_score ?? 0), 0) /
                                deptScored.length) *
                                10
                            ) / 10
                          : null

                      let idx = sorted.indexOf(deptRows[0])
                      const isCollapsed = collapsedDepts.has(dept)

                      return [
                        // Department header row
                        <tr
                          key={`dept-${dept}`}
                          className="bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => toggleDept(dept)}
                        >
                          <td colSpan={9} className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-gray-500" />
                              )}
                              <span className="font-semibold text-gray-700">{dept}</span>
                              <span className="text-xs text-gray-500">
                                {deptRows.length}명
                                {deptAvg != null && ` · 평균 ${deptAvg}점`}
                              </span>
                            </div>
                          </td>
                        </tr>,
                        // Employee rows (hidden when collapsed)
                        ...(!isCollapsed
                          ? deptRows.map((r, i) => (
                              <EmployeeRow key={r.target_id} row={r} index={idx + i + 1} navigate={navigate} />
                            ))
                          : []),
                      ]
                    })
                  : sorted.map((r, i) => (
                      <EmployeeRow key={r.target_id} row={r} index={i + 1} navigate={navigate} />
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmployeeRow({
  row: r,
  index,
  navigate,
}: {
  row: EvaluationSummaryRow
  index: number
  navigate: (path: string) => void
}) {
  return (
    <tr
      className="hover:bg-brand-50/50 cursor-pointer transition-colors"
      onClick={() => navigate(`/report/${r.employee_id}`)}
    >
      <td className="px-3 py-3 text-center tabular-nums text-gray-400 text-xs">{index}</td>
      <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
        <div>
          {r.employee_name}
          {r.department_name && (
            <span className="ml-1.5 text-xs text-gray-400">{r.department_name}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-3 text-center tabular-nums">{renderScore(r.self_total)}</td>
      <td className="px-3 py-3 text-center tabular-nums">{renderScore(r.leader_total)}</td>
      <td className="px-3 py-3 text-center tabular-nums">{renderScore(r.director_total)}</td>
      <td className="px-3 py-3 text-center tabular-nums">{renderScore(r.ceo_total)}</td>
      <td className="px-3 py-3 text-center tabular-nums font-semibold">
        {renderScore(r.weighted_score)}
      </td>
      <td className="px-3 py-3 text-center">
        <GradeBadge grade={r.grade} />
      </td>
      <td className="px-3 py-3 text-center">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${EVALUATION_STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {EVALUATION_STATUS_LABELS[r.status] ?? r.status}
        </span>
      </td>
    </tr>
  )
}
