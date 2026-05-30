/**
 * Cloudflare Pages Function — KakaoWork 메시지 발송
 * POST /api/send-kakaowork
 * Body: { recipient_uid, title, body, link? }
 *
 * Design Ref: §7.2 — Bot API 채택 (1:1 DM 필요)
 * Plan SC: Phase 7 plug-and-play. 토큰/매핑 없으면 자동 skip (다른 채널 영향 0)
 *
 * KakaoWork API:
 *   POST https://api.kakaowork.com/v1/conversations.open  body: { user_id }
 *   POST https://api.kakaowork.com/v1/messages.send_by    body: { conversation_id, text, blocks }
 *   Authorization: Bearer ${kakaowork_app_key}
 *
 * 환경변수:
 *   VITE_SUPABASE_URL          — Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service Role Key (channel_configs, employee_kakaowork_map 조회용)
 *
 * 토큰은 DB notification_channel_configs.kakaowork_app_key 에서 동적 조회.
 * (환경변수 X — 운영 중 토큰 교체 시 마이그/배포 불요)
 */

interface Env {
  VITE_SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface ReqBody {
  recipient_uid: string
  title: string
  body: string
  link?: string
}

interface ChannelConfig {
  kakaowork_app_key: string | null
  kakaowork_enabled: boolean
}

interface KakaoMapRow {
  kakaowork_user_id: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const KAKAOWORK_API = 'https://api.kakaowork.com/v1'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS_HEADERS })

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const env = ctx.env
    if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: 'Supabase 서비스 키 미설정' }, 500)
    }

    const body = (await ctx.request.json()) as ReqBody
    if (!body.recipient_uid) return jsonResponse({ error: 'recipient_uid 필수' }, 400)
    if (!body.title) return jsonResponse({ error: 'title 필수' }, 400)

    const sbHeaders = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    }
    const baseUrl = env.VITE_SUPABASE_URL

    // [1] 채널 설정 조회 — 비활성 or 토큰 없으면 skip
    const cfgRes = await fetch(
      `${baseUrl}/rest/v1/notification_channel_configs?config_key=eq.default&select=kakaowork_app_key,kakaowork_enabled`,
      { headers: sbHeaders },
    )
    if (!cfgRes.ok) {
      return jsonResponse({ error: 'channel_configs 조회 실패' }, 500)
    }
    const cfgs = (await cfgRes.json()) as ChannelConfig[]
    const cfg = cfgs[0]
    if (!cfg || !cfg.kakaowork_enabled || !cfg.kakaowork_app_key) {
      return jsonResponse({ skipped: true, reason: 'kakaowork-disabled' })
    }
    const appKey = cfg.kakaowork_app_key

    // [2] employee_kakaowork_map 에서 kakaowork_user_id lookup
    const mapRes = await fetch(
      `${baseUrl}/rest/v1/employee_kakaowork_map?employee_id=eq.${body.recipient_uid}&select=kakaowork_user_id`,
      { headers: sbHeaders },
    )
    if (!mapRes.ok) {
      return jsonResponse({ error: 'map 조회 실패' }, 500)
    }
    const maps = (await mapRes.json()) as KakaoMapRow[]
    if (!maps[0]?.kakaowork_user_id) {
      return jsonResponse({ skipped: true, reason: 'no-mapping' })
    }
    const kakaoUserId = maps[0].kakaowork_user_id

    // [3] conversations.open — 1:1 DM 채팅방 (이미 있으면 그 채팅방 반환)
    const openRes = await fetch(`${KAKAOWORK_API}/conversations.open`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: Number(kakaoUserId) }),
    })
    const openJson: any = await openRes.json().catch(() => ({}))
    if (!openRes.ok || !openJson?.success) {
      return jsonResponse({
        error: 'conversations.open 실패',
        status: openRes.status,
        detail: openJson,
      }, 502)
    }
    const conversationId: number | string | undefined = openJson.conversation?.id
    if (!conversationId) {
      return jsonResponse({ error: 'conversation.id 누락', detail: openJson }, 502)
    }

    // [4] messages.send_by — blocks 구성
    const blocks: any[] = [
      {
        type: 'header',
        text: body.title,
        style: 'blue',
      },
      {
        type: 'text',
        text: body.body,
        markdown: false,
      },
    ]
    if (body.link) {
      blocks.push({
        type: 'button',
        text: '결재 페이지로 이동',
        style: 'default',
        action_type: 'open_system_browser',
        value: body.link,
      })
    }

    const sendRes = await fetch(`${KAKAOWORK_API}/messages.send_by`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        text: body.title,
        blocks,
      }),
    })
    const sendJson: any = await sendRes.json().catch(() => ({}))
    if (!sendRes.ok || !sendJson?.success) {
      return jsonResponse({
        error: 'messages.send_by 실패',
        status: sendRes.status,
        detail: sendJson,
      }, 502)
    }

    return jsonResponse({
      sent: true,
      conversation_id: conversationId,
      message_id: sendJson.message?.id,
    })
  } catch (err: any) {
    return jsonResponse({ error: err?.message || '발송 실패' }, 500)
  }
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'OPTIONS') return onRequestOptions()
  if (ctx.request.method === 'POST') return onRequestPost(ctx)
  return new Response('Method not allowed', { status: 405 })
}
