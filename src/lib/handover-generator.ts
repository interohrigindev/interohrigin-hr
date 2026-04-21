import { supabase } from '@/lib/supabase'
import { generateAIContentSafe } from '@/lib/ai-client'
import type { HandoverDocumentContent } from '@/types/employee-lifecycle'

const HANDOVER_SYSTEM = `당신은 인터오리진(InterOhrigin) HR 시스템의 인수인계 자동화 AI입니다.
퇴직 예정자의 업무 데이터를 분석하여 후임자가 즉시 업무를 이어받을 수 있도록 체계적인 인수인계서 초안을 작성합니다.

규칙:
- 반드시 유효한 JSON만 출력 (마크다운 코드블록 포함 금지, 설명 없음)
- 모든 텍스트는 한국어
- 없는 데이터는 빈 배열/빈 문자열로 처리
- 과장하거나 데이터에 없는 내용을 추가하지 않음`

interface RawProject {
  id: string
  title: string
  description?: string | null
  assignee_ids?: string[] | null
}

interface RawStage {
  id: string
  title: string
  project_id: string
  status?: string | null
  project?: { title?: string } | null
}

interface RawReport {
  id: string
  created_at: string
  in_progress?: unknown[] | null
  completed?: unknown[] | null
  blockers?: string | null
}

function taskTitle(item: unknown): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    return String(o.title || o.text || o.name || '')
  }
  return ''
}

export async function generateHandoverDraft(
  employeeId: string,
  employeeName: string
): Promise<{ content: HandoverDocumentContent | null; error?: string }> {
  // 1) 데이터 수집
  const [projectsRes, stagesRes, reportsRes, assetsRes, employeeRes] = await Promise.all([
    supabase
      .from('project_boards')
      .select('id, title, description, assignee_ids')
      .contains('assignee_ids', [employeeId])
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('pipeline_stages')
      .select('id, title, project_id, status, project:project_boards(title)')
      .order('updated_at', { ascending: false })
      .limit(40),
    supabase
      .from('daily_reports')
      .select('id, created_at, in_progress, completed, blockers')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('handover_assets')
      .select('asset_type, name, location, url, note')
      .eq('employee_id', employeeId),
    supabase
      .from('employees')
      .select('department_id, position, departments(name)')
      .eq('id', employeeId)
      .single(),
  ])

  const projects = (projectsRes.data || []) as RawProject[]
  const allStages = (stagesRes.data || []) as RawStage[]
  const reports = (reportsRes.data || []) as RawReport[]
  const assets = assetsRes.data || []
  const emp = employeeRes.data as { department_id?: string | null; position?: string | null; departments?: { name?: string } | null } | null

  // 내 프로젝트 ID 집합
  const myProjectIds = new Set(projects.map((p) => p.id))
  const myStages = allStages.filter((s) => myProjectIds.has(s.project_id))

  // 최근 보고서에서 진행 중 작업 + 완료 작업 추출
  const recentInProgress: string[] = []
  const recentCompleted: string[] = []
  for (const r of reports.slice(0, 5)) {
    if (Array.isArray(r.in_progress)) {
      for (const t of r.in_progress) {
        const title = taskTitle(t)
        if (title && !recentInProgress.includes(title)) recentInProgress.push(title)
      }
    }
    if (Array.isArray(r.completed)) {
      for (const t of r.completed) {
        const title = taskTitle(t)
        if (title && !recentCompleted.includes(title)) recentCompleted.push(title)
      }
    }
  }

  // blockers 수집
  const blockerTexts = reports
    .filter((r) => r.blockers && String(r.blockers).trim())
    .slice(0, 3)
    .map((r) => String(r.blockers))

  // 데이터 요약 빌드
  const dataSummary = {
    employee: {
      name: employeeName,
      department: emp?.departments?.name || '',
      position: emp?.position || '',
    },
    projects: projects.slice(0, 10).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description || '',
      stages: myStages
        .filter((s) => s.project_id === p.id)
        .slice(0, 5)
        .map((s) => ({ title: s.title, status: s.status || '' })),
    })),
    recentWork: {
      inProgress: recentInProgress.slice(0, 10),
      completed: recentCompleted.slice(0, 10),
      blockers: blockerTexts,
    },
    assets: assets.slice(0, 20).map((a) => ({
      type: a.asset_type,
      name: a.name,
      location: a.location || '',
      url: a.url || '',
      note: a.note || '',
    })),
  }

  const prompt = `${HANDOVER_SYSTEM}

아래 데이터를 기반으로 ${employeeName} 직원의 인수인계서 JSON을 작성해주세요.

=== 업무 데이터 ===
${JSON.stringify(dataSummary, null, 2)}

=== 출력 형식 (JSON 스키마) ===
{
  "overview": "string — 해당 직원의 주요 업무·역할 요약 (3~5문장)",
  "projects": [
    {
      "name": "string",
      "role": "string — 담당자 역할",
      "status": "string — 현재 진행 상태",
      "handover_points": ["string", ...],
      "successor_action": ["string", ...]
    }
  ],
  "daily_summary": "string — 일상 루틴·반복 업무 요약 (2~3문장)",
  "pending_tasks": [{ "title": "string", "note": "string" }],
  "knowhow": "string — 암묵지·노하우·주의사항 (자유 형식)",
  "contacts": [{ "name": "string", "role": "string", "contact": "string" }]
}

JSON만 출력하세요.`

  const result = await generateAIContentSafe('handover', prompt, { maxAttempts: 3 })

  if (!result.success || !result.content) {
    return { content: null, error: result.error || 'AI 응답 실패' }
  }

  // JSON 추출·파싱
  let raw = result.content.trim()
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) raw = fenceMatch[1].trim()
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) raw = jsonMatch[0]

  try {
    const parsed = JSON.parse(raw) as HandoverDocumentContent
    return { content: parsed }
  } catch {
    // 두 번째 시도: 더 관대한 파싱
    try {
      const relaxed = raw.replace(/,\s*([}\]])/g, '$1')
      const parsed = JSON.parse(relaxed) as HandoverDocumentContent
      return { content: parsed }
    } catch {
      return { content: null, error: 'AI 응답 파싱 실패: ' + raw.slice(0, 200) }
    }
  }
}
