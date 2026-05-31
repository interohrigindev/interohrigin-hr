/**
 * Cloudflare Pages Function — 수습평가 D-day 평가자 알림 cron
 * POST /api/cron-probation-dday
 * Header: X-Cron-Secret: ${CRON_SECRET}
 *
 * 매일 KST 08:00 (UTC 23:00 전일, cron expr: 분-0 시-23) 실행 권장.
 * 오늘이 D-day 인 수습 평가 회차 (입사일 + 14/42/70 일) 의 평가자에게 발송:
 *  - 평가자 = (피평가자 같은 부서 + role=leader + /admin/probation 메뉴권한)
 *           + (role IN executive/director/division_head)
 *           + (role=ceo)
 *  - 채널: in_app + email + push
 *  - dedupe: related_entity_type='probation_dday', related_entity_id=emp_id (uuid). stage 별 dedupe 는 notification_deliveries 조회 시 sent_at 일자+stage 라벨로 추가 필터.
 *
 * 환경변수:
 *   CRON_SECRET                — 무단 호출 방지
 *   VITE_SUPABASE_URL          — Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service Role Key (RLS bypass)
 *   GMAIL_*                    — 이메일 발송 (간접 — /api/send-email 호출)
 *   VAPID_*                    — 푸시 발송 (간접 — /api/send-push 호출)
 */

interface Env {
  CRON_SECRET?: string
  VITE_SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface Employee {
  id: string
  name: string
  email: string | null
  role: string | null
  is_active: boolean | null
  employment_type: string | null
  department_id: string | null
  hire_date: string | null
}
interface MenuPermission { employee_id: string; allowed_menus: string[] | null }
interface Evaluation { employee_id: string; stage: string }
interface Closure { employee_id: string; stage: string }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Secret',
}
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const STAGES = ['round1', 'round2', 'round3'] as const
const STAGE_LABELS: Record<string, string> = { round1: '1회차 (입사 2주)', round2: '2회차 (입사 6주)', round3: '3회차 (입사 10주)' }
const STAGE_OFFSET_DAYS: Record<string, number> = { round1: 14, round2: 42, round3: 70 }

