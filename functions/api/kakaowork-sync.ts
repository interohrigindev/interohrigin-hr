/**
 * Cloudflare Pages Function — KakaoWork 이메일 매핑 동기화
 * POST /api/kakaowork-sync
 * Body: {} (인증된 관리자 호출 — 본문 비움)
 *
 * Design Ref: §7.2 — 전 직원 employees.email → KakaoWork user.id 매핑 → employee_kakaowork_map upsert
 * Plan SC: Phase 7 plug-and-play. 관리자 화면 "매핑 동기화" 버튼이 호출.
 *
 * 인증:
 *  - 호출 시 Authorization 헤더의 Supabase JWT 를 직접 검증 (admin role check)
 *  - 본 함수는 service role 로 DB 작업 수행
 *
 * KakaoWork API: GET https://api.kakaowork.com/v1/users.find_by_email?email=...
 *   Authorization: Bearer ${kakaowork_app_key}
 *
 * 환경변수:
 *   VITE_SUPABASE_URL          — Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service Role Key
 */

interface Env {
  VITE_SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface Employee {
  id: string
  email: string | null
  name: string | null
}

interface ChannelConfig {
  kakaowork_app_key: string | null
  kakaowork_enabled: boolean
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const KAKAOWORK_API = 'https://api.kakaowork.com/v1'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS_HEADERS })

/**
 * 호출자가 admin/hr_admin/ceo 인지 검증.
 * Supabase JWT 를 그대로 사용해서 /auth/v1/user 조회 후, employees 에서 role 확인.
 */
async function verifyAdmin(authHeader: string | null, env: Env): Promise<{ ok: true; uid: string } | { ok: false; error: string; status: number }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, error: 'Authorization header missing', status: 401 }
  }
  const userRes = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: authHeader,
    },
  })
  if (!userRes.ok) return { ok: false, error: 'invalid token', status: 401 }
  const user = (await userRes.json()) as { id?: string }
  if (!user.id) return { ok: false, error: 'no user id', status: 401 }

  const empRes = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/employees?id=eq.${user.id}&select=role`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    },
  )
  if (!empRes.ok) return { ok: false, error: 'employees lookup failed', status: 500 }
  const emps = (await empRes.json()) as Array<{ role: string }>
  if (!emps[0] || !['admin', 'hr_admin', 'ceo'].includes(emps[0].role)) {
    return { ok: false, error: 'forbidden — admin only', status: 403 }
  }
  return { ok: true, uid: user.id }
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase 서비스 키 미설정' }, 500)
  }

  // 1) 관리자 검증
  const adminCheck = await verifyAdmin(ctx.request.headers.get('Authorization'), env)
  if (!adminCheck.ok) return jsonResponse({ error: adminCheck.error }, adminCheck.status)

  const sbHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
  const baseUrl = env.VITE_SUPABASE_URL

  // 2) 토큰 조회
  const cfgRes = await fetch(
    `${baseUrl}/rest/v1/notification_channel_configs?config_key=eq.default&select=kakaowork_app_key,kakaowork_enabled`,
    { headers: sbHeaders },
  )
  if (!cfgRes.ok) return jsonResponse({ error: 'channel_configs 조회 실패' }, 500)
  const cfgs = (await cfgRes.json()) as ChannelConfig[]
  const cfg = cfgs[0]
  if (!cfg?.kakaowork_app_key) {
    return jsonResponse({ error: 'KakaoWork App Key 미설정 — 먼저 설정 후 동기화 실행' }, 400)
  }
  const appKey = cfg.kakaowork_app_key

  // 3) 전 직원 조회 (이메일 있는 사람만)
  const empRes = await fetch(
    `${baseUrl}/rest/v1/employees?email=not.is.null&select=id,email,name&order=name.asc`,
    { headers: sbHeaders },
  )
  if (!empRes.ok) return jsonResponse({ error: 'employees 조회 실패' }, 500)
  const employees = (await empRes.json()) as Employee[]

  if (employees.length === 0) {
    return jsonResponse({ total: 0, matched: 0, failed: 0, failedList: [] })
  }

  // 4) 각 직원의 email 로 KakaoWork user 조회 (순차 — rate limit 고려)
  const matched: Array<{ employee_id: string; email: string; kakaowork_user_id: string; display_name?: string }> = []
  const failedList: Array<{ employee_id: string; email: string; name: string | null; reason: string }> = []

  for (const emp of employees) {
    if (!emp.email) continue
    try {
      const url = `${KAKAOWORK_API}/users.find_by_email?email=${encodeURIComponent(emp.email)}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${appKey}` },
      })
      const json: any = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success || !json?.user?.id) {
        failedList.push({
          employee_id: emp.id,
          email: emp.email,
          name: emp.name,
          reason: json?.error?.message || `HTTP ${res.status}`,
        })
        continue
      }
      matched.push({
        employee_id: emp.id,
        email: emp.email,
        kakaowork_user_id: String(json.user.id),
        display_name: json.user.name,
      })
    } catch (err: any) {
      failedList.push({
        employee_id: emp.id,
        email: emp.email,
        name: emp.name,
        reason: err?.message || 'unknown',
      })
    }
  }

  // 5) employee_kakaowork_map 에 upsert
  if (matched.length > 0) {
    const upsertRes = await fetch(`${baseUrl}/rest/v1/employee_kakaowork_map`, {
      method: 'POST',
      headers: {
        ...sbHeaders,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(
        matched.map((m) => ({
          employee_id: m.employee_id,
          kakaowork_user_id: m.kakaowork_user_id,
          email_used: m.email,
          display_name: m.display_name || null,
          synced_at: new Date().toISOString(),
        })),
      ),
    })
    if (!upsertRes.ok) {
      const detail = await upsertRes.text()
      return jsonResponse({ error: 'upsert 실패', detail }, 500)
    }
  }

  return jsonResponse({
    total: employees.length,
    matched: matched.length,
    failed: failedList.length,
    failedList,
  })
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'OPTIONS') return onRequestOptions()
  if (ctx.request.method === 'POST') return onRequestPost(ctx)
  return new Response('Method not allowed', { status: 405 })
}
