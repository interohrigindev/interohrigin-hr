import { useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, TrendingUp, AlertTriangle, CheckCircle,
  Users, ArrowRight, Calendar, GripVertical,
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

  // ─── Drag & Drop ────────────────────────────────────────
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragCounter = useRef(0)

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
    // 드래그 중 반투명 효과
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
    if (dragCounter.current === 0) {
      setDragOverId(null)
    }
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

  // ─── Filtered projects ────────────────────────────────────
  const filteredProjects = useMemo(() => {
    if (!filterBrand) return projects
    return projects.filter((p) => p.brand === filterBrand)
  }, [projects, filterBrand])

  const brands = useMemo(() => [...new Set(projects.map((p) => p.brand))], [projects])

  // ─── Stats ────────────────────────────────────────────────
  const activeProjects = filteredProjects.filter((p) => p.status === 'active')
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

  // ─── Projects with progress ───────────────────────────────
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

  // ─── Drag & Drop handler (needs projectsWithProgress) ───
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

  // ─── Assignee workload ────────────────────────────────────
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

  if (boardLoading || tasksLoading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">프로젝트 & 업무 대시보드</h1>
        <div className="flex gap-2">
          <Select
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
            options={[{ value: '', label: '전체 브랜드' }, ...brands.map((b) => ({ value: b, label: b }))]}
          />
          <Button onClick={() => navigate('/admin/projects/new')}>+ 새 프로젝트</Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="py-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{activeProjects.length}</p>
          <p className="text-xs text-gray-500">진행중 프로젝트</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 text-center">
          <p className="text-2xl font-bold text-brand-600">{overallProgress}%</p>
          <p className="text-xs text-gray-500">전체 파이프라인 진행률</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{activeTasks.length}</p>
          <p className="text-xs text-gray-500">전체 작업 ({taskCompletionRate}% 완료)</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 text-center">
          <p className={`text-2xl font-bold ${delayedStages.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {delayedStages.length}
          </p>
          <p className="text-xs text-gray-500">지연 단계</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 text-center">
          <p className={`text-2xl font-bold ${overdueTasks.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {overdueTasks.length}
          </p>
          <p className="text-xs text-gray-500">지연 작업</p>
        </CardContent></Card>
      </div>

      {/* Projects overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> 프로젝트 현황
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => navigate('/admin/projects')}>
              보드 보기 <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {projectsWithProgress.length === 0 ? (
            <p className="text-center py-6 text-gray-400">프로젝트가 없습니다</p>
          ) : (
            <div className="space-y-1">
              <p className="text-[11px] text-gray-400 mb-2 flex items-center gap-1">
                <GripVertical className="h-3 w-3" /> 드래그하여 우선순위를 변경하세요
              </p>
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
                      ? 'border-brand-400 bg-brand-50 shadow-md'
                      : draggedId === p.id
                      ? 'border-gray-300 bg-gray-100 opacity-50'
                      : 'border-gray-200 hover:bg-gray-50'
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
                      <span className="text-sm font-medium text-gray-900">{p.project_name}</span>
                      <Badge className={PROJECT_STATUS_COLORS[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {p.currentStage && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {p.currentStage.stage_name}
                        </span>
                      )}
                      {p.launch_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {p.launch_date}
                        </span>
                      )}
                      {p.delayed > 0 && (
                        <span className="text-red-600 font-medium flex items-center gap-0.5">
                          <AlertTriangle className="h-3 w-3" /> {p.delayed}지연
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 역할 표시 */}
                  {(p.manager_name || p.leader_name || p.executive_name) && (
                    <div className="flex items-center gap-3 mb-2 ml-9 text-[11px] text-gray-500">
                      {p.manager_name && <span>담당: <span className="text-gray-700 font-medium">{p.manager_name}</span></span>}
                      {p.leader_name && <span>리더: <span className="text-gray-700 font-medium">{p.leader_name}</span></span>}
                      {p.executive_name && <span>이사: <span className="text-gray-700 font-medium">{p.executive_name}</span></span>}
                    </div>
                  )}

                  <div className="flex items-center gap-3 ml-9">
                    <div className="flex-1">
                      <ProgressBar
                        value={p.progress}
                        max={100}
                        size="sm"
                        color={p.delayed > 0 ? 'red' : p.progress >= 70 ? 'emerald' : 'brand'}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-600 w-12 text-right">{p.progress}%</span>
                    <span className="text-[10px] text-gray-400 w-20 text-right">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Overdue items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" /> 주의 필요 ({delayedStages.length + overdueTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {delayedStages.length === 0 && overdueTasks.length === 0 ? (
              <div className="text-center py-6 text-emerald-600 flex flex-col items-center gap-1">
                <CheckCircle className="h-8 w-8" />
                <p className="text-sm font-medium">지연 항목 없음</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {delayedStages.map((s) => {
                  const project = filteredProjects.find((p) => p.stages.some((st) => st.id === s.id))
                  const days = Math.abs(Math.ceil((new Date(s.deadline!).getTime() - Date.now()) / 86400000))
                  return (
                    <div key={s.id} className="flex items-center justify-between p-2 bg-red-50 rounded-lg text-sm">
                      <div>
                        <span className="font-medium text-red-800">{project?.project_name}</span>
                        <span className="text-red-600 ml-1">· {s.stage_name}</span>
                      </div>
                      <Badge variant="danger">D+{days}</Badge>
                    </div>
                  )
                })}
                {overdueTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg text-sm">
                    <div>
                      <span className="font-medium text-amber-800">{t.title}</span>
                      <span className="text-amber-600 ml-1">· {getEmpName(t.assignee_id)}</span>
                    </div>
                    <Badge variant="warning">마감 {t.due_date?.slice(5)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team workload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" /> 담당자별 업무량
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assigneeWorkload.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">데이터 없음</p>
            ) : (
              <div className="space-y-2">
                {assigneeWorkload.map(([id, data]) => (
                  <div key={id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-800">{data.name}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-blue-600">{data.projects}프로젝트</span>
                      <span className="text-gray-600">{data.tasks}작업</span>
                      {data.overdue > 0 && <span className="text-red-600 font-bold">{data.overdue}지연</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
