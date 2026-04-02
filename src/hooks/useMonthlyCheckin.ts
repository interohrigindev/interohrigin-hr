import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { MonthlyCheckin, CheckinTag, CheckinStatus, CheckinNote } from '@/types/employee-lifecycle'

export function useMonthlyCheckin(year?: number, month?: number) {
  const { profile } = useAuth()

  const [checkins, setCheckins] = useState<MonthlyCheckin[]>([])
  const [myCheckin, setMyCheckin] = useState<MonthlyCheckin | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)

    // Fetch all checkins (admin/leader sees all, employee sees own)
    let query = supabase.from('monthly_checkins').select('*').order('created_at', { ascending: false })
    if (year) query = query.eq('year', year)
    if (month) query = query.eq('month', month)

    const { data } = await query
    setCheckins((data || []) as MonthlyCheckin[])

    // Fetch own checkin for selected period
    if (year && month) {
      const { data: mine } = await supabase
        .from('monthly_checkins')
        .select('*')
        .eq('employee_id', profile.id)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle()
      setMyCheckin(mine as MonthlyCheckin | null)
    }

    setLoading(false)
  }, [profile?.id, year, month])

  useEffect(() => { fetchData() }, [fetchData])

  async function save(data: {
    tag: CheckinTag
    content: string
    project_name?: string
    special_notes?: CheckinNote[]
    status?: CheckinStatus
  }): Promise<{ error: string | null }> {
    if (!profile?.id || !year || !month) return { error: '필수 정보가 없습니다' }
    setSaving(true)

    const row = {
      employee_id: profile.id,
      year,
      month,
      tag: data.tag,
      content: data.content || null,
      project_name: data.project_name || null,
      special_notes: data.special_notes || [],
      status: data.status || 'draft',
    }

    const { error } = await supabase
      .from('monthly_checkins')
      .upsert(row, { onConflict: 'employee_id,year,month' })

    setSaving(false)
    if (error) return { error: error.message }
    await fetchData()
    return { error: null }
  }

  async function submit(data: {
    tag: CheckinTag
    content: string
    project_name?: string
    special_notes?: CheckinNote[]
  }): Promise<{ error: string | null }> {
    return save({ ...data, status: 'submitted' })
  }

  async function addFeedback(
    checkinId: string,
    feedbackType: 'leader_feedback' | 'exec_feedback' | 'ceo_feedback',
    feedback: string,
    nextStatus: CheckinStatus
  ): Promise<{ error: string | null }> {
    setSaving(true)
    const { error } = await supabase
      .from('monthly_checkins')
      .update({ [feedbackType]: feedback, status: nextStatus })
      .eq('id', checkinId)

    setSaving(false)
    if (error) return { error: error.message }
    await fetchData()
    return { error: null }
  }

  return {
    checkins,
    myCheckin,
    loading,
    saving,
    save,
    submit,
    addFeedback,
    refresh: fetchData,
  }
}
