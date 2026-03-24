import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  DollarSign, Users, TrendingDown, Calculator,
  Search, CheckCircle, Eye,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
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

interface PayrollRecord {
  id: string
  employee_id: string
  pay_year: number
  pay_month: number
  base_pay: number
  overtime_pay: number
  night_pay: number
  holiday_pay: number
  bonus: number
  allowances: Record<string, number> | null
  total_gross: number
  income_tax: number
  local_tax: number
  national_pension: number
  health_insurance: number
  long_care: number
  employment_insurance: number
  other_deductions: Record<string, number> | null
  total_deductions: number
  net_pay: number
  work_days: number
  overtime_hours_total: number
  leave_days_used: number
  late_count: number
  absent_count: number
  status: 'draft' | 'calculated' | 'confirmed' | 'paid'
  confirmed_by: string | null
  confirmed_at: string | null
  paid_at: string | null
}

interface PayrollSettings {
  id: string
  meal_allowance: number
  transportation_allowance: number
  national_pension_rate: number
  health_insurance_rate: number
  long_care_rate: number
  employment_insurance_rate: number
  tax_year: number
  pay_day: number
}

interface EmployeeHrDetail {
  employee_id: string
  base_salary: number
  annual_salary: number
}

interface AttendanceSummary {
  work_days: number
  overtime_hours: number
  late_count: number
  absent_count: number
}

/* ─── Constants ─────────────────────────────────────── */

const ADMIN_ROLES = ['ceo', 'director', 'division_head', 'admin'] as const

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'primary' }> = {
  draft: { label: '초안', variant: 'default' },
  calculated: { label: '산출완료', variant: 'info' },
  confirmed: { label: '확정', variant: 'success' },
  paid: { label: '지급완료', variant: 'primary' },
}

