import { useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, TrendingUp, AlertTriangle, CheckCircle,
  Users, ArrowRight, Calendar, GripVertical,
  Target, Clock, Activity, PieChart,
  Layers,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useProjectBoard } from '@/hooks/useProjectBoard'
import { supabase } from '@/lib/supabase'
import { useEffect } from 'react'
import type { Task } from '@/types/work'
import {
  PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS,
  BRAND_COLORS,
} from '@/types/project-board'

export default function UnifiedDashboard() {
  const navigate = useNavigate()
  const { projects, loading: boardLoading, updateProject } = useProjectBoard()

  const [tasks, setTasks] = useState<Task[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [filterBrand, setFilterBrand] = useState('')

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

  const getEmpName = (id: string | null) => employees.find((e) => e.id === id)?.name || '-'

  // Filtered projects
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

  // Projects with progress
  const projectsWithProgress = filteredProjects.map((p) => {
    const total = p.stages.length
    const completed = p.stages.filter((s) => s.status === '완료').length
    const inProgress = p.stages.filter((s) => s.status === '진행중').length
    const delayed = p.stages.filter((s) => s.status !== '완료' && s.deadline && new Date(s.deadline) < new Date()).length
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0
    const currentStage = p.stages.find((s) => s.status === '진행중') || p.stages.find((s) => s.status === '시작전')
    const linkedTasks = tasks.filter((t) => t.linked_board_id === p.id)
    return { ...p, progress, completed, inProgress, delayed, currentStage, linkedTasks, total }
  })

  // Drag & Drop handler
  const handleDrop = useCallback(async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDragOverId(null)
    dragCounter.current = 0

    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      return
    }

    const visibleProjects = projectsWithProgress
      .filter((p) => p.status === 'active' || p.status === 'holding')
      .slice(0, 10)

    const ids = visibleProjects.map((p) => p.id)
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
      const proj = visibleProjects.find((p) => p.id === ids[i])
      if (proj && proj.priority !== i + 1) {
        await updateProject(ids[i], { priority: i + 1 } as any)
      }
    }
  }, [draggedId, projectsWithProgress, updateProject])

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
  }, [filteredProjects, activeTasks, employees])

  // Status distribution for pie chart visual
  const statusDistribution = useMemo(() => [
    { label: '진행중', count: activeProjects.length, color: 'bg-blue-500', textColor: 'text-blue-600' },
    { label: '홀딩', count: holdingProjects.length, color: 'bg-amber-500', textColor: 'text-amber-600' },
    { label: '완료', count: completedProjects.length, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
  ], [activeProjects, holdingProjects, completedProjects])

  if (boardLoading || tasksLoading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">프로젝트 & 업무 대시보드</h1>
          <p className="text-sm text-gray-500 mt-0.5">전체 프로젝트 현황을 한눈에 파악합니다</p>
        </div>
        <div className="flex gap-2">
          <Select
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
            options={[{ value: '', label: '전체 브랜드' }, ...brands.map((b) => ({ value: b, label: b }))]}
          />
          <Button onClick={() => navigate('/admin/projects/new')}>+ 새 프로젝트</Button>
        </div>
      </div>

      {/* Monday.com 스타일 메인 통계 위젯 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* 프로젝트 현황 */}
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
              <span className="text-[11px] text-gray-500">파이프라인</span>
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

      {/* Monday.com 스타일 프로젝트 상태 분포 + 프로젝트 현황 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 상태 분포 위젯 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PieChart className="h-4 w-4 text-violet-500" /> 프로젝트 분포
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Visual pie representation */}
            <div className="flex items-center justify-center mb-4">
              <div className="relative w-28 h-28">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 36 36">
                  {(() => {
                    const total = filteredProjects.length || 1
                    let cumulative = 0
                    const colors = ['#3b82f6', '#f59e0b', '#10b981']
                    return statusDistribution.map((item, i) => {
                      const pct = (item.count / total) * 100
                      const offset = cumulative
                      cumulative += pct
                      return (
                        <circle
                          key={i}
                          cx="18" cy="18" r="15.5"
                          fill="none"
                          stroke={colors[i]}
                          strokeWidth="4"
                          strokeDasharray={`${pct} ${100 - pct}`}
                          strokeDashoffset={`-${offset}`}
                          className="transition-all duration-500"
                        />
                      )
                    })
                  })()}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xl font-bold text-gray-900">{filteredProjects.length}</p>
                    <p className="text-[9px] text-gray-400">프로젝트</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {statusDistribution.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                    <span className="text-xs text-gray-600">{item.label}</span>
                  </div>
                  <span className={`text-sm font-bold ${item.textColor}`}>{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 프로젝트 현황 (3/4 너비) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" /> 프로젝트 현황
                <Badge variant="default" className="text-[10px] ml-1">{projectsWithProgress.filter((p) => p.status === 'active' || p.status === 'holding').length}</Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                  <GripVertical className="h-3 w-3" /> 드래그로 우선순위 변경
                </span>
                <Button size="sm" variant="outline" onClick={() => navigate('/admin/projects/board')}>
                  보드 보기 <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {projectsWithProgress.length === 0 ? (
              <p className="text-center py-8 text-gray-400">프로젝트가 없습니다</p>
            ) : (
              <div className="space-y-1.5">
                {projectsWithProgress.filter((p) => p.status === 'active' || p.status === 'holding').slice(0, 10).map((p, idx) => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, p.id)}
                    onDragEnd={handleDragEnd}
                    onDragEnter={(e) => handleDragEnter(e, p.id)}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, p.id)}
                    onClick={() => navigate(`/admin/projects/${p.id}`)}
                    className={`w-full text-left p-3 border rounded-lg transition-all cursor-pointer ${
                      dragOverId === p.id && draggedId !== p.id
                        ? 'border-blue-400 bg-blue-50 shadow-md'
                        : draggedId === p.id
                        ? 'border-gray-300 bg-gray-100 opacity-50'
                        : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex items-center gap-1 cursor-grab active:cursor-grabbing select-none"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <GripVertical className="h-4 w-4 text-gray-300" />
                          <span className="text-[11px] font-bold text-gray-400 w-5 text-center">{idx + 1}</span>
                        </div>
                        <Badge className={BRAND_COLORS[p.brand] || 'bg-gray-100 text-gray-600'}>{p.brand}</Badge>
                        <span className="text-sm font-semibold text-gray-900">{p.project_name}</span>
                        <Badge className={PROJECT_STATUS_COLORS[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        {p.currentStage && (
                          <span className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full text-[11px] font-medium">
                            <TrendingUp className="h-3 w-3" />
                            {p.currentStage.stage_name}
                          </span>
                        )}
                        {p.launch_date && (
                          <span className="flex items-center gap-1 text-[11px]">
                            <Calendar className="h-3 w-3" />
                            {p.launch_date}
                          </span>
                        )}
                        {p.delayed > 0 && (
                          <span className="text-red-600 font-bold flex items-center gap-0.5 text-[11px]">
                            <AlertTriangle className="h-3 w-3" /> {p.delayed}지연
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 역할 */}
                    {(p.manager_name || p.leader_name || p.executive_name) && (
                      <div className="flex items-center gap-3 mb-2 ml-9 text-[11px] text-gray-500">
                        {p.manager_name && <span>담당: <span className="text-gray-700 font-medium">{p.manager_name}</span></span>}
                        {p.leader_name && <span>리더: <span className="text-gray-700 font-medium">{p.leader_name}</span></span>}
                        {p.executive_name && <span>이사: <span className="text-gray-700 font-medium">{p.executive_name}</span></span>}
                      </div>
                    )}

                    {/* Progress */}
                    <div className="flex items-center gap-3 ml-9">
                      <div className="flex-1">
                        <ProgressBar
                          value={p.progress}
                          max={100}
                          size="sm"
                          showPercent={false}
                          color={p.delayed > 0 ? 'red' : p.progress >= 70 ? 'emerald' : 'brand'}
                        />
                      </div>
                      <span className="text-xs font-bold text-gray-600 w-10 text-right">{p.progress}%</span>
                      <span className="text-[10px] text-gray-400 w-24 text-right">
                        {p.completed}/{p.total} 단계 · {p.linkedTasks.length}작업
                      </span>
                    </div>

                    {/* Pipeline mini-view */}
                    <div className="flex gap-0.5 mt-2 ml-9">
                      {p.stages.sort((a, b) => a.stage_order - b.stage_order).map((s) => (
                        <div
                          key={s.id}
                          className={`flex-1 h-1.5 rounded-full ${
                            s.status === '완료' ? 'bg-emerald-400' :
                            s.status === '진행중' ? 'bg-blue-400' :
                            s.status === '홀딩' ? 'bg-amber-400' : 'bg-gray-200'
                          }`}
                          title={`${s.stage_name}: ${s.status}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 하단 위젯 영역 */}
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
                  const project = filteredProjects.find((p) => p.stages.some((st) => st.id === s.id))
                  const days = Math.abs(Math.ceil((new Date(s.deadline!).getTime() - Date.now()) / 86400000))
                  return (
                    <div key={s.id} className="flex items-center justify-between p-2.5 bg-red-50 rounded-lg text-sm border border-red-100">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        <div>
                          <span className="font-medium text-red-800 text-xs">{project?.project_name}</span>
                          <span className="text-red-500 text-[11px] ml-1">· {s.stage_name}</span>
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
                        <span className="text-amber-500 text-[11px] ml-1">· {getEmpName(t.assignee_id)}</span>
                      </div>
                    </div>
                    <Badge variant="warning" className="text-[10px]">{t.due_date?.slice(5)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 담당자별 업무량 - Monday.com 워크로드 위젯 스타일 */}
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
              <div className="space-y-2">
                {assigneeWorkload.map(([id, data]) => {
                  const totalLoad = data.projects + data.tasks
                  const maxLoad = Math.max(...assigneeWorkload.map(([, d]) => d.projects + d.tasks), 1)
                  const loadPercent = Math.round((totalLoad / maxLoad) * 100)
                  const isOverloaded = totalLoad >= 8 || data.overdue > 2

                  return (
                    <div key={id} className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        isOverloaded ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {data.name[0]}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-gray-800 truncate">{data.name}</span>
                          <div className="flex items-center gap-2 text-[10px] shrink-0">
                            <span className="text-blue-600">{data.projects}P</span>
                            <span className="text-gray-500">{data.tasks}T</span>
                            {data.overdue > 0 && <span className="text-red-600 font-bold">{data.overdue}지연</span>}
                          </div>
                        </div>
                        {/* Workload bar */}
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
