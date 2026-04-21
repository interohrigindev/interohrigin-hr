/**
 * Cloudflare Pages Function — 퇴직자 Google Drive 파일 메타 스캔 (B5)
 *
 * GET /api/drive-scan?email=...&name=...
 *   → 직원 이메일/이름 기준으로 Drive에서 접근 가능한 파일 메타 반환
 *   → 결과는 관리자 검수 후 handover_assets에 저장 (자동 확정 없음)
 *
 * 스코프: GMAIL_REFRESH_TOKEN (drive.readonly 포함)
 * 한계: admin 계정이 볼 수 있는 파일만 검색됨
 *       (Shared Drive / admin과 공유된 파일 / 이름 매칭 파일)
 */

interface Env {
  GMAIL_CLIENT_ID: string
  GMAIL_CLIENT_SECRET: string
  GMAIL_REFRESH_TOKEN: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error(`토큰 발급 실패: ${JSON.stringify(data)}`)
  return data.access_token as string
}

// MIME → asset_type 분류
function classifyMime(mime: string): 'document' | 'account' | 'other' {
  if (
    mime.includes('document') || mime.includes('spreadsheet') ||
    mime.includes('presentation') || mime === 'application/pdf' ||
    mime.startsWith('text/') || mime.includes('forms')
  ) return 'document'
  return 'other'
}

function mimeLabel(mime: string): string {
  const map: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Docs',
    'application/vnd.google-apps.spreadsheet': 'Google Sheets',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.form': 'Google Forms',
    'application/pdf': 'PDF',
    'video/mp4': '동영상',
    'image/jpeg': '이미지', 'image/png': '이미지',
  }
  return map[mime] || mime.split('/').pop() || 'file'
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS })

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    return jsonResponse({ error: 'Google OAuth 환경변수가 설정되지 않았습니다.' }, 500)
  }

  const url = new URL(request.url)
  const email = url.searchParams.get('email')?.trim() || ''
  const name  = url.searchParams.get('name')?.trim() || ''

  if (!email && !name) {
    return jsonResponse({ error: 'email 또는 name 파라미터가 필요합니다.' }, 400)
  }

  try {
    const accessToken = await getAccessToken(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET, env.GMAIL_REFRESH_TOKEN)

    // 검색 전략 1: email로 공유된 파일
    // 검색 전략 2: 이름이 포함된 파일 (공유 Drive 포함)
    const queries: string[] = []
    if (email) {
      const esc = email.replace(/'/g, "\\'")
      queries.push(`('${esc}' in writers OR '${esc}' in readers OR '${esc}' in owners)`)
    }
    if (name) {
      const esc = name.replace(/'/g, "\\'")
      queries.push(`name contains '${esc}'`)
    }

    const combinedQuery = `(${queries.join(' OR ')}) AND trashed=false AND mimeType != 'application/vnd.google-apps.folder'`

    const params = new URLSearchParams({
      q: combinedQuery,
      fields: 'files(id,name,mimeType,webViewLink,modifiedTime,parents,owners)',
      orderBy: 'modifiedTime desc',
      pageSize: '50',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
      corpora: 'allDrives',
    })

    const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const driveData = await driveRes.json() as Record<string, unknown>

    if (!driveRes.ok) {
      const msg = (driveData as any)?.error?.message || JSON.stringify(driveData)
      return jsonResponse({ error: `Drive API 오류: ${msg}` }, driveRes.status)
    }

    const rawFiles = ((driveData as any).files || []) as Array<Record<string, unknown>>

    const files = rawFiles.map((f) => ({
      id: f.id as string,
      name: f.name as string,
      mimeType: f.mimeType as string,
      mimeLabel: mimeLabel(f.mimeType as string),
      webViewLink: f.webViewLink as string | null,
      modifiedTime: f.modifiedTime as string,
      assetType: classifyMime(f.mimeType as string),
      ownerEmail: ((f.owners as any)?.[0]?.emailAddress) || '',
    }))

    return jsonResponse({ success: true, files, total: files.length })
  } catch (err: unknown) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
