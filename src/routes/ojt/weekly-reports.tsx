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
import type { OJTProgram, OJTEnrollment, OJTWeeklyReport, OJTWeeklyReportContent } from '@/types/employee-lifecycle'
import { Send, CheckCircle, MessageSquare } from 'lucide-react'

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
      setMentorFeedback(currentReport.mentor_feedback || '')
    } else {
      setForm({ learned: '', challenges: '', next_week: '', feedback_request: '' })
      setMentorFeedback('')
    }
  }, [currentReport])

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
    const { error } = await supabase
      .from('ojt_weekly_reports')
      .update({
        mentor_feedback: mentorFeedback,
        status: 'reviewed',
        reviewed_at: new Date().toISOString(),
      })
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

          {/* 멘토 피드백 */}
          {canReview && currentReport && currentReport.status !== 'draft' && (
            <Card className="border-brand-200 bg-brand-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-brand-800">
                  <MessageSquare className="h-4 w-4" /> 멘토 피드백
                  {currentReport.status === 'reviewed' && currentReport.reviewed_at && (
                    <Badge variant="success" className="text-[10px] ml-1">
                      <CheckCircle className="h-3 w-3 mr-0.5" />
                      완료
                    </Badge>
                  )}
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
                    {currentReport.status === 'reviewed' ? '피드백 갱신' : '피드백 저장'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 멘티 화면에서 멘토 피드백 표시 */}
          {isMenteeMode && currentReport?.mentor_feedback && (
            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-emerald-800 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> 멘토 피드백
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-emerald-900 whitespace-pre-wrap">{currentReport.mentor_feedback}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
