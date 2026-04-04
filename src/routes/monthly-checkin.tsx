import { useState, useMemo } from 'react'
import { FileText, Send, MessageCircle, Loader2, Lock, ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { useMonthlyCheckin } from '@/hooks/useMonthlyCheckin'
import { supabase } from '@/lib/supabase'
import type { MonthlyCheckin, CheckinTag, CheckinStatus, CheckinNote, SpecialNoteTag } from '@/types/employee-lifecycle'

// ─── Constants ──────────────────────────────────────────────────
const TAGS: CheckinTag[] = ['이슈', '칭찬', '제안', '기타']
const SPECIAL_NOTE_TAGS: SpecialNoteTag[] = ['이슈', '성과', '칭찬', '제안', '기타']

const TAG_COLORS: Record<string, string> = {
  '이슈': 'bg-red-100 text-red-700',
  '칭찬': 'bg-emerald-100 text-emerald-700',
  '제안': 'bg-blue-100 text-blue-700',
  '기타': 'bg-gray-100 text-gray-700',
  '성과': 'bg-amber-100 text-amber-700',
}

const STATUS_LABELS: Record<CheckinStatus, string> = {
  draft: '작성 중',
  submitted: '제출됨',
  leader_reviewed: '리더 검토',
  exec_reviewed: '임원 검토',
  ceo_reviewed: '대표 검토',
}

const STATUS_COLORS: Record<CheckinStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  leader_reviewed: 'bg-brand-100 text-brand-700',
  exec_reviewed: 'bg-violet-100 text-violet-700',
  ceo_reviewed: 'bg-emerald-100 text-emerald-700',
}

const now = new Date()
const currentYear = now.getFullYear()
const currentMonth = now.getMonth() + 1
const currentQuarter = Math.ceil(currentMonth / 3)

interface EmployeeBasic {
  id: string
  name: string
  department_id: string | null
}

