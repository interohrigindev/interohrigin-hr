import { useState, useEffect, useMemo } from 'react'
import {
  FileCheck, Clock, CheckCircle, XCircle,
  Plus, Search, ChevronRight, User,
  Send, Paperclip, Download,
} from 'lucide-react'
import jsPDF from 'jspdf'
import { registerKoreanFonts } from '@/lib/pdf-fonts'
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

interface Department { id: string; name: string; parent_id?: string | null }

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

type TabKey = 'my_requests' | 'pending_approval' | 'all' | 'template_manage'

const DOC_TYPE_CONFIG: Record<string, { label: string; icon: string; hasAmount: boolean; category: string; desc?: string }> = {
  leave:         { label: '연차/반차/조퇴 신청', icon: '🗓', hasAmount: false, category: '근태', desc: '연차·반차·조퇴' },
  overtime:      { label: '연장/야간/휴일 근무', icon: '🌙', hasAmount: false, category: '근태', desc: '추가 근무 승인' },
  business_trip: { label: '출장 신청',           icon: '✈', hasAmount: false, category: '근태', desc: '국내·해외 출장' },
  expense:       { label: '경비 청구',           icon: '💰', hasAmount: true,  category: '비용', desc: '사용 경비 정산' },
  purchase:      { label: '구매 요청',           icon: '🛒', hasAmount: true,  category: '비용', desc: '자재·기기 구매' },
  daily_report:  { label: '일일 업무보고',       icon: '📝', hasAmount: false, category: '업무', desc: '일일 보고서 결재' },
  general:       { label: '일반 결재',           icon: '📄', hasAmount: false, category: '기타', desc: '자유 양식' },
}

