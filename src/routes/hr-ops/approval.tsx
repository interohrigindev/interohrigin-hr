import { useState, useEffect, useMemo } from 'react'
import {
  FileCheck, Clock, CheckCircle, XCircle,
  Plus, Search, ChevronRight, User,
  Send, Paperclip, Download,
} from 'lucide-react'
import jsPDF from 'jspdf'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { Textarea } from '@/components/ui/Textarea'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/* ────── Types ────── */

interface Employee {
  id: string
  name: string
  position: string | null
  role: string | null
  department_id: string | null
}

interface Department { id: string; name: string }

interface ApprovalDocument {
  id: string
  doc_type: string
  doc_number: string | null
  title: string
  content: Record<string, unknown> | null
  attachments: string[] | null
  requester_id: string
  department: string | null
  status: 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'cancelled'
  current_step: number
  total_steps: number
  amount: number | null
  linked_leave_id: string | null
  linked_employee_id: string | null
  submitted_at: string | null
  completed_at: string | null
  created_at: string
}

interface ApprovalStep {
  id: string
  document_id: string
  step_order: number
  approver_id: string
  approver_role: 'leader' | 'executive' | 'ceo' | 'hr_admin'
  action: 'pending' | 'approved' | 'rejected' | 'skipped'
  comment: string | null
  acted_at: string | null
  is_delegated: boolean
  original_approver_id: string | null
}

interface ApprovalTemplate {
  id: string
  doc_type: string
  name: string
  steps: { role: string; label: string }[]
  condition_field: string | null
  condition_operator: string | null
  condition_value: string | null
  is_active: boolean
}

/* ────── Constants ────── */

type TabKey = 'my_requests' | 'pending_approval' | 'all'

const DOC_TYPE_CONFIG: Record<string, { label: string; icon: string; hasAmount: boolean }> = {
  leave:         { label: '연차/반차/조퇴 신청', icon: '🗓', hasAmount: false },
  overtime:      { label: '연장/야간/휴일 근무', icon: '🌙', hasAmount: false },
  expense:       { label: '경비 청구',           icon: '💰', hasAmount: true },
  business_trip: { label: '출장 신청',           icon: '✈', hasAmount: false },
  general:       { label: '일반 결재',           icon: '📄', hasAmount: false },
  purchase:      { label: '구매 요청',           icon: '🛒', hasAmount: true },
}

const STATUS_CONFIG: Record<string, { border: string; badge: 'warning' | 'info' | 'success' | 'danger' | 'default'; label: string }> = {
  draft:      { border: 'border-l-gray-400',    badge: 'default', label: '임시저장' },
  submitted:  { border: 'border-l-amber-500',   badge: 'warning', label: '제출' },
  in_review:  { border: 'border-l-blue-500',    badge: 'info',    label: '결재 진행중' },
  approved:   { border: 'border-l-emerald-500', badge: 'success', label: '승인' },
  rejected:   { border: 'border-l-red-500',     badge: 'danger',  label: '반려' },
  cancelled:  { border: 'border-l-gray-400',    badge: 'default', label: '취소' },
}

const ROLE_LABELS: Record<string, string> = {
  leader: '리더', executive: '이사/임원', ceo: '대표', hr_admin: 'HR 관리자',
}

const ADMIN_ROLES = ['ceo', 'director', 'division_head', 'admin']
const LEADER_ROLES = ['leader', 'director', 'division_head', 'ceo', 'admin']
const EXECUTIVE_ROLES = ['director', 'division_head', 'ceo', 'admin']

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '.').replace(/\.$/, '')

const fmtAmount = (n: number) => n.toLocaleString('ko-KR') + '원'

/* ────── Component ────── */

