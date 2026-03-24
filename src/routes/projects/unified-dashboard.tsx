import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle, Users, GripVertical,
  Target, Clock, Activity, Layers, ChevronDown,
  ChevronRight, Star, Plus, Calendar,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useProjectBoard } from '@/hooks/useProjectBoard'
import { supabase } from '@/lib/supabase'
import type { Task } from '@/types/work'
import type { StageStatus } from '@/types/project-board'
import {
  STAGE_STATUS_COLORS,
} from '@/types/project-board'

// ─── Constants ─────────────────────────────────────────────────────

const GROUP_COLORS = [
  { bar: 'bg-blue-500', header: 'bg-blue-50', text: 'text-blue-700', light: 'bg-blue-100' },
  { bar: 'bg-violet-500', header: 'bg-violet-50', text: 'text-violet-700', light: 'bg-violet-100' },
  { bar: 'bg-emerald-500', header: 'bg-emerald-50', text: 'text-emerald-700', light: 'bg-emerald-100' },
  { bar: 'bg-amber-500', header: 'bg-amber-50', text: 'text-amber-700', light: 'bg-amber-100' },
  { bar: 'bg-rose-500', header: 'bg-rose-50', text: 'text-rose-700', light: 'bg-rose-100' },
  { bar: 'bg-cyan-500', header: 'bg-cyan-50', text: 'text-cyan-700', light: 'bg-cyan-100' },
]

function getPriorityInfo(priority: number) {
  if (priority <= 3) return { label: '긴급', color: 'bg-rose-500 text-white' }
  if (priority <= 5) return { label: '상', color: 'bg-violet-500 text-white' }
  if (priority <= 7) return { label: '중', color: 'bg-indigo-500 text-white' }
  return { label: '하', color: 'bg-emerald-500 text-white' }
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

function getDday(dateStr: string | null): { label: string; className: string } | null {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff < 0) return { label: `D+${Math.abs(diff)}`, className: 'text-red-600 bg-red-50' }
  if (diff === 0) return { label: 'D-Day', className: 'text-amber-700 bg-amber-50' }
  if (diff <= 3) return { label: `D-${diff}`, className: 'text-amber-600 bg-amber-50' }
  return { label: `D-${diff}`, className: 'text-gray-500 bg-gray-50' }
}

const STAGE_PILL_COLORS: Record<StageStatus, string> = {
  '시작전': 'bg-gray-200 text-gray-600',
  '진행중': 'bg-blue-500 text-white',
  '완료': 'bg-emerald-500 text-white',
  '홀딩': 'bg-amber-500 text-white',
}

// ─── Component ─────────────────────────────────────────────────────

