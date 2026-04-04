import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  EvaluationPeriod,
  EvaluationCategory,
  EvaluationItem,
  EvaluationTarget,
  SelfEvaluation,
  EvaluatorScore,
  JobType,
  EmployeeJobAssignment,
  EvaluationItemJobType,
} from '@/types/database'
import type { EvaluationTargetWithEmployee } from '@/types/evaluation'

// ─── 평가 기간 ──────────────────────────────────────────────────

export function useEvaluationPeriods() {
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPeriods()
  }, [])

  async function fetchPeriods() {
    const { data } = await supabase
      .from('evaluation_periods')
      .select('*')
      .order('year', { ascending: false })
      .order('quarter', { ascending: false })
    setPeriods(data ?? [])
    setLoading(false)
  }

  const activePeriod = periods.find((p) => p.status === 'in_progress') ?? null

  return { periods, activePeriod, loading, refetch: fetchPeriods }
}

// ─── 평가 카테고리 + 항목 ───────────────────────────────────────

export function useEvaluationCategories() {
  const [categories, setCategories] = useState<EvaluationCategory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('evaluation_categories')
        .select('*')
        .order('sort_order')
      setCategories(data ?? [])
      setLoading(false)
    }
    fetch()
  }, [])

  return { categories, loading }
}

export function useEvaluationItems(employeeId?: string | null) {
  const [items, setItems] = useState<EvaluationItem[]>([])
  const [itemJobTypes, setItemJobTypes] = useState<EvaluationItemJobType[]>([])
  const [employeeJobTypeId, setEmployeeJobTypeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      // 항목 + 항목-직무 매핑 동시 조회
      const [itemsRes, mappingRes] = await Promise.all([
        supabase.from('evaluation_items').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('evaluation_item_job_types').select('*'),
      ])

      const allItems = itemsRes.data ?? []
      const allMappings = mappingRes.data ?? []
      setItemJobTypes(allMappings)

      // 직원 직무 조회
      let empJobTypeId: string | null = null
      if (employeeId) {
        const { data: assignment } = await supabase
          .from('employee_job_assignments')
          .select('job_type_id')
          .eq('employee_id', employeeId)
          .maybeSingle()
        empJobTypeId = assignment?.job_type_id ?? null
      }
      setEmployeeJobTypeId(empJobTypeId)

      // 직무별 필터링
      if (empJobTypeId) {
        const filtered = allItems.filter((item) => {
          const mappings = allMappings.filter((m) => m.item_id === item.id)
          // 매핑 없는 항목 = 범용 (모든 직무에 적용)
          if (mappings.length === 0) return true
          // 직원 직무에 매핑된 항목만
          return mappings.some((m) => m.job_type_id === empJobTypeId)
        })
        setItems(filtered)
      } else {
        setItems(allItems)
      }

      setLoading(false)
    }
    fetch()
  }, [employeeId])

  return { items, itemJobTypes, employeeJobTypeId, loading }
}

// ─── 평가 대상 ──────────────────────────────────────────────────

export function useMyTarget(employeeId: string | null, periodId: string | null) {
  const [target, setTarget] = useState<EvaluationTarget | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!employeeId || !periodId) {
      setTarget(null)
      setLoading(false)
      return
    }
    fetchTarget(employeeId, periodId)
  }, [employeeId, periodId])

  async function fetchTarget(eid: string, pid: string) {
    setLoading(true)
    const { data } = await supabase
      .from('evaluation_targets')
      .select('*')
      .eq('employee_id', eid)
      .eq('period_id', pid)
      .maybeSingle()
    setTarget(data)
    setLoading(false)
  }

  return {
    target,
    loading,
    refetch: () => {
      if (employeeId && periodId) fetchTarget(employeeId, periodId)
    },
  }
}