export default function ApprovalManagementPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const isAdmin = profile?.role ? ADMIN_ROLES.includes(profile.role) : false

  const [documents, setDocuments] = useState<ApprovalDocument[]>([])
  const [stepsMap, setStepsMap] = useState<Record<string, ApprovalStep[]>>({})
  const [templates, setTemplates] = useState<ApprovalTemplate[]>([])
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('my_requests')
  const [searchQuery, setSearchQuery] = useState('')

  // Detail
  const [selectedDoc, setSelectedDoc] = useState<ApprovalDocument | null>(null)
  const [actionComment, setActionComment] = useState('')
  const [processing, setProcessing] = useState(false)

  // 결재 위임
  const [showDelegationDialog, setShowDelegationDialog] = useState(false)
  const [delegateToId, setDelegateToId] = useState('')
  const [delegationStart, setDelegationStart] = useState('')
  const [delegationEnd, setDelegationEnd] = useState('')
  const [delegationReason, setDelegationReason] = useState('')

  // New document dialog
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newDocType, setNewDocType] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState<Record<string, string>>({})
  const [newAmount, setNewAmount] = useState('')
  const [newApprovers, setNewApprovers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /* ── Role-based employee lists ── */

  const leaders = useMemo(
    () => allEmployees.filter((e) => e.role && LEADER_ROLES.includes(e.role) && e.id !== profile?.id),
    [allEmployees, profile?.id],
  )
  const executives = useMemo(
    () => allEmployees.filter((e) => e.role && EXECUTIVE_ROLES.includes(e.role) && e.id !== profile?.id),
    [allEmployees, profile?.id],
  )
  const ceo = useMemo(() => allEmployees.find((e) => e.role === 'ceo'), [allEmployees])

  /* ── Fetch ── */

  useEffect(() => { fetchData() }, [profile?.id])

  async function fetchData() {
    if (!profile?.id) return
    setLoading(true)

    const [docRes, stepsRes, tplRes, empRes, deptRes] = await Promise.all([
      supabase
        .from('approval_documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('approval_steps')
        .select('*')
        .order('step_order', { ascending: true }),
      supabase
        .from('approval_templates')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('employees')
        .select('id, name, position, role, department_id')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('departments')
        .select('id, name')
        .order('name'),
    ])

    const allDocs = (docRes.data || []) as ApprovalDocument[]
    const allSteps = (stepsRes.data || []) as ApprovalStep[]
    const empData = (empRes.data || []) as Employee[]

    // Build steps map: document_id -> steps[]
    const sMap: Record<string, ApprovalStep[]> = {}
    for (const step of allSteps) {
      if (!sMap[step.document_id]) sMap[step.document_id] = []
      sMap[step.document_id].push(step)
    }

    setAllEmployees(empData)
    setDepartments((deptRes.data || []) as Department[])
    setTemplates((tplRes.data || []) as ApprovalTemplate[])
    setStepsMap(sMap)

    // Filter documents based on role
    if (isAdmin) {
      setDocuments(allDocs)
    } else {
      // Show: own documents + documents where user is an approver
      const myApproverDocIds = new Set(
        allSteps.filter((s) => s.approver_id === profile.id).map((s) => s.document_id),
      )
      setDocuments(
        allDocs.filter((d) => d.requester_id === profile.id || myApproverDocIds.has(d.id)),
      )
    }

    setLoading(false)
  }

  /* ── Helpers ── */

  const getEmpName = (id: string) => allEmployees.find((e) => e.id === id)?.name || '-'
  const getDeptName = (deptId: string | null) => departments.find((d) => d.id === deptId)?.name || ''
  const getDocTypeLabel = (t: string) => DOC_TYPE_CONFIG[t]?.label || t
  const getDocTypeIcon = (t: string) => DOC_TYPE_CONFIG[t]?.icon || '📄'

  // Get the matching template for a doc_type
  const getTemplateForDocType = (docType: string) =>
    templates.find((t) => t.doc_type === docType)

  const getApproverOptions = (role: string) => {
    if (role === 'ceo') return ceo ? [{ value: ceo.id, label: `${ceo.name} (대표)` }] : []
    if (role === 'executive') return executives.map((e) => ({ value: e.id, label: `${e.name} (${e.position || e.role})` }))
    if (role === 'leader') return leaders.map((e) => ({ value: e.id, label: `${e.name} (${e.position || e.role})` }))
    return allEmployees.filter((e) => e.id !== profile?.id).map((e) => ({ value: e.id, label: `${e.name} (${e.position || e.role || ''})` }))
  }

  /* ── PDF Download ── */

  function handleDownloadPDF(doc: ApprovalDocument) {
    const pdf = new jsPDF()
    const steps = stepsMap[doc.id] || []

    // Title
    pdf.setFontSize(18)
    pdf.text('APPROVAL DOCUMENT', 105, 20, { align: 'center' })

    // Horizontal line
    pdf.setDrawColor(0)
    pdf.setLineWidth(0.5)
    pdf.line(20, 25, 190, 25)

    // Document info
    pdf.setFontSize(10)
    let y = 35

    pdf.setFont('helvetica', 'bold')
    pdf.text('No:', 20, y)
    pdf.setFont('helvetica', 'normal')
    pdf.text(doc.doc_number || '-', 50, y)
    y += 8

    pdf.setFont('helvetica', 'bold')
    pdf.text('Title:', 20, y)
    pdf.setFont('helvetica', 'normal')
    pdf.text(doc.title, 50, y)
    y += 8

    pdf.setFont('helvetica', 'bold')
    pdf.text('Type:', 20, y)
    pdf.setFont('helvetica', 'normal')
    pdf.text(getDocTypeLabel(doc.doc_type), 50, y)
    y += 8

    pdf.setFont('helvetica', 'bold')
    pdf.text('Requester:', 20, y)
    pdf.setFont('helvetica', 'normal')
    pdf.text(getEmpName(doc.requester_id), 50, y)
    y += 8

    if (doc.department) {
      pdf.setFont('helvetica', 'bold')
      pdf.text('Department:', 20, y)
      pdf.setFont('helvetica', 'normal')
      pdf.text(doc.department, 50, y)
      y += 8
    }

    pdf.setFont('helvetica', 'bold')
    pdf.text('Submitted:', 20, y)
    pdf.setFont('helvetica', 'normal')
    pdf.text(doc.submitted_at ? fmtDate(doc.submitted_at) : fmtDate(doc.created_at), 50, y)
    y += 8

    if (doc.completed_at) {
      pdf.setFont('helvetica', 'bold')
      pdf.text('Completed:', 20, y)
      pdf.setFont('helvetica', 'normal')
      pdf.text(fmtDate(doc.completed_at), 50, y)
      y += 8
    }

    pdf.setFont('helvetica', 'bold')
    pdf.text('Status:', 20, y)
    pdf.setFont('helvetica', 'normal')
    const statusLabel = STATUS_CONFIG[doc.status]?.label || doc.status
    pdf.text(statusLabel, 50, y)
    y += 8

    if (doc.amount != null) {
      pdf.setFont('helvetica', 'bold')
      pdf.text('Amount:', 20, y)
      pdf.setFont('helvetica', 'normal')
      pdf.text(fmtAmount(doc.amount), 50, y)
      y += 8
    }

    // Content section
    if (doc.content && Object.keys(doc.content).length > 0) {
      y += 5
      pdf.setDrawColor(200)
      pdf.line(20, y, 190, y)
      y += 8

      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Content', 20, y)
      y += 8

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      for (const [key, value] of Object.entries(doc.content)) {
        pdf.setFont('helvetica', 'bold')
        pdf.text(`${key}:`, 25, y)
        pdf.setFont('helvetica', 'normal')
        pdf.text(String(value), 70, y)
        y += 7
        if (y > 270) {
          pdf.addPage()
          y = 20
        }
      }
    }

    // Approval steps
    y += 5
    pdf.setDrawColor(200)
    pdf.line(20, y, 190, y)
    y += 8

    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text(`Approval Flow (${doc.current_step}/${doc.total_steps})`, 20, y)
    y += 8

    pdf.setFontSize(10)
    for (const step of steps) {
      if (y > 270) {
        pdf.addPage()
        y = 20
      }

      const actionLabel =
        step.action === 'approved' ? 'Approved' :
        step.action === 'rejected' ? 'Rejected' :
        'Pending'
      const roleLabel = ROLE_LABELS[step.approver_role] || step.approver_role

      pdf.setFont('helvetica', 'bold')
      pdf.text(`Step ${step.step_order}:`, 25, y)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`${getEmpName(step.approver_id)} (${roleLabel}) - ${actionLabel}`, 50, y)
      y += 6

      if (step.comment) {
        pdf.setFont('helvetica', 'italic')
        pdf.text(`Comment: ${step.comment}`, 50, y)
        pdf.setFont('helvetica', 'normal')
        y += 6
      }

      if (step.acted_at) {
        pdf.text(`Date: ${fmtDate(step.acted_at)}`, 50, y)
        y += 6
      }

      y += 2
    }

    pdf.save(`approval_${doc.doc_number || doc.id}.pdf`)
  }

  /* ── Stats ── */

  const stats = useMemo(() => {
    const myRequests = documents.filter((d) => d.requester_id === profile?.id).length
    const pendingApproval = documents.filter((d) => {
      if (d.status !== 'submitted' && d.status !== 'in_review') return false
      const steps = stepsMap[d.id] || []
      const currentStepData = steps.find((s) => s.step_order === d.current_step)
      return currentStepData?.approver_id === profile?.id && currentStepData?.action === 'pending'
    }).length
    const completed = documents.filter((d) => d.status === 'approved' || d.status === 'rejected').length
    return { myRequests, pendingApproval, completed }
  }, [documents, stepsMap, profile?.id])

  /* ── Filtered ── */

  const filteredDocuments = useMemo(() => {
    let result = documents

    if (activeTab === 'my_requests') {
      result = result.filter((d) => d.requester_id === profile?.id)
    } else if (activeTab === 'pending_approval') {
      result = result.filter((d) => {
        if (d.status !== 'submitted' && d.status !== 'in_review') return false
        const steps = stepsMap[d.id] || []
        const currentStepData = steps.find((s) => s.step_order === d.current_step)
        return currentStepData?.approver_id === profile?.id && currentStepData?.action === 'pending'
      })
    }
    // 'all' tab: no filter (admin only, enforced in UI)

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((d) =>
        d.title.toLowerCase().includes(q) ||
        (d.doc_number || '').toLowerCase().includes(q) ||
        getEmpName(d.requester_id).toLowerCase().includes(q) ||
        getDocTypeLabel(d.doc_type).toLowerCase().includes(q),
      )
    }
    return result
  }, [documents, activeTab, searchQuery, stepsMap, profile?.id])

  /* ── Approval Actions ── */

  async function handleApprovalAction(docId: string, action: 'approved' | 'rejected') {
    if (!profile?.id) return
    setProcessing(true)

    const doc = documents.find((d) => d.id === docId)
    if (!doc) { setProcessing(false); return }

    const steps = stepsMap[docId] || []
    const currentStepData = steps.find((s) => s.step_order === doc.current_step)
    if (!currentStepData || currentStepData.approver_id !== profile.id) {
      toast('현재 결재 차례가 아닙니다', 'error')
      setProcessing(false)
      return
    }

    // Update the approval step
    const { error: stepErr } = await supabase
      .from('approval_steps')
      .update({
        action,
        comment: actionComment || null,
        acted_at: new Date().toISOString(),
      })
      .eq('id', currentStepData.id)

    if (stepErr) {
      toast('처리 실패: ' + stepErr.message, 'error')
      setProcessing(false)
      return
    }

    // Update the document
    if (action === 'rejected') {
      await supabase
        .from('approval_documents')
        .update({
          status: 'rejected',
          completed_at: new Date().toISOString(),
        })
        .eq('id', docId)
      toast('반려 처리되었습니다', 'success')
    } else if (doc.current_step >= doc.total_steps) {
      // Last step approved -> final approval
      await supabase
        .from('approval_documents')
        .update({
          status: 'approved',
          completed_at: new Date().toISOString(),
        })
        .eq('id', docId)
      toast('최종 승인 완료', 'success')
    } else {
      // Move to next step
      await supabase
        .from('approval_documents')
        .update({
          status: 'in_review',
          current_step: doc.current_step + 1,
        })
        .eq('id', docId)
      const nextStep = steps.find((s) => s.step_order === doc.current_step + 1)
      const nextName = nextStep ? getEmpName(nextStep.approver_id) : ''
      toast(`승인 완료. 다음 결재자(${nextName})에게 전달되었습니다.`, 'success')
    }

    setProcessing(false)
    setActionComment('')
    setSelectedDoc(null)
    fetchData()
  }

  /* ── 반려 후 재상신 ── */
  async function handleResubmit(docId: string) {
    const doc = documents.find((d) => d.id === docId)
    if (!doc || doc.status !== 'rejected') return
    setProcessing(true)

    // 모든 approval_steps를 pending으로 초기화
    const steps = stepsMap[docId] || []
    for (const step of steps) {
      await supabase.from('approval_steps').update({ action: 'pending', comment: null, acted_at: null }).eq('id', step.id)
    }

    // 문서를 submitted로 되돌리고 current_step = 1
    await supabase.from('approval_documents').update({
      status: 'submitted',
      current_step: 1,
      completed_at: null,
    }).eq('id', docId)

    setProcessing(false)
    toast('재상신 완료. 결재가 다시 시작됩니다.', 'success')
    setSelectedDoc(null)
    fetchData()
  }

  /* ── 결재 위임 등록 ── */
  async function handleSaveDelegation() {
    if (!profile?.id || !delegateToId || !delegationStart || !delegationEnd) {
      toast('모든 항목을 입력하세요', 'error')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('approval_delegations').insert({
      delegator_id: profile.id,
      delegate_id: delegateToId,
      start_date: delegationStart,
      end_date: delegationEnd,
      reason: delegationReason || null,
      is_active: true,
    })
    setSaving(false)
    if (error) { toast('위임 등록 실패: ' + error.message, 'error'); return }
    toast('결재 위임이 등록되었습니다', 'success')
    setShowDelegationDialog(false)
    setDelegateToId(''); setDelegationStart(''); setDelegationEnd(''); setDelegationReason('')
  }

  /* ── Create New Document ── */

  const selectedTemplate = newDocType ? getTemplateForDocType(newDocType) : null
  const hasAmount = DOC_TYPE_CONFIG[newDocType]?.hasAmount || false

  function resetNewForm() {
    setNewDocType('')
    setNewTitle('')
    setNewContent({})
    setNewAmount('')
    setNewApprovers({})
  }

  async function handleCreateDocument() {
    if (!profile?.id) return
    if (!newDocType) { toast('결재 유형을 선택하세요', 'error'); return }
    if (!newTitle.trim()) { toast('제목을 입력하세요', 'error'); return }

    // Validate approvers for each template step
    if (selectedTemplate) {
      for (const step of selectedTemplate.steps) {
        if (step.role === 'ceo' && ceo) continue // auto-assigned
        if (!newApprovers[step.role]) {
          toast(`${ROLE_LABELS[step.role] || step.label} 결재자를 선택하세요`, 'error')
          return
        }
      }
    }

    setSaving(true)

    const myDept = allEmployees.find((e) => e.id === profile.id)
    const deptName = myDept?.department_id ? getDeptName(myDept.department_id) : null
    const totalSteps = selectedTemplate?.steps?.length || 1

    // Insert document
    const { data: docData, error: docErr } = await supabase
      .from('approval_documents')
      .insert({
        doc_type: newDocType,
        title: newTitle.trim(),
        content: Object.keys(newContent).length > 0 ? newContent : null,
        attachments: null,
        requester_id: profile.id,
        department: deptName,
        status: 'submitted',
        current_step: 1,
        total_steps: totalSteps,
        amount: hasAmount && newAmount ? parseInt(newAmount, 10) : null,
        linked_leave_id: null,
        linked_employee_id: null,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (docErr || !docData) {
      toast('결재 신청 실패: ' + (docErr?.message || '알 수 없는 오류'), 'error')
      setSaving(false)
      return
    }

    // Insert approval steps
    if (selectedTemplate) {
      const stepInserts = selectedTemplate.steps.map((step, idx) => {
        const approverId =
          step.role === 'ceo' && ceo
            ? ceo.id
            : newApprovers[step.role]
        return {
          document_id: docData.id,
          step_order: idx + 1,
          approver_id: approverId,
          approver_role: step.role,
          action: 'pending',
          comment: null,
          acted_at: null,
          is_delegated: false,
          original_approver_id: null,
        }
      })

      const { error: stepsErr } = await supabase
        .from('approval_steps')
        .insert(stepInserts)

      if (stepsErr) {
        toast('결재라인 생성 실패: ' + stepsErr.message, 'error')
        setSaving(false)
        return
      }
    }

    toast('결재 신청이 완료되었습니다', 'success')
    setSaving(false)
    setShowNewDialog(false)
    resetNewForm()
    fetchData()
  }

  /* ── Render helpers ── */

  function renderStepPills(docId: string, doc: ApprovalDocument) {
    const steps = stepsMap[docId] || []
    if (steps.length === 0) return null

    return (
      <div className="flex items-center gap-1 flex-wrap">
        {/* Requester pill */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-[11px] text-gray-600">
          <div className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center text-[8px] font-bold text-white">
            {getEmpName(doc.requester_id)[0]}
          </div>
          신청
        </div>

        {steps.map((step) => {
          const isCurrent =
            step.step_order === doc.current_step &&
            (doc.status === 'submitted' || doc.status === 'in_review') &&
            step.action === 'pending'
          const isDone = step.action === 'approved'
          const isRejected = step.action === 'rejected'

          return (
            <div key={step.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-gray-300" />
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium ${
                  isRejected
                    ? 'bg-red-100 text-red-700'
                    : isDone
                      ? 'bg-emerald-100 text-emerald-700'
                      : isCurrent
                        ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300'
                        : 'bg-gray-100 text-gray-500'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white ${
                    isRejected
                      ? 'bg-red-500'
                      : isDone
                        ? 'bg-emerald-500'
                        : isCurrent
                          ? 'bg-blue-500'
                          : 'bg-gray-300'
                  }`}
                >
                  {isRejected ? '✕' : isDone ? '✓' : step.step_order}
                </div>
                {getEmpName(step.approver_id)}
                <span className="text-[9px] opacity-70">({ROLE_LABELS[step.approver_role] || step.approver_role})</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  /* ── Render ── */

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">전자 결재</h1>
          <p className="text-sm text-gray-500 mt-0.5">결재 요청을 관리하고 승인/반려 처리합니다</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowDelegationDialog(true)}>
            결재 위임
          </Button>
          <Button onClick={() => setShowNewDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> 새 결재 신청
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Send className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-gray-500">내가 신청한 결재</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{stats.myRequests}건</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-[11px] text-gray-500">내가 결재할 문서</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{stats.pendingApproval}건</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] text-gray-500">완료된 결재</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{stats.completed}건</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {([
            { key: 'my_requests' as TabKey, label: '내 신청', count: stats.myRequests },
            { key: 'pending_approval' as TabKey, label: '결재 대기', count: stats.pendingApproval },
            ...(isAdmin ? [{ key: 'all' as TabKey, label: '전체', count: documents.length }] : []),
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label} {count > 0 && <span className="ml-1 text-[10px]">({count})</span>}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="제목, 문서번호, 신청자 검색..."
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-full sm:w-60 focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      {/* Document List */}
      <div className="space-y-2">
        {filteredDocuments.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400 text-sm">
              해당 조건의 결재 건이 없습니다
            </CardContent>
          </Card>
        ) : (
          filteredDocuments.map((doc) => {
            const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.submitted
            const steps = stepsMap[doc.id] || []
            const currentStepData = steps.find((s) => s.step_order === doc.current_step)
            const isMyTurn =
              currentStepData?.approver_id === profile?.id &&
              currentStepData?.action === 'pending' &&
              (doc.status === 'submitted' || doc.status === 'in_review')

            return (
              <Card
                key={doc.id}
                className={`border-l-4 ${cfg.border} cursor-pointer hover:shadow-md transition-shadow ${
                  isMyTurn ? 'ring-2 ring-blue-200 bg-blue-50/20' : ''
                }`}
                onClick={() => setSelectedDoc(doc)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{getDocTypeIcon(doc.doc_type)}</span>
                        <span className="font-semibold text-gray-900 truncate">{doc.title}</span>
                        <Badge variant={cfg.badge} className="text-[10px] shrink-0">{cfg.label}</Badge>
                        {isMyTurn && (
                          <Badge variant="info" className="text-[10px] shrink-0 animate-pulse">내 차례</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        {doc.doc_number && (
                          <span className="font-mono text-[10px] text-gray-400">{doc.doc_number}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {getEmpName(doc.requester_id)}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileCheck className="h-3 w-3" />
                          {getDocTypeLabel(doc.doc_type)}
                        </span>
                        {doc.amount != null && (
                          <span className="font-medium text-gray-700">{fmtAmount(doc.amount)}</span>
                        )}
                        <span>{fmtDate(doc.created_at)}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  </div>
                  {/* Step pills */}
                  {renderStepPills(doc.id, doc)}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* ── Detail Dialog ── */}
      <Dialog
        open={!!selectedDoc}
        onClose={() => { setSelectedDoc(null); setActionComment('') }}
        title="결재 상세"
        className="max-w-[calc(100vw-2rem)] sm:max-w-lg"
      >
        {selectedDoc && (() => {
          const doc = selectedDoc
          const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.submitted
          const steps = stepsMap[doc.id] || []
          const currentStepData = steps.find((s) => s.step_order === doc.current_step)
          const isMyTurn =
            currentStepData?.approver_id === profile?.id &&
            currentStepData?.action === 'pending' &&
            (doc.status === 'submitted' || doc.status === 'in_review')

          return (
            <div className="space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Title + Status */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span>{getDocTypeIcon(doc.doc_type)}</span>
                  <h3 className="text-base font-bold text-gray-900">{doc.title}</h3>
                  <Badge variant={cfg.badge}>{cfg.label}</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                  {doc.doc_number && (
                    <span className="font-mono text-gray-400">{doc.doc_number}</span>
                  )}
                  <span>신청자: {getEmpName(doc.requester_id)}</span>
                  {doc.department && <span>부서: {doc.department}</span>}
                  <span>유형: {getDocTypeLabel(doc.doc_type)}</span>
                  <span>신청일: {doc.submitted_at ? fmtDate(doc.submitted_at) : fmtDate(doc.created_at)}</span>
                  {doc.completed_at && <span>완료일: {fmtDate(doc.completed_at)}</span>}
                </div>
              </div>

              {/* PDF Download — approved documents only */}
              {doc.status === 'approved' && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadPDF(doc)}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    PDF 다운로드
                  </Button>
                </div>
              )}

              {/* Amount */}
              {doc.amount != null && (
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-amber-600 mb-1">금액</p>
                  <p className="text-lg font-bold text-amber-700">{fmtAmount(doc.amount)}</p>
                </div>
              )}

              {/* Content */}
              {doc.content && Object.keys(doc.content).length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 mb-2">신청 내용</p>
                  {Object.entries(doc.content).map(([key, value]) => (
                    <div key={key} className="flex text-sm">
                      <span className="text-gray-500 w-28 shrink-0">{key}</span>
                      <span className="text-gray-900">{String(value)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Attachments */}
              {doc.attachments && doc.attachments.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">첨부파일</p>
                  <div className="flex flex-wrap gap-2">
                    {doc.attachments.map((url, idx) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded"
                      >
                        <Paperclip className="h-3 w-3" />
                        첨부 {idx + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Approval Timeline */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-3">
                  결재 흐름 ({doc.current_step}/{doc.total_steps}단계)
                </p>
                {renderStepPills(doc.id, doc)}

                {/* Detailed step history */}
                {steps.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {steps.map((step) => {
                      const stepCfg =
                        step.action === 'approved' ? { badge: 'success' as const, label: '승인' } :
                        step.action === 'rejected' ? { badge: 'danger' as const, label: '반려' } :
                        { badge: 'default' as const, label: '대기' }
                      return (
                        <div key={step.id} className="flex items-start gap-2 text-sm">
                          <Badge variant={stepCfg.badge} className="text-[10px] mt-0.5 shrink-0">
                            {step.step_order}. {stepCfg.label}
                          </Badge>
                          <div className="min-w-0">
                            <span className="text-gray-700">
                              {getEmpName(step.approver_id)}
                              <span className="text-[10px] text-gray-400 ml-1">
                                ({ROLE_LABELS[step.approver_role] || step.approver_role})
                              </span>
                            </span>
                            {step.comment && (
                              <p className="text-xs text-gray-500 mt-0.5">{step.comment}</p>
                            )}
                            {step.acted_at && (
                              <p className="text-[10px] text-gray-400">{fmtDate(step.acted_at)}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Action Area */}
              {isMyTurn && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <Textarea
                    label="의견 (선택)"
                    value={actionComment}
                    onChange={(e) => setActionComment(e.target.value)}
                    placeholder="승인/반려 의견을 입력하세요"
                    rows={2}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={processing}
                      onClick={() => handleApprovalAction(doc.id, 'rejected')}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      반려
                    </Button>
                    <Button
                      size="sm"
                      disabled={processing}
                      onClick={() => handleApprovalAction(doc.id, 'approved')}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      {processing ? '처리중...' : '승인'}
                    </Button>
                  </div>
                </div>
              )}

              {/* 반려된 문서 → 본인이 신청자면 재상신 가능 */}
              {doc.status === 'rejected' && doc.requester_id === profile?.id && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700 mb-2">이 결재가 반려되었습니다. 내용을 확인 후 재상신할 수 있습니다.</p>
                  <Button size="sm" onClick={() => handleResubmit(doc.id)} disabled={processing}>
                    {processing ? '처리중...' : '재상신'}
                  </Button>
                </div>
              )}
            </div>
          )
        })()}
      </Dialog>

      {/* ── 결재 위임 Dialog ── */}
      <Dialog
        open={showDelegationDialog}
        onClose={() => setShowDelegationDialog(false)}
        title="결재 위임 설정"
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            부재 시 본인의 결재 권한을 다른 직원에게 위임합니다. 위임 기간 동안 대리 결재자가 승인/반려할 수 있습니다.
          </div>
          <Select
            label="대리 결재자 *"
            value={delegateToId}
            onChange={(e) => setDelegateToId(e.target.value)}
            options={[
              { value: '', label: '선택하세요' },
              ...allEmployees.filter((e) => e.id !== profile?.id).map((e) => ({ value: e.id, label: `${e.name} (${e.position || e.role})` })),
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="위임 시작일 *" type="date" value={delegationStart} onChange={(e) => setDelegationStart(e.target.value)} />
            <Input label="위임 종료일 *" type="date" value={delegationEnd} onChange={(e) => setDelegationEnd(e.target.value)} />
          </div>
          <Input label="위임 사유" value={delegationReason} onChange={(e) => setDelegationReason(e.target.value)} placeholder="출장, 휴가 등" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDelegationDialog(false)}>취소</Button>
            <Button onClick={handleSaveDelegation} disabled={saving}>
              {saving ? '처리중...' : '위임 등록'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── New Document Dialog ── */}
      <Dialog
        open={showNewDialog}
        onClose={() => { setShowNewDialog(false); resetNewForm() }}
        title="새 결재 신청"
        className="max-w-[calc(100vw-2rem)] sm:max-w-lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Step 1: Doc type selection */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">결재 유형 *</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(DOC_TYPE_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setNewDocType(key)
                    setNewApprovers({})
                    // Auto-assign CEO if template has ceo role
                    const tpl = templates.find((t) => t.doc_type === key)
                    if (tpl && ceo) {
                      const ceoStep = tpl.steps.find((s) => s.role === 'ceo')
                      if (ceoStep) {
                        setNewApprovers((prev) => ({ ...prev, ceo: ceo.id }))
                      }
                    }
                  }}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-left text-sm transition-colors ${
                    newDocType === key
                      ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="text-lg">{cfg.icon}</span>
                  <span className="font-medium">{cfg.label}</span>
                </button>
              ))}
            </div>
          </div>

          {newDocType && (
            <>
              {/* Title */}
              <Input
                label="제목 *"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="결재 제목을 입력하세요"
              />

              {/* Amount field for expense/purchase types */}
              {hasAmount && (
                <Input
                  label="금액 (원) *"
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="금액을 입력하세요"
                />
              )}

              {/* Content fields based on doc type */}
              <div className="space-y-3 bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500">상세 내용</p>
                {newDocType === 'leave' && (
                  <>
                    <Select
                      label="유형"
                      value={newContent.leave_type || ''}
                      onChange={(e) => setNewContent((p) => ({ ...p, leave_type: e.target.value }))}
                      options={[
                        { value: '', label: '선택' },
                        { value: '연차', label: '연차' },
                        { value: '반차(오전)', label: '반차(오전)' },
                        { value: '반차(오후)', label: '반차(오후)' },
                        { value: '조퇴', label: '조퇴' },
                      ]}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="시작일" type="date" value={newContent.start_date || ''} onChange={(e) => setNewContent((p) => ({ ...p, start_date: e.target.value }))} />
                      <Input label="종료일" type="date" value={newContent.end_date || ''} onChange={(e) => setNewContent((p) => ({ ...p, end_date: e.target.value }))} />
                    </div>
                    <Input label="사유" value={newContent.reason || ''} onChange={(e) => setNewContent((p) => ({ ...p, reason: e.target.value }))} placeholder="사유를 입력하세요" />
                  </>
                )}
                {newDocType === 'overtime' && (
                  <>
                    <Select
                      label="근무 유형"
                      value={newContent.overtime_type || ''}
                      onChange={(e) => setNewContent((p) => ({ ...p, overtime_type: e.target.value }))}
                      options={[
                        { value: '', label: '선택' },
                        { value: '연장근무', label: '연장근무' },
                        { value: '야간근무', label: '야간근무' },
                        { value: '휴일근무', label: '휴일근무' },
                      ]}
                    />
                    <Input label="근무일" type="date" value={newContent.work_date || ''} onChange={(e) => setNewContent((p) => ({ ...p, work_date: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="시작 시간" type="time" value={newContent.start_time || ''} onChange={(e) => setNewContent((p) => ({ ...p, start_time: e.target.value }))} />
                      <Input label="종료 시간" type="time" value={newContent.end_time || ''} onChange={(e) => setNewContent((p) => ({ ...p, end_time: e.target.value }))} />
                    </div>
                    <Input label="사유" value={newContent.reason || ''} onChange={(e) => setNewContent((p) => ({ ...p, reason: e.target.value }))} placeholder="사유를 입력하세요" />
                  </>
                )}
                {newDocType === 'expense' && (
                  <>
                    <Input label="사용 일자" type="date" value={newContent.expense_date || ''} onChange={(e) => setNewContent((p) => ({ ...p, expense_date: e.target.value }))} />
                    <Input label="사용 내역" value={newContent.description || ''} onChange={(e) => setNewContent((p) => ({ ...p, description: e.target.value }))} placeholder="사용 내역을 입력하세요" />
                    <Select
                      label="분류"
                      value={newContent.category || ''}
                      onChange={(e) => setNewContent((p) => ({ ...p, category: e.target.value }))}
                      options={[
                        { value: '', label: '선택' },
                        { value: '교통비', label: '교통비' },
                        { value: '식비', label: '식비' },
                        { value: '접대비', label: '접대비' },
                        { value: '소모품', label: '소모품' },
                        { value: '기타', label: '기타' },
                      ]}
                    />
                  </>
                )}
                {newDocType === 'business_trip' && (
                  <>
                    <Input label="출장지" value={newContent.destination || ''} onChange={(e) => setNewContent((p) => ({ ...p, destination: e.target.value }))} placeholder="출장지를 입력하세요" />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="출발일" type="date" value={newContent.start_date || ''} onChange={(e) => setNewContent((p) => ({ ...p, start_date: e.target.value }))} />
                      <Input label="복귀일" type="date" value={newContent.end_date || ''} onChange={(e) => setNewContent((p) => ({ ...p, end_date: e.target.value }))} />
                    </div>
                    <Input label="출장 목적" value={newContent.purpose || ''} onChange={(e) => setNewContent((p) => ({ ...p, purpose: e.target.value }))} placeholder="출장 목적을 입력하세요" />
                  </>
                )}
                {newDocType === 'purchase' && (
                  <>
                    <Input label="품목" value={newContent.item_name || ''} onChange={(e) => setNewContent((p) => ({ ...p, item_name: e.target.value }))} placeholder="구매 품목을 입력하세요" />
                    <Input label="수량" type="number" value={newContent.quantity || ''} onChange={(e) => setNewContent((p) => ({ ...p, quantity: e.target.value }))} />
                    <Input label="구매 사유" value={newContent.reason || ''} onChange={(e) => setNewContent((p) => ({ ...p, reason: e.target.value }))} placeholder="구매 사유를 입력하세요" />
                  </>
                )}
                {newDocType === 'general' && (
                  <Textarea
                    label="내용"
                    value={newContent.body || ''}
                    onChange={(e) => setNewContent((p) => ({ ...p, body: e.target.value }))}
                    placeholder="결재 내용을 입력하세요"
                    rows={4}
                  />
                )}
              </div>

              {/* Approval line setup */}
              <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                <h4 className="text-sm font-bold text-gray-700">결재라인 설정</h4>

                {/* Flow preview */}
                {selectedTemplate && (
                  <div className="flex items-center gap-1 text-[11px] text-gray-500 flex-wrap">
                    <span className="px-2 py-1 bg-white rounded-full border border-gray-200 font-medium text-gray-700">본인</span>
                    {selectedTemplate.steps.map((step, idx) => {
                      const roleLabel = ROLE_LABELS[step.role] || step.label
                      const colors: Record<string, string> = {
                        leader: 'bg-blue-50 border-blue-200 text-blue-700',
                        executive: 'bg-violet-50 border-violet-200 text-violet-700',
                        ceo: 'bg-amber-50 border-amber-200 text-amber-700',
                        hr_admin: 'bg-emerald-50 border-emerald-200 text-emerald-700',
                      }
                      return (
                        <span key={idx} className="flex items-center gap-1">
                          <ChevronRight className="h-3 w-3 text-gray-300" />
                          <span className={`px-2 py-1 rounded-full border font-medium ${colors[step.role] || 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                            {roleLabel}
                          </span>
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Approver selects */}
                {selectedTemplate ? (
                  selectedTemplate.steps.map((step) => {
                    const roleLabel = ROLE_LABELS[step.role] || step.label
                    if (step.role === 'ceo' && ceo) {
                      return (
                        <div key={step.role} className="text-xs text-gray-500">
                          최종 결재: <span className="font-medium text-gray-700">{ceo.name}</span> (대표)
                        </div>
                      )
                    }
                    const options = getApproverOptions(step.role)
                    return (
                      <Select
                        key={step.role}
                        label={`${roleLabel} 결재자 *`}
                        value={newApprovers[step.role] || ''}
                        onChange={(e) => setNewApprovers((prev) => ({ ...prev, [step.role]: e.target.value }))}
                        options={[
                          { value: '', label: `${roleLabel}를 선택하세요` },
                          ...options,
                        ]}
                      />
                    )
                  })
                ) : (
                  <p className="text-xs text-gray-400">결재 유형을 선택하면 결재라인이 자동으로 설정됩니다.</p>
                )}

                {!selectedTemplate && newDocType && (
                  <div className="text-xs text-amber-600 bg-amber-50 rounded p-2">
                    이 유형에 대한 결재 양식이 아직 등록되지 않았습니다. 관리자에게 문의하세요.
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setShowNewDialog(false); resetNewForm() }}>취소</Button>
                <Button onClick={handleCreateDocument} disabled={saving || !selectedTemplate}>
                  {saving ? '처리중...' : '신청'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  )
}
