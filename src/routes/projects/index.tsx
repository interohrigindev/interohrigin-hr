import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Table2, Columns3, Calendar, Clock, Trash2,
  ChevronDown, ChevronRight,
  Search,
  CheckCircle2, Circle, PauseCircle, AlertTriangle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useProjectBoard } from '@/hooks/useProjectBoard'
import type {
  ProjectWithStages, StageStatus, ViewMode,
} from '@/types/project-board'
import {
  PROJECT_STATUS_COLORS,
  PROJECT_STATUS_LABELS, BRAND_COLORS,
} from '@/types/project-board'

const STATUS_OPTIONS: StageStatus[] = ['시작전', '진행중', '완료', '홀딩']

// Monday.com 스타일 그룹 컬러
const GROUP_COLORS = [
  { bg: 'bg-violet-500', light: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700' },
  { bg: 'bg-blue-500', light: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  { bg: 'bg-emerald-500', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  { bg: 'bg-amber-500', light: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  { bg: 'bg-rose-500', light: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
  { bg: 'bg-cyan-500', light: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700' },
  { bg: 'bg-orange-500', light: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
  { bg: 'bg-indigo-500', light: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
]

// 상태별 아이콘
function StatusIcon({ status, className = 'h-3.5 w-3.5' }: { status: StageStatus; className?: string }) {
  switch (status) {
    case '완료': return <CheckCircle2 className={`${className} text-emerald-500`} />
    case '진행중': return <Circle className={`${className} text-blue-500`} />
    case '홀딩': return <PauseCircle className={`${className} text-amber-500`} />
    default: return <Circle className={`${className} text-gray-300`} />
  }
}

function getDaysUntil(deadline: string | null): number | null {
  if (!deadline) return null
  const diff = new Date(deadline).getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

type GroupByOption = 'brand' | 'status' | 'none'

export default function ProjectBoardPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { projects, loading, updateStageStatus, deleteProject, canDeleteProject } = useProjectBoard()

  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssignee] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'priority' | 'launch_date' | 'name'>('priority')
  const [groupBy, setGroupBy] = useState<GroupByOption>('brand')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Unique brands
  const brands = useMemo(() => [...new Set(projects.map((p) => p.brand))], [projects])

  // Filter + sort
  const filtered = useMemo(() => {
    let result = [...projects]
    if (filterBrand) result = result.filter((p) => p.brand === filterBrand)
    if (filterStatus) result = result.filter((p) => p.status === filterStatus)
    if (filterAssignee) result = result.filter((p) => p.assignee_names?.includes(filterAssignee))
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((p) =>
        p.project_name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.assignee_names?.some((n) => n.toLowerCase().includes(q))
      )
    }

    result.sort((a, b) => {
      if (sortBy === 'priority') return a.priority - b.priority
      if (sortBy === 'launch_date') return (a.launch_date || '9999').localeCompare(b.launch_date || '9999')
      return a.project_name.localeCompare(b.project_name)
    })
    return result
  }, [projects, filterBrand, filterStatus, filterAssignee, searchQuery, sortBy])

  // Grouped projects
  const groupedProjects = useMemo(() => {
    if (groupBy === 'none') return [{ key: '전체', projects: filtered }]
    const groups = new Map<string, ProjectWithStages[]>()
    for (const p of filtered) {
      const key = groupBy === 'brand' ? p.brand : PROJECT_STATUS_LABELS[p.status]
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }
    return [...groups.entries()].map(([key, projects]) => ({ key, projects }))
  }, [filtered, groupBy])

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Stage status change
  async function handleStatusChange(stageId: string, newStatus: StageStatus, projectId: string) {
    const result = await updateStageStatus(stageId, newStatus, projectId)
    if (result.error) toast('상태 변경 실패: ' + result.error, 'error')
  }

  if (loading) return <PageSpinner />

  // ─── 프로젝트 진행률 계산 ──────────────────────────────────
  function getProjectProgress(project: ProjectWithStages) {
    const total = project.stages.length
    if (total === 0) return { percent: 0, completed: 0, total: 0, inProgress: 0, delayed: 0 }
    const completed = project.stages.filter((s) => s.status === '완료').length
    const inProgress = project.stages.filter((s) => s.status === '진행중').length
    const delayed = project.stages.filter((s) => {
      if (s.status === '완료' || !s.deadline) return false
      return getDaysUntil(s.deadline)! < 0
    }).length
    return { percent: Math.round((completed / total) * 100), completed, total, inProgress, delayed }
  }

  // ─── Monday.com 스타일 배터리 프로그레스 ────────────────────
  function BatteryProgress({ project }: { project: ProjectWithStages }) {
    const { percent, completed, total, delayed } = getProjectProgress(project)
    const color = delayed > 0 ? 'bg-red-500' : percent >= 70 ? 'bg-emerald-500' : percent >= 30 ? 'bg-blue-500' : 'bg-gray-300'
    return (
      <div className="flex items-center gap-2">
        <div className="w-24 h-5 bg-gray-100 rounded-sm overflow-hidden border border-gray-200 relative">
          <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${percent}%` }} />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
            {percent}%
          </span>
        </div>
        <span className="text-[10px] text-gray-400 whitespace-nowrap">{completed}/{total}</span>
      </div>
    )
  }

  // ─── Monday.com 스타일 스테이지 파이프라인 미니뷰 ─────────
  function StagePipeline({ project }: { project: ProjectWithStages }) {
    const stages = [...project.stages].sort((a, b) => a.stage_order - b.stage_order)
    if (stages.length === 0) return <span className="text-xs text-gray-400">단계 없음</span>

    return (
      <div className="flex gap-0.5 items-center">
        {stages.map((stage) => {
          const days = getDaysUntil(stage.deadline)
          const isOverdue = stage.status !== '완료' && days !== null && days < 0
          const bgColor = stage.status === '완료' ? 'bg-emerald-400'
            : stage.status === '진행중' ? 'bg-blue-400'
            : stage.status === '홀딩' ? 'bg-amber-400'
            : 'bg-gray-200'

          return (
            <div key={stage.id} className="group relative">
              <div
                className={`h-6 rounded-sm cursor-pointer transition-all hover:scale-110 ${bgColor} ${isOverdue ? 'ring-1 ring-red-400' : ''}`}
                style={{ width: `${Math.max(24, 100 / stages.length)}px` }}
                title={`${stage.stage_name}: ${stage.status}${stage.deadline ? ` (${stage.deadline})` : ''}`}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50">
                <div className="bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                  <div className="font-medium">{stage.stage_name}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <StatusIcon status={stage.status} className="h-2.5 w-2.5" />
                    <span>{stage.status}</span>
                    {stage.deadline && (
                      <span className="ml-1 opacity-75">
                        {stage.deadline.slice(5)}
                        {days !== null && days <= 0 && ` (D${days >= 0 ? '-' : '+'}${Math.abs(days)})`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Monday.com 스타일 상태 셀렉터 ────────────────────────
  function StatusSelector({ stage, projectId }: { stage: { id: string; status: StageStatus; stage_name: string }; projectId: string }) {
    const colors: Record<StageStatus, string> = {
      '완료': 'bg-emerald-500 text-white',
      '진행중': 'bg-blue-500 text-white',
      '시작전': 'bg-gray-200 text-gray-600',
      '홀딩': 'bg-amber-500 text-white',
    }
    return (
      <select
        value={stage.status}
        onChange={(e) => handleStatusChange(stage.id, e.target.value as StageStatus, projectId)}
        className={`text-[11px] font-semibold rounded-md px-2 py-1 border-0 cursor-pointer appearance-none text-center ${colors[stage.status]}`}
        style={{ minWidth: '60px' }}
      >
        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    )
  }

  // ─── TABLE VIEW (Monday.com 스타일) ────────────────────────
  const renderTableView = () => (
    <div className="space-y-4">
      {groupedProjects.map((group, gi) => {
        const colorSet = GROUP_COLORS[gi % GROUP_COLORS.length]
        const isCollapsed = collapsedGroups.has(group.key)
        const groupProgress = group.projects.reduce((acc, p) => {
          const prog = getProjectProgress(p)
          return { completed: acc.completed + prog.completed, total: acc.total + prog.total }
        }, { completed: 0, total: 0 })
        const groupPercent = groupProgress.total > 0
          ? Math.round((groupProgress.completed / groupProgress.total) * 100)
          : 0

        return (
          <div key={group.key} className="overflow-hidden rounded-lg border border-gray-200">
            {/* Group Header - Monday.com 스타일 */}
            {groupBy !== 'none' && (
              <button
                onClick={() => toggleGroup(group.key)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 ${colorSet.light} hover:opacity-90 transition-opacity`}
              >
                <div className={`w-1 h-6 rounded-full ${colorSet.bg}`} />
                {isCollapsed
                  ? <ChevronRight className={`h-4 w-4 ${colorSet.text}`} />
                  : <ChevronDown className={`h-4 w-4 ${colorSet.text}`} />}
                <span className={`text-sm font-bold ${colorSet.text}`}>{group.key}</span>
                <Badge variant="default" className="text-[10px]">{group.projects.length}개 프로젝트</Badge>
                <div className="flex-1" />
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full ${colorSet.bg} rounded-full`} style={{ width: `${groupPercent}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500">{groupPercent}%</span>
                </div>
              </button>
            )}

            {/* Group Content */}
            {!isCollapsed && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50">
                      <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs whitespace-nowrap w-8">#</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs min-w-[200px]">프로젝트명</th>
                      <th className="text-left py-2.5 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">상태</th>
                      <th className="text-left py-2.5 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">진행률</th>
                      <th className="text-left py-2.5 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">파이프라인</th>
                      <th className="text-left py-2.5 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">현재 단계</th>
                      <th className="text-left py-2.5 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">출시일</th>
                      <th className="text-left py-2.5 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">담당자</th>
                      <th className="text-left py-2.5 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">리더</th>
                      <th className="text-left py-2.5 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">참여자</th>
                      {canDeleteProject() && <th className="py-2.5 px-1 w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {group.projects.map((project, idx) => {
                      const currentStage = project.stages
                        .sort((a, b) => a.stage_order - b.stage_order)
                        .find((s) => s.status === '진행중') ||
                        project.stages.find((s) => s.status === '시작전')

                      return (
                        <tr key={project.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors group/row">
                          {/* 순번 */}
                          <td className="py-2.5 px-3">
                            <span className="text-[11px] text-gray-400 font-medium">{idx + 1}</span>
                          </td>
                          {/* 프로젝트명 */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              {groupBy !== 'brand' && (
                                <Badge className={`text-[9px] ${BRAND_COLORS[project.brand]}`}>{project.brand}</Badge>
                              )}
                              <button
                                onClick={() => navigate(`/admin/projects/${project.id}`)}
                                className="text-left font-medium text-gray-900 hover:text-blue-600 transition-colors"
                              >
                                {project.project_name}
                              </button>
                              {project.category && (
                                <span className="text-[10px] text-gray-400">{project.category}</span>
                              )}
                            </div>
                          </td>
                          {/* 상태 */}
                          <td className="py-2.5 px-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${PROJECT_STATUS_COLORS[project.status]}`}>
                              {PROJECT_STATUS_LABELS[project.status]}
                            </span>
                          </td>
                          {/* 진행률 (배터리) */}
                          <td className="py-2.5 px-2">
                            <BatteryProgress project={project} />
                          </td>
                          {/* 파이프라인 미니뷰 */}
                          <td className="py-2.5 px-2">
                            <StagePipeline project={project} />
                          </td>
                          {/* 현재 단계 */}
                          <td className="py-2.5 px-2">
                            {currentStage ? (
                              <div className="flex items-center gap-1">
                                <StatusSelector stage={currentStage} projectId={project.id} />
                                <span className="text-[10px] text-gray-500 whitespace-nowrap">{currentStage.stage_name}</span>
                                {currentStage.deadline && (() => {
                                  const days = getDaysUntil(currentStage.deadline)
                                  if (days !== null && days < 0) {
                                    return <span className="text-[9px] text-red-600 font-bold">D+{Math.abs(days)}</span>
                                  }
                                  if (days !== null && days <= 3) {
                                    return <span className="text-[9px] text-amber-600">D-{days}</span>
                                  }
                                  return null
                                })()}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          {/* 출시일 */}
                          <td className="py-2.5 px-2">
                            {project.launch_date ? (
                              <span className="text-xs text-gray-600 whitespace-nowrap flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-gray-400" />
                                {project.launch_date.slice(5)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">-</span>
                            )}
                          </td>
                          {/* 담당자 */}
                          <td className="py-2.5 px-2">
                            {project.manager_name ? (
                              <div className="flex items-center gap-1">
                                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[9px] font-bold text-blue-700">
                                  {project.manager_name[0]}
                                </div>
                                <span className="text-xs text-gray-700">{project.manager_name}</span>
                              </div>
                            ) : <span className="text-xs text-gray-300">-</span>}
                          </td>
                          {/* 리더 */}
                          <td className="py-2.5 px-2">
                            {project.leader_name ? (
                              <div className="flex items-center gap-1">
                                <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-[9px] font-bold text-violet-700">
                                  {project.leader_name[0]}
                                </div>
                                <span className="text-xs text-gray-700">{project.leader_name}</span>
                              </div>
                            ) : <span className="text-xs text-gray-300">-</span>}
                          </td>
                          {/* 참여자 */}
                          <td className="py-2.5 px-2">
                            <div className="flex -space-x-1.5">
                              {(project.assignee_names || []).slice(0, 4).map((name, i) => (
                                <div
                                  key={i}
                                  className="w-5 h-5 rounded-full bg-gray-100 border border-white flex items-center justify-center text-[8px] font-bold text-gray-600"
                                  title={name}
                                >
                                  {name[0]}
                                </div>
                              ))}
                              {(project.assignee_names || []).length > 4 && (
                                <div className="w-5 h-5 rounded-full bg-gray-200 border border-white flex items-center justify-center text-[8px] font-bold text-gray-500">
                                  +{project.assignee_names!.length - 4}
                                </div>
                              )}
                            </div>
                          </td>
                          {/* 삭제 */}
                          {canDeleteProject() && (
                            <td className="py-2.5 px-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (confirm(`"${project.project_name}" 프로젝트를 삭제하시겠습니까?`)) {
                                    deleteProject(project.id)
                                    toast('프로젝트가 삭제되었습니다', 'success')
                                  }
                                }}
                                className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity"
                                title="삭제"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Group Summary */}
                {group.projects.length > 0 && (
                  <div className={`flex items-center gap-4 px-4 py-2 ${colorSet.light} border-t ${colorSet.border} text-[11px] text-gray-500`}>
                    <span>{group.projects.length}개 프로젝트</span>
                    <span>진행중: {group.projects.filter((p) => p.status === 'active').length}</span>
                    <span>홀딩: {group.projects.filter((p) => p.status === 'holding').length}</span>
                    <span>완료: {group.projects.filter((p) => p.status === 'completed').length}</span>
                    <span className="text-red-500">
                      지연: {group.projects.reduce((acc, p) => acc + getProjectProgress(p).delayed, 0)}단계
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // ─── KANBAN VIEW (동적 스테이지 기반) ─────────────────────
  const renderKanbanView = () => {
    // 프로젝트 상태 기반 칸반 (Monday.com 스타일)
    const statusGroups: { key: string; status: string; color: string; projects: ProjectWithStages[] }[] = [
      { key: '시작전', status: 'active', color: 'bg-gray-400', projects: [] },
      { key: '진행중', status: 'active', color: 'bg-blue-500', projects: [] },
      { key: '완료 임박', status: 'active', color: 'bg-emerald-500', projects: [] },
      { key: '홀딩', status: 'holding', color: 'bg-amber-500', projects: [] },
      { key: '완료', status: 'completed', color: 'bg-emerald-600', projects: [] },
    ]

    for (const project of filtered) {
      if (project.status === 'completed') {
        statusGroups[4].projects.push(project)
        continue
      }
      if (project.status === 'holding') {
        statusGroups[3].projects.push(project)
        continue
      }
      const progress = getProjectProgress(project)
      if (progress.percent >= 80) {
        statusGroups[2].projects.push(project)
      } else if (progress.inProgress > 0 || progress.percent > 0) {
        statusGroups[1].projects.push(project)
      } else {
        statusGroups[0].projects.push(project)
      }
    }

    return (
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '400px' }}>
        {statusGroups.map((group) => (
          <div key={group.key} className="flex-shrink-0 w-64">
            {/* Column header */}
            <div className="rounded-t-lg px-3 py-2.5 mb-0">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${group.color}`} />
                <span className="text-sm font-bold text-gray-700">{group.key}</span>
                <span className="text-xs text-gray-400 ml-auto">{group.projects.length}</span>
              </div>
            </div>
            {/* Cards */}
            <div className="space-y-2 bg-gray-50 rounded-b-lg p-2 min-h-[300px]">
              {group.projects.map((project) => {
                const progress = getProjectProgress(project)
                const currentStage = project.stages
                  .sort((a, b) => a.stage_order - b.stage_order)
                  .find((s) => s.status === '진행중')

                return (
                  <button
                    key={project.id}
                    onClick={() => navigate(`/admin/projects/${project.id}`)}
                    className="w-full text-left p-3 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
                  >
                    {/* Brand + Category */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <Badge className={`text-[9px] ${BRAND_COLORS[project.brand]}`}>{project.brand}</Badge>
                      <span className="text-[10px] text-gray-400">{project.category}</span>
                    </div>

                    {/* Title */}
                    <p className="text-[13px] font-semibold text-gray-900 mb-2 line-clamp-2">{project.project_name}</p>

                    {/* Progress bar */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            progress.delayed > 0 ? 'bg-red-500' : progress.percent >= 70 ? 'bg-emerald-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-gray-500">{progress.percent}%</span>
                    </div>

                    {/* Current Stage */}
                    {currentStage && (
                      <div className="flex items-center gap-1 mb-2">
                        <StatusIcon status={currentStage.status} className="h-3 w-3" />
                        <span className="text-[11px] text-gray-600">{currentStage.stage_name}</span>
                        {currentStage.deadline && (() => {
                          const days = getDaysUntil(currentStage.deadline)
                          if (days !== null && days < 0) {
                            return <span className="text-[9px] text-red-600 font-bold ml-auto">D+{Math.abs(days)}</span>
                          }
                          return null
                        })()}
                      </div>
                    )}

                    {/* Pipeline mini */}
                    <div className="flex gap-0.5 mb-2">
                      {project.stages.sort((a, b) => a.stage_order - b.stage_order).map((s) => (
                        <div
                          key={s.id}
                          className={`flex-1 h-1 rounded-full ${
                            s.status === '완료' ? 'bg-emerald-400' :
                            s.status === '진행중' ? 'bg-blue-400' :
                            s.status === '홀딩' ? 'bg-amber-400' : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <div className="flex -space-x-1.5">
                        {(project.assignee_names || []).slice(0, 3).map((name, i) => (
                          <div
                            key={i}
                            className="w-5 h-5 rounded-full bg-gray-100 border border-white flex items-center justify-center text-[8px] font-bold text-gray-600"
                            title={name}
                          >
                            {name[0]}
                          </div>
                        ))}
                      </div>
                      {project.launch_date && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <Clock className="h-3 w-3" /> {project.launch_date.slice(5)}
                        </span>
                      )}
                      {progress.delayed > 0 && (
                        <span className="text-[9px] text-red-600 font-bold flex items-center gap-0.5">
                          <AlertTriangle className="h-3 w-3" /> {progress.delayed}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ─── TIMELINE VIEW ────────────────────────────────────────
  const renderTimelineView = () => {
    const allDates = filtered.flatMap((p) =>
      p.stages.filter((s) => s.deadline).map((s) => new Date(s.deadline!))
    )
    if (allDates.length === 0) return <p className="text-center py-12 text-gray-400">타임라인 데이터가 없습니다</p>

    const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())))
    const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())))
    const today = new Date()
    minDate.setDate(minDate.getDate() - 7)
    maxDate.setDate(maxDate.getDate() + 14)
    const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
    const todayOffset = Math.ceil((today.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))

    // Week labels
    const weeks: { label: string; offset: number }[] = []
    const cursor = new Date(minDate)
    while (cursor <= maxDate) {
      const offset = Math.ceil((cursor.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
      weeks.push({ label: `${cursor.getMonth() + 1}/${cursor.getDate()}`, offset })
      cursor.setDate(cursor.getDate() + 7)
    }

    return (
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${Math.max(totalDays * 4, 800)}px` }}>
          {/* Week headers */}
          <div className="flex border-b border-gray-200 mb-2 relative" style={{ height: '24px' }}>
            {weeks.map((w, i) => (
              <div
                key={i}
                className="absolute text-[10px] text-gray-500 font-medium"
                style={{ left: `${(w.offset / totalDays) * 100}%` }}
              >
                {w.label}
              </div>
            ))}
          </div>

          {/* Project rows */}
          <div className="space-y-1 relative">
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
              style={{ left: `${(todayOffset / totalDays) * 100}%` }}
            />
            {filtered.map((project) => {
              const progress = getProjectProgress(project)
              return (
                <div key={project.id} className="flex items-center gap-2 group/timeline" style={{ height: '32px' }}>
                  <button
                    onClick={() => navigate(`/admin/projects/${project.id}`)}
                    className="w-44 shrink-0 truncate text-xs font-medium text-gray-700 hover:text-blue-600 text-left flex items-center gap-1.5"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      progress.delayed > 0 ? 'bg-red-500' : project.status === 'active' ? 'bg-blue-500' : 'bg-gray-300'
                    }`} />
                    {project.project_name}
                  </button>
                  <div className="flex-1 relative h-full">
                    {project.stages.filter((s) => s.deadline).sort((a, b) => a.stage_order - b.stage_order).map((stage, i, arr) => {
                      const stageStart = i === 0
                        ? 0
                        : Math.ceil((new Date(arr[i - 1]?.deadline || stage.deadline!).getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
                      const stageEnd = Math.ceil((new Date(stage.deadline!).getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
                      const left = (Math.max(0, stageStart) / totalDays) * 100
                      const width = ((stageEnd - Math.max(0, stageStart)) / totalDays) * 100

                      const color = stage.status === '완료' ? 'bg-emerald-400'
                        : stage.status === '진행중' ? 'bg-blue-400'
                        : stage.status === '홀딩' ? 'bg-amber-400'
                        : 'bg-gray-200'

                      return (
                        <div
                          key={stage.id}
                          className={`absolute top-1 h-6 ${color} rounded text-[8px] text-white flex items-center justify-center overflow-hidden shadow-sm`}
                          style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
                          title={`${stage.stage_name}: ${stage.status} (${stage.deadline})`}
                        >
                          {width > 3 && stage.stage_name}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ─── Stats ────────────────────────────────────────────────
  const totalProjects = filtered.length
  const delayedStages = filtered.flatMap((p) => p.stages).filter((s) => {
    if (s.status === '완료') return false
    const days = getDaysUntil(s.deadline)
    return days !== null && days < 0
  }).length
  const activeCount = filtered.filter((p) => p.status === 'active').length
  const holdingCount = filtered.filter((p) => p.status === 'holding').length
  const completedCount = filtered.filter((p) => p.status === 'completed').length
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">프로젝트 보드</h1>
          <p className="text-sm text-gray-500 mt-0.5">모든 프로젝트의 현황을 한눈에 관리합니다</p>
        </div>
        <Button onClick={() => navigate('/admin/projects/new')}>
          <Plus className="h-4 w-4 mr-1" /> 새 프로젝트
        </Button>
      </div>

      {/* Stats - Monday.com 스타일 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-l-4 border-l-gray-400">
          <CardContent className="py-3 px-4">
            <p className="text-2xl font-bold text-gray-900">{totalProjects}</p>
            <p className="text-[11px] text-gray-500">전체 프로젝트</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <p className="text-2xl font-bold text-blue-600">{activeCount}</p>
            <p className="text-[11px] text-gray-500">진행중</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <p className="text-2xl font-bold text-amber-600">{holdingCount}</p>
            <p className="text-[11px] text-gray-500">홀딩</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <p className="text-2xl font-bold text-emerald-600">{completedCount}</p>
            <p className="text-[11px] text-gray-500">완료</p>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${delayedStages > 0 ? 'border-l-red-500' : 'border-l-emerald-500'}`}>
          <CardContent className="py-3 px-4">
            <p className={`text-2xl font-bold ${delayedStages > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{delayedStages}</p>
            <p className="text-[11px] text-gray-500">지연 단계</p>
          </CardContent>
        </Card>
      </div>

      {/* View tabs + Search + Filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* View mode tabs */}
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {([
            { mode: 'table' as ViewMode, icon: Table2, label: '테이블' },
            { mode: 'kanban' as ViewMode, icon: Columns3, label: '칸반' },
            { mode: 'timeline' as ViewMode, icon: Calendar, label: '타임라인' },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {/* Search + Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="프로젝트 검색..."
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
          </div>
          {viewMode === 'table' && (
            <Select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
              options={[
                { value: 'brand', label: '브랜드별' },
                { value: 'status', label: '상태별' },
                { value: 'none', label: '그룹 없음' },
              ]}
            />
          )}
          <Select
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
            options={[{ value: '', label: '전체 브랜드' }, ...brands.map((b) => ({ value: b, label: b }))]}
          />
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={[
              { value: '', label: '전체 상태' },
              { value: 'active', label: '진행중' },
              { value: 'holding', label: '홀딩' },
              { value: 'completed', label: '완료' },
            ]}
          />
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'priority' | 'launch_date' | 'name')}
            options={[
              { value: 'priority', label: '우선순위' },
              { value: 'launch_date', label: '마감일순' },
              { value: 'name', label: '이름순' },
            ]}
          />
        </div>
      </div>

      {/* Content */}
      <Card className="overflow-hidden">
        <CardContent className="p-0 md:p-2">
          {viewMode === 'table' && renderTableView()}
          {viewMode === 'kanban' && renderKanbanView()}
          {viewMode === 'timeline' && renderTimelineView()}
        </CardContent>
      </Card>
    </div>
  )
}
