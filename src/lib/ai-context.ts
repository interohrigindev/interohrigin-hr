/**
 * RAG 컨텍스트 빌더 — 플랫폼 데이터를 AI 시스템 프롬프트에 주입
 */
import { supabase } from './supabase'

/** 플랫폼 전체 현황을 요약 텍스트로 반환 */
export async function buildPlatformContext(_userId?: string): Promise<string> {
  const sections: string[] = []

  try {
    const [empRes, deptRes, projRes, candRes, postRes, evalRes, leaveRes, signalRes] = await Promise.all([
      supabase.from('employees').select('id, name, department_id, role, is_active, employment_type, position, hire_date'),
      supabase.from('departments').select('id, name, parent_id'),
      supabase.from('projects').select('id, project_name, status, brand, category, manager_name, launch_date').order('updated_at', { ascending: false }).limit(20),
      supabase.from('candidates').select('id, name, status, job_posting_id, created_at').order('created_at', { ascending: false }).limit(30),
      supabase.from('job_postings').select('id, title, status, deadline').order('created_at', { ascending: false }).limit(10),
      supabase.from('probation_evaluations').select('id, employee_id, stage, evaluator_role, scores, continuation_recommendation, created_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('leave_requests').select('id, requester_id, leave_type, start_date, end_date, status, created_at').order('created_at', { ascending: false }).limit(10),
      supabase.from('employee_signals').select('employee_id, signal_color, total_score').order('updated_at', { ascending: false }).limit(50),
    ])

    const employees = empRes.data || []
    const departments = deptRes.data || []
    const projects = projRes.data || []
    const candidates = candRes.data || []
    const postings = postRes.data || []
    const probEvals = evalRes.data || []
    const leaves = leaveRes.data || []
    const signals = signalRes.data || []

    // ─── 1. 직원 현황 ───
    const activeEmps = employees.filter((e: any) => e.is_active)
    const probationEmps = activeEmps.filter((e: any) => e.employment_type === 'probation')
    const deptMap = new Map(departments.map((d: any) => [d.id, d.name]))

    const deptCounts = new Map<string, number>()
    activeEmps.forEach((e: any) => {
      const deptName = deptMap.get(e.department_id) || '미배정'
      deptCounts.set(deptName, (deptCounts.get(deptName) || 0) + 1)
    })

    sections.push(`[직원 현황]
전체 활성 직원: ${activeEmps.length}명 | 수습: ${probationEmps.length}명 | 비활성(퇴사): ${employees.length - activeEmps.length}명
부서별: ${Array.from(deptCounts.entries()).map(([d, c]) => `${d} ${c}명`).join(', ')}
${probationEmps.length > 0 ? `수습 직원: ${probationEmps.map((e: any) => `${e.name}(${deptMap.get(e.department_id) || '미배정'})`).join(', ')}` : ''}`)

    // ─── 2. 직원 신호등 ───
    if (signals.length > 0) {
      const colorMap = { green: '우수', yellow: '보통', red: '주의', black: '위험' }
      const colorCounts: Record<string, number> = {}
      signals.forEach((s: any) => {
        colorCounts[s.signal_color] = (colorCounts[s.signal_color] || 0) + 1
      })
      const warningEmps = signals.filter((s: any) => s.signal_color === 'red' || s.signal_color === 'black')
      sections.push(`[직원 신호등]
${Object.entries(colorCounts).map(([c, n]) => `${(colorMap as any)[c] || c}: ${n}명`).join(' | ')}
${warningEmps.length > 0 ? `주의/위험 직원: ${warningEmps.map((s: any) => {
  const emp = employees.find((e: any) => e.id === s.employee_id)
  return emp ? `${emp.name}(${s.total_score}점)` : ''
}).filter(Boolean).join(', ')}` : ''}`)
    }

    // ─── 3. 프로젝트 현황 ───
    if (projects.length > 0) {
      const statusCounts: Record<string, number> = {}
      projects.forEach((p: any) => { statusCounts[p.status] = (statusCounts[p.status] || 0) + 1 })
      const statusLabels: Record<string, string> = { in_progress: '진행중', completed: '완료', on_hold: '보류', cancelled: '취소' }

      sections.push(`[프로젝트 현황] 총 ${projects.length}건
상태별: ${Object.entries(statusCounts).map(([s, c]) => `${statusLabels[s] || s} ${c}건`).join(', ')}
주요 프로젝트:
${projects.slice(0, 8).map((p: any) => `- ${p.project_name} (${statusLabels[p.status] || p.status}) ${p.brand || ''} ${p.launch_date ? `마감:${p.launch_date}` : ''}`).join('\n')}`)
    }

    // ─── 4. 채용 현황 ───
    const openPostings = postings.filter((p: any) => p.status === 'open')
    const statusLabels: Record<string, string> = {
      applied: '지원', resume_reviewed: '서류검토', survey_sent: '설문발송', survey_done: '설문완료',
      interview_scheduled: '면접예정', video_done: '화상완료', face_to_face_done: '대면완료',
      analyzed: '분석완료', decided: '결정', hired: '합격', rejected: '불합격',
    }
    const candStatusCounts: Record<string, number> = {}
    candidates.forEach((c: any) => { candStatusCounts[c.status] = (candStatusCounts[c.status] || 0) + 1 })

    sections.push(`[채용 현황]
진행중 공고: ${openPostings.length}건 | 전체 지원자: ${candidates.length}명
${openPostings.length > 0 ? `공고: ${openPostings.map((p: any) => `${p.title}(마감:${p.deadline || '미정'})`).join(', ')}` : ''}
지원자 상태: ${Object.entries(candStatusCounts).map(([s, c]) => `${statusLabels[s] || s} ${c}명`).join(', ')}`)

    // ─── 5. 수습평가 현황 ───
    if (probEvals.length > 0) {
      const evalByEmp = new Map<string, any[]>()
      probEvals.forEach((ev: any) => {
        if (!evalByEmp.has(ev.employee_id)) evalByEmp.set(ev.employee_id, [])
        evalByEmp.get(ev.employee_id)!.push(ev)
      })

      sections.push(`[수습평가 현황] ${evalByEmp.size}명 평가 진행
${Array.from(evalByEmp.entries()).slice(0, 5).map(([empId, evals]) => {
  const emp = employees.find((e: any) => e.id === empId)
  const stages = [...new Set(evals.map((e: any) => e.stage))].sort()
  const latest = evals[0]
  const scores = latest.scores as Record<string, number>
  const total = Object.values(scores).reduce((a: number, b: number) => a + b, 0)
  return `- ${emp?.name || '?'}: ${stages.length}회차 완료, 최근 ${total}/100점, 권고: ${latest.continuation_recommendation || '없음'}`
}).join('\n')}`)
    }

    // ─── 6. 연차/결재 현황 ───
    if (leaves.length > 0) {
      const pending = leaves.filter((l: any) => l.status === 'pending')
      sections.push(`[연차/결재] 최근 신청 ${leaves.length}건 | 대기중 ${pending.length}건`)
    }

  } catch (err) {
    console.warn('[RAG] 컨텍스트 빌드 실패:', err)
    return ''
  }

  if (sections.length === 0) return ''

  return `\n\n─── 플랫폼 실시간 데이터 (${new Date().toLocaleDateString('ko-KR')}) ───\n${sections.join('\n\n')}\n─── 데이터 끝 ───\n\n위 데이터를 참고하여 질문에 정확히 답변하세요. 데이터에 없는 내용은 "확인할 수 없습니다"라고 답하세요.`
}
