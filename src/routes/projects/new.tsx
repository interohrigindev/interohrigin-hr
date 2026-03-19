import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useProjectBoard } from '@/hooks/useProjectBoard'
import type { TemplateStage } from '@/types/project-board'

export default function NewProjectPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { templates, employees, departments, createProject } = useProjectBoard()

  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('제품')
  const [projectName, setProjectName] = useState('')
  const [launchDate, setLaunchDate] = useState('')
  const [templateType, setTemplateType] = useState('new_product')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const selectedTemplate = templates.find((t) => t.template_type === templateType)
  const templateStages = (selectedTemplate?.stages || []) as TemplateStage[]

  // Calculate estimated dates based on launch date
  const estimatedStages = templateStages.map((s, i) => {
    const start = new Date()
    let daysBefore = 0
    for (let j = 0; j <= i; j++) daysBefore += templateStages[j].default_duration_days
    const deadline = new Date(start)
    deadline.setDate(deadline.getDate() + daysBefore)
    return { ...s, estimatedDeadline: deadline.toISOString().split('T')[0] }
  })

  async function handleCreate() {
    if (!projectName.trim()) { toast('프로젝트명을 입력하세요', 'error'); return }
    if (assigneeIds.length === 0) { toast('담당자를 선택하세요', 'error'); return }

    setSaving(true)
    const result = await createProject({
      brand,
      category,
      project_name: projectName,
      launch_date: launchDate || null,
      template_type: templateType,
      assignee_ids: assigneeIds,
    })
    setSaving(false)

    if (result.error) { toast('생성 실패: ' + result.error, 'error'); return }
    toast('프로젝트가 생성되었습니다', 'success')
    navigate(`/admin/projects/${result.id}`)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/projects')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">새 프로젝트</h1>
      </div>

      {/* Template selection */}
      <Card>
        <CardHeader><CardTitle className="text-base">템플릿 선택</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {templates.map((tmpl) => (
              <button
                key={tmpl.id}
                onClick={() => setTemplateType(tmpl.template_type)}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  templateType === tmpl.template_type
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-bold text-gray-900">{tmpl.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {(tmpl.stages as TemplateStage[]).length}단계 · 약 {tmpl.avg_total_days}일
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Basic info */}
      <Card>
        <CardHeader><CardTitle className="text-base">프로젝트 정보</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="브랜드/부서"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              options={[
                { value: '', label: '선택' },
                ...departments.map((d) => ({ value: d.name, label: d.name })),
              ]}
              placeholder="부서 선택"
            />
            <Select
              label="구분"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={[
                { value: '제품', label: '제품' },
                { value: '마케팅', label: '마케팅' },
                { value: '이벤트', label: '이벤트' },
                { value: '디자인', label: '디자인' },
                { value: '영업', label: '영업' },
                { value: '경영지원', label: '경영지원' },
                { value: '기타', label: '기타' },
              ]}
            />
          </div>

          <Input
            label="프로젝트명 *"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="예: (신규) 프로페셔널 플랫 헤어 스트레이트"
          />

          <Input
            label="출시/마감 목표일"
            type="date"
            value={launchDate}
            onChange={(e) => setLaunchDate(e.target.value)}
          />

          {/* Assignees */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">담당자 *</label>
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
              {employees.map((emp) => (
                <label key={emp.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assigneeIds.includes(emp.id)}
                    onChange={(e) => {
                      if (e.target.checked) setAssigneeIds((prev) => [...prev, emp.id])
                      else setAssigneeIds((prev) => prev.filter((id) => id !== emp.id))
                    }}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700">{emp.name}</span>
                </label>
              ))}
            </div>
            {assigneeIds.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">{assigneeIds.length}명 선택</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stage preview */}
      {estimatedStages.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">파이프라인 미리보기</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {estimatedStages.map((stage, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{stage.order}</Badge>
                    <span className="text-sm font-medium text-gray-800">{stage.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{stage.default_duration_days}일</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      ~{stage.estimatedDeadline}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              * 마감일은 오늘 기준 예상치이며, 생성 후 개별 조정 가능합니다.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate('/admin/projects')}>취소</Button>
        <Button onClick={handleCreate} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          프로젝트 생성
        </Button>
      </div>
    </div>
  )
}
