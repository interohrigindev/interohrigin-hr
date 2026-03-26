/**
 * Cloudflare Pages Function — Google Calendar CRUD 프록시
 * POST /api/google-calendar
 *
 * Actions: list, create, update, delete
 * Gmail과 동일한 OAuth2 Refresh Token 방식 사용
 */

interface Env {
  GMAIL_CLIENT_ID: string
  GMAIL_CLIENT_SECRET: string
  GMAIL_REFRESH_TOKEN: string
  GMAIL_SENDER_EMAIL: string
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

async function getAccessToken(env: Env): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error(`OAuth error: ${JSON.stringify(data)}`)
  return data.access_token as string
}

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    const body = await context.request.json() as Record<string, any>
    const { action } = body
    const accessToken = await getAccessToken(context.env)
    const calendarId = 'primary'

    switch (action) {
      // ─── List events in range ──────────────────────────────
      case 'list': {
        const { timeMin, timeMax, maxResults = 100 } = body
        const params = new URLSearchParams({
          timeMin: timeMin || new Date().toISOString(),
          timeMax: timeMax || new Date(Date.now() + 30 * 86400000).toISOString(),
          maxResults: String(maxResults),
          singleEvents: 'true',
          orderBy: 'startTime',
          timeZone: 'Asia/Seoul',
        })

        const res = await fetch(`${CALENDAR_API}/calendars/${calendarId}/events?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        const data = await res.json() as any
        if (!res.ok) return jsonResponse({ error: data.error?.message || 'List failed' }, 400)

        const events = (data.items || []).map((e: any) => ({
          id: e.id,
          title: e.summary || '',
          description: e.description || '',
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          allDay: !!e.start?.date,
          meetLink: e.hangoutLink || null,
          attendees: (e.attendees || []).map((a: any) => a.email),
          status: e.status,
          htmlLink: e.htmlLink,
        }))

        return jsonResponse({ events, count: events.length })
      }

      // ─── Create event ──────────────────────────────────────
      case 'create': {
        const { summary, description, startTime, endTime, allDay, attendees, timeZone = 'Asia/Seoul' } = body

        const event: Record<string, any> = {
          summary,
          description: description || '',
        }

        if (allDay) {
          event.start = { date: startTime.split('T')[0] }
          event.end = { date: (endTime || startTime).split('T')[0] }
        } else {
          event.start = { dateTime: startTime, timeZone }
          event.end = { dateTime: endTime || new Date(new Date(startTime).getTime() + 3600000).toISOString(), timeZone }
        }

        if (attendees?.length) {
          event.attendees = attendees.map((email: string) => ({ email }))
        }

        const res = await fetch(`${CALENDAR_API}/calendars/${calendarId}/events`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        })

        const data = await res.json() as any
        if (!res.ok) return jsonResponse({ error: data.error?.message || 'Create failed' }, 400)

        return jsonResponse({
          eventId: data.id,
          htmlLink: data.htmlLink,
          meetLink: data.hangoutLink || null,
        })
      }

      // ─── Update event ──────────────────────────────────────
      case 'update': {
        const { eventId, summary, description, startTime, endTime, allDay, timeZone = 'Asia/Seoul' } = body
        if (!eventId) return jsonResponse({ error: 'eventId required' }, 400)

        const patch: Record<string, any> = {}
        if (summary !== undefined) patch.summary = summary
        if (description !== undefined) patch.description = description

        if (startTime) {
          if (allDay) {
            patch.start = { date: startTime.split('T')[0] }
            patch.end = { date: (endTime || startTime).split('T')[0] }
          } else {
            patch.start = { dateTime: startTime, timeZone }
            patch.end = { dateTime: endTime || new Date(new Date(startTime).getTime() + 3600000).toISOString(), timeZone }
          }
        }

        const res = await fetch(`${CALENDAR_API}/calendars/${calendarId}/events/${eventId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patch),
        })

        const data = await res.json() as any
        if (!res.ok) return jsonResponse({ error: data.error?.message || 'Update failed' }, 400)

        return jsonResponse({ eventId: data.id, htmlLink: data.htmlLink })
      }

      // ─── Delete event ──────────────────────────────────────
      case 'delete': {
        const { eventId } = body
        if (!eventId) return jsonResponse({ error: 'eventId required' }, 400)

        const res = await fetch(`${CALENDAR_API}/calendars/${calendarId}/events/${eventId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (!res.ok && res.status !== 204) {
          return jsonResponse({ error: 'Delete failed' }, 400)
        }

        return jsonResponse({ success: true })
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err: any) {
    return jsonResponse({ error: err.message || 'Internal error' }, 500)
  }
}
