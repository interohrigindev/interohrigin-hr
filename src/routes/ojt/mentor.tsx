import { useState, useEffect, useCallback } from 'react'
import { Plus, Users, Sparkles, Loader2, Star, ClipboardList, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { generateAIContent, type AIConfig } from '@/lib/ai-client'
import type { MentorAssignment, MentorDailyReport, AssignmentType, AttitudeLevel } from '@/types/employee-lifecycle'

// ─── Constants ──────────────────────────────────────────────────
const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  initial: '초기 멘토',
  final: '최종 멘토',
}

const STATUS_LABELS: Record<string, string> = {
  active: '진행 중',
  completed: '완료',
  cancelled: '취소',
}
const STATUS_VARIANTS: Record<string, 'success' | 'default' | 'danger'> = {
  active: 'success',
  completed: 'default',
  cancelled: 'danger',
}

const ATTITUDE_LABELS: Record<AttitudeLevel, string> = {
  excellent: '매우 우수',
  good: '우수',
  average: '보통',
  poor: '미흡',
  very_poor: '매우 미흡',
}

const ATTITUDE_LEVELS: AttitudeLevel[] = ['excellent', 'good', 'average', 'poor', 'very_poor']

interface EmployeeBasic {
  id: string
  name: string
}

interface AssignmentWithNames extends MentorAssignment {
  mentor_name?: string
  mentee_name?: string
}

