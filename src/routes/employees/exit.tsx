import { useState, useEffect, useCallback } from 'react'
import { UserPlus, Mail, CheckCircle, XCircle, Clock, FileText } from 'lucide-react'
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
import type { Department } from '@/types/database'
import type { Candidate, HiringDecisionRecord } from '@/types/recruitment'
import type { ExitSurvey } from '@/types/employee-lifecycle'

// ─── Tab type ───────────────────────────────────────────────────
type TabKey = 'hiring' | 'exit'

// ─── Decision label / variant ───────────────────────────────────
const DECISION_LABELS: Record<string, string> = {
  hired: '합격',
  rejected: '불합격',
  hold: '보류',
}
const DECISION_VARIANTS: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
  hired: 'success',
  rejected: 'danger',
  hold: 'warning',
}

interface HiringWithCandidate extends HiringDecisionRecord {
  candidate_name?: string
  candidate_email?: string
  candidate_phone?: string
}

export default function ExitManage() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>('hiring')
  const [loading, setLoading] = useState(true)

  // Hiring tab data
  const [decisions, setDecisions] = useState<HiringWithCandidate[]>([])
  const [departments, setDepartments] = useState<Department[]>([])

  // Exit tab data
  const [exitSurveys, setExitSurveys] = useState<(ExitSurvey & { employee_name?: string })[]>([])

  // Register employee dialog
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false)
  const [registerDecision, setRegisterDecision] = useState<HiringWithCandidate | null>(null)
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    phone: '',
    department_id: '',
    role: 'employee',
    start_date: '',
  })

  // Notification dialog
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false)
  const [notifyDecision, setNotifyDecision] = useState<HiringWithCandidate | null>(null)
  const [notifyMessage, setNotifyMessage] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [decRes, deptRes, candidatesRes, exitRes, empRes] = await Promise.all([
      supabase.from('hiring_decisions').select('*').order('created_at', { ascending: false }),
      supabase.from('departments').select('*'),
      supabase.from('candidates').select('id, name, email, phone'),
      supabase.from('exit_surveys').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name'),
    ])

    if (deptRes.data) setDepartments(deptRes.data)

    if (decRes.data && candidatesRes.data) {
      const enriched: HiringWithCandidate[] = (decRes.data as HiringDecisionRecord[]).map((d) => {
        const cand = (candidatesRes.data as Candidate[]).find((c) => c.id === d.candidate_id)
        return {
          ...d,
          candidate_name: cand?.name || '알 수 없음',
          candidate_email: cand?.email || '',
          candidate_phone: cand?.phone || '',
        }
      })
      setDecisions(enriched)
    }

    if (exitRes.data && empRes.data) {
      const enrichedExit = (exitRes.data as ExitSurvey[]).map((s) => {
        const emp = empRes.data?.find((e: { id: string; name: string }) => e.id === s.employee_id)
        return { ...s, employee_name: emp?.name || '알 수 없음' }
      })
      setExitSurveys(enrichedExit)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Register Employee ────────────────────────────────────────
  function openRegisterDialog(decision: HiringWithCandidate) {
    setRegisterDecision(decision)
    setRegisterForm({
      name: decision.candidate_name || '',
      email: decision.candidate_email || '',
      phone: decision.candidate_phone || '',
      department_id: decision.offered_department_id || '',
      role: 'employee',
      start_date: decision.start_date || new Date().toISOString().slice(0, 10),
    })
    setRegisterDialogOpen(true)
  }

  async function handleRegisterEmployee() {
    if (!registerForm.name.trim() || !registerForm.email.trim()) {
      toast('이름과 이메일은 필수입니다.', 'error')
      return
    }

    // Create employee record
    const { data: newEmployee, error: empError } = await supabase.from('employees').insert({
      name: registerForm.name,
      email: registerForm.email,
      phone: registerForm.phone || null,
      department_id: registerForm.department_id || null,
      role: registerForm.role,
      is_active: true,
    }).select().single()

    if (empError) {
      toast('직원 등록 실패: ' + empError.message, 'error')
      return
    }

    // Update candidate status to hired
    if (registerDecision?.candidate_id) {
      await supabase.from('candidates').update({ status: 'hired' }).eq('id', registerDecision.candidate_id)
    }

    toast(`${registerForm.name}님이 직원으로 등록되었습니다. (ID: ${newEmployee.id})`, 'success')
    setRegisterDialogOpen(false)
    fetchData()
  }

  // ─── Notification ─────────────────────────────────────────────
  function openNotifyDialog(decision: HiringWithCandidate) {
    setNotifyDecision(decision)
    const isHired = decision.decision === 'hired'
    setNotifyMessage(
      isHired
        ? `${decision.candidate_name}님, 합격을 축하드립니다!\n\n입사일: ${decision.start_date || '추후 안내'}\n부서: ${departments.find((d) => d.id === decision.offered_department_id)?.name || '추후 안내'}\n직급: ${decision.offered_position || '추후 안내'}\n\n입사에 필요한 서류를 준비해주시기 바랍니다.\n감사합니다.`
        : `${decision.candidate_name}님, 지원해 주셔서 감사합니다.\n\n아쉽게도 이번 채용에서는 함께하지 못하게 되었습니다.\n앞으로의 취업 활동에 좋은 결과가 있기를 바랍니다.\n\n감사합니다.`
    )
    setNotifyDialogOpen(true)
  }

  async function handleSendNotification() {
    // In production this would send an email. For now, just log and toast.
    toast(`${notifyDecision?.candidate_name}님에게 통보 메시지가 전송되었습니다.`, 'success')
    setNotifyDialogOpen(false)
  }

  if (loading) return <PageSpinner />

  const hiredDecisions = decisions.filter((d) => d.decision === 'hired')
  const rejectedDecisions = decisions.filter((d) => d.decision === 'rejected')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">합격 통보 / 퇴사 관리</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { key: 'hiring' as TabKey, label: '합격 통보 / 직원 등록' },
          { key: 'exit' as TabKey, label: '퇴사 현황' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Hiring Tab ──────────────────────────────────────────── */}
      {activeTab === 'hiring' && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{hiredDecisions.length}</p>
                <p className="text-xs text-gray-500">합격</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-bold text-red-600">{rejectedDecisions.length}</p>
                <p className="text-xs text-gray-500">불합격</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-bold text-gray-600">{decisions.length}</p>
                <p className="text-xs text-gray-500">전체 결정</p>
              </CardContent>
            </Card>
          </div>

          {/* Hired candidates requiring action */}
          {hiredDecisions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> 합격자 목록
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {hiredDecisions.map((d) => (
                    <div key={d.id} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{d.candidate_name}</p>
                        <p className="text-xs text-gray-500">
                          {d.candidate_email}
                          {d.offered_position && ` · ${d.offered_position}`}
                          {d.start_date && ` · 입사일: ${d.start_date}`}
                        </p>
                        {d.ai_recommendation && (
                          <Badge variant="info" className="mt-1">AI: {d.ai_recommendation}</Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openNotifyDialog(d)}>
                          <Mail className="h-3 w-3 mr-1" /> 합격 통보
                        </Button>
                        <Button size="sm" onClick={() => openRegisterDialog(d)}>
                          <UserPlus className="h-3 w-3 mr-1" /> 직원 등록
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rejected candidates */}
          {rejectedDecisions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" /> 불합격자 목록
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {rejectedDecisions.map((d) => (
                    <div key={d.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{d.candidate_name}</p>
                        <p className="text-xs text-gray-500">
                          {d.candidate_email}
                          {d.reason && ` · 사유: ${d.reason}`}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => openNotifyDialog(d)}>
                        <Mail className="h-3 w-3 mr-1" /> 불합격 통보
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {decisions.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">아직 채용 결정이 없습니다.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── Exit Tab ────────────────────────────────────────────── */}
      {activeTab === 'exit' && (
        <div className="space-y-4">
          {exitSurveys.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">퇴사 설문이 없습니다.</p>
              </CardContent>
            </Card>
          ) : (
            exitSurveys.map((s) => (
              <Card key={s.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{s.employee_name}</CardTitle>
                    <Badge variant={s.completed_at ? 'success' : 'warning'}>
                      {s.completed_at ? '완료' : '미완료'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {s.exit_date && <p><span className="text-gray-500">퇴사일:</span> {s.exit_date}</p>}
                  {s.exit_reason_category && <p><span className="text-gray-500">퇴사 사유:</span> {s.exit_reason_category}</p>}
                  {s.exit_reason_detail && <p><span className="text-gray-500">상세 사유:</span> {s.exit_reason_detail}</p>}
                  {s.best_experience && <p><span className="text-gray-500">좋았던 점:</span> {s.best_experience}</p>}
                  {s.worst_experience && <p><span className="text-gray-500">아쉬웠던 점:</span> {s.worst_experience}</p>}
                  {s.suggestions && <p><span className="text-gray-500">제안:</span> {s.suggestions}</p>}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ─── Register Employee Dialog ────────────────────────────── */}
      <Dialog
        open={registerDialogOpen}
        onClose={() => setRegisterDialogOpen(false)}
        title="직원 등록"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <Input label="이름 *" value={registerForm.name} onChange={(e) => setRegisterForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label="이메일 *" type="email" value={registerForm.email} onChange={(e) => setRegisterForm((p) => ({ ...p, email: e.target.value }))} />
          <Input label="전화번호" value={registerForm.phone} onChange={(e) => setRegisterForm((p) => ({ ...p, phone: e.target.value }))} />
          <Select
            label="부서"
            value={registerForm.department_id}
            onChange={(e) => setRegisterForm((p) => ({ ...p, department_id: e.target.value }))}
            options={[{ value: '', label: '미정' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
          />
          <Select
            label="역할"
            value={registerForm.role}
            onChange={(e) => setRegisterForm((p) => ({ ...p, role: e.target.value }))}
            options={[
              { value: 'employee', label: '사원' },
              { value: 'leader', label: '팀장' },
              { value: 'director', label: '이사' },
            ]}
          />
          <Input label="입사일" type="date" value={registerForm.start_date} onChange={(e) => setRegisterForm((p) => ({ ...p, start_date: e.target.value }))} />
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setRegisterDialogOpen(false)}>취소</Button>
            <Button onClick={handleRegisterEmployee}>
              <UserPlus className="h-4 w-4 mr-1" /> 직원 등록
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ─── Notify Dialog ───────────────────────────────────────── */}
      <Dialog
        open={notifyDialogOpen}
        onClose={() => setNotifyDialogOpen(false)}
        title={notifyDecision?.decision === 'hired' ? '합격 통보' : '불합격 통보'}
        className="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant={DECISION_VARIANTS[notifyDecision?.decision || 'hold']}>
              {DECISION_LABELS[notifyDecision?.decision || 'hold']}
            </Badge>
            <span className="text-sm font-medium text-gray-900">{notifyDecision?.candidate_name}</span>
          </div>
          <Input label="수신자 이메일" value={notifyDecision?.candidate_email || ''} disabled />
          <Textarea
            label="통보 메시지"
            value={notifyMessage}
            onChange={(e) => setNotifyMessage(e.target.value)}
            rows={8}
          />
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setNotifyDialogOpen(false)}>취소</Button>
            <Button onClick={handleSendNotification}>
              <Mail className="h-4 w-4 mr-1" /> 전송
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
