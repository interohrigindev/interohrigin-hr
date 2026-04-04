import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  useEvaluationPeriods,
  useEvaluationCategories,
  useEvaluationItems,
} from '@/hooks/useEvaluation'
import type {
  Employee,
  EvaluationTarget,
  SelfEvaluation,
  EvaluatorScore,
  EvaluatorComment,
  EvaluationWeight,
} from '@/types/database'
import type {
  EvaluationSummaryRow,
  ItemScoreComparison,
} from '@/hooks/useDashboard'

// ─── 분기별 추이 데이터 ─────────────────────────────────────────

export interface QuarterlyTrend {
  label: string
  score: number | null
  grade: string | null
}

// ─── Hook ───────────────────────────────────────────────────────

export function useReport(employeeId: string | undefined, periodIdParam: string | null) {
  const { periods, activePeriod, loading: periodsLoading } = useEvaluationPeriods()
  const { categories, loading: catsLoading } = useEvaluationCategories()
  const { items, loading: itemsLoading } = useEvaluationItems(employeeId)

  const effectivePeriodId = periodIdParam ?? activePeriod?.id ?? null

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [departmentName, setDepartmentName] = useState<string | null>(null)
  const [target, setTarget] = useState<EvaluationTarget | null>(null)
  const [selfEvals, setSelfEvals] = useState<SelfEvaluation[]>([])
  const [allScores, setAllScores] = useState<EvaluatorScore[]>([])
  const [allComments, setAllComments] = useState<EvaluatorComment[]>([])
  const [weights, setWeights] = useState<EvaluationWeight[]>([])
  const [summaryRow, setSummaryRow] = useState<EvaluationSummaryRow | null>(null)
  const [itemComparisons, setItemComparisons] = useState<ItemScoreComparison[]>([])
  const [deptRank, setDeptRank] = useState<{ rank: number; total: number } | null>(null)
  const [quarterlyTrend, setQuarterlyTrend] = useState<QuarterlyTrend[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (periodsLoading || !employeeId) {
      if (!periodsLoading && !employeeId) setDataLoading(false)
      return
    }
    if (!effectivePeriodId) {
      setDataLoading(false)
      return
    }
    fetchData()
  }, [employeeId, effectivePeriodId, periodsLoading])

  async function fetchData() {
    if (!employeeId || !effectivePeriodId) return
    setDataLoading(true)

    // 1) Employee + department
    const { data: empData } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .single()
    setEmployee(empData)

    if (empData?.department_id) {
      const { data: deptData } = await supabase
        .from('departments')
        .select('name')
        .eq('id', empData.department_id)
        .single()
      setDepartmentName(deptData?.name ?? null)
    } else {
      setDepartmentName(null)
    }

    // 2) Target
    const { data: targetData } = await supabase
      .from('evaluation_targets')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('period_id', effectivePeriodId)
      .maybeSingle()
    setTarget(targetData)

    if (!targetData) {
      setDataLoading(false)
      return
    }

    const tid = targetData.id

    // 3) Self evals, evaluator scores, evaluator comments, weights, summary, item comparisons
    const selfQuery = supabase.from('self_evaluations').select('*').eq('target_id', tid)
    const scoresQuery = supabase.from('evaluator_scores').select('*').eq('target_id', tid)
    const commentsQuery = supabase.from('evaluator_comments').select('*').eq('target_id', tid)
    const weightsQuery = supabase.from('evaluation_weights').select('*').eq('period_id', effectivePeriodId)
    const summaryQuery = supabase
      .from('v_evaluation_summary')
      .select('*')
      .eq('target_id', tid)
      .maybeSingle()
    const itemQuery = supabase
      .from('v_item_scores_comparison')
      .select('*')
      .eq('target_id', tid)

    const [selfRes, scoresRes, commentsRes, weightsRes, summaryRes, itemRes] = await Promise.all([
      selfQuery, scoresQuery, commentsQuery, weightsQuery, summaryQuery, itemQuery,
    ])

    setSelfEvals(selfRes.data ?? [])
    setAllScores(scoresRes.data ?? [])
    setAllComments(commentsRes.data ?? [])
    setWeights(weightsRes.data ?? [])
    setSummaryRow(summaryRes.data as EvaluationSummaryRow | null)
    setItemComparisons((itemRes.data as ItemScoreComparison[] | null) ?? [])

    // 4) Department rank: get all summaries for this period, filter same department
    if (empData?.department_id) {
      const { data: allSummaries } = await supabase
        .from('v_evaluation_summary')
        .select('employee_id, weighted_score, department_name')
        .eq('period_id', effectivePeriodId)

      if (allSummaries) {
        // Find department name for this employee
        const myDeptName = (summaryRes.data as EvaluationSummaryRow | null)?.department_name
        const deptRows = allSummaries.filter(
          (s: { department_name: string | null; weighted_score: number | null }) =>
            s.department_name === myDeptName && s.weighted_score != null
        )
        const sorted = deptRows.sort(
          (a: { weighted_score: number | null }, b: { weighted_score: number | null }) =>
            (b.weighted_score ?? 0) - (a.weighted_score ?? 0)
        )
        const myIdx = sorted.findIndex(
          (s: { employee_id: string }) => s.employee_id === employeeId
        )
        setDeptRank(myIdx >= 0 ? { rank: myIdx + 1, total: sorted.length } : null)
      }
    } else {
      setDeptRank(null)
    }

    // 5) Quarterly trend: all periods for this employee
    const { data: allTargets } = await supabase
      .from('evaluation_targets')
      .select('period_id, final_score, grade')
      .eq('employee_id', employeeId)

    if (allTargets && periods.length > 0) {
      const trend: QuarterlyTrend[] = periods
        .slice()
        .sort((a, b) => a.year - b.year || a.quarter - b.quarter)
        .map((p) => {
          const t = allTargets.find(
            (at: { period_id: string }) => at.period_id === p.id
          )
          return {
            label: `${p.year} Q${p.quarter}`,
            score: t?.final_score ?? null,
            grade: t?.grade ?? null,
          }
        })
      setQuarterlyTrend(trend)
    }

    setDataLoading(false)
  }

  const loading = periodsLoading || catsLoading || itemsLoading || dataLoading
  const selectedPeriod = periods.find((p) => p.id === effectivePeriodId) ?? activePeriod

  return {
    periods,
    selectedPeriod,
    employee,
    departmentName,
    target,
    categories,
    items,
    selfEvals,
    allScores,
    allComments,
    weights,
    summaryRow,
    itemComparisons,
    deptRank,
    quarterlyTrend,
    loading,
  }
}
