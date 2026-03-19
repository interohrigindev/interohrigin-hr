import { useState, useMemo } from 'react'
import { FileText, Send, MessageCircle, Loader2, Lock, ChevronDown, ChevronRight } from 'lucide-react'
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
import type { MonthlyCheckin, CheckinTag, CheckinStatus } from '@/types/employee-lifecycle'

// ─── Constants ──────────────────────────────────────────────────
const TAGS: CheckinTag[] = ['이슈', '칭찬', '제안', '기타']

const TAG_COLORS: Record<CheckinTag, string> = {
  '이슈': 'bg-red-100 text-red-700',
  '칭찬': 'bg-emerald-100 text-emerald-700',
  '제안': 'bg-blue-100 text-blue-700',
  '기타': 'bg-gray-100 text-gray-700',
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

interface EmployeeBasic {
  id: string
  name: string
  department_id: string | null
}

export default function MonthlyCheckinPage() {
  const { hasRole } = useAuth()
  const { toast } = useToast()

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const { checkins, myCheckin, loading, saving, save, submit, addFeedback } = useMonthlyCheckin(selectedYear, selectedMonth)

  // Employee's own form
  const [tag, setTag] = useState<CheckinTag>('기타')
  const [content, setContent] = useState('')
  const [initialized, setInitialized] = useState(false)

  // Feedback dialog
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false)
  const [feedbackTarget, setFeedbackTarget] = useState<MonthlyCheckin | null>(null)
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

  // Initialize form from existing data
  useMemo(() => {
    if (initialized || !myCheckin) return
    setTag(myCheckin.tag as CheckinTag)
    setContent(myCheckin.content || '')
    setInitialized(true)
  }, [myCheckin, initialized])

  // Reset initialization when month changes
  useMemo(() => {
    setInitialized(false)
    setContent('')
    setTag('기타')
  }, [selectedYear, selectedMonth])

  const isEmployee = !hasRole('leader')
  const canWrite = isEmployee && (!myCheckin || myCheckin.status === 'draft')

  const getEmployeeName = (id: string) => employees.find((e) => e.id === id)?.name || '알 수 없음'

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    const result = await save({ tag, content })
    if (result.error) { toast('저장 실패: ' + result.error, 'error'); return }
    toast('임시 저장되었습니다.', 'success')
  }

  async function handleSubmit() {
    if (!content.trim()) { toast('내용을 입력하세요.', 'error'); return }
    const result = await submit({ tag, content })
    if (result.error) { toast('제출 실패: ' + result.error, 'error'); return }
    toast('월간 업무 점검이 제출되었습니다.', 'success')
  }

  function openFeedback(checkin: MonthlyCheckin) {
    setFeedbackTarget(checkin)
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

  if (loading) return <PageSpinner />

  const yearOptions = Array.from({ length: 3 }, (_, i) => ({
    value: String(currentYear - i),
    label: `${currentYear - i}년`,
  }))
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}월`,
  }))

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
            value={String(selectedMonth)}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            options={monthOptions}
          />
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        매월 업무 내용을 기록하고 [이슈/칭찬/제안/기타] 태그를 선택하세요. 리더 → 임원 → 대표 순서로 피드백이 작성됩니다.
      </div>

      {/* Employee: Write own checkin */}
      {isEmployee && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedYear}년 {selectedMonth}월 업무 점검
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
                <Textarea
                  label="업무 내용"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={6}
                  placeholder="이번 달 주요 업무, 성과, 이슈 등을 자유롭게 작성하세요..."
                />
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
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{myCheckin.content}</p>
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
              <p className="text-gray-400 text-center py-6">이번 달 점검 기록이 없습니다.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Leader/Exec/CEO: View all team checkins */}
      {hasRole('leader') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              팀원 월간 점검 목록 ({selectedYear}년 {selectedMonth}월)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {checkins.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400">이번 달 제출된 점검이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {checkins.map((checkin) => {
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
                          <p className="text-sm text-gray-700 whitespace-pre-wrap mt-3">{checkin.content}</p>

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
                              <Button size="sm" onClick={() => openFeedback(checkin)}>
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
            <Button onClick={handleFeedbackSubmit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '피드백 저장'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
