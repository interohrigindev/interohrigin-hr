/**
 * 일일 업무보고 결재 상세 뷰 — 결재자가 보는 보고서 렌더링.
 *
 * 추가 기능 (2026-05-27): 완료/진행중/계획 업무 각 항목 옆에 해당 작업이 속한
 * **프로젝트명** 표시. 보고서 본문에는 task id 만 있으므로 tasks → projects
 * 조인 1회 fetch 후 client-side 매핑.
 */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  blockers?: string
}

interface ProjectInfo {
  name: string
}

export function DailyReportApprovalView({ content }: { content: DailyReportContent }) {
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
              <p className={`text-[11px] font-semibold mb-1 flex items-center gap-1.5 ${isEtc ? 'text-gray-400' : 'text-purple-700'}`}>
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

      {/* 만족도 + 한줄총평 + 블로커 */}
      {(content.satisfaction_score != null || content.satisfaction_comment || content.blockers) && (
        <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-1.5">
          {content.satisfaction_score != null && (
            <p className="text-sm">
              <span className="text-gray-500">만족도:</span>{' '}
              <span className="font-semibold text-brand-700">{content.satisfaction_score}/10</span>
            </p>
          )}
          {content.satisfaction_comment && (
            <p className="text-sm">
              <span className="text-gray-500">한 줄 총평:</span>{' '}
              <span className="text-gray-900">{content.satisfaction_comment}</span>
            </p>
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
