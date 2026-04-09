/**
 * Cloudflare Pages Function — CEO 참모 API 프록시
 * POST /api/ceo-staff
 *
 * 오픈클로 에이전트(로컬)가 Bearer Token으로 호출.
 * Service Role Key는 서버에만 존재하여 보안 유지.
 *
 * Actions:
 *   - daily_report: 일일 CEO 브리핑 데이터
 *   - employee_signal: 전 직원 신호등 등급
 *   - employees: 직원 목록 조회
 *   - evaluations: 평가 데이터 조회
 *   - projects: 프로젝트 현황 조회
 *   - recruitment: 채용 현황 조회
 *   - probation: 수습 평가 현황 조회
 *   - query: 자연어 질의 (테이블/필터 기반)
 */

interface Env {
  CEO_STAFF_TOKEN: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// Supabase REST API 호출 헬퍼
async function supabaseQuery(env: Env, table: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase query failed (${table}): ${err}`)
  }

  return res.json()
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // Bearer Token 인증
  const authHeader = context.request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!context.env.CEO_STAFF_TOKEN || token !== context.env.CEO_STAFF_TOKEN) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase configuration missing' }, 500)
  }

  try {
    const body = await context.request.json() as Record<string, any>
    const { action } = body

    switch (action) {
      case 'daily_report':
        return jsonResponse(await getDailyReport(context.env))

      case 'employee_signal':
        return jsonResponse(await getEmployeeSignal(context.env))

      case 'employees':
        return jsonResponse(await getEmployees(context.env, body))

      case 'evaluations':
        return jsonResponse(await getEvaluations(context.env, body))

      case 'projects':
        return jsonResponse(await getProjects(context.env))

      case 'recruitment':
        return jsonResponse(await getRecruitment(context.env))

      case 'probation':
        return jsonResponse(await getProbation(context.env))

      case 'query':
        return jsonResponse(await handleQuery(context.env, body))

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err: any) {
    return jsonResponse({ error: err.message || 'Internal server error' }, 500)
  }
}

// ─── 일일 CEO 리포트 ────────────────────────────────────────────

async function getDailyReport(env: Env) {
  const today = new Date().toISOString().slice(0, 10)

  const [employees, probationEvals, projects, jobPostings, meetings] = await Promise.all([
    supabaseQuery(env, 'employees', { select: 'id,name,role,position,department_id,employment_type,is_active,hire_date', 'is_active': 'eq.true' }),
    supabaseQuery(env, 'probation_evaluations', { select: '*', order: 'created_at.desc', limit: '50' }),
    supabaseQuery(env, 'projects', { select: 'id,name,status,priority,start_date,end_date', order: 'updated_at.desc', limit: '20' }),
    supabaseQuery(env, 'job_postings', { select: 'id,title,status,deadline', 'status': 'eq.published', order: 'created_at.desc' }),
    supabaseQuery(env, 'meeting_records', { select: 'id,title,status,duration_seconds,created_at', order: 'created_at.desc', limit: '5' }),
  ])

  const totalEmployees = employees?.length || 0
  const probationEmployees = employees?.filter((e: any) => e.employment_type === 'probation' || (e.position ?? '').includes('수습')) || []
  const activeJobs = jobPostings?.length || 0

  // 프로젝트 상태별 집계
  const projectsByStatus: Record<string, number> = {}
  for (const p of (projects || [])) {
    projectsByStatus[p.status] = (projectsByStatus[p.status] || 0) + 1
  }

  return {
    report_date: today,
    generated_at: new Date().toISOString(),
    summary: {
      total_employees: totalEmployees,
      probation_employees: probationEmployees.length,
      probation_names: probationEmployees.map((e: any) => e.name),
      active_job_postings: activeJobs,
      recent_evaluations: probationEvals?.length || 0,
      projects: projectsByStatus,
      recent_meetings: (meetings || []).map((m: any) => ({
        title: m.title,
        status: m.status,
        duration_min: m.duration_seconds ? Math.round(m.duration_seconds / 60) : null,
        date: m.created_at,
      })),
    },
    employees: employees,
    probation: {
      employees: probationEmployees,
      evaluations: probationEvals,
    },
    projects: projects,
    recruitment: {
      active_postings: jobPostings,
    },
  }
}

// ─── 직원 신호등 ─────────────────────────────────────────────────

async function getEmployeeSignal(env: Env) {
  const [employees, probationEvals, peerReviews] = await Promise.all([
    supabaseQuery(env, 'employees', { select: 'id,name,role,position,department_id,employment_type,is_active', 'is_active': 'eq.true' }),
    supabaseQuery(env, 'probation_evaluations', { select: '*' }),
    supabaseQuery(env, 'peer_reviews', { select: '*', 'is_submitted': 'eq.true' }),
  ])

  // 직원별 평가 데이터 집계
  const signals = (employees || []).map((emp: any) => {
    const empEvals = (probationEvals || []).filter((e: any) => e.employee_id === emp.id)
    const empPeerReviews = (peerReviews || []).filter((r: any) => r.reviewee_id === emp.id)

    // 점수 계산
    const evalScores = empEvals.map((e: any) => {
      const scores = e.scores || {}
      return Object.values(scores).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
    })
    const avgEvalScore = evalScores.length > 0 ? evalScores.reduce((a: number, b: number) => a + b, 0) / evalScores.length : null
    const avgPeerScore = empPeerReviews.length > 0
      ? empPeerReviews.reduce((sum: number, r: any) => sum + (r.overall_score || 0), 0) / empPeerReviews.length
      : null

    // 신호등 계산 (간이 버전 — 추후 AI 분석으로 교체)
    let signal: 'green' | 'yellow' | 'red' | 'black' = 'yellow'
    if (avgEvalScore !== null) {
      if (avgEvalScore >= 80) signal = 'green'
      else if (avgEvalScore >= 60) signal = 'yellow'
      else if (avgEvalScore >= 40) signal = 'red'
      else signal = 'black'
    }

    return {
      id: emp.id,
      name: emp.name,
      role: emp.role,
      position: emp.position,
      department_id: emp.department_id,
      employment_type: emp.employment_type,
      signal,
      avg_eval_score: avgEvalScore ? Math.round(avgEvalScore * 10) / 10 : null,
      avg_peer_score: avgPeerScore ? Math.round(avgPeerScore * 10) / 10 : null,
      eval_count: empEvals.length,
      peer_review_count: empPeerReviews.length,
    }
  })

  const grouped = {
    green: signals.filter((s: any) => s.signal === 'green'),
    yellow: signals.filter((s: any) => s.signal === 'yellow'),
    red: signals.filter((s: any) => s.signal === 'red'),
    black: signals.filter((s: any) => s.signal === 'black'),
  }

  return { signals, grouped, total: signals.length }
}

// ─── 직원 조회 ───────────────────────────────────────────────────

async function getEmployees(env: Env, body: Record<string, any>) {
  const params: Record<string, string> = {
    select: body.select || '*',
    'is_active': 'eq.true',
    order: 'name',
  }
  if (body.employee_id) params['id'] = `eq.${body.employee_id}`
  if (body.department_id) params['department_id'] = `eq.${body.department_id}`

  return supabaseQuery(env, 'employees', params)
}

// ─── 평가 조회 ───────────────────────────────────────────────────

async function getEvaluations(env: Env, body: Record<string, any>) {
  const params: Record<string, string> = {
    select: '*',
    order: 'created_at.desc',
    limit: body.limit || '100',
  }
  if (body.employee_id) params['employee_id'] = `eq.${body.employee_id}`

  return supabaseQuery(env, 'probation_evaluations', params)
}

// ─── 프로젝트 조회 ──────────────────────────────────────────────

async function getProjects(env: Env) {
  return supabaseQuery(env, 'projects', {
    select: 'id,name,status,priority,start_date,end_date,description',
    order: 'updated_at.desc',
    limit: '30',
  })
}

// ─── 채용 현황 ───────────────────────────────────────────────────

async function getRecruitment(env: Env) {
  const [postings, candidates] = await Promise.all([
    supabaseQuery(env, 'job_postings', { select: '*', order: 'created_at.desc', limit: '20' }),
    supabaseQuery(env, 'candidates', { select: 'id,name,status,job_posting_id,created_at', order: 'created_at.desc', limit: '50' }),
  ])

  return {
    postings: postings || [],
    candidates: candidates || [],
    stats: {
      total_postings: postings?.length || 0,
      published: postings?.filter((p: any) => p.status === 'published').length || 0,
      total_candidates: candidates?.length || 0,
    },
  }
}

// ─── 수습 현황 ───────────────────────────────────────────────────

async function getProbation(env: Env) {
  const [employees, evaluations] = await Promise.all([
    supabaseQuery(env, 'employees', {
      select: 'id,name,position,department_id,hire_date,employment_type',
      'is_active': 'eq.true',
    }),
    supabaseQuery(env, 'probation_evaluations', { select: '*', order: 'created_at.desc' }),
  ])

  const probationEmployees = (employees || []).filter((e: any) =>
    e.employment_type === 'probation' || (e.position ?? '').includes('수습')
  )

  return {
    employees: probationEmployees,
    evaluations: evaluations || [],
  }
}

// ─── 자연어 질의 (테이블 기반) ──────────────────────────────────

async function handleQuery(env: Env, body: Record<string, any>) {
  const { table, select, filters, limit } = body

  if (!table) return { error: 'table is required for query action' }

  const allowedTables = [
    'employees', 'probation_evaluations', 'peer_reviews',
    'projects', 'project_tasks', 'job_postings', 'candidates',
    'meeting_records', 'monthly_checkins', 'agent_conversations',
    'departments',
  ]

  if (!allowedTables.includes(table)) {
    return { error: `Table not allowed: ${table}. Allowed: ${allowedTables.join(', ')}` }
  }

  const params: Record<string, string> = {
    select: select || '*',
    limit: String(limit || 50),
  }

  if (filters && typeof filters === 'object') {
    for (const [k, v] of Object.entries(filters)) {
      params[k] = String(v)
    }
  }

  return supabaseQuery(env, table, params)
}
