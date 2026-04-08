/**
 * Cloudflare Pages Function — Google Slides API 프록시
 * POST /api/google-slides
 *
 * Actions: create
 * 슬라이드 구조 JSON → Google Slides 프레젠테이션 생성
 */

interface Env {
  GMAIL_CLIENT_ID: string
  GMAIL_CLIENT_SECRET: string
  GMAIL_REFRESH_TOKEN: string
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

interface SlideData {
  title: string
  bullets?: string[]
  layout?: 'TITLE' | 'TITLE_AND_BODY' | 'SECTION_HEADER' | 'BLANK'
}

interface CreateRequest {
  action: 'create'
  title: string
  slides: SlideData[]
}

const SLIDES_API = 'https://slides.googleapis.com/v1/presentations'

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    const body = await context.request.json() as CreateRequest
    const accessToken = await getAccessToken(context.env)

    if (body.action !== 'create') {
      return jsonResponse({ error: 'Unsupported action' }, 400)
    }

    // 1. 프레젠테이션 생성
    const createRes = await fetch(SLIDES_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: body.title }),
    })

    if (!createRes.ok) {
      const err = await createRes.json()
      throw new Error(`Slides create failed: ${JSON.stringify(err)}`)
    }

    const presentation = await createRes.json() as any
    const presentationId = presentation.presentationId

    // 2. 기본 슬라이드 삭제 + 새 슬라이드 생성
    const requests: any[] = []

    // 기본 빈 슬라이드 삭제
    if (presentation.slides?.length > 0) {
      requests.push({
        deleteObject: { objectId: presentation.slides[0].objectId },
      })
    }

    // 슬라이드 추가
    for (let i = 0; i < body.slides.length; i++) {
      const slide = body.slides[i]
      const slideId = `slide_${i}`
      const titleId = `title_${i}`
      const bodyId = `body_${i}`

      const layout = i === 0 ? 'TITLE' : (slide.layout === 'SECTION_HEADER' ? 'SECTION_HEADER' : 'TITLE_AND_BODY')

      requests.push({
        createSlide: {
          objectId: slideId,
          insertionIndex: i,
          slideLayoutReference: {
            predefinedLayout: layout,
          },
          placeholderIdMappings: [
            { layoutPlaceholder: { type: 'TITLE' }, objectId: titleId },
            ...(layout !== 'TITLE' && layout !== 'SECTION_HEADER'
              ? [{ layoutPlaceholder: { type: 'BODY' }, objectId: bodyId }]
              : []),
          ],
        },
      })

      // 제목 텍스트
      requests.push({
        insertText: {
          objectId: titleId,
          text: slide.title,
          insertionIndex: 0,
        },
      })

      // 본문 불릿
      if (slide.bullets && slide.bullets.length > 0 && layout === 'TITLE_AND_BODY') {
        const bulletText = slide.bullets.join('\n')
        requests.push({
          insertText: {
            objectId: bodyId,
            text: bulletText,
            insertionIndex: 0,
          },
        })
      }
    }

    // 3. 배치 업데이트
    if (requests.length > 0) {
      const batchRes = await fetch(`${SLIDES_API}/${presentationId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      })

      if (!batchRes.ok) {
        const err = await batchRes.json()
        throw new Error(`Slides batch update failed: ${JSON.stringify(err)}`)
      }
    }

    return jsonResponse({
      success: true,
      presentationId,
      presentationUrl: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      slideCount: body.slides.length,
    })
  } catch (err: any) {
    return jsonResponse({ error: err.message || 'Google Slides API error' }, 500)
  }
}
