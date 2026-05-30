/**
 * Cloudflare Pages Function — 예약 시작 30분 전 리마인더 cron
 * POST /api/cron-booking-reminders
 * Header: X-Cron-Secret: ${CRON_SECRET}
 *
 * 처리 대상 (mall 스키마):
 *  1) healthkeeper_bookings (status='confirmed', NOT cancelled) — slot.start_at 25~35분 전
 *  2) resource_bookings (status='approved') — start_at 25~35분 전
 *
 * 채널: in_app + push (이메일 제외 — 빈번하면 피로)
 * Dedupe: notification_deliveries.related_entity_id = booking.id 로 1회만 발송
 *
 * 권장 cron 빈도: 매 5분 (`*/5 * * * *`) — Cloudflare Worker(cron-router) 에 등록
 *
 * 환경변수:
 *   CRON_SECRET                — 무단 호출 방지
 *   VITE_SUPABASE_URL          — Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service Role Key (RLS bypass + mall 스키마 접근)
 */

interface Env {
  CRON_SECRET?: string
  VITE_SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface HealthkeeperBookingRow {
  id: string
  employee_id: string
  slot: { start_at: string; healthkeeper: { name: string } | null } | null
}

interface ResourceBookingRow {
  id: string
  employee_id: string
  start_at: string
  purpose: string | null
  resource: { name: string; category_id: string | null } | null
}

interface DeliveryDedup {
  related_entity_id: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Secret',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function formatKstTime(iso: string): string {
  const d = new Date(iso)
  // KST (UTC+9)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS_HEADERS })

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env

  const secret = ctx.request.headers.get('X-Cron-Secret')
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase 서비스 키 미설정' }, 500)
  }

  const baseUrl = env.VITE_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const sbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
  // mall 스키마 접근 (PostgREST Accept-Profile)
  const mallHeaders = { ...sbHeaders, 'Accept-Profile': 'mall' }
  // notification_deliveries 는 public 스키마
  const publicHeaders = sbHeaders

  // 시간 윈도우: now + 25분 ~ now + 35분 (시작 30분 전 ±5분)
  const now = new Date()
  const windowStart = new Date(now.getTime() + 25 * 60 * 1000).toISOString()
  const windowEnd = new Date(now.getTime() + 35 * 60 * 1000).toISOString()

  const results: Array<{
    kind: 'healthkeeper' | 'resource'
    bookingId: string
    uid: string
    in_app?: string
    push?: string
    skipped?: string
  }> = []

  // ───────── 1) 헬스키퍼 부킹 ─────────
  // bookings JOIN slots (start_at) JOIN healthkeepers (name)
  const hkUrl =
    `${baseUrl}/rest/v1/healthkeeper_bookings` +
    `?select=id,employee_id,slot:healthkeeper_slots(start_at,healthkeeper:healthkeepers(name))` +
    `&status=eq.confirmed&cancelled_at=is.null`
  const hkRes = await fetch(hkUrl, { headers: mallHeaders })
  const hkRows: HealthkeeperBookingRow[] = hkRes.ok ? await hkRes.json() : []
  const hkInWindow = hkRows.filter((b) => {
    const t = b.slot?.start_at
    if (!t) return false
    return t >= windowStart && t < windowEnd
  })

  // ───────── 2) 자원 부킹 ─────────
  const rsUrl =
    `${baseUrl}/rest/v1/resource_bookings` +
    `?select=id,employee_id,start_at,purpose,resource:resources(name,category_id)` +
    `&status=eq.approved` +
    `&start_at=gte.${encodeURIComponent(windowStart)}` +
    `&start_at=lt.${encodeURIComponent(windowEnd)}`
  const rsRes = await fetch(rsUrl, { headers: mallHeaders })
  const rsRows: ResourceBookingRow[] = rsRes.ok ? await rsRes.json() : []

  // ───────── 중복 발송 방지 (related_entity_id 기준) ─────────
  const allBookingIds = [...hkInWindow.map((b) => b.id), ...rsRows.map((b) => b.id)]
  const alreadyNotified = new Set<string>()
  if (allBookingIds.length > 0) {
    const dedupeUrl =
      `${baseUrl}/rest/v1/notification_deliveries` +
      `?select=related_entity_id` +
      `&related_entity_type=in.(healthkeeper_booking,resource_booking)` +
      `&related_entity_id=in.(${allBookingIds.map((id) => `"${id}"`).join(',')})`
    const dedupeRes = await fetch(dedupeUrl, { headers: publicHeaders })
    if (dedupeRes.ok) {
      const rows: DeliveryDedup[] = await dedupeRes.json()
      rows.forEach((r) => alreadyNotified.add(r.related_entity_id))
    }
  }

  // ───────── 발송 헬퍼 ─────────
  async function sendInApp(uid: string, subject: string, body: string, relatedType: string, relatedId: string) {
    const res = await fetch(`${baseUrl}/rest/v1/notification_deliveries`, {
      method: 'POST',
      headers: { ...publicHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        channel: 'in_app',
        recipient_uid: uid,
        subject,
        payload: { body, url: '/' },
        status: 'sent',
        related_entity_type: relatedType,
        related_entity_id: relatedId,
        sent_at: new Date().toISOString(),
      }),
    })
    return res.ok ? 'sent' : `failed:${res.status}`
  }

  async function sendPush(uid: string, title: string, body: string, url = '/') {
    try {
      const baseOrigin = new URL(baseUrl).origin.replace('.supabase.co', '')
      // send-push 는 같은 Pages Functions 의 /api/send-push 호출
      // 절대 URL 필요: ctx.request.url 의 origin 사용
      const origin = new URL(ctx.request.url).origin
      const res = await fetch(`${origin}/api/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_uid: uid, title, body, url }),
      })
      void baseOrigin
      return res.ok ? 'sent' : `failed:${res.status}`
    } catch (err) {
      return `error:${(err as Error).message.slice(0, 60)}`
    }
  }

  // ───────── 헬스키퍼 발송 ─────────
  for (const b of hkInWindow) {
    if (alreadyNotified.has(b.id)) {
      results.push({ kind: 'healthkeeper', bookingId: b.id, uid: b.employee_id, skipped: 'already_notified' })
      continue
    }
    const tm = b.slot ? formatKstTime(b.slot.start_at) : ''
    const hk = b.slot?.healthkeeper?.name || '담당자'
    const subject = '🏥 헬스키퍼 예약 30분 전 안내'
    const body = `오늘 ${tm} ${hk} 헬스키퍼 예약이 곧 시작됩니다. 노쇼 방지를 위해 시간 맞춰 방문해주세요.`
    const inApp = await sendInApp(b.employee_id, subject, body, 'healthkeeper_booking', b.id)
    const push = await sendPush(b.employee_id, subject, body)
    results.push({ kind: 'healthkeeper', bookingId: b.id, uid: b.employee_id, in_app: inApp, push })
  }

  // ───────── 자원예약 발송 ─────────
  for (const b of rsRows) {
    if (alreadyNotified.has(b.id)) {
      results.push({ kind: 'resource', bookingId: b.id, uid: b.employee_id, skipped: 'already_notified' })
      continue
    }
    const tm = formatKstTime(b.start_at)
    const name = b.resource?.name || '예약 자원'
    const cat = b.resource?.category_id || ''
    const purposeStr = b.purpose ? ` (${b.purpose})` : ''
    const subject = `📅 ${name} 예약 30분 전 안내`
    const body = `오늘 ${tm} ${cat ? `[${cat}] ` : ''}${name} 예약이 곧 시작됩니다${purposeStr}. 시간 맞춰 사용 부탁드립니다.`
    const inApp = await sendInApp(b.employee_id, subject, body, 'resource_booking', b.id)
    const push = await sendPush(b.employee_id, subject, body)
    results.push({ kind: 'resource', bookingId: b.id, uid: b.employee_id, in_app: inApp, push })
  }

  return jsonResponse({
    windowStart,
    windowEnd,
    healthkeeperScanned: hkInWindow.length,
    resourceScanned: rsRows.length,
    skippedDuplicates: results.filter((r) => r.skipped).length,
    sent: results.filter((r) => !r.skipped).length,
    results,
  })
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'OPTIONS') return onRequestOptions()
  if (ctx.request.method === 'POST') return onRequestPost(ctx)
  return jsonResponse({ error: 'method_not_allowed' }, 405)
}
