/**
 * INTEROHRIGIN — 통합 Cron 라우터 Worker
 *
 * 여러 서비스(HR/Finance/CS/Mall ...)의 매일 cron 호출을 하나의 Worker 가 담당.
 * - 각 cron 시각마다 분기 → 해당 서비스 endpoint 로 HTTPS POST + X-Cron-Secret 헤더
 * - 새 서비스 cron 추가는 ROUTES 에 1줄 + wrangler.toml [triggers].crons 에 1줄
 *
 * Cron 등록:
 *  wrangler.toml [triggers].crons (UTC 시각)
 *
 * 환경변수 (Worker Settings → Variables and Secrets):
 *  CRON_SECRET — 호출 대상 서비스가 검증하는 비밀키 (각 서비스가 같은 값 사용)
 *
 * 디버깅:
 *  GET https://<worker-url>?cron=<expr>&secret=<CRON_SECRET>  → 해당 cron 즉시 수동 실행
 *  GET https://<worker-url>?secret=<CRON_SECRET>              → 등록된 routes 목록 반환
 */

export interface Env {
  CRON_SECRET: string
}

/**
 * cron expression → 호출할 서비스 endpoint URL.
 * 새 서비스 추가 시 이 객체에 1줄 + wrangler.toml [triggers].crons 에 같은 expression 추가.
 */
const ROUTES: Record<string, string> = {
  // HR — 매일 KST 08:30 (UTC 23:30 전일) 미결재 결재 리마인더
  '30 23 * * *': 'https://hr.interohrigin.com/api/cron-pending-approval-reminder',

  // HR — 매 5분, 예약 시작 30분 전 리마인더 (헬스키퍼 + 회의실/스튜디오/차량 등 자원예약)
  '*/5 * * * *': 'https://hr.interohrigin.com/api/cron-booking-reminders',

  // HR — 매일 KST 08:00 (UTC 23:00 전일), 수습평가 D-day 평가자 알림
  '0 23 * * *': 'https://hr.interohrigin.com/api/cron-probation-dday',

  // 예시 (향후 도입 시 주석 해제 + wrangler.toml 에도 같은 expr 추가):
  // '0 0 * * *':  'https://finance.interohrigin.com/api/cron-daily-close',     // KST 09:00 — Finance 일일 마감
  // '0 23 * * *': 'https://cs.interohrigin.com/api/cron-pending-tickets',      // KST 08:00 — CS 미처리 티켓
  // '0 1 * * *':  'https://mall.interohrigin.com/api/cron-order-check',        // KST 10:00 — Mall 주문 점검
}

async function callEndpoint(cron: string, env: Env): Promise<{ status: number; body: string }> {
  const url = ROUTES[cron]
  if (!url) return { status: 0, body: `no route for cron: ${cron}` }
  if (!env.CRON_SECRET) return { status: 0, body: 'CRON_SECRET not set' }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Cron-Secret': env.CRON_SECRET,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    const body = await res.text().catch(() => '')
    return { status: res.status, body: body.slice(0, 500) }
  } catch (err) {
    return { status: 0, body: `fetch error: ${(err as Error).message}` }
  }
}

export default {
  /** Cron Triggers 가 호출하는 진입점 — Cloudflare 가 지정 시각에 자동 실행 */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = event.cron
    console.log(`[cron-router] scheduled: ${cron} @ ${new Date(event.scheduledTime).toISOString()}`)
    const result = await callEndpoint(cron, env)
    if (result.status >= 200 && result.status < 300) {
      console.log(`[cron-router] OK ${cron} → ${result.status}`)
    } else {
      console.error(`[cron-router] FAIL ${cron} → status=${result.status} body=${result.body}`)
    }
  },

  /**
   * 수동 트리거(디버깅) HTTP 핸들러.
   * - `?secret=...` 만: 등록된 routes 목록 반환
   * - `?secret=...&cron=...`: 해당 cron 즉시 실행
   * 브라우저로 접근 시 CRON_SECRET 검증으로 무단 호출 차단.
   */
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const secret = req.headers.get('X-Cron-Secret') || url.searchParams.get('secret')
    if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
      return new Response('forbidden', { status: 403 })
    }

    const cron = url.searchParams.get('cron')
    if (!cron) {
      return Response.json({
        message: 'cron-router OK',
        registered_routes: Object.keys(ROUTES).map((c) => ({ cron: c, target: ROUTES[c] })),
        usage: 'GET ?secret=...&cron=<expr> → 해당 cron 수동 실행',
      })
    }

    const result = await callEndpoint(cron, env)
    return Response.json({ cron, target: ROUTES[cron] || null, status: result.status, body: result.body })
  },
}
