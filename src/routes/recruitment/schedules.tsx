import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Calendar, Clock, Video, MapPin, Send, CheckCircle, XCircle, Loader2, Sparkles } from 'lucide-react'
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
import { formatDateTime, formatDate } from '@/lib/utils'
import type { Candidate, CandidateStatus } from '@/types/recruitment'

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

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '긴급',
  normal: '일반',
  low: '낮음',
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  normal: 'bg-gray-100 text-gray-700',
  low: 'bg-slate-100 text-slate-600',
}

export default function InterviewSchedules() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { schedules, loading, refetch } = useAllSchedules()
  const { createSchedule, updateSchedule, sendPreMaterials } = useInterviewScheduleMutations()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [autoDialogOpen, setAutoDialogOpen] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [saving, setSaving] = useState(false)
  const [autoGenerating, setAutoGenerating] = useState(false)
  const [generatingMeet, setGeneratingMeet] = useState(false)

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

  // 가용 시간대 입력 (자동 배정용)
  const [autoForm, setAutoForm] = useState({
    date: '',
    start_time: '09:00',
    end_time: '18:00',
    slot_minutes: '30',
    break_minutes: '10',
  })

  useEffect(() => {
    // 면접 배정 가능한 지원자 (합격/불합격 제외 전체)
    supabase
      .from('candidates')
      .select('*')
      .not('status', 'in', '("rejected","hired","decided")')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        console.log('[면접일정] 지원자 조회:', { count: data?.length, error, statuses: data?.map(c => c.status) })
        if (data) setCandidates(data as Candidate[])
      })
  }, [])

  async function handleGenerateMeet() {
    if (!form.candidate_id || !form.scheduled_at) {
      toast('지원자와 일정을 먼저 입력하세요.', 'error')
      return
    }

    setGeneratingMeet(true)
    try {
      const cand = candidates.find((c) => c.id === form.candidate_id)
      const res = await fetch('/api/google-meet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `[인터오리진 면접] ${cand?.name || '지원자'}`,
          description: `인터오리진 채용 면접\n지원자: ${cand?.name || ''}\n이메일: ${cand?.email || ''}`,
          startTime: new Date(form.scheduled_at).toISOString(),
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

    // 화상면접인데 Meet 링크가 없으면 자동 생성 시도
    let meetLink = form.meeting_link || null
    if (form.interview_type === 'video' && !meetLink) {
      try {
        const cand = candidates.find((c) => c.id === form.candidate_id)
        const res = await fetch('/api/google-meet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: `[인터오리진 면접] ${cand?.name || '지원자'}`,
            description: `인터오리진 채용 면접`,
            startTime: new Date(form.scheduled_at).toISOString(),
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

    const { error } = await createSchedule({
      candidate_id: form.candidate_id,
      interview_type: form.interview_type as any,
      scheduled_at: form.scheduled_at,
      duration_minutes: parseInt(form.duration_minutes),
      priority: form.priority as any,
      meeting_link: meetLink,
      location_info: form.location_info || null,
      status: 'scheduled',
    })

    if (error) {
      toast('일정 생성 실패: ' + error.message, 'error')
    } else {
      // 지원자 상태 업데이트
      await supabase
        .from('candidates')
        .update({ status: 'interview_scheduled' })
        .eq('id', form.candidate_id)

      toast('면접 일정이 등록되었습니다.', 'success')
      setDialogOpen(false)
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

      // AI로 우선순위 판정
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
            // 누락된 후보 추가
            unscheduledCandidates.forEach((c) => {
              if (!priorityOrder.includes(c.id)) priorityOrder.push(c.id)
            })
          }
        } catch {
          // AI 실패 시 기존 순서 유지
        }
      }

      // 시간대 슬롯 생성
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

      // 기존 일정과 충돌 확인
      const { data: existingSchedules } = await supabase
        .from('interview_schedules')
        .select('scheduled_at')
        .gte('scheduled_at', `${autoForm.date}T00:00:00`)
        .lte('scheduled_at', `${autoForm.date}T23:59:59`)
        .eq('status', 'scheduled')

      const busyTimes = new Set((existingSchedules || []).map((s: any) => s.scheduled_at.slice(0, 16)))
      const availableSlots = slots.filter((s) => !busyTimes.has(s.slice(0, 16)))

      if (availableSlots.length === 0) {
        toast('해당 시간대에 가용 슬롯이 없습니다.', 'error')
        setAutoGenerating(false)
        return
      }

      // 배정
      let assigned = 0
      for (let i = 0; i < Math.min(priorityOrder.length, availableSlots.length); i++) {
        const candId = priorityOrder[i]
        const slotTime = availableSlots[i]

        const { error } = await createSchedule({
          candidate_id: candId,
          interview_type: 'video',
          scheduled_at: slotTime,
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
    // 스케줄 정보에서 지원자 이메일, 면접 상세 조회
    const schedule = schedules.find((s: any) => s.id === scheduleId)
    if (!schedule) {
      toast('일정 정보를 찾을 수 없습니다.', 'error')
      return
    }

    // 지원자 정보 조회
    const { data: candidate } = await supabase
      .from('candidates')
      .select('name, email')
      .eq('id', schedule.candidate_id)
      .single()

    if (!candidate?.email) {
      toast('지원자 이메일을 찾을 수 없습니다.', 'error')
      return
    }

    // 이메일 발송
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

      // 이메일 성공 후 DB 플래그 업데이트
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

  if (loading) return <PageSpinner />

  const scheduledCount = schedules.filter((s) => s.status === 'scheduled').length
  const completedCount = schedules.filter((s) => s.status === 'completed').length

  return (
    <div className="space-y-6">
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

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-gray-500">전체</p>
            <p className="text-2xl font-bold">{schedules.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-blue-600">예정</p>
            <p className="text-2xl font-bold text-blue-700">{scheduledCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-green-600">완료</p>
            <p className="text-2xl font-bold text-green-700">{completedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* 면접 대기 지원자 */}
      {candidates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">면접 대기 지원자 ({candidates.length}명)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {candidates.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/recruitment/candidates/${c.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900">{c.name}</span>
                    <span className="text-xs text-gray-400">{c.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className={CANDIDATE_STATUS_COLORS[c.status as CandidateStatus] || ''}>
                      {CANDIDATE_STATUS_LABELS[c.status as CandidateStatus] || c.status}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={(e) => {
                      e.stopPropagation()
                      setForm((p) => ({ ...p, candidate_id: c.id }))
                      setDialogOpen(true)
                    }}>
                      일정 배정
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 일정 목록 */}
      {schedules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 mb-4">등록된 면접 일정이 없습니다.</p>
            <Button onClick={() => setDialogOpen(true)}>첫 일정 추가하기</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map((s: any) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {s.interview_type === 'video' ? (
                        <Video className="h-5 w-5 text-blue-500" />
                      ) : (
                        <MapPin className="h-5 w-5 text-amber-500" />
                      )}
                      <div>
                        <p
                          className="font-medium text-gray-900 cursor-pointer hover:text-brand-600"
                          onClick={() => navigate(`/admin/recruitment/candidates/${s.candidate_id}`)}
                        >
                          {s.candidate_name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                          <Clock className="h-3 w-3" />
                          <span>{formatDateTime(s.scheduled_at)}</span>
                          <span>({s.duration_minutes}분)</span>
                          {s.meeting_link && (
                            <a href={s.meeting_link} target="_blank" rel="noopener noreferrer"
                              className="text-blue-600 hover:underline">
                              Google Meet 입장
                            </a>
                          )}
                          {s.location_info && (
                            <span className="text-amber-600">📍 {s.location_info}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="default" className={PRIORITY_COLORS[s.priority] || ''}>
                      {PRIORITY_LABELS[s.priority] || s.priority}
                    </Badge>
                    <Badge variant="default" className={SCHEDULE_STATUS_COLORS[s.status] || ''}>
                      {SCHEDULE_STATUS_LABELS[s.status] || s.status}
                    </Badge>

                    {s.status === 'scheduled' && !s.pre_materials_sent && (
                      <Button variant="ghost" size="sm" onClick={() => handleSendMaterials(s.id)} title="사전 자료 발송">
                        <Send className="h-4 w-4 text-brand-600" />
                      </Button>
                    )}
                    {s.pre_materials_sent && (
                      <span className="text-xs text-green-600" title={`발송: ${s.pre_materials_sent_at ? formatDate(s.pre_materials_sent_at, 'MM/dd HH:mm') : ''}`}>
                        자료 발송 완료
                      </span>
                    )}

                    {s.status === 'scheduled' && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleStatusChange(s.id, 'completed')} title="완료">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleStatusChange(s.id, 'no_show')} title="불참">
                          <XCircle className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 수동 일정 추가 다이얼로그 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="면접 일정 추가" className="max-w-lg">
        <div className="space-y-4">
          <Select
            label="지원자 *"
            value={form.candidate_id}
            onChange={(e) => setForm((p) => ({ ...p, candidate_id: e.target.value }))}
            options={[
              { value: '', label: '선택하세요' },
              ...candidates.map((c) => ({ value: c.id, label: `${c.name} (${CANDIDATE_STATUS_LABELS[c.status] || c.status})` })),
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
                {['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'].map((t) => (
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
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 생성중</>
                  ) : (
                    <><Video className="h-4 w-4 mr-1" /> 자동 생성</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                지원자와 일시를 입력 후 '자동 생성'을 클릭하면 Google Meet 링크가 자동으로 만들어집니다.
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleCreateSchedule} disabled={saving}>
              {saving ? '저장 중...' : '일정 등록'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* AI 자동 배정 다이얼로그 */}
      <Dialog open={autoDialogOpen} onClose={() => setAutoDialogOpen(false)} title="AI 면접 일정 자동 배정" className="max-w-lg">
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
            <Button variant="outline" onClick={() => setAutoDialogOpen(false)}>취소</Button>
            <Button onClick={handleAutoSchedule} disabled={autoGenerating}>
              {autoGenerating ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 배정 중...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1" /> 자동 배정</>
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
