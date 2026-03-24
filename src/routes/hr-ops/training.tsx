import { useState, useEffect, useMemo } from 'react'
import {
  BookOpen, AlertTriangle, CheckCircle,
  Search, Upload, Download, Clock,
  ShieldCheck, Lock, HardHat, Heart,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

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

interface TrainingRecord {
  id: string
  employee_id: string
  training_type: string
  training_name: string
  year: number
  completed: boolean
  completed_at: string | null
  certificate_url: string | null
  note: string | null
  created_at: string
}

const MANDATORY_TRAININGS = [
  {
    key: 'sexual_harassment',
    name: '성희롱 예방교육',
    icon: ShieldCheck,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    description: '연 1회 의무, 전 직원 대상',
  },
  {
    key: 'privacy',
    name: '개인정보보호교육',
    icon: Lock,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    description: '연 1회 의무, 개인정보 취급자',
  },
  {
    key: 'safety',
    name: '산업안전보건교육',
    icon: HardHat,
    color: 'text-amber-500',
    bgColor: 'bg-amber-50',
    description: '분기 1회, 사무직 3시간/비사무직 6시간',
  },
  {
    key: 'disability_awareness',
    name: '장애인인식개선교육',
    icon: Heart,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-50',
    description: '연 1회 의무, 전 직원 대상',
  },
]

const ADMIN_ROLES = ['ceo', 'director', 'division_head', 'admin']

export default function TrainingPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const isAdmin = profile?.role ? ADMIN_ROLES.includes(profile.role) : false
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [activeTab, setActiveTab] = useState<'mandatory' | 'external'>('mandatory')
  const [currentYear] = useState(new Date().getFullYear())

  useEffect(() => {
    fetchData()
  }, [profile?.id])

  async function fetchData() {
    if (!profile?.id) return
    setLoading(true)

    let empQuery = supabase.from('employees').select('id, name, department_id, position').eq('is_active', true).order('name')
    if (!isAdmin) empQuery = empQuery.eq('id', profile.id)

    let trainQuery = supabase.from('training_records').select('*').eq('year', currentYear).order('created_at', { ascending: false })
    if (!isAdmin) trainQuery = trainQuery.eq('employee_id', profile.id)

    const [empRes, deptRes, trainRes] = await Promise.all([
      empQuery,
      supabase.from('departments').select('id, name').order('name'),
      trainQuery,
    ])
    setEmployees((empRes.data || []) as Employee[])
    setDepartments((deptRes.data || []) as Department[])
    setTrainingRecords((trainRes.data || []) as TrainingRecord[])
    setLoading(false)
  }

  const getDeptName = (deptId: string | null) => departments.find((d) => d.id === deptId)?.name || '-'
  const getEmpName = (empId: string) => employees.find((e) => e.id === empId)?.name || '-'

  const deptNames = useMemo(() => [...new Set(employees.map((e) => getDeptName(e.department_id)).filter((n) => n !== '-'))], [employees, departments])

  // 필터링된 직원
  const filteredEmployees = useMemo(() => {
    let result = employees
    if (filterDept) result = result.filter((e) => getDeptName(e.department_id) === filterDept)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) => e.name.toLowerCase().includes(q))
    }
    return result
  }, [employees, filterDept, searchQuery, departments])

  // 법정교육별 이수 현황
  const mandatoryStats = useMemo(() => {
    return MANDATORY_TRAININGS.map((training) => {
      const records = trainingRecords.filter(
        (r) => r.training_type === 'mandatory' && r.training_name === training.name
      )
      const completedIds = new Set(records.filter((r) => r.completed).map((r) => r.employee_id))
      const total = filteredEmployees.length
      const completed = filteredEmployees.filter((e) => completedIds.has(e.id)).length
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0

      return {
        ...training,
        total,
        completed,
        incomplete: total - completed,
        rate,
        completedIds,
      }
    })
  }, [trainingRecords, filteredEmployees])

  // 외부 교육 기록
  const externalRecords = useMemo(() => {
    const records = trainingRecords.filter((r) => r.training_type === 'external')
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return records.filter(
        (r) =>
          getEmpName(r.employee_id).toLowerCase().includes(q) ||
          r.training_name.toLowerCase().includes(q)
      )
    }
    return records
  }, [trainingRecords, searchQuery, employees])

  // 전체 통계
  const totalPrograms = new Set(trainingRecords.map((r) => r.training_name)).size
  const overallCompletionRate = useMemo(() => {
    const total = mandatoryStats.reduce((sum, s) => sum + s.total, 0)
    const completed = mandatoryStats.reduce((sum, s) => sum + s.completed, 0)
    return total > 0 ? Math.round((completed / total) * 100) : 0
  }, [mandatoryStats])
  const overdueCount = mandatoryStats.reduce((sum, s) => sum + s.incomplete, 0)

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">교육 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">법정 의무 교육 및 외부 교육을 관리합니다 ({currentYear}년)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => toast('엑셀 다운로드 기능 준비중', 'info')}>
            <Download className="h-4 w-4 mr-1" /> 다운로드
          </Button>
          <Button onClick={() => toast('수료증 업로드 기능 준비중', 'info')}>
            <Upload className="h-4 w-4 mr-1" /> 수료증 업로드
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-gray-500">교육 프로그램</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{totalPrograms}개</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] text-gray-500">전체 이수율</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{overallCompletionRate}%</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-[11px] text-gray-500">미이수 건수</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{overdueCount}건</p>
          </CardContent>
        </Card>
      </div>

      {/* 탭 + 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {([
            { key: 'mandatory' as const, label: '법정 의무 교육' },
            { key: 'external' as const, label: '외부 교육' },
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
              placeholder="직원/교육 검색..."
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

      {/* 법정 의무 교육 */}
      {activeTab === 'mandatory' && (
        <div className="space-y-4">
          {/* 교육별 이수율 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mandatoryStats.map((training) => {
              const Icon = training.icon
              return (
                <Card key={training.key}>
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg ${training.bgColor} flex items-center justify-center shrink-0`}>
                        <Icon className={`h-5 w-5 ${training.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-gray-900 text-sm">{training.name}</h3>
                          <Badge
                            variant={training.rate === 100 ? 'success' : training.rate >= 50 ? 'warning' : 'danger'}
                            className="text-[10px]"
                          >
                            {training.rate === 100 ? '완료' : training.rate >= 50 ? '진행중' : '미흡'}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">{training.description}</p>
                      </div>
                    </div>

                    <ProgressBar
                      value={training.completed}
                      max={training.total}
                      size="sm"
                      color={training.rate === 100 ? 'emerald' : training.rate >= 50 ? 'amber' : 'red'}
                    />

                    <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
                      <span>이수: <span className="font-medium text-gray-900">{training.completed}명</span> / {training.total}명</span>
                      <span>미이수: <span className="font-medium text-red-600">{training.incomplete}명</span></span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* 직원별 이수 현황 그리드 */}
          <Card>
            <CardHeader>
              <CardTitle>직원별 이수 현황</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80">
                      <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs">직원</th>
                      <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">부서</th>
                      {MANDATORY_TRAININGS.map((t) => (
                        <th key={t.key} className="text-center py-3 px-3 font-medium text-gray-500 text-xs whitespace-nowrap">
                          {t.name.replace('교육', '')}
                        </th>
                      ))}
                      <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">이수율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-12 text-gray-400">직원 데이터가 없습니다</td></tr>
                    ) : (
                      filteredEmployees.map((emp) => {
                        const completedCount = mandatoryStats.filter((s) => s.completedIds.has(emp.id)).length
                        const totalTrainings = MANDATORY_TRAININGS.length
                        const empRate = Math.round((completedCount / totalTrainings) * 100)

                        return (
                          <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                                  {emp.name[0]}
                                </div>
                                <span className="font-medium text-gray-900">{emp.name}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-xs text-gray-600">{getDeptName(emp.department_id)}</td>
                            {mandatoryStats.map((training) => (
                              <td key={training.key} className="py-2.5 px-3 text-center">
                                {training.completedIds.has(emp.id) ? (
                                  <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" />
                                ) : (
                                  <Clock className="h-4 w-4 text-gray-300 mx-auto" />
                                )}
                              </td>
                            ))}
                            <td className="py-2.5 px-3 text-center">
                              <Badge
                                variant={empRate === 100 ? 'success' : empRate >= 50 ? 'warning' : 'danger'}
                                className="text-[10px]"
                              >
                                {empRate}%
                              </Badge>
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
        </div>
      )}

      {/* 외부 교육 */}
      {activeTab === 'external' && (
        <Card>
          <CardHeader>
            <CardTitle>외부 교육 이력</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs">직원</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">교육명</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">이수 여부</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">이수일</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">비고</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">수료증</th>
                  </tr>
                </thead>
                <tbody>
                  {externalRecords.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">외부 교육 이력이 없습니다</td></tr>
                  ) : (
                    externalRecords.map((rec) => (
                      <tr key={rec.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                              {getEmpName(rec.employee_id)[0]}
                            </div>
                            <span className="font-medium text-gray-900">{getEmpName(rec.employee_id)}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-900 font-medium">{rec.training_name}</td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge variant={rec.completed ? 'success' : 'warning'} className="text-[10px]">
                            {rec.completed ? '이수' : '미이수'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-600">
                          {rec.completed_at ? new Date(rec.completed_at).toLocaleDateString('ko-KR') : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-500 max-w-[200px] truncate">{rec.note || '-'}</td>
                        <td className="py-2.5 px-3 text-center">
                          {rec.certificate_url ? (
                            <button
                              onClick={() => toast('수료증 다운로드 기능 준비중', 'info')}
                              className="px-2 py-1 text-[10px] font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              다운로드
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400">없음</span>
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
    </div>
  )
}
