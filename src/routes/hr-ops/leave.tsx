import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import {
  CalendarPlus, Download, Search,
  AlertTriangle, CheckCircle, Clock, Plus, X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { calculateAnnualLeave } from '@/lib/leave-calculator'
import { annualLeavePromotionEmail, emergencyLeaveNotificationEmail } from '@/lib/email-templates'
import { sendNotification } from '@/lib/notification-sender'
import { safeStorageUpload, describeUploadError } from '@/lib/storage-upload'
import { sanitizeStorageKey } from '@/lib/candidate-storage'
import { ApprovalLineViewer } from '@/components/approval/ApprovalLineViewer'

/* ─── Types ─────────────────────────────────────────── */

interface Employee {
  id: string
  name: string
  department_id: string | null
  hire_date: string | null
  position: string | null
  role: string | null
  email?: string | null
}

interface Department { id: string; name: string; parent_id?: string | null }

interface ApprovalStep {
  step: number
  role_label: string       // '리더' | '이사' | '대표'
  approver_id: string
  approver_name: string
  status: 'pending' | 'approved' | 'rejected'
  acted_at: string | null
}

interface HrDetail {
  id: string; employee_id: string
  annual_leave_total: number; annual_leave_used: number; annual_leave_remaining: number
  annual_leave_basis: string | null
  base_salary: number | null; annual_salary: number | null
  employment_type: string | null; work_schedule: string | null
}

interface LeaveRequest {
  id: string; employee_id: string; leave_type: string
  start_date: string; end_date: string; days_count: number
  reason: string | null; approval_status: string
  approved_by: string | null; approved_at: string | null
  rejection_reason: string | null
  approval_line: ApprovalStep[] | null
  current_step: number | null
  is_promoted: boolean
  created_at: string
}

// 긴급연차 (PDCA #4) — 결재 없이 즉시 통보, 출근 후 보완자료 첨부 → 정식 연차 전환
// export: S3(목록/상세/전환)에서 사용 예정 — noUnusedLocals 회피
export interface EmergencyLeaveRequest {
  id: string
  employee_id: string
  leave_kind: 'emergency' | 'sick'
  start_date: string
  end_date: string
  days_count: number
  reason: string
  handover_notes: string | null
  delegate_employee_id: string | null
  delegate_name_text: string | null
  hospital_plan: string | null
  same_day_filing: boolean | null
  filing_note: string | null
  attachment_path: string | null
  attachment_uploaded_at: string | null
  status: 'filed' | 'supplemented' | 'promoted' | 'cancelled'
  promoted_to_leave_id: string | null
  promoted_at: string | null
  paid_deduct_days: number
  unpaid_days: number
  notified_at: string | null
  created_at: string
}

/* ─── Constants ─────────────────────────────────────── */

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: '연차', child: '자녀 연차', special: '특별 휴가',
  sick: '병가', half_am: '오전 반차', half_pm: '오후 반차',
}

const LEAVE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_review: 'bg-blue-100 text-blue-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

const LEAVE_STATUS_LABELS: Record<string, string> = {
  pending: '승인 대기', in_review: '결재 진행중',
  approved: '승인 완료', rejected: '반려',
}

const ADMIN_ROLES = ['ceo', 'director', 'division_head', 'admin']
const LEADER_ROLES = ['leader', 'director', 'division_head', 'ceo', 'admin']
const DIRECTOR_ROLES = ['director', 'division_head', 'ceo', 'admin']

// 긴급연차 이메일 수신 임원급 (Q2: hr_admin + ceo + director 한정 — 민감정보 임원 외 비공개)
const EMERGENCY_NOTIFY_ROLES = ['hr_admin', 'ceo', 'director']
const EMG_STATUS_LABELS: Record<string, string> = {
  filed: '통보됨', supplemented: '보완완료', promoted: '정식전환', cancelled: '취소',
}
const EMG_STATUS_COLORS: Record<string, string> = {
  filed: 'bg-red-100 text-red-700',
  supplemented: 'bg-amber-100 text-amber-700',
  promoted: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
}
const EMG_KIND_LABELS: Record<string, string> = { emergency: '긴급사유', sick: '병가' }
// 긴급연차 비상연락망 안내 (Q6: 상수 — 이메일 불가 시 구두 연락처)
const EMERGENCY_CONTACT_NOTICE = '이메일 발송이 어려운 긴급 상황 시 구두 연락: 평일=경영관리본부 이민지 / 주말=경영관리본부 강은묵 이사'

/* ─── Component ─────────────────────────────────────── */

