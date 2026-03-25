/**
 * Cloudflare Pages Function — 이메일 발송 (Gmail API)
 * POST /api/send-email
 * Body: { to, subject, html, from? }
 *
 * 환경변수 (Cloudflare Pages Settings):
 *   GMAIL_CLIENT_ID       — Google OAuth2 클라이언트 ID
 *   GMAIL_CLIENT_SECRET    — Google OAuth2 클라이언트 시크릿
 *   GMAIL_REFRESH_TOKEN    — OAuth2 Refresh Token (1회 발급)
 *   GMAIL_SENDER_EMAIL     — 발신자 이메일 (예: interohrigin.dev@gmail.com)
 *   GMAIL_SENDER_NAME      — 발신자 표시 이름 (예: 인터오리진 HR) [선택]
 */

interface Env {
  GMAIL_CLIENT_ID: string
  GMAIL_CLIENT_SECRET: string
  GMAIL_REFRESH_TOKEN: string
  GMAIL_SENDER_EMAIL: string
  GMAIL_SENDER_NAME?: string
}

interface EmailRequestBody {
  to: string
  subject: string
  html: string
  from?: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ─── Gmail API용 Access Token 발급 ──────────────────────────────
async function getGmailAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json() as Record<string, unknown>
  if (!res.ok) {
    throw new Error(`Gmail OAuth 토큰 발급 실패: ${JSON.stringify(data)}`)
  }
  return data.access_token as string
}

// ─── RFC 2822 MIME 메시지 생성 ──────────────────────────────────
function createMimeMessage(
  from: string,
  to: string,
  subject: string,
  html: string,
): string {
  // Subject을 Base64로 인코딩 (한글 지원)
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`

  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, '')}`

  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(html))),
    ``,
    `--${boundary}--`,
  ].join('\r\n')

  return message
}

// ─── Base64url 인코딩 (Gmail API 요구) ──────────────────────────
function base64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ─── 핸들러 ────────────────────────────────────────────────────
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 환경변수 확인
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    return jsonResponse({
      error: 'Gmail API 설정이 완료되지 않았습니다. GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN 환경변수를 확인하세요.',
    }, 500)
  }

  const senderEmail = env.GMAIL_SENDER_EMAIL || 'noreply@gmail.com'
  const senderName = env.GMAIL_SENDER_NAME || '인터오리진 HR'

  try {
    const body: EmailRequestBody = await request.json()
    const { to, subject, html } = body

    if (!to || !subject || !html) {
      return jsonResponse({ error: 'to, subject, html 필드가 필요합니다.' }, 400)
    }

    // Access Token 발급
    const accessToken = await getGmailAccessToken(
      env.GMAIL_CLIENT_ID,
      env.GMAIL_CLIENT_SECRET,
      env.GMAIL_REFRESH_TOKEN,
    )

    // MIME 메시지 생성
    const fromHeader = `${senderName} <${senderEmail}>`
    const mimeMessage = createMimeMessage(fromHeader, to, subject, html)
    const encodedMessage = base64url(mimeMessage)

    // Gmail API로 발송
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodedMessage }),
      },
    )

    const data = await res.json() as Record<string, unknown>
    if (!res.ok) {
      const errMsg = (data as any)?.error?.message || `Gmail API error: ${res.status}`
      return jsonResponse({ error: errMsg }, res.status)
    }

    return jsonResponse({ success: true, id: data.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
}
