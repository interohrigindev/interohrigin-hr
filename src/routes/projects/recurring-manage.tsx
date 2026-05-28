import { useEffect, useState } from 'react'
import { Repeat, Plus, Trash2, Power, Pencil, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { PageSpinner } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { useRecurringTasks } from '@/hooks/useRecurringTasks'
import { WEEKDAY_LABELS, formatRecurrence } from '@/types/recurring-task'
import type { RecurType, RecurringTask } from '@/types/recurring-task'

// Design Ref: §5 — 반복업무 등록/관리 화면 (관리자/등록자). 프로젝트와 분리된 1급 객체 CRUD.
const MANAGER_ROLES = ['leader', 'director', 'division_head', 'ceo', 'admin', 'hr_admin']
// 메뉴권한관리에서 이 경로를 부여받은 사용자도 등록 가능 (RLS recur_tasks_insert 와 동일 기준)
const RECURRING_MENU_PATH = '/admin/projects/recurring'

export default function RecurringManagePage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const { tasks, employees, loading, createTask, updateTask, deactivateTask, deleteTask } = useRecurringTasks()

  const isManagerRole = profile?.role ? MANAGER_ROLES.includes(profile.role) : false
  // 역할이 아니어도 메뉴권한관리에서 '반복업무 관리' 메뉴를 부여받았으면 등록 허용
  const [hasMenuPerm, setHasMenuPerm] = useState(false)
  useEffect(() => {
    if (!profile?.id || isManagerRole) return
    let cancelled = false
    supabase
      .from('menu_permissions')
      .select('allowed_menus')
      .eq('employee_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const menus = (data?.allowed_menus as string[]) || []
        setHasMenuPerm(menus.includes(RECURRING_MENU_PATH))
      })
    return () => { cancelled = true }
  }, [profile?.id, isManagerRole])

  const canManage = isManagerRole || hasMenuPerm

  // 폼 상태
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [recurType, setRecurType] = useState<RecurType>('weekly')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [monthDay, setMonthDay] = useState<number>(1)
  const [reminderTime, setReminderTime] = useState('09:00')
  const [saving, setSaving] = useState(false)

  function resetForm() {
    setEditId(null); setTitle(''); setDescription(''); setAssigneeId('')
    setRecurType('weekly'); setWeekdays([]); setMonthDay(1); setReminderTime('09:00')
    setShowForm(false)
  }

  function startEdit(t: RecurringTask) {
    setEditId(t.id); setTitle(t.title); setDescription(t.description || '')
    setAssigneeId(t.assignee_id); setRecurType(t.recur_type)
    setWeekdays(t.weekdays || []); setMonthDay(t.month_day || 1)
    setReminderTime((t.reminder_time || '09:00:00').slice(0, 5))
    setShowForm(true)
  }

  function toggleWeekday(d: number) {
    setWeekdays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])
  }

  async function handleSave() {
    if (!title.trim()) { toast('업무명을 입력하세요.', 'error'); return }
    if (!assigneeId) { toast('담당자를 선택하세요.', 'error'); return }
    if (recurType === 'weekly' && weekdays.length === 0) { toast('요일을 1개 이상 선택하세요.', 'error'); return }
    if (recurType === 'monthly' && (monthDay < 1 || monthDay > 31)) { toast('일자는 1~31 사이여야 합니다.', 'error'); return }

    setSaving(true)
    try {
      const reminder_time = `${reminderTime}:00`
      if (editId) {
        await updateTask(editId, {
          title: title.trim(),
          description: description.trim() || null,
          assignee_id: assigneeId,
          recur_type: recurType,
          weekdays: recurType === 'weekly' ? weekdays : null,
          month_day: recurType === 'monthly' ? monthDay : null,
          reminder_time,
        })
        toast('반복업무가 수정되었습니다.', 'success')
      } else {
        await createTask({
          title, description, assignee_id: assigneeId,
          recur_type: recurType,
          weekdays: recurType === 'weekly' ? weekdays : null,
          month_day: recurType === 'monthly' ? monthDay : null,
          reminder_time,
        })
        toast('반복업무가 등록되었습니다.', 'success')
      }
      resetForm()
    } catch (err: unknown) {
      toast('저장 실패: ' + (err instanceof Error ? err.message : '오류'), 'error')
    }
    setSaving(false)
  }

  async function handleDeactivate(t: RecurringTask) {
    try {
      if (t.is_active) { await deactivateTask(t.id); toast('비활성화했습니다.', 'success') }
      else { await updateTask(t.id, { is_active: true }); toast('활성화했습니다.', 'success') }
    } catch (err: unknown) {
      toast('변경 실패: ' + (err instanceof Error ? err.message : '오류'), 'error')
    }
  }

  async function handleDelete(t: RecurringTask) {
    if (!confirm(`'${t.title}' 반복업무를 삭제하시겠습니까? (발생 이력도 함께 삭제됩니다)`)) return
    try { await deleteTask(t.id); toast('삭제했습니다.', 'success') }
    catch (err: unknown) { toast('삭제 실패: ' + (err instanceof Error ? err.message : '오류'), 'error') }
  }

  if (loading) return <PageSpinner />

  const empName = (id: string) => employees.find((e) => e.id === id)?.name || '-'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Repeat className="h-5 w-5 text-[#6B3FA0]" />
          <h1 className="text-lg font-bold">반복업무 관리</h1>
        </div>
        {canManage && !showForm && (
          <Button onClick={() => { resetForm(); setShowForm(true) }}>
            <Plus className="h-4 w-4" /> 반복업무 등록
          </Button>
        )}
      </div>

      {!canManage && (
        <p className="text-sm text-gray-500">반복업무 등록·관리 권한이 없습니다. (관리자/리더 전용)</p>
      )}

      {/* 등록/수정 폼 */}
      {canManage && showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{editId ? '반복업무 수정' : '반복업무 등록'}</CardTitle>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input label="업무명" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 주간 매출 정산" />
            <Textarea label="설명 (선택)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="업무 상세 설명" rows={2} />
            <Select
              label="담당자"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              options={[{ value: '', label: '담당자 선택' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
            />
            <Select
              label="반복 주기"
              value={recurType}
              onChange={(e) => setRecurType(e.target.value as RecurType)}
              options={[{ value: 'weekly', label: '매주' }, { value: 'monthly', label: '매월' }]}
            />

            {recurType === 'weekly' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">요일 선택 (복수 가능)</label>
                <div className="flex gap-1.5 flex-wrap">
                  {WEEKDAY_LABELS.map((label, d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleWeekday(d)}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition ${
                        weekdays.includes(d)
                          ? 'bg-[#6B3FA0] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <Input
                  label="매월 발생 일자 (1~31)"
                  type="number"
                  min={1}
                  max={31}
                  value={String(monthDay)}
                  onChange={(e) => setMonthDay(Number(e.target.value))}
                />
                <p className="text-xs text-gray-400 mt-1">해당 월에 없는 일자(예: 31일/2월)는 그 달의 마지막 날에 발생합니다.</p>
              </div>
            )}

            <Input
              label="알림 발송 시각 (전날)"
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
            />
            <p className="text-xs text-gray-400 -mt-2">발생 전날 이 시각에 담당자에게 이메일 알림이 발송됩니다.</p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>취소</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 목록 */}
      <Card>
        <CardHeader><CardTitle className="text-base">등록된 반복업무 ({tasks.length})</CardTitle></CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">등록된 반복업무가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className={`border rounded-lg p-3 ${t.is_active ? '' : 'bg-gray-50 opacity-70'}`}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">{t.title}</span>
                        {t.is_active
                          ? <Badge variant="success" className="text-[10px]">활성</Badge>
                          : <Badge variant="default" className="text-[10px]">비활성</Badge>}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>담당: {empName(t.assignee_id)}</span>
                        <span>{formatRecurrence(t)}</span>
                        <span>알림 {(t.reminder_time || '09:00:00').slice(0, 5)}</span>
                      </div>
                      {t.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{t.description}</p>}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEdit(t)} className="p-1.5 text-gray-400 hover:text-[#6B3FA0]" title="수정"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => handleDeactivate(t)} className="p-1.5 text-gray-400 hover:text-amber-600" title={t.is_active ? '비활성화' : '활성화'}><Power className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(t)} className="p-1.5 text-gray-400 hover:text-red-600" title="삭제"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