export default function LeaveManagementPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const isAdmin = profile?.role ? ADMIN_ROLES.includes(profile.role) : false

  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [hrDetails, setHrDetails] = useState<HrDetail[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyLeaveRequest[]>([])  // PDCA #4
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [currentYear] = useState(new Date().getFullYear())
  const [showRequestDialog, setShowRequestDialog] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'calendar' | 'requests' | 'emergency'>('overview')

  // C7: 월간 캘린더 상태
  const now = new Date()
  const [calendarYear, setCalendarYear] = useState(now.getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth()) // 0~11

  // 연차 신청 폼
  const [reqLeaveType, setReqLeaveType] = useState('annual')
  const [reqStartDate, setReqStartDate] = useState('')
  const [reqEndDate, setReqEndDate] = useState('')
  const [reqDays, setReqDays] = useState(1)
  const [reqReason, setReqReason] = useState('')

  // 긴급연차 (PDCA #4) — 신청 다이얼로그 상단 [일반]/[긴급] 토글
  const [reqMode, setReqMode] = useState<'normal' | 'emergency'>('normal')
  const [emgKind, setEmgKind] = useState<'emergency' | 'sick'>('emergency')
  const [emgHandover, setEmgHandover] = useState('')
  const [emgDelegateId, setEmgDelegateId] = useState('')      // delegate_employee_id (직원 선택)
  const [emgDelegateName, setEmgDelegateName] = useState('')  // delegate_name_text (자유입력)
  const [emgHospitalPlan, setEmgHospitalPlan] = useState('')
  const [emgSameDayFiling, setEmgSameDayFiling] = useState<boolean | null>(null)
  const [emgFilingNote, setEmgFilingNote] = useState('')
  // S3: 긴급연차 업로드/전환/무급 처리 상태
  const [emgUploadingId, setEmgUploadingId] = useState<string | null>(null)
  const [emgPromotingId, setEmgPromotingId] = useState<string | null>(null)
  // 무급 처리 모달 (관리자) — 대상 건 + 입력값
  const [payoutTarget, setPayoutTarget] = useState<EmergencyLeaveRequest | null>(null)
  const [payoutPaid, setPayoutPaid] = useState('0')
  const [payoutUnpaid, setPayoutUnpaid] = useState('0')
  const [payoutSaving, setPayoutSaving] = useState(false)
  // 결재라인 (D1-4: 자동 지정 — 수동 선택 제거)
  // approval_templates(doc_type='leave') 활성 전체 로드 후 신청자 부서로 매칭
  // step.approver_ids 가 있으면 그 직원들 우선 사용, 없으면 role 기반 자동 매칭
  interface LeaveTemplateRow {
    id: string
    name: string
    department_id?: string | null
    team_id?: string | null
    steps: { role: string; label?: string; approver_ids?: string[] }[]
  }
  const [leaveTemplates, setLeaveTemplates] = useState<LeaveTemplateRow[]>([])
  // ApprovalLineViewer 사용
  const [saving, setSaving] = useState(false)
  const [sendingPromotionId, setSendingPromotionId] = useState<string | null>(null)

  // 연차 자동 계산 — 미리보기/검토 다이얼로그 상태
  interface AutoCalcPreview {
    employeeId: string
    name: string
    hireDate: string
    currentTotal: number | null
    currentUsed: number
    calcTotal: number
    finalTotal: number  // 관리자가 수정 가능
    description: string
    apply: boolean      // 적용 여부 (체크박스)
  }
  const [autoCalcPreview, setAutoCalcPreview] = useState<AutoCalcPreview[] | null>(null)
  const [autoCalcApplying, setAutoCalcApplying] = useState(false)

  // 결재라인 직원 목록 (역할별 필터)
  const leaders = useMemo(() => allEmployees.filter((e) => e.role && LEADER_ROLES.includes(e.role) && e.id !== profile?.id), [allEmployees, profile?.id])
  const directors = useMemo(() => allEmployees.filter((e) => e.role && DIRECTOR_ROLES.includes(e.role) && e.id !== profile?.id), [allEmployees, profile?.id])
  const ceo = useMemo(() => allEmployees.find((e) => e.role === 'ceo'), [allEmployees])
  // D1-4: 인사담당 (민지님 등)
  const hrAdmin = useMemo(() => allEmployees.find((e) => e.role === 'hr_admin'), [allEmployees])

  // D1-4: 신청자 부서의 리더 자동 탐색 (없으면 같은 본부 리더, 그것도 없으면 첫 번째 리더)
  const autoLeader = useMemo(() => {
    if (!profile?.id) return null
    const self = allEmployees.find((e) => e.id === profile.id)
    if (!self?.department_id) return leaders[0] || null
    // 1. 같은 부서 리더
    const sameDept = allEmployees.find((e) => e.role === 'leader' && e.department_id === self.department_id && e.id !== profile.id)
    if (sameDept) return sameDept
    // 2. 부모 부서(본부) 리더
    const selfDept = departments.find((d) => d.id === self.department_id)
    if (selfDept?.parent_id) {
      const parentDeptLeader = allEmployees.find((e) => e.role === 'leader' && e.department_id === selfDept.parent_id)
      if (parentDeptLeader) return parentDeptLeader
    }
    return leaders[0] || null
  }, [allEmployees, profile?.id, departments, leaders])

  // D1-4: 신청자 본부의 임원(director/division_head) 자동 탐색
  const autoDirector = useMemo(() => {
    if (!profile?.id) return null
    const self = allEmployees.find((e) => e.id === profile.id)
    if (!self?.department_id) return directors[0] || null
    const selfDept = departments.find((d) => d.id === self.department_id)
    const divisionId = selfDept?.parent_id || self.department_id
    const divHead = allEmployees.find((e) => (e.role === 'director' || e.role === 'division_head') && e.department_id === divisionId)
    return divHead || directors[0] || null
  }, [allEmployees, profile?.id, departments, directors])

  useEffect(() => { fetchData() }, [profile?.id])

  // 연차 결재선 템플릿 — 활성 전체 로드 (부서별 매칭은 effectiveLeaveTemplate 에서 처리)
  useEffect(() => {
    supabase.from('approval_templates')
      .select('id, name, department_id, team_id, steps')
      .eq('doc_type', 'leave')
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) setLeaveTemplates((data as unknown) as LeaveTemplateRow[])
      })
  }, [])

  // 신청자의 부서 기반 결재선 템플릿 매칭 — approval.tsx getTemplateForDocType 패턴 동일
  // 1순위: team_id = 본인 팀 / 2순위: department_id = 본인 본부 / 3순위: 둘 다 NULL (전체 fallback)
  const effectiveLeaveTemplate = useMemo<LeaveTemplateRow | null>(() => {
    if (leaveTemplates.length === 0) return null
    const me = allEmployees.find((e) => e.id === profile?.id)
    const myDeptId = me?.department_id || null
    const myDept = departments.find((d) => d.id === myDeptId)
    const myDivisionId = myDept?.parent_id || myDeptId

    const teamMatch = leaveTemplates.filter((t) => t.team_id && t.team_id === myDeptId)
    if (teamMatch.length > 0) return teamMatch[0]
    const deptMatch = leaveTemplates.filter((t) => t.department_id && t.department_id === myDivisionId && !t.team_id)
    if (deptMatch.length > 0) return deptMatch[0]
    const globalFallback = leaveTemplates.filter((t) => !t.team_id && !t.department_id)
    if (globalFallback.length > 0) return globalFallback[0]
    // ⚠️ 본인 부서 매칭도 없고 전사 fallback 도 없으면 — 무작위 다른 부서 템플릿을 잡으면 안 됨.
    // (이전: leaveTemplates[0] 반환 → 관리자가 등록하지 않은 결재선이 노출되는 회귀)
    return null
  }, [leaveTemplates, allEmployees, departments, profile?.id])

  async function fetchData() {
    if (!profile?.id) return
    setLoading(true)

    // 결재라인 셀렉트용으로 전 직원은 항상 가져옴
    const allEmpRes = await supabase.from('employees').select('id, name, email, department_id, hire_date, position, role').eq('is_active', true).order('name')
    setAllEmployees((allEmpRes.data || []) as Employee[])

    let empQuery = supabase.from('employees').select('id, name, email, department_id, hire_date, position, role').eq('is_active', true).order('name')
    let leaveQuery = supabase.from('employee_hr_details').select('*')
    let reqQuery = supabase.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(200)

    if (!isAdmin) {
      empQuery = empQuery.eq('id', profile.id)
      leaveQuery = leaveQuery.eq('employee_id', profile.id)
      // 본인 신청 + 본인이 결재자인 건
      reqQuery = supabase.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(200)
    }

    const [empRes, deptRes, leaveRes, reqRes] = await Promise.all([empQuery, supabase.from('departments').select('id, name, parent_id').order('name'), leaveQuery, reqQuery])
    const empData = (empRes.data || []) as Employee[]
    const reqData = (reqRes.data || []) as LeaveRequest[]

    setEmployees(empData)
    setDepartments((deptRes.data || []) as Department[])
    setHrDetails((leaveRes.data || []) as HrDetail[])

    // 일반 직원이면 본인 신청 + 본인이 결재자인 건만 필터
    if (!isAdmin) {
      setLeaveRequests(reqData.filter((r) => {
        if (r.employee_id === profile.id) return true
        if (r.approval_line) {
          return (r.approval_line as ApprovalStep[]).some((s) => s.approver_id === profile.id)
        }
        return false
      }))
    } else {
      setLeaveRequests(reqData)
    }

    // 긴급연차 (PDCA #4) — RLS 가 본인 + 임원급 으로 제한하므로 클라 추가 필터 불필요
    const emgRes = await supabase.from('emergency_leave_requests')
      .select('*').order('created_at', { ascending: false }).limit(200)
    setEmergencyRequests((emgRes.data || []) as EmergencyLeaveRequest[])

    setLoading(false)
  }

  const getDeptName = (deptId: string | null) => departments.find((d) => d.id === deptId)?.name || '-'
  const getEmpName = (empId: string) => allEmployees.find((e) => e.id === empId)?.name || empId

  // ─── 직원별 연차 데이터 ────────────────────────────
  const employeeLeaveData = useMemo(() => {
    return employees.map((emp) => {
      const hr = hrDetails.find((h) => h.employee_id === emp.id)
      const totalAnnual = hr?.annual_leave_total || 0
      const usedAnnual = hr?.annual_leave_used || 0
      const remainingAnnual = hr?.annual_leave_remaining ?? (totalAnnual - usedAnnual)
      const usageRate = totalAnnual > 0 ? Math.round((usedAnnual / totalAnnual) * 100) : 0
      return { ...emp, hr, totalAnnual, usedAnnual, remainingAnnual, usageRate }
    })
  }, [employees, hrDetails])

  const filteredData = useMemo(() => {
    let result = employeeLeaveData
    if (filterDept) {
      const selectedDept = departments.find(d => d.name === filterDept)
      if (selectedDept && !selectedDept.parent_id) {
        // 본부 선택 → 본부 + 하위 팀 모두
        const teamIds = departments.filter(d => d.parent_id === selectedDept.id).map(d => d.id)
        const allIds = [selectedDept.id, ...teamIds]
        result = result.filter((e) => allIds.includes(e.department_id || ''))
      } else {
        // 팀 선택 → 해당 팀만
        result = result.filter((e) => getDeptName(e.department_id) === filterDept)
      }
    }
    if (searchQuery) { const q = searchQuery.toLowerCase(); result = result.filter((e) => e.name.toLowerCase().includes(q)) }
    return result
  }, [employeeLeaveData, filterDept, searchQuery, departments])

  const totalEmployees = filteredData.length
  const avgUsageRate = totalEmployees > 0 ? Math.round(filteredData.reduce((s, e) => s + e.usageRate, 0) / totalEmployees) : 0
  const warningCount = filteredData.filter((e) => e.remainingAnnual > 5 && e.usageRate < 50).length
  const pendingRequests = leaveRequests.filter((r) => r.approval_status === 'pending' || r.approval_status === 'in_review').length
  const deptNames = useMemo(() => [...new Set(employees.map((e) => getDeptName(e.department_id)).filter((n) => n !== '-'))], [employees, departments])

  // ─── 결재라인 자동 구성 helper (S2: 인라인 → 추출. 일반 연차 신청 + 긴급연차 정식 전환 공유) ───
  // 반환: 구성된 ApprovalStep[]. 빈 배열이면 호출부에서 사유별 toast 처리.
  // 동작은 추출 전 handleSubmitRequest 인라인 로직과 동일 (회귀 0):
  //   - effectiveLeaveTemplate 있으면 템플릿 기반, 없으면 legacy 4단계(리더→인사담당→임원→대표) fallback
  function buildApprovalLine(): ApprovalStep[] {
    const approvalLine: ApprovalStep[] = []
    let step = 0
    if (!profile?.id) return approvalLine

    if (effectiveLeaveTemplate && effectiveLeaveTemplate.steps && effectiveLeaveTemplate.steps.length > 0) {
      // 템플릿 step 별로 결재단계 구성
      // 우선순위 1: step.approver_ids 가 있으면 그 직원들만 사용 (관리자가 직접 지정한 사람들)
      // 우선순위 2: approver_ids 가 없으면 role 기반 자동 매칭 (legacy)
      // 신청자 본인은 제외 + 중복 방지
      const usedIds = new Set<string>([profile.id])

      for (const tplStep of effectiveLeaveTemplate.steps) {
        let candidates: typeof allEmployees = []

        // ── 우선순위 1: 관리자가 결재선 편집기에서 직접 지정한 approver_ids ──
        if (Array.isArray(tplStep.approver_ids) && tplStep.approver_ids.length > 0) {
          candidates = tplStep.approver_ids
            .map((id) => allEmployees.find((e) => e.id === id))
            .filter((e): e is typeof allEmployees[number] => !!e)
        } else if (tplStep.role === 'leader') {
          // 신청자 부서의 리더 우선, 없으면 전사 리더
          candidates = autoLeader ? [autoLeader] : leaders
        } else if (tplStep.role === 'executive' || tplStep.role === 'director' || tplStep.role === 'division_head') {
          // 모든 이사/임원 (executive는 director+division_head 통칭)
          candidates = allEmployees.filter((e) => e.role &&
            ['director', 'division_head', 'executive'].includes(e.role))
        } else if (tplStep.role === 'hr_admin') {
          candidates = hrAdmin ? [hrAdmin] : []
        } else if (tplStep.role === 'ceo') {
          candidates = ceo ? [ceo] : []
        } else if (tplStep.role === 'finance') {
          candidates = allEmployees.filter((e) => e.role === 'finance')
        } else {
          // 알 수 없는 role — 같은 role 의 모든 직원
          candidates = allEmployees.filter((e) => e.role === tplStep.role)
        }

        for (const c of candidates) {
          if (usedIds.has(c.id)) continue
          usedIds.add(c.id)
          approvalLine.push({
            step: step++,
            role_label: tplStep.label || tplStep.role,
            approver_id: c.id,
            approver_name: c.name,
            status: 'pending',
            acted_at: null,
          })
        }
      }
    } else {
      // Fallback: legacy 4단계 (리더 → 인사담당 → 임원 → 대표)
      // autoLeader 없으면 빈 배열 반환 (호출부에서 "리더 미지정" toast)
      if (!autoLeader) return approvalLine

      approvalLine.push({
        step: step++, role_label: '리더',
        approver_id: autoLeader.id, approver_name: autoLeader.name,
        status: 'pending', acted_at: null,
      })

      if (hrAdmin && hrAdmin.id !== autoLeader.id) {
        approvalLine.push({
          step: step++, role_label: '인사담당',
          approver_id: hrAdmin.id, approver_name: hrAdmin.name,
          status: 'pending', acted_at: null,
        })
      }

      if (autoDirector && autoDirector.id !== autoLeader.id && autoDirector.id !== hrAdmin?.id) {
        approvalLine.push({
          step: step++, role_label: '임원',
          approver_id: autoDirector.id, approver_name: autoDirector.name,
          status: 'pending', acted_at: null,
        })
      }

      if (ceo && ceo.id !== profile.id) {
        approvalLine.push({
          step: step++, role_label: '대표',
          approver_id: ceo.id, approver_name: ceo.name,
          status: 'pending', acted_at: null,
        })
      }
    }

    return approvalLine
  }

  // ─── 연차 신청 (P0-#1: approval_templates(doc_type='leave').steps 우선 사용) ─────────
  async function handleSubmitRequest() {
    if (!profile?.id || !reqStartDate || !reqEndDate) { toast('필수 항목을 입력하세요', 'error'); return }
    setSaving(true)

    // 결재라인 구성 — buildApprovalLine() 재사용 (추출 전 인라인 로직과 동일)
    // legacy fallback 에서 리더 미지정 시 빈 배열 → 기존과 동일한 특정 메시지 유지
    const usingLegacy = !(effectiveLeaveTemplate && effectiveLeaveTemplate.steps && effectiveLeaveTemplate.steps.length > 0)
    if (usingLegacy && !autoLeader) {
      toast('결재할 리더가 지정되지 않았습니다. 관리자에게 문의하세요.', 'error'); setSaving(false); return
    }
    const approvalLine = buildApprovalLine()

    if (approvalLine.length === 0) {
      toast('결재라인을 구성할 수 없습니다. 관리자에게 문의하세요.', 'error')
      setSaving(false)
      return
    }

    const { error } = await supabase.from('leave_requests').insert({
      employee_id: profile.id,
      leave_type: reqLeaveType,
      start_date: reqStartDate,
      end_date: reqEndDate,
      days_count: reqDays,
      reason: reqReason || null,
      approval_status: 'in_review',
      current_step: 0,
      approval_line: approvalLine,
    })
    setSaving(false)
    if (error) { toast('신청 실패: ' + error.message, 'error'); return }
    toast('연차 신청이 완료되었습니다. 결재를 기다려주세요.', 'success')
    setShowRequestDialog(false)
    setReqLeaveType('annual'); setReqStartDate(''); setReqEndDate(''); setReqDays(1); setReqReason('')
    fetchData()
  }

  // ─── 긴급연차 신청 (PDCA #4) — 결재 없이 즉시 통보 + 임원급 이메일 자동 발송 ─────────
  function resetEmergencyForm() {
    setReqMode('normal'); setEmgKind('emergency')
    setEmgHandover(''); setEmgDelegateId(''); setEmgDelegateName('')
    setEmgHospitalPlan(''); setEmgSameDayFiling(null); setEmgFilingNote('')
    setReqStartDate(''); setReqEndDate(''); setReqDays(1); setReqReason('')
  }

  async function handleSubmitEmergency() {
    if (!profile?.id) return
    // 필수: 날짜 + 사유. (병가 진단서 필수는 "전환 시점" 검증 — 신청 자체는 첨부 없이 가능)
    if (!reqStartDate || !reqEndDate) { toast('연차 날짜를 입력하세요', 'error'); return }
    if (!reqReason.trim()) { toast('연차 사유를 입력하세요', 'error'); return }
    if (new Date(reqStartDate) > new Date(reqEndDate)) { toast('종료일이 시작일보다 빠를 수 없습니다', 'error'); return }
    setSaving(true)

    // 대리인: 직원 선택(delegate_employee_id) 우선, 없으면 자유입력(delegate_name_text)
    const delegateId = emgDelegateId || null
    const delegateName = delegateId
      ? (allEmployees.find((e) => e.id === delegateId)?.name || null)
      : (emgDelegateName.trim() || null)

    // 1) 긴급연차 INSERT (결재선 없음, status='filed')
    const { data: inserted, error } = await supabase
      .from('emergency_leave_requests')
      .insert({
        employee_id: profile.id,
        leave_kind: emgKind,
        start_date: reqStartDate,
        end_date: reqEndDate,
        days_count: reqDays,
        reason: reqReason.trim(),
        handover_notes: emgHandover.trim() || null,
        delegate_employee_id: delegateId,
        delegate_name_text: delegateId ? null : (emgDelegateName.trim() || null),
        hospital_plan: emgHospitalPlan.trim() || null,
        same_day_filing: emgSameDayFiling,
        filing_note: emgFilingNote.trim() || null,
        status: 'filed',
        created_by: profile.id,
      })
      .select('id')
      .single()

    if (error || !inserted) {
      setSaving(false)
      toast('긴급연차 신청 실패: ' + (error?.message || '알 수 없는 오류'), 'error')
      return
    }

    // 2) 임원급(hr_admin/ceo/director) 이메일 자동 발송 — best-effort (실패해도 신청은 성공 유지)
    const recipients = allEmployees.filter(
      (e) => e.role && EMERGENCY_NOTIFY_ROLES.includes(e.role) && e.email && e.id !== profile.id,
    )
    const period = (s: string) => s.replace(/-/g, '.')  // YYYY-MM-DD → YYYY.MM.DD
    let sentCount = 0
    for (const r of recipients) {
      try {
        const { subject, html } = emergencyLeaveNotificationEmail({
          recipientName: r.name,
          applicantName: profile.name || '직원',
          leaveKind: emgKind,
          startDate: period(reqStartDate),
          endDate: period(reqEndDate),
          daysCount: reqDays,
          reason: reqReason.trim(),
          handoverNotes: emgHandover.trim() || null,
          delegateName,
          hospitalPlan: emgHospitalPlan.trim() || null,
          sameDayFiling: emgSameDayFiling,
        })
        const res = await sendNotification({
          channel: 'email',
          recipientEmail: r.email!,
          recipientUid: r.id,
          subject,
          body: html,
          relatedEntity: { type: 'emergency_leave', id: inserted.id },
        })
        if (res.status === 'sent') sentCount++
      } catch { /* best-effort: 개별 발송 실패 무시 */ }
    }

    // 3) 발송 완료 시각 기록 (1건 이상 성공 시)
    if (sentCount > 0) {
      await supabase.from('emergency_leave_requests')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', inserted.id)
    }

    setSaving(false)
    if (sentCount === recipients.length && recipients.length > 0) {
      toast(`긴급연차가 통보되었습니다. 임원진 ${sentCount}명에게 이메일이 발송되었습니다.`, 'success')
    } else if (sentCount > 0) {
      toast(`긴급연차 신청 완료. 이메일 ${sentCount}/${recipients.length}건 발송 (일부 실패 — 필요 시 구두 통보).`, 'success')
    } else {
      toast('긴급연차 신청은 완료되었으나 이메일 발송에 실패했습니다. 임원진에게 직접 통보가 필요합니다.', 'error')
    }
    setShowRequestDialog(false)
    resetEmergencyForm()
    fetchData()
  }

  // ─── 긴급연차 보완자료 업로드 (출근 후 진단서/사유서) ─────────
  async function handleEmergencyUpload(req: EmergencyLeaveRequest, file: File) {
    if (!profile?.id) return
    setEmgUploadingId(req.id)
    // 경로: emergency-leave-files/{employee_id}/{uuid}-{sanitized}
    const path = `${req.employee_id}/${crypto.randomUUID()}-${sanitizeStorageKey(file.name)}`
    const { data, error } = await safeStorageUpload('emergency-leave-files', path, file, { upsert: false })
    if (error || !data) {
      setEmgUploadingId(null)
      toast(describeUploadError(error || { message: '업로드 실패', code: 'storage' }), 'error')
      return
    }
    // status: filed → supplemented (이미 promoted/cancelled 면 status 유지)
    const nextStatus = req.status === 'filed' ? 'supplemented' : req.status
    const { error: updErr } = await supabase.from('emergency_leave_requests')
      .update({ attachment_path: data.path, attachment_uploaded_at: new Date().toISOString(), status: nextStatus })
      .eq('id', req.id)
    setEmgUploadingId(null)
    if (updErr) { toast('첨부 정보 저장 실패: ' + updErr.message, 'error'); return }
    toast('보완자료가 업로드되었습니다.', 'success')
    fetchData()
  }

  async function handleEmergencyDownload(req: EmergencyLeaveRequest) {
    if (!req.attachment_path) return
    const { data, error } = await supabase.storage.from('emergency-leave-files')
      .createSignedUrl(req.attachment_path, 3600)
    if (error || !data?.signedUrl) { toast('다운로드 링크 생성 실패', 'error'); return }
    window.open(data.signedUrl, '_blank')
  }

  // ─── 긴급연차 → 정식 연차 전환 (promotion) ─────────
  // 정식 row 는 in_review 로 INSERT (즉시 차감 X). 결재 최종 승인 시 trigger_leave_balance 가 1회 차감.
  // 무급분(unpaid_days)은 leave_requests.days_count 에 포함하지 않음 (트리거 과차감 방지 — migration 134 COMMENT 참조).
  async function handlePromoteEmergency(req: EmergencyLeaveRequest) {
    if (!profile?.id) return
    if (req.employee_id !== profile.id) { toast('본인 긴급연차만 전환할 수 있습니다.', 'error'); return }
    if (req.status === 'promoted') { toast('이미 정식 연차로 전환된 건입니다.', 'error'); return }
    // 병가(sick)는 진단서(attachment) 미첨부 시 전환 차단 (대표 결정)
    if (req.leave_kind === 'sick' && !req.attachment_path) {
      toast('병가는 진료확인서/진단서를 먼저 첨부해야 정식 연차로 전환할 수 있습니다.', 'error'); return
    }
    setEmgPromotingId(req.id)

    // 결재라인 — 일반 연차와 동일하게 buildApprovalLine() 재사용
    const usingLegacy = !(effectiveLeaveTemplate && effectiveLeaveTemplate.steps && effectiveLeaveTemplate.steps.length > 0)
    if (usingLegacy && !autoLeader) {
      setEmgPromotingId(null)
      toast('결재할 리더가 지정되지 않았습니다. 관리자에게 문의하세요.', 'error'); return
    }
    const approvalLine = buildApprovalLine()
    if (approvalLine.length === 0) {
      setEmgPromotingId(null)
      toast('결재라인을 구성할 수 없습니다. 관리자에게 문의하세요.', 'error'); return
    }

    // 1) 정식 leave_requests INSERT (병가는 leave_type='sick', 그 외 'annual')
    //    days_count: 무급 분리 입력 전이므로 전체 일수로 상신. 무급은 관리자가 별도 처리.
    const { data: leaveRow, error: insErr } = await supabase.from('leave_requests').insert({
      employee_id: req.employee_id,
      leave_type: req.leave_kind === 'sick' ? 'sick' : 'annual',
      start_date: req.start_date,
      end_date: req.end_date,
      days_count: req.days_count,
      reason: req.reason,
      approval_status: 'in_review',
      current_step: 0,
      approval_line: approvalLine,
    }).select('id').single()

    if (insErr || !leaveRow) {
      setEmgPromotingId(null)
      toast('정식 연차 상신 실패: ' + (insErr?.message || '알 수 없는 오류'), 'error'); return
    }

    // 2) 긴급연차 → promoted 링크
    const { error: linkErr } = await supabase.from('emergency_leave_requests')
      .update({ status: 'promoted', promoted_to_leave_id: leaveRow.id, promoted_at: new Date().toISOString() })
      .eq('id', req.id)

    setEmgPromotingId(null)
    if (linkErr) { toast('전환 링크 저장 실패: ' + linkErr.message, 'error'); return }
    toast('정식 연차로 전환되어 전자결재가 상신되었습니다. 승인 시 연차가 차감됩니다.', 'success')
    fetchData()
  }

  // ─── 긴급연차 무급 처리 (관리자) — 차감/무급 분리 입력 (자동 X) ─────────
  function openPayoutModal(req: EmergencyLeaveRequest) {
    setPayoutTarget(req)
    // 기본값: 전체를 연차 차감으로 제안 (관리자가 부족분만큼 무급으로 조정)
    setPayoutPaid(String(req.paid_deduct_days || req.days_count))
    setPayoutUnpaid(String(req.unpaid_days || 0))
  }

  async function handleSavePayout() {
    if (!payoutTarget || !profile?.id) return
    const paid = Number(payoutPaid)
    const unpaid = Number(payoutUnpaid)
    if (isNaN(paid) || isNaN(unpaid) || paid < 0 || unpaid < 0) { toast('차감/무급 일수를 올바르게 입력하세요', 'error'); return }
    if (paid + unpaid !== payoutTarget.days_count) {
      toast(`차감(${paid}) + 무급(${unpaid}) 합이 신청 일수(${payoutTarget.days_count})와 일치해야 합니다.`, 'error'); return
    }
    setPayoutSaving(true)
    const { error } = await supabase.from('emergency_leave_requests').update({
      paid_deduct_days: paid,
      unpaid_days: unpaid,
      payout_decided_by: profile.id,
      payout_decided_at: new Date().toISOString(),
    }).eq('id', payoutTarget.id)
    if (error) { setPayoutSaving(false); toast('무급 처리 저장 실패: ' + error.message, 'error'); return }

    // 트리거 과차감 방지 (migration 134 COMMENT): 무급분이 있으면 연결된 정식 연차의 days_count 를
    // 차감분(paid)으로 조정 → trigger_leave_balance 는 승인 시 paid 만큼만 차감. 단 아직 미승인일 때만.
    let adjustNote = ''
    if (unpaid > 0 && payoutTarget.promoted_to_leave_id) {
      const { data: linked } = await supabase.from('leave_requests')
        .select('approval_status').eq('id', payoutTarget.promoted_to_leave_id).maybeSingle()
      if (linked && linked.approval_status !== 'approved') {
        const { error: adjErr } = await supabase.from('leave_requests')
          .update({ days_count: paid }).eq('id', payoutTarget.promoted_to_leave_id)
        if (!adjErr) adjustNote = ` 정식 연차 차감 일수가 ${paid}일로 조정되었습니다.`
      } else if (linked?.approval_status === 'approved') {
        adjustNote = ' ⚠️ 정식 연차가 이미 승인되어 차감이 완료되었습니다 — 무급 조정은 급여 정산에서 별도 처리하세요.'
      }
    }

    setPayoutSaving(false)
    toast('무급 처리가 기록되었습니다.' + adjustNote, 'success')
    setPayoutTarget(null)
    fetchData()
  }

  // ─── 결재 승인/반려 ────────────────────────────────
  async function handleApprovalAction(requestId: string, action: 'approved' | 'rejected') {
    const request = leaveRequests.find((r) => r.id === requestId)
    if (!request || !request.approval_line || !profile?.id) return

    const line = [...request.approval_line] as ApprovalStep[]
    const currentStep = request.current_step ?? 0
    const currentApprover = line[currentStep]

    if (!currentApprover || currentApprover.approver_id !== profile.id) {
      toast('현재 결재 차례가 아닙니다', 'error')
      return
    }

    // 현재 단계 처리
    line[currentStep] = { ...currentApprover, status: action, acted_at: new Date().toISOString() }

    if (action === 'rejected') {
      // 반려 → 최종 반려
      await supabase.from('leave_requests').update({
        approval_line: line, approval_status: 'rejected',
        approved_by: profile.id, approved_at: new Date().toISOString(),
      }).eq('id', requestId)
      toast('반려 처리되었습니다', 'success')
    } else if (currentStep >= line.length - 1) {
      // 마지막 결재자 승인 → 최종 승인
      await supabase.from('leave_requests').update({
        approval_line: line, approval_status: 'approved', current_step: currentStep + 1,
        approved_by: profile.id, approved_at: new Date().toISOString(),
      }).eq('id', requestId)

      // 연차 사용 일수는 DB 트리거(update_leave_balance)가 자동 처리
      toast('최종 승인 완료. 연차가 차감되었습니다.', 'success')
    } else {
      // 다음 결재자로 이동
      await supabase.from('leave_requests').update({
        approval_line: line, current_step: currentStep + 1,
      }).eq('id', requestId)
      toast(`승인 완료. 다음 결재자(${line[currentStep + 1].approver_name})에게 전달되었습니다.`, 'success')
    }
    fetchData()
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">연차 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">직원별 연차 현황을 관리합니다 ({currentYear}년)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <Button variant="outline" onClick={() => {
              if (employees.length === 0) { toast('직원 데이터가 없습니다.', 'error'); return }
              // 자동 계산만 수행하고 DB 저장은 미리보기 다이얼로그에서 관리자 확인 후 진행
              const preview: AutoCalcPreview[] = []
              const missing: string[] = []
              for (const emp of employees) {
                if (!emp.hire_date) { missing.push(emp.name); continue }
                try {
                  const calc = calculateAnnualLeave(emp.hire_date)
                  const hr = hrDetails.find(h => h.employee_id === emp.id)
                  preview.push({
                    employeeId: emp.id,
                    name: emp.name,
                    hireDate: emp.hire_date,
                    currentTotal: hr?.annual_leave_total ?? null,
                    currentUsed: hr?.annual_leave_used || 0,
                    calcTotal: calc.totalDays,
                    finalTotal: calc.totalDays,
                    description: calc.description,
                    apply: hr?.annual_leave_total !== calc.totalDays, // 변경되는 사람만 기본 체크
                  })
                } catch (err) {
                  console.error(`[${emp.name}] 계산 실패:`, err)
                }
              }
              if (preview.length === 0) {
                toast(`자동 계산 대상 없음 (입사일 미등록: ${missing.length}명)`, 'error')
                return
              }
              if (missing.length > 0) {
                toast(`입사일 없는 ${missing.length}명은 자동 계산에서 제외됩니다`, 'info')
              }
              setAutoCalcPreview(preview)
            }}>
              <CalendarPlus className="h-4 w-4 mr-1" /> 연차 자동 계산
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" onClick={() => {
              const data = filteredData.map(emp => ({
                이름: emp.name,
                부서: getDeptName(emp.department_id),
                총연차: emp.totalAnnual,
                사용: emp.usedAnnual,
                잔여: emp.remainingAnnual,
                소진율: `${emp.usageRate}%`,
              }))
              const ws = XLSX.utils.json_to_sheet(data)
              const wb = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(wb, ws, '연차현황')
              XLSX.writeFile(wb, `연차현황_${currentYear}년.xlsx`)
            }}>
              <Download className="h-4 w-4 mr-1" /> 엑셀 다운로드
            </Button>
          )}
          <Button onClick={() => setShowRequestDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> 연차 신청
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1"><CalendarPlus className="h-4 w-4 text-blue-500" /><span className="text-[11px] text-gray-500">{isAdmin ? '전체 직원' : '내 연차'}</span></div>
            <p className="text-2xl font-bold text-blue-600">{isAdmin ? `${totalEmployees}명` : `${filteredData[0]?.totalAnnual || 0}일`}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1"><CheckCircle className="h-4 w-4 text-violet-500" /><span className="text-[11px] text-gray-500">{isAdmin ? '평균 소진율' : '사용'}</span></div>
            <p className="text-2xl font-bold text-violet-600">{isAdmin ? `${avgUsageRate}%` : `${filteredData[0]?.usedAnnual || 0}일`}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-amber-500" /><span className="text-[11px] text-gray-500">{isAdmin ? '촉진 대상' : '잔여'}</span></div>
            <p className="text-2xl font-bold text-amber-600">{isAdmin ? `${warningCount}명` : `${filteredData[0]?.remainingAnnual || 0}일`}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1"><Clock className="h-4 w-4 text-emerald-500" /><span className="text-[11px] text-gray-500">결재 대기</span></div>
            <p className="text-2xl font-bold text-emerald-600">{pendingRequests}건</p>
          </CardContent>
        </Card>
      </div>

      {/* 탭 + 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {([
            { key: 'overview' as const, label: '연차 현황' },
            { key: 'calendar' as const, label: '월간 캘린더' },
            { key: 'requests' as const, label: `신청/결재 ${pendingRequests > 0 ? `(${pendingRequests})` : ''}` },
            { key: 'emergency' as const, label: `긴급연차 ${emergencyRequests.length > 0 ? `(${emergencyRequests.length})` : ''}` },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
          ))}
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="직원 검색..." className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-full sm:w-48 focus:outline-none focus:border-blue-400" />
            </div>
            <Select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} options={[{ value: '', label: '전체 부서' }, ...deptNames.map((n) => ({ value: n, label: n }))]} />
          </div>
        )}
      </div>

      {/* 부서별 탭 — 본부 1차 + 팀 2차 계층 */}
      {activeTab === 'overview' && isAdmin && departments.length > 0 && (() => {
        const rootDepts = departments.filter(d => !d.parent_id)
        const selectedDept = departments.find(d => d.name === filterDept)
        const showingRoot = !selectedDept || !selectedDept.parent_id
        const rootDeptOfSelected = selectedDept?.parent_id
          ? departments.find(d => d.id === selectedDept.parent_id)
          : selectedDept
        const teams = rootDeptOfSelected
          ? departments.filter(d => d.parent_id === rootDeptOfSelected.id)
          : []

        // 본부 하위 인원 모두 계산 (본부 + 팀 소속 모두)
        const countForDept = (dept: Department) => {
          const teamIds = departments.filter(d => d.parent_id === dept.id).map(d => d.id)
          const allIds = [dept.id, ...teamIds]
          return employeeLeaveData.filter(e => allIds.includes(e.department_id || '')).length
        }

        return (
          <div className="space-y-2">
            {/* 1차: 본부 */}
            <div className="flex items-center gap-1.5 flex-wrap overflow-x-auto pb-1">
              <button
                onClick={() => setFilterDept('')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  !filterDept ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                전체 ({employeeLeaveData.length})
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
                    {d.name} ({countForDept(d)})
                  </button>
                )
              })}
            </div>

            {/* 2차: 팀 (본부 선택 시만) */}
            {!showingRoot || teams.length > 0 ? (
              rootDeptOfSelected && teams.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap overflow-x-auto pb-1 pl-4 border-l-2 border-blue-200">
                  <button
                    onClick={() => setFilterDept(rootDeptOfSelected.name)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                      filterDept === rootDeptOfSelected.name ? 'bg-blue-400 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    본부 전체
                  </button>
                  {teams.map((t) => {
                    const teamCount = employeeLeaveData.filter(e => e.department_id === t.id).length
                    return (
                      <button
                        key={t.id}
                        onClick={() => setFilterDept(t.name)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                          filterDept === t.name ? 'bg-blue-400 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {t.name} ({teamCount})
                      </button>
                    )
                  })}
                </div>
              )
            ) : null}
          </div>
        )
      })()}

      {/* ─── 연차 현황 그리드 (타일) ─────────────────────────── */}
      {activeTab === 'overview' && (
        filteredData.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-gray-400">연차 데이터가 없습니다</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredData.map((emp) => {
              const isWarning = emp.remainingAnnual > 5 && emp.usageRate < 50
              const isUrgent = emp.remainingAnnual > 5 && emp.usageRate < 30
              return (
                <Card
                  key={emp.id}
                  className={`${isUrgent ? 'border-red-200 bg-red-50/30' : isWarning ? 'border-amber-200 bg-amber-50/20' : 'hover:shadow-sm'} transition-shadow`}
                >
                  <CardContent className="p-4">
                    {/* 상단: 이름 + 상태 */}
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">{emp.name[0]}</div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{emp.name}</p>
                          <p className="text-[10px] text-gray-500 truncate">{getDeptName(emp.department_id)}</p>
                        </div>
                      </div>
                      {isUrgent ? <Badge variant="danger" className="text-[10px] shrink-0">촉진 필요</Badge> : isWarning ? <Badge variant="warning" className="text-[10px] shrink-0">주의</Badge> : emp.usageRate >= 80 ? <Badge variant="success" className="text-[10px] shrink-0">양호</Badge> : <Badge variant="default" className="text-[10px] shrink-0">정상</Badge>}
                    </div>

                    {/* 촉진 이메일 자동 전송 버튼 — 촉진/주의 대상만 */}
                    {(isUrgent || isWarning) && emp.email && isAdmin && (
                      <button
                        disabled={sendingPromotionId === emp.id}
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (!confirm(`${emp.name}님께 연차 촉진 이메일을 자동 발송하시겠습니까?`)) return
                          setSendingPromotionId(emp.id)
                          try {
                            const { subject, html } = annualLeavePromotionEmail(emp.name, emp.remainingAnnual, emp.usageRate, currentYear)
                            const res = await fetch('/api/send-email', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ to: emp.email, subject, html }),
                            })
                            const result = await res.json()
                            if (!res.ok || !result.success) {
                              toast(`발송 실패: ${result.error || 'HTTP ' + res.status}`, 'error')
                            } else {
                              toast(`${emp.name}님께 연차 촉진 메일을 발송했습니다.`, 'success')
                            }
                          } catch (err) {
                            toast('발송 중 오류: ' + (err instanceof Error ? err.message : '알 수 없음'), 'error')
                          }
                          setSendingPromotionId(null)
                        }}
                        className={`w-full mb-2 flex items-center justify-center gap-1.5 text-[11px] font-medium rounded-md px-2 py-1.5 transition-colors ${
                          sendingPromotionId === emp.id
                            ? 'bg-gray-100 text-gray-400 cursor-wait'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                        }`}
                      >
                        {sendingPromotionId === emp.id ? '발송 중...' : '✉️ 연차촉진 이메일 전송'}
                      </button>
                    )}

                    {/* 중단: 잔여 큰 숫자 + 진행률 */}
                    <div className="mb-3">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-blue-600">{emp.remainingAnnual}</span>
                        <span className="text-xs text-gray-400">/ {emp.totalAnnual}일 잔여</span>
                      </div>
                      <div className="mt-1.5">
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${emp.usageRate >= 80 ? 'bg-emerald-500' : emp.usageRate >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${emp.usageRate}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5 text-right">소진율 {emp.usageRate}%</p>
                      </div>
                    </div>

                    {/* 하단: 총연차 / 사용 수정 */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                      <div>
                        <p className="text-[10px] text-gray-400 mb-0.5">총 연차</p>
                        {isAdmin ? (
                          <input
                            type="number" defaultValue={emp.totalAnnual} min="0" max="25"
                            onBlur={async (e) => {
                              const val = parseInt(e.target.value) || 0
                              if (val === emp.totalAnnual) return
                              const hr = hrDetails.find(h => h.employee_id === emp.id)
                              if (hr) {
                                await supabase.from('employee_hr_details').update({
                                  annual_leave_total: val,
                                  annual_leave_remaining: val - (hr.annual_leave_used || 0),
                                }).eq('id', hr.id)
                              } else {
                                await supabase.from('employee_hr_details').insert({
                                  employee_id: emp.id, annual_leave_total: val, annual_leave_used: 0, annual_leave_remaining: val,
                                })
                              }
                              toast(`${emp.name} 총연차 ${val}일`, 'success')
                              fetchData()
                            }}
                            className="w-full px-1.5 py-0.5 text-center text-sm border border-gray-200 rounded hover:border-blue-400 focus:outline-none focus:border-blue-500"
                          />
                        ) : <p className="text-sm font-medium text-gray-900">{emp.totalAnnual}일</p>}
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 mb-0.5">사용</p>
                        {isAdmin ? (
                          <input
                            type="number" defaultValue={emp.usedAnnual} min="0"
                            onBlur={async (e) => {
                              const val = parseInt(e.target.value) || 0
                              if (val === emp.usedAnnual) return
                              const hr = hrDetails.find(h => h.employee_id === emp.id)
                              if (hr) {
                                await supabase.from('employee_hr_details').update({
                                  annual_leave_used: val,
                                  annual_leave_remaining: (hr.annual_leave_total || 0) - val,
                                }).eq('id', hr.id)
                                toast(`${emp.name} 사용 ${val}일`, 'success')
                                fetchData()
                              }
                            }}
                            className="w-full px-1.5 py-0.5 text-center text-sm border border-gray-200 rounded hover:border-blue-400 focus:outline-none focus:border-blue-500"
                          />
                        ) : <p className="text-sm font-medium text-gray-600">{emp.usedAnnual}일</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
      )}

      {/* ─── 월간 캘린더 (C7) ───────────────────────────── */}
      {activeTab === 'calendar' && (
        <LeaveCalendar
          year={calendarYear}
          month={calendarMonth}
          onChangeMonth={(y, m) => { setCalendarYear(y); setCalendarMonth(m) }}
          leaveRequests={leaveRequests}
          employees={employees}
          departments={departments}
          filterDept={filterDept}
          profileId={profile?.id}
          isAdmin={isAdmin}
        />
      )}

      {/* ─── 신청/결재 관리 ───────────────────────────── */}
      {activeTab === 'requests' && (
        <div className="space-y-3">
          {leaveRequests.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-gray-400">연차 신청 내역이 없습니다</CardContent></Card>
          ) : leaveRequests.map((req) => {
            const line = (req.approval_line || []) as ApprovalStep[]
            const currentStep = req.current_step ?? 0
            const isMyTurn = line[currentStep]?.approver_id === profile?.id && (req.approval_status === 'in_review' || req.approval_status === 'pending')

            return (
              <Card key={req.id} className={isMyTurn ? 'border-blue-300 bg-blue-50/30' : ''}>
                <CardContent className="py-4">
                  {/* 상단: 신청자 정보 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                        {getEmpName(req.employee_id)[0]}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-900">{getEmpName(req.employee_id)}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="default" className="text-[10px]">{LEAVE_TYPE_LABELS[req.leave_type] || req.leave_type}</Badge>
                          <span className="text-[11px] text-gray-500">{req.start_date} ~ {req.end_date} ({req.days_count}일)</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${LEAVE_STATUS_COLORS[req.approval_status]}`}>{LEAVE_STATUS_LABELS[req.approval_status] || req.approval_status}</Badge>
                      <span className="text-[10px] text-gray-400">{new Date(req.created_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                  </div>

                  {/* 신청 내용 상세 — 결재자가 사유·기간을 한눈에 확인 (F2-1) */}
                  <div className="ml-11 mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1.5">
                    <p className="text-[11px] font-semibold text-gray-500">신청 내용</p>
                    <div className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-xs">
                      <span className="text-gray-500">유형</span>
                      <span className="text-gray-900 font-medium">{LEAVE_TYPE_LABELS[req.leave_type] || req.leave_type}</span>
                      <span className="text-gray-500">기간</span>
                      <span className="text-gray-900">{req.start_date} ~ {req.end_date} ({req.days_count}일)</span>
                      <span className="text-gray-500">사유</span>
                      <span className={req.reason ? 'text-gray-900 whitespace-pre-line break-words' : 'text-gray-400'}>
                        {req.reason || '사유 미기재'}
                      </span>
                    </div>
                  </div>

                  {/* 결재라인 시각화 — 세로 타임라인 */}
                  {line.length > 0 && (
                    <div className="pl-11 mb-3">
                      <ApprovalLineViewer
                        steps={line.map((step) => ({
                          role_label: step.role_label,
                          approver_name: step.approver_name,
                          status: step.status,
                          acted_at: step.acted_at,
                        }))}
                        currentStepIndex={(req.approval_status === 'in_review' || req.approval_status === 'pending') ? currentStep : -1}
                        compact
                      />
                    </div>
                  )}

                  {/* 본인 차례일 때 승인/반려 버튼 */}
                  {isMyTurn && (
                    <div className="flex gap-2 pl-11">
                      <Button size="sm" onClick={() => handleApprovalAction(req.id, 'approved')} className="bg-emerald-600 hover:bg-emerald-700">
                        승인
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleApprovalAction(req.id, 'rejected')} className="text-red-600 hover:bg-red-50">
                        반려
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── 긴급연차 탭 (PDCA #4) — 목록/상세/보완/전환/무급 ─────── */}
      {activeTab === 'emergency' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-[12px] text-blue-800">
            긴급연차는 우측 상단 <strong>[연차 신청]</strong> &gt; <strong>[긴급 연차 신청]</strong> 토글로 신청합니다.
            출근 후 보완자료(병가=진료확인서/진단서)를 첨부하고 [연차 신청]으로 정식 전환하세요.
          </div>
          {emergencyRequests.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-gray-400">긴급연차 내역이 없습니다</CardContent></Card>
          ) : emergencyRequests.map((req) => {
            const mine = req.employee_id === profile?.id
            const canPromote = mine && (req.status === 'filed' || req.status === 'supplemented')
            const sickNeedsProof = req.leave_kind === 'sick' && !req.attachment_path
            return (
              <Card key={req.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-700">
                        {getEmpName(req.employee_id)[0]}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-900">{getEmpName(req.employee_id)}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="default" className="text-[10px]">{EMG_KIND_LABELS[req.leave_kind]}</Badge>
                          <span className="text-[11px] text-gray-500">{req.start_date} ~ {req.end_date} ({req.days_count}일)</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${EMG_STATUS_COLORS[req.status]}`}>{EMG_STATUS_LABELS[req.status]}</Badge>
                      <span className="text-[10px] text-gray-400">{new Date(req.created_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                  </div>

                  <div className="pl-11 space-y-1 text-xs text-gray-600">
                    <p><span className="text-gray-400">사유:</span> {req.reason}</p>
                    {req.handover_notes && <p><span className="text-gray-400">인수인계:</span> {req.handover_notes}</p>}
                    {(req.delegate_employee_id || req.delegate_name_text) && (
                      <p><span className="text-gray-400">대리인:</span> {req.delegate_employee_id ? getEmpName(req.delegate_employee_id) : req.delegate_name_text}</p>
                    )}
                    {req.hospital_plan && <p><span className="text-gray-400">병원 계획:</span> {req.hospital_plan}</p>}
                    <p>
                      <span className="text-gray-400">전자결재:</span>{' '}
                      {req.same_day_filing == null ? '미입력' : req.same_day_filing ? '당일 상신 가능' : '익일 사후 상신'}
                      {req.filing_note ? ` (${req.filing_note})` : ''}
                    </p>
                    {req.notified_at && <p className="text-[11px] text-emerald-600">✓ 임원진 통보 완료 ({new Date(req.notified_at).toLocaleString('ko-KR')})</p>}
                    {(req.paid_deduct_days > 0 || req.unpaid_days > 0) && (
                      <p className="text-[11px] text-purple-700">연차 차감 {req.paid_deduct_days}일 / 무급 {req.unpaid_days}일</p>
                    )}
                  </div>

                  {/* 액션 */}
                  <div className="flex flex-wrap items-center gap-2 pl-11 mt-3">
                    {/* 보완자료 업로드 (본인) */}
                    {mine && req.status !== 'cancelled' && (
                      <label className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer ${emgUploadingId === req.id ? 'opacity-50 pointer-events-none' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                        {emgUploadingId === req.id ? '업로드중...' : (req.attachment_path ? '보완자료 재첨부' : (req.leave_kind === 'sick' ? '진단서 첨부' : '사유서 첨부'))}
                        <input type="file" className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEmergencyUpload(req, f); e.currentTarget.value = '' }} />
                      </label>
                    )}
                    {/* 첨부 다운로드 */}
                    {req.attachment_path && (
                      <Button size="sm" variant="outline" onClick={() => handleEmergencyDownload(req)}>첨부 보기</Button>
                    )}
                    {/* 정식 전환 (본인) */}
                    {canPromote && (
                      <Button size="sm" onClick={() => handlePromoteEmergency(req)} disabled={emgPromotingId === req.id || sickNeedsProof}
                        className="bg-purple-600 hover:bg-purple-700">
                        {emgPromotingId === req.id ? '전환중...' : '연차 신청 (정식 전환)'}
                      </Button>
                    )}
                    {canPromote && sickNeedsProof && (
                      <span className="text-[11px] text-red-600">※ 병가는 진단서 첨부 후 전환 가능</span>
                    )}
                    {req.status === 'promoted' && (
                      <span className="text-[11px] text-emerald-600">✓ 정식 연차 상신됨 (신청/결재 탭에서 진행)</span>
                    )}
                    {/* 무급 처리 (관리자) — 전환된 건 대상 */}
                    {isAdmin && req.status === 'promoted' && (
                      <Button size="sm" variant="outline" onClick={() => openPayoutModal(req)}>무급 처리</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* 긴급연차 무급 처리 모달 (관리자) */}
      <Dialog open={!!payoutTarget} onClose={() => !payoutSaving && setPayoutTarget(null)} title="긴급연차 무급 처리">
        {payoutTarget && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              <p>{getEmpName(payoutTarget.employee_id)} · {EMG_KIND_LABELS[payoutTarget.leave_kind]} · {payoutTarget.start_date}~{payoutTarget.end_date}</p>
              <p className="mt-1 font-medium text-gray-800">신청 일수: {payoutTarget.days_count}일</p>
              <p className="mt-1 text-[11px] text-amber-700">잔여 연차 부족 시 차감분/무급분을 나눠 입력하세요. 합계는 신청 일수와 일치해야 합니다.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="연차 차감 일수" type="number" value={payoutPaid} onChange={(e) => setPayoutPaid(e.target.value)} min="0" step="0.5" />
              <Input label="무급 대체 일수" type="number" value={payoutUnpaid} onChange={(e) => setPayoutUnpaid(e.target.value)} min="0" step="0.5" />
            </div>
            <p className="text-[11px] text-gray-500">
              ※ 무급분이 있으면 연결된 정식 연차의 차감 일수를 자동으로 차감분({payoutPaid}일)으로 조정합니다.
              (단 정식 연차가 아직 미승인일 때만 — 이미 승인된 경우 급여 정산에서 별도 처리)
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPayoutTarget(null)} disabled={payoutSaving}>취소</Button>
              <Button onClick={handleSavePayout} disabled={payoutSaving}>{payoutSaving ? '저장중...' : '무급 처리 저장'}</Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* ─── 연차 신청 — 전체 페이지뷰 (모달 X, approval.tsx 패턴 / 결재라인 포함) ─────── */}
      {showRequestDialog && (
      <div className="fixed inset-0 z-30 bg-gray-50 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="sticky top-0 bg-gray-50 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-b border-gray-200 z-10 flex items-center justify-between mb-4 sm:mb-6">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">연차 신청</h1>
            <Button variant="ghost" onClick={() => setShowRequestDialog(false)}>
              <X className="h-4 w-4 mr-1" /> 닫기
            </Button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="space-y-4">
          {/* PDCA #4: [일반]/[긴급] 토글 — 긴급은 결재선 없이 즉시 통보 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setReqMode('normal')}
              className={`px-3 py-2 rounded-lg text-sm font-bold border transition ${reqMode === 'normal' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'}`}
            >일반 연차 신청</button>
            <button
              type="button"
              onClick={() => setReqMode('emergency')}
              className={`px-3 py-2 rounded-lg text-sm font-bold border transition ${reqMode === 'emergency' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200'}`}
            >긴급 연차 신청</button>
          </div>

          {reqMode === 'emergency' && (
            <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 text-[12px] text-red-700 leading-relaxed">
              ⚠️ 긴급연차는 <strong>결재 단계 없이 즉시 상신</strong>되며, 신청과 동시에 임원진(인사담당·대표·임원)에게 이메일이 자동 발송됩니다.
              출근 후 보완자료(병가=진료확인서/진단서, 그 외=사유서)를 첨부해 정식 연차로 전환할 수 있습니다.
            </div>
          )}

          {reqMode === 'normal' ? (
          <>
          <Select label="유형 *" value={reqLeaveType} onChange={(e) => setReqLeaveType(e.target.value)}
            options={Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))} />

          <div className="grid grid-cols-2 gap-3">
            <Input label="시작일 *" type="date" value={reqStartDate} onChange={(e) => setReqStartDate(e.target.value)} />
            <Input label="종료일 *" type="date" value={reqEndDate} onChange={(e) => setReqEndDate(e.target.value)} />
          </div>
          <Input label="일수" type="number" value={String(reqDays)} onChange={(e) => setReqDays(Number(e.target.value))} min="0.5" step="0.5" />
          <Input label="사유 (선택)" value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder="사유를 입력하세요" />

          {/* 결재라인 — approval_templates(doc_type='leave') 기반 세로 타임라인 미리보기 */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-gray-800">결재 진행 흐름 (자동 지정)</h4>
              <span className="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-white border border-gray-200">변경 불가</span>
            </div>
            {(() => {
              const steps: { role_label: string; approver_name: string; status: 'pending' }[] = []
              if (effectiveLeaveTemplate && effectiveLeaveTemplate.steps && effectiveLeaveTemplate.steps.length > 0) {
                const used = new Set<string>([profile?.id || ''])
                for (const ts of effectiveLeaveTemplate.steps) {
                  let candidates: typeof allEmployees = []
                  // 우선순위 1: 관리자가 지정한 approver_ids
                  if (Array.isArray(ts.approver_ids) && ts.approver_ids.length > 0) {
                    candidates = ts.approver_ids
                      .map((id) => allEmployees.find((e) => e.id === id))
                      .filter((e): e is typeof allEmployees[number] => !!e)
                  } else if (ts.role === 'leader') candidates = autoLeader ? [autoLeader] : leaders
                  else if (ts.role === 'executive' || ts.role === 'director' || ts.role === 'division_head')
                    candidates = allEmployees.filter((e) => e.role && ['director','division_head','executive'].includes(e.role))
                  else if (ts.role === 'hr_admin') candidates = hrAdmin ? [hrAdmin] : []
                  else if (ts.role === 'ceo') candidates = ceo ? [ceo] : []
                  else if (ts.role === 'finance') candidates = allEmployees.filter((e) => e.role === 'finance')
                  else candidates = allEmployees.filter((e) => e.role === ts.role)
                  for (const c of candidates) {
                    if (used.has(c.id)) continue
                    used.add(c.id)
                    steps.push({ role_label: ts.label || ts.role, approver_name: c.name, status: 'pending' })
                  }
                }
              } else {
                if (autoLeader) steps.push({ role_label: '리더', approver_name: autoLeader.name, status: 'pending' })
                if (hrAdmin && hrAdmin.id !== autoLeader?.id) steps.push({ role_label: '인사담당', approver_name: hrAdmin.name, status: 'pending' })
                if (autoDirector && autoDirector.id !== autoLeader?.id && autoDirector.id !== hrAdmin?.id)
                  steps.push({ role_label: '임원', approver_name: autoDirector.name, status: 'pending' })
                if (ceo) steps.push({ role_label: '대표', approver_name: ceo.name, status: 'pending' })
              }
              if (steps.length === 0) {
                return <p className="text-[11px] text-red-600 font-medium">⚠️ 결재 대상자가 없습니다. 관리자에게 문의하세요.</p>
              }
              return (
                <ApprovalLineViewer
                  requesterName={profile?.name || '본인'}
                  steps={steps}
                  currentStepIndex={-1}
                  showStatus={false}
                />
              )
            })()}
          </div>
          </>
          ) : (
          <>
          {/* 긴급연차 전용 폼 (PDCA #4) */}
          <Select label="유형 *" value={emgKind} onChange={(e) => setEmgKind(e.target.value as 'emergency' | 'sick')}
            options={[{ value: 'emergency', label: '긴급사유 (개인 긴급 상황)' }, { value: 'sick', label: '병가 (질병/병원)' }]} />

          <div className="grid grid-cols-2 gap-3">
            <Input label="시작일 *" type="date" value={reqStartDate} onChange={(e) => setReqStartDate(e.target.value)} />
            <Input label="종료일 *" type="date" value={reqEndDate} onChange={(e) => setReqEndDate(e.target.value)} />
          </div>
          <Input label="일수" type="number" value={String(reqDays)} onChange={(e) => setReqDays(Number(e.target.value))} min="0.5" step="0.5" />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">연차 사유 * <span className="text-gray-400 font-normal">(구체적으로)</span></label>
            <textarea className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" rows={2}
              value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder="예: 새벽 고열로 오전 병원 진료 필요" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">업무 인수인계 <span className="text-gray-400 font-normal">(당일 처리할 급한 업무)</span></label>
            <textarea className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" rows={2}
              value={emgHandover} onChange={(e) => setEmgHandover(e.target.value)} placeholder="예: A프로젝트 납품 메일 발송 — 대리인에게 위임" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select label="업무 대리인 (직원 선택)" value={emgDelegateId}
              onChange={(e) => { setEmgDelegateId(e.target.value); if (e.target.value) setEmgDelegateName('') }}
              options={[{ value: '', label: '— 선택 —' }, ...allEmployees.filter((e) => e.id !== profile?.id).map((e) => ({ value: e.id, label: e.name }))]} />
            <Input label="대리인 직접 입력" value={emgDelegateName} disabled={!!emgDelegateId}
              onChange={(e) => setEmgDelegateName(e.target.value)} placeholder="목록에 없으면 입력" />
          </div>

          {emgKind === 'sick' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">병원 방문 계획 <span className="text-red-500">(병가 — 증빙서류 확보 계획)</span></label>
              <textarea className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" rows={2}
                value={emgHospitalPlan} onChange={(e) => setEmgHospitalPlan(e.target.value)} placeholder="예: 오전 9시 ○○내과 진료 후 진료확인서 발급 예정" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">연차 신청일 — 전자결재 상신</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEmgSameDayFiling(true)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border ${emgSameDayFiling === true ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'}`}>당일 상신 가능</button>
              <button type="button" onClick={() => setEmgSameDayFiling(false)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border ${emgSameDayFiling === false ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'}`}>익일 사후 상신</button>
            </div>
            {emgSameDayFiling === false && (
              <div className="mt-2">
                <Input label="사후 상신 사유 (선택)" value={emgFilingNote} onChange={(e) => setEmgFilingNote(e.target.value)} placeholder="예: 당일 거동 어려워 익일 출근 후 상신" />
              </div>
            )}
          </div>

          {/* 비상연락망 안내 (Q6 상수) */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-[12px] text-blue-800 leading-relaxed">
            📞 {EMERGENCY_CONTACT_NOTICE}
          </div>
          </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>취소</Button>
            {reqMode === 'normal' ? (
              <Button onClick={handleSubmitRequest} disabled={saving}>
                {saving ? '처리중...' : '신청'}
              </Button>
            ) : (
              <Button onClick={handleSubmitEmergency} disabled={saving} className="bg-red-600 hover:bg-red-700">
                {saving ? '처리중...' : '긴급연차 신청'}
              </Button>
            )}
          </div>
        </div>
          </div>
        </div>
      </div>
      )}

      {/* 연차 자동 계산 — 미리보기/검토/수정 다이얼로그 */}
      <Dialog open={!!autoCalcPreview} onClose={() => !autoCalcApplying && setAutoCalcPreview(null)} title="연차 자동 계산 — 검토 후 적용">
        {autoCalcPreview && (
          <div className="space-y-3 max-w-5xl">
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
              자동 계산 결과를 검토하고 필요시 직접 수정하세요. <strong>"적용" 체크된 직원만</strong> DB에 저장됩니다.
              <div className="text-xs text-amber-700 mt-1">
                ※ 입사일 기준 근로기준법 60조 자동 계산. 회사 사규(만 1년 미만 월차/이월/특별휴가 등) 적용 시 수동 보정 필요.
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-brand-600 hover:underline text-xs"
                  onClick={() => setAutoCalcPreview((prev) => prev?.map(p => ({ ...p, apply: true })) || null)}
                >전체 선택</button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  className="text-gray-500 hover:underline text-xs"
                  onClick={() => setAutoCalcPreview((prev) => prev?.map(p => ({ ...p, apply: false })) || null)}
                >전체 해제</button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  className="text-amber-700 hover:underline text-xs"
                  onClick={() => setAutoCalcPreview((prev) => prev?.map(p => ({ ...p, apply: p.currentTotal !== p.calcTotal })) || null)}
                >변경되는 직원만 선택</button>
              </div>
              <div className="text-xs text-gray-500">
                적용 대상: {autoCalcPreview.filter(p => p.apply).length} / {autoCalcPreview.length}명
              </div>
            </div>

            <div className="border rounded-md max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-xs text-gray-600">
                    <th className="px-3 py-2 w-12">적용</th>
                    <th className="px-3 py-2">이름</th>
                    <th className="px-3 py-2">입사일</th>
                    <th className="px-3 py-2 text-right">현재</th>
                    <th className="px-3 py-2 text-right">사용</th>
                    <th className="px-3 py-2 text-right">계산</th>
                    <th className="px-3 py-2 text-right">최종 (수정)</th>
                    <th className="px-3 py-2">산정 기준</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {autoCalcPreview.map((row, idx) => {
                    const isChanged = row.currentTotal !== row.finalTotal
                    return (
                      <tr key={row.employeeId} className={row.apply ? 'bg-emerald-50/50' : 'opacity-60'}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={row.apply}
                            onChange={(e) => {
                              const next = [...autoCalcPreview]
                              next[idx] = { ...row, apply: e.target.checked }
                              setAutoCalcPreview(next)
                            }}
                            className="h-4 w-4"
                            disabled={autoCalcApplying}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium">{row.name}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{row.hireDate.replaceAll('-', '.')}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{row.currentTotal ?? '-'}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{row.currentUsed}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{row.calcTotal}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={row.finalTotal}
                            min={0}
                            step={0.5}
                            onChange={(e) => {
                              const next = [...autoCalcPreview]
                              next[idx] = { ...row, finalTotal: parseFloat(e.target.value) || 0 }
                              setAutoCalcPreview(next)
                            }}
                            disabled={autoCalcApplying || !row.apply}
                            className={`w-20 text-right border rounded px-2 py-1 text-sm ${
                              isChanged ? 'border-amber-400 bg-amber-50 font-semibold' : 'border-gray-200'
                            }`}
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{row.description}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setAutoCalcPreview(null)} disabled={autoCalcApplying}>
                취소
              </Button>
              <Button
                onClick={async () => {
                  if (!autoCalcPreview) return
                  const toApply = autoCalcPreview.filter(p => p.apply)
                  if (toApply.length === 0) { toast('적용할 직원이 없습니다.', 'error'); return }
                  if (!confirm(`${toApply.length}명의 연차를 업데이트합니다. 계속하시겠습니까?`)) return
                  setAutoCalcApplying(true)
                  let ok = 0, fail = 0
                  for (const row of toApply) {
                    try {
                      const hr = hrDetails.find(h => h.employee_id === row.employeeId)
                      if (hr) {
                        const { error } = await supabase.from('employee_hr_details').update({
                          annual_leave_total: row.finalTotal,
                          annual_leave_remaining: row.finalTotal - row.currentUsed,
                          annual_leave_basis: row.description,
                        }).eq('id', hr.id)
                        if (error) throw error
                      } else {
                        const { error } = await supabase.from('employee_hr_details').insert({
                          employee_id: row.employeeId,
                          annual_leave_total: row.finalTotal,
                          annual_leave_used: 0,
                          annual_leave_remaining: row.finalTotal,
                          annual_leave_basis: row.description,
                        })
                        if (error) throw error
                      }
                      ok++
                    } catch (err) {
                      console.error(`[${row.name}] 적용 실패:`, err)
                      fail++
                    }
                  }
                  setAutoCalcApplying(false)
                  setAutoCalcPreview(null)
                  if (fail === 0) toast(`${ok}명 연차 업데이트 완료`, 'success')
                  else toast(`완료 ${ok}명 / 실패 ${fail}명`, 'error')
                  fetchData()
                }}
                disabled={autoCalcApplying || autoCalcPreview.every(p => !p.apply)}
              >
                {autoCalcApplying ? '적용 중...' : `선택한 ${autoCalcPreview.filter(p => p.apply).length}명에 적용`}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}

/* ─── C7: 월간 연차 캘린더 ───────────────────────────── */

const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function LeaveCalendar({
  year, month, onChangeMonth,
  leaveRequests, employees, departments, filterDept, profileId: _profileId, isAdmin: _isAdmin,
}: {
  year: number
  month: number
  onChangeMonth: (y: number, m: number) => void
  leaveRequests: LeaveRequest[]
  employees: Employee[]
  departments: Department[]
  filterDept: string
  profileId: string | undefined
  isAdmin: boolean
}) {
  // 방어: 월 경계 안전 계산
  const safeMonth = Math.max(0, Math.min(11, month))
  const firstDay = new Date(year, safeMonth, 1)
  const lastDay = new Date(year, safeMonth + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startWeekday = firstDay.getDay() // 0=일

  // D1-8: 본부(division) 체크박스 다중 필터 — 기본은 전체 선택
  // 대표 본부는 부서 단위 필터 의미 없으므로 제외
  const divisions = departments.filter((d) => {
    if (d.parent_id) return false
    const n = (d.name || '').trim()
    if (/^대표|^CEO|대표이사/i.test(n)) return false
    return true
  })
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<Set<string>>(new Set())
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())

  // 외부에서 넘어온 filterDept (Overview 탭의 기존 필터와 호환)
  const externalDeptFilter = useMemo(() => {
    if (!filterDept) return null
    const selected = departments.find(d => d.name === filterDept)
    if (!selected) return new Set<string>()
    const teamIds = departments.filter(d => d.parent_id === selected.id).map(d => d.id)
    const allowIds = new Set<string>([selected.id, ...teamIds])
    return new Set<string>(employees.filter(e => e.department_id && allowIds.has(e.department_id)).map(e => e.id))
  }, [filterDept, departments, employees])

  // 캘린더 내부 체크박스 필터 기반 allowed set
  const internalAllowedEmpIds = useMemo(() => {
    // 아무것도 선택 안 되어 있으면 전체
    if (selectedDivisionIds.size === 0 && selectedTeamIds.size === 0) return null
    const allowIds = new Set<string>()
    // 본부 선택 → 해당 본부 전체 (하위 팀 포함)
    for (const divId of selectedDivisionIds) {
      allowIds.add(divId)
      departments.filter(d => d.parent_id === divId).forEach((t) => allowIds.add(t.id))
    }
    // 팀 개별 선택
    for (const teamId of selectedTeamIds) allowIds.add(teamId)
    return new Set<string>(employees.filter(e => e.department_id && allowIds.has(e.department_id)).map(e => e.id))
  }, [selectedDivisionIds, selectedTeamIds, departments, employees])

  // 최종 필터: 내부 체크박스 > 외부 filterDept > 전체
  const allowedEmpIds = internalAllowedEmpIds ?? externalDeptFilter

  function toggleDivision(id: string) {
    setSelectedDivisionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTeam(id: string) {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearFilters() {
    setSelectedDivisionIds(new Set())
    setSelectedTeamIds(new Set())
  }

  // 날짜별 휴가 매핑 (승인된 것만, pending은 희미하게)
  // D1-8: 전 직원에게 공유 — isAdmin 제한 제거
  const leavesByDate = useMemo(() => {
    const map = new Map<string, Array<{ emp: Employee; req: LeaveRequest }>>()
    const empMap = new Map(employees.map(e => [e.id, e]))

    for (const req of leaveRequests) {
      // 방어: 날짜 파싱
      let sd: Date, ed: Date
      try {
        sd = new Date(req.start_date + 'T00:00:00')
        ed = new Date(req.end_date + 'T00:00:00')
        if (isNaN(sd.getTime()) || isNaN(ed.getTime())) continue
      } catch { continue }

      const emp = empMap.get(req.employee_id)
      if (!emp) continue
      if (allowedEmpIds && !allowedEmpIds.has(req.employee_id)) continue

      // 해당 월과 겹치는 날짜만 iterate
      const iterStart = sd < firstDay ? new Date(firstDay) : new Date(sd)
      const iterEnd = ed > lastDay ? new Date(lastDay) : new Date(ed)
      if (iterEnd < iterStart) continue

      const cursor = new Date(iterStart)
      while (cursor <= iterEnd) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`
        const list = map.get(key) || []
        list.push({ emp, req })
        map.set(key, list)
        cursor.setDate(cursor.getDate() + 1)
      }
    }
    return map
  }, [leaveRequests, employees, allowedEmpIds, firstDay, lastDay])

  // 캘린더 그리드: 앞 공백 + 실제 날짜
  const cells: Array<{ day: number | null; dateKey: string | null }> = []
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, dateKey: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(safeMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    cells.push({ day: d, dateKey })
  }
  // 주말 맞추기 (7배수)
  while (cells.length % 7 !== 0) cells.push({ day: null, dateKey: null })

  const goPrev = () => {
    const m = safeMonth - 1
    if (m < 0) onChangeMonth(year - 1, 11)
    else onChangeMonth(year, m)
  }
  const goNext = () => {
    const m = safeMonth + 1
    if (m > 11) onChangeMonth(year + 1, 0)
    else onChangeMonth(year, m)
  }
  const goToday = () => { const n = new Date(); onChangeMonth(n.getFullYear(), n.getMonth()) }

  const totalInMonth = Array.from(leavesByDate.values()).reduce((acc, arr) => acc + arr.length, 0)

  // 범례용 유형 색
  const typeColor = (t: string) => {
    if (t === 'annual') return 'bg-brand-100 text-brand-700 border-brand-300'
    if (t === 'half_am' || t === 'half_pm') return 'bg-amber-100 text-amber-700 border-amber-300'
    if (t === 'sick') return 'bg-rose-100 text-rose-700 border-rose-300'
    if (t === 'child') return 'bg-emerald-100 text-emerald-700 border-emerald-300'
    if (t === 'special') return 'bg-violet-100 text-violet-700 border-violet-300'
    return 'bg-gray-100 text-gray-600 border-gray-300'
  }
  const typeShort = (t: string) => {
    if (t === 'annual') return '연차'
    if (t === 'half_am') return 'AM'
    if (t === 'half_pm') return 'PM'
    if (t === 'sick') return '병가'
    if (t === 'child') return '자녀'
    if (t === 'special') return '특별'
    return t
  }
  const statusOpacity = (s: string) => (s === 'approved' ? '' : 'opacity-60')

  return (
    <div className="space-y-3">
      {/* 컨트롤 바 */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={goPrev}>◀</Button>
              <span className="text-base font-bold text-gray-800 min-w-[120px] text-center">
                {year}년 {safeMonth + 1}월
              </span>
              <Button size="sm" variant="outline" onClick={goNext}>▶</Button>
              <Button size="sm" variant="outline" onClick={goToday} className="ml-1">오늘</Button>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
              <span>이번 달 휴가: <strong className="text-brand-600">{totalInMonth}건</strong></span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { k: 'annual',  l: '연차' },
                  { k: 'half_am', l: '반차' },
                  { k: 'sick',    l: '병가' },
                  { k: 'child',   l: '자녀' },
                  { k: 'special', l: '특별' },
                ].map(i => (
                  <span key={i.k} className={`text-[10px] px-1.5 py-0.5 rounded border ${typeColor(i.k)}`}>{i.l}</span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* D1-8: 본부/팀 체크박스 필터 */}
      {divisions.length > 0 && (
        <Card>
          <CardContent className="py-2.5">
            <div className="flex items-start gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 shrink-0 pt-1">
                <span className="text-xs font-bold text-gray-600">부서 필터</span>
                {(selectedDivisionIds.size > 0 || selectedTeamIds.size > 0) && (
                  <button onClick={clearFilters} className="text-[10px] text-gray-400 hover:text-gray-600 underline">전체</button>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                {divisions.map((div) => {
                  const isDivSelected = selectedDivisionIds.has(div.id)
                  const teams = departments.filter(d => d.parent_id === div.id)
                  return (
                    <div key={div.id} className="flex items-center gap-1 flex-wrap">
                      <button
                        onClick={() => toggleDivision(div.id)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                          isDivSelected ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-300 hover:border-brand-300'
                        }`}
                      >
                        {isDivSelected ? '✓ ' : ''}{div.name}
                      </button>
                      {isDivSelected && teams.length > 0 && (
                        <>
                          <span className="text-gray-300 text-[10px]">›</span>
                          {teams.map((team) => {
                            const isTeamSelected = selectedTeamIds.has(team.id)
                            return (
                              <button
                                key={team.id}
                                onClick={() => toggleTeam(team.id)}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                                  isTeamSelected ? 'bg-brand-100 text-brand-700 border-brand-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-brand-200'
                                }`}
                              >
                                {isTeamSelected ? '✓ ' : ''}{team.name}
                              </button>
                            )
                          })}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            {(selectedDivisionIds.size === 0 && selectedTeamIds.size === 0) && (
              <p className="text-[10px] text-gray-400 mt-1.5">전체 직원 연차가 표시됩니다. 본부를 선택하면 그 본부 소속만 보여집니다.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 캘린더 그리드 */}
      <Card>
        <CardContent className="p-2 sm:p-3">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 mb-1">
            {KOREAN_WEEKDAYS.map((w, i) => (
              <div key={w} className={`text-center text-xs font-semibold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
                {w}
              </div>
            ))}
          </div>
          {/* 날짜 셀 */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded overflow-hidden">
            {(() => {
              const today = new Date()
              const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
              return cells.map((c, idx) => {
                const weekday = idx % 7
                const isToday = c.dateKey === todayKey
              const leaves = c.dateKey ? (leavesByDate.get(c.dateKey) || []) : []
              return (
                <div
                  key={idx}
                  className={`bg-white min-h-[80px] sm:min-h-[96px] p-1.5 flex flex-col gap-0.5 ${c.day === null ? 'bg-gray-50' : ''} ${isToday ? 'ring-2 ring-brand-400 ring-inset' : ''}`}
                >
                  {c.day !== null && (
                    <div className={`text-[11px] font-semibold ${weekday === 0 ? 'text-red-500' : weekday === 6 ? 'text-blue-500' : 'text-gray-600'}`}>
                      {c.day}
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {leaves.slice(0, 3).map(({ emp, req }, i) => (
                      <div
                        key={`${req.id}-${i}`}
                        className={`text-[10px] px-1 py-0.5 rounded border truncate ${typeColor(req.leave_type)} ${statusOpacity(req.approval_status)}`}
                        title={`${emp.name} — ${LEAVE_TYPE_LABELS[req.leave_type] || req.leave_type} (${LEAVE_STATUS_LABELS[req.approval_status] || req.approval_status})`}
                      >
                        <span className="font-semibold">{emp.name.slice(0, 3)}</span>
                        <span className="ml-1 opacity-80">{typeShort(req.leave_type)}</span>
                      </div>
                    ))}
                    {leaves.length > 3 && (
                      <div className="text-[10px] text-gray-500 px-1">+{leaves.length - 3}명</div>
                    )}
                  </div>
                </div>
              )
            })
            })()}
          </div>
          {totalInMonth === 0 && (
            <div className="text-center text-xs text-gray-400 py-6">
              이번 달 등록된 휴가가 없습니다.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
