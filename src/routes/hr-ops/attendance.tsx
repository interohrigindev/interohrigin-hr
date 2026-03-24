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
import { useAuth } from '@/hooks/useAuth'

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

const ADMIN_ROLES = ['ceo', 'director', 'division_head', 'admin'] as const

/* ─── Component ─────────────────────────────────────── */

export default function AttendanceManagementPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const isAdmin = profile?.role ? (ADMIN_ROLES as readonly string[]).includes(profile.role) : false
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()))
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // 출퇴근 버튼 상태
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  // 관리자 수동 기록 다이얼로그
  const [showAdminDialog, setShowAdminDialog] = useState(false)
  const [adminCheckType, setAdminCheckType] = useState<'in' | 'out'>('in')
  const [adminEmployeeId, setAdminEmployeeId] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [saving, setSaving] = useState(false)

  // 주별/월별 날짜 범위 계산
  const dateRange = useMemo(() => {
    const base = new Date(selectedDate)
    if (viewMode === 'weekly') {
      const day = base.getDay()
      const mon = new Date(base); mon.setDate(base.getDate() - (day === 0 ? 6 : day - 1))
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      return { from: toDateStr(mon), to: toDateStr(sun), label: `${toDateStr(mon).slice(5)} ~ ${toDateStr(sun).slice(5)}` }
    }
    if (viewMode === 'monthly') {
      const first = new Date(base.getFullYear(), base.getMonth(), 1)
      const last = new Date(base.getFullYear(), base.getMonth() + 1, 0)
      return { from: toDateStr(first), to: toDateStr(last), label: `${base.getFullYear()}년 ${base.getMonth() + 1}월` }
    }
    return { from: selectedDate, to: selectedDate, label: formatDate(selectedDate) }
  }, [selectedDate, viewMode])

  useEffect(() => {
    fetchData()
  }, [selectedDate, viewMode, profile?.id, isAdmin])

  async function fetchData() {
    setLoading(true)
    if (!profile?.id) return

    let empQuery = supabase.from('employees').select('id, name, department_id, position').eq('is_active', true)
    let attQuery = supabase.from('attendance_records').select('*')
      .gte('date', dateRange.from)
      .lte('date', dateRange.to)

    if (!isAdmin) {
      empQuery = empQuery.eq('id', profile.id)
      attQuery = attQuery.eq('employee_id', profile.id)
    }

    const [empRes, deptRes, attRes] = await Promise.all([
      empQuery.order('name'),
      supabase.from('departments').select('id, name').order('name'),
      attQuery.order('date', { ascending: false }).order('check_in', { ascending: true }),
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

  // 출결 데이터 조합: 일별은 직원 기준, 주별/월별은 기록 기준 리스트
  const attendanceData = useMemo(() => {
    if (viewMode === 'daily') {
      return employees.map((emp) => {
        const record = records.find((r) => r.employee_id === emp.id)
        return {
          ...emp,
          record,
          recordDate: selectedDate,
          status: record?.status || 'absent',
          checkIn: record?.check_in || null,
          checkOut: record?.check_out || null,
          workHours: record?.work_hours ?? null,
          overtimeHours: record?.overtime_hours ?? null,
          note: record?.note || null,
        }
      })
    }
    // 주별/월별: 기록 리스트 형태
    return records.map((r) => {
      const emp = employees.find((e) => e.id === r.employee_id)
      return {
        id: emp?.id || r.employee_id,
        name: emp?.name || '?',
        department_id: emp?.department_id || null,
        position: emp?.position || null,
        record: r,
        recordDate: r.date,
        status: r.status,
        checkIn: r.check_in,
        checkOut: r.check_out,
        workHours: r.work_hours,
        overtimeHours: r.overtime_hours,
        note: r.note,
      }
    })
  }, [employees, records, viewMode, selectedDate])

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

  // 본인의 오늘 기록
  const myTodayRecord = useMemo(() => {
    if (!profile?.id || selectedDate !== toDateStr(new Date())) return null
    return records.find((r) => r.employee_id === profile.id) || null
  }, [records, profile?.id, selectedDate])

  const isToday = selectedDate === toDateStr(new Date())

  // ─── 원클릭 출근 (현재 시간 저장) ─────────────────────────
  async function handleQuickCheckIn() {
    if (!profile?.id) return
    setCheckingIn(true)
    const now = new Date().toISOString()
    const checkHour = new Date(now).getHours()
    const checkMin = new Date(now).getMinutes()
    const isLate = checkHour > 9 || (checkHour === 9 && checkMin > 0)

    const existing = records.find((r) => r.employee_id === profile.id)
    if (existing?.check_in) {
      toast('이미 출근 기록이 있습니다', 'error')
      setCheckingIn(false)
      return
    }

    if (existing) {
      await supabase.from('attendance_records').update({
        check_in: now,
        status: isLate ? 'late' : 'normal',
      }).eq('id', existing.id)
    } else {
      await supabase.from('attendance_records').insert({
        employee_id: profile.id,
        date: toDateStr(new Date()),
        check_in: now,
        status: isLate ? 'late' : 'normal',
      })
    }
    setCheckingIn(false)
    toast(`출근 완료 (${formatTime(now)})`, 'success')
    fetchData()
  }

  // ─── 원클릭 퇴근 (현재 시간 저장) ─────────────────────────
  async function handleQuickCheckOut() {
    if (!profile?.id) return
    setCheckingOut(true)
    const now = new Date().toISOString()

    const existing = records.find((r) => r.employee_id === profile.id)
    if (!existing?.check_in) {
      toast('출근 기록이 없습니다. 먼저 출근을 기록하세요.', 'error')
      setCheckingOut(false)
      return
    }
    if (existing.check_out) {
      toast('이미 퇴근 기록이 있습니다', 'error')
      setCheckingOut(false)
      return
    }

    const checkInTime = new Date(existing.check_in).getTime()
    const checkOutTime = new Date(now).getTime()
    const diffHours = Math.round(((checkOutTime - checkInTime) / 3600000) * 10) / 10
    const overtime = Math.max(0, Math.round((diffHours - 8) * 10) / 10)
    const isEarlyLeave = diffHours < 6
    const newStatus = isEarlyLeave ? 'early_leave' : existing.status

    await supabase.from('attendance_records').update({
      check_out: now,
      work_hours: diffHours,
      overtime_hours: overtime,
      status: newStatus,
    }).eq('id', existing.id)

    setCheckingOut(false)
    toast(`퇴근 완료 (${formatTime(now)}) — ${diffHours}시간 근무`, 'success')
    fetchData()
  }

  // ─── 관리자 수동 기록 ──────────────────────────────────────
  async function handleAdminCheckSubmit() {
    if (!adminEmployeeId) { toast('직원을 선택하세요', 'error'); return }
    setSaving(true)
    const now = new Date().toISOString()
    const existing = records.find((r) => r.employee_id === adminEmployeeId)

    if (adminCheckType === 'in') {
      if (existing?.check_in) { toast('이미 출근 기록이 있습니다', 'error'); setSaving(false); return }
      const h = new Date(now).getHours()
      const m = new Date(now).getMinutes()
      const isLate = h > 9 || (h === 9 && m > 0)
      if (existing) {
        await supabase.from('attendance_records').update({ check_in: now, status: isLate ? 'late' : 'normal', note: adminNote || existing.note }).eq('id', existing.id)
      } else {
        await supabase.from('attendance_records').insert({ employee_id: adminEmployeeId, date: selectedDate, check_in: now, status: isLate ? 'late' : 'normal', note: adminNote || null })
      }
    } else {
      if (!existing?.check_in) { toast('출근 기록이 없습니다', 'error'); setSaving(false); return }
      if (existing.check_out) { toast('이미 퇴근 기록이 있습니다', 'error'); setSaving(false); return }
      const diff = Math.round(((new Date(now).getTime() - new Date(existing.check_in).getTime()) / 3600000) * 10) / 10
      const ot = Math.max(0, Math.round((diff - 8) * 10) / 10)
      await supabase.from('attendance_records').update({ check_out: now, work_hours: diff, overtime_hours: ot, status: diff < 6 ? 'early_leave' : existing.status, note: adminNote || existing.note }).eq('id', existing.id)
    }
    setSaving(false)
    toast(adminCheckType === 'in' ? '출근이 기록되었습니다' : '퇴근이 기록되었습니다', 'success')
    setShowAdminDialog(false); setAdminEmployeeId(''); setAdminNote('')
    fetchData()
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
        <div className="flex gap-2 items-center">
          {/* 본인 원클릭 출퇴근 (오늘만) */}
          {isToday && (
            <>
              {!myTodayRecord?.check_in ? (
                <Button onClick={handleQuickCheckIn} disabled={checkingIn} className="bg-emerald-600 hover:bg-emerald-700">
                  <LogIn className="h-4 w-4 mr-1" /> {checkingIn ? '처리중...' : '출근'}
                </Button>
              ) : !myTodayRecord?.check_out ? (
                <Button onClick={handleQuickCheckOut} disabled={checkingOut}>
                  <LogOut className="h-4 w-4 mr-1" /> {checkingOut ? '처리중...' : '퇴근'}
                </Button>
              ) : (
                <span className="text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg font-medium">
                  근무 완료 ({myTodayRecord.work_hours}h)
                </span>
              )}
            </>
          )}
          {/* 관리자 수동 기록 */}
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => { setAdminCheckType('in'); setShowAdminDialog(true) }}>
                <LogIn className="h-3.5 w-3.5 mr-1" /> 직원 출근 등록
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setAdminCheckType('out'); setShowAdminDialog(true) }}>
                <LogOut className="h-3.5 w-3.5 mr-1" /> 직원 퇴근 등록
              </Button>
            </>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => toast('엑셀 다운로드 기능 준비중', 'info')}>
              <Download className="h-3.5 w-3.5 mr-1" /> 엑셀
            </Button>
          )}
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

      {/* 뷰 모드 + 날짜 선택 + 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {/* 뷰 모드 탭 */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {([
              { key: 'daily' as const, label: '일별' },
              { key: 'weekly' as const, label: '주별' },
              { key: 'monthly' as const, label: '월별' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <CalendarDays className="h-4 w-4 text-gray-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
          <span className="text-sm text-gray-500 font-medium">{dateRange.label}</span>
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
                  {viewMode !== 'daily' && <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">날짜</th>}
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
                    <td colSpan={viewMode !== 'daily' ? 9 : 8} className="text-center py-12 text-gray-400">
                      출결 데이터가 없습니다
                    </td>
                  </tr>
                ) : (
                  filteredData.map((emp, idx) => {
                    const isWarning = emp.status === 'late' || emp.status === 'absent'
                    const key = viewMode === 'daily' ? emp.id : `${emp.id}-${emp.recordDate}-${idx}`
                    return (
                      <tr
                        key={key}
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
                        {viewMode !== 'daily' && (
                          <td className="py-2.5 px-3 text-center text-xs text-gray-600">{formatDate(emp.recordDate)}</td>
                        )}
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

      {/* 관리자 수동 출퇴근 다이얼로그 */}
      <Dialog
        open={showAdminDialog}
        onClose={() => setShowAdminDialog(false)}
        title={`직원 ${adminCheckType === 'in' ? '출근' : '퇴근'} 등록 (현재 시간으로 기록)`}
        className="max-w-md"
      >
        <div className="space-y-4">
          <Select
            label="직원 *"
            value={adminEmployeeId}
            onChange={(e) => setAdminEmployeeId(e.target.value)}
            options={[
              { value: '', label: '선택하세요' },
              ...employees.map((e) => ({ value: e.id, label: e.name })),
            ]}
          />
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            현재 시간 <span className="font-bold">{new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>으로 기록됩니다.
          </div>
          <Input
            label="비고 (선택)"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="사유를 입력하세요"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAdminDialog(false)}>
              취소
            </Button>
            <Button onClick={handleAdminCheckSubmit} disabled={saving}>
              {saving ? '처리중...' : `${adminCheckType === 'in' ? '출근' : '퇴근'} 등록`}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
