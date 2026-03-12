import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  useEvaluationPeriods,
  useEvaluationCategories,
  useEvaluationItems,
  useTargetsList,
} from '@/hooks/useEvaluation'
import type {
  Employee,
  EvaluationTarget,
  SelfEvaluation,
  EvaluatorScore,
  EvaluatorComment,
  EmployeeRole,
} from '@/types/database'

// ─── 내 역할에 해당하는 evaluator_role 매핑 ─────────────────────
const ROLE_TO_EVALUATOR: Record<string, string> = {
  leader: 'leader',
  director: 'director',
  division_head: 'director',
  ceo: 'ceo',
}

// ─── 역할별로 평가해야 할 status 매핑 ───────────────────────────
const ROLE_TO_REQUIRED_STATUS: Record<string, string> = {
  leader: 'self_done',
  director: 'leader_done',
  division_head: 'leader_done',
  ceo: 'director_done',
}

// ─── Types ──────────────────────────────────────────────────────

export interface EvaluatorFormData {
  score: number | null
  comment: string
}

export interface CommentFormData {
  strength: string
  improvement: string
  overall: string
}

// ─── Hook ───────────────────────────────────────────────────────

export function useEvaluateDetail(employeeId: string | undefined) {
  const { profile } = useAuth()
  const { activePeriod, loading: periodLoading } = useEvaluationPeriods()
  const { categories, loading: catsLoading } = useEvaluationCategories()
  const { items, loading: itemsLoading } = useEvaluationItems()
  const { targets } = useTargetsList(activePeriod?.id ?? null)

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [target, setTarget] = useState<EvaluationTarget | null>(null)
  const [selfEvals, setSelfEvals] = useState<SelfEvaluation[]>([])
  const [myScores, setMyScores] = useState<EvaluatorScore[]>([])
  const [prevScores, setPrevScores] = useState<EvaluatorScore[]>([])
  const [myComment, setMyComment] = useState<EvaluatorComment | null>(null)
  const [departmentName, setDepartmentName] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const myRole = profile?.role as EmployeeRole | undefined
  const evaluatorRole = myRole ? ROLE_TO_EVALUATOR[myRole] : null

  // ─── 평가 가능한 대상 목록 (이전/다음 네비게이션용) ─────────
  const evaluableTargets = targets.filter((t) => {
    if (!myRole) return false
    const requiredStatus = ROLE_TO_REQUIRED_STATUS[myRole]
    if (!requiredStatus) return false
    // 내 평가 단계이거나 이미 지나간 단계
    const statusOrder = [
      'pending', 'self_done', 'leader_done',
      'director_done', 'ceo_done', 'completed',
    ]
    const targetIdx = statusOrder.indexOf(t.status)
    const requiredIdx = statusOrder.indexOf(requiredStatus)
    return targetIdx >= requiredIdx
  })

  const currentIndex = evaluableTargets.findIndex(
    (t) => t.employee_id === employeeId
  )
  const prevEmployeeId = currentIndex > 0
    ? evaluableTargets[currentIndex - 1].employee_id
    : null
  const nextEmployeeId = currentIndex < evaluableTargets.length - 1
    ? evaluableTargets[currentIndex + 1].employee_id
    : null

  // ─── Fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (periodLoading || !employeeId || !activePeriod?.id) {
      if (!periodLoading) setDataLoading(false)
      return
    }
    fetchData()
  }, [employeeId, activePeriod?.id, periodLoading])

  async function fetchData() {
    if (!employeeId || !activePeriod || !profile) return
    setDataLoading(true)

    // 1) employee + target + department
    const [empRes, targetRes] = await Promise.all([
      supabase.from('employees').select('*').eq('id', employeeId).single(),
      supabase
        .from('evaluation_targets')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('period_id', activePeriod.id)
        .maybeSingle(),
    ])

    setEmployee(empRes.data)
    setTarget(targetRes.data)

    if (empRes.data?.department_id) {
      const { data: deptData } = await supabase
        .from('departments')
        .select('name')
        .eq('id', empRes.data.department_id)
        .single()
      setDepartmentName(deptData?.name ?? null)
    } else {
      setDepartmentName(null)
    }

    if (!targetRes.data) {
      setDataLoading(false)
      return
    }

    const tid = targetRes.data.id

    // 2) self_evaluations + my evaluator_scores + my evaluator_comment + previous scores
    const selfQuery = supabase.from('self_evaluations').select('*').eq('target_id', tid)

    const myScoresQuery = evaluatorRole
      ? supabase.from('evaluator_scores').select('*').eq('target_id', tid).eq('evaluator_role', evaluatorRole)
      : null

    const myCommentQuery = evaluatorRole
      ? supabase.from('evaluator_comments').select('*').eq('target_id', tid).eq('evaluator_role', evaluatorRole).maybeSingle()
      : null

    const prevQuery = supabase.from('evaluator_scores').select('*').eq('target_id', tid).neq('evaluator_role', evaluatorRole ?? '')

    const [selfRes, myScoresRes, myCommentRes, prevRes] = await Promise.all([
      selfQuery,
      myScoresQuery ?? Promise.resolve({ data: [] as EvaluatorScore[] }),
      myCommentQuery ?? Promise.resolve({ data: null as EvaluatorComment | null }),
      prevQuery,
    ])

    setSelfEvals(selfRes.data ?? [])
    setMyScores(myScoresRes.data ?? [])
    setMyComment(myCommentRes.data ?? null)
    setPrevScores(prevRes.data ?? [])
    setDataLoading(false)
  }

  // ─── Computed ─────────────────────────────────────────────
  const loading = periodLoading || catsLoading || itemsLoading || dataLoading

  // ─── 임시저장 ─────────────────────────────────────────────
  async function saveAll(
    scoreData: Record<string, EvaluatorFormData>,
    commentData: CommentFormData
  ): Promise<{ error: string | null }> {
    if (!target || !profile || !evaluatorRole) return { error: '평가 권한이 없습니다' }
    setSaving(true)

    // upsert evaluator_scores
    const scoreRows = Object.entries(scoreData).map(([itemId, d]) => ({
      target_id: target.id,
      item_id: itemId,
      evaluator_id: profile.id,
      evaluator_role: evaluatorRole,
      score: d.score,
      comment: d.comment || null,
      is_draft: true,
    }))

    const { error: scoreErr } = await supabase
      .from('evaluator_scores')
      .upsert(scoreRows, { onConflict: 'target_id,item_id,evaluator_role' })

    if (scoreErr) {
      setSaving(false)
      return { error: scoreErr.message }
    }

    // upsert evaluator_comments
    const commentRow = {
      target_id: target.id,
      evaluator_id: profile.id,
      evaluator_role: evaluatorRole,
      strength: commentData.strength || null,
      improvement: commentData.improvement || null,
      overall: commentData.overall || null,
    }

    const { error: commentErr } = await supabase
      .from('evaluator_comments')
      .upsert(commentRow, { onConflict: 'target_id,evaluator_role' })

    if (commentErr) {
      setSaving(false)
      return { error: commentErr.message }
    }

    // Refresh
    await fetchData()
    setSaving(false)
    return { error: null }
  }

  // ─── 평가 확정 ────────────────────────────────────────────
  async function submitEvaluation(
    scoreData: Record<string, EvaluatorFormData>,
    commentData: CommentFormData
  ): Promise<{ error: string | null }> {
    if (!target || !profile || !evaluatorRole) return { error: '평가 권한이 없습니다' }
    setSubmitting(true)

    // 1) Save with is_draft = false
    const scoreRows = Object.entries(scoreData).map(([itemId, d]) => ({
      target_id: target.id,
      item_id: itemId,
      evaluator_id: profile.id,
      evaluator_role: evaluatorRole,
      score: d.score,
      comment: d.comment || null,
      is_draft: false,
    }))

    const { error: scoreErr } = await supabase
      .from('evaluator_scores')
      .upsert(scoreRows, { onConflict: 'target_id,item_id,evaluator_role' })

    if (scoreErr) {
      setSubmitting(false)
      return { error: scoreErr.message }
    }

    // 2) Save comment
    const commentRow = {
      target_id: target.id,
      evaluator_id: profile.id,
      evaluator_role: evaluatorRole,
      strength: commentData.strength || null,
      improvement: commentData.improvement || null,
      overall: commentData.overall || null,
    }

    const { error: commentErr } = await supabase
      .from('evaluator_comments')
      .upsert(commentRow, { onConflict: 'target_id,evaluator_role' })

    if (commentErr) {
      setSubmitting(false)
      return { error: commentErr.message }
    }

    // 3) Advance stage
    const { error: rpcErr } = await supabase.rpc('advance_evaluation_stage', {
      p_target_id: target.id,
      p_role: evaluatorRole,
    })

    if (rpcErr) {
      setSubmitting(false)
      return { error: rpcErr.message }
    }

    // 4) Refresh
    await fetchData()
    setSubmitting(false)
    return { error: null }
  }

  return {
    period: activePeriod,
    employee,
    target,
    categories,
    items,
    selfEvals,
    myScores,
    prevScores,
    myComment,
    departmentName,
    evaluatorRole,
    loading,
    saving,
    submitting,
    evaluableTargets,
    currentIndex,
    prevEmployeeId,
    nextEmployeeId,
    saveAll,
    submitEvaluation,
  }
}