const YEARS = Array.from({ length: 5 }, (_, i) => {
  const y = new Date().getFullYear() - 2 + i
  return { value: String(y), label: `${y}년` }
})

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}월`,
}))

const DEFAULT_SETTINGS: PayrollSettings = {
  id: '',
  meal_allowance: 200000,
  transportation_allowance: 0,
  national_pension_rate: 0.045,
  health_insurance_rate: 0.03545,
  long_care_rate: 0.1295,
  employment_insurance_rate: 0.009,
  tax_year: new Date().getFullYear(),
  pay_day: 25,
}

function formatKRW(amount: number): string {
  if (amount === 0) return '0원'
  return new Intl.NumberFormat('ko-KR').format(amount) + '원'
}

function formatKRWShort(amount: number): string {
  if (amount === 0) return '-'
  return new Intl.NumberFormat('ko-KR').format(amount)
}

/* ─── Merged display row ──────────────────────────── */

interface PayrollRow {
  employee_id: string
  employee_name: string
  department: string
  record: PayrollRecord | null
}

/* ─── Component ─────────────────────────────────────── */

export default function PayrollPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const isAdmin = profile?.role ? (ADMIN_ROLES as readonly string[]).includes(profile.role) : false

  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([])
  const [settings, setSettings] = useState<PayrollSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1))
  const [detailRow, setDetailRow] = useState<PayrollRow | null>(null)

  /* ─── Helpers ─────────────────────────────────────── */

  const getDeptName = useCallback(
    (deptId: string | null) => departments.find((d) => d.id === deptId)?.name || '-',
    [departments],
  )

  /* ─── Fetch ───────────────────────────────────────── */

  const fetchPayroll = useCallback(async () => {
    const { data } = await supabase
      .from('payroll')
      .select('*')
      .eq('pay_year', Number(selectedYear))
      .eq('pay_month', Number(selectedMonth))

    setPayrollRecords((data || []) as PayrollRecord[])
  }, [selectedYear, selectedMonth])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const [empRes, deptRes, settingsRes] = await Promise.all([
        supabase.from('employees').select('id, name, department_id, position').eq('is_active', true).order('name'),
        supabase.from('departments').select('id, name').order('name'),
        supabase.from('payroll_settings').select('*').limit(1).single(),
      ])
      setEmployees((empRes.data || []) as Employee[])
      setDepartments((deptRes.data || []) as Department[])
      if (settingsRes.data) setSettings(settingsRes.data as PayrollSettings)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!loading) fetchPayroll()
  }, [loading, fetchPayroll])

  /* ─── Rows ────────────────────────────────────────── */

  const rows = useMemo((): PayrollRow[] => {
    if (!isAdmin) {
      // 직원 셀프뷰: 자기 것만
      const myRecord = payrollRecords.find((r) => r.employee_id === profile?.id) || null
      if (!profile) return []
      return [{
        employee_id: profile.id,
        employee_name: profile.name,
        department: getDeptName(profile.department_id),
        record: myRecord,
      }]
    }
    return employees.map((emp) => ({
      employee_id: emp.id,
      employee_name: emp.name,
      department: getDeptName(emp.department_id),
      record: payrollRecords.find((r) => r.employee_id === emp.id) || null,
    }))
  }, [employees, payrollRecords, isAdmin, profile, getDeptName])

  const filteredRows = useMemo(() => {
    let result = rows
    if (filterDept) result = result.filter((r) => r.department === filterDept)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((r) => r.employee_name.toLowerCase().includes(q))
    }
    return result
  }, [rows, filterDept, searchQuery])

  /* ─── Stats ───────────────────────────────────────── */

  const stats = useMemo(() => {
    const withRecord = filteredRows.filter((r) => r.record)
    const totalGross = withRecord.reduce((s, r) => s + (r.record?.total_gross || 0), 0)
    const totalDeductions = withRecord.reduce((s, r) => s + (r.record?.total_deductions || 0), 0)
    const totalNet = withRecord.reduce((s, r) => s + (r.record?.net_pay || 0), 0)
    return { totalGross, totalDeductions, totalNet, count: filteredRows.length }
  }, [filteredRows])

  const deptOptions = useMemo(
    () => [...new Set(employees.map((e) => getDeptName(e.department_id)).filter((n) => n !== '-'))],
    [employees, getDeptName],
  )

  /* ─── Attendance Summary ──────────────────────────── */

  async function getAttendanceSummary(employeeId: string, year: number, month: number): Promise<AttendanceSummary> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`

    const { data } = await supabase
      .from('attendance_records')
      .select('work_hours, overtime_hours, status')
      .eq('employee_id', employeeId)
      .gte('date', startDate)
      .lt('date', endDate)

    const records = data || []
    return {
      work_days: records.filter((r) => r.status !== 'absent' && r.status !== 'holiday').length,
      overtime_hours: records.reduce((s, r) => s + (r.overtime_hours || 0), 0),
      late_count: records.filter((r) => r.status === 'late').length,
      absent_count: records.filter((r) => r.status === 'absent').length,
    }
  }

  /* ─── Calculate ───────────────────────────────────── */

  async function handleCalculate() {
    if (!isAdmin) return
    setCalculating(true)
    const year = Number(selectedYear)
    const month = Number(selectedMonth)

    try {
      // Fetch HR details for all employees
      const { data: hrDetails } = await supabase
        .from('employee_hr_details')
        .select('employee_id, base_salary, annual_salary')

      const hrMap = new Map<string, EmployeeHrDetail>()
      for (const h of (hrDetails || []) as EmployeeHrDetail[]) {
        hrMap.set(h.employee_id, h)
      }

      const upserts: Omit<PayrollRecord, 'id'>[] = []

      for (const emp of employees) {
        const hr = hrMap.get(emp.id)
        const basePay = hr?.base_salary || 0
        if (basePay === 0) continue // 기본급 미설정 직원 건너뜀

        const attendance = await getAttendanceSummary(emp.id, year, month)

        // 시급 = 기본급 / 209
        const hourlyRate = basePay / 209
        const overtimePay = Math.round(attendance.overtime_hours * hourlyRate * 1.5)
        const nightPay = 0
        const holidayPay = 0
        const bonus = 0

        const allowances: Record<string, number> = {}
        if (settings.meal_allowance > 0) allowances['식대'] = settings.meal_allowance
        if (settings.transportation_allowance > 0) allowances['교통비'] = settings.transportation_allowance
        const allowancesTotal = Object.values(allowances).reduce((s, v) => s + v, 0)

        const totalGross = basePay + overtimePay + nightPay + holidayPay + bonus + allowancesTotal

        // 4대보험 (기본급 기준)
        const nationalPension = Math.round(basePay * settings.national_pension_rate)
        const healthInsurance = Math.round(basePay * settings.health_insurance_rate)
        const longCare = Math.round(healthInsurance * settings.long_care_rate)
        const employmentInsurance = Math.round(basePay * settings.employment_insurance_rate)

        // 간이 소득세 (기본급의 3%)
        const incomeTax = Math.round(basePay * 0.03)
        const localTax = Math.round(incomeTax * 0.1)

        const totalDeductions = nationalPension + healthInsurance + longCare + employmentInsurance + incomeTax + localTax
        const netPay = totalGross - totalDeductions

        upserts.push({
          employee_id: emp.id,
          pay_year: year,
          pay_month: month,
          base_pay: basePay,
          overtime_pay: overtimePay,
          night_pay: nightPay,
          holiday_pay: holidayPay,
          bonus,
          allowances: Object.keys(allowances).length > 0 ? allowances : null,
          total_gross: totalGross,
          income_tax: incomeTax,
          local_tax: localTax,
          national_pension: nationalPension,
          health_insurance: healthInsurance,
          long_care: longCare,
          employment_insurance: employmentInsurance,
          other_deductions: null,
          total_deductions: totalDeductions,
          net_pay: netPay,
          work_days: attendance.work_days,
          overtime_hours_total: attendance.overtime_hours,
          leave_days_used: 0,
          late_count: attendance.late_count,
          absent_count: attendance.absent_count,
          status: 'calculated',
          confirmed_by: null,
          confirmed_at: null,
          paid_at: null,
        })
      }

      if (upserts.length === 0) {
        toast('기본급이 설정된 직원이 없습니다. employee_hr_details를 확인하세요.', 'error')
        setCalculating(false)
        return
      }

      const { error } = await supabase
        .from('payroll')
        .upsert(upserts, { onConflict: 'employee_id,pay_year,pay_month' })

      if (error) {
        toast('급여 산출 실패: ' + error.message, 'error')
      } else {
        toast(`${upserts.length}명 급여 산출 완료`, 'success')
        await fetchPayroll()
      }
    } catch (err) {
      toast('급여 산출 중 오류가 발생했습니다', 'error')
      console.error(err)
    }
    setCalculating(false)
  }

  /* ─── Confirm ─────────────────────────────────────── */

  async function handleConfirm() {
    if (!isAdmin || !profile) return
    setConfirming(true)

    const calculatedIds = payrollRecords
      .filter((r) => r.status === 'calculated')
      .map((r) => r.id)

    if (calculatedIds.length === 0) {
      toast('확정할 급여 데이터가 없습니다', 'info')
      setConfirming(false)
      return
    }

    const { error } = await supabase
      .from('payroll')
      .update({
        status: 'confirmed',
        confirmed_by: profile.id,
        confirmed_at: new Date().toISOString(),
      })
      .in('id', calculatedIds)

    if (error) {
      toast('확정 실패: ' + error.message, 'error')
    } else {
      toast(`${calculatedIds.length}건 급여 확정 완료`, 'success')
      await fetchPayroll()
    }
    setConfirming(false)
  }

  /* ─── Self-view (non-admin) ───────────────────────── */

  if (!loading && !isAdmin) {
    const myRows = rows
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">내 급여명세서</h1>
          <p className="text-sm text-gray-500 mt-0.5">월별 급여 내역을 확인합니다</p>
        </div>

        {/* 월 선택 */}
        <div className="flex gap-2">
          <Select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            options={YEARS}
          />
          <Select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            options={MONTHS}
          />
        </div>

        {myRows.length === 0 || !myRows[0].record ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-400">
              {selectedYear}년 {selectedMonth}월 급여 데이터가 없습니다
            </CardContent>
          </Card>
        ) : (
          <PayslipCard record={myRows[0].record} />
        )}
      </div>
    )
  }

  if (loading) return <PageSpinner />

  /* ─── Admin view ──────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">급여 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedYear}년 {selectedMonth}월 급여 현황
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleConfirm}
            disabled={confirming || payrollRecords.filter((r) => r.status === 'calculated').length === 0}
          >
            <CheckCircle className="h-4 w-4" />
            {confirming ? '확정중...' : '급여 확정'}
          </Button>
          <Button onClick={handleCalculate} disabled={calculating}>
            <Calculator className="h-4 w-4" />
            {calculating ? '산출중...' : '급여 산출'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-gray-500">총 지급액</span>
            </div>
            <p className="text-xl font-bold text-blue-600 tabular-nums">
              {stats.totalGross > 0 ? formatKRW(stats.totalGross) : '-'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-[11px] text-gray-500">총 공제액</span>
            </div>
            <p className="text-xl font-bold text-red-600 tabular-nums">
              {stats.totalDeductions > 0 ? formatKRW(stats.totalDeductions) : '-'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] text-gray-500">실지급 합계</span>
            </div>
            <p className="text-xl font-bold text-emerald-600 tabular-nums">
              {stats.totalNet > 0 ? formatKRW(stats.totalNet) : '-'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-violet-500" />
              <span className="text-[11px] text-gray-500">대상 직원수</span>
            </div>
            <p className="text-xl font-bold text-violet-600">{stats.count}명</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="직원 검색..."
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-full sm:w-48 focus:outline-none focus:border-blue-400"
          />
        </div>
        <Select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          options={[{ value: '', label: '전체 부서' }, ...deptOptions.map((n) => ({ value: n, label: n }))]}
        />
        <Select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          options={YEARS}
        />
        <Select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          options={MONTHS}
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>급여 현황</CardTitle>
          <Badge variant="info" className="text-[10px]">
            {selectedYear}년 {selectedMonth}월
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs whitespace-nowrap">이름</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs whitespace-nowrap">부서</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">기본급</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">연장수당</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">야간수당</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">수당계</th>
                  <th className="text-right py-3 px-2 font-medium text-blue-600 text-xs whitespace-nowrap bg-blue-50/50">총지급액</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">국민연금</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">건강보험</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">장기요양</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">고용보험</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">소득세</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">지방세</th>
                  <th className="text-right py-3 px-2 font-medium text-red-600 text-xs whitespace-nowrap bg-red-50/50">총공제</th>
                  <th className="text-right py-3 px-2 font-medium text-emerald-700 text-xs whitespace-nowrap bg-emerald-50/50">실수령액</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">상태</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">상세</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="text-center py-12 text-gray-400">
                      직원 데이터가 없습니다
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const r = row.record
                    const allowancesTotal = r?.allowances
                      ? Object.values(r.allowances).reduce((s, v) => s + v, 0)
                      : 0
                    const statusInfo = r ? STATUS_MAP[r.status] || STATUS_MAP.draft : null

                    return (
                      <tr
                        key={row.employee_id}
                        className="border-b border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                        onClick={() => setDetailRow(row)}
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                              {row.employee_name[0]}
                            </div>
                            <span className="font-medium text-gray-900 whitespace-nowrap">{row.employee_name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-600 whitespace-nowrap">{row.department}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums text-gray-700">{r ? formatKRWShort(r.base_pay) : '-'}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums text-gray-600">{r ? formatKRWShort(r.overtime_pay) : '-'}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums text-gray-600">{r ? formatKRWShort(r.night_pay) : '-'}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums text-gray-600">{r ? formatKRWShort(allowancesTotal) : '-'}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums font-semibold text-blue-700 bg-blue-50/30">{r ? formatKRWShort(r.total_gross) : '-'}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums text-gray-500">{r ? formatKRWShort(r.national_pension) : '-'}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums text-gray-500">{r ? formatKRWShort(r.health_insurance) : '-'}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums text-gray-500">{r ? formatKRWShort(r.long_care) : '-'}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums text-gray-500">{r ? formatKRWShort(r.employment_insurance) : '-'}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums text-gray-500">{r ? formatKRWShort(r.income_tax) : '-'}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums text-gray-500">{r ? formatKRWShort(r.local_tax) : '-'}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums font-semibold text-red-600 bg-red-50/30">{r ? formatKRWShort(r.total_deductions) : '-'}</td>
                        <td className="py-2.5 px-2 text-right text-xs tabular-nums font-bold text-emerald-700 bg-emerald-50/30">{r ? formatKRWShort(r.net_pay) : '-'}</td>
                        <td className="py-2.5 px-2 text-center">
                          {statusInfo ? (
                            <Badge variant={statusInfo.variant} className="text-[10px]">{statusInfo.label}</Badge>
                          ) : (
                            <span className="text-[10px] text-gray-300">미산출</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                            onClick={(e) => { e.stopPropagation(); setDetailRow(row) }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
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

      {/* Detail Dialog */}
      <Dialog
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `${detailRow.employee_name} — ${selectedYear}년 ${selectedMonth}월 급여 상세` : ''}
        className="max-w-[calc(100vw-2rem)] sm:max-w-xl"
      >
        {detailRow?.record ? (
          <PayslipDetail record={detailRow.record} />
        ) : (
          <p className="text-center text-gray-400 py-8">급여 데이터가 아직 산출되지 않았습니다</p>
        )}
      </Dialog>
    </div>
  )
}

