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

// 전체 권한 자동 부여 대상
const FULL_ACCESS_DEPTS = ['임원', '시스템관리자']
const EXCLUDED_DEPTS = ['대표']

// 권한 필드 정의 (4가지만)
const PERMISSION_FIELDS = [
  { key: 'can_create_project', label: '생성', desc: '프로젝트를 새로 만들 수 있음' },
  { key: 'can_delete_project', label: '삭제', desc: '프로젝트를 삭제할 수 있음' },
  { key: 'can_comment', label: '코멘트', desc: '프로젝트에 코멘트를 작성할 수 있음' },
  { key: 'can_view', label: '조회', desc: '프로젝트를 열람할 수 있음' },
] as const

type PermField = typeof PERMISSION_FIELDS[number]['key']

interface DeptRow {
  name: string
  permId: string | null
  isFullAccess: boolean
}

export default function ProjectSettingsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { permissions, departments, loading, refresh } = useProjectBoard()
  const [saving, setSaving] = useState(false)
  const [fieldEdits, setFieldEdits] = useState<Record<string, Record<string, boolean>>>({})

  if (loading) return <PageSpinner />

  // departments 테이블에서 대표 제외한 모든 부서 + 임원/시스템관리자
  const deptRows: DeptRow[] = [
    // 실제 부서 (대표 제외)
    ...departments
      .filter((d) => !EXCLUDED_DEPTS.includes(d.name))
      .map((d) => ({
        name: d.name,
        permId: permissions.find((p) => p.department === d.name)?.id || null,
        isFullAccess: false,
      })),
    // 임원/시스템관리자 (맨 아래)
    ...FULL_ACCESS_DEPTS.map((name) => ({
      name,
      permId: permissions.find((p) => p.department === name)?.id || null,
      isFullAccess: true,
    })),
  ]

  function getFieldValue(dept: string, field: PermField): boolean {
    if (FULL_ACCESS_DEPTS.includes(dept)) return true
    if (fieldEdits[dept]?.[field] !== undefined) return fieldEdits[dept][field]
    const perm = permissions.find((p) => p.department === dept)
    return perm?.[field] ?? false
  }

  function toggleField(dept: string, field: string) {
    if (FULL_ACCESS_DEPTS.includes(dept)) return
    setFieldEdits((prev) => ({
      ...prev,
      [dept]: { ...(prev[dept] || {}), [field]: !getFieldValue(dept, field as PermField) },
    }))
  }

  async function handleSave() {
    setSaving(true)

    for (const row of deptRows) {
      if (row.isFullAccess) continue
      const deptFieldEdits = fieldEdits[row.name]
      if (!deptFieldEdits) continue

      if (row.permId) {
        // 기존 레코드 업데이트
        const updateData: Record<string, unknown> = {}
        for (const [field, value] of Object.entries(deptFieldEdits)) {
          updateData[field] = value
        }
        if (Object.keys(updateData).length > 0) {
          await supabase
            .from('board_permissions')
            .update(updateData)
            .eq('id', row.permId)
        }
      } else {
        // board_permissions에 없는 부서 → 새로 생성
        const newPerm: Record<string, unknown> = {
          department: row.name,
          can_create_project: false,
          can_delete_project: false,
          can_comment: true,
          can_view: true,
        }
        for (const [field, value] of Object.entries(deptFieldEdits)) {
          newPerm[field] = value
        }
        await supabase.from('board_permissions').insert(newPerm)
      }
    }

    setSaving(false)
    toast('권한이 저장되었습니다', 'success')
    setFieldEdits({})
    refresh()
  }

  const hasChanges = Object.keys(fieldEdits).length > 0

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
                전체 프로젝트 생성/삭제/코멘트/조회 권한을 포함하며, 변경할 수 없습니다.
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
            부서별로 프로젝트 생성, 삭제, 코멘트, 조회 권한을 설정합니다.
            공유된 프로젝트에서 해당 부서원이 수행할 수 있는 작업을 결정합니다.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-3 font-medium text-gray-600">부서</th>
                  {PERMISSION_FIELDS.map((f) => (
                    <th key={f.key} className="text-center py-3 px-4 font-medium text-gray-600 text-xs">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deptRows.map((row) => (
                  <tr
                    key={row.name}
                    className={`border-b border-gray-100 ${row.isFullAccess ? 'bg-amber-50/50' : ''}`}
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800">{row.name}</span>
                        {row.isFullAccess && (
                          <Badge variant="warning" className="text-[10px] flex items-center gap-0.5">
                            <Lock className="h-3 w-3" />
                            전체
                          </Badge>
                        )}
                        {!row.isFullAccess && !row.permId && (
                          <Badge variant="default" className="text-[10px]">미설정</Badge>
                        )}
                      </div>
                    </td>
                    {PERMISSION_FIELDS.map((f) => (
                      <td key={f.key} className="py-3 px-4 text-center">
                        {row.isFullAccess ? (
                          <span className="text-amber-600 font-bold text-xs">ALL</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={getFieldValue(row.name, f.key)}
                            onChange={() => toggleField(row.name, f.key)}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              * 임원/시스템관리자 권한은 변경할 수 없습니다. 미설정 부서는 저장 시 자동 생성됩니다.
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
