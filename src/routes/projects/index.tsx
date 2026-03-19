import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Table2, Columns3, Calendar, Clock,
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
  DEFAULT_PIPELINE, STAGE_STATUS_COLORS, PROJECT_STATUS_COLORS,
  PROJECT_STATUS_LABELS, BRAND_COLORS,
} from '@/types/project-board'

const STATUS_OPTIONS: StageStatus[] = ['시작전', '진행중', '완료', '홀딩']

function getDaysUntil(deadline: string | null): number | null {
  if (!deadline) return null
  const diff = new Date(deadline).getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function getDeadlineColor(days: number | null): string {
  if (days === null) return ''
  if (days < 0) return 'ring-2 ring-red-400 bg-red-50'
  if (days <= 3) return 'ring-2 ring-amber-400 bg-amber-50'
  return ''
}

export default function ProjectBoardPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { projects, loading, updateStageStatus } = useProjectBoard()

  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [sortBy, setSortBy] = useState<'priority' | 'launch_date' | 'name'>('priority')

  // Unique brands
  const brands = useMemo(() => [...new Set(projects.map((p) => p.brand))], [projects])
  const assignees = useMemo(() => {
    const names = new Set<string>()
    projects.forEach((p) => p.assignee_names?.forEach((n) => names.add(n)))
    return [...names].sort()
  }, [projects])

  // Filter + sort
  const filtered = useMemo(() => {
    let result = [...projects]
    if (filterBrand) result = result.filter((p) => p.brand === filterBrand)
    if (filterStatus) result = result.filter((p) => p.status === filterStatus)
    if (filterAssignee) result = result.filter((p) => p.assignee_names?.includes(filterAssignee))

    result.sort((a, b) => {
      if (sortBy === 'priority') return a.priority - b.priority
      if (sortBy === 'launch_date') return (a.launch_date || '9999').localeCompare(b.launch_date || '9999')
      return a.project_name.localeCompare(b.project_name)
    })
    return result
  }, [projects, filterBrand, filterStatus, filterAssignee, sortBy])

  // Stage status change
  async function handleStatusChange(stageId: string, newStatus: StageStatus, projectId: string) {
    const result = await updateStageStatus(stageId, newStatus, projectId)
    if (result.error) toast('상태 변경 실패: ' + result.error, 'error')
  }

  if (loading) return <PageSpinner />

  // ─── TABLE VIEW ─────────────────────────────────────────────
  const renderTableView = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left py-3 px-3 font-medium text-gray-600 whitespace-nowrap">브랜드</th>
            <th className="text-left py-3 px-2 font-medium text-gray-600 whitespace-nowrap">구분</th>
            <th className="text-left py-3 px-2 font-medium text-gray-600 min-w-[160px]">프로젝트명</th>
            <th className="text-left py-3 px-2 font-medium text-gray-600 whitespace-nowrap">출시일</th>
            <th className="text-left py-3 px-2 font-medium text-gray-600 whitespace-nowrap">담당자</th>
            {DEFAULT_PIPELINE.map((stage) => (
              <th key={stage} className="text-center py-3 px-1 font-medium text-gray-600 whitespace-nowrap min-w-[80px]">
                {stage}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={12} className="text-center py-12 text-gray-400">프로젝트가 없습니다</td></tr>
          ) : (
            filtered.map((project) => (
              <tr key={project.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="py-2.5 px-3">
                  <Badge className={BRAND_COLORS[project.brand] || BRAND_COLORS['기타']}>
                    {project.brand}
                  </Badge>
                </td>
                <td className="py-2.5 px-2 text-gray-600 text-xs">{project.category}</td>
                <td className="py-2.5 px-2">
                  <button
                    onClick={() => navigate(`/admin/projects/${project.id}`)}
                    className="text-left font-medium text-gray-900 hover:text-brand-600 transition-colors"
                  >
                    {project.project_name}
                  </button>
                  <Badge className={`ml-1 text-[10px] ${PROJECT_STATUS_COLORS[project.status]}`}>
                    {PROJECT_STATUS_LABELS[project.status]}
                  </Badge>
                </td>
                <td className="py-2.5 px-2 text-xs text-gray-600 whitespace-nowrap">
                  {project.launch_date || '-'}
                </td>
                <td className="py-2.5 px-2 text-xs text-gray-600 max-w-[100px] truncate">
                  {project.assignee_names?.join(', ') || '-'}
                </td>
                {DEFAULT_PIPELINE.map((stageName) => {
                  const stage = project.stages.find((s) => s.stage_name === stageName)
                  if (!stage) return <td key={stageName} className="py-2.5 px-1 text-center text-gray-300">-</td>
                  const days = getDaysUntil(stage.deadline)
                  const deadlineClass = stage.status !== '완료' ? getDeadlineColor(days) : ''

                  return (
                    <td key={stageName} className={`py-2.5 px-1 text-center ${deadlineClass} rounded`}>
                      <select
                        value={stage.status}
                        onChange={(e) => handleStatusChange(stage.id, e.target.value as StageStatus, project.id)}
                        className={`text-[11px] font-medium rounded-full px-2 py-0.5 border-0 cursor-pointer ${STAGE_STATUS_COLORS[stage.status]}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      {stage.deadline && (
                        <div className={`text-[9px] mt-0.5 ${days !== null && days < 0 ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                          {stage.deadline.slice(5)}
                          {days !== null && days <= 0 && ` (D${days >= 0 ? '-' : '+'}${Math.abs(days)})`}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )

  // ─── KANBAN VIEW ────────────────────────────────────────────
  const renderKanbanView = () => {
    // Group projects by their current active stage
    const stageGroups = new Map<string, ProjectWithStages[]>()
    DEFAULT_PIPELINE.forEach((s) => stageGroups.set(s, []))

    for (const project of filtered) {
      // Find the current active stage (first non-completed)
      const activeStage = project.stages
        .sort((a, b) => a.stage_order - b.stage_order)
        .find((s) => s.status === '진행중')
      const stageName = activeStage?.stage_name || project.stages.find((s) => s.status !== '완료')?.stage_name || DEFAULT_PIPELINE[0]
      stageGroups.get(stageName)?.push(project)
    }

    return (
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '400px' }}>
        {DEFAULT_PIPELINE.map((stageName) => {
          const stageProjects = stageGroups.get(stageName) || []
          return (
            <div key={stageName} className="flex-shrink-0 w-52">
              <div className="bg-gray-100 rounded-lg px-3 py-2 mb-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-700">{stageName}</span>
                  <Badge variant="default">{stageProjects.length}</Badge>
                </div>
              </div>
              <div className="space-y-2">
                {stageProjects.map((project) => {
                  const stage = project.stages.find((s) => s.stage_name === stageName)
                  const days = stage ? getDaysUntil(stage.deadline) : null
                  const borderColor = days !== null && days < 0 ? 'border-red-400' : days !== null && days <= 3 ? 'border-amber-400' : 'border-gray-200'

                  return (
                    <button
                      key={project.id}
                      onClick={() => navigate(`/admin/projects/${project.id}`)}
                      className={`w-full text-left p-3 bg-white rounded-lg border-2 ${borderColor} shadow-sm hover:shadow-md transition-shadow`}
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <Badge className={`text-[9px] ${BRAND_COLORS[project.brand] || BRAND_COLORS['기타']}`}>{project.brand}</Badge>
                        <span className="text-[10px] text-gray-400">{project.category}</span>
                      </div>
                      <p className="text-xs font-medium text-gray-900 mb-1 line-clamp-2">{project.project_name}</p>
                      <div className="flex items-center justify-between">
                        {stage?.deadline && (
                          <span className={`text-[10px] flex items-center gap-0.5 ${days !== null && days < 0 ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                            <Clock className="h-3 w-3" />
                            {stage.deadline.slice(5)}
                            {days !== null && days <= 3 && ` D${days >= 0 ? '-' : '+'}${Math.abs(days)}`}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1 truncate">
                        {project.assignee_names?.join(', ')}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── TIMELINE VIEW ──────────────────────────────────────────
  const renderTimelineView = () => {
    // Calculate date range
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

    // Generate week labels
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
            {/* Today line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
              style={{ left: `${(todayOffset / totalDays) * 100}%` }}
            />

            {filtered.map((project) => (
              <div key={project.id} className="flex items-center gap-2" style={{ height: '28px' }}>
                <div className="w-36 shrink-0 truncate text-xs font-medium text-gray-700">
                  {project.project_name}
                </div>
                <div className="flex-1 relative h-full">
                  {project.stages.filter((s) => s.deadline).map((stage, i) => {
                    const stageStart = i === 0
                      ? 0
                      : Math.ceil((new Date(project.stages[i - 1]?.deadline || stage.deadline!).getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
                    const stageEnd = Math.ceil((new Date(stage.deadline!).getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
                    const left = (Math.max(0, stageStart) / totalDays) * 100
                    const width = ((stageEnd - Math.max(0, stageStart)) / totalDays) * 100

                    const color = stage.status === '완료' ? 'bg-emerald-400' : stage.status === '진행중' ? 'bg-blue-400' : stage.status === '홀딩' ? 'bg-amber-400' : 'bg-gray-200'

                    return (
                      <div
                        key={stage.id}
                        className={`absolute top-1 h-5 ${color} rounded text-[8px] text-white flex items-center justify-center overflow-hidden`}
                        style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
                        title={`${stage.stage_name}: ${stage.status} (${stage.deadline})`}
                      >
                        {width > 3 && stage.stage_name.slice(0, 3)}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── Stats ──────────────────────────────────────────────────
  const totalProjects = filtered.length
  const delayedStages = filtered.flatMap((p) => p.stages).filter((s) => {
    if (s.status === '완료') return false
    const days = getDaysUntil(s.deadline)
    return days !== null && days < 0
  }).length
  const activeCount = filtered.filter((p) => p.status === 'active').length
  const holdingCount = filtered.filter((p) => p.status === 'holding').length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">프로젝트 보드</h1>
        <Button onClick={() => navigate('/admin/projects/new')}>
          <Plus className="h-4 w-4 mr-1" /> 새 프로젝트
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="py-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{totalProjects}</p>
          <p className="text-xs text-gray-500">전체</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{activeCount}</p>
          <p className="text-xs text-gray-500">진행중</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{holdingCount}</p>
          <p className="text-xs text-gray-500">홀딩</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 text-center">
          <p className={`text-2xl font-bold ${delayedStages > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{delayedStages}</p>
          <p className="text-xs text-gray-500">지연 단계</p>
        </CardContent></Card>
      </div>

      {/* View tabs + Filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
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
                viewMode === mode ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
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
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            options={[{ value: '', label: '전체 담당자' }, ...assignees.map((a) => ({ value: a, label: a }))]}
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
      <Card>
        <CardContent className="p-0 md:p-2">
          {viewMode === 'table' && renderTableView()}
          {viewMode === 'kanban' && renderKanbanView()}
          {viewMode === 'timeline' && renderTimelineView()}
        </CardContent>
      </Card>
    </div>
  )
}
