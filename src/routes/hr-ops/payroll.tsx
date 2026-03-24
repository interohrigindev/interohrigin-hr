import { useState, useEffect, useMemo } from 'react'
import {
  DollarSign, Users, TrendingUp, Upload,
  Download, Search, FileSpreadsheet, Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'

interface Employee {
  id: string
  name: string
  department_id: string | null
  position: string | null
  hire_date: string | null
}

interface Department {
  id: string
  name: string
}

// 급여 데이터 (플레이스홀더용)
interface PayrollEntry {
  employee_id: string
  name: string
  department: string
  position: string
  base_salary: number
  deductions: number
  net_pay: number
  payment_date: string
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}월`,
}))

export default function PayrollPage() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [selectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1))

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [empRes, deptRes] = await Promise.all([
      supabase.from('employees').select('id, name, department_id, position, hire_date').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name').order('name'),
    ])
    setEmployees((empRes.data || []) as Employee[])
    setDepartments((deptRes.data || []) as Department[])
    setLoading(false)
  }

  const getDeptName = (deptId: string | null) => departments.find((d) => d.id === deptId)?.name || '-'

  // 플레이스홀더 급여 데이터 생성
  const payrollData = useMemo((): PayrollEntry[] => {
    return employees.map((emp) => {
      // 급여 데이터는 실제로 외부에서 관리됨. 여기서는 뷰 전용 플레이스홀더.
      const baseSalary = 0
      const deductions = 0
      const netPay = 0
      const payDate = `${selectedYear}.${selectedMonth.padStart(2, '0')}.25`

      return {
        employee_id: emp.id,
        name: emp.name,
        department: getDeptName(emp.department_id),
        position: emp.position || '-',
        base_salary: baseSalary,
        deductions,
        net_pay: netPay,
        payment_date: payDate,
      }
    })
  }, [employees, departments, selectedYear, selectedMonth])

  // 필터링
  const filteredPayroll = useMemo(() => {
    let result = payrollData
    if (filterDept) result = result.filter((p) => p.department === filterDept)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((p) => p.name.toLowerCase().includes(q))
    }
    return result
  }, [payrollData, filterDept, searchQuery])

  // 통계
  const totalPayroll = filteredPayroll.reduce((sum, p) => sum + p.net_pay, 0)
  const employeeCount = filteredPayroll.length
  const avgSalary = employeeCount > 0 ? Math.round(totalPayroll / employeeCount) : 0

  const deptNames = useMemo(() => [...new Set(employees.map((e) => getDeptName(e.department_id)).filter((n) => n !== '-'))], [employees, departments])

  function formatCurrency(amount: number) {
    if (amount === 0) return '-'
    return new Intl.NumberFormat('ko-KR').format(amount) + '원'
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">급여 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">직원 급여 현황을 조회합니다 ({selectedYear}년 {selectedMonth}월)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => toast('엑셀 다운로드 기능 준비중', 'info')}>
            <Download className="h-4 w-4 mr-1" /> 다운로드
          </Button>
          <Button onClick={() => toast('엑셀 업로드 기능 준비중 — 급여 데이터는 외부에서 관리됩니다', 'info')}>
            <Upload className="h-4 w-4 mr-1" /> 급여 업로드
          </Button>
        </div>
      </div>

      {/* 안내 배너 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-medium mb-1">급여 데이터 안내</p>
          <p className="text-blue-600 text-xs leading-relaxed">
            급여 데이터는 외부 급여 시스템에서 관리됩니다. 이 페이지는 업로드된 급여 데이터를 조회하는 용도입니다.
            엑셀 파일(.xlsx)로 급여 데이터를 업로드하면 직원별 급여 현황을 확인할 수 있습니다.
          </p>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-gray-500">총 급여액</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{totalPayroll > 0 ? formatCurrency(totalPayroll) : '데이터 없음'}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] text-gray-500">대상 인원</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{employeeCount}명</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-violet-500" />
              <span className="text-[11px] text-gray-500">평균 급여</span>
            </div>
            <p className="text-2xl font-bold text-violet-600">{avgSalary > 0 ? formatCurrency(avgSalary) : '데이터 없음'}</p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
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
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            options={MONTHS}
          />
        </div>
      </div>

      {/* 급여 목록 테이블 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>급여 현황</CardTitle>
          <Badge variant="info" className="text-[10px]">
            <FileSpreadsheet className="h-3 w-3 mr-0.5 inline" />
            {selectedYear}년 {selectedMonth}월
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs">직원</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">부서</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">직위</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500 text-xs">기본급</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500 text-xs">공제액</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500 text-xs">실수령액</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">지급일</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayroll.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">직원 데이터가 없습니다</td></tr>
                ) : (
                  filteredPayroll.map((entry) => (
                    <tr key={entry.employee_id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                            {entry.name[0]}
                          </div>
                          <span className="font-medium text-gray-900">{entry.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-gray-600">{entry.department}</td>
                      <td className="py-2.5 px-3 text-xs text-gray-600">{entry.position}</td>
                      <td className="py-2.5 px-3 text-right text-xs text-gray-600 tabular-nums">{formatCurrency(entry.base_salary)}</td>
                      <td className="py-2.5 px-3 text-right text-xs text-red-600 tabular-nums">{entry.deductions > 0 ? `-${formatCurrency(entry.deductions)}` : '-'}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-gray-900 tabular-nums">{formatCurrency(entry.net_pay)}</td>
                      <td className="py-2.5 px-3 text-center text-xs text-gray-500">{entry.payment_date}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 업로드 안내 */}
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Upload className="h-6 w-6 text-gray-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">급여 데이터 업로드</h3>
            <p className="text-xs text-gray-500 mb-4 max-w-md mx-auto leading-relaxed">
              외부 급여 시스템에서 내보낸 엑셀 파일(.xlsx)을 업로드하면 직원별 급여 현황을 확인할 수 있습니다.
              엑셀 파일에는 직원명, 기본급, 공제액, 실수령액 열이 포함되어야 합니다.
            </p>
            <Button
              variant="outline"
              onClick={() => toast('엑셀 업로드 기능 준비중입니다', 'info')}
            >
              <FileSpreadsheet className="h-4 w-4 mr-1" /> 엑셀 파일 선택
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
