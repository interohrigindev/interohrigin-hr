import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── View 타입 정의 ─────────────────────────────────────────────

export interface EvaluationProgress {
  period_id: string
  year: number
  quarter: number
  total_employees: number
  self_done_count: number
  leader_done_count: number
  director_done_count: number
  ceo_done_count: number
  completed_count: number
}

export interface EvaluationSummaryRow {
  target_id: string
  period_id: string
  year: number
  quarter: number
  employee_id: string
  employee_name: string
  department_name: string | null
  self_total: number | null
  leader_total: number | null
  director_total: number | null
  ceo_total: number | null
  weighted_score: number | null
  grade: string | null
  status: string
}

export interface ItemScoreComparison {
  target_id: string
  employee_name: string
  item_name: string
  category_name: string
  self_score: number | null
  leader_score: number | null
  director_score: number | null
  ceo_score: number | null
  max_deviation: number | null
  has_deviation_flag: boolean
}

export interface GradeDistributionItem {
  grade: string
  count: number
}

// ─── Hook ───────────────────────────────────────────────────────

const PAGE_SIZE = 50

export function useDashboard(periodId: string | null) {
  const [progress, setProgress] = useState<EvaluationProgress | null>(null)
  const [summaryRows, setSummaryRows] = useState<EvaluationSummaryRow[]>([])
  const [deviations, setDeviations] = useState<ItemScoreComparison[]>([])
  const [allItemScores, setAllItemScores] = useState<ItemScoreComparison[]>([])
  const [gradeDistribution, setGradeDistribution] = useState<GradeDistributionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    if (!periodId) {
      setLoading(false)
      return
    }
    fetchAll(periodId, 0)
    setPage(0)
  }, [periodId])

  async function fetchAll(pid: string, pageNum: number) {
    setLoading(true)
    const from = pageNum * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const [progressRes, summaryRes, countRes] = await Promise.all([
      supabase
        .from('v_evaluation_progress')
        .select('*')
        .eq('period_id', pid)
        .maybeSingle(),
      supabase
        .from('v_evaluation_summary')
        .select('*')
        .eq('period_id', pid)
        .order('employee_name')
        .range(from, to),
      supabase
        .from('v_evaluation_summary')
        .select('*', { count: 'exact', head: true })
        .eq('period_id', pid),
    ])

    // progress
    setProgress(progressRes.data as EvaluationProgress | null)
    setTotalCount(countRes.count || 0)

    // summary (paginated)
    const rows = (summaryRes.data as EvaluationSummaryRow[] | null) ?? []
    setSummaryRows(rows)

    // grade distribution — try RPC first, fallback to client-side
    const { data: gradeData, error: gradeErr } = await supabase
      .rpc('get_grade_distribution', { p_period_id: pid })

    if (!gradeErr && gradeData) {
      setGradeDistribution(gradeData as GradeDistributionItem[])
    } else {
      // Fallback: compute from current page (approximate if paginated)
      const gradeMap: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 }
      rows.forEach((r) => {
        if (r.grade && gradeMap[r.grade] !== undefined) {
          gradeMap[r.grade]++
        }
      })
      setGradeDistribution(
        Object.entries(gradeMap).map(([grade, count]) => ({ grade, count }))
      )
    }

    // item scores — fetch using target IDs from current page
    const targetIds = rows.map((r) => r.target_id)
    if (targetIds.length > 0) {
      const { data: itemData } = await supabase
        .from('v_item_scores_comparison')
        .select('*')
        .in('target_id', targetIds)

      const allItems = (itemData as ItemScoreComparison[] | null) ?? []
      setAllItemScores(allItems)
      setDeviations(allItems.filter((d) => d.has_deviation_flag))
    } else {
      setAllItemScores([])
      setDeviations([])
    }

    setLoading(false)
  }

  function goToPage(pageNum: number) {
    if (!periodId) return
    setPage(pageNum)
    fetchAll(periodId, pageNum)
  }

  return {
    progress,
    summaryRows,
    deviations,
    allItemScores,
    gradeDistribution,
    loading,
    page,
    totalCount,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
    goToPage,
  }
}