export default function UnifiedDashboard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { projects, loading: boardLoading, updateProject, updateStageStatus } = useProjectBoard()

  const [tasks, setTasks] = useState<Task[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [filterBrand, setFilterBrand] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  // Drag & Drop
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragCounter = useRef(0)

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedId(null)
    setDragOverId(null)
    dragCounter.current = 0
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    dragCounter.current++
    setDragOverId(id)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDragOverId(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  // ─── Data fetch ──────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      supabase.from('tasks').select('*').order('due_date'),
      supabase.from('employees').select('id, name').eq('is_active', true),
    ]).then(([taskRes, empRes]) => {
      setTasks((taskRes.data || []) as Task[])
      setEmployees((empRes.data || []) as { id: string; name: string }[])
      setTasksLoading(false)
    })
  }, [])

  const getEmpName = useCallback(
    (id: string | null) => employees.find((e) => e.id === id)?.name || '-',
    [employees]
  )

  // ─── Filtered & grouped data ─────────────────────────────────────

  const filteredProjects = useMemo(() => {
    if (!filterBrand) return projects
    return projects.filter((p) => p.brand === filterBrand)
  }, [projects, filterBrand])

  const brands = useMemo(() => [...new Set(projects.map((p) => p.brand))], [projects])

  // Stats
  const activeProjects = filteredProjects.filter((p) => p.status === 'active')
  const completedProjects = filteredProjects.filter((p) => p.status === 'completed')
  const holdingProjects = filteredProjects.filter((p) => p.status === 'holding')
  const allStages = filteredProjects.flatMap((p) => p.stages)
  const completedStages = allStages.filter((s) => s.status === '완료').length
  const totalStages = allStages.length
  const overallProgress = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0
  const delayedStages = allStages.filter((s) => {
    if (s.status === '완료' || !s.deadline) return false
    return new Date(s.deadline) < new Date()
  })

  const activeTasks = tasks.filter((t) => t.status !== 'cancelled')
  const doneTasks = activeTasks.filter((t) => t.status === 'done')
  const overdueTasks = activeTasks.filter((t) => {
    if (t.status === 'done' || !t.due_date) return false
    return new Date(t.due_date) < new Date()
  })
  const taskCompletionRate = activeTasks.length > 0 ? Math.round((doneTasks.length / activeTasks.length) * 100) : 0

  // Projects with computed progress
  const projectsWithProgress = useMemo(() => filteredProjects.map((p) => {
    const total = p.stages.length
    const completed = p.stages.filter((s) => s.status === '완료').length
    const delayed = p.stages.filter((s) => s.status !== '완료' && s.deadline && new Date(s.deadline) < new Date()).length
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0
    const currentStage = p.stages.find((s) => s.status === '진행중') || p.stages.find((s) => s.status === '시작전')
    const linkedTasks = tasks.filter((t) => t.linked_board_id === p.id)
    return { ...p, progress, completed, delayed, currentStage, linkedTasks, total }
  }), [filteredProjects, tasks])

  // Group by brand
  const groupedByBrand = useMemo(() => {
    const map = new Map<string, typeof projectsWithProgress>()
    for (const p of projectsWithProgress) {
      const list = map.get(p.brand) || []
      list.push(p)
      map.set(p.brand, list)
    }
    return [...map.entries()].map(([brand, items], idx) => ({
      brand,
      items: items.sort((a, b) => a.priority - b.priority),
      color: GROUP_COLORS[idx % GROUP_COLORS.length],
    }))
  }, [projectsWithProgress])

  // Drag & Drop handler
  const handleDrop = useCallback(async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDragOverId(null)
    dragCounter.current = 0

    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      return
    }

    const allActive = projectsWithProgress
      .filter((p) => p.status === 'active' || p.status === 'holding')

    const ids = allActive.map((p) => p.id)
    const fromIdx = ids.indexOf(draggedId)
    const toIdx = ids.indexOf(targetId)

    if (fromIdx === -1 || toIdx === -1) {
      setDraggedId(null)
      return
    }

    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, draggedId)

    setDraggedId(null)
    for (let i = 0; i < ids.length; i++) {
      const proj = allActive.find((p) => p.id === ids[i])
      if (proj && proj.priority !== i + 1) {
        await updateProject(ids[i], { priority: i + 1 } as Parameters<typeof updateProject>[1])
      }
    }
  }, [draggedId, projectsWithProgress, updateProject])

  // Stage status change handler
  const handleStageStatusChange = useCallback(async (stageId: string, projectId: string, newStatus: StageStatus) => {
    const result = await updateStageStatus(stageId, newStatus, projectId)
    if (result.error) {
      toast(result.error, 'error')
    } else {
      toast('단계 상태가 변경되었습니다')
    }
  }, [updateStageStatus, toast])

  // Toggle expand
  const toggleExpand = useCallback((projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  // Toggle favorite
  const toggleFavorite = useCallback((projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  // Assignee workload
  const assigneeWorkload = useMemo(() => {
    const map = new Map<string, { name: string; projects: number; tasks: number; overdue: number }>()
    for (const p of filteredProjects) {
      for (const aid of p.assignee_ids || []) {
        if (!map.has(aid)) map.set(aid, { name: getEmpName(aid), projects: 0, tasks: 0, overdue: 0 })
        map.get(aid)!.projects++
      }
    }
    for (const t of activeTasks) {
      if (!t.assignee_id) continue
      if (!map.has(t.assignee_id)) map.set(t.assignee_id, { name: getEmpName(t.assignee_id), projects: 0, tasks: 0, overdue: 0 })
      map.get(t.assignee_id)!.tasks++
      if (t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()) {
        map.get(t.assignee_id)!.overdue++
      }
    }
    return [...map.entries()].sort((a, b) => b[1].tasks - a[1].tasks).slice(0, 8)
  }, [filteredProjects, activeTasks, getEmpName])

  if (boardLoading || tasksLoading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">프로젝트 & 업무 대시보드</h1>
          <p className="text-sm text-gray-500 mt-0.5">전체 프로젝트 현황을 한눈에 파악합니다</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
            options={[{ value: '', label: '전체 브랜드' }, ...brands.map((b) => ({ value: b, label: b }))]}
          />
          <Button onClick={() => navigate('/admin/projects/new')}>
            <Plus className="h-4 w-4" /> 새 프로젝트
          </Button>
        </div>
      </div>

      {/* ─── Summary Stats Row ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-gray-500">진행중</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{activeProjects.length}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-[11px] text-gray-500">홀딩</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{holdingProjects.length}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] text-gray-500">완료</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{completedProjects.length}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-violet-500" />
              <span className="text-[11px] text-gray-500">파이프라인 진행률</span>
            </div>
            <p className="text-2xl font-bold text-violet-600">{overallProgress}%</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-cyan-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-cyan-500" />
              <span className="text-[11px] text-gray-500">작업 완료율</span>
            </div>
            <p className="text-2xl font-bold text-cyan-600">{taskCompletionRate}%</p>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${(delayedStages.length + overdueTasks.length) > 0 ? 'border-l-red-500' : 'border-l-emerald-500'}`}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className={`h-4 w-4 ${(delayedStages.length + overdueTasks.length) > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
              <span className="text-[11px] text-gray-500">지연 항목</span>
            </div>
            <p className={`text-2xl font-bold ${(delayedStages.length + overdueTasks.length) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {delayedStages.length + overdueTasks.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Monday.com Style Main Table ─────────────────────────── */}
      <div className="space-y-4">
        {groupedByBrand.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              프로젝트가 없습니다
            </CardContent>
          </Card>
        ) : (
          groupedByBrand.map((group) => {
            // Group summary calculations
            const avgProgress = group.items.length > 0
              ? Math.round(group.items.reduce((s, p) => s + p.progress, 0) / group.items.length)
              : 0
            const totalTasks = group.items.reduce((s, p) => s + p.linkedTasks.length, 0)
            const priorityDist = { urgent: 0, high: 0, mid: 0, low: 0 }
            for (const p of group.items) {
              if (p.priority <= 3) priorityDist.urgent++
              else if (p.priority <= 5) priorityDist.high++
              else if (p.priority <= 7) priorityDist.mid++
              else priorityDist.low++
            }

            return (
              <div key={group.brand} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                {/* ── Group Header ─────────────────────────────── */}
                <div className={`flex items-center gap-3 px-4 py-3 ${group.color.header}`}>
                  <div className={`w-1.5 h-8 rounded-full ${group.color.bar}`} />
                  <h2 className={`text-sm font-bold ${group.color.text}`}>
                    {group.brand}
                  </h2>
                  <Badge className={`${group.color.light} ${group.color.text} text-[10px]`}>
                    {group.items.length}개 프로젝트
                  </Badge>
                  <span className="text-[10px] text-gray-400 ml-auto flex items-center gap-1">
                    <GripVertical className="h-3 w-3" /> 드래그로 우선순위 변경
                  </span>
                </div>

                {/* ── Table Headers ────────────────────────────── */}
                <div className="grid grid-cols-[32px_minmax(0,2.5fr)_120px_minmax(0,1.2fr)_80px_90px_100px_60px] gap-0 items-center px-4 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <div />
                  <div>프로젝트명</div>
                  <div>담당자</div>
                  <div>진행상황</div>
                  <div className="text-center">우선순위</div>
                  <div className="text-center">마감일</div>
                  <div>현재단계</div>
                  <div className="text-center">작업</div>
                </div>

                {/* ── Project Rows ─────────────────────────────── */}
                <div className="divide-y divide-gray-100">
                  {group.items.map((p) => {
                    const isExpanded = expandedProjects.has(p.id)
                    const isFav = favorites.has(p.id)
                    const priorityInfo = getPriorityInfo(p.priority)
                    const sortedStages = [...p.stages].sort((a, b) => a.stage_order - b.stage_order)

                    return (
                      <div key={p.id}>
                        {/* Main project row */}
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, p.id)}
                          onDragEnd={handleDragEnd}
                          onDragEnter={(e) => handleDragEnter(e, p.id)}
                          onDragLeave={handleDragLeave}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, p.id)}
                          className={`grid grid-cols-[32px_minmax(0,2.5fr)_120px_minmax(0,1.2fr)_80px_90px_100px_60px] gap-0 items-center px-4 py-2.5 transition-all cursor-pointer group ${
                            dragOverId === p.id && draggedId !== p.id
                              ? 'bg-blue-50 shadow-inner'
                              : draggedId === p.id
                              ? 'bg-gray-100 opacity-50'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          {/* Expand chevron + drag handle */}
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleExpand(p.id) }}
                              className="p-0.5 rounded hover:bg-gray-200 transition-colors"
                            >
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                                : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                              }
                            </button>
                            <div className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
                              <GripVertical className="h-3.5 w-3.5 text-gray-300" />
                            </div>
                          </div>

                          {/* Project name */}
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              onClick={(e) => toggleFavorite(p.id, e)}
                              className="shrink-0"
                            >
                              <Star
                                className={`h-3.5 w-3.5 transition-colors ${
                                  isFav ? 'text-amber-400 fill-amber-400' : 'text-gray-300 hover:text-amber-300'
                                }`}
                              />
                            </button>
                            <span
                              onClick={() => navigate(`/admin/projects/${p.id}`)}
                              className="text-sm font-medium text-gray-900 truncate hover:text-blue-600 hover:underline transition-colors cursor-pointer"
                            >
                              {p.project_name}
                            </span>
                            {p.linkedTasks.length > 0 && (
                              <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
                                {p.linkedTasks.length}
                              </span>
                            )}
                            {p.delayed > 0 && (
                              <span className="shrink-0 text-red-500">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>

                          {/* Assignees */}
                          <div className="flex items-center -space-x-1.5">
                            {(p.assignee_names || []).slice(0, 3).map((name, i) => (
                              <div
                                key={i}
                                className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white flex items-center justify-center text-[10px] font-bold border-2 border-white shadow-sm"
                                title={name}
                              >
                                {name.slice(0, 1)}
                              </div>
                            ))}
                            {(p.assignee_names || []).length > 3 && (
                              <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[10px] font-bold border-2 border-white">
                                +{(p.assignee_names || []).length - 3}
                              </div>
                            )}
                            {(!p.assignee_names || p.assignee_names.length === 0) && (
                              <span className="text-[11px] text-gray-400">-</span>
                            )}
                          </div>

                          {/* Progress bar */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                                style={{ width: `${p.progress}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-600 w-9 text-right tabular-nums">
                              {p.progress}%
                            </span>
                          </div>

                          {/* Priority */}
                          <div className="flex justify-center">
                            <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded text-[11px] font-bold ${priorityInfo.color}`}>
                              {priorityInfo.label}
                            </span>
                          </div>

                          {/* Launch date */}
                          <div className="text-center text-xs text-gray-600">
                            {formatDateShort(p.launch_date)}
                          </div>

                          {/* Current stage */}
                          <div>
                            {p.currentStage ? (
                              <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full truncate block text-center">
                                {p.currentStage.stage_name}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-400 block text-center">-</span>
                            )}
                          </div>

                          {/* Task count */}
                          <div className="text-center text-xs text-gray-500 font-medium">
                            {p.linkedTasks.length}
                          </div>
                        </div>

                        {/* ── Expanded sub-rows (pipeline stages) ── */}
                        {isExpanded && (
                          <div className={`border-l-4 ${group.color.bar} bg-gray-50/70`}>
                            <div className="grid grid-cols-[32px_minmax(0,2.5fr)_120px_minmax(0,1.2fr)_80px_90px_100px_60px] gap-0 items-center px-4 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">
                              <div />
                              <div className="pl-6">파이프라인 단계</div>
                              <div>담당자</div>
                              <div>상태</div>
                              <div className="text-center">순서</div>
                              <div className="text-center">마감일</div>
                              <div className="text-center">D-Day</div>
                              <div />
                            </div>
                            {sortedStages.map((stage) => {
                              const dday = getDday(stage.deadline)
                              const stageAssignees = (stage.stage_assignee_ids || [])
                                .map((id) => getEmpName(id))
                                .filter((n) => n !== '-')

                              return (
                                <div
                                  key={stage.id}
                                  className="grid grid-cols-[32px_minmax(0,2.5fr)_120px_minmax(0,1.2fr)_80px_90px_100px_60px] gap-0 items-center px-4 py-2 border-b border-gray-100 last:border-b-0 hover:bg-white/80 transition-colors"
                                >
                                  <div />
                                  {/* Stage name */}
                                  <div className="pl-6 flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      stage.status === '완료' ? 'bg-emerald-500' :
                                      stage.status === '진행중' ? 'bg-blue-500' :
                                      stage.status === '홀딩' ? 'bg-amber-500' : 'bg-gray-300'
                                    }`} />
                                    <span className="text-[12px] text-gray-700 font-medium truncate">
                                      {stage.stage_name}
                                    </span>
                                  </div>

                                  {/* Stage assignees */}
                                  <div className="flex items-center -space-x-1">
                                    {stageAssignees.length > 0 ? stageAssignees.slice(0, 2).map((name, i) => (
                                      <div
                                        key={i}
                                        className="w-6 h-6 rounded-full bg-gray-300 text-gray-700 flex items-center justify-center text-[9px] font-bold border-2 border-white"
                                        title={name}
                                      >
                                        {name.slice(0, 1)}
                                      </div>
                                    )) : (
                                      <span className="text-[11px] text-gray-400">-</span>
                                    )}
                                  </div>

                                  {/* Status selector pill */}
                                  <div>
                                    <select
                                      value={stage.status}
                                      onChange={(e) => handleStageStatusChange(stage.id, p.id, e.target.value as StageStatus)}
                                      className={`text-[11px] font-bold rounded-full px-3 py-1 border-0 cursor-pointer appearance-none text-center ${STAGE_PILL_COLORS[stage.status] || STAGE_STATUS_COLORS[stage.status]}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="시작전">시작전</option>
                                      <option value="진행중">진행중</option>
                                      <option value="완료">완료</option>
                                      <option value="홀딩">홀딩</option>
                                    </select>
                                  </div>

                                  {/* Order */}
                                  <div className="text-center text-[11px] text-gray-400">
                                    {stage.stage_order}
                                  </div>

                                  {/* Deadline */}
                                  <div className="text-center text-[11px] text-gray-600">
                                    {formatDateShort(stage.deadline)}
                                  </div>

                                  {/* D-day */}
                                  <div className="flex justify-center">
                                    {dday ? (
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dday.className}`}>
                                        {dday.label}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-gray-300">-</span>
                                    )}
                                  </div>

                                  <div />
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* ── Add item button ──────────────────────────── */}
                <button
                  onClick={() => navigate('/admin/projects/new')}
                  className={`w-full flex items-center gap-2 px-6 py-2.5 text-sm ${group.color.text} hover:${group.color.header} transition-colors border-t border-gray-100`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="font-medium">아이템 추가</span>
                </button>

                {/* ── Group Summary Row ────────────────────────── */}
                <div className={`px-4 py-2.5 ${group.color.header} border-t border-gray-200 flex items-center gap-6 text-[11px]`}>
                  <span className={`font-semibold ${group.color.text}`}>요약</span>

                  {/* Average progress */}
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">평균 진행률</span>
                    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                        style={{ width: `${avgProgress}%` }}
                      />
                    </div>
                    <span className="font-bold text-gray-700">{avgProgress}%</span>
                  </div>

                  {/* Priority distribution mini-blocks */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">우선순위</span>
                    <div className="flex gap-0.5">
                      {priorityDist.urgent > 0 && (
                        <div className="flex items-center gap-0.5">
                          <div className="w-3 h-3 rounded-sm bg-rose-500" />
                          <span className="text-rose-600 font-bold">{priorityDist.urgent}</span>
                        </div>
                      )}
                      {priorityDist.high > 0 && (
                        <div className="flex items-center gap-0.5 ml-1">
                          <div className="w-3 h-3 rounded-sm bg-violet-500" />
                          <span className="text-violet-600 font-bold">{priorityDist.high}</span>
                        </div>
                      )}
                      {priorityDist.mid > 0 && (
                        <div className="flex items-center gap-0.5 ml-1">
                          <div className="w-3 h-3 rounded-sm bg-indigo-500" />
                          <span className="text-indigo-600 font-bold">{priorityDist.mid}</span>
                        </div>
                      )}
                      {priorityDist.low > 0 && (
                        <div className="flex items-center gap-0.5 ml-1">
                          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                          <span className="text-emerald-600 font-bold">{priorityDist.low}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Total tasks */}
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-gray-500">작업</span>
                    <span className="font-bold text-gray-700">{totalTasks}개</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ─── Bottom Widgets ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 주의 필요 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" /> 주의 필요
              <Badge variant="danger" className="text-[10px]">{delayedStages.length + overdueTasks.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {delayedStages.length === 0 && overdueTasks.length === 0 ? (
              <div className="text-center py-6 text-emerald-600 flex flex-col items-center gap-1">
                <CheckCircle className="h-8 w-8" />
                <p className="text-sm font-medium">지연 항목 없음</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {delayedStages.map((s) => {
                  const project = filteredProjects.find((pr) => pr.stages.some((st) => st.id === s.id))
                  const days = Math.abs(Math.ceil((new Date(s.deadline!).getTime() - Date.now()) / 86400000))
                  return (
                    <div key={s.id} className="flex items-center justify-between p-2.5 bg-red-50 rounded-lg text-sm border border-red-100">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        <div>
                          <span className="font-medium text-red-800 text-xs">{project?.project_name}</span>
                          <span className="text-red-500 text-[11px] ml-1">{s.stage_name}</span>
                        </div>
                      </div>
                      <Badge variant="danger" className="text-[10px]">D+{days}</Badge>
                    </div>
                  )
                })}
                {overdueTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2.5 bg-amber-50 rounded-lg text-sm border border-amber-100">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      <div>
                        <span className="font-medium text-amber-800 text-xs">{t.title}</span>
                        <span className="text-amber-500 text-[11px] ml-1">{getEmpName(t.assignee_id)}</span>
                      </div>
                    </div>
                    <Badge variant="warning" className="text-[10px]">
                      <Calendar className="h-3 w-3 mr-0.5" />
                      {t.due_date?.slice(5)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 담당자별 업무량 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-500" /> 담당자별 업무량
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assigneeWorkload.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">데이터 없음</p>
            ) : (
              <div className="space-y-2.5">
                {assigneeWorkload.map(([id, data]) => {
                  const totalLoad = data.projects + data.tasks
                  const maxLoad = Math.max(...assigneeWorkload.map(([, d]) => d.projects + d.tasks), 1)
                  const loadPercent = Math.round((totalLoad / maxLoad) * 100)
                  const isOverloaded = totalLoad >= 8 || data.overdue > 2

                  return (
                    <div key={id} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        isOverloaded ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {data.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-gray-800 truncate">{data.name}</span>
                          <div className="flex items-center gap-2 text-[10px] shrink-0">
                            <span className="text-blue-600">{data.projects}P</span>
                            <span className="text-gray-500">{data.tasks}T</span>
                            {data.overdue > 0 && <span className="text-red-600 font-bold">{data.overdue}지연</span>}
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOverloaded ? 'bg-red-500' : loadPercent >= 70 ? 'bg-amber-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${loadPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
