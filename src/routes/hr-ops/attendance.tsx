import { useState, useEffect, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  Users, UserCheck, Clock, Timer,
  LogIn, LogOut, Download, ChevronLeft, ChevronRight,
  AlertTriangle, BarChart3,
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
  clock_in: string | null
  clock_out: string | null
  clock_in_method: string | null
  clock_in_ip: string | null
  clock_in_location: Record<string, unknown> | null
  regular_hours: number | null
  overtime_hours: number | null
  night_hours: number | null
  holiday_hours: number | null
  total_hours: number | null
  status: string
  late_minutes: number | null
  note: string | null
  is_modified: boolean
  modified_by: string | null
  modified_reason: string | null
}

interface WeeklyHoursTracking {
  id: string
  employee_id: string
  week_start: string
  week_end: string
  regular_hours: number | null
  overtime_hours: number | null
  total_hours: number | null
  is_over_48: boolean
  is_over_52: boolean
  alert_sent: boolean
}

/* ─── Constants ─────────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  normal: '정상',
  late: '지각',
  early_leave: '조퇴',
  absent: '결근',
  holiday: '휴일',
  leave: '휴가',
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  normal: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  late: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  early_leave: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  absent: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  holiday: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
  leave: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const ADMIN_ROLES = ['ceo', 'director', 'division_head', 'admin'] as const

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatHours(h: number | null): string {
  if (h == null || h === 0) return '-'
  return `${Math.round(h * 10) / 10}h`
}

/* ─── Component ─────────────────────────────────────── */

