// 법적 리스크 대응 P1-1 — 연장근로 RPC 호출 헬퍼

import { supabase } from '@/lib/supabase'

export async function requestOvertime(args: {
  requestDate: string                // YYYY-MM-DD
  startAtPlanned: string             // ISO
  endAtPlanned: string
  reason: string
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('request_overtime', {
    p_request_date: args.requestDate,
    p_start_at_planned: args.startAtPlanned,
    p_end_at_planned: args.endAtPlanned,
    p_reason: args.reason,
  })
  if (error) return { error: error.message }
  return { id: data as string }
}

export async function decideOvertime(args: {
  requestId: string
  decision: 'approved' | 'rejected'
  comment?: string
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('decide_overtime', {
    p_request_id: args.requestId,
    p_decision: args.decision,
    p_comment: args.comment ?? null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function recordOvertimeActual(args: {
  requestId?: string | null
  actualStartAt: string
  actualEndAt: string
  notes?: string
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('record_overtime_actual', {
    p_request_id: args.requestId ?? null,
    p_actual_start_at: args.actualStartAt,
    p_actual_end_at: args.actualEndAt,
    p_notes: args.notes ?? null,
  })
  if (error) return { error: error.message }
  return { id: data as string }
}

export async function cancelOvertimeRequest(args: {
  requestId: string
  reason: string
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('cancel_overtime_request', {
    p_request_id: args.requestId,
    p_reason: args.reason,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
