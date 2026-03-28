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
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [deviations, setDeviations] = useState<ItemScoreComparison[]>([])
  const [allItemScores, setAllItemScores] = useState<ItemScoreComparison[]>([])
  const [gradeDistribution, setGradeDistribution] = useState<GradeDistributionItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!periodId) {
      setLoading(false)
      return
    }
    fetchAll(periodId)
  }, [periodId, page])

  async function fetchAll(pid: string) {
    setLoading(true)

    const [progressRes, summaryRes] = await Promise.all([
      supabase
        .from('v_evaluation_progress')
        .select('*')
        .eq('period_id', pid)
        .maybeSingle(),
      supabase
        .from('v_evaluation_summary')
        .select('*', { count: 'exact' })
        .eq('period_id', pid)
        .order('employee_name')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
    ])

    // progress
    setProgress(progressRes.data as EvaluationProgress | null)

    // summary (페이지네이션 적용)
    const rows = (summaryRes.data as EvaluationSummaryRow[] | null) ?? []
    setSummaryRows(rows)
    setTotalCount(summaryRes.count ?? 0)

    // grade distribution — 서버 집계 (RPC) 또는 fallback
    const { data: gradeCounts } = await supabase
      .rpc('get_grade_distribution', { p_period_id: pid })

    if (gradeCounts && (gradeCounts as any[]).length > 0) {
      setGradeDistribution(gradeCounts as GradeDistributionItem[])
    } else {
      // fallback: 현재 페이지 데이터로 계산
      const gradeMap: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 }
      rows.forEach((r) => {
        if (r.grade && gradeMap[r.grade] !== undefined) gradeMap[r.grade]++
      })
      setGradeDistribution(
        Object.entries(gradeMap).map(([grade, count]) => ({ grade, count }))
      )
    }

    // item scores — 현재 페이지의 target만 가져오기
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

  return {
    progress,
    summaryRows,
    deviations,
    allItemScores,
    gradeDistribution,
    loading,
    totalCount,
    page,
    setPage,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
  }
}
