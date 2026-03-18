import { useState, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useUrgentTasks, useUrgentTaskStats, useUrgentTaskMutations, useEmployeeList } from '@/hooks/useUrgentTasks'
import { useToast } from '@/components/ui/Toast'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { PageSpinner } from '@/components/ui/Spinner'
import {
  AlertTriangle,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Timer,
  Bell,
  Trash2,
  Edit3,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UrgentTask, UrgentTaskFormData } from '@/types/urgent-tasks'

// ─── 상태 라벨/색상 ──────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  pending: { label: '대기', variant: 'default' },
  in_progress: { label: '진행중', variant: 'warning' },
  completed: { label: '완료', variant: 'success' },
  overdue: { label: '기한 초과', variant: 'danger' },
}

function getDDay(deadline: string): { label: string; isOverdue: boolean; isDanger: boolean } {
  const now = new Date()
  const dl = new Date(deadline)
  const diffMs = dl.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays > 0) return { label: `D-${diffDays}`, isOverdue: false, isDanger: diffDays <= 1 }
  if (diffDays === 0) return { label: 'D-Day', isOverdue: false, isDanger: true }
  return { label: `D+${Math.abs(diffDays)}`, isOverdue: true, isDanger: true }
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────
export default function UrgentDashboard() {
  const { profile, isAdmin } = useAuth()
  const { toast } = useToast()
  const { tasks, loading, refetch } = useUrgentTasks()
  const { stats } = useUrgentTaskStats()
  const { employees } = useEmployeeList()
  const { createTask, deleteTask, completeTask, updateTask } = useUrgentTaskMutations()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showCompleteDialog, setShowCompleteDialog] = useState<string | null>(null)
  const [showEditDialog, setShowEditDialog] = useState<UrgentTask | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('active')

  // 필터링
  const filteredTasks = useMemo(() => {
    if (filterStatus === 'active') {
      return tasks.filter((t) => t.status !== 'completed')
    }
    if (filterStatus === 'all') return tasks
    return tasks.filter((t) => t.status === filterStatus)
  }, [tasks, filterStatus])

  // 내 업무인지 확인
  function isMyTask(task: UrgentTask): boolean {
    return profile ? task.assigned_to.includes(profile.id) : false
  }

  // 직원 이름 조회
  function getEmployeeName(id: string): string {
    return employees.find((e) => e.id === id)?.name ?? '알 수 없음'
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-7 w-7 text-red-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">CEO 긴급 업무</h1>
            <p className="text-sm text-gray-500">전사 긴급 업무 현황 (Top 10)</p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            긴급 업무 추가
          </Button>
        )}
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon={<AlertTriangle className="h-5 w-5 text-gray-500" />} label="전체" value={stats.total} />
        <StatCard icon={<Clock className="h-5 w-5 text-gray-400" />} label="대기" value={stats.pending} />
        <StatCard icon={<Timer className="h-5 w-5 text-amber-500" />} label="진행중" value={stats.inProgress} />
        <StatCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="완료" value={stats.completed} />
        <StatCard icon={<AlertCircle className="h-5 w-5 text-red-500" />} label="기한 초과" value={stats.overdue} color="text-red-600" />
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-2">
        {[
          { key: 'active', label: '미완료' },
          { key: 'completed', label: '완료' },
          { key: 'all', label: '전체' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              filterStatus === f.key
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 업무 목록 */}
      {filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10" />
            <p>긴급 업무가 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task, index) => {
            const dday = getDDay(task.deadline)
            const isMine = isMyTask(task)
            const config = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending

            return (
              <Card
                key={task.id}
                className={cn(
                  'transition-shadow hover:shadow-md',
                  isMine && task.status !== 'completed' && 'ring-2 ring-brand-200',
                  task.status === 'overdue' && 'border-red-200 bg-red-50/30'
                )}
              >
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    {/* 우선순위 번호 */}
                    <div className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold',
                      task.priority <= 3
                        ? 'bg-red-100 text-red-700'
                        : task.priority <= 6
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                    )}>
                      {index + 1}
                    </div>

                    {/* 내용 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{task.title}</h3>
                        <Badge variant={config.variant}>{config.label}</Badge>
                        <span className={cn(
                          'text-sm font-medium',
                          dday.isDanger ? 'text-red-600' : 'text-gray-500'
                        )}>
                          {dday.label}
                        </span>
                        {task.reminder_count >= 5 && (
                          <Badge variant="danger">
                            <Bell className="mr-1 h-3 w-3" />
                            리마인드 {task.reminder_count}회
                          </Badge>
                        )}
                        {task.reminder_count > 0 && task.reminder_count < 5 && (
                          <span className="text-xs text-gray-400">
                            리마인드 {task.reminder_count}회
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className="mt-1 text-sm text-gray-500 line-clamp-2">{task.description}</p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                        <span>
                          담당: {task.assigned_to.map((id) => getEmployeeName(id)).join(', ')}
                        </span>
                        <span>지시: {task.created_by ? getEmployeeName(task.created_by) : '-'}</span>
                        <span>마감: {new Date(task.deadline).toLocaleDateString('ko-KR')}</span>
                        {task.completed_at && (
                          <span className="text-emerald-500">
                            완료: {new Date(task.completed_at).toLocaleDateString('ko-KR')}
                          </span>
                        )}
                      </div>

                      {task.completion_note && (
                        <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                          완료 보고: {task.completion_note}
                        </div>
                      )}
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex shrink-0 flex-col gap-1">
                      {isMine && task.status !== 'completed' && (
                        <Button
                          size="sm"
                          onClick={() => setShowCompleteDialog(task.id)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          완료 보고
                        </Button>
                      )}
                      {isAdmin && task.status !== 'completed' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowEditDialog(task)}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-700"
                            onClick={async () => {
                              if (!confirm('이 긴급 업무를 삭제하시겠습니까?')) return
                              const { error } = await deleteTask(task.id)
                              if (error) {
                                toast('삭제 실패: ' + error.message, 'error')
                              } else {
                                toast('긴급 업무가 삭제되었습니다')
                                refetch()
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── 긴급 업무 생성 다이얼로그 ───────────────────────────── */}
      <CreateTaskDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        employees={employees}
        onSubmit={async (formData) => {
          if (!profile) return
          const { error } = await createTask({
            ...formData,
            created_by: profile.id,
          })
          if (error) {
            toast('생성 실패: ' + error.message, 'error')
          } else {
            toast('긴급 업무가 추가되었습니다')
            setShowCreateDialog(false)
            refetch()
          }
        }}
      />

      {/* ─── 완료 보고 다이얼로그 ────────────────────────────────── */}
      <CompleteTaskDialog
        open={!!showCompleteDialog}
        onClose={() => setShowCompleteDialog(null)}
        onSubmit={async (note) => {
          if (!showCompleteDialog || !profile) return
          const { error } = await completeTask(showCompleteDialog, profile.id, note)
          if (error) {
            toast('완료 보고 실패: ' + error.message, 'error')
          } else {
            toast('완료 보고가 제출되었습니다')
            setShowCompleteDialog(null)
            refetch()
          }
        }}
      />

      {/* ─── 수정 다이얼로그 ─────────────────────────────────────── */}
      {showEditDialog && (
        <EditTaskDialog
          open={!!showEditDialog}
          task={showEditDialog}
          employees={employees}
          onClose={() => setShowEditDialog(null)}
          onSubmit={async (formData) => {
            const { error } = await updateTask(showEditDialog.id, formData)
            if (error) {
              toast('수정 실패: ' + error.message, 'error')
            } else {
              toast('긴급 업무가 수정되었습니다')
              setShowEditDialog(null)
              refetch()
            }
          }}
        />
      )}
    </div>
  )
}