// KST 오늘(자정) ms
function kstTodayMidnightMs(): number {
  const now = new Date()
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  return new Date(`${dateStr}T00:00:00+09:00`).getTime()
}
function kstMidnightFromDateStr(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00+09:00`).getTime()
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS_HEADERS })

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env
  const secret = ctx.request.headers.get('X-Cron-Secret')
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) return jsonResponse({ error: 'unauthorized' }, 401)
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return jsonResponse({ error: 'Supabase 서비스 키 미설정' }, 500)

  const baseUrl = env.VITE_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const sbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
  const origin = new URL(ctx.request.url).origin
  const todayKst = kstTodayMidnightMs()

  // 1) 활성 + 수습 직원 조회
  const empUrl = `${baseUrl}/rest/v1/employees?select=id,name,email,role,is_active,employment_type,department_id,hire_date&is_active=eq.true&hire_date=not.is.null`
  const empRes = await fetch(empUrl, { headers: sbHeaders })
  const allEmps: Employee[] = empRes.ok ? await empRes.json() : []

  // 평가 대상: employment_type='probation' (또는 position 에 '수습' 포함 — 보수적으로 probation 만)
  const probationEmps = allEmps.filter((e) => e.employment_type === 'probation')

  // 오늘이 D-day 인 (직원,stage) 쌍 추출
  const ddayPairs: Array<{ emp: Employee; stage: string }> = []
  for (const emp of probationEmps) {
    if (!emp.hire_date) continue
    const hireMs = kstMidnightFromDateStr(emp.hire_date)
    for (const stage of STAGES) {
      const stageMs = hireMs + STAGE_OFFSET_DAYS[stage] * 86400000
      if (stageMs === todayKst) {
        ddayPairs.push({ emp, stage })
      }
    }
  }

  if (ddayPairs.length === 0) {
    return jsonResponse({ scanned: 0, message: '오늘 D-day 인 수습 회차 없음' })
  }

  // 2) 이미 완료/마감된 회차는 제외
  const ddayEmpIds = [...new Set(ddayPairs.map((p) => p.emp.id))]
  const idsParam = ddayEmpIds.map((id) => `"${id}"`).join(',')
  const [evalRes, closureRes, menuRes] = await Promise.all([
    fetch(`${baseUrl}/rest/v1/probation_evaluations?select=employee_id,stage&employee_id=in.(${idsParam})`, { headers: sbHeaders }),
    fetch(`${baseUrl}/rest/v1/probation_round_closures?select=employee_id,stage&employee_id=in.(${idsParam})`, { headers: sbHeaders }),
    fetch(`${baseUrl}/rest/v1/menu_permissions?select=employee_id,allowed_menus`, { headers: sbHeaders }),
  ])
  const evals: Evaluation[] = evalRes.ok ? await evalRes.json() : []
  const closures: Closure[] = closureRes.ok ? await closureRes.json() : []
  const menus: MenuPermission[] = menuRes.ok ? await menuRes.json() : []
  const completedKey = new Set<string>()
  evals.forEach((e) => completedKey.add(`${e.employee_id}:${e.stage}`))
  closures.forEach((c) => completedKey.add(`${c.employee_id}:${c.stage}`))

  const activePairs = ddayPairs.filter((p) => !completedKey.has(`${p.emp.id}:${p.stage}`))

  // 3) 평가자 모집 (피평가자 부서별 리더 + 전 임원 + 전 대표)
  function evaluatorsFor(emp: Employee): Employee[] {
    const out: Employee[] = []
    // 리더: 같은 부서 + role=leader + 활성 + 수습 아님 + menu_permissions 에 /admin/probation 포함
    const leaders = allEmps.filter((e) => {
      if (e.role !== 'leader') return false
      if (e.is_active === false) return false
      if (e.employment_type === 'probation') return false
      if (!emp.department_id || e.department_id !== emp.department_id) return false
      const mList = menus.find((m) => m.employee_id === e.id)?.allowed_menus || []
      return mList.includes('/admin/probation')
    })
    out.push(...leaders)
    // 임원
    const execs = allEmps.filter((e) => ['executive', 'director', 'division_head'].includes(e.role || '') && e.is_active !== false)
    out.push(...execs)
    // 대표
    const ceos = allEmps.filter((e) => e.role === 'ceo' && e.is_active !== false)
    out.push(...ceos)
    // 중복 제거
    const seen = new Set<string>()
    return out.filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true })
  }

  // 4) 발송 헬퍼
  const APP_URL = 'https://hr.interohrigin.com'
  async function insertInApp(uid: string, subject: string, body: string, relatedKey: string) {
    const res = await fetch(`${baseUrl}/rest/v1/notification_deliveries`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        channel: 'in_app',
        recipient_uid: uid,
        subject,
        payload: { body, url: '/admin/probation' },
        status: 'sent',
        related_entity_type: 'probation_dday',
        related_entity_id: relatedKey,
        sent_at: new Date().toISOString(),
      }),
    })
    return res.ok ? 'sent' : `failed:${res.status}`
  }
  async function sendPush(uid: string, title: string, body: string) {
    try {
      const res = await fetch(`${origin}/api/send-push`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_uid: uid, title, body, url: '/admin/probation' }),
      })
      return res.ok ? 'sent' : `failed:${res.status}`
    } catch (err) { return `error:${(err as Error).message.slice(0, 60)}` }
  }
  async function sendEmail(to: string, subject: string, html: string) {
    try {
      const res = await fetch(`${origin}/api/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, html }),
      })
      return res.ok ? 'sent' : `failed:${res.status}`
    } catch (err) { return `error:${(err as Error).message.slice(0, 60)}` }
  }

  // 5) dedupe — 같은 day, 같은 직원에 대해 이미 발송한 (평가자) 는 스킵.
  //    오늘(KST 자정) 이후 발송된 deliveries 만 조회 — sent_at >= todayKst ISO
  const todayKstIso = new Date(todayKst).toISOString()
  const allEmpIds = [...new Set(activePairs.map((p) => p.emp.id))]
  const idsIn = allEmpIds.length > 0
    ? `&related_entity_id=in.(${allEmpIds.map((id) => `"${id}"`).join(',')})`
    : ''
  const dedupeUrl = `${baseUrl}/rest/v1/notification_deliveries?select=recipient_uid,related_entity_id&related_entity_type=eq.probation_dday&sent_at=gte.${encodeURIComponent(todayKstIso)}${idsIn}`
  const dedupeRes = await fetch(dedupeUrl, { headers: sbHeaders })
  const dedupeRows: Array<{ recipient_uid: string; related_entity_id: string }> = dedupeRes.ok ? await dedupeRes.json() : []
  const alreadySent = new Set(dedupeRows.map((r) => `${r.recipient_uid}::${r.related_entity_id}`))

  // 6) 발송
  type Result = { uid: string; emp: string; stage: string; in_app?: string; push?: string; email?: string; skipped?: string }
  const results: Result[] = []
  for (const { emp, stage } of activePairs) {
    // related_entity_id 는 uuid 타입이라 emp.id 만. stage 별 dedupe 는 subject 또는 sent_at 일자로 분리.
    const relatedKey = emp.id
    const evaluators = evaluatorsFor(emp)
    const stageLabel = STAGE_LABELS[stage] || stage
    const subject = `🎓 수습평가 D-day — ${emp.name} ${stageLabel}`
    const bodyText = `오늘은 ${emp.name}님의 ${stageLabel} 수습평가 시작일입니다.\nHR 플랫폼 → 수습평가 메뉴에서 평가를 진행해주세요.`
    const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#7c3aed;">🎓 수습평가 D-day 안내</h2>
  <p>오늘은 아래 직원의 <strong>${stageLabel}</strong> 수습평가 시작일입니다.</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;">
    <tr><td style="padding:8px;border:1px solid #ddd;width:120px;">피평가자</td><td style="padding:8px;border:1px solid #ddd;"><strong>${emp.name}</strong></td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;">평가 회차</td><td style="padding:8px;border:1px solid #ddd;">${stageLabel}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;">평가 기간</td><td style="padding:8px;border:1px solid #ddd;">오늘부터 7일 이내</td></tr>
  </table>
  <p style="margin:24px 0;">
    <a href="${APP_URL}/admin/probation" style="display:inline-block;background:#7c3aed;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">평가 진행하기</a>
  </p>
  <p style="color:#666;font-size:12px;">평가 기한(7일) 내 미평가 시 자동 마감되며 관리자 강제 해제가 필요합니다.</p>
</div>`.trim()

    for (const ev of evaluators) {
      if (alreadySent.has(`${ev.id}::${relatedKey}`)) {
        results.push({ uid: ev.id, emp: emp.name, stage, skipped: 'already_notified' })
        continue
      }
      const inApp = await insertInApp(ev.id, subject, bodyText, relatedKey)
      const push = await sendPush(ev.id, subject, bodyText)
      const email = ev.email ? await sendEmail(ev.email, subject, html) : 'no_email'
      results.push({ uid: ev.id, emp: emp.name, stage, in_app: inApp, push, email })
    }
  }

  return jsonResponse({
    todayKst: new Date(todayKst).toISOString(),
    scanned: ddayPairs.length,
    activeAfterDedupe: activePairs.length,
    totalSent: results.filter((r) => !r.skipped).length,
    skippedDuplicates: results.filter((r) => r.skipped).length,
    results,
  })
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'OPTIONS') return onRequestOptions()
  if (ctx.request.method === 'POST') return onRequestPost(ctx)
  return jsonResponse({ error: 'method_not_allowed' }, 405)
}
