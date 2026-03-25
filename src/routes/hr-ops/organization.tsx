import { useState, useEffect, useMemo } from 'react'
import {
  Building2, Users, ChevronDown, ChevronRight,
  Search, User,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import OrgChartTree from '@/components/hr-ops/OrgChartTree'

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
  parent_id: string | null
}

interface DeptTree extends Department {
  children: DeptTree[]
  employees: Employee[]
}

export default function OrganizationPage() {
  const navigate = useNavigate()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [empRes, deptRes] = await Promise.all([
      supabase.from('employees').select('id, name, department_id, position, hire_date').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name, parent_id').order('name'),
    ])
    const depts = (deptRes.data || []) as Department[]
    setEmployees((empRes.data || []) as Employee[])
    setDepartments(depts)
    // 기본적으로 모든 부서 펼치기
    setExpandedDepts(new Set(depts.map((d) => d.id)))
    setLoading(false)
  }

  // 부서 트리 구성
  const deptTree = useMemo(() => {
    const deptMap = new Map<string, DeptTree>()
    departments.forEach((d) => {
      deptMap.set(d.id, { ...d, children: [], employees: [] })
    })

    // 직원 배치
    employees.forEach((emp) => {
      if (emp.department_id && deptMap.has(emp.department_id)) {
        deptMap.get(emp.department_id)!.employees.push(emp)
      }
    })

    // 트리 빌드
    const roots: DeptTree[] = []
    deptMap.forEach((dept) => {
      if (dept.parent_id && deptMap.has(dept.parent_id)) {
        deptMap.get(dept.parent_id)!.children.push(dept)
      } else {
        roots.push(dept)
      }
    })

    return roots
  }, [departments, employees])

  // 부서에 속하지 않은 직원
  const unassignedEmployees = useMemo(() => {
    return employees.filter((emp) => !emp.department_id || !departments.find((d) => d.id === emp.department_id))
  }, [employees, departments])

  // 검색 결과
  const searchResults = useMemo(() => {
    if (!searchQuery) return []
    const q = searchQuery.toLowerCase()
    return employees.filter((emp) => emp.name.toLowerCase().includes(q))
  }, [employees, searchQuery])

  function toggleDept(deptId: string) {
    setExpandedDepts((prev) => {
      const next = new Set(prev)
      if (next.has(deptId)) next.delete(deptId)
      else next.add(deptId)
      return next
    })
  }

  // 통계
  const totalDepts = departments.length
  const totalEmps = employees.length

  function renderEmployeeCard(emp: Employee) {
    return (
      <button
        key={emp.id}
        onClick={() => navigate(`/admin/employees/${emp.id}/profile`)}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors text-left w-full group"
      >
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0 group-hover:bg-blue-200 transition-colors">
          {emp.name[0]}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700">{emp.name}</p>
          <p className="text-[11px] text-gray-500 truncate">{emp.position || '직위 미지정'}</p>
        </div>
      </button>
    )
  }

  function renderDeptNode(dept: DeptTree, depth: number = 0) {
    const isExpanded = expandedDepts.has(dept.id)
    const hasChildren = dept.children.length > 0
    const hasEmployees = dept.employees.length > 0
    const totalInDept = dept.employees.length

    return (
      <div key={dept.id} id={`dept-${dept.id}`} className={depth > 0 ? 'ml-6' : ''}>
        {/* 부서 헤더 */}
        <button
          onClick={() => toggleDept(dept.id)}
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
        >
          <span className="text-gray-400">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
          <Building2 className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="font-semibold text-gray-900 text-sm">{dept.name}</span>
          <Badge variant="default" className="text-[10px] ml-1">{totalInDept}명</Badge>
        </button>

        {/* 펼쳐진 내용 */}
        {isExpanded && (
          <div className="ml-6 border-l-2 border-gray-100 pl-2">
            {/* 직원 목록 */}
            {hasEmployees && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 py-1">
                {dept.employees.map(renderEmployeeCard)}
              </div>
            )}

            {!hasEmployees && !hasChildren && (
              <p className="text-xs text-gray-400 py-2 px-3">소속 직원이 없습니다</p>
            )}

            {/* 하위 부서 */}
            {hasChildren && dept.children.map((child) => renderDeptNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">조직도</h1>
          <p className="text-sm text-gray-500 mt-0.5">부서별 조직 구성과 직원 현황을 확인합니다</p>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-gray-500">전체 부서</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{totalDepts}개</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] text-gray-500">전체 직원</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{totalEmps}명</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <User className="h-4 w-4 text-amber-500" />
              <span className="text-[11px] text-gray-500">미배정 직원</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{unassignedEmployees.length}명</p>
          </CardContent>
        </Card>
      </div>

      {/* 조직도 시각화 */}
      {deptTree.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>조직 구조</CardTitle>
          </CardHeader>
          <CardContent>
            <OrgChartTree
              tree={deptTree}
              onDeptClick={(deptId) => {
                setExpandedDepts((prev) => new Set([...prev, deptId]))
                document.getElementById(`dept-${deptId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* 검색 */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="직원 검색..."
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-full focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      {/* 검색 결과 */}
      {searchQuery && (
        <Card>
          <CardHeader>
            <CardTitle>검색 결과 ({searchResults.length}명)</CardTitle>
          </CardHeader>
          <CardContent>
            {searchResults.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">검색 결과가 없습니다</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                {searchResults.map((emp) => {
                  const dept = departments.find((d) => d.id === emp.department_id)
                  return (
                    <button
                      key={emp.id}
                      onClick={() => navigate(`/admin/employees/${emp.id}/profile`)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors text-left w-full group"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
                        {emp.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700">{emp.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">{dept?.name || '미배정'} · {emp.position || '-'}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 조직도 트리 */}
      {!searchQuery && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>조직 구성</CardTitle>
            <div className="flex gap-2">
              <button
                onClick={() => setExpandedDepts(new Set(departments.map((d) => d.id)))}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                전체 펼치기
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => setExpandedDepts(new Set())}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium"
              >
                전체 접기
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {deptTree.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">등록된 부서가 없습니다</p>
            ) : (
              <div className="space-y-1">
                {deptTree.map((dept) => renderDeptNode(dept))}
              </div>
            )}

            {/* 미배정 직원 */}
            {unassignedEmployees.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 px-3 py-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <span className="font-semibold text-gray-600 text-sm">미배정 직원</span>
                  <Badge variant="warning" className="text-[10px] ml-1">{unassignedEmployees.length}명</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 ml-6">
                  {unassignedEmployees.map(renderEmployeeCard)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