export default function MentorManage() {
  const { toast } = useToast()

  const [assignments, setAssignments] = useState<AssignmentWithNames[]>([])
  const [employees, setEmployees] = useState<EmployeeBasic[]>([])
  const [loading, setLoading] = useState(true)

  // Assignment dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assignForm, setAssignForm] = useState({
    mentee_id: '',
    mentor_id: '',
    assignment_type: 'initial' as AssignmentType,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
  })

  // Daily report dialog
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentWithNames | null>(null)
  const [dailyReports, setDailyReports] = useState<MentorDailyReport[]>([])
  const [reportForm, setReportForm] = useState({
    day_number: 1,
    learning_attitude: '' as AttitudeLevel | '',
    adaptation_level: '' as AttitudeLevel | '',
    mentor_comment: '',
    mentee_feedback: '',
    mentor_mission: '',
    mentee_mission: '',
    mentor_completed: false,
    mentee_completed: false,
  })
  const [generatingMissions, setGeneratingMissions] = useState(false)

  // Rating dialog
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false)
  const [ratingAssignment, setRatingAssignment] = useState<AssignmentWithNames | null>(null)
  const [mentorRating, setMentorRating] = useState({ score: 5, comment: '' })
  const [menteeRating, setMenteeRating] = useState({ score: 5, comment: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [assignRes, empRes] = await Promise.all([
      supabase.from('mentor_assignments').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name').eq('is_active', true).order('name'),
    ])

    if (empRes.data) setEmployees(empRes.data)

    if (assignRes.data && empRes.data) {
      const enriched: AssignmentWithNames[] = (assignRes.data as MentorAssignment[]).map((a) => ({
        ...a,
        mentor_name: empRes.data.find((e: EmployeeBasic) => e.id === a.mentor_id)?.name || '알 수 없음',
        mentee_name: empRes.data.find((e: EmployeeBasic) => e.id === a.mentee_id)?.name || '알 수 없음',
      }))
      setAssignments(enriched)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Assignment CRUD ──────────────────────────────────────────
  function openNewAssignment() {
    setAssignForm({
      mentee_id: '',
      mentor_id: '',
      assignment_type: 'initial',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: '',
    })
    setAssignDialogOpen(true)
  }

  async function handleCreateAssignment() {
    if (!assignForm.mentee_id || !assignForm.mentor_id) {
      toast('멘토와 멘티를 모두 선택하세요.', 'error')
      return
    }
    if (assignForm.mentee_id === assignForm.mentor_id) {
      toast('멘토와 멘티는 다른 사람이어야 합니다.', 'error')
      return
    }

    const { error } = await supabase.from('mentor_assignments').insert({
      mentee_id: assignForm.mentee_id,
      mentor_id: assignForm.mentor_id,
      assignment_type: assignForm.assignment_type,
      start_date: assignForm.start_date,
      end_date: assignForm.end_date || null,
      status: 'active',
    })

    if (error) { toast('배정 실패: ' + error.message, 'error'); return }
    toast('멘토-멘티 배정이 완료되었습니다.', 'success')
    setAssignDialogOpen(false)
    fetchData()
  }

  async function completeAssignment(id: string) {
    if (!confirm('이 멘토링을 완료 처리하시겠습니까?')) return
    const { error } = await supabase.from('mentor_assignments')
      .update({ status: 'completed', end_date: new Date().toISOString().slice(0, 10) })
      .eq('id', id)
    if (error) { toast('상태 변경 실패', 'error'); return }
    toast('멘토링이 완료되었습니다.', 'success')
    fetchData()
  }

  async function cancelAssignment(id: string) {
    if (!confirm('이 멘토링을 취소하시겠습니까?')) return
    const { error } = await supabase.from('mentor_assignments')
      .update({ status: 'cancelled' })
      .eq('id', id)
    if (error) { toast('상태 변경 실패', 'error'); return }
    toast('멘토링이 취소되었습니다.', 'success')
    fetchData()
  }

  // ─── Daily Report ─────────────────────────────────────────────
  async function openReportDialog(assignment: AssignmentWithNames) {
    setSelectedAssignment(assignment)

    const { data } = await supabase
      .from('mentor_daily_reports')
      .select('*')
      .eq('assignment_id', assignment.id)
      .order('day_number', { ascending: true })

    const reports = (data || []) as MentorDailyReport[]
    setDailyReports(reports)

    setReportForm({
      day_number: reports.length + 1,
      learning_attitude: '',
      adaptation_level: '',
      mentor_comment: '',
      mentee_feedback: '',
      mentor_mission: '',
      mentee_mission: '',
      mentor_completed: false,
      mentee_completed: false,
    })
    setReportDialogOpen(true)
  }

  async function handleSaveReport() {
    if (!selectedAssignment) return
    if (!reportForm.learning_attitude || !reportForm.adaptation_level) {
      toast('학습 태도와 적응도를 선택하세요.', 'error')
      return
    }

    const { error } = await supabase.from('mentor_daily_reports').insert({
      assignment_id: selectedAssignment.id,
      day_number: reportForm.day_number,
      learning_attitude: reportForm.learning_attitude,
      adaptation_level: reportForm.adaptation_level,
      mentor_comment: reportForm.mentor_comment || null,
      mentee_feedback: reportForm.mentee_feedback || null,
      mentor_mission: reportForm.mentor_mission || null,
      mentee_mission: reportForm.mentee_mission || null,
      mentor_completed: reportForm.mentor_completed,
      mentee_completed: reportForm.mentee_completed,
    })

    if (error) { toast('일일 보고서 저장 실패: ' + error.message, 'error'); return }
    toast('일일 보고서가 저장되었습니다.', 'success')
    openReportDialog(selectedAssignment)
  }

  async function generateDailyMissions() {
    if (!selectedAssignment) return
    setGeneratingMissions(true)
    try {
      const { data: aiSettings } = await supabase
        .from('ai_settings').select('*').eq('is_active', true).limit(1).single()

      if (!aiSettings) {
        toast('AI 설정이 필요합니다.', 'error')
        setGeneratingMissions(false)
        return
      }

      const config: AIConfig = {
        provider: aiSettings.provider,
        apiKey: aiSettings.api_key,
        model: aiSettings.model,
      }

      const recentReports = dailyReports.slice(-3)
      const recentSummary = recentReports.length > 0
        ? recentReports.map((r) => `Day ${r.day_number}: 학습태도=${r.learning_attitude}, 적응도=${r.adaptation_level}, 멘토 코멘트=${r.mentor_comment || '없음'}`).join('\n')
        : '첫 날입니다.'

      const prompt = `멘토-멘티 프로그램에서 Day ${reportForm.day_number}의 일일 미션을 생성해주세요.

멘토: ${selectedAssignment.mentor_name}
멘티: ${selectedAssignment.mentee_name}
배정 유형: ${ASSIGNMENT_TYPE_LABELS[selectedAssignment.assignment_type]}

최근 보고서:
${recentSummary}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "mentor_mission": "멘토가 수행할 미션 (1~2문장)",
  "mentee_mission": "멘티가 수행할 미션 (1~2문장)"
}

미션은 실무 적응과 관계 형성에 도움이 되는 구체적인 활동으로 만들어주세요.`

      const result = await generateAIContent(config, prompt)
      const jsonMatch = result.content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) { toast('AI 응답 파싱 실패', 'error'); setGeneratingMissions(false); return }

      const parsed = JSON.parse(jsonMatch[0])
      setReportForm((prev) => ({
        ...prev,
        mentor_mission: parsed.mentor_mission || '',
        mentee_mission: parsed.mentee_mission || '',
      }))
      toast('AI 미션이 생성되었습니다.', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      toast('AI 미션 생성 실패: ' + message, 'error')
    }
    setGeneratingMissions(false)
  }

  // ─── Rating ───────────────────────────────────────────────────
  function openRatingDialog(assignment: AssignmentWithNames) {
    setRatingAssignment(assignment)
    const existingMentorRating = assignment.mentor_rating_by_mentee as { score?: number; comment?: string } | null
    const existingMenteeRating = assignment.mentee_rating_by_mentor as { score?: number; comment?: string } | null
    setMentorRating({
      score: existingMentorRating?.score ?? 5,
      comment: existingMentorRating?.comment ?? '',
    })
    setMenteeRating({
      score: existingMenteeRating?.score ?? 5,
      comment: existingMenteeRating?.comment ?? '',
    })
    setRatingDialogOpen(true)
  }

  async function handleSaveRating() {
    if (!ratingAssignment) return
    const { error } = await supabase.from('mentor_assignments').update({
      mentor_rating_by_mentee: { score: mentorRating.score, comment: mentorRating.comment },
      mentee_rating_by_mentor: { score: menteeRating.score, comment: menteeRating.comment },
    }).eq('id', ratingAssignment.id)

    if (error) { toast('평가 저장 실패', 'error'); return }
    toast('평가가 저장되었습니다.', 'success')
    setRatingDialogOpen(false)
    fetchData()
  }

  if (loading) return <PageSpinner />

  const activeAssignments = assignments.filter((a) => a.status === 'active')
  const completedAssignments = assignments.filter((a) => a.status !== 'active')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">멘토-멘티 관리</h1>
        <Button onClick={openNewAssignment}><Plus className="h-4 w-4 mr-1" /> 새 배정</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-brand-600">{activeAssignments.length}</p>
            <p className="text-xs text-gray-500">진행 중</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{completedAssignments.filter((a) => a.status === 'completed').length}</p>
            <p className="text-xs text-gray-500">완료</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-600">{assignments.length}</p>
            <p className="text-xs text-gray-500">전체</p>
          </CardContent>
        </Card>
      </div>

      {/* Active assignments */}
      {activeAssignments.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">진행 중인 멘토링</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {activeAssignments.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {a.mentor_name} → {a.mentee_name}
                    </CardTitle>
                    <Badge variant={STATUS_VARIANTS[a.status]}>{STATUS_LABELS[a.status]}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2 text-xs">
                    <Badge variant="primary">{ASSIGNMENT_TYPE_LABELS[a.assignment_type]}</Badge>
                    <span className="text-gray-500">시작: {a.start_date}</span>
                    {a.end_date && <span className="text-gray-500">종료: {a.end_date}</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openReportDialog(a)}>
                      <ClipboardList className="h-3 w-3 mr-1" /> 일일 보고
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => completeAssignment(a.id)}>
                      <CheckCircle className="h-3 w-3 mr-1" /> 완료
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => cancelAssignment(a.id)}>
                      취소
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completed assignments */}
      {completedAssignments.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">완료/취소된 멘토링</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {completedAssignments.map((a) => (
              <Card key={a.id} className="opacity-80">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {a.mentor_name} → {a.mentee_name}
                    </CardTitle>
                    <Badge variant={STATUS_VARIANTS[a.status]}>{STATUS_LABELS[a.status]}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2 text-xs">
                    <Badge variant="primary">{ASSIGNMENT_TYPE_LABELS[a.assignment_type]}</Badge>
                    <span className="text-gray-500">{a.start_date} ~ {a.end_date || '미정'}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openReportDialog(a)}>
                      <ClipboardList className="h-3 w-3 mr-1" /> 보고서 확인
                    </Button>
                    {a.status === 'completed' && (
                      <Button size="sm" variant="outline" onClick={() => openRatingDialog(a)}>
                        <Star className="h-3 w-3 mr-1" /> 평가
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {assignments.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 mb-4">등록된 멘토-멘티 배정이 없습니다.</p>
            <Button onClick={openNewAssignment}>첫 멘토 배정하기</Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Assignment Dialog ───────────────────────────────────── */}
      <Dialog open={assignDialogOpen} onClose={() => setAssignDialogOpen(false)} title="멘토-멘티 배정" className="max-w-lg">
        <div className="space-y-4">
          <Select
            label="멘티 (신입사원) *"
            value={assignForm.mentee_id}
            onChange={(e) => setAssignForm((p) => ({ ...p, mentee_id: e.target.value }))}
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
            placeholder="멘티 선택"
          />
          <Select
            label="멘토 *"
            value={assignForm.mentor_id}
            onChange={(e) => setAssignForm((p) => ({ ...p, mentor_id: e.target.value }))}
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
            placeholder="멘토 선택"
          />
          <Select
            label="배정 유형"
            value={assignForm.assignment_type}
            onChange={(e) => setAssignForm((p) => ({ ...p, assignment_type: e.target.value as AssignmentType }))}
            options={[
              { value: 'initial', label: '초기 멘토' },
              { value: 'final', label: '최종 멘토' },
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label="시작일" type="date" value={assignForm.start_date} onChange={(e) => setAssignForm((p) => ({ ...p, start_date: e.target.value }))} />
            <Input label="종료일" type="date" value={assignForm.end_date} onChange={(e) => setAssignForm((p) => ({ ...p, end_date: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>취소</Button>
            <Button onClick={handleCreateAssignment}>배정</Button>
          </div>
        </div>
      </Dialog>

      {/* ─── Daily Report Dialog ─────────────────────────────────── */}
      <Dialog
        open={reportDialogOpen}
        onClose={() => setReportDialogOpen(false)}
        title={selectedAssignment ? `일일 보고서 - ${selectedAssignment.mentor_name} → ${selectedAssignment.mentee_name}` : '일일 보고서'}
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        {selectedAssignment && (
          <div className="space-y-5">
            {/* Existing reports */}
            {dailyReports.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">기존 보고서</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {dailyReports.map((r) => (
                    <div key={r.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="primary">Day {r.day_number}</Badge>
                        <span className="text-xs text-gray-400">{r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : ''}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-500">학습 태도: </span>
                          <span className="font-medium">{r.learning_attitude ? ATTITUDE_LABELS[r.learning_attitude] : '-'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">적응도: </span>
                          <span className="font-medium">{r.adaptation_level ? ATTITUDE_LABELS[r.adaptation_level] : '-'}</span>
                        </div>
                      </div>
                      {r.mentor_mission && <p className="text-xs mt-1"><span className="text-gray-500">멘토 미션:</span> {r.mentor_mission} {r.mentor_completed ? '(완료)' : ''}</p>}
                      {r.mentee_mission && <p className="text-xs"><span className="text-gray-500">멘티 미션:</span> {r.mentee_mission} {r.mentee_completed ? '(완료)' : ''}</p>}
                      {r.mentor_comment && <p className="text-xs mt-1"><span className="text-gray-500">멘토 코멘트:</span> {r.mentor_comment}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New report form */}
            {selectedAssignment.status === 'active' && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-900">새 보고서 (Day {reportForm.day_number})</h4>
                  <Button variant="outline" size="sm" onClick={generateDailyMissions} disabled={generatingMissions}>
                    {generatingMissions ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 생성 중...</>
                    ) : (
                      <><Sparkles className="h-3 w-3 mr-1" /> AI 미션 생성</>
                    )}
                  </Button>
                </div>

                <div className="space-y-4">
                  {/* Missions */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Input label="멘토 미션" value={reportForm.mentor_mission} onChange={(e) => setReportForm((p) => ({ ...p, mentor_mission: e.target.value }))} placeholder="멘토가 수행할 미션" />
                      <label className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                        <input type="checkbox" checked={reportForm.mentor_completed} onChange={(e) => setReportForm((p) => ({ ...p, mentor_completed: e.target.checked }))} className="rounded border-gray-300" />
                        완료
                      </label>
                    </div>
                    <div>
                      <Input label="멘티 미션" value={reportForm.mentee_mission} onChange={(e) => setReportForm((p) => ({ ...p, mentee_mission: e.target.value }))} placeholder="멘티가 수행할 미션" />
                      <label className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                        <input type="checkbox" checked={reportForm.mentee_completed} onChange={(e) => setReportForm((p) => ({ ...p, mentee_completed: e.target.checked }))} className="rounded border-gray-300" />
                        완료
                      </label>
                    </div>
                  </div>

                  {/* Attitude - 5 level radio */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-gray-700">학습 태도 *</p>
                      <div className="space-y-1">
                        {ATTITUDE_LEVELS.map((level) => (
                          <label key={level} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="radio"
                              name="learning_attitude"
                              checked={reportForm.learning_attitude === level}
                              onChange={() => setReportForm((p) => ({ ...p, learning_attitude: level }))}
                              className="text-brand-600"
                            />
                            {ATTITUDE_LABELS[level]}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-gray-700">적응도 *</p>
                      <div className="space-y-1">
                        {ATTITUDE_LEVELS.map((level) => (
                          <label key={level} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="radio"
                              name="adaptation_level"
                              checked={reportForm.adaptation_level === level}
                              onChange={() => setReportForm((p) => ({ ...p, adaptation_level: level }))}
                              className="text-brand-600"
                            />
                            {ATTITUDE_LABELS[level]}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Comments */}
                  <Textarea label="멘토 코멘트" value={reportForm.mentor_comment} onChange={(e) => setReportForm((p) => ({ ...p, mentor_comment: e.target.value }))} rows={2} placeholder="오늘의 관찰 사항, 피드백..." />
                  <Textarea label="멘티 피드백" value={reportForm.mentee_feedback} onChange={(e) => setReportForm((p) => ({ ...p, mentee_feedback: e.target.value }))} rows={2} placeholder="멘티의 소감, 어려운 점..." />

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button variant="outline" onClick={() => setReportDialogOpen(false)}>닫기</Button>
                    <Button onClick={handleSaveReport}>보고서 저장</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* ─── Rating Dialog ───────────────────────────────────────── */}
      <Dialog
        open={ratingDialogOpen}
        onClose={() => setRatingDialogOpen(false)}
        title="멘토-멘티 평가"
        className="max-w-lg"
      >
        {ratingAssignment && (
          <div className="space-y-5">
            {/* Mentee rates Mentor */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">
                멘티({ratingAssignment.mentee_name})가 멘토({ratingAssignment.mentor_name})를 평가
              </h4>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm text-gray-600">점수:</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setMentorRating((p) => ({ ...p, score: s }))}
                      className="focus:outline-none"
                    >
                      <Star className={`h-6 w-6 ${s <= mentorRating.score ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
                    </button>
                  ))}
                </div>
                <span className="text-sm font-medium">{mentorRating.score}/5</span>
              </div>
              <Textarea value={mentorRating.comment} onChange={(e) => setMentorRating((p) => ({ ...p, comment: e.target.value }))} rows={2} placeholder="멘토에 대한 평가 코멘트" />
            </div>

            {/* Mentor rates Mentee */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">
                멘토({ratingAssignment.mentor_name})가 멘티({ratingAssignment.mentee_name})를 평가
              </h4>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm text-gray-600">점수:</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setMenteeRating((p) => ({ ...p, score: s }))}
                      className="focus:outline-none"
                    >
                      <Star className={`h-6 w-6 ${s <= menteeRating.score ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
                    </button>
                  ))}
                </div>
                <span className="text-sm font-medium">{menteeRating.score}/5</span>
              </div>
              <Textarea value={menteeRating.comment} onChange={(e) => setMenteeRating((p) => ({ ...p, comment: e.target.value }))} rows={2} placeholder="멘티에 대한 평가 코멘트" />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setRatingDialogOpen(false)}>취소</Button>
              <Button onClick={handleSaveRating}>평가 저장</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