// ─── MonthCheckinCard (employee form per month) ─────────────────
function MonthCheckinCard({
  year,
  month,
  myCheckin,
  loading,
  saving,
  save,
  submit,
}: {
  year: number
  month: number
  myCheckin: MonthlyCheckin | null
  loading: boolean
  saving: boolean
  save: (data: { tag: CheckinTag; content: string; project_name?: string; special_notes?: CheckinNote[] }) => Promise<{ error: string | null }>
  submit: (data: { tag: CheckinTag; content: string; project_name?: string; special_notes?: CheckinNote[] }) => Promise<{ error: string | null }>
}) {
  const { toast } = useToast()

  const [tag, setTag] = useState<CheckinTag>('기타')
  const [content, setContent] = useState('')
  const [projectName, setProjectName] = useState('')
  const [specialNotes, setSpecialNotes] = useState<CheckinNote[]>([])
  const [initialized, setInitialized] = useState(false)

  const canWrite = !myCheckin || myCheckin.status === 'draft'

  // Initialize form from existing data
  useMemo(() => {
    if (initialized || !myCheckin) return
    setTag(myCheckin.tag as CheckinTag)
    setContent(myCheckin.content || '')
    setProjectName(myCheckin.project_name || '')
    setSpecialNotes(myCheckin.special_notes || [])
    setInitialized(true)
  }, [myCheckin, initialized])

  // Reset initialization when year/month changes
  useMemo(() => {
    setInitialized(false)
    setContent('')
    setProjectName('')
    setSpecialNotes([])
    setTag('기타')
  }, [year, month])

  function addSpecialNote() {
    setSpecialNotes(prev => [...prev, { tag: '이슈' as SpecialNoteTag, text: '' }])
  }

  function updateSpecialNote(idx: number, field: 'tag' | 'text', value: string) {
    setSpecialNotes(prev => prev.map((n, i) => i === idx ? { ...n, [field]: value } : n))
  }

  function removeSpecialNote(idx: number) {
    setSpecialNotes(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    const filteredNotes = specialNotes.filter(n => n.text.trim())
    const result = await save({ tag, content, project_name: projectName, special_notes: filteredNotes })
    if (result.error) { toast('저장 실패: ' + result.error, 'error'); return }
    toast(`${month}월 임시 저장되었습니다.`, 'success')
  }

  async function handleSubmit() {
    if (!content.trim()) { toast('내용을 입력하세요.', 'error'); return }
    const filteredNotes = specialNotes.filter(n => n.text.trim())
    const result = await submit({ tag, content, project_name: projectName, special_notes: filteredNotes })
    if (result.error) { toast('제출 실패: ' + result.error, 'error'); return }
    toast(`${month}월 월간 업무 점검이 제출되었습니다.`, 'success')
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {year}년 {month}월 업무 점검
          {myCheckin && (
            <Badge className={`ml-2 ${STATUS_COLORS[myCheckin.status]}`}>
              {STATUS_LABELS[myCheckin.status]}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canWrite ? (
          <>
            {/* 구분 태그 */}
            <div className="flex gap-2">
              {TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTag(t)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    tag === t ? TAG_COLORS[t] + ' ring-2 ring-offset-1 ring-brand-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  [{t}]
                </button>
              ))}
            </div>

            {/* 프로젝트 + 본인(업무 내용) 테이블 형태 */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700 w-36">프로젝트</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">본인</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700 w-56">특이사항</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 align-top border-r">
                      <input
                        type="text"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="프로젝트명"
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
                      />
                    </td>
                    <td className="py-2 px-3 align-top border-r">
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={4}
                        placeholder="이번 달 주요 업무, 성과, 진행 상황을 상세하게 작성하세요..."
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none resize-y"
                      />
                    </td>
                    <td className="py-2 px-3 align-top">
                      <div className="space-y-2">
                        {specialNotes.map((note, idx) => (
                          <div key={idx} className="flex items-start gap-1.5">
                            <select
                              value={note.tag}
                              onChange={(e) => updateSpecialNote(idx, 'tag', e.target.value)}
                              className="shrink-0 rounded border border-gray-300 px-1 py-1 text-xs focus:border-brand-500 outline-none"
                            >
                              {SPECIAL_NOTE_TAGS.map(t => (
                                <option key={t} value={t}>[{t}]</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={note.text}
                              onChange={(e) => updateSpecialNote(idx, 'text', e.target.value)}
                              placeholder="내용 입력"
                              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-brand-500 outline-none"
                            />
                            <button onClick={() => removeSpecialNote(idx)} className="shrink-0 p-0.5 text-gray-400 hover:text-red-500">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={addSpecialNote}
                          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                        >
                          <Plus className="h-3 w-3" /> 특이사항 추가
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '임시 저장'}
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                <Send className="h-4 w-4 mr-1" /> 제출
              </Button>
            </div>
          </>
        ) : myCheckin ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge className={TAG_COLORS[myCheckin.tag as CheckinTag]}>[{myCheckin.tag}]</Badge>
              {myCheckin.is_locked && <Lock className="h-4 w-4 text-gray-400" />}
            </div>

            {/* 제출 내용 테이블 형태 표시 */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700 w-36">프로젝트</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">본인</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700 w-56">특이사항</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-3 px-3 align-top border-r text-gray-700">{myCheckin.project_name || '-'}</td>
                    <td className="py-3 px-3 align-top border-r text-gray-700 whitespace-pre-wrap">{myCheckin.content || '-'}</td>
                    <td className="py-3 px-3 align-top">
                      {(myCheckin.special_notes || []).length > 0 ? (
                        <div className="space-y-1">
                          {(myCheckin.special_notes || []).map((note: CheckinNote, i: number) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <Badge className={`${TAG_COLORS[note.tag] || TAG_COLORS['기타']} text-[10px] shrink-0`}>[{note.tag}]</Badge>
                              <span className="text-gray-700 text-xs">{note.text}</span>
                            </div>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {myCheckin.leader_feedback && (
              <div className="bg-brand-50 rounded-lg p-3">
                <p className="text-xs font-medium text-brand-700 mb-1">리더 피드백</p>
                <p className="text-sm text-brand-800">{myCheckin.leader_feedback}</p>
              </div>
            )}
            {myCheckin.exec_feedback && (
              <div className="bg-violet-50 rounded-lg p-3">
                <p className="text-xs font-medium text-violet-700 mb-1">임원 피드백</p>
                <p className="text-sm text-violet-800">{myCheckin.exec_feedback}</p>
              </div>
            )}
            {myCheckin.ceo_feedback && (
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xs font-medium text-emerald-700 mb-1">대표 피드백</p>
                <p className="text-sm text-emerald-800">{myCheckin.ceo_feedback}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-6">{month}월 점검 기록이 없습니다.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main Page ──────────────────────────────────────────────────
export default function MonthlyCheckinPage() {
  const { hasRole } = useAuth()
  const { toast } = useToast()

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter)

  const quarterMonths = [selectedQuarter * 3 - 2, selectedQuarter * 3 - 1, selectedQuarter * 3]

  // Call hooks for all 3 months in the quarter
  const month1 = useMonthlyCheckin(selectedYear, quarterMonths[0])
  const month2 = useMonthlyCheckin(selectedYear, quarterMonths[1])
  const month3 = useMonthlyCheckin(selectedYear, quarterMonths[2])

  const monthData = [
    { month: quarterMonths[0], ...month1 },
    { month: quarterMonths[1], ...month2 },
    { month: quarterMonths[2], ...month3 },
  ]

  const anyLoading = month1.loading || month2.loading || month3.loading
  const anySaving = month1.saving || month2.saving || month3.saving

  // Feedback dialog
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false)
  const [feedbackTarget, setFeedbackTarget] = useState<MonthlyCheckin | null>(null)
  const [feedbackTargetMonthIdx, setFeedbackTargetMonthIdx] = useState(0)
  const [feedbackText, setFeedbackText] = useState('')

  // Employee list for enrichment
  const [employees, setEmployees] = useState<EmployeeBasic[]>([])
  const [empLoaded, setEmpLoaded] = useState(false)

  // Expandable rows
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Load employees for admin/leader view
  useMemo(() => {
    if (empLoaded || !hasRole('leader')) return
    supabase.from('employees').select('id, name, department_id').eq('is_active', true).order('name')
      .then(({ data }) => {
        if (data) setEmployees(data)
        setEmpLoaded(true)
      })
  }, [hasRole, empLoaded])

  const isEmployee = !hasRole('leader')

  const getEmployeeName = (id: string) => employees.find((e) => e.id === id)?.name || '알 수 없음'

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openFeedback(checkin: MonthlyCheckin, monthIdx: number) {
    setFeedbackTarget(checkin)
    setFeedbackTargetMonthIdx(monthIdx)
    // Pre-fill with existing feedback based on role
    if (hasRole('ceo')) {
      setFeedbackText(checkin.ceo_feedback || '')
    } else if (hasRole('director')) {
      setFeedbackText(checkin.exec_feedback || '')
    } else if (hasRole('leader')) {
      setFeedbackText(checkin.leader_feedback || '')
    }
    setFeedbackDialogOpen(true)
  }

  async function handleFeedbackSubmit() {
    if (!feedbackTarget || !feedbackText.trim()) {
      toast('피드백을 입력하세요.', 'error')
      return
    }

    let feedbackType: 'leader_feedback' | 'exec_feedback' | 'ceo_feedback'
    let nextStatus: CheckinStatus

    if (hasRole('ceo')) {
      feedbackType = 'ceo_feedback'
      nextStatus = 'ceo_reviewed'
    } else if (hasRole('director')) {
      feedbackType = 'exec_feedback'
      nextStatus = 'exec_reviewed'
    } else {
      feedbackType = 'leader_feedback'
      nextStatus = 'leader_reviewed'
    }

    const addFeedback = monthData[feedbackTargetMonthIdx].addFeedback
    const result = await addFeedback(feedbackTarget.id, feedbackType, feedbackText, nextStatus)
    if (result.error) { toast('피드백 저장 실패: ' + result.error, 'error'); return }
    toast('피드백이 저장되었습니다.', 'success')
    setFeedbackDialogOpen(false)
    setFeedbackTarget(null)
    setFeedbackText('')
  }

  function canGiveFeedback(checkin: MonthlyCheckin): boolean {
    if (checkin.is_locked) return false
    if (hasRole('ceo') && (checkin.status === 'exec_reviewed' || checkin.status === 'leader_reviewed' || checkin.status === 'submitted')) return true
    if (hasRole('director') && (checkin.status === 'leader_reviewed' || checkin.status === 'submitted')) return true
    if (hasRole('leader') && checkin.status === 'submitted') return true
    return false
  }

  if (anyLoading) return <PageSpinner />

  const yearOptions = Array.from({ length: 3 }, (_, i) => ({
    value: String(currentYear - i),
    label: `${currentYear - i}년`,
  }))
  const quarterOptions = [
    { value: '1', label: '1분기 (1~3월)' },
    { value: '2', label: '2분기 (4~6월)' },
    { value: '3', label: '3분기 (7~9월)' },
    { value: '4', label: '4분기 (10~12월)' },
  ]

  // Combine all 3 months' checkins for leader/admin view
  const allCheckins = monthData.flatMap((md, idx) =>
    md.checkins.map((c) => ({ ...c, _month: md.month, _monthIdx: idx }))
  )
  // Sort: by month desc, then name
  allCheckins.sort((a, b) => {
    if (a._month !== b._month) return a._month - b._month
    return 0
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">월간 업무 점검</h1>
        <div className="flex gap-2">
          <Select
            value={String(selectedYear)}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            options={yearOptions}
          />
          <Select
            value={String(selectedQuarter)}
            onChange={(e) => setSelectedQuarter(Number(e.target.value))}
            options={quarterOptions}
          />
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        매월 업무 내용을 기록하고 [이슈/칭찬/제안/기타] 태그를 선택하세요. 리더 → 임원 → 대표 순서로 피드백이 작성됩니다.
      </div>

      {/* Employee: Write own checkin — one card per month */}
      {isEmployee && (
        <div className="space-y-4">
          {monthData.map((md) => (
            <MonthCheckinCard
              key={md.month}
              year={selectedYear}
              month={md.month}
              myCheckin={md.myCheckin}
              loading={md.loading}
              saving={md.saving}
              save={md.save}
              submit={md.submit}
            />
          ))}
        </div>
      )}

      {/* Leader/Exec/CEO: View all team checkins for the quarter */}
      {hasRole('leader') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              팀원 월간 점검 목록 ({selectedYear}년 {selectedQuarter}분기)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allCheckins.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400">이번 분기 제출된 점검이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allCheckins.map((checkin) => {
                  const isExpanded = expandedIds.has(checkin.id)
                  const empName = getEmployeeName(checkin.employee_id)

                  return (
                    <div key={checkin.id} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleExpand(checkin.id)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                          <Badge className="bg-gray-200 text-gray-700 text-xs">{checkin._month}월</Badge>
                          <span className="text-sm font-medium text-gray-800">{empName}</span>
                          <Badge className={TAG_COLORS[checkin.tag as CheckinTag]}>[{checkin.tag}]</Badge>
                          <Badge className={STATUS_COLORS[checkin.status]}>{STATUS_LABELS[checkin.status]}</Badge>
                        </div>
                        {canGiveFeedback(checkin) && (
                          <Badge variant="primary" className="text-xs">피드백 대기</Badge>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3 border-t">
                          {/* 프로젝트/본인/특이사항 테이블 */}
                          <div className="border rounded-lg overflow-hidden mt-3">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 border-b">
                                  <th className="text-left py-1.5 px-3 font-semibold text-gray-600 w-32 text-xs">프로젝트</th>
                                  <th className="text-left py-1.5 px-3 font-semibold text-gray-600 text-xs">본인</th>
                                  <th className="text-left py-1.5 px-3 font-semibold text-gray-600 w-52 text-xs">특이사항</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="py-2 px-3 align-top border-r text-gray-700 text-xs">{checkin.project_name || '-'}</td>
                                  <td className="py-2 px-3 align-top border-r text-gray-700 text-xs whitespace-pre-wrap">{checkin.content || '-'}</td>
                                  <td className="py-2 px-3 align-top text-xs">
                                    {(checkin.special_notes || []).length > 0 ? (
                                      <div className="space-y-1">
                                        {((checkin.special_notes || []) as CheckinNote[]).map((note, i) => (
                                          <div key={i} className="flex items-start gap-1">
                                            <Badge className={`${TAG_COLORS[note.tag] || TAG_COLORS['기타']} text-[9px] shrink-0`}>[{note.tag}]</Badge>
                                            <span className="text-gray-700">{note.text}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : '-'}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {checkin.leader_feedback && (
                            <div className="bg-brand-50 rounded-lg p-3">
                              <p className="text-xs font-medium text-brand-700 mb-1">리더 피드백</p>
                              <p className="text-sm text-brand-800">{checkin.leader_feedback}</p>
                            </div>
                          )}
                          {checkin.exec_feedback && (
                            <div className="bg-violet-50 rounded-lg p-3">
                              <p className="text-xs font-medium text-violet-700 mb-1">임원 피드백</p>
                              <p className="text-sm text-violet-800">{checkin.exec_feedback}</p>
                            </div>
                          )}
                          {checkin.ceo_feedback && (
                            <div className="bg-emerald-50 rounded-lg p-3">
                              <p className="text-xs font-medium text-emerald-700 mb-1">대표 피드백</p>
                              <p className="text-sm text-emerald-800">{checkin.ceo_feedback}</p>
                            </div>
                          )}

                          {canGiveFeedback(checkin) && (
                            <div className="flex justify-end">
                              <Button size="sm" onClick={() => openFeedback(checkin, checkin._monthIdx)}>
                                <MessageCircle className="h-3 w-3 mr-1" /> 피드백 작성
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Feedback dialog */}
      <Dialog
        open={feedbackDialogOpen}
        onClose={() => setFeedbackDialogOpen(false)}
        title="피드백 작성"
      >
        <div className="space-y-4">
          {feedbackTarget && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">{getEmployeeName(feedbackTarget.employee_id)}의 점검 내용</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{feedbackTarget.content}</p>
            </div>
          )}
          <Textarea
            label={
              hasRole('ceo') ? '대표 피드백' :
              hasRole('director') ? '임원 피드백' :
              '리더 피드백'
            }
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            rows={4}
            placeholder="피드백을 작성하세요..."
          />
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={() => setFeedbackDialogOpen(false)}>취소</Button>
            <Button onClick={handleFeedbackSubmit} disabled={anySaving}>
              {anySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : '피드백 저장'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
