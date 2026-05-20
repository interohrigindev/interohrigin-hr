/**
 * Cloudflare Pages Function — 연차 촉진 자동화 cron 엔드포인트
 * POST /api/cron-leave-promotion
 * Header: X-Cron-Secret: ${CRON_SECRET}
 *
 * 사용법:
 *  - 외부 cron 서비스 (e.g., cron-job.org, GitHub Actions) 에서 매일 호출
 *  - 또는 Cloudflare Workers Cron Triggers 설정
 *
 * 환경변수 (Cloudflare Pages Settings):
 *   CRON_SECRET                — 무단 호출 방지용 비밀 토큰
 *   VITE_SUPABASE_URL          — Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service Role Key
 */

interface Env {
  CRON_SECRET?: string
  VITE_SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
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

export const onRequestOptions = () =>
  new Response(null, { status: 204, headers: CORS_HEADERS })

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env

  // 인증
  const secret = ctx.request.headers.get('X-Cron-Secret')
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase 서비스 키 미설정' }, 500)
  }

  // run_leave_promotion_automation RPC 호출 (service role)
  const rpcRes = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/run_leave_promotion_automation`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_dry_run: false }),
  })

  if (!rpcRes.ok) {
    const err = await rpcRes.text()
    return jsonResponse({ error: 'RPC 호출 실패', detail: err }, 500)
  }

  const rows = (await rpcRes.json()) as any[]
  const sent6m = rows.filter((r) => r.stage === '6m').length
  const forced2m = rows.filter((r) => r.stage === '2m').length

  return jsonResponse({
    ok: true,
    executed_at: new Date().toISOString(),
    summary: { sent_6m: sent6m, forced_2m: forced2m, total: rows.length },
    details: rows,
  })
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'OPTIONS') return onRequestOptions()
  if (ctx.request.method === 'POST') return onRequestPost(ctx)
  return new Response('Method not allowed', { status: 405 })
}
