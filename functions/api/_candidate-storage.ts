/**
 * 서버측(Cloudflare Function) 지원자 파일 진입점
 *
 * 클라이언트 측 src/lib/candidate-storage.ts 와 동일한 책임:
 *  - 어떤 형식의 resume_url 이 들어와도 자동 해석
 *  - resumes → recruitment-files 순서로 시도
 *  - Supabase URL 패턴이면 bucket 추출 후 재서명
 *
 * env 의존: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

export interface CandidateStorageEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

const PRIMARY_BUCKET = 'resumes'
const FALLBACK_BUCKETS = ['recruitment-files']

/**
 * 어떤 형식의 path/URL 이 들어와도 다운로드 가능한 signed URL 반환
 */
export async function resolveSignedUrl(
  env: CandidateStorageEnv,
  raw: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!raw) return null
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }

  if (raw.startsWith('http')) {
    const m = raw.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+?)(?:\?.*)?$/)
    if (m) {
      const bucket = m[1]
      const innerPath = m[2]
      const signed = await signInBucket(env, headers, bucket, innerPath, expiresIn)
      if (signed) return signed
      // 명시된 bucket 실패 시 다른 후보들 시도
      for (const b of [PRIMARY_BUCKET, ...FALLBACK_BUCKETS]) {
        if (b === bucket) continue
        const s = await signInBucket(env, headers, b, innerPath, expiresIn)
        if (s) return s
      }
      return raw
    }
    return raw
  }

  for (const bucket of [PRIMARY_BUCKET, ...FALLBACK_BUCKETS]) {
    const url = await signInBucket(env, headers, bucket, raw, expiresIn)
    if (url) return url
  }
  return null
}

async function signInBucket(
  env: CandidateStorageEnv,
  headers: Record<string, string>,
  bucket: string,
  path: string,
  expiresIn: number,
): Promise<string | null> {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ expiresIn }),
    })
    if (!r.ok) return null
    const s: { signedURL?: string } = await r.json()
    if (!s.signedURL) return null
    return `${env.SUPABASE_URL}/storage/v1${s.signedURL}`
  } catch {
    return null
  }
}

/**
 * 진단용 — 디버깅 시 어느 패턴인지 확인
 */
export function diagnose(raw: string | null | undefined): {
  kind: 'null' | 'relative' | 'supabase_url' | 'external_url'
  bucket?: string
  innerPath?: string
} {
  if (!raw) return { kind: 'null' }
  if (raw.startsWith('http')) {
    const m = raw.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+?)(?:\?.*)?$/)
    if (m) return { kind: 'supabase_url', bucket: m[1], innerPath: m[2] }
    return { kind: 'external_url' }
  }
  return { kind: 'relative', bucket: PRIMARY_BUCKET, innerPath: raw }
}
