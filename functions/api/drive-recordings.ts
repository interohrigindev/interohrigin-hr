/**
 * Cloudflare Pages Function — Google Drive Meet 녹화 파일 검색/다운로드
 *
 * GET  /api/drive-recordings?meetingTitle=...  → Drive에서 녹화 파일 검색
 * POST /api/drive-recordings { driveFileId }   → 특정 파일 다운로드 (스트리밍)
 *
 * 환경변수 (Gmail/Calendar과 공유):
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET
 *   GMAIL_REFRESH_TOKEN  — gmail.send + calendar + drive.readonly 권한 포함
 */

interface Env {
  GMAIL_CLIENT_ID: string
  GMAIL_CLIENT_SECRET: string
  GMAIL_REFRESH_TOKEN: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ─── OAuth2 Access Token 발급 (google-meet.ts와 동일 패턴) ───
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

  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(`Google OAuth 토큰 발급 실패: ${JSON.stringify(data)}`)
  }
  return data.access_token as string
}

// ─── OPTIONS (CORS preflight) ────────────────────────────────
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

// ─── GET: Google Drive에서 Meet 녹화 파일 검색 ────────────────
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    return jsonResponse({ error: 'Google OAuth 설정이 필요합니다.' }, 500)
  }

  try {
    const url = new URL(request.url)
    const meetingTitle = url.searchParams.get('meetingTitle') || ''

    const accessToken = await getAccessToken(
      env.GMAIL_CLIENT_ID,
      env.GMAIL_CLIENT_SECRET,
      env.GMAIL_REFRESH_TOKEN,
    )

    // Google Drive API v3 파일 검색
    // Meet 녹화는 MP4로 저장되며, "Meet Recordings" 폴더에 위치
    let query = "mimeType='video/mp4' AND trashed=false"
    if (meetingTitle) {
      // 작은따옴표 이스케이프
      const escaped = meetingTitle.replace(/'/g, "\\'")
      query += ` AND name contains '${escaped}'`
    }

    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,size,mimeType,createdTime,webViewLink)',
      orderBy: 'createdTime desc',
      pageSize: '10',
    })

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )

    const driveData = (await driveRes.json()) as Record<string, unknown>

    if (!driveRes.ok) {
      return jsonResponse(
        {
          error: `Google Drive API 오류: ${
            (driveData as any)?.error?.message || JSON.stringify(driveData)
          }`,
        },
        driveRes.status,
      )
    }

    const files = ((driveData as any).files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      size: f.size || '0',
      mimeType: f.mimeType,
      createdTime: f.createdTime,
      webViewLink: f.webViewLink,
    }))

    return jsonResponse({ success: true, files })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
}

// ─── POST: 특정 파일 다운로드 (스트리밍) ───────────────────────
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    return jsonResponse({ error: 'Google OAuth 설정이 필요합니다.' }, 500)
  }

  try {
    const body = (await request.json()) as { driveFileId?: string }
    const { driveFileId } = body

    if (!driveFileId) {
      return jsonResponse({ error: 'driveFileId 필수' }, 400)
    }

    const accessToken = await getAccessToken(
      env.GMAIL_CLIENT_ID,
      env.GMAIL_CLIENT_SECRET,
      env.GMAIL_REFRESH_TOKEN,
    )

    // 파일 메타데이터 조회 (파일명, 크기)
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=name,size,mimeType`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!metaRes.ok) {
      return jsonResponse({ error: '파일 정보 조회 실패' }, metaRes.status)
    }

    const meta = (await metaRes.json()) as { name: string; size: string; mimeType: string }

    // 파일 다운로드 (스트리밍)
    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!fileRes.ok) {
      return jsonResponse({ error: '파일 다운로드 실패' }, fileRes.status)
    }

    // 스트리밍으로 응답 (Worker 메모리 절약)
    return new Response(fileRes.body, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': meta.mimeType || 'video/mp4',
        'Content-Length': meta.size || '',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(meta.name)}"`,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
}
