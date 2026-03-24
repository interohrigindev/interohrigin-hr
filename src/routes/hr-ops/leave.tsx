import { useState, useEffect, useMemo } from 'react'
import {
  CalendarPlus, Download, Search,
  AlertTriangle, CheckCircle, Clock, Plus,
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

interface Employee {
  id: string
  name: string
  department_id: string | null
  hire_date: string | null
  position: string | null
}

interface Department {
  id: string
  name: string
}

interface LeaveRecord {
  id: string
  employee_id: string
  year: number
  total_annual_leave: number
  child_leave: number
  special_leave: number
  used_annual: number
  used_child: number
  used_special: number
  hire_date: string | null
  expiry_date: string | null
  promotion_sent: boolean
  promotion_sent_at: string | null
}

interface LeaveRequest {
  id: string
  employee_id: string
  leave_type: string
  start_date: string
  end_date: string
  days: number
  reason: string | null
  status: string
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: '연차',
  child: '자녀 연차',
  special: '특별 휴가',
  sick: '병가',
  half_am: '오전 반차',
  half_pm: '오후 반차',
}

const LEAVE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

const LEAVE_STATUS_LABELS: Record<string, string> = {
  pending: '승인 대기',
  approved: '승인',
  rejected: '반려',
}

const ADMIN_ROLES = ['ceo', 'director', 'division_head', 'admin']

export default function LeaveManagementPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const isAdmin = profile?.role ? ADMIN_ROLES.includes(profile.role) : false
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [currentYear] = useState(new Date().getFullYear())
  const [showRequestDialog, setShowRequestDialog] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'requests'>('overview')

  // 연차 신청 폼
  const [reqEmployeeId, setReqEmployeeId] = useState('')
  const [reqLeaveType, setReqLeaveType] = useState('annual')
  const [reqStartDate, setReqStartDate] = useState('')
  const [reqEndDate, setReqEndDate] = useState('')
  const [reqDays, setReqDays] = useState(1)
  const [reqReason, setReqReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    if (!profile?.id) return
    setLoading(true)

    // 임원/관리자는 전체, 일반 직원은 본인만
    const myId = profile.id
    let empQuery = supabase.from('employees').select('id, name, department_id, hire_date, position').eq('is_active', true).order('name')
    let leaveQuery = supabase.from('leave_management').select('*').eq('year', currentYear)
    let reqQuery = supabase.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(100)

    if (!isAdmin) {
      empQuery = empQuery.eq('id', myId)
      leaveQuery = leaveQuery.eq('employee_id', myId)
      reqQuery = reqQuery.eq('employee_id', myId)
    }

    const [empRes, deptRes, leaveRes, reqRes] = await Promise.all([
      empQuery,
      supabase.from('departments').select('id, name').order('name'),
      leaveQuery,
      reqQuery,
    ])
    setEmployees((empRes.data || []) as Employee[])
    setDepartments((deptRes.data || []) as Department[])
    setLeaveRecords((leaveRes.data || []) as LeaveRecord[])
    setLeaveRequests((reqRes.data || []) as LeaveRequest[])
    setLoading(false)
  }

  const getDeptName = (deptId: string | null) => departments.find((d) => d.id === deptId)?.name || '-'
  const getEmpName = (empId: string) => employees.find((e) => e.id === empId)?.name || '-'

  // 직원별 연차 데이터 조합
  const employeeLeaveData = useMemo(() => {
    return employees.map((emp) => {
      const leave = leaveRecords.find((l) => l.employee_id === emp.id)
      const totalAnnual = leave?.total_annual_leave || 0
      const usedAnnual = leave?.used_annual || 0
      const remainingAnnual = totalAnnual - usedAnnual
      const usageRate = totalAnnual > 0 ? Math.round((usedAnnual / totalAnnual) * 100) : 0
      const childLeave = leave?.child_leave || 0
      const usedChild = leave?.used_child || 0
      const specialLeave = leave?.special_leave || 0
      const usedSpecial = leave?.used_special || 0
      const hireDate = leave?.hire_date || emp.hire_date
      const expiryDate = leave?.expiry_date

      // 만료일까지 남은 일수
      let daysUntilExpiry: number | null = null
      if (expiryDate) {
        daysUntilExpiry = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000)
      }

      return {
        ...emp,
        leave,
        totalAnnual,
        usedAnnual,
        remainingAnnual,
        usageRate,
        childLeave,
        usedChild,
        remainingChild: childLeave - usedChild,
        specialLeave,
        usedSpecial,
        remainingSpecial: specialLeave - usedSpecial,
        hireDate,
        expiryDate,
        daysUntilExpiry,
        promotionSent: leave?.promotion_sent || false,
      }
    })
  }, [employees, leaveRecords])

  // 필터링
  const filteredData = useMemo(() => {
    let result = employeeLeaveData
    if (filterDept) result = result.filter((e) => getDeptName(e.department_id) === filterDept)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) => e.name.toLowerCase().includes(q))
    }
    return result
  }, [employeeLeaveData, filterDept, searchQuery])

  // 통계
  const totalEmployees = filteredData.length
  const avgUsageRate = totalEmployees > 0
    ? Math.round(filteredData.reduce((sum, e) => sum + e.usageRate, 0) / totalEmployees)
    : 0
  const warningCount = filteredData.filter((e) => e.remainingAnnual > 5 && e.daysUntilExpiry !== null && e.daysUntilExpiry <= 90).length
  const pendingRequests = leaveRequests.filter((r) => r.status === 'pending').length

  const deptNames = useMemo(() => [...new Set(employees.map((e) => getDeptName(e.department_id)).filter((n) => n !== '-'))], [employees, departments])

  // 연차 신청
  async function handleSubmitRequest() {
    if (!reqEmployeeId || !reqStartDate || !reqEndDate) {
      toast('필수 항목을 입력하세요', 'error')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('leave_requests').insert({
      employee_id: reqEmployeeId,
      leave_type: reqLeaveType,
      start_date: reqStartDate,
      end_date: reqEndDate,
      days: reqDays,
      reason: reqReason || null,
      status: 'pending',
    })
    setSaving(false)
    if (error) { toast('신청 실패: ' + error.message, 'error'); return }
    toast('연차 신청이 완료되었습니다', 'success')
    setShowRequestDialog(false)
    setReqEmployeeId(''); setReqLeaveType('annual'); setReqStartDate(''); setReqEndDate(''); setReqDays(1); setReqReason('')
    fetchData()
  }

  // 연차 승인/반려
  async function handleApproveRequest(requestId: string, action: 'approved' | 'rejected') {
    const { error } = await supabase.from('leave_requests').update({
      status: action,
      approved_at: new Date().toISOString(),
    }).eq('id', requestId)

    if (error) { toast('처리 실패', 'error'); return }

    // 승인 시 사용 일수 업데이트
    if (action === 'approved') {
      const request = leaveRequests.find((r) => r.id === requestId)
      if (request) {
        const leave = leaveRecords.find((l) => l.employee_id === request.employee_id)
        if (leave) {
          const field = request.leave_type === 'child' ? 'used_child'
            : request.leave_type === 'special' ? 'used_special'
            : 'used_annual'
          await supabase.from('leave_management').update({
            [field]: (leave as any)[field] + request.days,
          }).eq('id', leave.id)
        }
      }
    }

    toast(action === 'approved' ? '승인 완료' : '반려 완료', 'success')
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
          <Button variant="outline" onClick={() => toast('엑셀 다운로드 기능 준비중', 'info')}>
            <Download className="h-4 w-4 mr-1" /> 엑셀 다운로드
          </Button>
          <Button onClick={() => setShowRequestDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> 연차 신청
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CalendarPlus className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-gray-500">전체 직원</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{totalEmployees}명</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-violet-500" />
              <span className="text-[11px] text-gray-500">평균 소진율</span>
            </div>
            <p className="text-2xl font-bold text-violet-600">{avgUsageRate}%</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-[11px] text-gray-500">촉진 대상</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{warningCount}명</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] text-gray-500">승인 대기</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{pendingRequests}건</p>
          </CardContent>
        </Card>
      </div>

      {/* 탭 + 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {([
            { key: 'overview' as const, label: '연차 현황' },
            { key: 'requests' as const, label: `신청 관리 ${pendingRequests > 0 ? `(${pendingRequests})` : ''}` },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="직원 검색..."
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48 focus:outline-none focus:border-blue-400"
            />
          </div>
          <Select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            options={[{ value: '', label: '전체 부서' }, ...deptNames.map((n) => ({ value: n, label: n }))]}
          />
        </div>
      </div>

      {/* 연차 현황 테이블 */}
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
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">자녀연차</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">특별휴가</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">소진 마감</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-12 text-gray-400">연차 데이터가 없습니다</td></tr>
                  ) : (
                    filteredData.map((emp) => {
                      const isWarning = emp.remainingAnnual > 5 && emp.daysUntilExpiry !== null && emp.daysUntilExpiry <= 90
                      const isUrgent = emp.remainingAnnual > 3 && emp.daysUntilExpiry !== null && emp.daysUntilExpiry <= 30

                      return (
                        <tr key={emp.id} className={`border-b border-gray-100 hover:bg-gray-50/50 ${isUrgent ? 'bg-red-50/50' : isWarning ? 'bg-amber-50/30' : ''}`}>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                                {emp.name[0]}
                              </div>
                              <span className="font-medium text-gray-900">{emp.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-gray-600">{getDeptName(emp.department_id)}</td>
                          <td className="py-2.5 px-3 text-center font-medium text-gray-900">{emp.totalAnnual}</td>
                          <td className="py-2.5 px-3 text-center text-gray-600">{emp.usedAnnual}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-blue-600">{emp.remainingAnnual}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5 justify-center">
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    emp.usageRate >= 80 ? 'bg-emerald-500' : emp.usageRate >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                                  }`}
                                  style={{ width: `${emp.usageRate}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-500 w-8 text-right">{emp.usageRate}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center text-xs text-gray-600">
                            {emp.childLeave > 0 ? `${emp.usedChild}/${emp.childLeave}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-center text-xs text-gray-600">
                            {emp.specialLeave > 0 ? `${emp.usedSpecial}/${emp.specialLeave}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-xs">
                            {emp.expiryDate ? (
                              <span className={emp.daysUntilExpiry !== null && emp.daysUntilExpiry <= 30 ? 'text-red-600 font-bold' : 'text-gray-600'}>
                                {emp.expiryDate}
                                {emp.daysUntilExpiry !== null && emp.daysUntilExpiry <= 90 && (
                                  <span className="ml-1">(D{emp.daysUntilExpiry >= 0 ? '-' : '+'}{Math.abs(emp.daysUntilExpiry)})</span>
                                )}
                              </span>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isUrgent ? (
                              <Badge variant="danger" className="text-[10px]">긴급</Badge>
                            ) : isWarning ? (
                              <Badge variant="warning" className="text-[10px]">촉진 필요</Badge>
                            ) : emp.usageRate >= 80 ? (
                              <Badge variant="success" className="text-[10px]">양호</Badge>
                            ) : (
                              <Badge variant="default" className="text-[10px]">정상</Badge>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 연차 신청 관리 */}
      {activeTab === 'requests' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs">신청자</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">유형</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">기간</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">일수</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">사유</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">상태</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">신청일</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveRequests.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-gray-400">연차 신청 내역이 없습니다</td></tr>
                  ) : (
                    leaveRequests.map((req) => (
                      <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-2.5 px-4 font-medium text-gray-900">{getEmpName(req.employee_id)}</td>
                        <td className="py-2.5 px-3">
                          <Badge variant="default" className="text-[10px]">{LEAVE_TYPE_LABELS[req.leave_type] || req.leave_type}</Badge>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-600">{req.start_date} ~ {req.end_date}</td>
                        <td className="py-2.5 px-3 text-center font-medium">{req.days}일</td>
                        <td className="py-2.5 px-3 text-xs text-gray-500 max-w-[200px] truncate">{req.reason || '-'}</td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge className={`text-[10px] ${LEAVE_STATUS_COLORS[req.status]}`}>
                            {LEAVE_STATUS_LABELS[req.status]}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-500">{new Date(req.created_at).toLocaleDateString('ko-KR')}</td>
                        <td className="py-2.5 px-3 text-center">
                          {req.status === 'pending' && (
                            <div className="flex gap-1 justify-center">
                              <button
                                onClick={() => handleApproveRequest(req.id, 'approved')}
                                className="px-2 py-1 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"
                              >
                                승인
                              </button>
                              <button
                                onClick={() => handleApproveRequest(req.id, 'rejected')}
                                className="px-2 py-1 text-[10px] font-medium bg-red-100 text-red-700 rounded hover:bg-red-200"
                              >
                                반려
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 연차 신청 다이얼로그 */}
      <Dialog open={showRequestDialog} onClose={() => setShowRequestDialog(false)} title="연차 신청" className="max-w-md">
        <div className="space-y-4">
          <Select
            label="직원 *"
            value={reqEmployeeId}
            onChange={(e) => setReqEmployeeId(e.target.value)}
            options={[{ value: '', label: '선택하세요' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
          />
          <Select
            label="유형 *"
            value={reqLeaveType}
            onChange={(e) => setReqLeaveType(e.target.value)}
            options={Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="시작일 *" type="date" value={reqStartDate} onChange={(e) => setReqStartDate(e.target.value)} />
            <Input label="종료일 *" type="date" value={reqEndDate} onChange={(e) => setReqEndDate(e.target.value)} />
          </div>
          <Input label="일수" type="number" value={String(reqDays)} onChange={(e) => setReqDays(Number(e.target.value))} min="0.5" step="0.5" />
          <Input label="사유 (선택)" value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder="사유를 입력하세요" />
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
