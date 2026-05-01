import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, GraduationCap, BookOpen, Calendar, FileText, Eye, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { OJTProgram, OJTEnrollment, OJTScheduleItem, OJTWeeklyReport } from '@/types/employee-lifecycle'
import { formatDate } from '@/lib/utils'

const SLOTS: { key: string; label: string }[] = [
  { key: 'morning', label: '오전' },
  { key: 'lunch', label: '점심' },
  { key: 'afternoon', label: '오후' },
]

function slotOf(ts: string | null | undefined): string {
  if (!ts) return 'afternoon'
  const t = ts.toLowerCase()
  if (t.includes('오전') || /(0\d|1[01]):/.test(t)) return 'morning'
  if (t.includes('점심') || /(11|12|13):/.test(t)) return 'lunch'
  return 'afternoon'
}

export default function MyOJTDetail() {
  const { programId } = useParams<{ programId: string }>()
  const [searchParams] = useSearchParams()
  const isPreview = searchParams.get('preview') === '1'
  const { profile } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [program, setProgram] = useState<OJTProgram | null>(null)
  const [enrollment, setEnrollment] = useState<OJTEnrollment | null>(null)
  const [schedule, setSchedule] = useState<OJTScheduleItem[]>([])
  const [reports, setReports] = useState<OJTWeeklyReport[]>([])
  const [draftWeek, setDraftWeek] = useState<number | null>(null)
  const [draftContent, setDraftContent] = useState({ learned: '', challenges: '', next_week: '', feedback_request: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!programId || !profile?.id) return
    ;(async () => {
      const [progRes, enrRes, schRes, repRes] = await Promise.all([
        supabase.from('ojt_programs').select('*').eq('id', programId).single(),
        // 미리보기 모드에서는 enrollment 가 없을 수 있음
        isPreview
          ? Promise.resolve({ data: null })
          : supabase.from('ojt_enrollments').select('*').eq('program_id', programId).eq('employee_id', profile.id).maybeSingle(),
        supabase.from('ojt_schedule_items').select('*').eq('program_id', programId).order('day_number', { ascending: true }),
        isPreview
          ? Promise.resolve({ data: [] })
          : supabase.from('ojt_weekly_reports').select('*').eq('program_id', programId).eq('mentee_id', profile.id).order('week_number', { ascending: true }),
      ])
      setProgram(progRes.data as OJTProgram)
      setEnrollment(enrRes.data as OJTEnrollment | null)
      setSchedule((schRes.data || []) as OJTScheduleItem[])
      setReports((repRes.data || []) as OJTWeeklyReport[])
      setLoading(false)
    })()
  }, [programId, profile?.id, isPreview])

  // 미리보기 모드가 아니면서 enrollment 없으면 차단
  if (!loading && !isPreview && !enrollment) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <GraduationCap className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <h1 className="text-lg font-bold text-gray-900 mb-1">접근 권한 없음</h1>
        <p className="text-sm text-gray-500">이 OJT 프로그램에 등록되어 있지 않습니다.</p>
        <Link to="/my/ojt" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline mt-4">
          <ArrowLeft className="h-4 w-4" /> 내 OJT 목록으로
        </Link>
      </div>
    )
  }

  if (loading || !program) return <PageSpinner />

  const totalWeeks = Math.max(1, Math.ceil((program.duration_days || 7) / 7))
  const days = Array.from(new Set(schedule.map((s) => s.day_number))).sort((a, b) => a - b)

  function startDraft(week: number) {
    const existing = reports.find((r) => r.week_number === week)
    if (existing && existing.status !== 'reviewed') {
      setDraftContent({
        learned: existing.content?.learned || '',
        challenges: existing.content?.challenges || '',
        next_week: existing.content?.next_week || '',
        feedback_request: existing.content?.feedback_request || '',
      })
    } else {
      setDraftContent({ learned: '', challenges: '', next_week: '', feedback_request: '' })
    }
    setDraftWeek(week)
  }

  async function saveReport(week: number, status: 'draft' | 'submitted') {
    if (!profile?.id || !programId) return
    setSaving(true)
    const existing = reports.find((r) => r.week_number === week)
    const payload = {
      program_id: programId,
      mentee_id: profile.id,
      week_number: week,
      content: draftContent,
      status,
      submitted_at: status === 'submitted' ? new Date().toISOString() : null,
    }
    const { error } = existing
      ? await supabase.from('ojt_weekly_reports').update(payload).eq('id', existing.id)
      : await supabase.from('ojt_weekly_reports').insert(payload)
    if (error) {
      toast(`저장 실패: ${error.message}`, 'error')
      setSaving(false)
      return
    }
    toast(status === 'submitted' ? '보고서가 제출되었습니다.' : '임시 저장되었습니다.', 'success')
    setDraftWeek(null)
    // 재조회
    const { data: reps } = await supabase.from('ojt_weekly_reports').select('*').eq('program_id', programId).eq('mentee_id', profile.id).order('week_number', { ascending: true })
    setReports((reps || []) as OJTWeeklyReport[])
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      {isPreview && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-800 font-medium">관리자 미리보기 — 학습자에게 노출되는 화면입니다 (저장·제출 비활성)</span>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to={isPreview ? '/admin/ojt' : '/my/ojt'} className="text-xs text-gray-500 hover:text-brand-600 inline-flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> {isPreview ? '관리자 화면' : '내 OJT 목록'}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-brand-500" />
            {program.name}
          </h1>
          {program.description && <p className="text-sm text-gray-500 mt-1">{program.description}</p>}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Badge variant="primary">기간 {program.duration_days}일</Badge>
          <Badge variant="default">{totalWeeks}주차</Badge>
        </div>
      </div>

      {/* 모듈 */}
      {program.modules && program.modules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-brand-500" /> 학습 모듈 ({program.modules.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {program.modules.map((m, i) => (
                <li key={m.id || i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{m.title}</p>
                    {m.content && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{m.content}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 세부 일정표 */}
      {schedule.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-brand-500" /> 세부 일정표
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold text-gray-600 w-16">시간</th>
                    {days.map((d) => (
                      <th key={d} className="px-2 py-2 text-left font-semibold text-brand-700">{d}일차</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SLOTS.map((slot) => (
                    <tr key={slot.key} className="border-b border-gray-100">
                      <td className="px-2 py-2 font-medium text-gray-500 bg-gray-50/50">{slot.label}</td>
                      {days.map((d) => {
                        const cellItems = schedule.filter((s) => s.day_number === d && slotOf(s.time_slot) === slot.key)
                        return (
                          <td key={d} className="px-2 py-2 align-top min-w-[140px]">
                            {cellItems.length === 0 ? (
                              <span className="text-gray-300">-</span>
                            ) : (
                              <ul className="space-y-1">
                                {cellItems.map((it) => (
                                  <li key={it.id} className="text-[11px]">
                                    {it.time_slot && <span className="text-blue-600 mr-1">{it.time_slot}</span>}
                                    <span className="text-gray-800 font-medium">{it.title}</span>
                                    {it.description && <p className="text-[10px] text-gray-500">{it.description}</p>}
                                    {it.output && <p className="text-[10px] text-emerald-600">🎯 {it.output}</p>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 주차별 보고서 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand-500" /> 주차별 보고서
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((week) => {
            const rep = reports.find((r) => r.week_number === week)
            const isEditing = draftWeek === week
            return (
              <div key={week} className="border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900">{week}주차</span>
                    {rep && (
                      <Badge variant={rep.status === 'reviewed' ? 'success' : rep.status === 'submitted' ? 'primary' : 'default'} className="text-[10px]">
                        {rep.status === 'reviewed' ? '검토 완료' : rep.status === 'submitted' ? '제출됨' : '임시저장'}
                      </Badge>
                    )}
                    {rep?.submitted_at && <span className="text-[10px] text-gray-400">제출 {formatDate(rep.submitted_at, 'yyyy.MM.dd')}</span>}
                  </div>
                  {!isPreview && rep?.status !== 'reviewed' && !isEditing && (
                    <Button size="sm" variant="outline" onClick={() => startDraft(week)}>
                      {rep ? '수정' : '작성'}
                    </Button>
                  )}
                </div>

                {/* 작성 폼 */}
                {isEditing && (
                  <div className="p-3 space-y-2">
                    <Textarea label="이번 주 배운 점" value={draftContent.learned} onChange={(e) => setDraftContent((p) => ({ ...p, learned: e.target.value }))} rows={3} />
                    <Textarea label="어려웠던 점" value={draftContent.challenges} onChange={(e) => setDraftContent((p) => ({ ...p, challenges: e.target.value }))} rows={3} />
                    <Textarea label="다음 주 계획" value={draftContent.next_week} onChange={(e) => setDraftContent((p) => ({ ...p, next_week: e.target.value }))} rows={3} />
                    <Textarea label="멘토에게 질문·요청" value={draftContent.feedback_request} onChange={(e) => setDraftContent((p) => ({ ...p, feedback_request: e.target.value }))} rows={2} />
                    <div className="flex justify-end gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => setDraftWeek(null)}>취소</Button>
                      <Button size="sm" variant="outline" onClick={() => saveReport(week, 'draft')} disabled={saving}>
                        <Save className="h-3.5 w-3.5 mr-1" /> 임시 저장
                      </Button>
                      <Button size="sm" onClick={() => saveReport(week, 'submitted')} disabled={saving}>제출</Button>
                    </div>
                  </div>
                )}

                {/* 작성 내용 표시 */}
                {!isEditing && rep && (
                  <div className="p-3 space-y-2 text-sm">
                    {rep.content?.learned && (
                      <div><p className="text-xs font-semibold text-emerald-700 mb-0.5">배운 점</p><p className="text-gray-700 whitespace-pre-line">{rep.content.learned}</p></div>
                    )}
                    {rep.content?.challenges && (
                      <div><p className="text-xs font-semibold text-amber-700 mb-0.5">어려웠던 점</p><p className="text-gray-700 whitespace-pre-line">{rep.content.challenges}</p></div>
                    )}
                    {rep.content?.next_week && (
                      <div><p className="text-xs font-semibold text-blue-700 mb-0.5">다음 주 계획</p><p className="text-gray-700 whitespace-pre-line">{rep.content.next_week}</p></div>
                    )}
                    {rep.content?.feedback_request && (
                      <div><p className="text-xs font-semibold text-violet-700 mb-0.5">멘토에게 질문·요청</p><p className="text-gray-700 whitespace-pre-line">{rep.content.feedback_request}</p></div>
                    )}
                    {/* 멘토/리더/임원/대표 피드백 */}
                    {(rep.mentor_feedback || rep.leader_feedback || rep.exec_feedback || rep.ceo_feedback) && (
                      <div className="border-t pt-2 space-y-1.5">
                        {rep.mentor_feedback && <div className="bg-brand-50 rounded p-2"><p className="text-[10px] font-bold text-brand-700">멘토 피드백</p><p className="text-xs text-gray-700 whitespace-pre-line">{rep.mentor_feedback}</p></div>}
                        {rep.leader_feedback && <div className="bg-blue-50 rounded p-2"><p className="text-[10px] font-bold text-blue-700">리더 피드백</p><p className="text-xs text-gray-700 whitespace-pre-line">{rep.leader_feedback}</p></div>}
                        {rep.exec_feedback && <div className="bg-violet-50 rounded p-2"><p className="text-[10px] font-bold text-violet-700">임원 피드백</p><p className="text-xs text-gray-700 whitespace-pre-line">{rep.exec_feedback}</p></div>}
                        {rep.ceo_feedback && <div className="bg-amber-50 rounded p-2"><p className="text-[10px] font-bold text-amber-700">대표 피드백</p><p className="text-xs text-gray-700 whitespace-pre-line">{rep.ceo_feedback}</p></div>}
                      </div>
                    )}
                  </div>
                )}

                {!isEditing && !rep && !isPreview && (
                  <p className="p-3 text-xs text-gray-400">아직 작성하지 않은 보고서입니다.</p>
                )}
                {!isEditing && !rep && isPreview && (
                  <p className="p-3 text-xs text-gray-400">학습자가 작성하면 이 영역에 보고서가 표시됩니다.</p>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
