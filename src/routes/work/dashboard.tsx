import { useState, useEffect, useCallback } from 'react'
import {
  FolderKanban,
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'
import type { Project, Task } from '@/types/work'

export default function WorkDashboard() {
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [projRes, taskRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').order('due_date', { ascending: true }),
    ])
    if (projRes.data) setProjects(projRes.data as Project[])
    if (taskRes.data) setTasks(taskRes.data as Task[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <PageSpinner />

  const activeProjects = projects.filter((p) => p.status === 'active')
  const totalTasks = tasks.length
  const completedTasks = tasks.filter((t) => t.status === 'done').length
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const today = new Date().toISOString().slice(0, 10)
  const overdueTasks = tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'cancelled' && t.due_date && t.due_date < today
  )
  const recentTasks = tasks
    .filter((t) => t.status !== 'cancelled')
    .slice(0, 10)

  const STATUS_LABELS: Record<string, string> = {
    planning: '기획',
    active: '진행중',
    completed: '완료',
    cancelled: '취소',
  }
  const STATUS_VARIANTS: Record<string, 'default' | 'primary' | 'success' | 'danger'> = {
    planning: 'default',
    active: 'primary',
    completed: 'success',
    cancelled: 'danger',
  }

  const TASK_STATUS_LABELS: Record<string, string> = {
    todo: '예정',
    in_progress: '진행중',
    done: '완료',
    cancelled: '취소',
  }
  const PRIORITY_LABELS: Record<string, string> = {
    urgent: '긴급',
    high: '높음',
    normal: '보통',
    low: '낮음',
  }
  const PRIORITY_VARIANTS: Record<string, 'danger' | 'warning' | 'default' | 'info'> = {
    urgent: 'danger',
    high: 'warning',
    normal: 'default',
    low: 'info',
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">업무 대시보드</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4 text-center">
            <FolderKanban className="h-8 w-8 mx-auto text-brand-600 mb-1" />
            <p className="text-2xl font-bold text-brand-600">{activeProjects.length}</p>
            <p className="text-xs text-gray-500">진행 중 프로젝트</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <ListChecks className="h-8 w-8 mx-auto text-gray-600 mb-1" />
            <p className="text-2xl font-bold text-gray-700">{totalTasks}</p>
            <p className="text-xs text-gray-500">전체 작업</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-600 mb-1" />
            <p className="text-2xl font-bold text-emerald-600">{completionRate}%</p>
            <p className="text-xs text-gray-500">완료율</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-red-500 mb-1" />
            <p className="text-2xl font-bold text-red-600">{overdueTasks.length}</p>
            <p className="text-xs text-gray-500">지연 작업</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Project Status Overview */}
        <Card>
          <CardHeader>
            <CardTitle>프로젝트 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">등록된 프로젝트가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 8).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">
                        {p.start_date && `${p.start_date}`}
                        {p.end_date && ` ~ ${p.end_date}`}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANTS[p.status] || 'default'}>
                      {STATUS_LABELS[p.status] || p.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> 최근 작업
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">등록된 작업이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {recentTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={PRIORITY_VARIANTS[t.priority]} className="shrink-0 text-[10px]">
                        {PRIORITY_LABELS[t.priority]}
                      </Badge>
                      <span className="text-sm text-gray-900 truncate">{t.title}</span>
                    </div>
                    <span className="text-xs text-gray-500 shrink-0 ml-2">
                      {TASK_STATUS_LABELS[t.status] || t.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Overdue Tasks */}
      {overdueTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" /> 지연 작업
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t.title}</p>
                    <p className="text-xs text-red-600">마감일: {t.due_date}</p>
                  </div>
                  <Badge variant="danger">{PRIORITY_LABELS[t.priority]}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
