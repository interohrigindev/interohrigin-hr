/**
 * Cloudflare Pages Function — 슬랙 → HR 플랫폼 브릿지
 * POST /api/slack-webhook
 *
 * 오픈클로 에이전트(슬랙)가 CEO 코멘트/지시를 HR 플랫폼에 반영.
 * CEO_STAFF_TOKEN으로 인증.
 *
 * Actions:
 *   - comment_employee: 직원에게 코멘트 전달
 *   - comment_project: 프로젝트에 코멘트 전달
 *   - comment_report: 업무보고에 코멘트 전달
 *   - update_task_priority: 업무 우선순위 변경
 *   - get_employee_info: 직원 정보 조회
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

async function supabaseQuery(env: Env, path: string, options: RequestInit = {}): Promise<any> {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase error: ${err}`)
  }
  return res.json()
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const authHeader = context.request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!context.env.CEO_STAFF_TOKEN || token !== context.env.CEO_STAFF_TOKEN) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  try {
    const body = await context.request.json() as Record<string, any>
    const { action } = body

    switch (action) {
      case 'comment_employee': {
        // CEO가 직원에게 코멘트 (special_notes에 저장)
        const { employee_id, content, note_type = 'positive', severity = 'minor' } = body
        if (!employee_id || !content) return jsonResponse({ error: 'employee_id and content required' }, 400)

        // CEO의 employee_id 조회
        const ceos = await supabaseQuery(context.env, 'employees?role=eq.ceo&limit=1')
        const ceoId = ceos?.[0]?.id

        const result = await supabaseQuery(context.env, 'special_notes', {
          method: 'POST',
          body: JSON.stringify({
            employee_id,
            author_id: ceoId || employee_id,
            note_type,
            content,
            severity,
          }),
        })
        return jsonResponse({ success: true, note: result })
      }

      case 'comment_project': {
        // 프로젝트에 업데이트 코멘트
        const { project_id, content, author_id } = body
        if (!project_id || !content) return jsonResponse({ error: 'project_id and content required' }, 400)

        const ceos = await supabaseQuery(context.env, 'employees?role=eq.ceo&limit=1')
        const ceoId = author_id || ceos?.[0]?.id

        const result = await supabaseQuery(context.env, 'project_updates', {
          method: 'POST',
          body: JSON.stringify({
            project_id,
            author_id: ceoId,
            content,
            update_type: 'comment',
          }),
        })
        return jsonResponse({ success: true, update: result })
      }

      case 'comment_report': {
        // 업무보고에 코멘트 (report_comments)
        const { report_id, content, sentiment = 'neutral' } = body
        if (!report_id || !content) return jsonResponse({ error: 'report_id and content required' }, 400)

        const ceos = await supabaseQuery(context.env, 'employees?role=eq.ceo&limit=1')
        const ceoId = ceos?.[0]?.id

        const result = await supabaseQuery(context.env, 'report_comments', {
          method: 'POST',
          body: JSON.stringify({
            report_type: 'daily_report',
            report_id,
            author_id: ceoId,
            content,
            sentiment,
          }),
        })
        return jsonResponse({ success: true, comment: result })
      }

      case 'update_task_priority': {
        // 업무 우선순위 변경
        const { task_id, priority } = body
        if (!task_id || !priority) return jsonResponse({ error: 'task_id and priority required' }, 400)

        await supabaseQuery(context.env, `tasks?id=eq.${task_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ priority }),
        })
        return jsonResponse({ success: true, message: `Task ${task_id} priority → ${priority}` })
      }

      case 'get_employee_info': {
        // 직원 정보 조회
        const { name } = body
        if (!name) return jsonResponse({ error: 'name required' }, 400)

        const employees = await supabaseQuery(context.env, `employees?name=ilike.*${encodeURIComponent(name)}*&is_active=eq.true&select=id,name,role,position,department_id,employment_type,hire_date`)
        return jsonResponse({ employees })
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err: any) {
    return jsonResponse({ error: err.message || 'Internal error' }, 500)
  }
}
