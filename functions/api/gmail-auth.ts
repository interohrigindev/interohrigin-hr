/**
 * Cloudflare Pages Function — Gmail OAuth2 Refresh Token 발급 도우미
 *
 * GET  /api/gmail-auth              → Google 로그인 페이지로 리다이렉트
 * GET  /api/gmail-auth?code=xxx     → Authorization Code → Refresh Token 교환
 *
 * 환경변수:
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET
 */

interface Env {
  GMAIL_CLIENT_ID: string
  GMAIL_CLIENT_SECRET: string
}

const SCOPES = 'https://www.googleapis.com/auth/gmail.send'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET) {
    return new Response(
      '<h2>GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET 환경변수가 설정되지 않았습니다.</h2>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  // Redirect URI = 이 함수 자체의 URL
  const redirectUri = `${url.origin}/api/gmail-auth`

  // Step 1: code가 없으면 → Google 로그인 페이지로 리다이렉트
  if (!code) {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', env.GMAIL_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', SCOPES)
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')

    return Response.redirect(authUrl.toString(), 302)
  }

  // Step 2: code가 있으면 → Refresh Token 교환
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GMAIL_CLIENT_ID,
        client_secret: env.GMAIL_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const data = await res.json() as Record<string, unknown>

    if (!res.ok) {
      return new Response(
        `<h2>토큰 교환 실패</h2><pre>${JSON.stringify(data, null, 2)}</pre>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      )
    }

    const refreshToken = data.refresh_token as string
    const email = data.id_token ? '(토큰에서 확인)' : '로그인한 계정'

    return new Response(
      `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>Gmail OAuth 설정 완료</title></head>
<body style="font-family:sans-serif;max-width:700px;margin:40px auto;padding:20px;">
  <h1 style="color:#16a34a;">Gmail OAuth 인증 성공!</h1>
  <p>아래 Refresh Token을 Cloudflare Pages 환경변수에 등록하세요.</p>

  <h3>GMAIL_REFRESH_TOKEN:</h3>
  <div style="background:#f3f4f6;padding:16px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:13px;">
    ${refreshToken}
  </div>

  <h3 style="margin-top:24px;">Cloudflare Pages 환경변수 설정:</h3>
  <table style="border-collapse:collapse;width:100%;">
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:8px;font-weight:bold;">GMAIL_CLIENT_ID</td>
      <td style="padding:8px;font-family:monospace;font-size:12px;">${env.GMAIL_CLIENT_ID}</td>
    </tr>
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:8px;font-weight:bold;">GMAIL_CLIENT_SECRET</td>
      <td style="padding:8px;">이미 설정됨</td>
    </tr>
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:8px;font-weight:bold;color:#dc2626;">GMAIL_REFRESH_TOKEN</td>
      <td style="padding:8px;color:#dc2626;">위 값을 <strong>Secret</strong>으로 등록</td>
    </tr>
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:8px;font-weight:bold;">GMAIL_SENDER_EMAIL</td>
      <td style="padding:8px;">로그인한 Gmail 주소</td>
    </tr>
    <tr>
      <td style="padding:8px;font-weight:bold;">GMAIL_SENDER_NAME</td>
      <td style="padding:8px;">인터오리진 HR (원하는 이름)</td>
    </tr>
  </table>

  <p style="margin-top:24px;padding:12px;background:#fef3c7;border-radius:8px;font-size:14px;">
    ⚠️ 설정 완료 후 이 페이지의 URL은 더 이상 필요하지 않습니다.<br>
    보안을 위해 이 페이지를 닫고, 브라우저 기록에서도 삭제하는 것을 권장합니다.
  </p>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      `<h2>오류 발생</h2><p>${message}</p>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}
