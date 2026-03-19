/**
 * Cloudflare Pages Function — Slack API 프록시
 * POST body의 action 필드로 분기: verify | channels | messages
 * 토큰은 X-Integration-Token 헤더로 수신
 */

interface Env {}

interface SlackRequestBody {
  action: 'verify' | 'channels' | 'messages'
  channel_id?: string
  oldest?: string
  latest?: string
  cursor?: string
}

const SLACK_BASE = 'https://slack.com/api'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Integration-Token',
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  const token = request.headers.get('X-Integration-Token')
  if (!token) {
    return json({ ok: false, error: '토큰이 필요합니다' }, 401)
  }

  let body: SlackRequestBody
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: '잘못된 요청 형식입니다' }, 400)
  }

  try {
    switch (body.action) {
      case 'verify':
        return json(await verify(token))
      case 'channels':
        return json(await channels(token))
      case 'messages':
        if (!body.channel_id) {
          return json({ ok: false, error: 'channel_id가 필요합니다' }, 400)
        }
        return json(await messages(token, body.channel_id, body.oldest, body.latest))
      default:
        return json({ ok: false, error: '알 수 없는 action입니다' }, 400)
    }
  } catch (err: any) {
    return json({ ok: false, error: err.message || 'Slack API 호출 실패' }, 500)
  }
}

// ─── Slack API 호출 ──────────────────────────────────

async function slackFetch(method: string, token: string, params?: Record<string, string>) {
  const url = new URL(`${SLACK_BASE}/${method}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v)
    })
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  const data = await res.json() as any
  if (!data.ok) {
    throw new Error(data.error || `Slack API error: ${method}`)
  }
  return data
}

async function verify(token: string) {
  const data = await slackFetch('auth.test', token)
  return {
    ok: true,
    team: data.team,
    team_id: data.team_id,
    user: data.user,
  }
}

async function channels(token: string) {
  const data = await slackFetch('conversations.list', token, {
    types: 'public_channel,private_channel',
    exclude_archived: 'true',
    limit: '200',
  })

  const channels = (data.channels || []).map((ch: any) => ({
    id: ch.id,
    name: ch.name,
    is_private: ch.is_private,
    num_members: ch.num_members,
    topic: ch.topic?.value || '',
  }))

  return { ok: true, channels }
}

async function messages(
  token: string,
  channelId: string,
  oldest?: string,
  latest?: string,
) {
  const allMessages: any[] = []
  let cursor: string | undefined
  const userCache: Record<string, string> = {}

  // 페이지네이션 (최대 10 페이지 = ~2000 메시지)
  for (let page = 0; page < 10; page++) {
    const params: Record<string, string> = {
      channel: channelId,
      limit: '200',
    }
    if (oldest) params.oldest = oldest
    if (latest) params.latest = latest
    if (cursor) params.cursor = cursor

    const data = await slackFetch('conversations.history', token, params)

    for (const msg of data.messages || []) {
      // bot 메시지 스킵
      if (msg.subtype === 'bot_message' || msg.bot_id) continue

      // 사용자 이름 조회
      let userName = msg.user || 'unknown'
      if (msg.user && !userCache[msg.user]) {
        try {
          const userData = await slackFetch('users.info', token, { user: msg.user })
          userCache[msg.user] = userData.user?.real_name || userData.user?.name || msg.user
        } catch {
          userCache[msg.user] = msg.user
        }
      }

      allMessages.push({
        user: msg.user,
        user_name: userCache[msg.user] || userName,
        text: msg.text,
        ts: msg.ts,
        date: new Date(parseFloat(msg.ts) * 1000).toISOString(),
        thread_ts: msg.thread_ts,
      })
    }

    if (!data.has_more || !data.response_metadata?.next_cursor) break
    cursor = data.response_metadata.next_cursor
  }

  return { ok: true, messages: allMessages, count: allMessages.length }
}

// ─── 유틸 ─────────────────────────────────────────────

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  })
}
