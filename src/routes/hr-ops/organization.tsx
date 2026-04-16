import { useState, useEffect, useMemo } from 'react'
import {
  Building2, Users, ChevronDown, ChevronRight,
  Search, User, Download,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { AnimalAvatar } from '@/components/ui/AnimalAvatar'
import { extractAvatarKey, renderAvatarSvg } from '@/lib/avatar-data'

/* ─── 타입 ───────────────────────────────────────── */

interface Employee {
  id: string
  name: string
  department_id: string | null
  position: string | null
  hire_date: string | null
  role: string
  employee_number: string | null
  avatar_url: string | null
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

/* ─── 역할 표시 ──────────────────────────────────── */

const ROLE_BADGES: Record<string, { label: string; color: string }> = {
  ceo: { label: '대표', color: 'bg-red-100 text-red-700' },
  admin: { label: '관리자', color: 'bg-purple-100 text-purple-700' },
  division_head: { label: '본부장', color: 'bg-emerald-100 text-emerald-700' },
  director: { label: '이사', color: 'bg-blue-100 text-blue-700' },
  leader: { label: '리더', color: 'bg-amber-100 text-amber-700' },
}

const POSITION_LABEL: Record<string, string> = {
  ceo: '대표',
  admin: '관리자',
  division_head: '본부장',
  director: '이사',
  leader: '팀장',
  employee: '팀원',
}

/* ─── 유틸 ───────────────────────────────────────── */

function countAll(dept: DeptTree): number {
  return dept.employees.length + dept.children.reduce((sum, c) => sum + countAll(c), 0)
}

function flattenEmployees(dept: DeptTree): Employee[] {
  return [...dept.employees, ...dept.children.flatMap(flattenEmployees)]
}

/* ─── 메인 컴포넌트 ──────────────────────────────── */

export default function OrganizationPage() {
  const navigate = useNavigate()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [treeSearch, setTreeSearch] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set())
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [empRes, deptRes] = await Promise.all([
      supabase.from('employees')
        .select('id, name, department_id, position, hire_date, role, employee_number, avatar_url')
        .eq('is_active', true)
        .order('name'),
      supabase.from('departments').select('id, name, parent_id').order('name'),
    ])
    const depts = (deptRes.data || []) as Department[]
    setEmployees((empRes.data || []) as Employee[])
    setDepartments(depts)
    // 최상위 부서만 펼침
    const roots = depts.filter(d => !d.parent_id || !depts.find(p => p.id === d.parent_id))
    setExpandedDepts(new Set(roots.map(d => d.id)))
    setLoading(false)
  }

  /* ─── 부서 트리 구성 ─── */
  const deptTree = useMemo(() => {
    const deptMap = new Map<string, DeptTree>()
    departments.forEach(d => deptMap.set(d.id, { ...d, children: [], employees: [] }))
    employees.forEach(emp => {
      if (emp.department_id && deptMap.has(emp.department_id)) {
        deptMap.get(emp.department_id)!.employees.push(emp)
      }
    })
    const roots: DeptTree[] = []
    deptMap.forEach(dept => {
      if (dept.parent_id && deptMap.has(dept.parent_id)) {
        deptMap.get(dept.parent_id)!.children.push(dept)
      } else {
        roots.push(dept)
      }
    })
    return roots
  }, [departments, employees])

  /* ─── 선택된 부서의 사원 목록 ─── */
  const selectedDept = useMemo(() => {
    if (!selectedDeptId) return null
    function findDept(nodes: DeptTree[]): DeptTree | null {
      for (const n of nodes) {
        if (n.id === selectedDeptId) return n
        const found = findDept(n.children)
        if (found) return found
      }
      return null
    }
    return findDept(deptTree)
  }, [selectedDeptId, deptTree])

  const selectedMembers = useMemo(() => {
    if (!selectedDept) return []
    // 리프 부서면 자기 직원만, 아니면 하위 포함
    const members = selectedDept.children.length > 0
      ? flattenEmployees(selectedDept)
      : selectedDept.employees
    // 검색 필터
    if (!memberSearch) return members
    const q = memberSearch.toLowerCase()
    return members.filter(e => e.name.toLowerCase().includes(q) || (e.employee_number || '').toLowerCase().includes(q))
  }, [selectedDept, memberSearch])

  const unassignedEmployees = useMemo(() => {
    return employees.filter(emp => !emp.department_id || !departments.find(d => d.id === emp.department_id))
  }, [employees, departments])

  /* ─── 트리 검색 필터 ─── */
  const treeMatchIds = useMemo(() => {
    if (!treeSearch) return null
    const q = treeSearch.toLowerCase()
    const matched = new Set<string>()
    departments.forEach(d => {
      if (d.name.toLowerCase().includes(q)) {
        matched.add(d.id)
        // 부모 경로도 열기
        let cur = d
        while (cur.parent_id) {
          matched.add(cur.parent_id)
          const parent = departments.find(p => p.id === cur.parent_id)
          if (!parent) break
          cur = parent
        }
      }
    })
    return matched
  }, [treeSearch, departments])

  function toggleDept(deptId: string) {
    setExpandedDepts(prev => {
      const next = new Set(prev)
      if (next.has(deptId)) next.delete(deptId)
      else next.add(deptId)
      return next
    })
  }

  function selectDept(deptId: string) {
    setSelectedDeptId(deptId)
    setMemberSearch('')
  }

  /* ─── 트리 노드 렌더 ─── */
  function renderTreeNode(dept: DeptTree, depth: number = 0) {
    // 검색 중이면 매칭 안 되는 부서 숨기기
    if (treeMatchIds && !treeMatchIds.has(dept.id)) return null

    const isExpanded = expandedDepts.has(dept.id) || (treeMatchIds !== null)
    const isSelected = selectedDeptId === dept.id
    const hasChildren = dept.children.length > 0
    const total = countAll(dept)

    return (
      <div key={dept.id}>
        <button
          onClick={() => {
            if (hasChildren) toggleDept(dept.id)
            selectDept(dept.id)
          }}
          className={`flex items-center gap-1.5 w-full py-2 pr-2 rounded-md text-sm transition-colors ${
            isSelected
              ? 'bg-blue-50 text-blue-700 font-semibold'
              : 'hover:bg-gray-50 text-gray-700'
          }`}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
        >
          {hasChildren ? (
            <span className="text-gray-400 shrink-0">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <span className="truncate">{dept.name}</span>
          <span className="text-gray-400 text-xs ml-auto shrink-0">({total})</span>
        </button>

        {isExpanded && hasChildren && (
          <div>
            {dept.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (loading) return <PageSpinner />

  const totalDepts = departments.length
  const totalEmps = employees.length

  return (
    <div className="space-y-4">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">조직도/사원 관리</h1>
        </div>
        <Button variant="outline" size="sm" className="shrink-0">
          <Download className="h-4 w-4 mr-1" /> 전체 조직도
        </Button>
      </div>

      {/* ── 통계 ── */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">전체 부서</p>
            <p className="text-xl font-bold text-blue-600">{totalDepts}개</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">전체 직원</p>
            <p className="text-xl font-bold text-emerald-600">{totalEmps}명</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">미배정</p>
            <p className="text-xl font-bold text-amber-600">{unassignedEmployees.length}명</p>
          </CardContent>
        </Card>
      </div>

      {/* ── 2분할 메인 영역 ── */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* 좌측 — 조직 트리 */}
        <Card className="md:w-[320px] shrink-0">
          <CardContent className="p-3">
            {/* 조직 검색 */}
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={treeSearch}
                onChange={e => setTreeSearch(e.target.value)}
                placeholder="조직검색"
                className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg w-full focus:outline-none focus:border-blue-400 bg-gray-50"
              />
            </div>

            {/* 트리 */}
            <div className="max-h-[60vh] overflow-y-auto">
              {/* 법인명 (루트) */}
              <div className="mb-1">
                <button
                  onClick={() => {
                    setSelectedDeptId(null)
                    setExpandedDepts(new Set(departments.map(d => d.id)))
                  }}
                  className={`flex items-center gap-1.5 w-full py-2 px-3 rounded-md text-sm font-semibold transition-colors ${
                    !selectedDeptId ? 'bg-gray-100 text-gray-900' : 'hover:bg-gray-50 text-gray-800'
                  }`}
                >
                  <Building2 className="h-4 w-4 text-gray-600 shrink-0" />
                  <span>인터오리진</span>
                  <span className="text-gray-400 text-xs ml-auto">({totalEmps})</span>
                </button>
              </div>

              {deptTree.map(dept => renderTreeNode(dept))}

              {/* 미배정 */}
              {unassignedEmployees.length > 0 && (
                <button
                  onClick={() => setSelectedDeptId('__unassigned__')}
                  className={`flex items-center gap-1.5 w-full py-2 px-3 rounded-md text-sm transition-colors mt-1 ${
                    selectedDeptId === '__unassigned__'
                      ? 'bg-amber-50 text-amber-700 font-semibold'
                      : 'hover:bg-gray-50 text-gray-500'
                  }`}
                >
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span>미배정 직원</span>
                  <span className="text-gray-400 text-xs ml-auto">({unassignedEmployees.length})</span>
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 우측 — 사원 목록 */}
        <Card className="flex-1 min-w-0">
          <CardContent className="p-0">
            {(() => {
              const isUnassigned = selectedDeptId === '__unassigned__'
              const deptName = isUnassigned
                ? '미배정 직원'
                : selectedDept
                  ? selectedDept.name
                  : '인터오리진'
              const members = isUnassigned
                ? (memberSearch
                    ? unassignedEmployees.filter(e => e.name.toLowerCase().includes(memberSearch.toLowerCase()))
                    : unassignedEmployees)
                : selectedDept
                  ? selectedMembers
                  : (memberSearch
                      ? employees.filter(e => e.name.toLowerCase().includes(memberSearch.toLowerCase()))
                      : employees)

              return (
                <>
                  {/* 헤더 */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-gray-900">{deptName}</h2>
                      <span className="text-sm text-gray-500">총 {members.length}명</span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        placeholder="이름 또는 사번"
                        className="pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg w-40 focus:outline-none focus:border-blue-400"
                      />
                      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    </div>
                  </div>

                  {/* 사원 리스트 */}
                  <div className="divide-y divide-gray-50">
                    {members.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <Users className="h-10 w-10 mb-2 opacity-40" />
                        <p className="text-sm">
                          {selectedDeptId ? '소속 직원이 없습니다' : '좌측에서 부서를 선택하세요'}
                        </p>
                      </div>
                    ) : (
                      members
                        .sort((a, b) => {
                          // 리더/임원 우선 정렬
                          const order: Record<string, number> = { ceo: 0, admin: 1, division_head: 2, director: 3, leader: 4, employee: 5 }
                          return (order[a.role] ?? 5) - (order[b.role] ?? 5)
                        })
                        .map(emp => {
                          const badge = ROLE_BADGES[emp.role]
                          const dept = departments.find(d => d.id === emp.department_id)
                          return (
                            <button
                              key={emp.id}
                              onClick={() => navigate(`/admin/employees/${emp.id}/profile`)}
                              className="flex items-center w-full px-5 py-3 hover:bg-blue-50/50 transition-colors text-left group"
                            >
                              {/* 사번 */}
                              <span className="text-xs text-gray-400 w-20 shrink-0 hidden sm:block">
                                {emp.employee_number || '-'}
                              </span>

                              {/* 아바타 */}
                              {(() => {
                                const avatarKey = extractAvatarKey(emp.avatar_url)
                                if (avatarKey) {
                                  return <span className="mr-3 shrink-0">{renderAvatarSvg(avatarKey, 40)}</span>
                                }
                                if (emp.avatar_url && emp.avatar_url.startsWith('http')) {
                                  return (
                                    <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0 overflow-hidden mr-3">
                                      <img
                                        src={emp.avatar_url}
                                        alt={emp.name}
                                        className="w-full h-full object-cover"
                                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                                      />
                                    </div>
                                  )
                                }
                                return <AnimalAvatar name={emp.name} size={40} className="mr-3" />
                              })()}

                              {/* 이름 + 역할 배지 */}
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {badge && (
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.color}`}>
                                    {badge.label}
                                  </span>
                                )}
                                <span className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700">
                                  {emp.name}
                                </span>
                              </div>

                              {/* 부서 (전체 보기일 때) */}
                              {!selectedDeptId && dept && (
                                <span className="text-xs text-gray-400 mr-4 hidden md:block">
                                  {dept.name}
                                </span>
                              )}

                              {/* 직위 */}
                              <span className="text-xs text-gray-500 shrink-0">
                                {emp.position || POSITION_LABEL[emp.role] || '팀원'}
                              </span>
                            </button>
                          )
                        })
                    )}
                  </div>
                </>
              )
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
