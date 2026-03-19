/**
 * Cloudflare Pages Functions 프록시 호출 클라이언트
 * Slack / Notion API 연동
 */

// ─── 타입 정의 ────────────────────────────────────────

export interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  num_members: number
  topic: string
}

export interface SlackMessage {
  user: string
  user_name: string
  text: string
  ts: string
  date: string
  thread_ts?: string
}

export interface NotionDatabase {
  id: string
  title: string
  icon: string | null
  last_edited: string
}

export interface NotionPage {
  id: string
  title: string
  properties: Record<string, any>
  created_time: string
  last_edited_time: string
  url: string
}

interface SlackVerifyResult {
  ok: boolean
  team?: string
  team_id?: string
  user?: string
  error?: string
}

interface NotionVerifyResult {
  ok: boolean
  workspace_name?: string
  bot_name?: string
  error?: string
}

// ─── 프록시 URL ───────────────────────────────────────

function getProxyBase() {
  // 개발환경: vite proxy 또는 localhost:8788 (wrangler pages dev)
  // 프로덕션: 같은 도메인의 /api/ 경로
  return '/api'
}

async function proxyFetch<T>(provider: 'slack' | 'notion', token: string, body: Record<string, any>): Promise<T> {
  const url = `${getProxyBase()}/${provider}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Integration-Token': token,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` })) as any

  if (!data.ok) {
    throw new Error(data.error || `${provider} API 호출 실패`)
  }

  return data as T
}

// ─── Slack ────────────────────────────────────────────

export async function verifySlackToken(token: string): Promise<SlackVerifyResult> {
  return proxyFetch<SlackVerifyResult>('slack', token, { action: 'verify' })
}

export async function fetchSlackChannels(token: string): Promise<SlackChannel[]> {
  const data = await proxyFetch<{ ok: boolean; channels: SlackChannel[] }>(
    'slack', token, { action: 'channels' }
  )
  return data.channels
}

export async function fetchSlackMessages(
  token: string,
  channelId: string,
  oldest?: string,
  latest?: string,
): Promise<SlackMessage[]> {
  const data = await proxyFetch<{ ok: boolean; messages: SlackMessage[]; count: number }>(
    'slack', token, {
      action: 'messages',
      channel_id: channelId,
      oldest,
      latest,
    }
  )
  return data.messages
}

// ─── Notion ──────────────────────────────────────────

export async function verifyNotionToken(token: string): Promise<NotionVerifyResult> {
  return proxyFetch<NotionVerifyResult>('notion', token, { action: 'verify' })
}

export async function fetchNotionDatabases(token: string): Promise<NotionDatabase[]> {
  const data = await proxyFetch<{ ok: boolean; databases: NotionDatabase[] }>(
    'notion', token, { action: 'databases' }
  )
  return data.databases
}

export async function fetchNotionPages(token: string, databaseId: string): Promise<NotionPage[]> {
  const data = await proxyFetch<{ ok: boolean; pages: NotionPage[]; count: number }>(
    'notion', token, {
      action: 'pages',
      database_id: databaseId,
    }
  )
  return data.pages
}
