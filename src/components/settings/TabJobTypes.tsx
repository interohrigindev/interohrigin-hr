import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useJobTypes, useEmployeeJobAssignments } from '@/hooks/useEvaluation'
import type { Employee, JobType } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { Plus, Pencil, Trash2 } from 'lucide-react'

interface Department {
  id: string
  name: string
}

interface JobTypeFormData {
  name: string
  sort_order: number
}

const EMPTY_FORM: JobTypeFormData = { name: '', sort_order: 0 }

export default function TabJobTypes() {
  const { toast } = useToast()
  const { jobTypes, loading: jobTypesLoading, refetch: refetchJobTypes } = useJobTypes()
  const { assignments, loading: assignmentsLoading, refetch: refetchAssignments } = useEmployeeJobAssignments()

  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(true)

  // 다이얼로그 상태
  const [showDialog, setShowDialog] = useState(false)
  const [editingJobType, setEditingJobType] = useState<JobType | null>(null)
  const [form, setForm] = useState<JobTypeFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // 직원 직무 변경 중 상태
  const [assigningEmployeeId, setAssigningEmployeeId] = useState<string | null>(null)

  const fetchEmployeesAndDepartments = useCallback(async () => {
    const [empRes, deptRes] = await Promise.all([
      supabase
        .from('employees')
        .select('id, name, department_id, role, is_active')
        .eq('is_active', true)
        .order('name'),
      supabase.from('departments').select('id, name'),
    ])
    setEmployees((empRes.data as Employee[]) ?? [])
    setDepartments(deptRes.data ?? [])
    setEmployeesLoading(false)
  }, [])

  useEffect(() => {
    fetchEmployeesAndDepartments()
  }, [fetchEmployeesAndDepartments])

  // ─── 직무 유형 CRUD ───────────────────────────────────────────

  function openCreate() {
    setEditingJobType(null)
    const nextOrder = jobTypes.length > 0
      ? Math.max(...jobTypes.map((jt) => jt.sort_order)) + 1
      : 1
    setForm({ name: '', sort_order: nextOrder })
    setShowDialog(true)
  }

  function openEdit(jobType: JobType) {
    setEditingJobType(jobType)
    setForm({ name: jobType.name, sort_order: jobType.sort_order })
    setShowDialog(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast('직무 유형 이름을 입력해주세요', 'error')
      return
    }
    setSaving(true)

    if (editingJobType) {
      const { error } = await supabase
        .from('job_types')
        .update({ name: form.name, sort_order: form.sort_order })
        .eq('id', editingJobType.id)

      if (error) {
        toast('수정 실패: ' + error.message, 'error')
      } else {
        toast('직무 유형이 수정되었습니다')
        setShowDialog(false)
        refetchJobTypes()
      }
    } else {
      const { error } = await supabase.from('job_types').insert({
        name: form.name,
        sort_order: form.sort_order,
      })

      if (error) {
        toast('추가 실패: ' + error.message, 'error')
      } else {
        toast('직무 유형이 추가되었습니다')
        setShowDialog(false)
        refetchJobTypes()
      }
    }
    setSaving(false)
  }

  async function handleDelete(jobType: JobType) {
    if (!confirm(`"${jobType.name}" 직무 유형을 삭제하시겠습니까?\n이 직무에 배정된 직원은 미배정 상태가 됩니다.`)) return

    const { error } = await supabase.from('job_types').delete().eq('id', jobType.id)
    if (error) {
      toast('삭제 실패: ' + error.message, 'error')
    } else {
      toast('직무 유형이 삭제되었습니다')
      refetchJobTypes()
      refetchAssignments()
    }
  }

  // ─── 직원 직무 배정 ───────────────────────────────────────────

  function getEmployeeJobTypeId(employeeId: string): string {
    const assignment = assignments.find((a) => a.employee_id === employeeId)
    return assignment?.job_type_id ?? ''
  }

  function getDepartmentName(departmentId: string | null): string {
    if (!departmentId) return '-'
    const dept = departments.find((d) => d.id === departmentId)
    return dept?.name ?? '-'
  }

  async function handleAssignJobType(employeeId: string, jobTypeId: string) {
    setAssigningEmployeeId(employeeId)

    if (!jobTypeId) {
      // 미배정: 기존 배정 삭제
      const { error } = await supabase
        .from('employee_job_assignments')
        .delete()
        .eq('employee_id', employeeId)

      if (error) {
        toast('배정 해제 실패: ' + error.message, 'error')
      } else {
        toast('직무 배정이 해제되었습니다')
        refetchAssignments()
      }
    } else {
      // upsert: 기존 배정이 있으면 업데이트, 없으면 삽입
      const existing = assignments.find((a) => a.employee_id === employeeId)

      if (existing) {
        const { error } = await supabase
          .from('employee_job_assignments')
          .update({ job_type_id: jobTypeId })
          .eq('employee_id', employeeId)

        if (error) {
          toast('배정 변경 실패: ' + error.message, 'error')
        } else {
          toast('직무가 변경되었습니다')
          refetchAssignments()
        }
      } else {
        const { error } = await supabase
          .from('employee_job_assignments')
          .insert({ employee_id: employeeId, job_type_id: jobTypeId })

        if (error) {
          toast('배정 실패: ' + error.message, 'error')
        } else {
          toast('직무가 배정되었습니다')
          refetchAssignments()
        }
      }
    }

    setAssigningEmployeeId(null)
  }

  // ─── 로딩 ─────────────────────────────────────────────────────

  if (jobTypesLoading || assignmentsLoading || employeesLoading) return <PageSpinner />

  // ─── 렌더링 ───────────────────────────────────────────────────

  const jobTypeOptions = [
    { value: '', label: '미배정' },
    ...jobTypes.map((jt) => ({ value: jt.id, label: jt.name })),
  ]

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">직무 유형을 관리하고, 직원별 직무를 배정합니다.</p>

      {/* ── 직무 유형 관리 ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>직무 유형 관리</CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3 w-3 mr-1" />
            직무 추가
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {jobTypes.length === 0 ? (
            <div className="flex h-20 items-center justify-center text-sm text-gray-400">
              등록된 직무 유형이 없습니다
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {jobTypes.map((jt) => {
                const assignedCount = assignments.filter((a) => a.job_type_id === jt.id).length
                return (
                  <div
                    key={jt.id}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50"
                  >
                    {/* 직무 이름 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{jt.name}</p>
                    </div>

                    {/* 배정 인원 */}
                    <Badge variant="info">{assignedCount}명 배정</Badge>

                    {/* 수정 */}
                    <button
                      onClick={() => openEdit(jt)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    {/* 삭제 */}
                    <button
                      onClick={() => handleDelete(jt)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 직원 직무 배정 ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>직원 직무 배정</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {employees.length === 0 ? (
            <div className="flex h-20 items-center justify-center text-sm text-gray-400">
              활성 직원이 없습니다
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-6 py-3 text-left font-medium text-gray-500">직원명</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">부서</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">직무</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{emp.name}</td>
                      <td className="px-6 py-3 text-gray-600">
                        {getDepartmentName(emp.department_id)}
                      </td>
                      <td className="px-6 py-3">
                        <Select
                          options={jobTypeOptions}
                          value={getEmployeeJobTypeId(emp.id)}
                          onChange={(e) => handleAssignJobType(emp.id, e.target.value)}
                          disabled={assigningEmployeeId === emp.id}
                          className="max-w-[200px]"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 직무 유형 추가/수정 다이얼로그 ────────────────────── */}
      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        title={editingJobType ? '직무 유형 수정' : '직무 유형 추가'}
      >
        <div className="space-y-4">
          <Input
            id="job-type-name"
            label="직무 유형 이름"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="예: BM, 마케팅, 디자인, 개발, 경영지원"
          />
          <Input
            id="job-type-sort-order"
            label="정렬 순서"
            type="number"
            min={0}
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : editingJobType ? '수정' : '추가'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
