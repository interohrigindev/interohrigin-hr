/**
 * 일일 업무보고 결재 상세 뷰 — 결재자가 보는 보고서 렌더링.
 *
 * 추가 기능 (2026-05-27): 완료/진행중/계획 업무 각 항목 옆에 해당 작업이 속한
 * **프로젝트명** 표시. 보고서 본문에는 task id 만 있으므로 tasks → projects
 * 조인 1회 fetch 후 client-side 매핑.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature } from '@/lib/ai-client'

interface ReportTask {
  id?: string
  title: string
  status?: string
  // 보고서 작성 시점에 스냅샷된 프로젝트 정보 (결재자가 tasks 를 RLS 로 못 읽어도 표시 가능)
  project_id?: string
  project_name?: string
}

interface DailyReportContent {
  report_date?: string
  completed?: ReportTask[]
  in_progress?: ReportTask[]
  planned?: ReportTask[]
  work_memo?: string
  project_memos?: Record<string, string>
  satisfaction_score?: number
  satisfaction_comment?: string
  // 결재자 가독성: 한 줄 총평 자동 요약 (업무/소견 분리). 제출 시 AI 1회 생성, 실패 시 null.
  ai_summary?: { work?: string; personal?: string } | null
  blockers?: string
}

interface ProjectInfo {
  name: string
}

// documentId 가 있으면 기존(요약 없는) 결재건도 화면 로드 시 1회 AI 요약 후 approval_documents 에 persist
export function DailyReportApprovalView({ content, documentId }: { content: DailyReportContent; documentId?: string }) {
  const [taskProjectMap, setTaskProjectMap] = useState<Record<string, string>>({})
  const [projectMemoNames, setProjectMemoNames] = useState<Record<string, string>>({})

  // 모든 task id 수집 (중복 제거)
  const allTaskIds = useMemo(() => {
    const ids = new Set<string>()
    ;[...(content.completed || []), ...(content.in_progress || []), ...(content.planned || [])].forEach((t) => {
      if (t.id) ids.add(t.id)
    })
    return Array.from(ids)
  }, [content.completed, content.in_progress, content.planned])

  // tasks → projects 조인 fetch
  useEffect(() => {
    if (allTaskIds.length === 0) {
      setTaskProjectMap({})
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, project_id, projects(name)')
        .in('id', allTaskIds)
      if (cancelled) return
      const map: Record<string, string> = {}
      ;(data || []).forEach((t: { id: string; projects?: ProjectInfo | ProjectInfo[] | null }) => {
        const proj = Array.isArray(t.projects) ? t.projects[0] : t.projects
        if (proj?.name) map[t.id] = proj.name
      })
      setTaskProjectMap(map)
    })()
    return () => { cancelled = true }
  }, [allTaskIds])

  // project_memos 의 키(project_id) → 이름 매핑
  const projectMemoKeys = useMemo(() => Object.keys(content.project_memos || {}), [content.project_memos])
  useEffect(() => {
    if (projectMemoKeys.length === 0) {
      setProjectMemoNames({})
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', projectMemoKeys)
      if (cancelled) return
      const map: Record<string, string> = {}
      ;(data || []).forEach((p: { id: string; name: string }) => { map[p.id] = p.name })
      setProjectMemoNames(map)
    })()
    return () => { cancelled = true }
  }, [projectMemoKeys])

  const renderTaskList = (
    tasks: ReportTask[],
    bullet: string,
    bulletColor: string
  ) => {
    // 프로젝트별 그룹핑 — project_name(보고서 스냅샷) 우선, tasks 재조회 fallback, 둘 다 없으면 '기타'.
    // Map 의 insertion order 로 보고서 원본 등장 순서 보존.
    const groups = new Map<string, ReportTask[]>()
    for (const t of tasks) {
      const pname = t.project_name || (t.id ? taskProjectMap[t.id] : '') || '기타'
      if (!groups.has(pname)) groups.set(pname, [])
      groups.get(pname)!.push(t)
    }
    return (
      <div className="px-3 py-2 space-y-2.5 bg-white">
        {Array.from(groups.entries()).map(([pname, items]) => {
          const isEtc = pname === '기타'
          return (
            <div key={pname}>
              <p className={`text-base font-bold mb-1 flex items-center gap-1.5 ${isEtc ? 'text-gray-400' : 'text-purple-700'}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isEtc ? 'bg-gray-300' : 'bg-purple-400'}`} />
                {pname}
              </p>
              <ul className="space-y-1 pl-3">
                {items.map((t, i) => (
                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className={`${bulletColor} mt-0.5 shrink-0`}>{bullet}</span>
                    <span className="flex-1 min-w-0">{t.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-br from-brand-50 to-purple-50 border border-brand-200 rounded-lg p-3">
        <p className="text-sm font-semibold text-brand-800 flex items-center gap-1.5">
          📝 일일 업무보고 {content.report_date && <span className="text-brand-600">({content.report_date})</span>}
        </p>
      </div>

      {content.completed && content.completed.length > 0 && (
        <div className="border border-emerald-200 rounded-lg overflow-hidden">
          <div className="bg-emerald-50 px-3 py-2 border-b border-emerald-100">
            <p className="text-xs font-semibold text-emerald-800">✅ 완료 업무 ({content.completed.length}건)</p>
          </div>
          {renderTaskList(content.completed, '✓', 'text-emerald-500')}
        </div>
      )}

      {content.in_progress && content.in_progress.length > 0 && (
        <div className="border border-blue-200 rounded-lg overflow-hidden">
          <div className="bg-blue-50 px-3 py-2 border-b border-blue-100">
            <p className="text-xs font-semibold text-blue-800">🔄 진행중 업무 ({content.in_progress.length}건)</p>
          </div>
          {renderTaskList(content.in_progress, '▸', 'text-blue-500')}
        </div>
      )}

      {content.planned && content.planned.length > 0 && (
        <div className="border border-amber-200 rounded-lg overflow-hidden">
          <div className="bg-amber-50 px-3 py-2 border-b border-amber-100">
            <p className="text-xs font-semibold text-amber-800">📅 내일 계획 ({content.planned.length}건)</p>
          </div>
          {renderTaskList(content.planned, '☐', 'text-amber-500')}
        </div>
      )}

      {/* 프로젝트별 메모 — 프로젝트명을 헤더로 노출 */}
      {content.project_memos && Object.keys(content.project_memos).length > 0 && (
        <div className="border border-violet-200 rounded-lg overflow-hidden">
          <div className="bg-violet-50 px-3 py-2 border-b border-violet-100">
            <p className="text-xs font-semibold text-violet-800">📁 프로젝트별 메모</p>
          </div>
          <div className="px-3 py-2 bg-white space-y-3">
            {Object.entries(content.project_memos).map(([pid, html]) => (
              <div key={pid}>
                <p className="text-xs font-semibold text-violet-700 mb-1">
                  {projectMemoNames[pid] || '프로젝트'}
                </p>
                <div
                  className="prose prose-sm max-w-none text-gray-800 [&_img]:rounded-md [&_img]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: html as string }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 종합 메모 */}
      {content.work_memo && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-800">🧾 작업 현황 종합 메모</p>
          </div>
          <div className="px-3 py-2 bg-white">
            <div
              className="prose prose-sm max-w-none text-gray-800 [&_img]:rounded-md [&_img]:max-w-full"
              dangerouslySetInnerHTML={{ __html: content.work_memo }}
            />
          </div>
        </div>
      )}

      {/* 만족도 + 한줄총평(요약+원문) + 블로커 */}
      {(content.satisfaction_score != null || content.satisfaction_comment || content.blockers) && (
        <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
          {content.satisfaction_score != null && (
            <p className="text-sm">
              <span className="text-gray-500">만족도:</span>{' '}
              <span className="font-semibold text-brand-700">{content.satisfaction_score}/10</span>
            </p>
          )}
          {content.satisfaction_comment && (
            <SatisfactionCommentView
              comment={content.satisfaction_comment}
              summary={content.ai_summary ?? null}
              documentId={documentId}
              fullContent={content}
            />
          )}
          {content.blockers && (
            <p className="text-sm">
              <span className="text-gray-500">이슈/블로커:</span>{' '}
              <span className="text-red-700">{content.blockers}</span>
            </p>
          )}
        </div>
      )}

      {(!content.completed || content.completed.length === 0) &&
        (!content.in_progress || content.in_progress.length === 0) &&
        (!content.planned || content.planned.length === 0) &&
        (!content.work_memo) &&
        (!content.project_memos || Object.keys(content.project_memos).length === 0) && (
          <p className="text-sm text-gray-400 text-center py-4">작성된 업무가 없습니다</p>
        )}
    </div>
  )
}

// 한 줄 총평: AI 요약(업무/소견 분리)을 먼저 보여주고, 원문은 토글로 펼쳐서 확인
// - summary 가 있으면 그대로 표시 (제출 시 생성한 결과)
// - summary 가 없고 documentId 가 있으면 화면 로드 시 1회 AI 요약 후 approval_documents 에 persist
function SatisfactionCommentView({
  comment,
  summary,
  documentId,
  fullContent,
}: {
  comment: string
  summary: { work?: string; personal?: string } | null
  documentId?: string
  fullContent?: DailyReportContent
}) {
  const initialWork = (summary?.work || '').trim()
  const initialPersonal = (summary?.personal || '').trim()
  const hadInitialSummary = Boolean(initialWork || initialPersonal)

  const [localWork, setLocalWork] = useState(initialWork)
  const [localPersonal, setLocalPersonal] = useState(initialPersonal)
  const [generating, setGenerating] = useState(false)
  const triedRef = useRef(false)

  // 기존 결재건 보강: summary 없고 documentId 있고 본문이 충분히 길면 1회 AI 호출 → DB persist
  useEffect(() => {
    if (hadInitialSummary) return
    if (triedRef.current) return
    if (!documentId) return
    const text = comment.trim()
    if (text.length < 80) return
    triedRef.current = true

    let cancelled = false
    ;(async () => {
      setGenerating(true)
      try {
        const cfg = await getAIConfigForFeature('daily_report')
        if (!cfg) return
        const sumPrompt = `아래는 직원이 일일 업무보고서에 작성한 "한 줄 총평" 원문입니다.\n결재자가 빠르게 파악하도록 두 가지로 요약해주세요.\n\n[원문]\n${text}\n\n[요구사항]\n1) 업무내용 요약: 오늘 한 일/성과/이슈를 사실 위주로 2~3줄 한국어로 요약\n2) 개인 소견 요약: 직원의 감정·소감·다짐·감사 표현 등 주관적 내용을 1~2줄 한국어로 요약\n3) 해당 항목에 적절한 내용이 없으면 빈 문자열로 둘 것 (추측 금지)\n4) 추가 해석·평가·권고는 절대 추가하지 말 것 (요약만)\n\n반드시 아래 JSON 한 줄만 출력 (코드펜스/설명 금지):\n{"work":"...","personal":"..."}`
        const res = await generateAIContent(cfg, sumPrompt, undefined, 'daily_report_summary')
        if (cancelled) return
        const raw = (res.content || '').trim()
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
        const m = cleaned.match(/\{[\s\S]*\}/)
        if (!m) return
        const parsed = JSON.parse(m[0]) as { work?: unknown; personal?: unknown }
        const w = typeof parsed.work === 'string' ? parsed.work.trim() : ''
        const p = typeof parsed.personal === 'string' ? parsed.personal.trim() : ''
        if (!w && !p) return
        setLocalWork(w)
        setLocalPersonal(p)
        // approval_documents.content.ai_summary 에 persist (실패 무시 — 다음 조회 시 재시도)
        if (fullContent) {
          try {
            await supabase
              .from('approval_documents')
              .update({ content: { ...fullContent, ai_summary: { work: w, personal: p } } })
              .eq('id', documentId)
          } catch {
            // RLS 차단 등은 무시 (화면에는 이미 표시됨)
          }
        }
      } catch {
        // AI 실패 — 원문 fallback 유지
      } finally {
        if (!cancelled) setGenerating(false)
      }
    })()
    return () => { cancelled = true }
  }, [hadInitialSummary, documentId, comment, fullContent])

  const work = localWork
  const personal = localPersonal
  const hasSummary = Boolean(work || personal)
  // 요약 있으면 원문 접힘, 요약 생성 중이면 접힘 유지, 둘 다 없으면 원문 표시
  const [expanded, setExpanded] = useState(!hasSummary && !generating && !documentId)

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-gray-500">한 줄 총평</p>
      {hasSummary ? (
        <div className="rounded-md border border-brand-100 bg-brand-50/40 p-2.5 space-y-1.5">
          {work && (
            <div className="text-sm flex gap-2">
              <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">업무</span>
              <span className="text-gray-900 leading-relaxed">{work}</span>
            </div>
          )}
          {personal && (
            <div className="text-sm flex gap-2">
              <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700">소견</span>
              <span className="text-gray-700 leading-relaxed">{personal}</span>
            </div>
          )}
          <p className="text-[10px] text-gray-400 pt-0.5">🤖 AI 요약 · 참고용</p>
        </div>
      ) : generating ? (
        <div className="rounded-md border border-brand-100 bg-brand-50/40 p-2.5 text-xs text-brand-700 flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          AI 요약 생성 중...
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-[11px] text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline"
      >
        {expanded ? '원문 접기 ▲' : '원문 보기 ▼'}
      </button>
      {expanded && (
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed rounded-md border border-gray-100 bg-gray-50 p-2.5">
          {comment}
        </p>
      )}
    </div>
  )
}
