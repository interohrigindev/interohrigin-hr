import { useState } from 'react'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useProjectBoard } from '@/hooks/useProjectBoard'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PIPELINE } from '@/types/project-board'

export default function ProjectSettingsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { permissions, loading, refresh } = useProjectBoard()
  const [saving, setSaving] = useState(false)
  const [edits, setEdits] = useState<Record<string, Record<string, boolean>>>({})

  if (loading) return <PageSpinner />

  function isStageEditable(dept: string, stage: string): boolean {
    if (edits[dept]?.[stage] !== undefined) return edits[dept][stage]
    const perm = permissions.find((p) => p.department === dept)
    return perm?.editable_stages?.includes(stage) || false
  }

  function toggleStage(dept: string, stage: string) {
    setEdits((prev) => ({
      ...prev,
      [dept]: { ...(prev[dept] || {}), [stage]: !isStageEditable(dept, stage) },
    }))
  }

  function isChecked(dept: string, field: 'can_create_project' | 'can_delete_project' | 'can_edit_all_stages' | 'can_comment'): boolean {
    const perm = permissions.find((p) => p.department === dept)
    return perm?.[field] ?? false
  }

  async function handleSave() {
    setSaving(true)
    for (const perm of permissions) {
      const deptEdits = edits[perm.department]
      if (!deptEdits) continue

      const newStages = DEFAULT_PIPELINE.filter((stage) => {
        if (deptEdits[stage] !== undefined) return deptEdits[stage]
        return perm.editable_stages?.includes(stage) || false
      })

      await supabase
        .from('board_permissions')
        .update({ editable_stages: newStages })
        .eq('id', perm.id)
    }
    setSaving(false)
    toast('권한이 저장되었습니다', 'success')
    setEdits({})
    refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/projects')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">프로젝트 보드 권한 설정</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">부서별 단계 편집 권한</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-3 font-medium text-gray-600">부서</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-600">생성</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-600">삭제</th>
                  {DEFAULT_PIPELINE.map((stage) => (
                    <th key={stage} className="text-center py-3 px-1 font-medium text-gray-600 text-xs whitespace-nowrap">
                      {stage}
                    </th>
                  ))}
                  <th className="text-center py-3 px-2 font-medium text-gray-600">코멘트</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((perm) => (
                  <tr key={perm.id} className="border-b border-gray-100">
                    <td className="py-3 px-3 font-medium text-gray-800">{perm.department}</td>
                    <td className="py-3 px-2 text-center">
                      {isChecked(perm.department, 'can_create_project') ? '✅' : '❌'}
                    </td>
                    <td className="py-3 px-2 text-center">
                      {isChecked(perm.department, 'can_delete_project') ? '✅' : '❌'}
                    </td>
                    {DEFAULT_PIPELINE.map((stage) => (
                      <td key={stage} className="py-3 px-1 text-center">
                        <input
                          type="checkbox"
                          checked={isStageEditable(perm.department, stage)}
                          onChange={() => toggleStage(perm.department, stage)}
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                    ))}
                    <td className="py-3 px-2 text-center">
                      {isChecked(perm.department, 'can_comment') ? '✅' : '❌'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              저장
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
