import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  useEvaluationPeriods,
  useEvaluationCategories,
  useEvaluationItems,
} from '@/hooks/useEvaluation'
import type { EvaluationTarget, SelfEvaluation } from '@/types/database'

// ─── 폼 데이터 타입 ─────────────────────────────────────────────

export interface SelfEvalFormData {
  personal_goal: string
  achievement_method: string
  self_comment: string
  score: number | null
}

export type EvalPhase = 'goal_setting' | 'quarterly_eval' | 'readonly'

// ─── Hook ───────────────────────────────────────────────────────

export function useSelfEvaluation() {
  const { profile, isAdmin } = useAuth()
  const { activePeriod, loading: periodLoading } = useEvaluationPeriods()
  const { categories, loading: catsLoading } = useEvaluationCategories()
  const { items, loading: itemsLoading } = useEvaluationItems(profile?.id)

  const [target, setTarget] = useState<EvaluationTarget | null>(null)
  const [selfEvals, setSelfEvals] = useState<SelfEvaluation[]>([])
  const [departmentName, setDepartmentName] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // ─── Fetch target + self_evaluations + department ──────────

  useEffect(() => {
    if (periodLoading || !profile?.id) return
    if (!activePeriod?.id) {
      setDataLoading(false)
      return
    }
    fetchData()
  }, [profile?.id, activePeriod?.id, periodLoading])

  async function fetchData() {
    if (!profile || !activePeriod) return
    setDataLoading(true)

    const [targetRes, deptRes] = await Promise.all([
      supabase
        .from('evaluation_targets')
        .select('*')
        .eq('employee_id', profile.id)
        .eq('period_id', activePeriod.id)
        .maybeSingle(),
      profile.department_id
        ? supabase
            .from('departments')
            .select('name')
            .eq('id', profile.department_id)
            .single()
        : Promise.resolve({ data: null }),
    ])

    setTarget(targetRes.data)
    setDepartmentName(deptRes.data?.name ?? null)

    if (targetRes.data) {
      const { data: selfData } = await supabase
        .from('self_evaluations')
        .select('*')
        .eq('target_id', targetRes.data.id)
      setSelfEvals(selfData ?? [])
    }

    setDataLoading(false)
  }

  // ─── Computed ──────────────────────────────────────────────

  const loading = periodLoading || catsLoading || itemsLoading || dataLoading
  const isLocked = !!(activePeriod?.is_locked && !isAdmin)

  // 현재 평가 단계 판별
  const currentPhase: EvalPhase = (() => {
    if (!target || target.status !== 'pending' || isLocked) return 'readonly'
    if (!target.goals_submitted) return 'goal_setting'
    return 'quarterly_eval'
  })()

  const isReadOnly = currentPhase === 'readonly'

  // ─── 임시저장 ─────────────────────────────────────────────

  async function saveAll(
    formData: Record<string, SelfEvalFormData>
  ): Promise<{ error: string | null }> {
    if (!target) return { error: '평가 대상이 없습니다' }
    setSaving(true)

    const rows = Object.entries(formData).map(([itemId, d]) => ({
      target_id: target.id,
      item_id: itemId,
      personal_goal: d.personal_goal || null,
      achievement_method: d.achievement_method || null,
      self_comment: d.self_comment || null,
      score: d.score,
      is_draft: true,
    }))

    const { error } = await supabase
      .from('self_evaluations')
      .upsert(rows, { onConflict: 'target_id,item_id' })

    if (!error) {
      const { data } = await supabase
        .from('self_evaluations')
        .select('*')
        .eq('target_id', target.id)
      setSelfEvals(data ?? [])
    }

    setSaving(false)
    return { error: error?.message ?? null }
  }

  // ─── 목표 설정 제출 (Phase 1) ─────────────────────────────

  async function submitGoals(
    formData: Record<string, SelfEvalFormData>
  ): Promise<{ error: string | null }> {
    if (!target) return { error: '평가 대상이 없습니다' }
    setSubmitting(true)

    // 1) goal/method만 저장
    const rows = Object.entries(formData).map(([itemId, d]) => ({
      target_id: target.id,
      item_id: itemId,
      personal_goal: d.personal_goal || null,
      achievement_method: d.achievement_method || null,
      self_comment: d.self_comment || null,
      score: d.score,
      is_draft: true,
    }))

    const { error: upsertErr } = await supabase
      .from('self_evaluations')
      .upsert(rows, { onConflict: 'target_id,item_id' })

    if (upsertErr) {
      setSubmitting(false)
      return { error: upsertErr.message }
    }

    // 2) goals_submitted 플래그 업데이트
    const { error: flagErr } = await supabase
      .from('evaluation_targets')
      .update({ goals_submitted: true, goals_submitted_at: new Date().toISOString() })
      .eq('id', target.id)

    if (flagErr) {
      setSubmitting(false)
      return { error: flagErr.message }
    }

    // 3) 상태 새로고침
    const [newTarget, newSelf] = await Promise.all([
      supabase.from('evaluation_targets').select('*').eq('id', target.id).single(),
      supabase.from('self_evaluations').select('*').eq('target_id', target.id),
    ])
    setTarget(newTarget.data)
    setSelfEvals(newSelf.data ?? [])

    setSubmitting(false)
    return { error: null }
  }

  // ─── 분기 평가 제출 (Phase 2) ─────────────────────────────

  async function submit(
    formData: Record<string, SelfEvalFormData>
  ): Promise<{ error: string | null }> {
    if (!target) return { error: '평가 대상이 없습니다' }
    setSubmitting(true)

    // 1) 전체 저장 (is_draft = false)
    const rows = Object.entries(formData).map(([itemId, d]) => ({
      target_id: target.id,
      item_id: itemId,
      personal_goal: d.personal_goal || null,
      achievement_method: d.achievement_method || null,
      self_comment: d.self_comment || null,
      score: d.score,
      is_draft: false,
    }))

    const { error: upsertErr } = await supabase
      .from('self_evaluations')
      .upsert(rows, { onConflict: 'target_id,item_id' })

    if (upsertErr) {
      setSubmitting(false)
      return { error: upsertErr.message }
    }

    // 2) 평가 단계 전진
    const { error: rpcErr } = await supabase.rpc('advance_evaluation_stage', {
      p_target_id: target.id,
      p_role: 'self',
    })

    if (rpcErr) {
      setSubmitting(false)
      return { error: rpcErr.message }
    }

    // 3) 상태 새로고침
    const [newTarget, newSelf] = await Promise.all([
      supabase.from('evaluation_targets').select('*').eq('id', target.id).single(),
      supabase.from('self_evaluations').select('*').eq('target_id', target.id),
    ])
    setTarget(newTarget.data)
    setSelfEvals(newSelf.data ?? [])

    setSubmitting(false)
    return { error: null }
  }

  return {
    period: activePeriod,
    target,
    categories,
    items,
    selfEvals,
    departmentName,
    loading,
    saving,
    submitting,
    isReadOnly,
    isLocked,
    currentPhase,
    saveAll,
    submitGoals,
    submit,
  }
}
