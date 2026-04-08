/**
 * Cloudflare Pages Function — Google Docs API 프록시
 * POST /api/google-docs
 *
 * Actions: create
 * 마크다운 텍스트 → Google Docs 문서 생성
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

interface CreateRequest {
  action: 'create'
  title: string
  content: string // 마크다운 텍스트
}

const DOCS_API = 'https://docs.googleapis.com/v1/documents'

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

    // 1. 문서 생성
    const createRes = await fetch(DOCS_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: body.title }),
    })

    if (!createRes.ok) {
      const err = await createRes.json()
      throw new Error(`Docs create failed: ${JSON.stringify(err)}`)
    }

    const doc = await createRes.json() as any
    const documentId = doc.documentId

    // 2. 마크다운 → Docs API 요청으로 변환
    const requests: any[] = []
    const lines = body.content.split('\n')
    let insertIndex = 1 // Docs는 index 1부터 시작

    for (const line of lines) {
      if (!line.trim() && line === '') {
        requests.push({ insertText: { location: { index: insertIndex }, text: '\n' } })
        insertIndex += 1
        continue
      }

      let text = line
      let style: any = null

      // 헤딩 파싱
      if (line.startsWith('### ')) {
        text = line.slice(4) + '\n'
        style = { namedStyleType: 'HEADING_3' }
      } else if (line.startsWith('## ')) {
        text = line.slice(3) + '\n'
        style = { namedStyleType: 'HEADING_2' }
      } else if (line.startsWith('# ')) {
        text = line.slice(2) + '\n'
        style = { namedStyleType: 'HEADING_1' }
      } else {
        text = line + '\n'
      }

      // 마크다운 기호 제거 (볼드, 이모지 마커 등은 텍스트로 유지)
      const cleanText = text.replace(/\*\*/g, '')

      requests.push({
        insertText: { location: { index: insertIndex }, text: cleanText },
      })

      if (style) {
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: insertIndex, endIndex: insertIndex + cleanText.length },
            paragraphStyle: style,
            fields: 'namedStyleType',
          },
        })
      }

      insertIndex += cleanText.length
    }

    // 3. 배치 업데이트
    if (requests.length > 0) {
      const batchRes = await fetch(`${DOCS_API}/${documentId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      })

      if (!batchRes.ok) {
        const err = await batchRes.json()
        throw new Error(`Docs batch update failed: ${JSON.stringify(err)}`)
      }
    }

    return jsonResponse({
      success: true,
      documentId,
      documentUrl: `https://docs.google.com/document/d/${documentId}/edit`,
    })
  } catch (err: any) {
    return jsonResponse({ error: err.message || 'Google Docs API error' }, 500)
  }
}
