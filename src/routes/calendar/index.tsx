import { useState, useEffect, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, Plus,
  Globe, Trash2, Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import {
  useCompanyCalendar,
  EVENT_TYPE_MAP,
  EVENT_COLORS,
  type CompanyEvent,
  type EventType,
} from '@/hooks/useCompanyCalendar'

// ─── Helpers ─────────────────────────────────────────────────────

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startDay = first.getDay()
  const totalDays = last.getDate()

  const days: { date: Date; isCurrentMonth: boolean }[] = []

  // Previous month padding
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: d, isCurrentMonth: false })
  }
  // Current month
  for (let d = 1; d <= totalDays; d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true })
  }
  // Next month padding
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: new Date(year, month + 1, d), isCurrentMonth: false })
  }

  return days
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ─── Event type options for Select ───────────────────────────────

const EVENT_TYPE_OPTIONS = Object.entries(EVENT_TYPE_MAP).map(([key, val]) => ({
  value: key,
  label: val.label,
}))

// ─── Component ───────────────────────────────────────────────────

export default function CalendarPage() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const { events, googleEvents, loading, googleConnected, fetchEvents, createEvent, deleteEvent } = useCompanyCalendar()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [createDialog, setCreateDialog] = useState(false)
  const [detailEvent, setDetailEvent] = useState<CompanyEvent | null>(null)
  const [filterType, setFilterType] = useState<EventType | 'all'>('all')

  const isAdmin = hasRole('director')
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthDays = getMonthDays(year, month)

  // Fetch events for visible range
  useEffect(() => {
    const start = new Date(year, month, -6).toISOString()
    const end = new Date(year, month + 1, 7).toISOString()
    fetchEvents(start, end)
  }, [year, month, fetchEvents])

  // Combined events: internal + google (mapped)
  const allEvents = useMemo(() => {
    const internal = filterType === 'all' ? events : events.filter(e => e.event_type === filterType)

    const google = googleEvents.map((g): CompanyEvent => ({
      id: `google-${g.id}`,
      title: g.title,
      description: g.description,
      event_type: 'meeting' as EventType,
      start_datetime: g.start,
      end_datetime: g.end,
      all_day: g.allDay,
      participants: [],
      department_id: null,
      color: '#4285F4',
      external_calendar_id: g.id,
      external_source: 'google',
      sync_status: 'external_only',
      linked_candidate_id: null,
      linked_project_id: null,
      linked_leave_request_id: null,
      recurrence_rule: null,
      created_by: null,
      created_at: '',
      updated_at: '',
      creator_name: 'Google Calendar',
    }))

    return [...internal, ...(filterType === 'all' || filterType === 'meeting' ? google : [])]
  }, [events, googleEvents, filterType])

  function getEventsForDay(date: Date) {
    return allEvents.filter(e => {
      const start = new Date(e.start_datetime)
      return isSameDay(start, date)
    })
  }

  // ─── Create form ─────────────────────────────────────────────
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_type: 'meeting' as EventType,
    start_date: '',
    start_time: '09:00',
    end_time: '10:00',
    all_day: false,
    syncToGoogle: false,
  })

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      event_type: 'meeting',
      start_date: selectedDate
        ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
        : '',
      start_time: '09:00',
      end_time: '10:00',
      all_day: false,
      syncToGoogle: false,
    })
  }

  const handleOpenCreate = (date?: Date) => {
    if (date) setSelectedDate(date)
    resetForm()
    if (date) {
      setForm(prev => ({
        ...prev,
        start_date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      }))
    }
    setCreateDialog(true)
  }

  const handleCreate = async () => {
    if (!form.title.trim() || !form.start_date) {
      toast('제목과 날짜를 입력해주세요', 'error')
      return
    }

    try {
      const startDt = form.all_day
        ? `${form.start_date}T00:00:00+09:00`
        : `${form.start_date}T${form.start_time}:00+09:00`
      const endDt = form.all_day
        ? `${form.start_date}T23:59:59+09:00`
        : `${form.start_date}T${form.end_time}:00+09:00`

      await createEvent({
        title: form.title,
        description: form.description || undefined,
        event_type: form.event_type,
        start_datetime: startDt,
        end_datetime: endDt,
        all_day: form.all_day,
        color: EVENT_COLORS[form.event_type],
        syncToGoogle: form.syncToGoogle,
      })

      toast('일정이 등록되었습니다')
      setCreateDialog(false)
      // Refetch
      const start = new Date(year, month, -6).toISOString()
      const end = new Date(year, month + 1, 7).toISOString()
      fetchEvents(start, end)
    } catch {
      toast('일정 등록 실패', 'error')
    }
  }

  const handleDelete = async (evt: CompanyEvent) => {
    if (evt.id.startsWith('google-')) {
      toast('Google 캘린더 이벤트는 Google에서 삭제해주세요', 'info')
      return
    }
    try {
      await deleteEvent(evt.id)
      setDetailEvent(null)
      toast('일정이 삭제되었습니다')
      const start = new Date(year, month, -6).toISOString()
      const end = new Date(year, month + 1, 7).toISOString()
      fetchEvents(start, end)
    } catch {
      toast('삭제 실패', 'error')
    }
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToday = () => setCurrentDate(new Date())
  const today = new Date()

  if (loading && events.length === 0) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">전사 캘린더</h2>
          <p className="text-sm text-gray-500 mt-1">
            회사 일정, 면접, 교육, 휴가를 한눈에 확인하세요
            {googleConnected && (
              <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
                <Globe className="h-3.5 w-3.5" />Google 연동 중
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as EventType | 'all')}
            options={[{ value: 'all', label: '전체' }, ...EVENT_TYPE_OPTIONS]}
          />
          <Button onClick={() => handleOpenCreate()}>
            <Plus className="h-4 w-4 mr-1" />일정 추가
          </Button>
        </div>
      </div>

      {/* 월 네비게이션 */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">
                {year}년 {month + 1}월
              </CardTitle>
              <Button variant="outline" size="sm" onClick={goToday}>오늘</Button>
            </div>
            <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardHeader>

        <CardContent className="p-0 pb-2">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {WEEKDAYS.map((wd, i) => (
              <div key={wd} className={cn(
                'py-2 text-center text-xs font-medium',
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
              )}>
                {wd}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7">
            {monthDays.map(({ date, isCurrentMonth }, idx) => {
              const dayEvents = getEventsForDay(date)
              const isToday = isSameDay(date, today)
              const dayOfWeek = date.getDay()

              return (
                <button
                  key={idx}
                  onClick={() => handleOpenCreate(date)}
                  className={cn(
                    'relative min-h-[80px] sm:min-h-[100px] p-1 border-b border-r border-gray-100 text-left hover:bg-gray-50 transition-colors',
                    !isCurrentMonth && 'bg-gray-50/50',
                  )}
                >
                  <span className={cn(
                    'inline-flex items-center justify-center w-6 h-6 text-xs rounded-full',
                    isToday && 'bg-brand-600 text-white font-bold',
                    !isToday && isCurrentMonth && (dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-700'),
                    !isCurrentMonth && 'text-gray-300',
                  )}>
                    {date.getDate()}
                  </span>

                  {/* Event dots */}
                  <div className="mt-0.5 space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 3).map((evt) => (
                      <div
                        key={evt.id}
                        onClick={(e) => { e.stopPropagation(); setDetailEvent(evt) }}
                        className="truncate rounded px-1 py-0.5 text-[10px] leading-tight font-medium text-white cursor-pointer hover:opacity-80"
                        style={{ backgroundColor: evt.color || EVENT_COLORS[evt.event_type as EventType] || '#6B7280' }}
                      >
                        {!evt.all_day && <span className="mr-0.5">{formatTime(evt.start_datetime)}</span>}
                        {evt.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-gray-400 px-1">+{dayEvents.length - 3}개 더</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 이벤트 유형 범례 */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(EVENT_TYPE_MAP).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: EVENT_COLORS[key as EventType] }} />
            {val.label}
          </div>
        ))}
        {googleConnected && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#4285F4' }} />
            Google Calendar
          </div>
        )}
      </div>

      {/* ─── 일정 생성 Dialog ─────────────────────────────────── */}
      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} title="새 일정 추가">
        <div className="space-y-4">
          <Input
            value={form.title}
            onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="일정 제목"
          />
          <Select
            value={form.event_type}
            onChange={(e) => setForm(p => ({ ...p, event_type: e.target.value as EventType }))}
            options={EVENT_TYPE_OPTIONS}
            label="유형"
          />
          <Input
            type="date"
            value={form.start_date}
            onChange={(e) => setForm(p => ({ ...p, start_date: e.target.value }))}
            label="날짜"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={(e) => setForm(p => ({ ...p, all_day: e.target.checked }))}
              className="rounded border-gray-300 text-brand-600"
            />
            종일
          </label>
          {!form.all_day && (
            <div className="flex gap-2">
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm(p => ({ ...p, start_time: e.target.value }))}
                label="시작"
              />
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm(p => ({ ...p, end_time: e.target.value }))}
                label="종료"
              />
            </div>
          )}
          <Textarea
            value={form.description}
            onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="설명 (선택)"
            rows={3}
          />
          {googleConnected && (
            <label className="flex items-center gap-2 text-sm text-blue-600">
              <input
                type="checkbox"
                checked={form.syncToGoogle}
                onChange={(e) => setForm(p => ({ ...p, syncToGoogle: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600"
              />
              <Globe className="h-4 w-4" />
              Google Calendar에도 등록
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateDialog(false)}>취소</Button>
            <Button onClick={handleCreate}>등록</Button>
          </div>
        </div>
      </Dialog>

      {/* ─── 이벤트 상세 Dialog ───────────────────────────────── */}
      <Dialog open={!!detailEvent} onClose={() => setDetailEvent(null)} title={detailEvent?.title || ''}>
        {detailEvent && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={detailEvent.external_source === 'google' ? 'info' : 'primary'}>
                {detailEvent.external_source === 'google'
                  ? 'Google Calendar'
                  : EVENT_TYPE_MAP[detailEvent.event_type as EventType]?.label || detailEvent.event_type}
              </Badge>
              {detailEvent.all_day && <Badge>종일</Badge>}
            </div>

            <div className="text-sm text-gray-600 flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {new Date(detailEvent.start_datetime).toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
              })}
              {!detailEvent.all_day && (
                <>
                  {' '}{formatTime(detailEvent.start_datetime)}
                  {detailEvent.end_datetime && ` ~ ${formatTime(detailEvent.end_datetime)}`}
                </>
              )}
            </div>

            {detailEvent.description && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{detailEvent.description}</p>
            )}

            {detailEvent.creator_name && (
              <p className="text-xs text-gray-400">등록: {detailEvent.creator_name}</p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              {!detailEvent.id.startsWith('google-') && isAdmin && (
                <Button variant="danger" size="sm" onClick={() => handleDelete(detailEvent)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />삭제
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDetailEvent(null)}>닫기</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
