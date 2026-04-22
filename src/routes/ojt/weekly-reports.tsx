/**
 * D2-4-b: OJT 주차별 보고서
 * - 멘티: 본인 소속 프로그램의 주차별 보고서 작성/제출
 * - 멘토·관리자: 멘티 보고서 조회 + 피드백 작성
 */
import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { OJTProgram, OJTEnrollment, OJTWeeklyReport, OJTWeeklyReportContent, OJTScheduleItem } from '@/types/employee-lifecycle'
import { Send, MessageSquare } from 'lucide-react'

interface MenteeOption { id: string; name: string }

export default function OJTWeeklyReports() {
  const { profile, hasRole } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [programs, setPrograms] = useState<OJTProgram[]>([])
  const [enrollments, setEnrollments] = useState<OJTEnrollment[]>([])
  const [mentees, setMentees] = useState<MenteeOption[]>([])
  const [reports, setReports] = useState<OJTWeeklyReport[]>([])

  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [selectedMenteeId, setSelectedMenteeId] = useState('')  // 멘토·관리자가 선택
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [saving, setSaving] = useState(false)

  const isMenteeMode = !hasRole('leader') && !hasRole('admin')
  const canReview = hasRole('leader') // leader+ 는 피드백 작성 가능

  // 현재 사용자 역할에 따른 피드백 컬럼 결정
  const myRole = profile?.role
  const myFeedbackField: 'leader_feedback' | 'exec_feedback' | 'ceo_feedback' | 'mentor_feedback' =
    myRole === 'ceo' ? 'ceo_feedback' :
    (myRole === 'director' || myRole === 'division_head') ? 'exec_feedback' :
    myRole === 'leader' ? 'leader_feedback' :
    'mentor_feedback'  // hr_admin/admin 은 멘토 피드백으로 취급

  const menteeId = isMenteeMode ? profile?.id : selectedMenteeId

  // 현재 대상 보고서
  const currentReport = useMemo(() => {
    if (!menteeId || !selectedProgramId) return null
    return reports.find(
      (r) => r.mentee_id === menteeId && r.program_id === selectedProgramId && r.week_number === selectedWeek,
    ) || null
  }, [reports, menteeId, selectedProgramId, selectedWeek])

  // 보고서 폼 상태
  const [form, setForm] = useState<OJTWeeklyReportContent>({
    learned: '', challenges: '', next_week: '', feedback_request: '',
  })
  const [mentorFeedback, setMentorFeedback] = useState('')

  useEffect(() => {
    if (currentReport) {
      setForm({
        learned: currentReport.content.learned || '',
        challenges: currentReport.content.challenges || '',
        next_week: currentReport.content.next_week || '',
        feedback_request: currentReport.content.feedback_request || '',
      })
      // 내 역할의 피드백 칼럼 값을 로드
      const initial = (currentReport as unknown as Record<string, string | null>)[myFeedbackField] || ''
      setMentorFeedback(initial)
    } else {
      setForm({ learned: '', challenges: '', next_week: '', feedback_request: '' })
      setMentorFeedback('')
    }
  }, [currentReport, myFeedbackField])

  // 세부 일정표 (해당 프로그램)
  const [scheduleItems, setScheduleItems] = useState<OJTScheduleItem[]>([])

  async function fetchAll() {
    setLoading(true)
    const [progRes, enrollRes] = await Promise.all([
      supabase.from('ojt_programs').select('*').eq('is_active', true),
      supabase.from('ojt_enrollments').select('*'),
    ])
    setPrograms((progRes.data || []) as OJTProgram[])
    setEnrollments((enrollRes.data || []) as OJTEnrollment[])

    // 멘티 목록 조회 (mentor/admin용)
    if (hasRole('leader')) {
      const { data } = await supabase.from('employees').select('id, name').eq('is_active', true).order('name')
      setMentees((data || []) as MenteeOption[])
    }

    // 보고서: 본인이 멘티면 본인것만, 아니면 전체
    let q = supabase.from('ojt_weekly_reports').select('*')
    if (isMenteeMode && profile?.id) q = q.eq('mentee_id', profile.id)
    const { data: rptData } = await q
    setReports((rptData || []) as OJTWeeklyReport[])
    setLoading(false)
  }

  // 프로그램 선택 시 해당 세부 일정표 로드
  useEffect(() => {
    if (!selectedProgramId) { setScheduleItems([]); return }
    supabase.from('ojt_schedule_items')
      .select('*')
      .eq('program_id', selectedProgramId)
      .order('day_number', { ascending: true })
      .order('sort_order', { ascending: true })
      .then(({ data }) => setScheduleItems((data || []) as OJTScheduleItem[]))
  }, [selectedProgramId])

  // 멘티가 일정 항목에 코멘트 저장
  async function saveScheduleComment(itemId: string, comment: string) {
    const { error } = await supabase
      .from('ojt_schedule_items')
      .update({ mentee_comment: comment, mentee_commented_at: new Date().toISOString() })
      .eq('id', itemId)
    if (error) { toast('코멘트 저장 실패: ' + error.message, 'error'); return }
    toast('코멘트가 저장되었습니다.', 'success')
    // 로컬 state 업데이트
    setScheduleItems((prev) => prev.map((it) => it.id === itemId ? { ...it, mentee_comment: comment, mentee_commented_at: new Date().toISOString() } : it))
  }

  useEffect(() => {
    if (profile?.id) fetchAll()
  }, [profile?.id, isMenteeMode])

  // 멘티 본인의 소속 프로그램 자동 선택
  useEffect(() => {
    if (isMenteeMode && !selectedProgramId && enrollments.length > 0 && profile?.id) {
      const mine = enrollments.find((e) => e.employee_id === profile.id)
      if (mine) setSelectedProgramId(mine.program_id)
    }
  }, [isMenteeMode, enrollments, profile?.id, selectedProgramId])

  async function saveReport(status: 'draft' | 'submitted') {
    if (!menteeId || !selectedProgramId) { toast('프로그램과 멘티를 선택하세요.', 'error'); return }
    setSaving(true)

    const payload = {
      program_id: selectedProgramId,
      mentee_id: menteeId,
      week_number: selectedWeek,
      content: form,
      status,
      submitted_at: status === 'submitted' ? new Date().toISOString() : null,
    }

    const { error } = await supabase
      .from('ojt_weekly_reports')
      .upsert(payload, { onConflict: 'program_id,mentee_id,week_number' })

    setSaving(false)
    if (error) { toast('저장 실패: ' + error.message, 'error'); return }
    toast(status === 'submitted' ? '보고서가 제출되었습니다.' : '임시 저장되었습니다.', 'success')
    await fetchAll()
  }

  async function saveMentorFeedback() {
    if (!currentReport) return
    setSaving(true)
    const now = new Date().toISOString()
    const updatePayload: Record<string, unknown> = {
      [myFeedbackField]: mentorFeedback,
      status: 'reviewed',
      reviewed_at: now,
    }
    // 타임스탬프 컬럼도 함께 저장 (mentor_feedback 은 reviewed_at 으로 대체)
    if (myFeedbackField !== 'mentor_feedback') {
      updatePayload[`${myFeedbackField}_at`] = now
    }

    const { error } = await supabase
      .from('ojt_weekly_reports')
      .update(updatePayload)
      .eq('id', currentReport.id)
    setSaving(false)
    if (error) { toast('피드백 저장 실패: ' + error.message, 'error'); return }
    toast('피드백이 저장되었습니다.', 'success')
    await fetchAll()
  }

  if (loading) return <PageSpinner />

  const selectedProgram = programs.find((p) => p.id === selectedProgramId)
  const maxWeeks = selectedProgram ? Math.max(1, Math.ceil(selectedProgram.duration_days / 5)) : 1

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">주차별 업무보고</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isMenteeMode ? 'OJT 기간 중 매주 학습 내용을 기록하고 제출합니다.' : '멘티가 제출한 보고서를 검토하고 피드백을 남깁니다.'}
        </p>
      </div>

      <Card>
        <CardContent className="py-3 px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select
              label="프로그램"
              value={selectedProgramId}
              onChange={(e) => setSelectedProgramId(e.target.value)}
              options={[
                { value: '', label: '선택하세요' },
                ...programs.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            {!isMenteeMode && (
              <Select
                label="멘티"
                value={selectedMenteeId}
                onChange={(e) => setSelectedMenteeId(e.target.value)}
                options={[
                  { value: '', label: '선택하세요' },
                  ...mentees.map((m) => ({ value: m.id, label: m.name })),
                ]}
              />
            )}
            <Select
              label="주차"
              value={String(selectedWeek)}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              options={Array.from({ length: maxWeeks }).map((_, i) => ({
                value: String(i + 1), label: `${i + 1}주차`,
              }))}
            />
          </div>
        </CardContent>
      </Card>

      {!selectedProgramId || !menteeId ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-400">
            프로그램{!isMenteeMode && ' · 멘티'}을 선택하면 주차별 보고서가 표시됩니다.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 세부 일정표 (프로그램 전체) + 멘티 코멘트 입력 */}
          {scheduleItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">📅 세부 일정표</CardTitle>
              </CardHeader>
              <CardContent>
                <ScheduleWithComments
                  items={scheduleItems}
                  isMenteeMode={isMenteeMode}
                  onSaveComment={saveScheduleComment}
                  currentWeek={selectedWeek}
                />
              </CardContent>
            </Card>
          )}

          {/* 보고서 작성/조회 */}
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2">
                <span>{selectedWeek}주차 보고서</span>
                {currentReport && (
                  <Badge variant={
                    currentReport.status === 'reviewed' ? 'success' :
                    currentReport.status === 'submitted' ? 'info' : 'default'
                  } className="text-[10px]">
                    {currentReport.status === 'draft' && '작성 중'}
                    {currentReport.status === 'submitted' && '제출됨'}
                    {currentReport.status === 'reviewed' && '검토 완료'}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isMenteeMode ? (
                <>
                  <Textarea label="이번 주 배운 점" value={form.learned || ''} onChange={(e) => setForm({ ...form, learned: e.target.value })} rows={3} />
                  <Textarea label="어려웠던 점" value={form.challenges || ''} onChange={(e) => setForm({ ...form, challenges: e.target.value })} rows={3} />
                  <Textarea label="다음 주 계획" value={form.next_week || ''} onChange={(e) => setForm({ ...form, next_week: e.target.value })} rows={3} />
                  <Textarea label="멘토에게 질문·요청사항 (선택)" value={form.feedback_request || ''} onChange={(e) => setForm({ ...form, feedback_request: e.target.value })} rows={2} />
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="outline" onClick={() => saveReport('draft')} disabled={saving || currentReport?.status === 'reviewed'}>
                      임시 저장
                    </Button>
                    <Button onClick={() => saveReport('submitted')} disabled={saving || currentReport?.status === 'reviewed'}>
                      <Send className="h-3.5 w-3.5 mr-1" /> 제출
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* 멘토·관리자 조회 모드 */}
                  {!currentReport ? (
                    <p className="text-sm text-gray-400 text-center py-8">이 주차에 제출된 보고서가 없습니다.</p>
                  ) : (
                    <>
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">이번 주 배운 점</p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{form.learned || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">어려웠던 점</p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{form.challenges || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">다음 주 계획</p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{form.next_week || '—'}</p>
                      </div>
                      {form.feedback_request && (
                        <div className="bg-amber-50 border-l-4 border-amber-300 rounded p-3">
                          <p className="text-xs font-medium text-amber-700 mb-1">💬 멘티 질문·요청</p>
                          <p className="text-sm text-amber-900 whitespace-pre-wrap">{form.feedback_request}</p>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* 역할별 피드백 입력 카드 — 로그인한 역할에 해당하는 컬럼만 저장 */}
          {canReview && currentReport && currentReport.status !== 'draft' && (
            <Card className="border-brand-200 bg-brand-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-brand-800">
                  <MessageSquare className="h-4 w-4" />
                  {myFeedbackField === 'ceo_feedback' ? '대표 피드백' :
                   myFeedbackField === 'exec_feedback' ? '임원 피드백' :
                   myFeedbackField === 'leader_feedback' ? '리더 피드백' :
                   '멘토 피드백'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={mentorFeedback}
                  onChange={(e) => setMentorFeedback(e.target.value)}
                  rows={4}
                  placeholder="멘티에게 전달할 피드백을 작성하세요."
                />
                <div className="flex justify-end">
                  <Button onClick={saveMentorFeedback} disabled={saving || !mentorFeedback.trim()}>
                    {(currentReport as unknown as Record<string, unknown>)[myFeedbackField] ? '피드백 갱신' : '피드백 저장'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* D2-4 확장: 멀티 롤 피드백 타임라인 (모든 역할 코멘트 나열) */}
          {currentReport && (
            <MultiRoleFeedbackTimeline report={currentReport} />
          )}
        </>
      )}
    </div>
  )
}

// 세부 일정표 + 멘티 코멘트 입력/표시
function ScheduleWithComments({
  items, isMenteeMode, onSaveComment, currentWeek,
}: {
  items: OJTScheduleItem[]
  isMenteeMode: boolean
  onSaveComment: (id: string, c: string) => void
  currentWeek: number
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  // 해당 주차에 해당하는 일차만 표시 (1주차=1~5일차, 2주차=6~10일차 식)
  const weekStart = (currentWeek - 1) * 5 + 1
  const weekEnd = currentWeek * 5
  const filtered = items.filter((it) => it.day_number >= weekStart && it.day_number <= weekEnd)
  const byDay = filtered.reduce<Record<number, OJTScheduleItem[]>>((acc, it) => {
    if (!acc[it.day_number]) acc[it.day_number] = []
    acc[it.day_number].push(it)
    return acc
  }, {})
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b)

  if (days.length === 0) {
    return <p className="text-xs text-gray-400">이 주차에 등록된 일정이 없습니다.</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500 mb-1">{currentWeek}주차 일정 ({weekStart}~{weekEnd}일차)</p>
      {days.map((day) => (
        <div key={day} className="bg-gray-50 rounded-lg p-3 border-l-4 border-brand-400">
          <p className="text-xs font-bold text-brand-700 mb-2">{day}일차</p>
          <div className="space-y-1.5">
            {byDay[day].map((it) => {
              const isEditing = editingId === it.id
              return (
                <div key={it.id} className="px-2.5 py-2 bg-white rounded border border-gray-200">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {it.time_slot && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{it.time_slot}</span>}
                    <span className="text-sm text-gray-800 font-medium">{it.title}</span>
                  </div>
                  {it.description && <p className="text-[11px] text-gray-500 mt-0.5">{it.description}</p>}
                  {it.output && <p className="text-[11px] text-emerald-600 mt-0.5">🎯 산출물: {it.output}</p>}

                  {/* 멘티 코멘트 영역 */}
                  {it.mentee_comment && !isEditing && (
                    <div className="mt-1.5 px-2 py-1.5 bg-amber-50 border-l-2 border-amber-300 rounded text-[11px] text-amber-900">
                      <span className="font-bold mr-1">💬 내 코멘트:</span>
                      {it.mentee_comment}
                    </div>
                  )}

                  {isMenteeMode && (
                    isEditing ? (
                      <div className="mt-2 space-y-1.5">
                        <Textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={2}
                          placeholder="이 일정에 대한 의견·질문·진행 상황"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setDraft('') }}>취소</Button>
                          <Button size="sm" onClick={() => { onSaveComment(it.id, draft.trim()); setEditingId(null); setDraft('') }} disabled={!draft.trim()}>저장</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingId(it.id); setDraft(it.mentee_comment || '') }}
                        className="mt-1 text-[11px] text-brand-600 hover:text-brand-700 font-medium"
                      >
                        {it.mentee_comment ? '✏️ 코멘트 수정' : '💬 코멘트 남기기'}
                      </button>
                    )
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// D2-4 확장: 멘토 / 리더 / 임원 / 대표 피드백 타임라인
function MultiRoleFeedbackTimeline({ report }: { report: OJTWeeklyReport }) {
  const entries: { role: string; label: string; color: string; text: string | null | undefined; at: string | null | undefined }[] = [
    { role: 'mentor',   label: '👥 멘토',   color: 'bg-emerald-50 border-emerald-200 text-emerald-800', text: report.mentor_feedback,  at: report.reviewed_at },
    { role: 'leader',   label: '🎯 리더',   color: 'bg-blue-50 border-blue-200 text-blue-800',          text: report.leader_feedback,  at: report.leader_feedback_at },
    { role: 'exec',     label: '💼 임원',   color: 'bg-violet-50 border-violet-200 text-violet-800',    text: report.exec_feedback,    at: report.exec_feedback_at },
    { role: 'ceo',      label: '👑 대표',   color: 'bg-amber-50 border-amber-200 text-amber-900',       text: report.ceo_feedback,     at: report.ceo_feedback_at },
  ]
  const filled = entries.filter((e) => e.text && e.text.trim())
  if (filled.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">피드백 타임라인</p>
      {filled.map((e) => (
        <div key={e.role} className={`rounded-lg border px-4 py-3 ${e.color}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold">{e.label}</span>
            {e.at && <span className="text-[10px] opacity-70">{new Date(e.at).toLocaleDateString('ko-KR')}</span>}
          </div>
          <p className="text-sm whitespace-pre-wrap">{e.text}</p>
        </div>
      ))}
    </div>
  )
}
