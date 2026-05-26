import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { InterviewSchedule } from '@/types/recruitment'

export function useInterviewSchedules(candidateId?: string) {
  const [schedules, setSchedules] = useState<InterviewSchedule[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('interview_schedules')
      .select('*')
      .order('scheduled_at', { ascending: true })

    if (candidateId) {
      query = query.eq('candidate_id', candidateId)
    }

    const { data, error } = await query
    if (error) {
      console.error('[useInterviewSchedules] fetch failed:', error)
    }
    if (data) setSchedules(data as InterviewSchedule[])
    setLoading(false)
  }, [candidateId])

  useEffect(() => { fetch() }, [fetch])

  return { schedules, loading, refetch: fetch }
}

export type ScheduleWithCandidate = InterviewSchedule & {
  candidate_name?: string
  candidate_status?: string | null
  candidate_position?: string | null
  job_title?: string | null
}

export function useAllSchedules(dateFrom?: string, dateTo?: string) {
  const [schedules, setSchedules] = useState<ScheduleWithCandidate[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('interview_schedules')
      // 불합격(rejected) 지원자의 이름·직무 정보도 캘린더에 노출되어야 하므로 schedule 단에서 join
      // 주의: candidates 에는 position 컬럼이 없음 — 직무는 job_postings.position 에서 가져옴 (42703 회귀 fix)
      .select('*, candidates(name, status, job_postings(title, position))')
      .order('scheduled_at', { ascending: true })

    if (dateFrom) query = query.gte('scheduled_at', dateFrom)
    if (dateTo) query = query.lte('scheduled_at', dateTo)

    let { data, error } = await query
    if (error) {
      // 긴급 진단용 — silent fail 방지. join (candidates, job_postings) 실패 시
      // 전체 결과가 null 반환되어 면접 일정이 0건으로 보이는 회귀 추적.
      console.error('[useAllSchedules] join fetch failed — fallback to plain select:', error, {
        code: (error as { code?: string }).code,
        details: (error as { details?: string }).details,
        hint: (error as { hint?: string }).hint,
        message: error.message,
      })

      // Fallback: join 없이 단순 select — 일정만이라도 화면에 표시되도록 복구
      let plainQuery = supabase
        .from('interview_schedules')
        .select('*')
        .order('scheduled_at', { ascending: true })
      if (dateFrom) plainQuery = plainQuery.gte('scheduled_at', dateFrom)
      if (dateTo) plainQuery = plainQuery.lte('scheduled_at', dateTo)
      const plain = await plainQuery
      if (plain.error) {
        console.error('[useAllSchedules] plain fetch also failed:', plain.error)
      } else {
        data = plain.data as unknown as any[]
      }
    }
    if (data) {
      setSchedules(
        data.map((s: any) => {
          const cand = s.candidates
          const posting = cand?.job_postings
          return {
            ...s,
            candidate_name: cand?.name || '알 수 없음',
            candidate_status: cand?.status ?? null,
            // candidates.position 은 존재하지 않으므로 job_postings.position 사용
            candidate_position: posting?.position ?? null,
            job_title: posting?.title ?? null,
          }
        })
      )
    }
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { fetch() }, [fetch])

  return { schedules, loading, refetch: fetch }
}

export function useInterviewScheduleMutations() {
  async function createSchedule(data: Partial<InterviewSchedule>) {
    const { data: result, error } = await supabase
      .from('interview_schedules')
      .insert(data)
      .select()
      .single()
    return { data: result, error }
  }

  async function updateSchedule(id: string, data: Partial<InterviewSchedule>) {
    const { data: result, error } = await supabase
      .from('interview_schedules')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    return { data: result, error }
  }

  async function deleteSchedule(id: string) {
    const { error } = await supabase
      .from('interview_schedules')
      .delete()
      .eq('id', id)
    return { error }
  }

  async function sendPreMaterials(id: string) {
    const { error } = await supabase
      .from('interview_schedules')
      .update({
        pre_materials_sent: true,
        pre_materials_sent_at: new Date().toISOString(),
      })
      .eq('id', id)
    return { error }
  }

  return { createSchedule, updateSchedule, deleteSchedule, sendPreMaterials }
}
