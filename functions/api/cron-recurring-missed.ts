/**
 * Cloudflare Pages Function — 반복업무 미진행 알림 cron 엔드포인트 (PDCA #5)
 * POST /api/cron-recurring-missed
 * Header: X-Cron-Secret: ${CRON_SECRET}
 *
 * 흐름 (Design §4.1, FR-07):
 *   외부 cron 1일 1회(예: KST 익일 오전) 호출
 *   → pick_recurring_missed() RPC (service_role): 발생일 경과 미완료 → status='missed' 전이 +
 *      미통지분 마킹 후 본인 알림 대상 반환
 *   → 본인 + 관리자(role IN director/division_head/ceo/admin/hr_admin)에게 /api/send-email
 *
 * 패턴: cron-recurring-reminder.ts / cron-leave-promotion.ts 동일 (X-Cron-Secret + service_role).
 *
 * 환경변수: CRON_SECRET, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

interface Env {
  CRON_SECRET?: string
  VITE_SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface MissedRow {
  occurrence_id: string
  template_id: string
  occurrence_date: string
  title: string
  assignee_id: string
  assignee_name: string
  assignee_email: string
}

interface AdminRow { email: string }

const ADMIN_ROLES = ['director', 'division_head', 'ceo', 'admin', 'hr_admin']

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

function formatKDate(iso: string): string {
  return iso.replace(/-/g, '.')
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// 미진행 알림 HTML. forSelf=true 면 본인 톤, false 면 관리자 통보 톤.
function buildMissedHtml(row: MissedRow, forSelf: boolean): { subject: string; html: string } {
  const dateK = formatKDate(row.occurrence_date)
  const lead = forSelf
    ? `<strong>${esc(row.assignee_name)}</strong>님, ${dateK} 예정된 반복업무가 미진행 상태입니다.`
    : `<strong>${esc(row.assignee_name)}</strong>님의 ${dateK} 반복업무가 미진행 상태로 확인되어 통보드립니다.`
  return {
    subject: `[인터오리진아이앤씨] 반복업무 미진행 알림 (${dateK}) — ${esc(row.title)}`,
    html: `
<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(135deg,#6B3FA0,#4A2C6F);padding:28px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:20px;margin:0;letter-spacing:1px;">Interohrigin I&amp;C</h1>
      <p style="color:#d8b4fe;font-size:12px;margin:4px 0 0;">반복업무 미진행 알림</p>
    </div>
    <div style="padding:32px 28px;">
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">${lead}</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:24px;margin:20px 0;">
        <p style="font-size:13px;color:#dc2626;margin:0 0 8px;font-weight:bold;">⚠️ 미진행 반복업무</p>
        <p style="font-size:16px;color:#1f2937;margin:0 0 8px;font-weight:bold;">${esc(row.title)}</p>
        <table style="width:100%;font-size:14px;color:#374151;">
          <tr><td style="padding:4px 0;color:#6b7280;">담당자</td>
              <td style="padding:4px 0;text-align:right;font-weight:bold;">${esc(row.assignee_name)}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;">발생일</td>
              <td style="padding:4px 0;text-align:right;font-weight:bold;">${dateK}</td></tr>
        </table>
      </div>
      <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:24px 0 0;">
        HR 플랫폼 &gt; 프로젝트&amp;업무 &gt; 반복업무에서 상태를 확인해 주세요.
      </p>
    </div>
    <div style="background:#f9fafb;padding:20px 28px;border-top:1px solid #e5e7eb;">
      <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
        본 메일은 인터오리진아이앤씨 HR 시스템에서 자동 발송되었습니다.
      </p>
    </div>
  </div>
</body></html>`.trim(),
  }
}

export const onRequestOptions = () =>
  new Response(null, { status: 204, headers: CORS_HEADERS })

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env

  const secret = ctx.request.headers.get('X-Cron-Secret')
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase 서비스 키 미설정' }, 500)
  }

  const supaHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }

  // 1) pick_recurring_missed RPC — missed 전이 + 미통지 마킹 + 본인 대상 반환
  const rpcRes = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/pick_recurring_missed`, {
    method: 'POST', headers: supaHeaders, body: '{}',
  })
  if (!rpcRes.ok) {
    return jsonResponse({ error: 'RPC 호출 실패', detail: await rpcRes.text() }, 500)
  }
  const rows = (await rpcRes.json()) as MissedRow[]

  if (rows.length === 0) {
    return jsonResponse({ ok: true, executed_at: new Date().toISOString(), summary: { missed: 0, sent: 0 } })
  }

  // 2) 관리자 수신자 조회 (role IN ... + active + email)
  const adminUrl = `${env.VITE_SUPABASE_URL}/rest/v1/employees`
    + `?select=email&is_active=eq.true&email=not.is.null`
    + `&role=in.(${ADMIN_ROLES.join(',')})`
  const adminRes = await fetch(adminUrl, { headers: supaHeaders })
  const admins = adminRes.ok ? ((await adminRes.json()) as AdminRow[]) : []
  const adminEmails = [...new Set(admins.map((a) => a.email).filter(Boolean))]

  // 3) 발송 — 본인 1건 + 관리자 전원. (중복 방지: 관리자가 본인이면 본인 메일만)
  const origin = new URL(ctx.request.url).origin
  let sent = 0
  const failures: string[] = []

  async function send(to: string, subject: string, html: string) {
    try {
      const r = await fetch(`${origin}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, html }),
      })
      if (r.ok) sent++
      else failures.push(`${to}: ${await r.text()}`)
    } catch (e) {
      failures.push(`${to}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  for (const row of rows) {
    // 본인
    if (row.assignee_email) {
      const self = buildMissedHtml(row, true)
      await send(row.assignee_email, self.subject, self.html)
    }
    // 관리자 (본인과 동일 이메일 제외)
    const mgr = buildMissedHtml(row, false)
    for (const email of adminEmails) {
      if (email === row.assignee_email) continue
      await send(email, mgr.subject, mgr.html)
    }
  }

  return jsonResponse({
    ok: true,
    executed_at: new Date().toISOString(),
    summary: { missed: rows.length, admin_recipients: adminEmails.length, sent, failed: failures.length },
    failures,
  })
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'OPTIONS') return onRequestOptions()
  if (ctx.request.method === 'POST') return onRequestPost(ctx)
  return new Response('Method not allowed', { status: 405 })
}
