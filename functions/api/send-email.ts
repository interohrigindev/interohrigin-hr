/**
 * Cloudflare Pages Function — 이메일 발송 (Resend API)
 * POST /api/send-email
 * Body: { to, subject, html, from? }
 * 환경변수: RESEND_API_KEY (Cloudflare Pages Settings에서 설정)
 */

interface Env {
  RESEND_API_KEY: string
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

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    return jsonResponse({ error: 'RESEND_API_KEY가 설정되지 않았습니다. Cloudflare Pages 환경변수를 확인하세요.' }, 500)
  }

  try {
    const body: EmailRequestBody = await request.json()
    const { to, subject, html, from } = body

    if (!to || !subject || !html) {
      return jsonResponse({ error: 'to, subject, html 필드가 필요합니다.' }, 400)
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || 'InterOhrigin HR <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      return jsonResponse({ error: (data as Record<string, unknown>)?.message || `Resend API error: ${res.status}` }, res.status)
    }
    return jsonResponse({ success: true, id: (data as Record<string, string>).id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
}
