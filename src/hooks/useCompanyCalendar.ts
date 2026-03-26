import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ─── Types ───────────────────────────────────────────────────────

export type EventType = 'meeting' | 'interview' | 'company' | 'holiday' | 'training' | 'leave'

export interface CompanyEvent {
  id: string
  title: string
  description: string | null
  event_type: EventType
  start_datetime: string
  end_datetime: string | null
  all_day: boolean
  participants: string[]
  department_id: string | null
  color: string | null
  external_calendar_id: string | null
  external_source: string | null
  sync_status: string
  linked_candidate_id: string | null
  linked_project_id: string | null
  linked_leave_request_id: string | null
  recurrence_rule: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // joined
  creator_name?: string
}

export const EVENT_TYPE_MAP: Record<EventType, { label: string; color: string; bgColor: string }> = {
  meeting: { label: '회의', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  interview: { label: '면접', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  company: { label: '회사 행사', color: 'text-brand-700', bgColor: 'bg-brand-100' },
  holiday: { label: '공휴일', color: 'text-red-700', bgColor: 'bg-red-100' },
  training: { label: '교육', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  leave: { label: '휴가', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
}

export const EVENT_COLORS: Record<EventType, string> = {
  meeting: '#3B82F6',
  interview: '#8B5CF6',
  company: '#7C3AED',
  holiday: '#EF4444',
  training: '#F59E0B',
  leave: '#10B981',
}

// ─── Google Calendar helpers ─────────────────────────────────────

interface GoogleEvent {
  id: string
  title: string
  description: string
  start: string
  end: string
  allDay: boolean
  meetLink: string | null
  attendees: string[]
  htmlLink: string
}

async function fetchGoogleEvents(timeMin: string, timeMax: string): Promise<GoogleEvent[]> {
  try {
    const res = await fetch('/api/google-calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', timeMin, timeMax }),
    })
    if (!res.ok) return []
    const data = await res.json() as any
    return data.events || []
  } catch {
    return []
  }
}

async function pushToGoogle(event: {
  summary: string
  description?: string
  startTime: string
  endTime?: string
  allDay?: boolean
  attendees?: string[]
}): Promise<{ eventId?: string; error?: string }> {
  try {
    const res = await fetch('/api/google-calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', ...event }),
    })
    return await res.json() as any
  } catch {
    return { error: 'Google Calendar 연동 실패' }
  }
}

// ─── Hook ────────────────────────────────────────────────────────

export function useCompanyCalendar() {
  const { profile } = useAuth()
  const [events, setEvents] = useState<CompanyEvent[]>([])
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [googleConnected, setGoogleConnected] = useState(false)

  // Check if Google is connected via integration_settings
  useEffect(() => {
    async function checkGoogle() {
      const { data } = await supabase
        .from('integration_settings')
        .select('id')
        .eq('provider', 'google')
        .eq('is_active', true)
        .limit(1)
      setGoogleConnected(!!data?.length)
    }
    checkGoogle()
  }, [])

  // ─── Fetch events ────────────────────────────────────────────
  const fetchEvents = useCallback(async (rangeStart: string, rangeEnd: string) => {
    setLoading(true)
    try {
      // 1. Internal events
      const { data, error } = await supabase
        .from('company_events')
        .select('*, creator:employees!created_by(name)')
        .gte('start_datetime', rangeStart)
        .lte('start_datetime', rangeEnd)
        .order('start_datetime', { ascending: true })

      if (error) throw error

      const internal = (data || []).map((e: any) => ({
        ...e,
        creator_name: e.creator?.name || '',
      }))
      setEvents(internal)

      // 2. Google Calendar events (if connected)
      if (googleConnected) {
        const gEvents = await fetchGoogleEvents(rangeStart, rangeEnd)
        setGoogleEvents(gEvents)
      }
    } catch (err) {
      console.error('캘린더 이벤트 조회 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [googleConnected])

  // ─── Create event ────────────────────────────────────────────
  const createEvent = async (data: {
    title: string
    description?: string
    event_type: EventType
    start_datetime: string
    end_datetime?: string
    all_day?: boolean
    participants?: string[]
    department_id?: string
    color?: string
    syncToGoogle?: boolean
  }) => {
    if (!profile) return null

    let externalId: string | undefined
    let syncStatus = 'local_only'

    // Push to Google if requested
    if (data.syncToGoogle && googleConnected) {
      const result = await pushToGoogle({
        summary: data.title,
        description: data.description,
        startTime: data.start_datetime,
        endTime: data.end_datetime,
        allDay: data.all_day,
      })
      if (result.eventId) {
        externalId = result.eventId
        syncStatus = 'synced'
      }
    }

    const { data: result, error } = await supabase
      .from('company_events')
      .insert({
        title: data.title,
        description: data.description || null,
        event_type: data.event_type,
        start_datetime: data.start_datetime,
        end_datetime: data.end_datetime || null,
        all_day: data.all_day || false,
        participants: data.participants || [],
        department_id: data.department_id || null,
        color: data.color || EVENT_COLORS[data.event_type] || null,
        external_calendar_id: externalId || null,
        external_source: externalId ? 'google' : null,
        sync_status: syncStatus,
        created_by: profile.id,
      })
      .select()
      .single()

    if (error) throw error
    return result
  }

  // ─── Update event ────────────────────────────────────────────
  const updateEvent = async (id: string, data: Partial<CompanyEvent>) => {
    const { error } = await supabase
      .from('company_events')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  }

  // ─── Delete event ────────────────────────────────────────────
  const deleteEvent = async (id: string) => {
    // Optionally delete from Google too
    const target = events.find(e => e.id === id)
    if (target?.external_calendar_id && googleConnected) {
      await fetch('/api/google-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', eventId: target.external_calendar_id }),
      }).catch(() => {})
    }

    const { error } = await supabase
      .from('company_events')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  return {
    events,
    googleEvents,
    loading,
    googleConnected,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  }
}
