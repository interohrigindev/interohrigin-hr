import { useState } from 'react'
import { ArrowLeft, Save, Loader2, Shield, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useProjectBoard } from '@/hooks/useProjectBoard'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PIPELINE } from '@/types/project-board'

// 전체 권한 자동 부여 대상
const FULL_ACCESS_DEPTS = ['임원', '시스템관리자']
// 부서별 권한 편집 가능한 본부
const DEPT_PERMISSION_ORDER = ['경영관리본부', '마케팅영업본부', '브랜드사업본부']

export default function ProjectSettingsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { permissions, loading, refresh } = useProjectBoard()
  const [saving, setSaving] = useState(false)
  const [edits, setEdits] = useState<Record<string, Record<string, boolean>>>({})
  const [fieldEdits, setFieldEdits] = useState<Record<string, Record<string, boolean>>>({})

  if (loading) return <PageSpinner />

  // 부서를 정렬: 본부 먼저, 그 다음 기타 부서, 전체 권한 대상은 맨 아래
  const sortedPermissions = [...permissions].sort((a, b) => {
    const aIsFullAccess = FULL_ACCESS_DEPTS.includes(a.department)
    const bIsFullAccess = FULL_ACCESS_DEPTS.includes(b.department)
    if (aIsFullAccess !== bIsFullAccess) return aIsFullAccess ? 1 : -1
    const aIdx = DEPT_PERMISSION_ORDER.indexOf(a.department)
    const bIdx = DEPT_PERMISSION_ORDER.indexOf(b.department)
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx
    if (aIdx >= 0) return -1
    if (bIdx >= 0) return 1
    return a.department.localeCompare(b.department)
  })

  function isFullAccessDept(dept: string): boolean {
    return FULL_ACCESS_DEPTS.includes(dept)
  }

  function isStageEditable(dept: string, stage: string): boolean {
    if (isFullAccessDept(dept)) return true
    if (edits[dept]?.[stage] !== undefined) return edits[dept][stage]
    const perm = permissions.find((p) => p.department === dept)
    return perm?.editable_stages?.includes(stage) || false
  }

  function toggleStage(dept: string, stage: string) {
    if (isFullAccessDept(dept)) return
    setEdits((prev) => ({
      ...prev,
      [dept]: { ...(prev[dept] || {}), [stage]: !isStageEditable(dept, stage) },
    }))
  }

  function getFieldValue(dept: string, field: 'can_create_project' | 'can_delete_project' | 'can_edit_all_stages' | 'can_comment' | 'can_view'): boolean {
    if (isFullAccessDept(dept)) return true
    if (fieldEdits[dept]?.[field] !== undefined) return fieldEdits[dept][field]
    const perm = permissions.find((p) => p.department === dept)
    return perm?.[field] ?? false
  }

  function toggleField(dept: string, field: string) {
    if (isFullAccessDept(dept)) return
    setFieldEdits((prev) => ({
      ...prev,
      [dept]: { ...(prev[dept] || {}), [field]: !getFieldValue(dept, field as 'can_create_project') },
    }))
  }

  async function handleSave() {
    setSaving(true)
    for (const perm of permissions) {
      if (isFullAccessDept(perm.department)) continue

      const deptStageEdits = edits[perm.department]
      const deptFieldEdits = fieldEdits[perm.department]
      if (!deptStageEdits && !deptFieldEdits) continue

      const updateData: Record<string, unknown> = {}

      if (deptStageEdits) {
        updateData.editable_stages = DEFAULT_PIPELINE.filter((stage) => {
          if (deptStageEdits[stage] !== undefined) return deptStageEdits[stage]
          return perm.editable_stages?.includes(stage) || false
        })
      }

      if (deptFieldEdits) {
        for (const [field, value] of Object.entries(deptFieldEdits)) {
          updateData[field] = value
        }
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('board_permissions')
          .update(updateData)
          .eq('id', perm.id)
      }
    }
    setSaving(false)
    toast('권한이 저장되었습니다', 'success')
    setEdits({})
    setFieldEdits({})
    refresh()
  }

  const hasChanges = Object.keys(edits).length > 0 || Object.keys(fieldEdits).length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/projects')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">프로젝트 보드 권한 설정</h1>
      </div>

      {/* 임원/관리자 전체 권한 안내 */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <Shield className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                임원 및 시스템 관리자는 모든 권한이 자동 부여됩니다.
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                전체 프로젝트 생성/삭제/편집/코멘트 권한을 포함하며, 변경할 수 없습니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 부서별 권한 매트릭스 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">부서별 권한 매트릭스</CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            부서별로 프로젝트 생성, 삭제, 단계 편집, 코멘트 권한을 설정합니다.
            공유된 프로젝트에서 해당 부서원이 수행할 수 있는 작업을 결정합니다.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-3 font-medium text-gray-600">부서</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-600 text-xs">생성</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-600 text-xs">삭제</th>
                  {DEFAULT_PIPELINE.map((stage) => (
                    <th key={stage} className="text-center py-3 px-1 font-medium text-gray-600 text-xs whitespace-nowrap">
                      {stage}
                    </th>
                  ))}
                  <th className="text-center py-3 px-2 font-medium text-gray-600 text-xs">코멘트</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-600 text-xs">조회</th>
                </tr>
              </thead>
              <tbody>
                {sortedPermissions.map((perm) => {
                  const fullAccess = isFullAccessDept(perm.department)
                  return (
                    <tr
                      key={perm.id}
                      className={`border-b border-gray-100 ${fullAccess ? 'bg-amber-50/50' : ''}`}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{perm.department}</span>
                          {fullAccess && (
                            <Badge variant="warning" className="text-[10px] flex items-center gap-0.5">
                              <Lock className="h-3 w-3" />
                              전체
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        {fullAccess ? (
                          <span className="text-amber-600 font-bold text-xs">ALL</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={getFieldValue(perm.department, 'can_create_project')}
                            onChange={() => toggleField(perm.department, 'can_create_project')}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {fullAccess ? (
                          <span className="text-amber-600 font-bold text-xs">ALL</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={getFieldValue(perm.department, 'can_delete_project')}
                            onChange={() => toggleField(perm.department, 'can_delete_project')}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                        )}
                      </td>
                      {DEFAULT_PIPELINE.map((stage) => (
                        <td key={stage} className="py-3 px-1 text-center">
                          {fullAccess ? (
                            <span className="text-amber-600 font-bold text-xs">ALL</span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={isStageEditable(perm.department, stage)}
                              onChange={() => toggleStage(perm.department, stage)}
                              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                            />
                          )}
                        </td>
                      ))}
                      <td className="py-3 px-2 text-center">
                        {fullAccess ? (
                          <span className="text-amber-600 font-bold text-xs">ALL</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={getFieldValue(perm.department, 'can_comment')}
                            onChange={() => toggleField(perm.department, 'can_comment')}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {fullAccess ? (
                          <span className="text-amber-600 font-bold text-xs">ALL</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={getFieldValue(perm.department, 'can_view')}
                            onChange={() => toggleField(perm.department, 'can_view')}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              * 임원/시스템관리자 권한은 변경할 수 없습니다.
            </p>
            <Button onClick={handleSave} disabled={saving || !hasChanges}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              저장
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
