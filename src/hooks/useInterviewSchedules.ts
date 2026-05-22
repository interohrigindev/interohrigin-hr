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

    const { data } = await query
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
      .select('*, candidates(name, status, position, job_postings(title))')
      .order('scheduled_at', { ascending: true })

    if (dateFrom) query = query.gte('scheduled_at', dateFrom)
    if (dateTo) query = query.lte('scheduled_at', dateTo)

    const { data } = await query
    if (data) {
      setSchedules(
        data.map((s: any) => {
          const cand = s.candidates
          const posting = cand?.job_postings
          return {
            ...s,
            candidate_name: cand?.name || '알 수 없음',
            candidate_status: cand?.status ?? null,
            candidate_position: cand?.position ?? null,
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