// ─── 통계 카드 ───────────────────────────────────────────────────
function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: number
  color?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        {icon}
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={cn('text-xl font-bold', color ?? 'text-gray-900')}>{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 긴급 업무 생성 다이얼로그 ───────────────────────────────────
function CreateTaskDialog({ open, onClose, employees, onSubmit }: {
  open: boolean
  onClose: () => void
  employees: { id: string; name: string; role: string }[]
  onSubmit: (data: UrgentTaskFormData) => Promise<void>
}) {
  const [form, setForm] = useState<UrgentTaskFormData>({
    title: '',
    description: '',
    assigned_to: [],
    deadline: '',
    priority: 1,
    reminder_interval_hours: 4,
  })
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setForm({ title: '', description: '', assigned_to: [], deadline: '', priority: 1, reminder_interval_hours: 4 })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title || !form.deadline || form.assigned_to.length === 0) return
    setSubmitting(true)
    await onSubmit(form)
    reset()
    setSubmitting(false)
  }

  function toggleAssignee(id: string) {
    setForm((prev) => ({
      ...prev,
      assigned_to: prev.assigned_to.includes(id)
        ? prev.assigned_to.filter((a) => a !== id)
        : [...prev.assigned_to, id],
    }))
  }

  return (
    <Dialog open={open} onClose={onClose} title="긴급 업무 추가" className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="업무 제목"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder="예: 2026 S/S 컬렉션 샘플 확정"
          required
        />

        <Textarea
          label="설명 (선택)"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="업무 상세 내용..."
          rows={3}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="마감일"
            type="datetime-local"
            value={form.deadline}
            onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))}
            required
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">우선순위</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, priority: Math.max(1, p.priority - 1) }))}
                className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-lg font-bold">{form.priority}</span>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, priority: Math.min(10, p.priority + 1) }))}
                className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">리마인드 간격</label>
          <div className="flex items-center gap-2">
            {[2, 4, 6, 8].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setForm((p) => ({ ...p, reminder_interval_hours: h }))}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  form.reminder_interval_hours === h
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {h}시간
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            담당자 선택 ({form.assigned_to.length}명)
          </label>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2">
            {employees.map((emp) => (
              <label
                key={emp.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  form.assigned_to.includes(emp.id)
                    ? 'bg-brand-50 text-brand-700'
                    : 'hover:bg-gray-50'
                )}
              >
                <input
                  type="checkbox"
                  checked={form.assigned_to.includes(emp.id)}
                  onChange={() => toggleAssignee(emp.id)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span>{emp.name}</span>
                <span className="text-xs text-gray-400">({emp.role})</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => { onClose(); reset() }}>
            취소
          </Button>
          <Button type="submit" disabled={submitting || !form.title || !form.deadline || form.assigned_to.length === 0}>
            {submitting ? '추가 중...' : '긴급 업무 추가'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

// ─── 완료 보고 다이얼로그 ────────────────────────────────────────
function CompleteTaskDialog({ open, onClose, onSubmit }: {
  open: boolean
  onClose: () => void
  onSubmit: (note: string) => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await onSubmit(note)
    setNote('')
    setSubmitting(false)
  }

  return (
    <Dialog open={open} onClose={onClose} title="완료 보고">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Textarea
          label="완료 내용 (1~2줄)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="완료한 내용을 간략히 작성해주세요."
          rows={3}
          required
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={submitting || !note.trim()}>
            {submitting ? '제출 중...' : '완료 보고'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

// ─── 수정 다이얼로그 ─────────────────────────────────────────────
function EditTaskDialog({ open, task, employees, onClose, onSubmit }: {
  open: boolean
  task: UrgentTask
  employees: { id: string; name: string; role: string }[]
  onClose: () => void
  onSubmit: (data: Partial<UrgentTask>) => Promise<void>
}) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    deadline: task.deadline.slice(0, 16),
    assigned_to: task.assigned_to,
    reminder_interval_hours: task.reminder_interval_hours,
    status: task.status,
  })
  const [submitting, setSubmitting] = useState(false)

  function toggleAssignee(id: string) {
    setForm((prev) => ({
      ...prev,
      assigned_to: prev.assigned_to.includes(id)
        ? prev.assigned_to.filter((a) => a !== id)
        : [...prev.assigned_to, id],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await onSubmit(form)
    setSubmitting(false)
  }

  return (
    <Dialog open={open} onClose={onClose} title="긴급 업무 수정" className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="업무 제목"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          required
        />

        <Textarea
          label="설명"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          rows={3}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="마감일"
            type="datetime-local"
            value={form.deadline}
            onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))}
            required
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">상태</label>
            <select
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as 'pending' | 'in_progress' | 'overdue' }))}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="pending">대기</option>
              <option value="in_progress">진행중</option>
              <option value="overdue">기한 초과</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            담당자 ({form.assigned_to.length}명)
          </label>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2">
            {employees.map((emp) => (
              <label
                key={emp.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  form.assigned_to.includes(emp.id)
                    ? 'bg-brand-50 text-brand-700'
                    : 'hover:bg-gray-50'
                )}
              >
                <input
                  type="checkbox"
                  checked={form.assigned_to.includes(emp.id)}
                  onChange={() => toggleAssignee(emp.id)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span>{emp.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>취소</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? '저장 중...' : '저장'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