/* ─── Payslip Card (Self-view) ────────────────────── */

function PayslipCard({ record }: { record: PayrollRecord }) {
  const allowancesTotal = record.allowances
    ? Object.values(record.allowances).reduce((s, v) => s + v, 0)
    : 0
  const statusInfo = STATUS_MAP[record.status] || STATUS_MAP.draft

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{record.pay_year}년 {record.pay_month}월 급여명세서</CardTitle>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 지급 내역 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">지급 내역</h4>
          <div className="space-y-2">
            <DetailLine label="기본급" value={record.base_pay} />
            <DetailLine label="연장근로수당" value={record.overtime_pay} />
            <DetailLine label="야간근로수당" value={record.night_pay} />
            <DetailLine label="휴일근로수당" value={record.holiday_pay} />
            <DetailLine label="상여금" value={record.bonus} />
            {record.allowances && Object.entries(record.allowances).map(([k, v]) => (
              <DetailLine key={k} label={k} value={v} />
            ))}
            <DetailLine label="수당 소계" value={allowancesTotal} />
            <div className="border-t pt-2 mt-2">
              <DetailLine label="총 지급액" value={record.total_gross} bold className="text-blue-700" />
            </div>
          </div>
        </div>

        {/* 공제 내역 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">공제 내역</h4>
          <div className="space-y-2">
            <DetailLine label="국민연금" value={record.national_pension} negative />
            <DetailLine label="건강보험" value={record.health_insurance} negative />
            <DetailLine label="장기요양보험" value={record.long_care} negative />
            <DetailLine label="고용보험" value={record.employment_insurance} negative />
            <DetailLine label="소득세" value={record.income_tax} negative />
            <DetailLine label="지방소득세" value={record.local_tax} negative />
            {record.other_deductions && Object.entries(record.other_deductions).map(([k, v]) => (
              <DetailLine key={k} label={k} value={v} negative />
            ))}
            <div className="border-t pt-2 mt-2">
              <DetailLine label="총 공제액" value={record.total_deductions} bold negative />
            </div>
          </div>
        </div>

        {/* 실수령액 */}
        <div className="bg-emerald-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-800">실수령액</span>
            <span className="text-xl font-bold text-emerald-700">{formatKRW(record.net_pay)}</span>
          </div>
        </div>

        {/* 근태 정보 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">근태 정보</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
              <span className="text-gray-500">근무일수</span>
              <span className="font-medium">{record.work_days}일</span>
            </div>
            <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
              <span className="text-gray-500">연장근무</span>
              <span className="font-medium">{record.overtime_hours_total}시간</span>
            </div>
            <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
              <span className="text-gray-500">지각</span>
              <span className="font-medium">{record.late_count}회</span>
            </div>
            <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
              <span className="text-gray-500">결근</span>
              <span className="font-medium">{record.absent_count}회</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ─── Payslip Detail (Dialog inner) ───────────────── */

function PayslipDetail({ record }: { record: PayrollRecord }) {
  const allowancesTotal = record.allowances
    ? Object.values(record.allowances).reduce((s, v) => s + v, 0)
    : 0

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto">
      {/* 지급 내역 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">지급 내역</h4>
        <div className="space-y-1.5">
          <DetailLine label="기본급" value={record.base_pay} />
          <DetailLine label="연장근로수당" value={record.overtime_pay} />
          <DetailLine label="야간근로수당" value={record.night_pay} />
          <DetailLine label="휴일근로수당" value={record.holiday_pay} />
          <DetailLine label="상여금" value={record.bonus} />
          {record.allowances && Object.entries(record.allowances).map(([k, v]) => (
            <DetailLine key={k} label={k} value={v} />
          ))}
          <DetailLine label="수당 소계" value={allowancesTotal} />
          <div className="border-t pt-1.5 mt-1.5">
            <DetailLine label="총 지급액" value={record.total_gross} bold className="text-blue-700" />
          </div>
        </div>
      </div>

      {/* 공제 내역 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">공제 내역</h4>
        <div className="space-y-1.5">
          <DetailLine label="국민연금" value={record.national_pension} negative />
          <DetailLine label="건강보험" value={record.health_insurance} negative />
          <DetailLine label="장기요양보험" value={record.long_care} negative />
          <DetailLine label="고용보험" value={record.employment_insurance} negative />
          <DetailLine label="소득세" value={record.income_tax} negative />
          <DetailLine label="지방소득세" value={record.local_tax} negative />
          {record.other_deductions && Object.entries(record.other_deductions).map(([k, v]) => (
            <DetailLine key={k} label={k} value={v} negative />
          ))}
          <div className="border-t pt-1.5 mt-1.5">
            <DetailLine label="총 공제액" value={record.total_deductions} bold negative />
          </div>
        </div>
      </div>

      {/* 실수령액 */}
      <div className="bg-emerald-50 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-emerald-800">실수령액</span>
          <span className="text-lg font-bold text-emerald-700">{formatKRW(record.net_pay)}</span>
        </div>
      </div>

      {/* 근태 */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
          <span className="text-gray-500">근무일수</span>
          <span className="font-medium">{record.work_days}일</span>
        </div>
        <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
          <span className="text-gray-500">연장근무</span>
          <span className="font-medium">{record.overtime_hours_total}시간</span>
        </div>
        <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
          <span className="text-gray-500">지각</span>
          <span className="font-medium">{record.late_count}회</span>
        </div>
        <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
          <span className="text-gray-500">결근</span>
          <span className="font-medium">{record.absent_count}회</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Detail Line ─────────────────────────────────── */

function DetailLine({
  label, value, bold, negative, className,
}: {
  label: string
  value: number
  bold?: boolean
  negative?: boolean
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between text-sm ${className || ''}`}>
      <span className={`text-gray-600 ${bold ? 'font-semibold' : ''}`}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : 'font-medium'} ${negative ? 'text-red-600' : ''}`}>
        {negative && value > 0 ? '-' : ''}{formatKRW(value)}
      </span>
    </div>
  )
}
