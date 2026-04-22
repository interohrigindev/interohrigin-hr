import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, BookOpen, Sparkles, Loader2, Users, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { generateAIContentSafe } from '@/lib/ai-client'
import type { OJTProgram, OJTModule, QuizQuestion, OJTEnrollment, OJTScheduleItem } from '@/types/employee-lifecycle'
import type { Department } from '@/types/database'

// ─── Helper: generate unique id ─────────────────────────────────
function uid() {
  return crypto.randomUUID()
}

// ─── Enrollment status labels ───────────────────────────────────
const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  enrolled: '등록됨',
  in_progress: '진행 중',
  completed: '완료',
  dropped: '중단',
}
const ENROLLMENT_STATUS_VARIANTS: Record<string, 'default' | 'primary' | 'success' | 'danger'> = {
  enrolled: 'default',
  in_progress: 'primary',
  completed: 'success',
  dropped: 'danger',
}

// D2-4: 미팅노트 지시 — 퀴즈 기능 실사용 의미 없음 → UI 숨김 (DB/데이터는 유지)
const SHOW_QUIZ_FEATURE = false

export default function OJTPrograms() {
  const { profile } = useAuth()
  const { toast } = useToast()

  const [programs, setPrograms] = useState<OJTProgram[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false)
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [detailProgram, setDetailProgram] = useState<OJTProgram | null>(null)

  // Enrollment data
  const [enrollments, setEnrollments] = useState<(OJTEnrollment & { employee_name?: string })[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [enrollEmployeeId, setEnrollEmployeeId] = useState('')

  // AI quiz generation
  const [generatingQuiz, setGeneratingQuiz] = useState(false)

  // Form state
  const [form, setForm] = useState({
    name: '',
    department_id: '',
    job_type: '',
    description: '',
    duration_days: 30,
    modules: [] as OJTModule[],
    quiz_questions: [] as QuizQuestion[],
  })

  // Module form
  const [moduleTitle, setModuleTitle] = useState('')
  const [moduleContent, setModuleContent] = useState('')

  // Quiz form
  const [quizQuestion, setQuizQuestion] = useState('')
  const [quizOptions, setQuizOptions] = useState(['', '', '', ''])
  const [quizCorrect, setQuizCorrect] = useState(0)
  const [quizExplanation, setQuizExplanation] = useState('')

  // D2-4: 세부 일정표 (일차별)
  const [scheduleItems, setScheduleItems] = useState<OJTScheduleItem[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [newSchDay, setNewSchDay] = useState(1)
  const [newSchTime, setNewSchTime] = useState('')
  const [newSchTitle, setNewSchTitle] = useState('')
  const [newSchDesc, setNewSchDesc] = useState('')
  const [newSchOutput, setNewSchOutput] = useState('')

  async function loadScheduleItems(programId: string) {
    setScheduleLoading(true)
    const { data } = await supabase
      .from('ojt_schedule_items')
      .select('*')
      .eq('program_id', programId)
      .order('day_number', { ascending: true })
      .order('sort_order', { ascending: true })
    setScheduleItems((data || []) as OJTScheduleItem[])
    setScheduleLoading(false)
  }

  async function addScheduleItem(programId: string) {
    if (!newSchTitle.trim()) { toast('과제명을 입력하세요.', 'error'); return }
    const { error } = await supabase.from('ojt_schedule_items').insert({
      program_id: programId,
      day_number: newSchDay,
      time_slot: newSchTime.trim() || null,
      title: newSchTitle.trim(),
      description: newSchDesc.trim() || null,
      output: newSchOutput.trim() || null,
      sort_order: scheduleItems.filter(s => s.day_number === newSchDay).length,
    })
    if (error) { toast('추가 실패: ' + error.message, 'error'); return }
    setNewSchTime(''); setNewSchTitle(''); setNewSchDesc(''); setNewSchOutput('')
    await loadScheduleItems(programId)
    toast('세부 일정이 추가되었습니다.', 'success')
  }

  async function removeScheduleItem(id: string, programId: string) {
    const { error } = await supabase.from('ojt_schedule_items').delete().eq('id', id)
    if (error) { toast('삭제 실패: ' + error.message, 'error'); return }
    await loadScheduleItems(programId)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [progRes, deptRes] = await Promise.all([
      supabase.from('ojt_programs').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('departments').select('*'),
    ])
    if (progRes.data) setPrograms(progRes.data as OJTProgram[])
    if (deptRes.data) setDepartments(deptRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function resetForm() {
    setForm({
      name: '', department_id: '', job_type: '', description: '',
      duration_days: 30, modules: [], quiz_questions: [],
    })
    setModuleTitle('')
    setModuleContent('')
    resetQuizForm()
  }

  function resetQuizForm() {
    setQuizQuestion('')
    setQuizOptions(['', '', '', ''])
    setQuizCorrect(0)
    setQuizExplanation('')
  }

  function openNew() {
    setEditingId(null)
    resetForm()
    setDialogOpen(true)
  }

  function openEdit(p: OJTProgram) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      department_id: p.department_id || '',
      job_type: p.job_type || '',
      description: p.description || '',
      duration_days: p.duration_days,
      modules: p.modules || [],
      quiz_questions: p.quiz_questions || [],
    })
    setDialogOpen(true)
    loadScheduleItems(p.id)
  }

  function addModule() {
    if (!moduleTitle.trim()) { toast('모듈 제목을 입력하세요.', 'error'); return }
    setForm((prev) => ({
      ...prev,
      modules: [...prev.modules, {
        id: uid(),
        title: moduleTitle.trim(),
        content: moduleContent.trim(),
        order: prev.modules.length + 1,
      }],
    }))
    setModuleTitle('')
    setModuleContent('')
  }

  function removeModule(id: string) {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.filter((m) => m.id !== id).map((m, i) => ({ ...m, order: i + 1 })),
    }))
  }

  function addQuiz() {
    if (!quizQuestion.trim()) { toast('질문을 입력하세요.', 'error'); return }
    const filledOptions = quizOptions.filter((o) => o.trim())
    if (filledOptions.length < 2) { toast('보기를 2개 이상 입력하세요.', 'error'); return }

    setForm((prev) => ({
      ...prev,
      quiz_questions: [...prev.quiz_questions, {
        id: uid(),
        question: quizQuestion.trim(),
        options: filledOptions,
        correct_answer: quizCorrect,
        explanation: quizExplanation.trim() || undefined,
      }],
    }))
    resetQuizForm()
  }

  function removeQuiz(id: string) {
    setForm((prev) => ({
      ...prev,
      quiz_questions: prev.quiz_questions.filter((q) => q.id !== id),
    }))
  }

  async function generateQuizWithAI() {
    if (form.modules.length === 0) {
      toast('모듈을 먼저 추가한 후 퀴즈를 생성하세요.', 'error')
      return
    }
    setGeneratingQuiz(true)
    try {
      const moduleSummary = form.modules.map((m) => `- ${m.title}: ${m.content}`).join('\n')

      const prompt = `OJT 프로그램 교육 내용을 바탕으로 퀴즈 문제 5개를 생성해주세요.

프로그램: ${form.name}
교육 모듈:
${moduleSummary}

다음 JSON 배열 형식으로만 응답하세요 (다른 텍스트 없이):
[
  {
    "question": "질문 내용",
    "options": ["보기1", "보기2", "보기3", "보기4"],
    "correct_answer": 0,
    "explanation": "정답 설명"
  }
]

correct_answer는 0부터 시작하는 정답 인덱스입니다.
실무에 도움이 되는 이해도 확인 문제를 출제하세요.`

      const result = await generateAIContentSafe('ojt_mission', prompt, { maxAttempts: 3 })
      if (!result.success) {
        toast(result.error || 'AI 퀴즈 생성 실패', 'error')
        setGeneratingQuiz(false)
        return
      }

      const jsonMatch = result.content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        toast('AI 응답 형식이 올바르지 않습니다. 다시 시도하거나 수동으로 퀴즈를 추가하세요.', 'error')
        setGeneratingQuiz(false)
        return
      }

      let parsed: { question: string; options: string[]; correct_answer: number; explanation?: string }[]
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        toast('AI 응답 JSON 파싱 실패. 수동으로 퀴즈를 추가하세요.', 'error')
        setGeneratingQuiz(false)
        return
      }

      const newQuestions: QuizQuestion[] = parsed
        .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
        .map((q) => ({
          id: uid(),
          question: q.question,
          options: q.options,
          correct_answer: typeof q.correct_answer === 'number' ? q.correct_answer : 0,
          explanation: q.explanation,
        }))

      if (newQuestions.length === 0) {
        toast('AI가 유효한 퀴즈를 생성하지 못했습니다. 수동 추가를 권장합니다.', 'error')
        setGeneratingQuiz(false)
        return
      }

      setForm((prev) => ({
        ...prev,
        quiz_questions: [...prev.quiz_questions, ...newQuestions],
      }))
      toast(`AI 퀴즈 ${newQuestions.length}개가 생성되었습니다 (${result.provider}).`, 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      toast('AI 퀴즈 생성 실패: ' + message + ' · 수동으로 추가할 수 있습니다.', 'error')
    }
    setGeneratingQuiz(false)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast('프로그램 이름을 입력하세요.', 'error'); return }

    const payload = {
      name: form.name,
      department_id: form.department_id || null,
      job_type: form.job_type || null,
      description: form.description || null,
      duration_days: form.duration_days,
      modules: form.modules,
      quiz_questions: form.quiz_questions,
      created_by: profile?.id,
    }

    if (editingId) {
      const { error } = await supabase.from('ojt_programs').update(payload).eq('id', editingId)
      if (error) { toast('수정 실패: ' + error.message, 'error'); return }
    } else {
      const { error } = await supabase.from('ojt_programs').insert(payload)
      if (error) { toast('저장 실패: ' + error.message, 'error'); return }
    }

    toast('저장되었습니다.', 'success')
    setDialogOpen(false)
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 프로그램을 삭제하시겠습니까?')) return
    await supabase.from('ojt_programs').update({ is_active: false }).eq('id', id)
    toast('삭제되었습니다.', 'success')
    fetchData()
  }

  // ─── Enrollment management ─────────────────────────────────────
  async function openEnrollDialog(programId: string) {
    setSelectedProgramId(programId)
    setEnrollEmployeeId('')

    const [enrollRes, empRes] = await Promise.all([
      supabase.from('ojt_enrollments').select('*').eq('program_id', programId).order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name').eq('is_active', true).order('name'),
    ])

    if (empRes.data) setEmployees(empRes.data)

    if (enrollRes.data) {
      const enriched = enrollRes.data.map((e: OJTEnrollment) => {
        const emp = empRes.data?.find((emp: { id: string }) => emp.id === e.employee_id)
        return { ...e, employee_name: emp?.name || '알 수 없음' }
      })
      setEnrollments(enriched)
    }
    setEnrollDialogOpen(true)
  }

  async function handleEnroll() {
    if (!enrollEmployeeId || !selectedProgramId) { toast('직원을 선택하세요.', 'error'); return }

    const { error } = await supabase.from('ojt_enrollments').insert({
      employee_id: enrollEmployeeId,
      program_id: selectedProgramId,
      status: 'enrolled',
      progress: {},
      quiz_scores: [],
    })

    if (error) {
      toast('등록 실패: ' + error.message, 'error')
      return
    }

    toast('직원이 프로그램에 등록되었습니다.', 'success')
    openEnrollDialog(selectedProgramId)
  }

  async function updateEnrollmentStatus(enrollId: string, status: string) {
    const updatePayload: Record<string, unknown> = { status }
    if (status === 'in_progress') updatePayload.started_at = new Date().toISOString()
    if (status === 'completed') updatePayload.completed_at = new Date().toISOString()

    const { error } = await supabase.from('ojt_enrollments').update(updatePayload).eq('id', enrollId)
    if (error) { toast('상태 변경 실패', 'error'); return }
    toast('상태가 변경되었습니다.', 'success')
    if (selectedProgramId) openEnrollDialog(selectedProgramId)
  }

  // ─── Detail view ──────────────────────────────────────────────
  function openDetail(p: OJTProgram) {
    setDetailProgram(p)
    setDetailDialogOpen(true)
  }

  if (loading) return <PageSpinner />

  // D2-4: 편집 모드는 전체 페이지로 전환 (Dialog 제거)
  if (dialogOpen) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
              ← 목록으로
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">
              {editingId ? 'OJT 프로그램 수정' : '새 OJT 프로그램'}
            </h1>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave}>저장</Button>
          </div>
        </div>

        <Card>
          <CardContent className="py-6">
            <div className="space-y-6">
              {/* Basic info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="프로그램 이름 *" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="신입사원 OJT" />
                <Input label="교육 기간 (일)" type="number" value={form.duration_days} onChange={(e) => setForm((p) => ({ ...p, duration_days: Number(e.target.value) }))} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="부서"
                  value={form.department_id}
                  onChange={(e) => setForm((p) => ({ ...p, department_id: e.target.value }))}
                  options={[{ value: '', label: '전사 공통' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
                />
                <Input label="직무 유형" value={form.job_type} onChange={(e) => setForm((p) => ({ ...p, job_type: e.target.value }))} placeholder="예: 개발, 마케팅" />
              </div>
              <Textarea label="프로그램 설명" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} />

              {/* Modules */}
              <div className="border-t pt-5">
                <h4 className="text-sm font-bold text-gray-900 mb-3">📚 교육 모듈</h4>
                {form.modules.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {form.modules.map((m) => (
                      <div key={m.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                        <span className="text-xs text-gray-400 mt-0.5">{m.order}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{m.title}</p>
                          {m.content && <p className="text-xs text-gray-500">{m.content}</p>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeModule(m.id)}>
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <Input placeholder="모듈 제목" value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} className="flex-1 min-w-[200px]" />
                  <Input placeholder="내용 요약" value={moduleContent} onChange={(e) => setModuleContent(e.target.value)} className="flex-1 min-w-[200px]" />
                  <Button variant="outline" size="sm" onClick={addModule} className="shrink-0">추가</Button>
                </div>
              </div>

              {/* 세부 일정표 */}
              {editingId && (
                <div className="border-t pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-gray-900">📅 세부 일정표</h4>
                    <span className="text-[11px] text-gray-400">{scheduleItems.length}개 일정</span>
                  </div>

                  {scheduleLoading ? (
                    <p className="text-xs text-gray-400">불러오는 중...</p>
                  ) : scheduleItems.length > 0 ? (
                    <div className="space-y-2 mb-3">
                      {(() => {
                        const byDay = scheduleItems.reduce<Record<number, OJTScheduleItem[]>>((acc, it) => {
                          if (!acc[it.day_number]) acc[it.day_number] = []
                          acc[it.day_number].push(it)
                          return acc
                        }, {})
                        const days = Object.keys(byDay).map(Number).sort((a, b) => a - b)
                        return days.map((day) => (
                          <div key={day} className="bg-gray-50 rounded-lg p-3 border-l-4 border-brand-400">
                            <p className="text-xs font-bold text-brand-700 mb-2">{day}일차</p>
                            <div className="space-y-1.5">
                              {byDay[day].map((it) => (
                                <div key={it.id} className="flex items-start gap-2 px-2.5 py-2 bg-white rounded border border-gray-200">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {it.time_slot && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{it.time_slot}</span>}
                                      <span className="text-sm text-gray-800 font-medium">{it.title}</span>
                                    </div>
                                    {it.description && <p className="text-[11px] text-gray-500 mt-0.5">{it.description}</p>}
                                    {it.output && <p className="text-[11px] text-emerald-600 mt-0.5">🎯 산출물: {it.output}</p>}
                                    {it.mentee_comment && (
                                      <div className="mt-1.5 px-2 py-1.5 bg-amber-50 border-l-2 border-amber-300 rounded text-[11px] text-amber-900">
                                        <span className="font-bold mr-1">💬 멘티 코멘트:</span>
                                        {it.mentee_comment}
                                      </div>
                                    )}
                                  </div>
                                  <button onClick={() => removeScheduleItem(it.id, editingId)} className="text-red-400 hover:text-red-600 shrink-0">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mb-3">아직 등록된 세부 일정이 없습니다.</p>
                  )}

                  <div className="border rounded-lg p-3 space-y-2 bg-white">
                    <p className="text-[11px] font-medium text-gray-600">새 일정 추가</p>
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-3 md:col-span-2">
                        <Input type="number" min="1" placeholder="일차" value={String(newSchDay)} onChange={(e) => setNewSchDay(Number(e.target.value) || 1)} />
                      </div>
                      <div className="col-span-4 md:col-span-3">
                        <Input placeholder="시간 (예: 09:00-10:30)" value={newSchTime} onChange={(e) => setNewSchTime(e.target.value)} />
                      </div>
                      <div className="col-span-5 md:col-span-7">
                        <Input placeholder="과제명 *" value={newSchTitle} onChange={(e) => setNewSchTitle(e.target.value)} />
                      </div>
                    </div>
                    <Input placeholder="상세 설명 (선택)" value={newSchDesc} onChange={(e) => setNewSchDesc(e.target.value)} />
                    <div className="flex gap-2">
                      <Input placeholder="기대 산출물 (선택)" value={newSchOutput} onChange={(e) => setNewSchOutput(e.target.value)} />
                      <Button variant="outline" size="sm" onClick={() => addScheduleItem(editingId)} className="shrink-0">추가</Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions (하단) */}
              <div className="flex justify-end gap-3 pt-5 border-t">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
                <Button onClick={handleSave}>저장</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">OJT 프로그램</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> 새 프로그램</Button>
      </div>

      {programs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 mb-4">등록된 OJT 프로그램이 없습니다.</p>
            <Button onClick={openNew}>첫 프로그램 만들기</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {programs.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base cursor-pointer hover:text-brand-600" onClick={() => openDetail(p)}>
                    {p.name}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEnrollDialog(p.id)} title="수강생 관리">
                      <Users className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {p.description && <p className="text-sm text-gray-600">{p.description}</p>}
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="primary">{p.duration_days}일 과정</Badge>
                  <Badge variant="info">{(p.modules || []).length}개 모듈</Badge>
                  {SHOW_QUIZ_FEATURE && <Badge variant="purple">{(p.quiz_questions || []).length}개 퀴즈</Badge>}
                  {p.job_type && <Badge variant="default">{p.job_type}</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── OLD: Program Create/Edit Dialog (사용 안 함, 전체 페이지로 전환됨) ──────────────────────────── */}
      <Dialog
        open={false}
        onClose={() => setDialogOpen(false)}
        title={editingId ? 'OJT 프로그램 수정' : '새 OJT 프로그램'}
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        <div className="space-y-5">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <Input label="프로그램 이름 *" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="신입사원 OJT" />
            <Input label="교육 기간 (일)" type="number" value={form.duration_days} onChange={(e) => setForm((p) => ({ ...p, duration_days: Number(e.target.value) }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="부서"
              value={form.department_id}
              onChange={(e) => setForm((p) => ({ ...p, department_id: e.target.value }))}
              options={[{ value: '', label: '전사 공통' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
            />
            <Input label="직무 유형" value={form.job_type} onChange={(e) => setForm((p) => ({ ...p, job_type: e.target.value }))} placeholder="예: 개발, 마케팅" />
          </div>
          <Textarea label="프로그램 설명" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} />

          {/* Modules */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">교육 모듈</h4>
            {form.modules.length > 0 && (
              <div className="space-y-2 mb-3">
                {form.modules.map((m) => (
                  <div key={m.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                    <span className="text-xs text-gray-400 mt-0.5">{m.order}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{m.title}</p>
                      {m.content && <p className="text-xs text-gray-500 truncate">{m.content}</p>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeModule(m.id)}>
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input placeholder="모듈 제목" value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} />
              <Input placeholder="내용 요약" value={moduleContent} onChange={(e) => setModuleContent(e.target.value)} />
              <Button variant="outline" size="sm" onClick={addModule} className="shrink-0">추가</Button>
            </div>
          </div>

          {/* D2-4: 세부 일정표 — 프로그램 저장 후(편집 모드)에만 활성 */}
          {editingId && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900">📅 세부 일정표</h4>
                <span className="text-[11px] text-gray-400">{scheduleItems.length}개 일정</span>
              </div>

              {scheduleLoading ? (
                <p className="text-xs text-gray-400">불러오는 중...</p>
              ) : scheduleItems.length > 0 ? (
                <div className="space-y-1.5 mb-3">
                  {(() => {
                    const byDay = scheduleItems.reduce<Record<number, OJTScheduleItem[]>>((acc, it) => {
                      if (!acc[it.day_number]) acc[it.day_number] = []
                      acc[it.day_number].push(it)
                      return acc
                    }, {})
                    const days = Object.keys(byDay).map(Number).sort((a, b) => a - b)
                    return days.map((day) => (
                      <div key={day} className="bg-gray-50 rounded-lg p-2.5 border-l-4 border-brand-400">
                        <p className="text-xs font-bold text-brand-700 mb-1.5">{day}일차</p>
                        <div className="space-y-1">
                          {byDay[day].map((it) => (
                            <div key={it.id} className="flex items-start gap-2 px-2 py-1.5 bg-white rounded border border-gray-200">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {it.time_slot && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{it.time_slot}</span>}
                                  <span className="text-sm text-gray-800 font-medium">{it.title}</span>
                                </div>
                                {it.description && <p className="text-[11px] text-gray-500 mt-0.5">{it.description}</p>}
                                {it.output && <p className="text-[11px] text-emerald-600 mt-0.5">🎯 산출물: {it.output}</p>}
                              </div>
                              <button onClick={() => removeScheduleItem(it.id, editingId)} className="text-red-400 hover:text-red-600 shrink-0">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-3">아직 등록된 세부 일정이 없습니다.</p>
              )}

              <div className="border rounded-lg p-3 space-y-2 bg-white">
                <p className="text-[11px] font-medium text-gray-600">새 일정 추가</p>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-2">
                    <Input type="number" min="1" placeholder="일차" value={String(newSchDay)} onChange={(e) => setNewSchDay(Number(e.target.value) || 1)} />
                  </div>
                  <div className="col-span-3">
                    <Input placeholder="시간 (예: 09:00-10:30)" value={newSchTime} onChange={(e) => setNewSchTime(e.target.value)} />
                  </div>
                  <div className="col-span-7">
                    <Input placeholder="과제명 *" value={newSchTitle} onChange={(e) => setNewSchTitle(e.target.value)} />
                  </div>
                </div>
                <Input placeholder="상세 설명 (선택)" value={newSchDesc} onChange={(e) => setNewSchDesc(e.target.value)} />
                <div className="flex gap-2">
                  <Input placeholder="기대 산출물 (선택)" value={newSchOutput} onChange={(e) => setNewSchOutput(e.target.value)} />
                  <Button variant="outline" size="sm" onClick={() => addScheduleItem(editingId)} className="shrink-0">추가</Button>
                </div>
              </div>
            </div>
          )}

          {/* Quiz Questions — D2-4: 미팅노트 지시로 UI 숨김 */}
          {SHOW_QUIZ_FEATURE && <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900">퀴즈 문제</h4>
              <Button variant="outline" size="sm" onClick={generateQuizWithAI} disabled={generatingQuiz}>
                {generatingQuiz ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 생성 중...</>
                ) : (
                  <><Sparkles className="h-3 w-3 mr-1" /> AI 퀴즈 생성</>
                )}
              </Button>
            </div>

            {form.quiz_questions.length > 0 && (
              <div className="space-y-2 mb-3">
                {form.quiz_questions.map((q, qi) => (
                  <div key={q.id} className="p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-start justify-between">
                      <p className="text-sm text-gray-800"><span className="font-medium">Q{qi + 1}.</span> {q.question}</p>
                      <Button variant="ghost" size="sm" onClick={() => removeQuiz(q.id)}>
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {q.options.map((o, oi) => (
                        <span key={oi} className={`text-xs px-2 py-0.5 rounded ${oi === q.correct_answer ? 'bg-green-100 text-green-700 font-medium' : 'bg-gray-100 text-gray-600'}`}>
                          {oi + 1}. {o}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add quiz manually */}
            <div className="space-y-2 p-3 border rounded-lg">
              <Input placeholder="질문" value={quizQuestion} onChange={(e) => setQuizQuestion(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                {quizOptions.map((opt, i) => (
                  <Input
                    key={i}
                    placeholder={`보기 ${i + 1}`}
                    value={opt}
                    onChange={(e) => {
                      const next = [...quizOptions]
                      next[i] = e.target.value
                      setQuizOptions(next)
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-2 items-end">
                <Select
                  label="정답"
                  value={String(quizCorrect)}
                  onChange={(e) => setQuizCorrect(Number(e.target.value))}
                  options={quizOptions.filter((o) => o.trim()).map((_, i) => ({ value: String(i), label: `보기 ${i + 1}` }))}
                />
                <Input placeholder="정답 설명 (선택)" value={quizExplanation} onChange={(e) => setQuizExplanation(e.target.value)} />
                <Button variant="outline" size="sm" onClick={addQuiz} className="shrink-0">추가</Button>
              </div>
            </div>
          </div>}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave}>저장</Button>
          </div>
        </div>
      </Dialog>

      {/* ─── Enrollment Dialog ───────────────────────────────────── */}
      <Dialog
        open={enrollDialogOpen}
        onClose={() => setEnrollDialogOpen(false)}
        title="수강생 관리"
        className="max-w-lg max-h-[80vh] overflow-y-auto"
      >
        <div className="space-y-4">
          {/* Add employee */}
          <div className="flex gap-2">
            <Select
              value={enrollEmployeeId}
              onChange={(e) => setEnrollEmployeeId(e.target.value)}
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
              placeholder="직원 선택"
            />
            <Button onClick={handleEnroll} className="shrink-0">등록</Button>
          </div>

          {/* Enrollment list */}
          {enrollments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">등록된 수강생이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {enrollments.map((e) => {
                const prog = programs.find((p) => p.id === e.program_id)
                const totalModules = prog ? (prog.modules || []).length : 1
                const completedModules = Object.keys(e.progress || {}).length
                return (
                  <div key={e.id} className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{e.employee_name}</p>
                        <Badge variant={ENROLLMENT_STATUS_VARIANTS[e.status] || 'default'}>
                          {ENROLLMENT_STATUS_LABELS[e.status] || e.status}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        {e.status === 'enrolled' && (
                          <Button size="sm" variant="outline" onClick={() => updateEnrollmentStatus(e.id, 'in_progress')}>시작</Button>
                        )}
                        {e.status === 'in_progress' && (
                          <Button size="sm" variant="outline" onClick={() => updateEnrollmentStatus(e.id, 'completed')}>
                            <CheckCircle className="h-3 w-3 mr-1" /> 완료
                          </Button>
                        )}
                      </div>
                    </div>
                    {totalModules > 0 && (
                      <ProgressBar value={completedModules} max={totalModules} label="진행률" size="sm" />
                    )}
                    {e.total_quiz_score !== null && (
                      <p className="text-xs text-gray-500">퀴즈 점수: {e.total_quiz_score}점</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Dialog>

      {/* ─── Detail Dialog ───────────────────────────────────────── */}
      <Dialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        title={detailProgram?.name || '프로그램 상세'}
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        {detailProgram && (
          <div className="space-y-5">
            {detailProgram.description && (
              <p className="text-sm text-gray-600">{detailProgram.description}</p>
            )}
            <div className="flex gap-2 flex-wrap">
              <Badge variant="primary">{detailProgram.duration_days}일 과정</Badge>
              {detailProgram.job_type && <Badge variant="default">{detailProgram.job_type}</Badge>}
            </div>

            {/* Modules */}
            {(detailProgram.modules || []).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">교육 모듈</h4>
                <div className="space-y-2">
                  {detailProgram.modules.map((m) => (
                    <div key={m.id} className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-800">{m.order}. {m.title}</p>
                      {m.content && <p className="text-xs text-gray-500 mt-1">{m.content}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quiz */}
            {(detailProgram.quiz_questions || []).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">퀴즈 문제</h4>
                <div className="space-y-3">
                  {detailProgram.quiz_questions.map((q, qi) => (
                    <div key={q.id} className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-800">Q{qi + 1}. {q.question}</p>
                      <div className="mt-2 space-y-1">
                        {q.options.map((o, oi) => (
                          <p key={oi} className={`text-xs px-2 py-1 rounded ${oi === q.correct_answer ? 'bg-green-100 text-green-700 font-medium' : 'text-gray-600'}`}>
                            {oi + 1}. {o}
                          </p>
                        ))}
                      </div>
                      {q.explanation && (
                        <p className="text-xs text-blue-600 mt-2">설명: {q.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  )
}
