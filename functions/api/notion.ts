/**
 * Cloudflare Pages Function — Notion API 프록시
 * POST body의 action 필드로 분기: verify | databases | pages
 * 토큰은 X-Integration-Token 헤더로 수신
 */

interface Env {}

interface NotionRequestBody {
  action: 'verify' | 'databases' | 'pages'
  database_id?: string
  start_cursor?: string
}

const NOTION_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

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

  let body: NotionRequestBody
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: '잘못된 요청 형식입니다' }, 400)
  }

  try {
    switch (body.action) {
      case 'verify':
        return json(await verify(token))
      case 'databases':
        return json(await databases(token))
      case 'pages':
        if (!body.database_id) {
          return json({ ok: false, error: 'database_id가 필요합니다' }, 400)
        }
        return json(await pages(token, body.database_id))
      default:
        return json({ ok: false, error: '알 수 없는 action입니다' }, 400)
    }
  } catch (err: any) {
    return json({ ok: false, error: err.message || 'Notion API 호출 실패' }, 500)
  }
}

// ─── Notion API 호출 ──────────────────────────────────

function notionHeaders(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  }
}

async function verify(token: string) {
  const res = await fetch(`${NOTION_BASE}/users/me`, {
    headers: notionHeaders(token),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err?.message || `Notion API error: ${res.status}`)
  }

  const data = await res.json() as any

  // 워크스페이스 이름은 bot info에서 가져옴
  return {
    ok: true,
    workspace_name: data.bot?.workspace_name || 'Notion Workspace',
    bot_name: data.name || '',
  }
}

async function databases(token: string) {
  const res = await fetch(`${NOTION_BASE}/search`, {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({
      filter: { value: 'database', property: 'object' },
      page_size: 100,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err?.message || `Notion API error: ${res.status}`)
  }

  const data = await res.json() as any

  const databases = (data.results || []).map((db: any) => ({
    id: db.id,
    title: extractPlainText(db.title),
    icon: db.icon?.emoji || null,
    last_edited: db.last_edited_time,
  }))

  return { ok: true, databases }
}

async function pages(token: string, databaseId: string) {
  const allPages: any[] = []
  let startCursor: string | undefined

  // 페이지네이션 (최대 10 페이지 = ~1000 페이지)
  for (let page = 0; page < 10; page++) {
    const body: any = { page_size: 100 }
    if (startCursor) body.start_cursor = startCursor

    const res = await fetch(`${NOTION_BASE}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: notionHeaders(token),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any
      throw new Error(err?.message || `Notion API error: ${res.status}`)
    }

    const data = await res.json() as any

    for (const pg of data.results || []) {
      const properties = extractProperties(pg.properties)

      allPages.push({
        id: pg.id,
        title: properties._title || '',
        properties,
        created_time: pg.created_time,
        last_edited_time: pg.last_edited_time,
        url: pg.url,
      })
    }

    if (!data.has_more || !data.next_cursor) break
    startCursor = data.next_cursor
  }

  return { ok: true, pages: allPages, count: allPages.length }
}

// ─── 유틸 ─────────────────────────────────────────────

function extractPlainText(richText: any[] | undefined): string {
  if (!richText || !Array.isArray(richText)) return ''
  return richText.map((t: any) => t.plain_text || '').join('')
}

function extractProperties(props: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(props || {})) {
    const type = value.type
    switch (type) {
      case 'title':
        result[key] = extractPlainText(value.title)
        result._title = extractPlainText(value.title)
        break
      case 'rich_text':
        result[key] = extractPlainText(value.rich_text)
        break
      case 'number':
        result[key] = value.number
        break
      case 'select':
        result[key] = value.select?.name || null
        break
      case 'multi_select':
        result[key] = (value.multi_select || []).map((s: any) => s.name)
        break
      case 'date':
        result[key] = value.date?.start || null
        break
      case 'checkbox':
        result[key] = value.checkbox
        break
      case 'url':
        result[key] = value.url
        break
      case 'email':
        result[key] = value.email
        break
      case 'people':
        result[key] = (value.people || []).map((p: any) => p.name || p.id)
        break
      case 'relation':
        result[key] = (value.relation || []).map((r: any) => r.id)
        break
      case 'status':
        result[key] = value.status?.name || null
        break
      default:
        result[key] = null
    }
  }

  return result
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  })
}
