import { useState, useEffect, useMemo } from 'react'
import {
  Users, UserCheck, Clock, UserX,
  Search, LogIn, LogOut, Download,
  CalendarDays, AlertTriangle,
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

/* ─── Types ─────────────────────────────────────────── */

interface Employee {
  id: string
  name: string
  department_id: string | null
  position: string | null
}

interface Department {
  id: string
  name: string
}

interface AttendanceRecord {
  id: string
  employee_id: string
  date: string
  check_in: string | null
  check_out: string | null
  work_hours: number | null
  overtime_hours: number | null
  status: string
  note: string | null
  created_at: string
}

/* ─── Constants ─────────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  normal: '정상',
  late: '지각',
  early_leave: '조퇴',
  absent: '결근',
  holiday: '휴가',
}

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'default' | 'info' | 'purple' }> = {
  normal: { variant: 'success' },
  late: { variant: 'warning' },
  early_leave: { variant: 'purple' },
  absent: { variant: 'danger' },
  holiday: { variant: 'info' },
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function formatDate(d: string): string {
  return d.replace(/-/g, '.')
}

function formatTime(ts: string | null): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* ─── Component ─────────────────────────────────────── */

export default function AttendanceManagementPage() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()))
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // 수동 출퇴근 다이얼로그
  const [showCheckDialog, setShowCheckDialog] = useState(false)
  const [checkType, setCheckType] = useState<'in' | 'out'>('in')
  const [checkEmployeeId, setCheckEmployeeId] = useState('')
  const [checkTime, setCheckTime] = useState('')
  const [checkNote, setCheckNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [selectedDate])

  async function fetchData() {
    setLoading(true)
    const [empRes, deptRes, attRes] = await Promise.all([
      supabase.from('employees').select('id, name, department_id, position').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('attendance_records').select('*').eq('date', selectedDate).order('check_in', { ascending: true }),
    ])
    setEmployees((empRes.data || []) as Employee[])
    setDepartments((deptRes.data || []) as Department[])
    setRecords((attRes.data || []) as AttendanceRecord[])
    setLoading(false)
  }

  const getDeptName = (deptId: string | null) =>
    departments.find((d) => d.id === deptId)?.name || '-'

  const deptNames = useMemo(
    () => [...new Set(employees.map((e) => getDeptName(e.department_id)).filter((n) => n !== '-'))],
    [employees, departments],
  )

  // 직원별 출결 데이터 조합
  const attendanceData = useMemo(() => {
    return employees.map((emp) => {
      const record = records.find((r) => r.employee_id === emp.id)
      return {
        ...emp,
        record,
        status: record?.status || 'absent',
        checkIn: record?.check_in || null,
        checkOut: record?.check_out || null,
        workHours: record?.work_hours ?? null,
        overtimeHours: record?.overtime_hours ?? null,
        note: record?.note || null,
      }
    })
  }, [employees, records])

  // 필터링
  const filteredData = useMemo(() => {
    let result = attendanceData
    if (filterDept) result = result.filter((e) => getDeptName(e.department_id) === filterDept)
    if (filterStatus) result = result.filter((e) => e.status === filterStatus)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) => e.name.toLowerCase().includes(q))
    }
    return result
  }, [attendanceData, filterDept, filterStatus, searchQuery])

  // 통계
  const totalEmployees = employees.length
  const presentCount = records.filter((r) => r.status === 'normal').length
  const lateCount = records.filter((r) => r.status === 'late').length
  const absentCount = totalEmployees - records.filter((r) => r.status !== 'absent').length

  // 수동 출퇴근 기록
  async function handleCheckSubmit() {
    if (!checkEmployeeId) {
      toast('직원을 선택하세요', 'error')
      return
    }
    setSaving(true)

    const existing = records.find((r) => r.employee_id === checkEmployeeId)
    const now = checkTime
      ? new Date(`${selectedDate}T${checkTime}:00`).toISOString()
      : new Date().toISOString()

    if (checkType === 'in') {
      if (existing?.check_in) {
        toast('이미 출근 기록이 있습니다', 'error')
        setSaving(false)
        return
      }
      // 09:00 이후면 지각
      const checkHour = new Date(now).getHours()
      const checkMin = new Date(now).getMinutes()
      const isLate = checkHour > 9 || (checkHour === 9 && checkMin > 0)

      if (existing) {
        await supabase.from('attendance_records').update({
          check_in: now,
          status: isLate ? 'late' : 'normal',
          note: checkNote || existing.note,
        }).eq('id', existing.id)
      } else {
        await supabase.from('attendance_records').insert({
          employee_id: checkEmployeeId,
          date: selectedDate,
          check_in: now,
          status: isLate ? 'late' : 'normal',
          note: checkNote || null,
        })
      }
    } else {
      // 퇴근
      if (!existing?.check_in) {
        toast('출근 기록이 없습니다', 'error')
        setSaving(false)
        return
      }
      if (existing.check_out) {
        toast('이미 퇴근 기록이 있습니다', 'error')
        setSaving(false)
        return
      }
      const checkInTime = new Date(existing.check_in).getTime()
      const checkOutTime = new Date(now).getTime()
      const diffHours = Math.round(((checkOutTime - checkInTime) / 3600000) * 10) / 10
      const overtime = Math.max(0, Math.round((diffHours - 8) * 10) / 10)

      // 6시간 이전 퇴근이면 조퇴
      const isEarlyLeave = diffHours < 6
      const newStatus = isEarlyLeave ? 'early_leave' : existing.status

      await supabase.from('attendance_records').update({
        check_out: now,
        work_hours: diffHours,
        overtime_hours: overtime,
        status: newStatus,
        note: checkNote || existing.note,
      }).eq('id', existing.id)
    }

    setSaving(false)
    toast(checkType === 'in' ? '출근이 기록되었습니다' : '퇴근이 기록되었습니다', 'success')
    setShowCheckDialog(false)
    setCheckEmployeeId('')
    setCheckTime('')
    setCheckNote('')
    fetchData()
  }

  function openCheckDialog(type: 'in' | 'out') {
    setCheckType(type)
    setShowCheckDialog(true)
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">근태 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">직원 출퇴근 현황을 관리합니다</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => toast('엑셀 다운로드 기능 준비중', 'info')}>
            <Download className="h-4 w-4 mr-1" /> 엑셀 다운로드
          </Button>
          <Button variant="outline" onClick={() => openCheckDialog('in')}>
            <LogIn className="h-4 w-4 mr-1" /> 출근 기록
          </Button>
          <Button onClick={() => openCheckDialog('out')}>
            <LogOut className="h-4 w-4 mr-1" /> 퇴근 기록
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-gray-500">전체 직원</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{totalEmployees}명</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] text-gray-500">정상 출근</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{presentCount}명</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-[11px] text-gray-500">지각</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{lateCount}명</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <UserX className="h-4 w-4 text-red-500" />
              <span className="text-[11px] text-gray-500">결근</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{absentCount}명</p>
          </CardContent>
        </Card>
      </div>

      {/* 날짜 선택 + 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
          <span className="text-sm text-gray-500 font-medium">{formatDate(selectedDate)}</span>
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
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={[{ value: '', label: '전체 상태' }, ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))]}
          />
        </div>
      </div>

      {/* 출결 테이블 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs">이름</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">부서</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">출근 시간</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">퇴근 시간</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">근무 시간</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">초과 근무</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">상태</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">비고</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      출결 데이터가 없습니다
                    </td>
                  </tr>
                ) : (
                  filteredData.map((emp) => {
                    const isWarning = emp.status === 'late' || emp.status === 'absent'
                    return (
                      <tr
                        key={emp.id}
                        className={`border-b border-gray-100 hover:bg-gray-50/50 ${
                          emp.status === 'absent' ? 'bg-red-50/30' : emp.status === 'late' ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                              {emp.name[0]}
                            </div>
                            <div>
                              <span className="font-medium text-gray-900">{emp.name}</span>
                              {emp.position && (
                                <span className="ml-1 text-[10px] text-gray-400">{emp.position}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-600">{getDeptName(emp.department_id)}</td>
                        <td className="py-2.5 px-3 text-center font-medium text-gray-900">
                          {formatTime(emp.checkIn)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-medium text-gray-900">
                          {formatTime(emp.checkOut)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-600">
                          {emp.workHours !== null ? `${emp.workHours}h` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {emp.overtimeHours !== null && emp.overtimeHours > 0 ? (
                            <span className="text-orange-600 font-medium">{emp.overtimeHours}h</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge
                            variant={STATUS_BADGE[emp.status]?.variant || 'default'}
                            className="text-[10px]"
                          >
                            {isWarning && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                            {STATUS_LABELS[emp.status] || emp.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-500 max-w-[200px] truncate">
                          {emp.note || '-'}
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

      {/* 수동 출퇴근 다이얼로그 */}
      <Dialog
        open={showCheckDialog}
        onClose={() => setShowCheckDialog(false)}
        title={checkType === 'in' ? '출근 기록' : '퇴근 기록'}
        className="max-w-md"
      >
        <div className="space-y-4">
          <Select
            label="직원 *"
            value={checkEmployeeId}
            onChange={(e) => setCheckEmployeeId(e.target.value)}
            options={[
              { value: '', label: '선택하세요' },
              ...employees.map((e) => ({ value: e.id, label: e.name })),
            ]}
          />
          <Input
            label="시간 (미입력 시 현재 시간)"
            type="time"
            value={checkTime}
            onChange={(e) => setCheckTime(e.target.value)}
          />
          <Input
            label="비고 (선택)"
            value={checkNote}
            onChange={(e) => setCheckNote(e.target.value)}
            placeholder="사유를 입력하세요"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCheckDialog(false)}>
              취소
            </Button>
            <Button onClick={handleCheckSubmit} disabled={saving}>
              {saving ? '처리중...' : checkType === 'in' ? '출근 등록' : '퇴근 등록'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