const DOC_TYPE_CATEGORIES = ['근태', '비용', '업무', '기타'] as const

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
  const [filterDept, setFilterDept] = useState<string>('') // 부서별 필터

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
        .select('id, name, parent_id')
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

  // Get the matching template for a doc_type + amount condition
  // 복수 조건 분기 시 가장 "구체적인(specific)" 조건을 우선 (C8 잔여 리스크 2 해소)
  const getTemplateForDocType = (docType: string, amount?: number | null) => {
    const candidates = templates.filter((t) => t.doc_type === docType && t.is_active !== false)

    const conditional = candidates.filter(t => t.condition_field && t.condition_operator && t.condition_value)
    if (amount != null && conditional.length > 0) {
      // Specificity score: 큰 threshold의 >=/> 또는 작은 threshold의 <=/< 가 더 좁은 범위 = 우선순위 ↑
      const scored = conditional
        .map((tmpl) => {
          const threshold = parseFloat(tmpl.condition_value || '0')
          if (isNaN(threshold)) return null
          const op = tmpl.condition_operator || ''
          const matches =
            (op === '>=' && amount >= threshold) ||
            (op === '>' && amount > threshold) ||
            (op === '<=' && amount <= threshold) ||
            (op === '<' && amount < threshold) ||
            (op === '=' && amount === threshold)
          if (!matches) return null
          // specificity: `=`은 최고, `>=/>`는 threshold가 클수록, `<=/<`는 작을수록 구체적
          let specificity = 0
          if (op === '=') specificity = Number.MAX_SAFE_INTEGER
          else if (op === '>=' || op === '>') specificity = threshold
          else if (op === '<=' || op === '<') specificity = -threshold
          return { tmpl, specificity }
        })
        .filter((x): x is { tmpl: typeof conditional[number]; specificity: number } => x !== null)

      if (scored.length > 0) {
        scored.sort((a, b) => b.specificity - a.specificity)
        return scored[0].tmpl
      }
    }

    // 조건 없는 기본 템플릿
    const defaultTmpl = candidates.find(t => !t.condition_field)
    if (defaultTmpl) return defaultTmpl

    return candidates[0]
  }

  const getApproverOptions = (role: string) => {
    if (role === 'ceo') return ceo ? [{ value: ceo.id, label: `${ceo.name} (대표)` }] : []
    if (role === 'executive') return executives.map((e) => ({ value: e.id, label: `${e.name} (${e.position || e.role})` }))
    if (role === 'leader') return leaders.map((e) => ({ value: e.id, label: `${e.name} (${e.position || e.role})` }))
    return allEmployees.filter((e) => e.id !== profile?.id).map((e) => ({ value: e.id, label: `${e.name} (${e.position || e.role || ''})` }))
  }

  /* ── PDF Download ── */

  async function handleDownloadPDF(doc: ApprovalDocument) {
    try {
    const pdf = new jsPDF()
    const steps = stepsMap[doc.id] || []

    // 한글 폰트 등록 (3초 타임아웃)
    let hasKorean = false
    try {
      const fontPromise = registerKoreanFonts(pdf)
      const timeout = new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      hasKorean = await Promise.race([fontPromise, timeout])
    } catch { /* 폰트 로딩 실패/타임아웃 → helvetica 폴백 */ }
    const fontFamily = hasKorean ? 'NanumGothic' : 'helvetica'

    function setFont(style: 'normal' | 'bold' = 'normal') {
      pdf.setFont(fontFamily, style)
    }

    // Title
    pdf.setFontSize(18)
    setFont('bold')
    pdf.text('전자결재 문서', 105, 20, { align: 'center' })

    // Horizontal line
    pdf.setDrawColor(0)
    pdf.setLineWidth(0.5)
    pdf.line(20, 25, 190, 25)

    // Document info
    pdf.setFontSize(10)
    let y = 35

    setFont('bold')
    pdf.text('문서번호:', 20, y)
    setFont('normal')
    pdf.text(doc.doc_number || '-', 55, y)
    y += 8

    setFont('bold')
    pdf.text('제목:', 20, y)
    setFont('normal')
    pdf.text(doc.title, 55, y)
    y += 8

    setFont('bold')
    pdf.text('유형:', 20, y)
    setFont('normal')
    pdf.text(getDocTypeLabel(doc.doc_type), 55, y)
    y += 8

    setFont('bold')
    pdf.text('기안자:', 20, y)
    setFont('normal')
    pdf.text(getEmpName(doc.requester_id), 55, y)
    y += 8

    if (doc.department) {
      setFont('bold')
      pdf.text('부서:', 20, y)
      setFont('normal')
      pdf.text(doc.department, 55, y)
      y += 8
    }

    setFont('bold')
    pdf.text('제출일:', 20, y)
    setFont('normal')
    pdf.text(doc.submitted_at ? fmtDate(doc.submitted_at) : fmtDate(doc.created_at), 55, y)
    y += 8

    if (doc.completed_at) {
      setFont('bold')
      pdf.text('완료일:', 20, y)
      setFont('normal')
      pdf.text(fmtDate(doc.completed_at), 55, y)
      y += 8
    }

    setFont('bold')
    pdf.text('상태:', 20, y)
    setFont('normal')
    const statusLabel = STATUS_CONFIG[doc.status]?.label || doc.status
    pdf.text(statusLabel, 55, y)
    y += 8

    if (doc.amount != null) {
      setFont('bold')
      pdf.text('금액:', 20, y)
      setFont('normal')
      pdf.text(fmtAmount(doc.amount), 55, y)
      y += 8
    }

    // Content section
    if (doc.content && Object.keys(doc.content).length > 0) {
      y += 5
      pdf.setDrawColor(200)
      pdf.line(20, y, 190, y)
      y += 8

      pdf.setFontSize(12)
      setFont('bold')
      pdf.text('내용', 20, y)
      y += 8

      pdf.setFontSize(10)
      setFont('normal')
      for (const [key, value] of Object.entries(doc.content)) {
        setFont('bold')
        pdf.text(`${key}:`, 25, y)
        setFont('normal')
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
    setFont('bold')
    pdf.text(`결재 현황 (${doc.current_step}/${doc.total_steps})`, 20, y)
    y += 8

    pdf.setFontSize(10)
    for (const step of steps) {
      if (y > 270) {
        pdf.addPage()
        y = 20
      }

      const actionLabel =
        step.action === 'approved' ? '승인' :
        step.action === 'rejected' ? '반려' :
        '대기'
      const roleLabel = ROLE_LABELS[step.approver_role] || step.approver_role

      setFont('bold')
      pdf.text(`${step.step_order}단계:`, 25, y)
      setFont('normal')
      pdf.text(`${getEmpName(step.approver_id)} (${roleLabel}) - ${actionLabel}`, 55, y)
      y += 6

      if (step.comment) {
        setFont('normal')
        pdf.text(`의견: ${step.comment}`, 55, y)
        y += 6
      }

      if (step.acted_at) {
        pdf.text(`일시: ${fmtDate(step.acted_at)}`, 55, y)
        y += 6
      }

      y += 2
    }

    pdf.save(`approval_${doc.doc_number || doc.id}.pdf`)
    } catch (err) {
      console.error('PDF 생성 실패:', err)
      alert('PDF 다운로드에 실패했습니다. 다시 시도해주세요.')
    }
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
    // 부서 필터 — 본부 선택 시 하위 팀도 포함
    if (filterDept) {
      const selectedDept = (departments as Department[]).find(dep => dep.name === filterDept)
      let allowedDeptIds: Set<string> = new Set()
      if (selectedDept) {
        allowedDeptIds.add(selectedDept.id)
        if (!selectedDept.parent_id) {
          // 본부 → 하위 팀 모두 포함
          ;(departments as Department[]).filter(d => d.parent_id === selectedDept.id).forEach(t => allowedDeptIds.add(t.id))
        }
      }
      result = result.filter((d) => {
        const emp = allEmployees.find((e) => e.id === d.requester_id)
        return emp?.department_id && allowedDeptIds.has(emp.department_id)
      })
    }
    return result
  }, [documents, activeTab, searchQuery, stepsMap, profile?.id, filterDept, allEmployees, departments])

  /* ── Approval Actions ── */

  async function handleApprovalAction(docId: string, action: 'approved' | 'rejected') {
    if (!profile?.id) return
    setProcessing(true)

    const doc = documents.find((d) => d.id === docId)
    if (!doc) { setProcessing(false); return }

    const steps = stepsMap[docId] || []
    const currentStepData = steps.find((s) => s.step_order === doc.current_step)

    // C-2: 위임 결재 체크 — 현재 결재자가 본인이 아닌 경우 위임 확인
    let isDelegated = false
    let originalApproverId: string | null = null

    if (currentStepData && currentStepData.approver_id !== profile.id) {
      // 위임받은 결재인지 확인
      const { data: delegation } = await supabase
        .from('approval_delegations')
        .select('*')
        .eq('delegator_id', currentStepData.approver_id)
        .eq('delegate_id', profile.id)
        .eq('is_active', true)
        .gte('end_date', new Date().toISOString().split('T')[0])
        .lte('start_date', new Date().toISOString().split('T')[0])
        .maybeSingle()

      if (!delegation) {
        toast('현재 결재 차례가 아닙니다', 'error')
        setProcessing(false)
        return
      }
      isDelegated = true
      originalApproverId = currentStepData.approver_id
    }

    // 현재 스텝 승인/반려
    const { error: stepErr } = await supabase
      .from('approval_steps')
      .update({
        action,
        comment: actionComment || null,
        acted_at: new Date().toISOString(),
        is_delegated: isDelegated,
        original_approver_id: isDelegated ? originalApproverId : null,
      })
      .eq('id', currentStepData!.id)

    if (stepErr) {
      toast('처리 실패: ' + stepErr.message, 'error')
      setProcessing(false)
      return
    }

    if (action === 'rejected') {
      await supabase
        .from('approval_documents')
        .update({
          status: 'rejected',
          completed_at: new Date().toISOString(),
        })
        .eq('id', docId)
      toast('반려 처리되었습니다', 'success')
    } else {
      // C-2: 전결 처리 — 위임받은 임원이 자신의 스텝도 함께 승인
      let nextStepToProcess = doc.current_step + 1
      if (isDelegated && action === 'approved') {
        // 위임자의 스텝을 승인했으니, 본인의 스텝이 다음에 있으면 자동 승인
        const myStep = steps.find((s) => s.step_order === nextStepToProcess && s.approver_id === profile.id)
        if (myStep) {
          await supabase
            .from('approval_steps')
            .update({
              action: 'approved',
              comment: '전결 처리 (위임 결재와 동시 승인)',
              acted_at: new Date().toISOString(),
            })
            .eq('id', myStep.id)
          nextStepToProcess = nextStepToProcess + 1
        }
      }

      if (nextStepToProcess > doc.total_steps) {
        // 최종 승인
        await supabase
          .from('approval_documents')
          .update({
            status: 'approved',
            completed_at: new Date().toISOString(),
          })
          .eq('id', docId)
        toast(isDelegated ? '전결 처리로 최종 승인 완료' : '최종 승인 완료', 'success')
      } else {
        // 다음 결재자로 이동
        await supabase
          .from('approval_documents')
          .update({
            status: 'in_review',
            current_step: nextStepToProcess,
          })
          .eq('id', docId)
        const nextStep = steps.find((s) => s.step_order === nextStepToProcess)
        const nextName = nextStep ? getEmpName(nextStep.approver_id) : ''
        toast(`승인 완료. 다음 결재자(${nextName})에게 전달되었습니다.`, 'success')
      }
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

  const hasAmount = DOC_TYPE_CONFIG[newDocType]?.hasAmount || false
  const parsedAmount = hasAmount && newAmount ? parseInt(newAmount, 10) : null
  const selectedTemplate = newDocType ? getTemplateForDocType(newDocType, parsedAmount) : null

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
      for (let i = 0; i < selectedTemplate.steps.length; i++) {
        const step = selectedTemplate.steps[i]
        const stepKey = `${step.role}__${i}`
        const approverIds = (step as { approver_ids?: string[] }).approver_ids || []
        const hasTemplateDefault = approverIds.length > 0 || (step.role === 'ceo' && ceo)
        if (!newApprovers[stepKey] && !hasTemplateDefault) {
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
        const stepKey = `${step.role}__${idx}`
        const approverIds = (step as { approver_ids?: string[] }).approver_ids || []
        // 우선순위: 사용자 선택값 → 템플릿 지정 직원 첫 번째 → CEO auto → role 기본값
        const approverId =
          newApprovers[stepKey] ||
          approverIds[0] ||
          (step.role === 'ceo' && ceo ? ceo.id : '') ||
          (getApproverOptions(step.role)[0]?.value || '')
        const actionType = (step as { action_type?: ActionType }).action_type || 'approve'
        return {
          document_id: docData.id,
          step_order: idx + 1,
          approver_id: approverId,
          approver_role: step.role,
          action_type: actionType,
          action: 'pending',
          comment: null,
          acted_at: null,
          is_delegated: false,
          original_approver_id: null,
        }
      })

      let { error: stepsErr } = await supabase
        .from('approval_steps')
        .insert(stepInserts)

      // 방어: action_type 컬럼이 아직 없는 DB에서 실패한 경우 해당 키 제거하고 재시도
      if (stepsErr && /action_type/i.test(stepsErr.message || '')) {
        const legacyInserts = stepInserts.map((s) => {
          const { action_type: _at, ...rest } = s as typeof s & { action_type?: string }
          return rest
        })
        const retry = await supabase.from('approval_steps').insert(legacyInserts)
        stepsErr = retry.error
        if (!stepsErr) {
          console.warn('[approval] action_type 컬럼 미적용 — 레거시 모드로 저장됨. migration 049_approval_step_action_type.sql 실행을 권장합니다.')
        }
      }

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
            ...(isAdmin ? [
              { key: 'all' as TabKey, label: '전체', count: documents.length },
              { key: 'template_manage' as TabKey, label: '결재선 관리', count: 0 },
            ] : []),
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

      {/* 부서별 탭 — 본부 1차 + 팀 2차 */}
      {activeTab !== 'template_manage' && isAdmin && (() => {
        const rootDepts = (departments as (Department & { parent_id?: string | null })[]).filter(d => !d.parent_id)
        if (rootDepts.length === 0) return null
        const selectedDept = (departments as (Department & { parent_id?: string | null })[]).find(d => d.name === filterDept)
        const rootDeptOfSelected = selectedDept?.parent_id
          ? (departments as (Department & { parent_id?: string | null })[]).find(d => d.id === selectedDept.parent_id)
          : selectedDept
        const teams = rootDeptOfSelected
          ? (departments as (Department & { parent_id?: string | null })[]).filter(d => d.parent_id === rootDeptOfSelected.id)
          : []
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap overflow-x-auto pb-1">
              <button
                onClick={() => setFilterDept('')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  !filterDept ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                전체
              </button>
              {rootDepts.map((d) => {
                const isSelected = filterDept === d.name || rootDeptOfSelected?.id === d.id
                return (
                  <button
                    key={d.id}
                    onClick={() => setFilterDept(d.name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {d.name}
                  </button>
                )
              })}
            </div>
            {rootDeptOfSelected && teams.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap overflow-x-auto pb-1 pl-4 border-l-2 border-blue-200">
                <button
                  onClick={() => setFilterDept(rootDeptOfSelected.name)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                    filterDept === rootDeptOfSelected.name ? 'bg-blue-400 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  본부 전체
                </button>
                {teams.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setFilterDept(t.name)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                      filterDept === t.name ? 'bg-blue-400 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* 결재선 관리 탭 */}
      {activeTab === 'template_manage' && (
        <ApprovalTemplateManager templates={templates} employees={allEmployees} onRefresh={fetchData} />
      )}

      {/* Document List */}
      {activeTab !== 'template_manage' && <div>
        {filteredDocuments.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400 text-sm">
              해당 조건의 결재 건이 없습니다
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredDocuments.map((doc) => {
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
                  <CardContent className="py-3 px-4 flex flex-col h-full">
                    {/* 상단: 아이콘 + 제목 + 상태 */}
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-lg shrink-0">{getDocTypeIcon(doc.doc_type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm line-clamp-2 leading-snug">{doc.title}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant={cfg.badge} className="text-[10px]">{cfg.label}</Badge>
                          {isMyTurn && <Badge variant="info" className="text-[10px] animate-pulse">내 차례</Badge>}
                        </div>
                      </div>
                    </div>

                    {/* 중간: 메타 정보 (세로) */}
                    <div className="space-y-1 text-xs text-gray-500 mb-2 flex-1">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="truncate">{getEmpName(doc.requester_id)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileCheck className="h-3 w-3 shrink-0" />
                        <span className="truncate">{getDocTypeLabel(doc.doc_type)}</span>
                      </div>
                      {doc.amount != null && (
                        <div className="flex items-center gap-1.5 text-gray-700 font-medium">
                          💰 {fmtAmount(doc.amount)}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400">{fmtDate(doc.created_at)}</div>
                    </div>

                    {/* 하단: Step pills */}
                    <div className="pt-2 border-t border-gray-100">
                      {renderStepPills(doc.id, doc)}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>}

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
              {doc.content && Object.keys(doc.content).length > 0 && (() => {
                // 일일 업무보고는 전용 UI로 렌더링 (doc_type 또는 content 구조로 감지)
                const c = doc.content as Record<string, unknown>
                const isDailyReport = doc.doc_type === 'daily_report'
                  || (c && ('report_id' in c || 'report_date' in c)
                      && (Array.isArray(c.completed) || Array.isArray(c.in_progress) || Array.isArray(c.planned)))
                if (isDailyReport) {
                  const content = doc.content as {
                    report_date?: string
                    completed?: { title: string }[]
                    in_progress?: { title: string }[]
                    planned?: { title: string }[]
                  }
                  return (
                    <div className="space-y-3">
                      <div className="bg-gradient-to-br from-brand-50 to-purple-50 border border-brand-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-brand-800 flex items-center gap-1.5">
                          📝 일일 업무보고 {content.report_date && <span className="text-brand-600">({content.report_date})</span>}
                        </p>
                      </div>

                      {/* 완료 업무 */}
                      {content.completed && content.completed.length > 0 && (
                        <div className="border border-emerald-200 rounded-lg overflow-hidden">
                          <div className="bg-emerald-50 px-3 py-2 border-b border-emerald-100">
                            <p className="text-xs font-semibold text-emerald-800">✅ 완료 업무 ({content.completed.length}건)</p>
                          </div>
                          <ul className="px-3 py-2 space-y-1 bg-white">
                            {content.completed.map((t, i) => (
                              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                <span className="text-emerald-500 mt-0.5">✓</span>
                                <span className="flex-1">{t.title}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 진행중 업무 */}
                      {content.in_progress && content.in_progress.length > 0 && (
                        <div className="border border-blue-200 rounded-lg overflow-hidden">
                          <div className="bg-blue-50 px-3 py-2 border-b border-blue-100">
                            <p className="text-xs font-semibold text-blue-800">🔄 진행중 업무 ({content.in_progress.length}건)</p>
                          </div>
                          <ul className="px-3 py-2 space-y-1 bg-white">
                            {content.in_progress.map((t, i) => (
                              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                <span className="text-blue-500 mt-0.5">▸</span>
                                <span className="flex-1">{t.title}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 내일 계획 */}
                      {content.planned && content.planned.length > 0 && (
                        <div className="border border-amber-200 rounded-lg overflow-hidden">
                          <div className="bg-amber-50 px-3 py-2 border-b border-amber-100">
                            <p className="text-xs font-semibold text-amber-800">📅 내일 계획 ({content.planned.length}건)</p>
                          </div>
                          <ul className="px-3 py-2 space-y-1 bg-white">
                            {content.planned.map((t, i) => (
                              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                <span className="text-amber-500 mt-0.5">☐</span>
                                <span className="flex-1">{t.title}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {(!content.completed || content.completed.length === 0) &&
                       (!content.in_progress || content.in_progress.length === 0) &&
                       (!content.planned || content.planned.length === 0) && (
                        <p className="text-sm text-gray-400 text-center py-4">작성된 업무가 없습니다</p>
                      )}
                    </div>
                  )
                }
                // 다른 양식은 기존 key-value 렌더링
                return (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                    <p className="text-xs font-medium text-gray-500 mb-2">신청 내용</p>
                    {Object.entries(doc.content).map(([key, value]) => {
                      const display = Array.isArray(value)
                        ? value.map((v) => typeof v === 'object' && v !== null
                            ? ((v as { title?: string; name?: string }).title || (v as { title?: string; name?: string }).name || JSON.stringify(v))
                            : String(v)).join(', ')
                        : typeof value === 'object' && value !== null
                          ? JSON.stringify(value)
                          : String(value)
                      return (
                        <div key={key} className="flex text-sm">
                          <span className="text-gray-500 w-28 shrink-0">{key}</span>
                          <span className="text-gray-900 flex-1 break-all">{display}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

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
                        <div key={step.id} className="flex items-start gap-2 text-sm border-l-2 pl-2" style={{ borderColor: step.action === 'approved' ? '#10b981' : step.action === 'rejected' ? '#ef4444' : '#d1d5db' }}>
                          <Badge variant={stepCfg.badge} className="text-[10px] mt-0.5 shrink-0">
                            {step.step_order}. {stepCfg.label}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-gray-700 font-medium">
                                {getEmpName(step.approver_id)}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                ({ROLE_LABELS[step.approver_role] || step.approver_role})
                              </span>
                              {step.acted_at && (
                                <span className="text-[10px] text-gray-400">· {fmtDate(step.acted_at)}</span>
                              )}
                            </div>
                            {step.comment && (
                              <div className="mt-1 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5 italic">
                                💬 {step.comment}
                              </div>
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
                <div className="space-y-3 pt-3 mt-2 border-t-2 border-brand-200 bg-brand-50/30 -mx-6 px-6 py-4">
                  <p className="text-sm font-bold text-brand-800">💬 결재자 코멘트</p>
                  <Textarea
                    label={doc.doc_type === 'daily_report' ? '업무보고 피드백 (권장)' : '의견 (선택)'}
                    value={actionComment}
                    onChange={(e) => setActionComment(e.target.value)}
                    placeholder={doc.doc_type === 'daily_report'
                      ? '업무 진행 사항에 대한 피드백, 추가 지시사항, 칭찬/격려 등을 입력하세요'
                      : '승인/반려 의견을 입력하세요'}
                    rows={doc.doc_type === 'daily_report' ? 4 : 2}
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

      {/* ── New Document Dialog ── 네이버웍스 Works Flow 런처 스타일 */}
      <Dialog
        open={showNewDialog}
        onClose={() => { setShowNewDialog(false); resetNewForm() }}
        title={newDocType ? `새 결재 신청 — ${DOC_TYPE_CONFIG[newDocType]?.label}` : '결재 양식 선택'}
        className="max-w-[calc(100vw-2rem)] sm:max-w-3xl"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Step 1: 런처 — 카테고리별 타일 그리드 */}
          {!newDocType && (
            <div className="space-y-5">
              <p className="text-sm text-gray-500">결재를 진행할 양식을 선택하세요</p>
              {DOC_TYPE_CATEGORIES.map((cat) => {
                const items = Object.entries(DOC_TYPE_CONFIG).filter(([, cfg]) => cfg.category === cat)
                if (items.length === 0) return null
                return (
                  <div key={cat}>
                    <p className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-2">
                      <span className="w-1 h-3 bg-brand-500 rounded-full" />
                      {cat}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                      {items.map(([key, cfg]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setNewDocType(key)
                            setNewApprovers({})
                            const tpl = templates.find((t) => t.doc_type === key)
                            if (tpl && ceo) {
                              const ceoStep = tpl.steps.find((s) => s.role === 'ceo')
                              if (ceoStep) setNewApprovers((prev) => ({ ...prev, ceo: ceo.id }))
                            }
                          }}
                          className="group flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-brand-400 hover:bg-brand-50 hover:shadow-sm transition-all text-center"
                        >
                          <span className="text-3xl transition-transform group-hover:scale-110">{cfg.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-gray-800 group-hover:text-brand-700">{cfg.label}</p>
                            {cfg.desc && <p className="text-[11px] text-gray-500 mt-0.5">{cfg.desc}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Step 2: 선택된 양식 — 헤더 배지 + 뒤로 가기 */}
          {newDocType && (
            <div className="flex items-center gap-3 pb-3 border-b">
              <button
                onClick={() => { setNewDocType(''); setNewApprovers({}) }}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                ← 양식 다시 선택
              </button>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-2xl">{DOC_TYPE_CONFIG[newDocType]?.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{DOC_TYPE_CONFIG[newDocType]?.label}</p>
                  <p className="text-[11px] text-gray-500">{DOC_TYPE_CONFIG[newDocType]?.desc}</p>
                </div>
              </div>
            </div>
          )}

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
                    placeholder="결재 내용을 상세히 입력하세요. 필요 시 첨부 파일은 하단에서 추가할 수 있습니다."
                    rows={10}
                    className="font-sans text-sm leading-relaxed"
                  />
                )}
              </div>

              {/* Approval line setup */}
              <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-gray-700">결재라인 설정</h4>
                  {selectedTemplate && (
                    <span className="text-[10px] text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                      📋 {selectedTemplate.name}
                    </span>
                  )}
                </div>

                {/* 금액 조건 매칭 안내 */}
                {hasAmount && parsedAmount != null && parsedAmount > 0 && (() => {
                  const allCandidates = templates.filter(t => t.doc_type === newDocType && t.is_active !== false)
                  const hasConditional = allCandidates.some(t => t.condition_field)
                  if (!hasConditional && parsedAmount >= 500000) {
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs">
                        <p className="text-amber-800 font-semibold mb-1">⚠️ 금액 조건 결재선이 없습니다</p>
                        <p className="text-amber-700">
                          {parsedAmount.toLocaleString()}원인데 금액 조건(예: 50만원 이상)이 설정된 결재선이 없어 기본 결재선이 적용됩니다.
                        </p>
                        <p className="text-amber-600 mt-1">
                          관리자는 <strong>전자결재 &gt; 결재선 관리</strong>에서 고액 결재선을 추가하세요.
                        </p>
                      </div>
                    )
                  }
                  return null
                })()}

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
                  <>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-600">결재라인 (자동 설정 · 변경 불가)</p>
                      {selectedTemplate.steps.map((step, idx) => {
                        const roleLabel = ROLE_LABELS[step.role] || step.label
                        const stepKey = `${step.role}__${idx}` // 단계 고유 key (같은 role 반복 대응)
                        const approverIds = (step as { approver_ids?: string[] }).approver_ids || []

                        // 1순위: 템플릿에 지정된 담당자 (관리자가 결재선 관리에서 설정)
                        // 2순위: role에 맞는 역할의 첫 번째 직원
                        let defaultApproverId = ''
                        if (approverIds.length > 0) {
                          defaultApproverId = approverIds[0]
                        } else if (step.role === 'ceo' && ceo) {
                          defaultApproverId = ceo.id
                        } else {
                          const options = getApproverOptions(step.role)
                          if (options.length > 0) defaultApproverId = options[0].value
                        }

                        // 자동 배정 (초기 렌더 시)
                        if (!newApprovers[stepKey] && defaultApproverId) {
                          setTimeout(() => setNewApprovers((prev) => ({ ...prev, [stepKey]: defaultApproverId })), 0)
                        }

                        const currentId = newApprovers[stepKey] || defaultApproverId
                        const selectedName = allEmployees.find((e) => e.id === currentId)?.name || roleLabel

                        // 선택 가능한 옵션: 템플릿 지정 직원 OR 역할 풀
                        const options = approverIds.length > 0
                          ? approverIds.map(id => {
                              const emp = allEmployees.find(e => e.id === id)
                              return emp ? { value: id, label: `${emp.name} (${emp.position || emp.role || ''})` } : null
                            }).filter(Boolean) as { value: string; label: string }[]
                          : getApproverOptions(step.role)

                        const specifiedNames = approverIds.map(id => allEmployees.find(e => e.id === id)?.name).filter(Boolean)

                        return (
                          <div key={stepKey} className="flex items-center gap-2 text-sm flex-wrap">
                            <span className="w-5 h-5 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</span>
                            <span className="text-gray-700">{selectedName}</span>
                            <span className="text-xs text-gray-400">({roleLabel})</span>
                            {specifiedNames.length > 0 ? (
                              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                ✓ 지정: {specifiedNames.join(', ')}
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                ⚠️ 담당자 미지정 (역할 기본값)
                              </span>
                            )}
                            {options.length > 1 && (
                              <select
                                value={currentId}
                                onChange={(e) => setNewApprovers((prev) => ({ ...prev, [stepKey]: e.target.value }))}
                                className="ml-auto text-xs border rounded px-2 py-1"
                              >
                                {options.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-xs text-gray-400">결재라인은 양식에 따라 자동 설정되며, 신청 후 변경할 수 없습니다.</p>
                  </>
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

/* ═══════════════════════════════════════════════════════════
   결재선 관리 컴포넌트 (관리자 전용)
   ═══════════════════════════════════════════════════════════ */

const ROLE_OPTIONS = [
  { value: 'leader', label: '팀장/리더' },
  { value: 'executive', label: '이사/임원' },
  { value: 'ceo', label: '대표' },
  { value: 'hr_admin', label: '인사/경영지원' },
  { value: 'finance', label: '재무회계' },
]

// 역할 → 자동 매칭할 직원 role 값 (참고용. 실제 UI는 모든 직원에서 선택)
const ROLE_EMPLOYEE_MATCH: Record<string, string[]> = {
  leader: ['leader'],
  executive: ['director', 'division_head'],
  ceo: ['ceo'],
  hr_admin: ['admin'],
  finance: ['admin'],
}

type ActionType = 'approve' | 'consult' | 'reference'
interface EditStep { role: string; label: string; approver_ids?: string[]; action_type?: ActionType }

const ACTION_TYPE_OPTIONS: { value: ActionType; label: string; desc: string; color: string }[] = [
  { value: 'approve',   label: '결재', desc: '승인/반려 권한',  color: 'bg-brand-100 text-brand-700 border-brand-300' },
  { value: 'consult',   label: '합의', desc: '동의 표시',        color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'reference', label: '참조', desc: '조회만 가능',       color: 'bg-gray-100 text-gray-600 border-gray-300' },
]

function ApprovalTemplateManager({
  templates,
  employees,
  onRefresh,
}: {
  templates: ApprovalTemplate[]
  employees: Employee[]
  onRefresh: () => void
}) {
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSteps, setEditSteps] = useState<EditStep[]>([])
  // 금액 조건 편집
  const [editCondField, setEditCondField] = useState<string | null>(null)
  const [editCondOp, setEditCondOp] = useState<string | null>(null)
  const [editCondVal, setEditCondVal] = useState<string | null>(null)

  function startEdit(tmpl: ApprovalTemplate) {
    setEditingId(tmpl.id)
    setEditSteps([...(tmpl.steps as EditStep[])])
    setEditCondField(tmpl.condition_field)
    setEditCondOp(tmpl.condition_operator)
    setEditCondVal(tmpl.condition_value)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditSteps([])
    setEditCondField(null); setEditCondOp(null); setEditCondVal(null)
  }

  async function saveEdit(tmplId: string) {
    const { error } = await supabase.from('approval_templates').update({
      steps: editSteps,
      condition_field: editCondField || null,
      condition_operator: editCondOp || null,
      condition_value: editCondVal || null,
    }).eq('id', tmplId)
    if (error) { toast('저장 실패: ' + error.message, 'error'); return }
    toast('결재선이 수정되었습니다.', 'success')
    setEditingId(null)
    onRefresh()
  }

  function addStep() {
    setEditSteps([...editSteps, { role: 'leader', label: '팀장', approver_ids: [], action_type: 'approve' }])
  }

  function removeStep(idx: number) {
    setEditSteps(editSteps.filter((_, i) => i !== idx))
  }

  function updateStep(idx: number, field: 'role' | 'label', value: string) {
    setEditSteps(editSteps.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  function toggleApprover(idx: number, empId: string) {
    setEditSteps(editSteps.map((s, i) => {
      if (i !== idx) return s
      const current = s.approver_ids || []
      const next = current.includes(empId)
        ? current.filter(id => id !== empId)
        : [...current, empId]
      return { ...s, approver_ids: next }
    }))
  }

  // 역할에 해당하는 직원 풀 — 추천 직원은 상단, 전체 직원은 검색으로
  function getRecommendedEmployees(role: string): Employee[] {
    const matchRoles = ROLE_EMPLOYEE_MATCH[role] || []
    if (matchRoles.length === 0) return employees
    return employees.filter(e => e.role && matchRoles.includes(e.role))
  }

  // 단계별 검색 쿼리 state (인덱스별 저장)
  const [stepSearches, setStepSearches] = useState<Record<number, string>>({})

  // 새 결재선 템플릿 추가
  const [showNewTemplate, setShowNewTemplate] = useState(false)
  const [newTmplDocType, setNewTmplDocType] = useState('general')
  const [newTmplName, setNewTmplName] = useState('')
  const [newTmplCondOp, setNewTmplCondOp] = useState('')
  const [newTmplCondVal, setNewTmplCondVal] = useState('')

  async function handleAddTemplate() {
    if (!newTmplName.trim() || !newTmplDocType) {
      toast('양식명을 입력하세요', 'error')
      return
    }
    const hasCondition = (newTmplDocType === 'expense' || newTmplDocType === 'purchase') && newTmplCondOp && newTmplCondVal
    const { data, error } = await supabase.from('approval_templates').insert({
      doc_type: newTmplDocType,
      name: newTmplName.trim(),
      steps: [{ role: 'leader', label: '팀장 승인', approver_ids: [], action_type: 'approve' }],
      is_active: true,
      condition_field: hasCondition ? 'amount' : null,
      condition_operator: hasCondition ? newTmplCondOp : null,
      condition_value: hasCondition ? newTmplCondVal : null,
    }).select().single()
    if (error) { toast('생성 실패: ' + error.message, 'error'); return }
    toast('결재선이 생성되었습니다.', 'success')
    setShowNewTemplate(false)
    setNewTmplName('')
    setNewTmplDocType('general')
    setNewTmplCondOp(''); setNewTmplCondVal('')
    onRefresh()
    // 생성 후 바로 편집 모드로
    if (data) setTimeout(() => startEdit(data as ApprovalTemplate), 300)
  }

  async function handleDeleteTemplate(tmplId: string, tmplName: string) {
    if (!confirm(`"${tmplName}" 결재선을 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('approval_templates').delete().eq('id', tmplId)
    if (error) { toast('삭제 실패: ' + error.message, 'error'); return }
    toast('결재선이 삭제되었습니다.', 'success')
    onRefresh()
  }

  // 양식별 이모지
  const typeIcon: Record<string, string> = {
    leave: '🗓', overtime: '🌙', expense: '💰', business_trip: '✈',
    general: '📄', purchase: '🛒', personnel: '👤', resign: '📋',
    expense_high: '💰', daily_report: '📝',
  }

  // C8-2: 카테고리 필터
  const [categoryFilter, setCategoryFilter] = useState<string>('전체')
  const categoriesInUse = Array.from(new Set(
    templates.map(t => DOC_TYPE_CONFIG[t.doc_type]?.category || '기타')
  ))
  const filteredTemplates = categoryFilter === '전체'
    ? templates
    : templates.filter(t => (DOC_TYPE_CONFIG[t.doc_type]?.category || '기타') === categoryFilter)

  const categoryCounts: Record<string, number> = { 전체: templates.length }
  templates.forEach(t => {
    const cat = DOC_TYPE_CONFIG[t.doc_type]?.category || '기타'
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-500">양식별 결재선 템플릿을 수정/추가할 수 있습니다.</p>
        <Button size="sm" onClick={() => setShowNewTemplate(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> 새 결재선 추가
        </Button>
      </div>

      {/* C8-2: 카테고리 탭 */}
      <div className="flex items-center gap-1.5 flex-wrap border-b border-gray-200">
        {['전체', ...DOC_TYPE_CATEGORIES.filter(c => categoriesInUse.includes(c) || c === '근태')].map((cat) => {
          const count = categoryCounts[cat] ?? 0
          const isActive = categoryFilter === cat
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                isActive
                  ? 'text-brand-700 border-brand-500'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {cat}
              <span className={`text-[10px] px-1.5 rounded-full ${isActive ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* 새 결재선 추가 다이얼로그 */}
      {showNewTemplate && (
        <Card className="border-brand-300 bg-brand-50/30">
          <CardContent className="py-4 space-y-3">
            <p className="text-sm font-semibold text-brand-800">새 결재선 템플릿 추가</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">양식 종류</label>
                <select
                  value={newTmplDocType}
                  onChange={(e) => setNewTmplDocType(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="general">일반 결재</option>
                  <option value="daily_report">📝 일일 업무보고</option>
                  <option value="leave">연차/휴가</option>
                  <option value="overtime">야간/휴일 근무</option>
                  <option value="expense">경비 청구</option>
                  <option value="business_trip">출장 신청</option>
                  <option value="purchase">구매 요청</option>
                  <option value="personnel">인사 결재</option>
                  <option value="resign">퇴사</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">템플릿 이름</label>
                <input
                  type="text"
                  value={newTmplName}
                  onChange={(e) => setNewTmplName(e.target.value)}
                  placeholder="예: 경비 청구 (50만원 미만)"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>

            {/* 금액 조건 (경비/구매) */}
            {(newTmplDocType === 'expense' || newTmplDocType === 'purchase') && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <label className="text-xs font-semibold text-amber-800 mb-1.5 block">💰 금액 조건 (선택)</label>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-gray-600">금액</span>
                  <select
                    value={newTmplCondOp}
                    onChange={(e) => setNewTmplCondOp(e.target.value)}
                    className="text-xs border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="">조건 없음</option>
                    <option value=">=">이상 (≥)</option>
                    <option value=">">초과 (&gt;)</option>
                    <option value="<">미만 (&lt;)</option>
                    <option value="<=">이하 (≤)</option>
                  </select>
                  {newTmplCondOp && (
                    <>
                      <input
                        type="number"
                        value={newTmplCondVal}
                        onChange={(e) => setNewTmplCondVal(e.target.value)}
                        placeholder="500000"
                        className="text-xs border border-gray-300 rounded px-2 py-1 w-28"
                      />
                      <span className="text-gray-600">원</span>
                    </>
                  )}
                </div>
                <p className="text-[10px] text-amber-600 mt-1">
                  예: "금액 ≥ 500000" = 50만원 이상 신청 시 이 결재선 자동 적용
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowNewTemplate(false); setNewTmplName(''); setNewTmplCondOp(''); setNewTmplCondVal('') }}>취소</Button>
              <Button size="sm" onClick={handleAddTemplate}>생성</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 타일링 그리드 (2열) */}
      {filteredTemplates.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-400">
          {categoryFilter === '전체'
            ? '등록된 결재선이 없습니다. "새 결재선 추가" 버튼으로 시작하세요.'
            : `"${categoryFilter}" 카테고리에 결재선이 없습니다.`}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredTemplates.map((tmpl) => {
          const isEditing = editingId === tmpl.id

          return (
            <Card key={tmpl.id} className={isEditing ? 'ring-2 ring-brand-400' : ''}>
              <CardContent className="py-4">
                {/* 헤더 */}
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="text-xl">{typeIcon[tmpl.doc_type] || '📋'}</span>
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{tmpl.name}</h3>
                    <Badge variant={tmpl.is_active ? 'success' : 'default'} className="text-[10px]">
                      {tmpl.is_active ? '활성' : '비활성'}
                    </Badge>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {isEditing ? (
                      <>
                        <Button size="sm" onClick={() => saveEdit(tmpl.id)}>저장</Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>취소</Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteTemplate(tmpl.id, tmpl.name)} className="text-red-500 hover:bg-red-50">🗑 삭제</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => startEdit(tmpl)}>수정</Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteTemplate(tmpl.id, tmpl.name)} className="text-red-500 hover:bg-red-50">🗑 삭제</Button>
                      </>
                    )}
                  </div>
                </div>

                {tmpl.condition_field ? (
                  <div className="mb-2">
                    <Badge variant="info" className="text-[10px]">
                      조건: {tmpl.condition_field} {tmpl.condition_operator} {Number(tmpl.condition_value).toLocaleString()}원
                    </Badge>
                  </div>
                ) : (tmpl.doc_type === 'expense' || tmpl.doc_type === 'purchase') && templates.filter(t => t.doc_type === tmpl.doc_type).length > 1 && !isEditing ? (
                  <div className="mb-2">
                    <Badge variant="warning" className="text-[10px]">
                      ⚠️ 금액 조건 미설정 — 수정 버튼에서 설정하세요
                    </Badge>
                  </div>
                ) : null}

                {/* 편집 모드: 세로 리스트 + 드래그 */}
                {isEditing ? (
                  <div className="space-y-1.5">
                    {/* 💰 금액 조건 — 경비/구매 양식에서 필수 */}
                    {(tmpl.doc_type === 'expense' || tmpl.doc_type === 'purchase') && (
                      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-lg p-3 mb-3 shadow-sm">
                        <p className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-1.5">
                          💰 금액 조건 설정
                          {editCondOp && editCondVal && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">✓ 설정됨</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap text-sm bg-white rounded-md p-2 border border-amber-200">
                          <span className="text-gray-700 font-medium">신청 금액</span>
                          <select
                            value={editCondOp || ''}
                            onChange={(e) => {
                              setEditCondOp(e.target.value || null)
                              if (e.target.value) setEditCondField('amount')
                              else { setEditCondField(null); setEditCondVal(null) }
                            }}
                            className="text-sm border-2 border-amber-300 rounded px-2 py-1 bg-white font-semibold text-amber-800"
                          >
                            <option value="">조건 없음 (기본)</option>
                            <option value=">=">≥ 이상</option>
                            <option value=">">&gt; 초과</option>
                            <option value="<">&lt; 미만</option>
                            <option value="<=">≤ 이하</option>
                          </select>
                          {editCondOp && (
                            <>
                              <input
                                type="number"
                                value={editCondVal || ''}
                                onChange={(e) => setEditCondVal(e.target.value)}
                                placeholder="500000"
                                className="text-sm border-2 border-amber-300 rounded px-2 py-1 w-28 font-semibold"
                              />
                              <span className="text-gray-700">원</span>
                            </>
                          )}
                        </div>
                        <p className="text-[11px] text-amber-700 mt-1.5">
                          예: "≥ 500,000원" = 50만원 이상 신청 시 이 결재선이 자동 선택됩니다
                        </p>
                        {(editCondOp !== tmpl.condition_operator || editCondVal !== tmpl.condition_value) && (
                          <p className="text-[11px] text-red-600 mt-1 font-semibold">
                            ⚠️ 변경사항이 있습니다. 상단 "저장" 버튼을 눌러야 적용됩니다.
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 mb-1">드래그로 순서 변경</p>
                    {editSteps.map((step, idx) => {
                      const recommendedPool = getRecommendedEmployees(step.role)
                      const recommendedIds = new Set(recommendedPool.map(e => e.id))
                      const otherPool = employees.filter(e => !recommendedIds.has(e.id))
                      const selectedIds = step.approver_ids || []
                      const searchQ = (stepSearches[idx] || '').toLowerCase()
                      const matchSearch = (emp: Employee) => !searchQ || emp.name.toLowerCase().includes(searchQ)
                      const filteredRec = recommendedPool.filter(matchSearch)
                      const filteredOther = otherPool.filter(matchSearch)
                      return (
                        <div
                          key={idx}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData('stepIdx', String(idx)) }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault()
                            const fromIdx = parseInt(e.dataTransfer.getData('stepIdx'))
                            if (fromIdx === idx) return
                            const newSteps = [...editSteps]
                            const [moved] = newSteps.splice(fromIdx, 1)
                            newSteps.splice(idx, 0, moved)
                            setEditSteps(newSteps)
                          }}
                          className="bg-white rounded-lg p-3 space-y-2 border-2 border-gray-200 hover:border-brand-400 hover:shadow-sm transition-all"
                        >
                          {/* 단계 연결선 (첫 단계 아닌 경우) */}
                          {idx > 0 && (
                            <div className="absolute -mt-5 left-6 flex flex-col items-center pointer-events-none">
                              <div className="w-0.5 h-2 bg-brand-200" />
                              <span className="text-brand-400 text-xs -mt-0.5">▼</span>
                            </div>
                          )}
                          {/* 역할 + 이름 */}
                          <div className="flex items-center gap-2 cursor-move">
                            <span className="text-gray-300 text-xs shrink-0">⋮⋮</span>
                            <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-sm">{idx + 1}</span>
                            <select
                              value={step.role}
                              onChange={(e) => updateStep(idx, 'role', e.target.value)}
                              className="text-xs border border-gray-200 rounded px-2 py-1 shrink-0 bg-white"
                            >
                              {ROLE_OPTIONS.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={step.label}
                              onChange={(e) => updateStep(idx, 'label', e.target.value)}
                              className="text-xs border border-gray-200 rounded px-2 py-1 flex-1 min-w-0"
                              placeholder="표시 이름"
                            />
                            <button onClick={() => removeStep(idx)} className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
                          </div>
                          {/* 승인 유형 (결재/합의/참조) */}
                          <div className="ml-7 flex items-center gap-1 flex-wrap">
                            <span className="text-[10px] text-gray-500 mr-1">유형:</span>
                            {ACTION_TYPE_OPTIONS.map((opt) => {
                              const current = step.action_type || 'approve'
                              const isActive = current === opt.value
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setEditSteps(editSteps.map((s, i) => i === idx ? { ...s, action_type: opt.value } : s))}
                                  title={opt.desc}
                                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                                    isActive ? opt.color + ' font-semibold' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              )
                            })}
                          </div>
                          {/* 직원 지정 — 검색 + 추천/전체 직원 선택 */}
                          <div className="ml-7 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] text-gray-500">
                                담당자 지정 {selectedIds.length > 0 && <span className="text-brand-600 font-semibold">({selectedIds.length}명)</span>}
                                {selectedIds.length === 0 && <span className="text-gray-400"> — 미지정 시 역할로 자동 배정</span>}
                              </p>
                              <input
                                type="text"
                                placeholder="이름 검색..."
                                value={stepSearches[idx] || ''}
                                onChange={(e) => setStepSearches({ ...stepSearches, [idx]: e.target.value })}
                                className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 w-24 focus:outline-none focus:border-brand-400"
                              />
                            </div>

                            {/* 선택된 직원 (최상단) */}
                            {selectedIds.length > 0 && (
                              <div className="flex flex-wrap gap-1 pb-1 border-b border-gray-200">
                                {selectedIds.map(id => {
                                  const emp = employees.find(e => e.id === id)
                                  if (!emp) return null
                                  return (
                                    <button
                                      key={id}
                                      onClick={() => toggleApprover(idx, id)}
                                      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-500 text-white"
                                    >
                                      ✓ {emp.name} ✕
                                    </button>
                                  )
                                })}
                              </div>
                            )}

                            {/* 추천 직원 */}
                            {filteredRec.length > 0 && (
                              <div>
                                <p className="text-[9px] text-brand-600 mb-0.5 font-semibold">추천 ({step.role})</p>
                                <div className="flex flex-wrap gap-1">
                                  {filteredRec.map(emp => {
                                    const selected = selectedIds.includes(emp.id)
                                    if (selected) return null
                                    return (
                                      <button
                                        key={emp.id}
                                        onClick={() => toggleApprover(idx, emp.id)}
                                        className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100"
                                      >
                                        {emp.name}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 그 외 전체 직원 (검색 시에만 펼침) */}
                            {searchQ && filteredOther.length > 0 && (
                              <div>
                                <p className="text-[9px] text-gray-400 mb-0.5">그 외 직원</p>
                                <div className="flex flex-wrap gap-1">
                                  {filteredOther.map(emp => {
                                    const selected = selectedIds.includes(emp.id)
                                    if (selected) return null
                                    return (
                                      <button
                                        key={emp.id}
                                        onClick={() => toggleApprover(idx, emp.id)}
                                        className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white border border-gray-200 text-gray-600 hover:border-brand-300"
                                      >
                                        {emp.name}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {!searchQ && filteredRec.length === 0 && (
                              <p className="text-[10px] text-gray-400">추천 직원 없음 — 검색으로 전체 직원에서 선택</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <button
                      onClick={addStep}
                      className="w-full mt-1 py-1.5 text-xs text-brand-600 hover:bg-brand-50 border border-dashed border-brand-300 rounded-lg font-medium"
                    >
                      + 단계 추가
                    </button>
                  </div>
                ) : (
                  /* 보기 모드: 세로 흐름 (가로 밀림 방지) */
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50">
                      <span className="text-[10px] font-bold text-gray-400 w-5 text-center">0</span>
                      <span className="text-xs font-medium text-gray-600">신청자</span>
                    </div>
                    {tmpl.steps.map((step, idx) => {
                      const stepData = step as EditStep
                      const approverIds = stepData.approver_ids || []
                      const approverNames = approverIds
                        .map(id => employees.find(e => e.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')
                      return (
                        <div key={idx} className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-brand-50 border-l-2 border-brand-400">
                          <span className="text-[10px] font-bold text-brand-500 w-5 text-center mt-0.5">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-brand-800">{step.label}</p>
                            {approverNames && (
                              <p className="text-[10px] text-gray-600 mt-0.5 truncate">👤 {approverNames}</p>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">{step.role}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {templates.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-gray-400 text-sm">
            등록된 결재선 템플릿이 없습니다
          </CardContent>
        </Card>
      )}
    </div>
  )
}
