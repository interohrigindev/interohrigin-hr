/**
 * Cloudflare Pages Function — 반복업무 전날 알림 cron 엔드포인트 (PDCA #5)
 * POST /api/cron-recurring-reminder
 * Header: X-Cron-Secret: ${CRON_SECRET}
 *
 * 흐름 (Design §4.1):
 *   외부 cron(cron-job.org 등)이 30분(또는 매시간) 주기 호출
 *   → pick_recurring_reminders() RPC (service_role) → 내일 발생 + reminder_time 매칭 + 미발송분
 *      선별·마킹 후 담당자 이메일 포함 행 반환
 *   → 각 담당자에게 /api/send-email 로 전날 알림 발송
 *
 * 패턴: cron-leave-promotion.ts 와 동일 (X-Cron-Secret + service_role RPC).
 * 단, leave-promotion 은 RPC 가 row INSERT 만 하고 발송 없음 / 여기서는 RPC 결과를 받아 메일 발송.
 *
 * 환경변수 (Cloudflare Pages Settings):
 *   CRON_SECRET                — 무단 호출 방지 비밀 토큰
 *   VITE_SUPABASE_URL          — Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service Role Key
 *   (이메일은 send-email.ts 가 GMAIL_* 사용 — 본 함수는 /api/send-email 호출만)
 */

interface Env {
  CRON_SECRET?: string
  VITE_SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface ReminderRow {
  occurrence_id: string
  template_id: string
  occurrence_date: string
  title: string
  description: string | null
  assignee_id: string
  assignee_name: string
  assignee_email: string
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

// YYYY-MM-DD → YYYY.MM.DD (한국 표기)
function formatKDate(iso: string): string {
  return iso.replace(/-/g, '.')
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// 전날 알림 이메일 HTML (브랜드 보라 #6B3FA0 — email-templates.ts 패턴 동일,
//  단 client 모듈은 import.meta.env 의존이라 CF Function 에서 inline 재구성)
function buildReminderHtml(row: ReminderRow): { subject: string; html: string } {
  const dateK = formatKDate(row.occurrence_date)
  const desc = row.description
    ? `<p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 8px;">${esc(row.description)}</p>`
    : ''
  return {
    subject: `[인터오리진아이앤씨] ${row.assignee_name}님, 내일(${dateK}) 반복업무 안내`,
    html: `
<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(135deg,#6B3FA0,#4A2C6F);padding:28px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:20px;margin:0;letter-spacing:1px;">Interohrigin I&amp;C</h1>
      <p style="color:#d8b4fe;font-size:12px;margin:4px 0 0;">반복업무 알림</p>
    </div>
    <div style="padding:32px 28px;">
      <p style="font-size:15px;color:#1f2937;margin:0 0 16px;"><strong>${esc(row.assignee_name)}</strong>님, 안녕하세요.</p>
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">
        내일(<strong>${dateK}</strong>) 예정된 반복업무를 안내드립니다.
      </p>
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:24px;margin:20px 0;">
        <p style="font-size:13px;color:#6B3FA0;margin:0 0 8px;font-weight:bold;">📌 반복업무</p>
        <p style="font-size:16px;color:#1f2937;margin:0 0 8px;font-weight:bold;">${esc(row.title)}</p>
        ${desc}
        <p style="font-size:13px;color:#6b7280;margin:8px 0 0;">발생일: ${dateK}</p>
      </div>
      <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:24px 0 0;">
        해당일에 HR 플랫폼 &gt; 프로젝트&amp;업무 &gt; 반복업무에서 진행여부를 체크해 주세요.
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

  // 1) pick_recurring_reminders RPC (service role) — 선별 + reminder_sent_at 마킹
  const rpcRes = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/pick_recurring_reminders`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!rpcRes.ok) {
    return jsonResponse({ error: 'RPC 호출 실패', detail: await rpcRes.text() }, 500)
  }
  const rows = (await rpcRes.json()) as ReminderRow[]

  // 2) 각 담당자에게 send-email (server-to-server, 같은 Pages 도메인)
  const origin = new URL(ctx.request.url).origin
  let sent = 0
  const failures: string[] = []
  for (const row of rows) {
    if (!row.assignee_email) continue
    const { subject, html } = buildReminderHtml(row)
    try {
      const mailRes = await fetch(`${origin}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: row.assignee_email, subject, html }),
      })
      if (mailRes.ok) sent++
      else failures.push(`${row.assignee_email}: ${await mailRes.text()}`)
    } catch (e) {
      failures.push(`${row.assignee_email}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  return jsonResponse({
    ok: true,
    executed_at: new Date().toISOString(),
    summary: { candidates: rows.length, sent, failed: failures.length },
    failures,
  })
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'OPTIONS') return onRequestOptions()
  if (ctx.request.method === 'POST') return onRequestPost(ctx)
  return new Response('Method not allowed', { status: 405 })
}