export function useTargetsList(periodId: string | null) {
  const [targets, setTargets] = useState<EvaluationTargetWithEmployee[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTargets = useCallback(async () => {
    if (!periodId) {
      setTargets([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('evaluation_targets')
      .select('*, employee:employees!evaluation_targets_employee_id_fkey(*)')
      .eq('period_id', periodId)
      .order('created_at', { ascending: false })
    setTargets((data as unknown as EvaluationTargetWithEmployee[]) ?? [])
    setLoading(false)
  }, [periodId])

  useEffect(() => {
    fetchTargets()
  }, [fetchTargets])

  return { targets, loading, refetch: fetchTargets }
}

// ─── 자기평가 ───────────────────────────────────────────────────

export function useSelfEvaluations(targetId: string | null) {
  const [selfEvals, setSelfEvals] = useState<SelfEvaluation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!targetId) {
      setSelfEvals([])
      setLoading(false)
      return
    }
    fetchSelfEvals(targetId)
  }, [targetId])

  async function fetchSelfEvals(tid: string) {
    setLoading(true)
    const { data } = await supabase
      .from('self_evaluations')
      .select('*')
      .eq('target_id', tid)
    setSelfEvals(data ?? [])
    setLoading(false)
  }

  return {
    selfEvals,
    loading,
    refetch: () => {
      if (targetId) fetchSelfEvals(targetId)
    },
  }
}

export function useSaveSelfEvaluation() {
  const [saving, setSaving] = useState(false)

  async function save(
    id: string,
    data: Partial<Pick<SelfEvaluation, 'score' | 'personal_goal' | 'achievement_method' | 'self_comment'>>
  ) {
    setSaving(true)
    const { error } = await supabase.from('self_evaluations').update(data).eq('id', id)
    setSaving(false)
    return { error }
  }

  return { saveSelfEvaluation: save, saving }
}

export function useSubmitSelfEvaluation() {
  const [submitting, setSubmitting] = useState(false)

  async function submit(targetId: string) {
    setSubmitting(true)

    const { error: selfError } = await supabase
      .from('self_evaluations')
      .update({ is_draft: false })
      .eq('target_id', targetId)

    if (selfError) {
      setSubmitting(false)
      return { error: selfError }
    }

    const { error } = await supabase
      .from('evaluation_targets')
      .update({ status: 'self_done' })
      .eq('id', targetId)
      .eq('status', 'pending')

    setSubmitting(false)
    return { error }
  }

  return { submitSelfEvaluation: submit, submitting }
}

// ─── 평가자 점수 ────────────────────────────────────────────────

export function useEvaluatorScores(targetId: string | null, evaluatorRole?: string) {
  const [scores, setScores] = useState<EvaluatorScore[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!targetId) {
      setScores([])
      setLoading(false)
      return
    }
    fetchScores(targetId)
  }, [targetId, evaluatorRole])

  async function fetchScores(tid: string) {
    setLoading(true)
    let query = supabase.from('evaluator_scores').select('*').eq('target_id', tid)
    if (evaluatorRole) {
      query = query.eq('evaluator_role', evaluatorRole)
    }
    const { data } = await query
    setScores(data ?? [])
    setLoading(false)
  }

  return {
    scores,
    loading,
    refetch: () => {
      if (targetId) fetchScores(targetId)
    },
  }
}

export function useSaveEvaluatorScore() {
  const [saving, setSaving] = useState(false)

  async function save(id: string, score: number, comment?: string) {
    setSaving(true)
    const { error } = await supabase
      .from('evaluator_scores')
      .update({ score, comment })
      .eq('id', id)
    setSaving(false)
    return { error }
  }

  return { saveEvaluatorScore: save, saving }
}

// ─── 직무 유형 ─────────────────────────────────────────────────

export function useJobTypes() {
  const [jobTypes, setJobTypes] = useState<JobType[]>([])
  const [loading, setLoading] = useState(true)

  const fetchJobTypes = useCallback(async () => {
    const { data } = await supabase
      .from('job_types')
      .select('*')
      .order('sort_order')
    setJobTypes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchJobTypes()
  }, [fetchJobTypes])

  return { jobTypes, loading, refetch: fetchJobTypes }
}

export function useEmployeeJobAssignments() {
  const [assignments, setAssignments] = useState<EmployeeJobAssignment[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAssignments = useCallback(async () => {
    const { data } = await supabase.from('employee_job_assignments').select('*')
    setAssignments(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAssignments()
  }, [fetchAssignments])

  return { assignments, loading, refetch: fetchAssignments }
}
