/**
 * Cloudflare Pages Function — Google Calendar + Meet 자동 생성
 * POST /api/google-meet
 *
 * Gmail과 동일한 OAuth2 Refresh Token 방식 사용
 * 환경변수 (Gmail과 공유):
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET
 *   GMAIL_REFRESH_TOKEN    — gmail.send + calendar 권한 포함
 *   GMAIL_SENDER_EMAIL     — 캘린더 소유자 이메일
 */

interface Env {
  GMAIL_CLIENT_ID: string
  GMAIL_CLIENT_SECRET: string
  GMAIL_REFRESH_TOKEN: string
  GMAIL_SENDER_EMAIL: string
  // 캘린더/Meet 전용 (미설정 시 GMAIL_ 토큰 사용)
  CALENDAR_REFRESH_TOKEN?: string
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

// ─── OAuth2 Access Token 발급 ───────────────────────────────────
async function getAccessToken(
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
    throw new Error(`Google OAuth 토큰 발급 실패: ${JSON.stringify(data)}`)
  }
  return data.access_token as string
}

// ─── 핸들러 ────────────────────────────────────────────────────
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    return jsonResponse({
      error: 'Google OAuth 설정이 완료되지 않았습니다. GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN 환경변수를 확인하세요.',
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

    // OAuth2 Access Token 발급 (캘린더 전용 토큰 우선, 없으면 Gmail 토큰)
    const calendarToken = env.CALENDAR_REFRESH_TOKEN || env.GMAIL_REFRESH_TOKEN
    const accessToken = await getAccessToken(
      env.GMAIL_CLIENT_ID,
      env.GMAIL_CLIENT_SECRET,
      calendarToken,
    )

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
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,
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
