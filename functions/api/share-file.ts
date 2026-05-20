/**
 * Cloudflare Pages Function — 외부 공유 링크용 파일 signed URL 발급
 * GET /api/share-file?token=<share_token>&kind=resume|cover_letter|portfolio&index=<n>
 *
 * 토큰을 검증하고 (만료/비활성 확인) 해당 지원자의 storage 파일 signed URL 을 반환.
 * 인증 없이 호출 가능 — 토큰 자체가 인증 역할.
 *
 * 환경변수:
 *   SUPABASE_URL                 — Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY   — service_role key (storage 서명 권한)
 */

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS })

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Server misconfigured' }, 500)
  }
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const kind = url.searchParams.get('kind')
  const indexStr = url.searchParams.get('index')

  if (!token || !kind) return json({ error: 'token and kind required' }, 400)
  if (!['resume', 'cover_letter', 'portfolio'].includes(kind)) {
    return json({ error: 'invalid kind' }, 400)
  }

  // 1) 토큰 검증 + 지원자 정보 조회 (service role 로 RLS 우회)
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }

  const linkRes = await fetch(`${env.SUPABASE_URL}/rest/v1/candidate_share_links?token=eq.${encodeURIComponent(token)}&select=candidate_id,is_active,expires_at`, { headers })
  if (!linkRes.ok) return json({ error: 'lookup failed' }, 500)
  const links: { candidate_id: string; is_active: boolean; expires_at: string | null }[] = await linkRes.json()
  if (links.length === 0) return json({ error: '링크를 찾을 수 없습니다' }, 404)
  const link = links[0]
  if (!link.is_active) return json({ error: '비활성화된 링크입니다' }, 403)
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return json({ error: '만료된 링크입니다' }, 403)
  }

  // 2) 지원자 파일 경로 조회
  const candRes = await fetch(`${env.SUPABASE_URL}/rest/v1/candidates?id=eq.${link.candidate_id}&select=resume_url,cover_letter_url,portfolio_files`, { headers })
  if (!candRes.ok) return json({ error: 'candidate lookup failed' }, 500)
  const cands: { resume_url: string | null; cover_letter_url: string | null; portfolio_files: { path: string; filename: string }[] | null }[] = await candRes.json()
  if (cands.length === 0) return json({ error: 'candidate not found' }, 404)
  const cand = cands[0]

  let path: string | null = null
  let filename: string | null = null
  if (kind === 'resume') {
    path = cand.resume_url
    filename = path ? path.split('/').pop() || 'resume' : null
  } else if (kind === 'cover_letter') {
    path = cand.cover_letter_url
    filename = path ? path.split('/').pop() || 'cover_letter' : null
  } else if (kind === 'portfolio') {
    const idx = indexStr ? parseInt(indexStr, 10) : 0
    const list = cand.portfolio_files || []
    const item = list[idx]
    if (!item) return json({ error: 'portfolio not found' }, 404)
    path = item.path
    filename = item.filename
  }
  if (!path) return json({ error: '파일이 없습니다' }, 404)

  // 외부 URL 처리
  if (path.startsWith('http')) {
    // Supabase storage public/sign URL 패턴 — bucket + path 추출 후 service role 로 재서명
    const mPublic = path.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+?)(?:\?.*)?$/)
    if (mPublic) {
      const bucket = mPublic[1]
      const innerPath = mPublic[2]
      const r = await signInBucket(env, headers, bucket, innerPath)
      if (r) return json({ url: r, filename: filename || innerPath.split('/').pop() })
    }
    // 그 외 외부 URL 은 그대로
    return json({ url: path, filename })
  }

  // 3) 상대 path — resumes / recruitment-files 순서로 시도
  for (const bucket of ['resumes', 'recruitment-files']) {
    const r = await signInBucket(env, headers, bucket, path)
    if (r) return json({ url: r, filename })
  }

  return json({ error: '파일을 찾을 수 없습니다 (resumes / recruitment-files 모두 시도)' }, 404)
}

async function signInBucket(
  env: Env,
  headers: Record<string, string>,
  bucket: string,
  path: string,
): Promise<string | null> {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ expiresIn: 3600 }),
    })
    if (!r.ok) return null
    const s: { signedURL?: string } = await r.json()
    if (!s.signedURL) return null
    return `${env.SUPABASE_URL}/storage/v1${s.signedURL}`
  } catch {
    return null
  }
}
