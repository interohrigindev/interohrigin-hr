/**
 * Cloudflare Pages Function — Google Calendar + Meet 자동 생성
 * POST /api/google-meet
 *
 * 환경변수 (Cloudflare Pages Settings):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL  — 서비스 계정 이메일
 *   GOOGLE_PRIVATE_KEY            — 서비스 계정 비공개 키 (PEM)
 *   GOOGLE_CALENDAR_ID            — 캘린더 ID (보통 회사 이메일 주소)
 */

interface Env {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string
  GOOGLE_PRIVATE_KEY: string
  GOOGLE_CALENDAR_ID: string
}

interface MeetRequestBody {
  summary: string
  description?: string
  startTime: string          // ISO 8601
  durationMinutes: number
  attendees?: string[]       // 이메일 목록
  timeZone?: string
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

// ─── JWT 서명 (서비스 계정 인증) ───────────────────────────────
function base64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

async function createJWT(email: string, privateKeyPem: string, scopes: string[]): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const headerB64 = base64url(JSON.stringify(header))
  const payloadB64 = base64url(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await importPrivateKey(privateKeyPem)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  )

  return `${signingInput}.${base64url(signature)}`
}

async function getAccessToken(email: string, privateKey: string): Promise<string> {
  const jwt = await createJWT(email, privateKey, [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ])

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })

  const data = await res.json() as Record<string, unknown>
  if (!res.ok) {
    throw new Error(`Google OAuth 실패: ${JSON.stringify(data)}`)
  }
  return data.access_token as string
}

// ─── 핸들러 ────────────────────────────────────────────────────
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    return jsonResponse({
      error: 'Google 서비스 계정이 설정되지 않았습니다. Cloudflare Pages 환경변수를 확인하세요.',
    }, 500)
  }

  try {
    const body: MeetRequestBody = await request.json()
    const { summary, description, startTime, durationMinutes, attendees, timeZone } = body

    if (!summary || !startTime || !durationMinutes) {
      return jsonResponse({ error: 'summary, startTime, durationMinutes 필수' }, 400)
    }

    // 종료 시간 계산
    const start = new Date(startTime)
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
    const tz = timeZone || 'Asia/Seoul'

    // Google 액세스 토큰 발급
    const accessToken = await getAccessToken(
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    )

    const calendarId = env.GOOGLE_CALENDAR_ID || 'primary'

    // Google Calendar 이벤트 생성 (Meet 자동 포함)
    const event = {
      summary,
      description: description || '',
      start: { dateTime: start.toISOString(), timeZone: tz },
      end: { dateTime: end.toISOString(), timeZone: tz },
      attendees: (attendees || []).map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
    }

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      },
    )

    const calData = await calRes.json() as Record<string, unknown>
    if (!calRes.ok) {
      return jsonResponse({
        error: `Google Calendar API 오류: ${(calData as any)?.error?.message || JSON.stringify(calData)}`,
      }, calRes.status)
    }

    const meetLink = (calData as any)?.conferenceData?.entryPoints?.find(
      (ep: any) => ep.entryPointType === 'video',
    )?.uri || null

    return jsonResponse({
      success: true,
      meetLink,
      eventId: calData.id,
      eventLink: calData.htmlLink,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
}