export default function AttendanceManagementPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const isAdmin = profile?.role ? (ADMIN_ROLES as readonly string[]).includes(profile.role) : false

  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [weeklyData, setWeeklyData] = useState<WeeklyHoursTracking[]>([])
  const [loading, setLoading] = useState(true)

  // 월 선택
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()) // 0-based

  // 선택된 날짜 (캘린더 셀 클릭)
  const [selectedDay, setSelectedDay] = useState<string | null>(toDateStr(new Date()))

  // 관리자: 직원 모달
  const [modalEmployee, setModalEmployee] = useState<Employee | null>(null)

  // 출퇴근
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [showAdminDialog, setShowAdminDialog] = useState(false)
  const [adminCheckType, setAdminCheckType] = useState<'in' | 'out'>('in')
  const [adminEmployeeId, setAdminEmployeeId] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [saving, setSaving] = useState(false)

  // ─── 월별 범위 계산 ──────────────────────────────────
  const monthRange = useMemo(() => {
    const first = new Date(currentYear, currentMonth, 1)
    const last = new Date(currentYear, currentMonth + 1, 0)
    return {
      from: toDateStr(first),
      to: toDateStr(last),
      label: `${currentYear}년 ${currentMonth + 1}월`,
      daysInMonth: last.getDate(),
      startWeekday: first.getDay(), // 0=일 ~ 6=토
    }
  }, [currentYear, currentMonth])

  function goToPrevMonth() {
    if (currentMonth === 0) { setCurrentYear((y) => y - 1); setCurrentMonth(11) }
    else setCurrentMonth((m) => m - 1)
  }
  function goToNextMonth() {
    if (currentMonth === 11) { setCurrentYear((y) => y + 1); setCurrentMonth(0) }
    else setCurrentMonth((m) => m + 1)
  }
  function goToToday() {
    const now = new Date()
    setCurrentYear(now.getFullYear())
    setCurrentMonth(now.getMonth())
    setSelectedDay(toDateStr(now))
  }

  // ─── Data fetch ──────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)

    let empQuery = supabase.from('employees').select('id, name, department_id, position').eq('is_active', true)
    let attQuery = supabase.from('attendance_records').select('*')
      .gte('date', monthRange.from).lte('date', monthRange.to)

    // 주간 근무시간 데이터: 해당 월에 겹치는 주차 조회
    let weeklyQuery = supabase.from('weekly_hours_tracking').select('*')
      .lte('week_start', monthRange.to)
      .gte('week_end', monthRange.from)

    if (!isAdmin) {
      empQuery = empQuery.eq('id', profile.id)
      attQuery = attQuery.eq('employee_id', profile.id)
      weeklyQuery = weeklyQuery.eq('employee_id', profile.id)
    }

    const [empRes, deptRes, attRes, weeklyRes] = await Promise.all([
      empQuery.order('name'),
      supabase.from('departments').select('id, name').order('name'),
      attQuery.order('date'),
      weeklyQuery.order('week_start'),
    ])

    setEmployees((empRes.data || []) as Employee[])
    setDepartments((deptRes.data || []) as Department[])
    setRecords((attRes.data || []) as AttendanceRecord[])
    setWeeklyData((weeklyRes.data || []) as WeeklyHoursTracking[])
    setLoading(false)
  }, [profile?.id, isAdmin, monthRange.from, monthRange.to])

  useEffect(() => { fetchData() }, [fetchData])

  const getDeptName = (deptId: string | null) => departments.find((d) => d.id === deptId)?.name || '-'

  // ─── 캘린더 데이터 ──────────────────────────────────
  const calendarDays = useMemo(() => {
    const days: { date: string; day: number; isToday: boolean; records: AttendanceRecord[] }[] = []
    const todayStr = toDateStr(new Date())
    for (let d = 1; d <= monthRange.daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({
        date: dateStr,
        day: d,
        isToday: dateStr === todayStr,
        records: records.filter((r) => r.date === dateStr),
      })
    }
    return days
  }, [records, currentYear, currentMonth, monthRange.daysInMonth])

  // 월 통계
  const todayStr = toDateStr(new Date())
  const totalWorkDays = calendarDays.filter((d) => {
    const dow = new Date(d.date).getDay()
    return dow !== 0 && dow !== 6
  }).length
  const myRecordsThisMonth = records.filter((r) => r.employee_id === profile?.id)
  const myPresentDays = myRecordsThisMonth.filter((r) =>
    r.status === 'normal' || r.status === 'late' || r.status === 'early_leave'
  ).length
  const myLateDays = myRecordsThisMonth.filter((r) => r.status === 'late').length
  const myLateMinutesSum = myRecordsThisMonth.reduce((s, r) => s + (r.late_minutes || 0), 0)
  const myRegularHours = myRecordsThisMonth.reduce((s, r) => s + (r.regular_hours || 0), 0)
  const myOvertimeHours = myRecordsThisMonth.reduce((s, r) => s + (r.overtime_hours || 0), 0)
  const myTotalHours = myRecordsThisMonth.reduce((s, r) => s + (r.total_hours || 0), 0)

  // 오늘 기록 (본인)
  const myTodayRecord = useMemo(() => {
    if (!profile?.id) return null
    return records.find((r) => r.employee_id === profile.id && r.date === todayStr) || null
  }, [records, profile?.id, todayStr])

  // 주간 근무시간 (본인)
  const myWeeklyData = useMemo(() => {
    if (!profile?.id) return []
    return weeklyData.filter((w) => w.employee_id === profile.id)
  }, [weeklyData, profile?.id])

  // ─── 원클릭 출근 ────────────────────────────────────
  async function handleQuickCheckIn() {
    if (!profile?.id) return
    setCheckingIn(true)
    const now = new Date().toISOString()

    const existing = records.find((r) => r.employee_id === profile.id && r.date === todayStr)
    if (existing?.clock_in) {
      toast('이미 출근 기록이 있습니다', 'error')
      setCheckingIn(false)
      return
    }

    // Trigger auto-calculates status and late_minutes
    const insertPayload: Record<string, unknown> = {
      employee_id: profile.id,
      date: todayStr,
      clock_in: now,
      clock_in_method: 'web' as const,
    }

    // Try to get client IP (best effort)
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json')
      const ipData = await ipRes.json()
      if (ipData?.ip) insertPayload.clock_in_ip = ipData.ip
    } catch {
      // IP lookup failed — continue without it
    }

    if (existing) {
      await supabase.from('attendance_records').update({
        clock_in: now,
        clock_in_method: 'web',
        ...(insertPayload.clock_in_ip ? { clock_in_ip: insertPayload.clock_in_ip } : {}),
      }).eq('id', existing.id)
    } else {
      await supabase.from('attendance_records').insert(insertPayload)
    }

    setCheckingIn(false)
    toast(`출근 완료 (${formatTime(now)})`, 'success')
    fetchData()
  }

  // ─── 원클릭 퇴근 ────────────────────────────────────
  async function handleQuickCheckOut() {
    if (!profile?.id) return
    setCheckingOut(true)
    const now = new Date().toISOString()
    const existing = records.find((r) => r.employee_id === profile.id && r.date === todayStr)
    if (!existing?.clock_in) {
      toast('출근 기록이 없습니다', 'error')
      setCheckingOut(false)
      return
    }
    if (existing.clock_out) {
      toast('이미 퇴근 기록이 있습니다', 'error')
      setCheckingOut(false)
      return
    }

    // Trigger auto-calculates hours and status
    await supabase.from('attendance_records').update({ clock_out: now }).eq('id', existing.id)

    setCheckingOut(false)
    toast(`퇴근 완료 (${formatTime(now)})`, 'success')
    fetchData()
  }

  // ─── 관리자 수동 기록 ──────────────────────────────
  async function handleAdminCheckSubmit() {
    if (!adminEmployeeId) { toast('직원을 선택하세요', 'error'); return }
    setSaving(true)
    const targetDate = selectedDay || todayStr
    const now = new Date().toISOString()
    const existing = records.find((r) => r.employee_id === adminEmployeeId && r.date === targetDate)

    if (adminCheckType === 'in') {
      if (existing?.clock_in) { toast('이미 출근 기록이 있습니다', 'error'); setSaving(false); return }
      if (existing) {
        await supabase.from('attendance_records').update({
          clock_in: now,
          clock_in_method: 'manual',
          note: adminNote || existing.note,
          is_modified: true,
          modified_by: profile?.id,
          modified_reason: adminNote || '관리자 수동 등록',
        }).eq('id', existing.id)
      } else {
        await supabase.from('attendance_records').insert({
          employee_id: adminEmployeeId,
          date: targetDate,
          clock_in: now,
          clock_in_method: 'manual',
          note: adminNote || null,
          is_modified: true,
          modified_by: profile?.id,
          modified_reason: adminNote || '관리자 수동 등록',
        })
      }
    } else {
      if (!existing?.clock_in) { toast('출근 기록이 없습니다', 'error'); setSaving(false); return }
      if (existing.clock_out) { toast('이미 퇴근 기록이 있습니다', 'error'); setSaving(false); return }
      // Trigger auto-calculates hours and status
      await supabase.from('attendance_records').update({
        clock_out: now,
        note: adminNote || existing.note,
        is_modified: true,
        modified_by: profile?.id,
        modified_reason: adminNote || '관리자 수동 등록',
      }).eq('id', existing.id)
    }

    setSaving(false)
    toast(adminCheckType === 'in' ? '출근이 기록되었습니다' : '퇴근이 기록되었습니다', 'success')
    setShowAdminDialog(false)
    setAdminEmployeeId('')
    setAdminNote('')
    fetchData()
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">근태 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">출퇴근 현황을 캘린더로 확인합니다</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {!myTodayRecord?.clock_in ? (
            <Button onClick={handleQuickCheckIn} disabled={checkingIn} className="bg-emerald-600 hover:bg-emerald-700">
              <LogIn className="h-4 w-4 mr-1" /> {checkingIn ? '처리중...' : '출근'}
            </Button>
          ) : !myTodayRecord?.clock_out ? (
            <Button onClick={handleQuickCheckOut} disabled={checkingOut}>
              <LogOut className="h-4 w-4 mr-1" /> {checkingOut ? '처리중...' : '퇴근'}
            </Button>
          ) : (
            <span className="text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg font-medium">
              근무 완료 ({formatHours(myTodayRecord.total_hours)})
            </span>
          )}
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => { setAdminCheckType('in'); setShowAdminDialog(true) }}>
                <LogIn className="h-3.5 w-3.5 mr-1" /> 직원 출근
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setAdminCheckType('out'); setShowAdminDialog(true) }}>
                <LogOut className="h-3.5 w-3.5 mr-1" /> 직원 퇴근
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                const data = records.map(r => ({
                  날짜: r.date,
                  이름: employees.find(e => e.id === r.employee_id)?.name || '',
                  출근: r.clock_in ? new Date(r.clock_in).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '',
                  퇴근: r.clock_out ? new Date(r.clock_out).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '',
                  정규시간: r.regular_hours || 0,
                  연장시간: r.overtime_hours || 0,
                  총시간: r.total_hours || 0,
                  상태: STATUS_LABELS[r.status] || r.status,
                }))
                const ws = XLSX.utils.json_to_sheet(data)
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, '근태기록')
                XLSX.writeFile(wb, `근태기록_${monthRange.label}.xlsx`)
              }}>
                <Download className="h-3.5 w-3.5 mr-1" /> 엑셀
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── 월 통계 카드 ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-gray-500">근무일수</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{totalWorkDays}일</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] text-gray-500">출근일</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{myPresentDays}일</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-[11px] text-gray-500">지각</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{myLateDays}일</p>
            {myLateMinutesSum > 0 && (
              <p className="text-[10px] text-amber-500 mt-0.5">누적 {myLateMinutesSum}분</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Timer className="h-4 w-4 text-violet-500" />
              <span className="text-[11px] text-gray-500">총 근무시간</span>
            </div>
            <p className="text-2xl font-bold text-violet-600">{Math.round(myTotalHours * 10) / 10}h</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              정규 {Math.round(myRegularHours * 10) / 10}h + 초과 {Math.round(myOvertimeHours * 10) / 10}h
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── 월 네비게이션 ────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button onClick={goToPrevMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h2 className="text-lg font-bold text-gray-900 min-w-[140px] text-center">{monthRange.label}</h2>
          <button onClick={goToNextMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
          <Button variant="outline" size="sm" onClick={goToToday}>오늘</Button>
        </div>
        <div className="flex items-center gap-3 text-[11px] flex-wrap">
          {Object.entries(STATUS_COLORS).map(([key, colors]) => (
            <div key={key} className="flex items-center gap-1">
              <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
              <span className="text-gray-500">{STATUS_LABELS[key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 관리자 뷰: 부서별 블록 + 직원 카드 ──────────── */}
      {isAdmin ? (
        <div className="space-y-4">
          {(() => {
            // 부서별 그룹핑
            const DEPT_COLORS = [
              { bar: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
              { bar: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700' },
              { bar: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
              { bar: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
              { bar: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700' },
              { bar: 'bg-cyan-500', bg: 'bg-cyan-50', text: 'text-cyan-700' },
            ]
            const grouped = new Map<string, Employee[]>()
            for (const emp of employees) {
              const deptName = getDeptName(emp.department_id)
              if (!grouped.has(deptName)) grouped.set(deptName, [])
              grouped.get(deptName)!.push(emp)
            }
            const todayRecordsMap = new Map<string, AttendanceRecord>()
            for (const r of records.filter((r) => r.date === todayStr)) {
              todayRecordsMap.set(r.employee_id, r)
            }

            // 전체 통계
            const totalPresent = [...todayRecordsMap.values()].filter((r) => r.clock_in).length
            const totalLate = [...todayRecordsMap.values()].filter((r) => r.status === 'late').length
            const totalAbsent = employees.length - totalPresent

            return (
              <>
                {/* 오늘 전체 현황 요약 */}
                <div className="grid grid-cols-4 gap-3">
                  <Card className="border-l-4 border-l-blue-500">
                    <CardContent className="py-3 px-4">
                      <p className="text-[11px] text-gray-500">전체 직원</p>
                      <p className="text-2xl font-bold text-blue-600">{employees.length}명</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-emerald-500">
                    <CardContent className="py-3 px-4">
                      <p className="text-[11px] text-gray-500">출근</p>
                      <p className="text-2xl font-bold text-emerald-600">{totalPresent}명</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="py-3 px-4">
                      <p className="text-[11px] text-gray-500">지각</p>
                      <p className="text-2xl font-bold text-amber-600">{totalLate}명</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-red-500">
                    <CardContent className="py-3 px-4">
                      <p className="text-[11px] text-gray-500">미출근</p>
                      <p className="text-2xl font-bold text-red-600">{totalAbsent}명</p>
                    </CardContent>
                  </Card>
                </div>

                {/* 부서별 블록 */}
                {[...grouped.entries()].map(([deptName, deptEmployees], di) => {
                  const color = DEPT_COLORS[di % DEPT_COLORS.length]
                  const deptPresent = deptEmployees.filter((e) => todayRecordsMap.get(e.id)?.clock_in).length

                  return (
                    <Card key={deptName} className="overflow-hidden">
                      {/* 부서 헤더 */}
                      <div className={`flex items-center gap-3 px-4 py-3 ${color.bg}`}>
                        <div className={`w-1.5 h-6 rounded-full ${color.bar}`} />
                        <span className={`text-sm font-bold ${color.text}`}>{deptName}</span>
                        <Badge variant="default" className="text-[10px]">{deptPresent}/{deptEmployees.length}명 출근</Badge>
                      </div>

                      {/* 직원 카드 그리드 */}
                      <CardContent className="py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                          {deptEmployees.map((emp) => {
                            const rec = todayRecordsMap.get(emp.id)
                            const sc = rec ? (STATUS_COLORS[rec.status] || STATUS_COLORS.normal) : STATUS_COLORS.absent
                            const hasCheckedIn = !!rec?.clock_in
                            const hasCheckedOut = !!rec?.clock_out

                            return (
                              <button
                                key={emp.id}
                                onClick={() => setModalEmployee(emp)}
                                className={`relative p-3 rounded-lg border-2 text-left transition-all hover:shadow-md ${
                                  !hasCheckedIn ? 'border-red-200 bg-red-50/50' :
                                  rec?.status === 'late' ? 'border-amber-200 bg-amber-50/30' :
                                  hasCheckedOut ? 'border-emerald-200 bg-emerald-50/30' :
                                  'border-blue-200 bg-blue-50/30'
                                }`}
                              >
                                {/* 상태 도트 */}
                                <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${
                                  !hasCheckedIn ? 'bg-red-500' :
                                  rec?.status === 'late' ? 'bg-amber-500' :
                                  hasCheckedOut ? 'bg-emerald-500' : 'bg-blue-500'
                                }`} />

                                {/* 아바타 + 이름 */}
                                <div className="flex items-center gap-2 mb-2">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                    !hasCheckedIn ? 'bg-red-400' :
                                    rec?.status === 'late' ? 'bg-amber-400' :
                                    hasCheckedOut ? 'bg-emerald-500' : 'bg-blue-500'
                                  }`}>
                                    {emp.name[0]}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">{emp.name}</p>
                                    {emp.position && <p className="text-[10px] text-gray-400 truncate">{emp.position}</p>}
                                  </div>
                                </div>

                                {/* 출퇴근 시간 */}
                                {hasCheckedIn ? (
                                  <div className="space-y-0.5">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-gray-500">출근</span>
                                      <span className="font-medium text-gray-800">{formatTime(rec!.clock_in)}</span>
                                    </div>
                                    {hasCheckedOut && (
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-gray-500">퇴근</span>
                                        <span className="font-medium text-gray-800">{formatTime(rec!.clock_out)}</span>
                                      </div>
                                    )}
                                    {rec!.total_hours != null && rec!.total_hours > 0 && (
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-gray-500">근무</span>
                                        <span className="font-bold text-gray-900">{formatHours(rec!.total_hours)}</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-red-500 font-medium">미출근</p>
                                )}

                                {/* 상태 뱃지 */}
                                {hasCheckedIn && (
                                  <div className="mt-1.5">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${sc.bg} ${sc.text}`}>
                                      {STATUS_LABELS[rec!.status] || rec!.status}
                                    </span>
                                  </div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </>
            )
          })()}
        </div>
      ) : (
        <>
          {/* ─── 일반 직원 뷰: 캘린더 ──────────────────────── */}
          <Card>
            <CardContent className="p-0">
              <div className="grid grid-cols-7 border-b border-gray-200">
                {WEEKDAYS.map((day, i) => (
                  <div key={day} className={`py-2.5 text-center text-xs font-semibold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: monthRange.startWeekday }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-gray-100 bg-gray-50/30" />
                ))}
                {calendarDays.map((dayData) => {
                  const dow = new Date(dayData.date).getDay()
                  const isWeekend = dow === 0 || dow === 6
                  const isSelected = dayData.date === selectedDay
                  const dayRecords = dayData.records
                  return (
                    <button
                      key={dayData.date}
                      onClick={() => setSelectedDay(dayData.date)}
                      className={`min-h-[100px] border-b border-r border-gray-100 p-1.5 text-left transition-all hover:bg-blue-50/50 ${isSelected ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset z-10' : ''} ${isWeekend ? 'bg-gray-50/50' : ''}`}
                    >
                      <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${dayData.isToday ? 'bg-blue-600 text-white' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'}`}>{dayData.day}</span>
                      {dayRecords.length > 0 && dayRecords.map((r) => {
                        const sc = STATUS_COLORS[r.status] || STATUS_COLORS.normal
                        return (
                          <div key={r.id} className={`mt-1 flex items-center gap-1 px-1 py-0.5 rounded text-[9px] ${sc.bg} ${sc.text}`}>
                            <span>{formatTime(r.clock_in)}</span>
                            {r.clock_out && <span>~{formatTime(r.clock_out)}</span>}
                            {r.total_hours != null && r.total_hours > 0 && <span className="ml-auto font-medium">{Math.round(r.total_hours * 10) / 10}h</span>}
                          </div>
                        )
                      })}
                    </button>
                  )
                })}
                {(() => {
                  const totalCells = monthRange.startWeekday + monthRange.daysInMonth
                  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
                  return Array.from({ length: remaining }).map((_, i) => (
                    <div key={`trail-${i}`} className="min-h-[100px] border-b border-r border-gray-100 bg-gray-50/30" />
                  ))
                })()}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── 직원 상세 모달 (관리자 클릭시) ──────────────── */}
      <Dialog
        open={!!modalEmployee}
        onClose={() => setModalEmployee(null)}
        title={modalEmployee ? `${modalEmployee.name} — ${monthRange.label} 근태` : ''}
        className="max-w-2xl"
      >
        {modalEmployee && (() => {
          const empRecords = records.filter((r) => r.employee_id === modalEmployee.id).sort((a, b) => b.date.localeCompare(a.date))
          const presentDays = empRecords.filter((r) => r.status === 'normal' || r.status === 'late' || r.status === 'early_leave').length
          const lateDays = empRecords.filter((r) => r.status === 'late').length
          const totalH = empRecords.reduce((s, r) => s + (r.total_hours || 0), 0)
          const otH = empRecords.reduce((s, r) => s + (r.overtime_hours || 0), 0)

          return (
            <div className="space-y-4">
              {/* 요약 */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-blue-50 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-blue-600">{presentDays}일</p>
                  <p className="text-[10px] text-blue-500">출근</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-amber-600">{lateDays}일</p>
                  <p className="text-[10px] text-amber-500">지각</p>
                </div>
                <div className="bg-violet-50 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-violet-600">{Math.round(totalH * 10) / 10}h</p>
                  <p className="text-[10px] text-violet-500">총 근무</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-orange-600">{Math.round(otH * 10) / 10}h</p>
                  <p className="text-[10px] text-orange-500">초과 근무</p>
                </div>
              </div>

              {/* 기록 테이블 */}
              <div className="overflow-y-auto max-h-[400px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 text-xs text-gray-500">날짜</th>
                      <th className="text-center py-2 px-2 text-xs text-gray-500">출근</th>
                      <th className="text-center py-2 px-2 text-xs text-gray-500">퇴근</th>
                      <th className="text-center py-2 px-2 text-xs text-gray-500">근무</th>
                      <th className="text-center py-2 px-2 text-xs text-gray-500">초과</th>
                      <th className="text-center py-2 px-2 text-xs text-gray-500">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empRecords.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-400">이번 달 기록이 없습니다</td></tr>
                    ) : empRecords.map((r) => {
                      const sc = STATUS_COLORS[r.status] || STATUS_COLORS.normal
                      return (
                        <tr key={r.id} className="border-b border-gray-100">
                          <td className="py-1.5 px-2 text-xs text-gray-700">{r.date.slice(5).replace('-', '/')}</td>
                          <td className="py-1.5 px-2 text-center text-xs font-medium">{formatTime(r.clock_in) || '-'}</td>
                          <td className="py-1.5 px-2 text-center text-xs font-medium">{formatTime(r.clock_out) || '-'}</td>
                          <td className="py-1.5 px-2 text-center text-xs">{formatHours(r.total_hours)}</td>
                          <td className="py-1.5 px-2 text-center text-xs">{r.overtime_hours && r.overtime_hours > 0 ? <span className="text-orange-600">{formatHours(r.overtime_hours)}</span> : '-'}</td>
                          <td className="py-1.5 px-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${sc.bg} ${sc.text}`}>{STATUS_LABELS[r.status]}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}
      </Dialog>

      {/* ─── 주 52시간 현황 ──────────────────────────────── */}
      {myWeeklyData.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-gray-900">주 52시간 현황</h3>
              <Badge variant="info" className="text-[10px]">{monthRange.label}</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs">주차</th>
                    <th className="text-center py-2.5 px-3 font-medium text-gray-500 text-xs">정규 근무</th>
                    <th className="text-center py-2.5 px-3 font-medium text-gray-500 text-xs">초과 근무</th>
                    <th className="text-center py-2.5 px-3 font-medium text-gray-500 text-xs">합계</th>
                    <th className="text-center py-2.5 px-3 font-medium text-gray-500 text-xs">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {myWeeklyData.map((w) => {
                    const weekLabel = `${w.week_start.slice(5).replace('-', '/')} ~ ${w.week_end.slice(5).replace('-', '/')}`
                    const total = w.total_hours || 0
                    const pct = Math.min(100, Math.round((total / 52) * 100))
                    return (
                      <tr key={w.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-2 px-3 text-gray-700 font-medium">{weekLabel}</td>
                        <td className="py-2 px-3 text-center text-gray-600">{formatHours(w.regular_hours)}</td>
                        <td className="py-2 px-3 text-center">
                          {w.overtime_hours != null && w.overtime_hours > 0
                            ? <span className="text-orange-600 font-medium">{formatHours(w.overtime_hours)}</span>
                            : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`font-semibold ${w.is_over_52 ? 'text-red-600' : w.is_over_48 ? 'text-amber-600' : 'text-gray-800'}`}>
                              {formatHours(w.total_hours)}
                            </span>
                            <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  w.is_over_52 ? 'bg-red-500' : w.is_over_48 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          {w.is_over_52 ? (
                            <Badge variant="danger" className="text-[10px]">
                              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> 52시간 초과
                            </Badge>
                          ) : w.is_over_48 ? (
                            <Badge variant="warning" className="text-[10px]">
                              48시간 초과
                            </Badge>
                          ) : (
                            <Badge variant="success" className="text-[10px]">정상</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 관리자 수동 출퇴근 다이얼로그 ──────────────── */}
      <Dialog
        open={showAdminDialog}
        onClose={() => setShowAdminDialog(false)}
        title={`직원 ${adminCheckType === 'in' ? '출근' : '퇴근'} 등록`}
        className="max-w-md"
      >
        <div className="space-y-4">
          <Select
            label="직원 *"
            value={adminEmployeeId}
            onChange={(e) => setAdminEmployeeId(e.target.value)}
            options={[{ value: '', label: '선택하세요' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
          />
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            현재 시간 <span className="font-bold">{new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>으로 기록됩니다.
            {selectedDay && selectedDay !== todayStr && (
              <span className="block mt-1 text-xs">대상 날짜: <span className="font-bold">{selectedDay}</span></span>
            )}
          </div>
          <Input label="비고 (선택)" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="사유를 입력하세요" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAdminDialog(false)}>취소</Button>
            <Button onClick={handleAdminCheckSubmit} disabled={saving}>
              {saving ? '처리중...' : `${adminCheckType === 'in' ? '출근' : '퇴근'} 등록`}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
