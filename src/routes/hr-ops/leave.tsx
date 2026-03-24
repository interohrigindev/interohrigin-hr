import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import {
  CalendarPlus, Download, Search,
  AlertTriangle, CheckCircle, Clock, Plus,
  ChevronRight,
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

/* ─── Types ─────────────────────────────────────────── */

interface Employee {
  id: string
  name: string
  department_id: string | null
  hire_date: string | null
  position: string | null
  role: string | null
}

interface Department { id: string; name: string }

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
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [currentYear] = useState(new Date().getFullYear())
  const [showRequestDialog, setShowRequestDialog] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'requests'>('overview')

  // 연차 신청 폼
  const [reqLeaveType, setReqLeaveType] = useState('annual')
  const [reqStartDate, setReqStartDate] = useState('')
  const [reqEndDate, setReqEndDate] = useState('')
  const [reqDays, setReqDays] = useState(1)
  const [reqReason, setReqReason] = useState('')
  // 결재라인
  const [reqLeaderId, setReqLeaderId] = useState('')
  const [reqDirectorId, setReqDirectorId] = useState('')
  const [saving, setSaving] = useState(false)

  // 결재라인 직원 목록 (역할별 필터)
  const leaders = useMemo(() => allEmployees.filter((e) => e.role && LEADER_ROLES.includes(e.role) && e.id !== profile?.id), [allEmployees, profile?.id])
  const directors = useMemo(() => allEmployees.filter((e) => e.role && DIRECTOR_ROLES.includes(e.role) && e.id !== profile?.id), [allEmployees, profile?.id])
  const ceo = useMemo(() => allEmployees.find((e) => e.role === 'ceo'), [allEmployees])

  useEffect(() => { fetchData() }, [profile?.id])

  async function fetchData() {
    if (!profile?.id) return
    setLoading(true)

    // 결재라인 셀렉트용으로 전 직원은 항상 가져옴
    const allEmpRes = await supabase.from('employees').select('id, name, department_id, hire_date, position, role').eq('is_active', true).order('name')
    setAllEmployees((allEmpRes.data || []) as Employee[])

    let empQuery = supabase.from('employees').select('id, name, department_id, hire_date, position, role').eq('is_active', true).order('name')
    let leaveQuery = supabase.from('employee_hr_details').select('*')
    let reqQuery = supabase.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(200)

    if (!isAdmin) {
      empQuery = empQuery.eq('id', profile.id)
      leaveQuery = leaveQuery.eq('employee_id', profile.id)
      // 본인 신청 + 본인이 결재자인 건
      reqQuery = supabase.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(200)
    }

    const [empRes, deptRes, leaveRes, reqRes] = await Promise.all([empQuery, supabase.from('departments').select('id, name').order('name'), leaveQuery, reqQuery])
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
    if (filterDept) result = result.filter((e) => getDeptName(e.department_id) === filterDept)
    if (searchQuery) { const q = searchQuery.toLowerCase(); result = result.filter((e) => e.name.toLowerCase().includes(q)) }
    return result
  }, [employeeLeaveData, filterDept, searchQuery])

  const totalEmployees = filteredData.length
  const avgUsageRate = totalEmployees > 0 ? Math.round(filteredData.reduce((s, e) => s + e.usageRate, 0) / totalEmployees) : 0
  const warningCount = filteredData.filter((e) => e.remainingAnnual > 5 && e.usageRate < 50).length
  const pendingRequests = leaveRequests.filter((r) => r.approval_status === 'pending' || r.approval_status === 'in_review').length
  const deptNames = useMemo(() => [...new Set(employees.map((e) => getDeptName(e.department_id)).filter((n) => n !== '-'))], [employees, departments])

  // ─── 연차 신청 (결재라인 포함) ─────────────────────
  async function handleSubmitRequest() {
    if (!profile?.id || !reqStartDate || !reqEndDate) { toast('필수 항목을 입력하세요', 'error'); return }
    if (!reqLeaderId) { toast('결재 리더를 선택하세요', 'error'); return }
    setSaving(true)

    // 결재라인 구성: 리더 → 이사(선택) → 대표
    const approvalLine: ApprovalStep[] = []
    let step = 0

    approvalLine.push({
      step: step++, role_label: '리더',
      approver_id: reqLeaderId,
      approver_name: getEmpName(reqLeaderId),
      status: 'pending', acted_at: null,
    })

    if (reqDirectorId) {
      approvalLine.push({
        step: step++, role_label: '이사',
        approver_id: reqDirectorId,
        approver_name: getEmpName(reqDirectorId),
        status: 'pending', acted_at: null,
      })
    }

    if (ceo) {
      approvalLine.push({
        step: step++, role_label: '대표',
        approver_id: ceo.id,
        approver_name: ceo.name,
        status: 'pending', acted_at: null,
      })
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
    setReqLeaveType('annual'); setReqStartDate(''); setReqEndDate(''); setReqDays(1); setReqReason(''); setReqLeaderId(''); setReqDirectorId('')
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">연차 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">직원별 연차 현황을 관리합니다 ({currentYear}년)</p>
        </div>
        <div className="flex gap-2">
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
            { key: 'requests' as const, label: `신청/결재 ${pendingRequests > 0 ? `(${pendingRequests})` : ''}` },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
          ))}
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="직원 검색..." className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48 focus:outline-none focus:border-blue-400" />
            </div>
            <Select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} options={[{ value: '', label: '전체 부서' }, ...deptNames.map((n) => ({ value: n, label: n }))]} />
          </div>
        )}
      </div>

      {/* ─── 연차 현황 테이블 ─────────────────────────── */}
      {activeTab === 'overview' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs">이름</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">부서</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">총 연차</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">사용</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">잔여</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">소진율</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-gray-400">연차 데이터가 없습니다</td></tr>
                  ) : filteredData.map((emp) => {
                    const isWarning = emp.remainingAnnual > 5 && emp.usageRate < 50
                    const isUrgent = emp.remainingAnnual > 5 && emp.usageRate < 30
                    return (
                      <tr key={emp.id} className={`border-b border-gray-100 hover:bg-gray-50/50 ${isUrgent ? 'bg-red-50/50' : isWarning ? 'bg-amber-50/30' : ''}`}>
                        <td className="py-2.5 px-4"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">{emp.name[0]}</div><span className="font-medium text-gray-900">{emp.name}</span></div></td>
                        <td className="py-2.5 px-3 text-xs text-gray-600">{getDeptName(emp.department_id)}</td>
                        <td className="py-2.5 px-3 text-center font-medium text-gray-900">{emp.totalAnnual}</td>
                        <td className="py-2.5 px-3 text-center text-gray-600">{emp.usedAnnual}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-blue-600">{emp.remainingAnnual}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 justify-center">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${emp.usageRate >= 80 ? 'bg-emerald-500' : emp.usageRate >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${emp.usageRate}%` }} /></div>
                            <span className="text-[10px] text-gray-500 w-8 text-right">{emp.usageRate}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">{isUrgent ? <Badge variant="danger" className="text-[10px]">촉진 필요</Badge> : isWarning ? <Badge variant="warning" className="text-[10px]">주의</Badge> : emp.usageRate >= 80 ? <Badge variant="success" className="text-[10px]">양호</Badge> : <Badge variant="default" className="text-[10px]">정상</Badge>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
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

                  {req.reason && <p className="text-xs text-gray-500 mb-3 pl-11">사유: {req.reason}</p>}

                  {/* 결재라인 시각화 */}
                  {line.length > 0 && (
                    <div className="flex items-center gap-1 pl-11 mb-3 flex-wrap">
                      {/* 신청자 */}
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-[11px] text-gray-600">
                        <div className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center text-[8px] font-bold text-white">{getEmpName(req.employee_id)[0]}</div>
                        본인
                      </div>

                      {line.map((step, i) => {
                        const isCurrent = i === currentStep && (req.approval_status === 'in_review' || req.approval_status === 'pending')
                        const isDone = step.status === 'approved'
                        const isRejected = step.status === 'rejected'
                        return (
                          <div key={i} className="flex items-center gap-1">
                            <ChevronRight className="h-3 w-3 text-gray-300" />
                            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium ${
                              isRejected ? 'bg-red-100 text-red-700' :
                              isDone ? 'bg-emerald-100 text-emerald-700' :
                              isCurrent ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white ${
                                isRejected ? 'bg-red-500' : isDone ? 'bg-emerald-500' : isCurrent ? 'bg-blue-500' : 'bg-gray-300'
                              }`}>
                                {isRejected ? '✕' : isDone ? '✓' : (i + 1)}
                              </div>
                              {step.approver_name}
                              <span className="text-[9px] opacity-70">({step.role_label})</span>
                            </div>
                          </div>
                        )
                      })}
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

      {/* ─── 연차 신청 다이얼로그 (결재라인 포함) ─────── */}
      <Dialog open={showRequestDialog} onClose={() => setShowRequestDialog(false)} title="연차 신청" className="max-w-lg">
        <div className="space-y-4">
          <Select label="유형 *" value={reqLeaveType} onChange={(e) => setReqLeaveType(e.target.value)}
            options={Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))} />

          <div className="grid grid-cols-2 gap-3">
            <Input label="시작일 *" type="date" value={reqStartDate} onChange={(e) => setReqStartDate(e.target.value)} />
            <Input label="종료일 *" type="date" value={reqEndDate} onChange={(e) => setReqEndDate(e.target.value)} />
          </div>
          <Input label="일수" type="number" value={String(reqDays)} onChange={(e) => setReqDays(Number(e.target.value))} min="0.5" step="0.5" />
          <Input label="사유 (선택)" value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder="사유를 입력하세요" />

          {/* 결재라인 설정 */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
            <h4 className="text-sm font-bold text-gray-700">결재라인 설정</h4>
            <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
              <span className="px-2 py-1 bg-white rounded-full border border-gray-200 font-medium text-gray-700">본인</span>
              <ChevronRight className="h-3 w-3 text-gray-300" />
              <span className="px-2 py-1 bg-blue-50 rounded-full border border-blue-200 font-medium text-blue-700">리더</span>
              <ChevronRight className="h-3 w-3 text-gray-300" />
              <span className="px-2 py-1 bg-violet-50 rounded-full border border-violet-200 font-medium text-violet-700">이사 (선택)</span>
              <ChevronRight className="h-3 w-3 text-gray-300" />
              <span className="px-2 py-1 bg-amber-50 rounded-full border border-amber-200 font-medium text-amber-700">대표</span>
            </div>

            <Select label="결재 리더 *" value={reqLeaderId} onChange={(e) => setReqLeaderId(e.target.value)}
              options={[{ value: '', label: '리더를 선택하세요' }, ...leaders.map((e) => ({ value: e.id, label: `${e.name} (${e.position || e.role})` }))]} />

            <Select label="결재 이사 (선택)" value={reqDirectorId} onChange={(e) => setReqDirectorId(e.target.value)}
              options={[{ value: '', label: '이사 없이 대표에게 바로' }, ...directors.map((e) => ({ value: e.id, label: `${e.name} (${e.position || e.role})` }))]} />

            {ceo && (
              <div className="text-xs text-gray-500">
                최종 결재: <span className="font-medium text-gray-700">{ceo.name}</span> (대표)
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>취소</Button>
            <Button onClick={handleSubmitRequest} disabled={saving}>
              {saving ? '처리중...' : '신청'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
