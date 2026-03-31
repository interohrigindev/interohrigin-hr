import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import {
  Shield,
  Users,
  Search,
  Check,
  ChevronDown,
  ChevronRight,
  Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────

interface EmployeeRow {
  id: string
  name: string
  department_id: string | null
  position: string | null
  role: string
}

interface DepartmentRow {
  id: string
  name: string
}

interface MenuItem {
  label: string
  path: string
}

interface MenuGroup {
  label: string
  items: MenuItem[]
}

// ─── Menu Structure ─────────────────────────────────────────────

const STANDALONE_ITEMS: MenuItem[] = [
  { label: '자기평가', path: '/self-evaluation' },
  { label: '평가하기', path: '/evaluate' },
  { label: '내 결과', path: '/report' },
  { label: '메신저', path: '/messenger' },
]

const MENU_GROUPS: MenuGroup[] = [
  {
    label: '긴급 업무',
    items: [
      { label: 'CEO 긴급 대시보드', path: '/admin/urgent' },
      { label: '간편 인사평가', path: '/admin/urgent/quick-eval' },
      { label: '감점 현황', path: '/admin/urgent/penalties' },
      { label: '데이터 마이그레이션', path: '/admin/migrate' },
    ],
  },
  {
    label: '채용관리',
    items: [
      { label: '채용 대시보드', path: '/admin/recruitment' },
      { label: '채용공고', path: '/admin/recruitment/postings' },
      { label: '사전 질의서', path: '/admin/recruitment/survey' },
      { label: '인재상 설정', path: '/admin/recruitment/talent' },
      { label: '면접 일정', path: '/admin/recruitment/interviews' },
      { label: 'AI 신뢰도', path: '/admin/recruitment/ai-trust' },
    ],
  },
  {
    label: '직원관리',
    items: [
      { label: '통합 프로필 검색', path: '/admin/employees' },
      { label: '사주/MBTI 분석', path: '/admin/employees/analysis' },
      { label: '특이사항 관리', path: '/admin/employees/notes' },
      { label: '퇴사 관리', path: '/admin/employees/exit' },
    ],
  },
  {
    label: 'OJT/수습',
    items: [
      { label: 'OJT 프로그램', path: '/admin/ojt' },
      { label: '멘토-멘티', path: '/admin/ojt/mentor' },
      { label: '수습 평가', path: '/admin/probation' },
    ],
  },
  {
    label: '프로젝트 & 업무',
    items: [
      { label: '통합 대시보드', path: '/admin/dashboard' },
      { label: '프로젝트 보드', path: '/admin/projects' },
      { label: '새 프로젝트', path: '/admin/projects/new' },
      { label: '작업 관리', path: '/admin/work' },
      { label: '일일 보고서', path: '/admin/work/daily' },
      { label: '권한 설정', path: '/admin/projects/permissions' },
    ],
  },
  {
    label: '인사노무',
    items: [
      { label: '연차 관리', path: '/admin/leave' },
      { label: '근태 관리', path: '/admin/attendance' },
      { label: '전자 결재', path: '/admin/approval' },
      { label: '증명서 발급', path: '/admin/certificates' },
      { label: '조직도', path: '/admin/organization' },
      { label: '급여 관리', path: '/admin/payroll' },
      { label: '교육 관리', path: '/admin/training' },
    ],
  },
  {
    label: '인사평가',
    items: [
      { label: '월간 업무 점검', path: '/admin/monthly-checkin' },
      { label: '동료 평가', path: '/admin/peer-review' },
      { label: '평가 대시보드', path: '/admin/evaluation' },
      { label: '평가 설정', path: '/admin/settings/evaluation' },
      { label: 'AI 평가 리포트', path: '/admin/evaluation/ai-report' },
      { label: 'AI 검증', path: '/admin/evaluation/ai-verify' },
      { label: '데이터 동기화', path: '/admin/evaluation/sync' },
    ],
  },
]

/** Collect every possible menu path */
const ALL_PATHS = [
  ...STANDALONE_ITEMS.map((i) => i.path),
  ...MENU_GROUPS.flatMap((g) => g.items.map((i) => i.path)),
]

// ─── Role Presets ───────────────────────────────────────────────

const ROLE_PRESETS: { label: string; paths: string[] }[] = [
  { label: '임원 전체 메뉴', paths: [...ALL_PATHS] },
  {
    label: '직원 기본 메뉴',
    paths: [
      '/self-evaluation',
      '/evaluate',
      '/report',
      '/messenger',
      '/admin/projects',
      '/admin/work',
      '/admin/work/daily',
    ],
  },
  {
    label: '경영지원 메뉴',
    paths: [
      '/self-evaluation',
      '/evaluate',
      '/report',
      '/messenger',
      '/admin/leave',
      '/admin/attendance',
      '/admin/approval',
      '/admin/certificates',
      '/admin/organization',
      '/admin/payroll',
      '/admin/training',
      '/admin/employees',
      '/admin/dashboard',
      '/admin/projects',
      '/admin/work',
      '/admin/work/daily',
    ],
  },
]

// ─── Component ──────────────────────────────────────────────────

export default function MenuPermissions() {
  const { user } = useAuth()
  const { toast } = useToast()

  // Data
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [loading, setLoading] = useState(true)

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [permLoading, setPermLoading] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')

  // UI
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(MENU_GROUPS.map((g) => g.label)),
  )
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkTargets, setBulkTargets] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  // ─── Fetch employees & departments ────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [empRes, deptRes] = await Promise.all([
        supabase
          .from('employees')
          .select('id, name, department_id, position, role')
          .eq('is_active', true)
          .order('name'),
        supabase.from('departments').select('id, name').order('name'),
      ])
      if (empRes.data) setEmployees(empRes.data as EmployeeRow[])
      if (deptRes.data) setDepartments(deptRes.data as DepartmentRow[])
      setLoading(false)
    }
    load()
  }, [])

  // ─── Fetch permissions when employee changes ─────────────────

  useEffect(() => {
    if (!selectedId) {
      setCheckedPaths(new Set())
      return
    }
    async function fetchPerm() {
      setPermLoading(true)
      const { data } = await supabase
        .from('menu_permissions')
        .select('allowed_menus')
        .eq('employee_id', selectedId)
        .maybeSingle()
      if (data?.allowed_menus) {
        setCheckedPaths(new Set(data.allowed_menus as string[]))
      } else {
        setCheckedPaths(new Set())
      }
      setPermLoading(false)
    }
    fetchPerm()
  }, [selectedId])

  // ─── Filtered employees ──────────────────────────────────────

  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (deptFilter && e.department_id !== deptFilter) return false
      if (search && !e.name.includes(search)) return false
      return true
    })
  }, [employees, search, deptFilter])

  const deptMap = useMemo(() => {
    const m: Record<string, string> = {}
    departments.forEach((d) => {
      m[d.id] = d.name
    })
    return m
  }, [departments])

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? null,
    [employees, selectedId],
  )

  // ─── Checkbox helpers ────────────────────────────────────────

  const togglePath = useCallback((path: string) => {
    setCheckedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const toggleGroup = useCallback((group: MenuGroup) => {
    setCheckedPaths((prev) => {
      const groupPaths = group.items.map((i) => i.path)
      const allChecked = groupPaths.every((p) => prev.has(p))
      const next = new Set(prev)
      if (allChecked) {
        groupPaths.forEach((p) => next.delete(p))
      } else {
        groupPaths.forEach((p) => next.add(p))
      }
      return next
    })
  }, [])

  const getGroupState = useCallback(
    (group: MenuGroup): 'all' | 'some' | 'none' => {
      const paths = group.items.map((i) => i.path)
      const checked = paths.filter((p) => checkedPaths.has(p)).length
      if (checked === 0) return 'none'
      if (checked === paths.length) return 'all'
      return 'some'
    },
    [checkedPaths],
  )

  const toggleExpand = useCallback((label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  // ─── Preset apply ────────────────────────────────────────────

  const applyPreset = useCallback((paths: string[]) => {
    setCheckedPaths(new Set(paths))
  }, [])

  // ─── Save ────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!selectedId) return
    setSaving(true)
    // delete + insert 패턴 (UNIQUE 제약조건 없이도 동작)
    await supabase.from('menu_permissions').delete().eq('employee_id', selectedId)
    const { error } = await supabase.from('menu_permissions').insert({
      employee_id: selectedId,
      allowed_menus: Array.from(checkedPaths),
    })
    setSaving(false)
    if (error) {
      toast('권한 저장에 실패했습니다: ' + error.message, 'error')
    } else {
      toast('메뉴 권한이 저장되었습니다')
    }
  }, [selectedId, checkedPaths, toast])

  // ─── Bulk apply ──────────────────────────────────────────────

  const handleBulkApply = useCallback(async () => {
    if (bulkTargets.size === 0) return
    setBulkSaving(true)
    const menus = Array.from(checkedPaths)
    const empIds = Array.from(bulkTargets)
    // 기존 데이터 삭제 후 일괄 insert
    await supabase.from('menu_permissions').delete().in('employee_id', empIds)
    const rows = empIds.map((empId) => ({
      employee_id: empId,
      allowed_menus: menus,
    }))
    const { error } = await supabase.from('menu_permissions').insert(rows)
    setBulkSaving(false)
    if (error) {
      toast('일괄 적용에 실패했습니다: ' + error.message, 'error')
    } else {
      toast(`${bulkTargets.size}명에게 권한이 적용되었습니다`)
      setBulkOpen(false)
      setBulkTargets(new Set())
    }
  }, [bulkTargets, checkedPaths, toast])

  const toggleBulkTarget = useCallback((empId: string) => {
    setBulkTargets((prev) => {
      const next = new Set(prev)
      if (next.has(empId)) next.delete(empId)
      else next.add(empId)
      return next
    })
  }, [])

  const toggleBulkAll = useCallback(() => {
    setBulkTargets((prev) => {
      const available = employees.filter((e) => e.id !== selectedId)
      if (prev.size === available.length) return new Set()
      return new Set(available.map((e) => e.id))
    })
  }, [employees, selectedId])

  // ─── Render ──────────────────────────────────────────────────

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-brand-600" />
            메뉴 권한 관리
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            직원별로 접근 가능한 메뉴를 설정합니다
          </p>
        </div>
        {selectedId && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkOpen(true)}
            >
              <Users className="h-4 w-4" />
              일괄 적용
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        )}
      </div>

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Panel — Employee List */}
        <div className="w-full lg:w-72 shrink-0 space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">직원 목록</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="이름 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                options={departments.map((d) => ({
                  value: d.id,
                  label: d.name,
                }))}
                placeholder="전체 부서"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              />
            </CardContent>
          </Card>

          <div className="max-h-[calc(100vh-380px)] overflow-y-auto space-y-1.5 pr-1">
            {filteredEmployees.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                검색 결과가 없습니다
              </p>
            )}
            {filteredEmployees.map((emp) => {
              const isSelected = emp.id === selectedId
              return (
                <button
                  key={emp.id}
                  onClick={() => setSelectedId(emp.id)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    isSelected
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                      isSelected
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-200 text-gray-600',
                    )}
                  >
                    {emp.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {emp.name}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {emp.position ?? '직급 미지정'}
                      {emp.department_id && deptMap[emp.department_id]
                        ? ` · ${deptMap[emp.department_id]}`
                        : ''}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right Panel — Menu Tree */}
        <div className="flex-1 min-w-0">
          {!selectedId ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Shield className="h-12 w-12 mb-3" />
                <p className="text-sm">왼쪽에서 직원을 선택하세요</p>
              </CardContent>
            </Card>
          ) : permLoading ? (
            <PageSpinner />
          ) : (
            <div className="space-y-4">
              {/* Selected employee info */}
              <Card>
                <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white font-semibold">
                      {selectedEmployee?.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {selectedEmployee?.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {selectedEmployee?.position ?? '직급 미지정'}
                        {selectedEmployee?.department_id &&
                        deptMap[selectedEmployee.department_id]
                          ? ` · ${deptMap[selectedEmployee.department_id]}`
                          : ''}
                      </p>
                    </div>
                    <Badge variant="primary">{checkedPaths.size}개 메뉴</Badge>
                  </div>
                  {/* Presets */}
                  <div className="flex flex-wrap gap-2">
                    {ROLE_PRESETS.map((preset) => (
                      <Button
                        key={preset.label}
                        variant="ghost"
                        size="sm"
                        onClick={() => applyPreset(preset.paths)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Standalone Items */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">개별 메뉴</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {STANDALONE_ITEMS.map((item) => (
                    <CheckboxItem
                      key={item.path}
                      label={item.label}
                      checked={checkedPaths.has(item.path)}
                      onChange={() => togglePath(item.path)}
                    />
                  ))}
                </CardContent>
              </Card>

              {/* Grouped Menus */}
              {MENU_GROUPS.map((group) => {
                const expanded = expandedGroups.has(group.label)
                const state = getGroupState(group)
                return (
                  <Card key={group.label}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(group.label)}
                      className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-gray-50 transition-colors rounded-t-xl"
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                      )}
                      <GroupCheckbox
                        state={state}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleGroup(group)
                        }}
                      />
                      <span className="font-semibold text-gray-900 text-[15px]">
                        {group.label}
                      </span>
                      <Badge
                        variant={state === 'all' ? 'primary' : 'default'}
                        className="ml-auto"
                      >
                        {group.items.filter((i) => checkedPaths.has(i.path)).length}/
                        {group.items.length}
                      </Badge>
                    </button>
                    {expanded && (
                      <CardContent className="pt-0 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {group.items.map((item) => (
                          <CheckboxItem
                            key={item.path}
                            label={item.label}
                            checked={checkedPaths.has(item.path)}
                            onChange={() => togglePath(item.path)}
                          />
                        ))}
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bulk Apply Dialog */}
      <Dialog
        open={bulkOpen}
        onClose={() => {
          setBulkOpen(false)
          setBulkTargets(new Set())
        }}
        title="권한 일괄 적용"
        className="max-w-md"
      >
        <p className="text-sm text-gray-600 mb-4">
          현재 <strong>{selectedEmployee?.name}</strong>의 메뉴 권한을 아래
          직원에게 동일하게 적용합니다.
        </p>

        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={toggleBulkAll}
            className="text-sm text-brand-600 hover:underline"
          >
            {bulkTargets.size === employees.filter((e) => e.id !== selectedId).length
              ? '전체 해제'
              : '전체 선택'}
          </button>
          <span className="text-xs text-gray-500">
            {bulkTargets.size}명 선택
          </span>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-2">
          {employees
            .filter((e) => e.id !== selectedId)
            .map((emp) => (
              <label
                key={emp.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={bulkTargets.has(emp.id)}
                  onChange={() => toggleBulkTarget(emp.id)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-900">{emp.name}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {emp.position ?? ''}
                  {emp.department_id && deptMap[emp.department_id]
                    ? ` · ${deptMap[emp.department_id]}`
                    : ''}
                </span>
              </label>
            ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setBulkOpen(false)
              setBulkTargets(new Set())
            }}
          >
            취소
          </Button>
          <Button
            size="sm"
            disabled={bulkTargets.size === 0 || bulkSaving}
            onClick={handleBulkApply}
          >
            {bulkSaving ? '적용 중...' : `${bulkTargets.size}명에게 적용`}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────

function CheckboxItem({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={onChange}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            onChange()
          }
        }}
        className={cn(
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-2 transition-colors',
          checked
            ? 'border-brand-600 bg-brand-600 text-white'
            : 'border-gray-300 bg-white',
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="text-sm text-gray-700 select-none">{label}</span>
    </label>
  )
}

function GroupCheckbox({
  state,
  onClick,
}: {
  state: 'all' | 'some' | 'none'
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <span
      role="checkbox"
      aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          onClick(e as unknown as React.MouseEvent)
        }
      }}
      className={cn(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-2 transition-colors cursor-pointer',
        state === 'all'
          ? 'border-brand-600 bg-brand-600 text-white'
          : state === 'some'
            ? 'border-brand-600 bg-brand-100'
            : 'border-gray-300 bg-white',
      )}
    >
      {state === 'all' && <Check className="h-3 w-3" />}
      {state === 'some' && (
        <span className="block h-0.5 w-2.5 rounded bg-brand-600" />
      )}
    </span>
  )
}
