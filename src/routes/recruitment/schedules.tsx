import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Calendar, Clock, Video, MapPin, Send, CheckCircle, XCircle,
  Loader2, Sparkles, ChevronLeft, ChevronRight, ExternalLink, Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { generateAIContent, type AIConfig } from '@/lib/ai-client'
import { useAllSchedules, useInterviewScheduleMutations } from '@/hooks/useInterviewSchedules'
import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_COLORS } from '@/lib/recruitment-constants'
import { interviewInviteEmail } from '@/lib/email-templates'
import { format, addDays, startOfWeek, isToday as isDateToday } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Candidate, CandidateStatus } from '@/types/recruitment'

/* ─── 상수 ──────────────────────────────────────────────── */

const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  scheduled: '예정',
  completed: '완료',
  cancelled: '취소',
  no_show: '불참',
}

const SCHEDULE_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-700',
  no_show: 'bg-red-100 text-red-700',
}

/* ─── 메인 컴포넌트 ────────────────────────────────────── */

export default function InterviewSchedules() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { schedules, loading, refetch } = useAllSchedules()
  const { createSchedule, updateSchedule, sendPreMaterials } = useInterviewScheduleMutations()

  /* 기본 state */
  const [dialogOpen, setDialogOpen] = useState(false)
  const [autoDialogOpen, setAutoDialogOpen] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [saving, setSaving] = useState(false)
  const [autoGenerating, setAutoGenerating] = useState(false)
  const [generatingMeet, setGeneratingMeet] = useState(false)

  /* 캘린더 state */
  const [viewMode, setViewMode] = useState<'3day' | 'week'>('3day')
  const [viewStartDate, setViewStartDate] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

  const [form, setForm] = useState({
    candidate_id: '',
    interview_type: 'video',
    scheduled_at: '',
    scheduled_date: '',
    scheduled_time: '',
    duration_minutes: '30',
    priority: 'normal',
    meeting_link: '',
    location_info: '',
  })

  const [autoForm, setAutoForm] = useState({
    date: '',
    start_time: '09:00',
    end_time: '18:00',
    slot_minutes: '30',
    break_minutes: '10',
  })

  /* ─── 데이터 로드 ─────────────────────────────────── */

  useEffect(() => {
    supabase
      .from('candidates')
      .select('*')
      .not('status', 'in', '("rejected","hired","decided")')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setCandidates(data as Candidate[])
      })
  }, [])

  /* ─── 캘린더 계산값 ───────────────────────────────── */

  const viewDays = useMemo(() => {
    const count = viewMode === '3day' ? 3 : 7
    return Array.from({ length: count }, (_, i) => addDays(viewStartDate, i))
  }, [viewMode, viewStartDate])

  /** 면접 일정이 잡힌 지원자를 제외한 대기 목록 */
  const waitingCandidates = useMemo(() => {
    const activelyScheduled = new Set(
      schedules.filter((s) => s.status === 'scheduled').map((s) => s.candidate_id),
    )
    return candidates.filter((c) => !activelyScheduled.has(c.id))
  }, [candidates, schedules])

  /** 날짜별 일정 그룹 (시간순 정렬) */
  const schedulesByDate = useMemo(() => {
    const map = new Map<string, typeof schedules>()
    schedules.forEach((s) => {
      const key = format(new Date(s.scheduled_at), 'yyyy-MM-dd')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    })
    map.forEach((arr) =>
      arr.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    )
    return map
  }, [schedules])

  const scheduledCount = schedules.filter((s) => s.status === 'scheduled').length
  const completedCount = schedules.filter((s) => s.status === 'completed').length

  /* ─── 캘린더 네비게이션 ───────────────────────────── */

  function handleViewModeChange(mode: '3day' | 'week') {
    setViewMode(mode)
    if (mode === 'week') {
      setViewStartDate(startOfWeek(viewStartDate, { weekStartsOn: 1 }))
    }
  }

  function navigateDates(direction: 'prev' | 'next') {
    const step = viewMode === '3day' ? 3 : 7
    setViewStartDate((prev) => addDays(prev, direction === 'next' ? step : -step))
  }

  function goToToday() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (viewMode === 'week') {
      setViewStartDate(startOfWeek(today, { weekStartsOn: 1 }))
    } else {
      setViewStartDate(today)
    }
  }

  /* ─── 핸들러 (기존 로직 유지) ─────────────────────── */

  async function handleGenerateMeet() {
    if (!form.candidate_id || !form.scheduled_at) {
      toast('지원자와 일정을 먼저 입력하세요.', 'error')
      return
    }

    setGeneratingMeet(true)
    try {
      const cand = candidates.find((c) => c.id === form.candidate_id)
      const meetKst =
        form.scheduled_at.includes('+') || form.scheduled_at.endsWith('Z')
          ? form.scheduled_at
          : form.scheduled_at + '+09:00'
      const res = await fetch('/api/google-meet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `[인터오리진 면접] ${cand?.name || '지원자'}`,
          description: `인터오리진 채용 면접\n지원자: ${cand?.name || ''}\n이메일: ${cand?.email || ''}`,
          startTime: new Date(meetKst).toISOString(),
          durationMinutes: parseInt(form.duration_minutes),
          attendees: cand?.email ? [cand.email] : [],
        }),
      })
      const result = await res.json()

      if (!res.ok) {
        toast(`Meet 생성 실패: ${result.error}`, 'error')
      } else if (result.meetLink) {
        setForm((p) => ({ ...p, meeting_link: result.meetLink }))
        toast('Google Meet 링크가 생성되었습니다.', 'success')
      } else {
        toast('Meet 링크를 가져올 수 없습니다.', 'error')
      }
    } catch (err: any) {
      toast('Meet 생성 오류: ' + err.message, 'error')
    }
    setGeneratingMeet(false)
  }

  async function handleCreateSchedule() {
    if (!form.candidate_id || !form.scheduled_at) {
      toast('지원자와 일정을 선택하세요.', 'error')
      return
    }

    setSaving(true)

    let meetLink = form.meeting_link || null
    const kstTime =
      form.scheduled_at.includes('+') || form.scheduled_at.endsWith('Z')
        ? form.scheduled_at
        : form.scheduled_at + '+09:00'
    if (form.interview_type === 'video' && !meetLink) {
      try {
        const cand = candidates.find((c) => c.id === form.candidate_id)
        const res = await fetch('/api/google-meet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: `[인터오리진 면접] ${cand?.name || '지원자'}`,
            description: `인터오리진 채용 면접`,
            startTime: new Date(kstTime).toISOString(),
            durationMinutes: parseInt(form.duration_minutes),
            attendees: cand?.email ? [cand.email] : [],
          }),
        })
        const result = await res.json()
        if (res.ok && result.meetLink) {
          meetLink = result.meetLink
        }
      } catch {
        // Meet 생성 실패해도 일정 등록은 진행
      }
    }

    const scheduledAtKST =
      form.scheduled_at.includes('+') || form.scheduled_at.endsWith('Z')
        ? form.scheduled_at
        : form.scheduled_at + '+09:00'

    const { error } = await createSchedule({
      candidate_id: form.candidate_id,
      interview_type: form.interview_type as any,
      scheduled_at: scheduledAtKST,
      duration_minutes: parseInt(form.duration_minutes),
      priority: form.priority as any,
      meeting_link: meetLink,
      location_info: form.location_info || null,
      status: 'scheduled',
    })

    if (error) {
      toast('일정 생성 실패: ' + error.message, 'error')
    } else {
      await supabase
        .from('candidates')
        .update({ status: 'interview_scheduled' })
        .eq('id', form.candidate_id)

      toast('면접 일정이 등록되었습니다.', 'success')
      setDialogOpen(false)
      setForm({
        candidate_id: '',
        interview_type: 'video',
        scheduled_at: '',
        scheduled_date: '',
        scheduled_time: '',
        duration_minutes: '30',
        priority: 'normal',
        meeting_link: '',
        location_info: '',
      })
      refetch()
    }
    setSaving(false)
  }

  async function handleAutoSchedule() {
    if (!autoForm.date) {
      toast('날짜를 선택하세요.', 'error')
      return
    }

    setAutoGenerating(true)
    try {
      const unscheduledCandidates = candidates.filter((c) => c.status === 'survey_done')
      if (unscheduledCandidates.length === 0) {
        toast('배정할 지원자가 없습니다.', 'error')
        setAutoGenerating(false)
        return
      }

      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .single()

      let priorityOrder = unscheduledCandidates.map((c) => c.id)

      if (aiSettings) {
        try {
          const config: AIConfig = {
            provider: aiSettings.provider,
            apiKey: aiSettings.api_key,
            model: aiSettings.model,
          }

          const candidateList = unscheduledCandidates
            .map((c, i) => `${i + 1}. ${c.name} (매칭점수: ${c.talent_match_score ?? '미측정'})`)
            .join('\n')

          const prompt = `다음 지원자들의 면접 우선순위를 정해주세요.
긴급한 포지션이나 점수가 높은 지원자를 우선으로 합니다.

지원자:
${candidateList}

결과를 숫자 순서만 쉼표로 출력하세요 (예: 2,1,3):`

          const result = await generateAIContent(config, prompt)
          const orderStr = result.content.match(/[\d,\s]+/)?.[0] || ''
          const indices = orderStr
            .split(',')
            .map((s) => parseInt(s.trim()) - 1)
            .filter((i) => i >= 0 && i < unscheduledCandidates.length)

          if (indices.length > 0) {
            priorityOrder = indices.map((i) => unscheduledCandidates[i].id)
            unscheduledCandidates.forEach((c) => {
              if (!priorityOrder.includes(c.id)) priorityOrder.push(c.id)
            })
          }
        } catch {
          // AI 실패 시 기존 순서 유지
        }
      }

      const slotMin = parseInt(autoForm.slot_minutes)
      const breakMin = parseInt(autoForm.break_minutes)
      const totalSlotMin = slotMin + breakMin

      const startParts = autoForm.start_time.split(':').map(Number)
      const endParts = autoForm.end_time.split(':').map(Number)
      const startMinutes = startParts[0] * 60 + startParts[1]
      const endMinutes = endParts[0] * 60 + endParts[1]

      const slots: string[] = []
      for (let m = startMinutes; m + slotMin <= endMinutes; m += totalSlotMin) {
        const h = String(Math.floor(m / 60)).padStart(2, '0')
        const min = String(m % 60).padStart(2, '0')
        slots.push(`${autoForm.date}T${h}:${min}:00`)
      }

      const { data: existingSchedules } = await supabase
        .from('interview_schedules')
        .select('scheduled_at')
        .gte('scheduled_at', `${autoForm.date}T00:00:00`)
        .lte('scheduled_at', `${autoForm.date}T23:59:59`)
        .eq('status', 'scheduled')

      const busyTimes = new Set(
        (existingSchedules || []).map((s: any) => s.scheduled_at.slice(0, 16)),
      )
      const availableSlots = slots.filter((s) => !busyTimes.has(s.slice(0, 16)))

      if (availableSlots.length === 0) {
        toast('해당 시간대에 가용 슬롯이 없습니다.', 'error')
        setAutoGenerating(false)
        return
      }

      let assigned = 0
      for (let i = 0; i < Math.min(priorityOrder.length, availableSlots.length); i++) {
        const candId = priorityOrder[i]
        const slotTime = availableSlots[i]

        const { error } = await createSchedule({
          candidate_id: candId,
          interview_type: 'video',
          scheduled_at: slotTime + '+09:00',
          duration_minutes: slotMin,
          priority: i === 0 ? 'urgent' : 'normal',
          status: 'scheduled',
        })

        if (!error) {
          await supabase
            .from('candidates')
            .update({ status: 'interview_scheduled' })
            .eq('id', candId)
          assigned++
        }
      }

      toast(`${assigned}명의 면접 일정이 자동 배정되었습니다.`, 'success')
      setAutoDialogOpen(false)
      refetch()
    } catch (err: any) {
      toast('자동 배정 실패: ' + err.message, 'error')
    }
    setAutoGenerating(false)
  }

  async function handleSendMaterials(scheduleId: string) {
    const schedule = schedules.find((s: any) => s.id === scheduleId)
    if (!schedule) {
      toast('일정 정보를 찾을 수 없습니다.', 'error')
      return
    }

    const { data: candidate } = await supabase
      .from('candidates')
      .select('name, email')
      .eq('id', schedule.candidate_id)
      .single()

    if (!candidate?.email) {
      toast('지원자 이메일을 찾을 수 없습니다.', 'error')
      return
    }

    const { subject, html } = interviewInviteEmail(
      candidate.name,
      schedule.scheduled_at,
      schedule.duration_minutes,
      schedule.interview_type,
      schedule.meeting_link,
      schedule.location_info,
    )

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: candidate.email, subject, html }),
      })
      const result = await res.json()

      if (!res.ok) {
        toast(`이메일 발송 실패: ${result.error}`, 'error')
        return
      }

      const { error } = await sendPreMaterials(scheduleId)
      if (error) {
        toast('DB 업데이트 실패 (이메일은 발송됨)', 'error')
      } else {
        toast(`${candidate.name}님에게 면접 안내 이메일을 발송했습니다.`, 'success')
        refetch()
      }
    } catch (err: any) {
      toast('이메일 발송 실패: ' + err.message, 'error')
    }
  }

  async function handleStatusChange(scheduleId: string, newStatus: string) {
    const { error } = await updateSchedule(scheduleId, { status: newStatus } as any)
    if (error) {
      toast('상태 변경 실패', 'error')
    } else {
      toast('상태가 변경되었습니다.', 'success')
      refetch()
    }
  }

  /* ─── 렌더링 ─────────────────────────────────────── */

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* ── 헤더 ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">면접 일정 관리</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAutoDialogOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1" /> AI 자동 배정
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> 일정 추가
          </Button>
        </div>
      </div>

      {/* ── 통계 카드 ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-amber-600 font-medium">대기</p>
            <p className="text-2xl font-bold text-amber-700">{waitingCandidates.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-gray-500 font-medium">전체 일정</p>
            <p className="text-2xl font-bold">{schedules.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-blue-600 font-medium">예정</p>
            <p className="text-2xl font-bold text-blue-700">{scheduledCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-green-600 font-medium">완료</p>
            <p className="text-2xl font-bold text-green-700">{completedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── 면접 대기 지원자 (일정 배정된 지원자 제외) ── */}
      {waitingCandidates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-amber-500" />
              면접 대기 지원자 ({waitingCandidates.length}명)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {waitingCandidates.map((c) => (
                <div
                  key={c.id}
                  className="group flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full border border-gray-200 hover:border-brand-300 hover:bg-brand-50/50 transition-all"
                >
                  <span
                    className="text-sm font-medium text-gray-800 group-hover:text-brand-700 cursor-pointer"
                    onClick={() => navigate(`/admin/recruitment/candidates/${c.id}`)}
                  >
                    {c.name}
                  </span>
                  <Badge
                    variant="default"
                    className={`text-[10px] leading-none px-1.5 py-0.5 ${
                      CANDIDATE_STATUS_COLORS[c.status as CandidateStatus] || ''
                    }`}
                  >
                    {CANDIDATE_STATUS_LABELS[c.status as CandidateStatus] || c.status}
                  </Badge>
                  <button
                    className="ml-0.5 px-2 py-0.5 text-[11px] font-medium text-brand-600 hover:text-white hover:bg-brand-600 rounded-full border border-brand-200 hover:border-brand-600 transition-all"
                    onClick={(e) => {
                      e.stopPropagation()
                      setForm((p) => ({ ...p, candidate_id: c.id }))
                      setDialogOpen(true)
                    }}
                  >
                    배정
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 캘린더 타임라인 ──────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              면접 캘린더
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* 뷰 토글 */}
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    viewMode === '3day'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => handleViewModeChange('3day')}
                >
                  3일
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    viewMode === 'week'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => handleViewModeChange('week')}
                >
                  주간
                </button>
              </div>

              {/* 날짜 네비게이션 */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => navigateDates('prev')}
                  className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-700 min-w-[150px] text-center select-none">
                  {format(viewDays[0], 'M/d', { locale: ko })}
                  {' ~ '}
                  {format(viewDays[viewDays.length - 1], 'M/d', { locale: ko })}
                </span>
                <button
                  onClick={() => navigateDates('next')}
                  className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <ChevronRight className="h-4 w-4 text-gray-600" />
                </button>
              </div>

              <button
                onClick={goToToday}
                className="px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              >
                오늘
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto -mx-4 px-4 pb-2">
            <div
              className={`grid gap-3 ${
                viewMode === '3day' ? 'grid-cols-3' : 'grid-cols-7 min-w-[840px]'
              }`}
            >
              {viewDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd')
                const daySchedules = schedulesByDate.get(dateKey) || []
                const today = isDateToday(day)

                return (
                  <div key={dateKey} className="min-w-0">
                    {/* 날짜 헤더 */}
                    <div
                      className={`text-center rounded-xl py-2.5 mb-3 transition-colors ${
                        today
                          ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-md shadow-blue-200'
                          : 'bg-gray-50 text-gray-700'
                      }`}
                    >
                      <p
                        className={`text-[11px] font-medium ${
                          today ? 'text-blue-100' : 'text-gray-400'
                        }`}
                      >
                        {format(day, 'EEEE', { locale: ko })}
                      </p>
                      <p className="text-xl font-bold leading-tight">{format(day, 'd')}</p>
                      {daySchedules.length > 0 && (
                        <div
                          className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            today ? 'bg-blue-400/40 text-white' : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {daySchedules.length}건
                        </div>
                      )}
                    </div>

                    {/* 일정 카드 목록 */}
                    <div className="space-y-2 min-h-[140px]">
                      {daySchedules.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[140px] text-gray-300">
                          <Calendar className="h-6 w-6 mb-1 opacity-30" />
                          <p className="text-xs">일정 없음</p>
                        </div>
                      ) : (
                        daySchedules.map((s: any) => (
                          <ScheduleCard
                            key={s.id}
                            schedule={s}
                            compact={viewMode === 'week'}
                            onNavigate={() =>
                              navigate(`/admin/recruitment/candidates/${s.candidate_id}`)
                            }
                            onSendMaterials={() => handleSendMaterials(s.id)}
                            onComplete={() => handleStatusChange(s.id, 'completed')}
                            onNoShow={() => handleStatusChange(s.id, 'no_show')}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 수동 일정 추가 다이얼로그 ─────────────────── */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="면접 일정 추가"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <Select
            label="지원자 *"
            value={form.candidate_id}
            onChange={(e) => setForm((p) => ({ ...p, candidate_id: e.target.value }))}
            options={[
              { value: '', label: '선택하세요' },
              ...candidates.map((c) => ({
                value: c.id,
                label: `${c.name} (${CANDIDATE_STATUS_LABELS[c.status] || c.status})`,
              })),
            ]}
          />
          <Select
            label="면접 유형"
            value={form.interview_type}
            onChange={(e) => setForm((p) => ({ ...p, interview_type: e.target.value }))}
            options={[
              { value: 'video', label: 'Google Meet 화상면접' },
              { value: 'face_to_face', label: '대면면접' },
            ]}
          />
          {/* 면접 일시 — 날짜 + 시간 분리 */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">면접 일시 *</label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="날짜"
                type="date"
                value={form.scheduled_date}
                onChange={(e) => {
                  const date = e.target.value
                  setForm((p) => ({
                    ...p,
                    scheduled_date: date,
                    scheduled_at: date && p.scheduled_time ? `${date}T${p.scheduled_time}` : '',
                  }))
                }}
              />
              <Input
                label="시간"
                type="time"
                value={form.scheduled_time}
                onChange={(e) => {
                  const time = e.target.value
                  setForm((p) => ({
                    ...p,
                    scheduled_time: time,
                    scheduled_at: p.scheduled_date && time ? `${p.scheduled_date}T${time}` : '',
                  }))
                }}
              />
            </div>
            {/* 빠른 시간 선택 */}
            <div>
              <p className="text-xs text-gray-400 mb-1.5">빠른 시간 선택</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  '09:00',
                  '09:30',
                  '10:00',
                  '10:30',
                  '11:00',
                  '11:30',
                  '13:00',
                  '13:30',
                  '14:00',
                  '14:30',
                  '15:00',
                  '15:30',
                  '16:00',
                  '16:30',
                  '17:00',
                ].map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      form.scheduled_time === t
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-600'
                    }`}
                    onClick={() => {
                      setForm((p) => ({
                        ...p,
                        scheduled_time: t,
                        scheduled_at: p.scheduled_date ? `${p.scheduled_date}T${t}` : '',
                      }))
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {/* 선택 확인 요약 */}
            {form.scheduled_date && form.scheduled_time && (
              <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                <Calendar className="h-4 w-4 text-blue-500 shrink-0" />
                <span className="text-sm text-blue-700 font-medium">
                  {new Date(form.scheduled_at).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long',
                  })}{' '}
                  {form.scheduled_time} ({form.duration_minutes}분)
                </span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="소요시간 (분)"
              type="number"
              value={form.duration_minutes}
              onChange={(e) => setForm((p) => ({ ...p, duration_minutes: e.target.value }))}
            />
            <Select
              label="우선순위"
              value={form.priority}
              onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
              options={[
                { value: 'urgent', label: '긴급' },
                { value: 'normal', label: '일반' },
                { value: 'low', label: '낮음' },
              ]}
            />
          </div>
          {form.interview_type === 'video' && (
            <div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Google Meet 링크"
                    value={form.meeting_link}
                    onChange={(e) => setForm((p) => ({ ...p, meeting_link: e.target.value }))}
                    placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateMeet}
                  disabled={generatingMeet || !form.candidate_id || !form.scheduled_at}
                  className="shrink-0 mb-0.5"
                >
                  {generatingMeet ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" /> 생성중
                    </>
                  ) : (
                    <>
                      <Video className="h-4 w-4 mr-1" /> 자동 생성
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                지원자와 일시를 입력 후 &apos;자동 생성&apos;을 클릭하면 Google Meet 링크가 자동으로
                만들어집니다.
              </p>
            </div>
          )}
          {form.interview_type === 'face_to_face' && (
            <Input
              label="면접 장소"
              value={form.location_info}
              onChange={(e) => setForm((p) => ({ ...p, location_info: e.target.value }))}
              placeholder="서울 강남구 테헤란로..."
            />
          )}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleCreateSchedule} disabled={saving}>
              {saving ? '저장 중...' : '일정 등록'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── AI 자동 배정 다이얼로그 ───────────────────── */}
      <Dialog
        open={autoDialogOpen}
        onClose={() => setAutoDialogOpen(false)}
        title="AI 면접 일정 자동 배정"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            가용 시간대를 입력하면 AI가 우선순위를 판단하여 겹치지 않게 자동 배정합니다.
          </p>
          <Input
            label="면접 날짜 *"
            type="date"
            value={autoForm.date}
            onChange={(e) => setAutoForm((p) => ({ ...p, date: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="시작 시간"
              type="time"
              value={autoForm.start_time}
              onChange={(e) => setAutoForm((p) => ({ ...p, start_time: e.target.value }))}
            />
            <Input
              label="종료 시간"
              type="time"
              value={autoForm.end_time}
              onChange={(e) => setAutoForm((p) => ({ ...p, end_time: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="면접 시간 (분)"
              type="number"
              value={autoForm.slot_minutes}
              onChange={(e) => setAutoForm((p) => ({ ...p, slot_minutes: e.target.value }))}
            />
            <Input
              label="휴식 시간 (분)"
              type="number"
              value={autoForm.break_minutes}
              onChange={(e) => setAutoForm((p) => ({ ...p, break_minutes: e.target.value }))}
            />
          </div>

          <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
            배정 대기 지원자: {candidates.filter((c) => c.status === 'survey_done').length}명
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setAutoDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleAutoSchedule} disabled={autoGenerating}>
              {autoGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> 배정 중...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1" /> 자동 배정
                </>
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

/* ─── 일정 카드 서브 컴포넌트 ──────────────────────────── */

function ScheduleCard({
  schedule: s,
  compact,
  onNavigate,
  onSendMaterials,
  onComplete,
  onNoShow,
}: {
  schedule: any
  compact: boolean
  onNavigate: () => void
  onSendMaterials: () => void
  onComplete: () => void
  onNoShow: () => void
}) {
  const isVideo = s.interview_type === 'video'

  const borderColor =
    s.status === 'cancelled'
      ? 'border-l-gray-300'
      : s.status === 'completed'
        ? 'border-l-green-400'
        : s.status === 'no_show'
          ? 'border-l-red-400'
          : isVideo
            ? 'border-l-blue-400'
            : 'border-l-amber-400'

  const bgColor =
    s.status === 'cancelled'
      ? 'bg-gray-50/80'
      : s.status === 'completed'
        ? 'bg-green-50/40'
        : s.status === 'no_show'
          ? 'bg-red-50/40'
          : isVideo
            ? 'bg-blue-50/30'
            : 'bg-amber-50/30'

  const timeColor =
    s.status !== 'scheduled'
      ? 'text-gray-400'
      : isVideo
        ? 'text-blue-700'
        : 'text-amber-700'

  return (
    <div
      className={`p-2.5 rounded-lg border-l-[3px] ${borderColor} ${bgColor} hover:shadow-md transition-all ${
        s.status === 'cancelled' ? 'opacity-50' : ''
      }`}
    >
      {/* 시간 + 우선순위 */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-gray-400" />
          <span className={`text-sm font-bold ${timeColor}`}>
            {format(new Date(s.scheduled_at), 'HH:mm')}
          </span>
          {!compact && <span className="text-[10px] text-gray-400">{s.duration_minutes}분</span>}
        </div>
        {s.priority === 'urgent' && (
          <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
            긴급
          </span>
        )}
      </div>

      {/* 지원자 이름 */}
      <p
        className="text-sm font-semibold text-gray-900 cursor-pointer hover:text-brand-600 truncate leading-tight"
        onClick={onNavigate}
        title={s.candidate_name}
      >
        {isVideo ? (
          <Video className="h-3 w-3 text-blue-400 inline mr-1 -mt-0.5" />
        ) : (
          <MapPin className="h-3 w-3 text-amber-400 inline mr-1 -mt-0.5" />
        )}
        {s.candidate_name}
      </p>

      {/* Google Meet 버튼 또는 장소 */}
      {isVideo && s.meeting_link && s.status === 'scheduled' && (
        <a
          href={s.meeting_link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
        >
          <Video className="h-3.5 w-3.5" />
          {compact ? 'Meet' : 'Google Meet 입장'}
          <ExternalLink className="h-2.5 w-2.5 opacity-70" />
        </a>
      )}
      {!isVideo && s.location_info && (
        <p className="mt-1 text-[11px] text-amber-600 truncate" title={s.location_info}>
          📍 {s.location_info}
        </p>
      )}

      {/* 상태 + 액션 */}
      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100/80">
        <Badge
          variant="default"
          className={`text-[10px] leading-none px-1.5 py-0.5 ${
            SCHEDULE_STATUS_COLORS[s.status] || ''
          }`}
        >
          {SCHEDULE_STATUS_LABELS[s.status] || s.status}
        </Badge>

        {s.status === 'scheduled' && (
          <div className="flex items-center gap-0.5">
            {!s.pre_materials_sent ? (
              <button
                onClick={onSendMaterials}
                className="p-1 rounded-md hover:bg-white/80 transition-colors"
                title="안내 이메일 발송"
              >
                <Send className="h-3.5 w-3.5 text-brand-500" />
              </button>
            ) : (
              <span className="text-[9px] text-green-500 font-medium mr-0.5">발송</span>
            )}
            <button
              onClick={onComplete}
              className="p-1 rounded-md hover:bg-green-100 transition-colors"
              title="완료"
            >
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            </button>
            <button
              onClick={onNoShow}
              className="p-1 rounded-md hover:bg-red-100 transition-colors"
              title="불참"
            >
              <XCircle className="h-3.5 w-3.5 text-red-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
