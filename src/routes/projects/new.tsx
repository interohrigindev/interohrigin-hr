import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Shield, Building2,
  Plus, Trash2, ChevronUp, ChevronDown, Pencil, Save,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useProjectBoard } from '@/hooks/useProjectBoard'
import { useAuth } from '@/hooks/useAuth'
import type { TemplateStage } from '@/types/project-board'

const FULL_ACCESS_ROLES = ['ceo', 'director', 'division_head', 'admin']
const EXCLUDED_DEPTS = ['대표']

function addDays(from: Date, days: number): string {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function NewProjectPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { templates, employees, departments, getTemplatesForDepartment, createProject, saveTemplate } = useProjectBoard()
  const { profile } = useAuth()

  const [selectedDept, setSelectedDept] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [editableStages, setEditableStages] = useState<TemplateStage[]>([])
  const [category, setCategory] = useState('제품')
  const [projectName, setProjectName] = useState('')
  const [launchDate, setLaunchDate] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [sharedDepts, setSharedDepts] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // 커스텀 템플릿 저장 모달
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  const isFullAccess = profile?.role && FULL_ACCESS_ROLES.includes(profile.role)
  const shareableDepts = departments.filter((d) => !EXCLUDED_DEPTS.includes(d.name))

  const deptTemplates = selectedDept ? getTemplatesForDepartment(selectedDept) : []
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)

  // 직원을 부서별로 그룹화
  const employeesByDept = useMemo(() => {
    const groups: Record<string, typeof employees> = {}
    for (const emp of employees) {
      const dept = departments.find((d) => d.id === emp.department_id)
      const deptName = dept?.name || '부서 미지정'
      if (!groups[deptName]) groups[deptName] = []
      groups[deptName].push(emp)
    }
    return groups
  }, [employees, departments])

  // 템플릿 선택 시 스테이지 초기화 (마감일 기본값 세팅)
  useEffect(() => {
    if (selectedTemplate) {
      const stages = (selectedTemplate.stages as TemplateStage[]).map((s, i, arr) => {
        let daysSoFar = 0
        for (let j = 0; j <= i; j++) daysSoFar += arr[j].default_duration_days
        return {
          ...s,
          order: i + 1,
          deadline: addDays(new Date(), daysSoFar),
        }
      })
      setEditableStages(stages)
    } else {
      setEditableStages([])
    }
  }, [selectedTemplateId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 부서 변경 시 리셋
  useEffect(() => {
    setSelectedTemplateId('')
    setEditableStages([])
  }, [selectedDept])

  // ─── 스테이지 편집 ────────────────────────────────────────
  function handleStageName(index: number, name: string) {
    setEditableStages((prev) => prev.map((s, i) => i === index ? { ...s, name } : s))
  }

  function handleStageDeadline(index: number, deadline: string) {
    setEditableStages((prev) => prev.map((s, i) => i === index ? { ...s, deadline } : s))
  }

  function handleRemoveStage(index: number) {
    setEditableStages((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })))
  }

  function handleAddStage() {
    const lastDeadline = editableStages.length > 0
      ? editableStages[editableStages.length - 1].deadline
      : undefined
    const baseDate = lastDeadline ? new Date(lastDeadline) : new Date()
    setEditableStages((prev) => [
      ...prev,
      { name: '새 단계', order: prev.length + 1, default_duration_days: 7, deadline: addDays(baseDate, 7) },
    ])
  }

  function handleMoveStage(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= editableStages.length) return
    setEditableStages((prev) => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  // ─── 커스텀 템플릿 생성 (빈 템플릿) ─────────────────────
  function handleStartCustom() {
    setSelectedTemplateId('')
    setEditableStages([
      { name: '단계 1', order: 1, default_duration_days: 7, deadline: addDays(new Date(), 7) },
      { name: '단계 2', order: 2, default_duration_days: 7, deadline: addDays(new Date(), 14) },
      { name: '단계 3', order: 3, default_duration_days: 7, deadline: addDays(new Date(), 21) },
    ])
  }

  // ─── 현재 파이프라인을 템플릿으로 저장 ────────────────────
  async function handleSaveTemplate() {
    if (!newTemplateName.trim() || !selectedDept) return
    setSavingTemplate(true)
    const result = await saveTemplate({
      name: newTemplateName.trim(),
      department: selectedDept,
      stages: editableStages,
    })
    setSavingTemplate(false)
    if (result.error) { toast('템플릿 저장 실패: ' + result.error, 'error'); return }
    toast('템플릿이 저장되었습니다', 'success')
    setShowSaveTemplate(false)
    setNewTemplateName('')
  }

  // ─── 생성 ─────────────────────────────────────────────────
  async function handleCreate() {
    if (!selectedDept) { toast('부서를 선택하세요', 'error'); return }
    if (!projectName.trim()) { toast('프로젝트명을 입력하세요', 'error'); return }
    if (editableStages.length === 0) { toast('파이프라인 단계가 필요합니다', 'error'); return }
    if (assigneeIds.length === 0) { toast('담당자를 선택하세요', 'error'); return }

    setSaving(true)
    const finalSharedDepts = isFullAccess
      ? shareableDepts.map((d) => d.name)
      : sharedDepts

    const result = await createProject({
      brand: selectedDept,
      category,
      project_name: projectName,
      launch_date: launchDate || null,
      template_type: selectedTemplate?.template_type || 'custom',
      assignee_ids: assigneeIds,
      shared_departments: finalSharedDepts,
      custom_stages: editableStages,
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

      {/* ─── Step 1: 부서 탭 + 템플릿 선택 ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. 부서 / 템플릿 선택</CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            부서를 선택하고 프로젝트 유형을 선택하세요. 직접 만들기로 커스텀 파이프라인을 구성할 수도 있습니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 부서 탭 */}
          <div className="flex gap-1 border-b border-gray-200">
            {shareableDepts.map((dept) => {
              const tmplCount = getTemplatesForDepartment(dept.name).length
              const isActive = selectedDept === dept.name
              return (
                <button
                  key={dept.id}
                  onClick={() => setSelectedDept(dept.name)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'text-brand-700 border-brand-500'
                      : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  {dept.name}
                  <Badge variant={isActive ? 'primary' : 'default'} className="text-[10px]">{tmplCount}</Badge>
                </button>
              )
            })}
          </div>

          {/* 선택된 부서의 템플릿 + 직접 만들기 */}
          {selectedDept ? (
            <div className="grid grid-cols-3 gap-3">
              {deptTemplates.map((tmpl) => {
                const stages = (tmpl.stages as TemplateStage[])
                const isSelected = selectedTemplateId === tmpl.id
                return (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplateId(tmpl.id)}
                    className={`p-4 rounded-lg border-2 text-left transition-colors ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="text-sm font-bold text-gray-900">{tmpl.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {stages.length}단계 · 약 {tmpl.avg_total_days}일
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {stages.slice(0, 3).map((s, i) => (
                        <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {s.name}
                        </span>
                      ))}
                      {stages.length > 3 && (
                        <span className="text-[10px] text-gray-400">+{stages.length - 3}</span>
                      )}
                    </div>
                  </button>
                )
              })}

              {/* 직접 만들기 카드 */}
              <button
                onClick={handleStartCustom}
                className={`p-4 rounded-lg border-2 border-dashed text-left transition-colors ${
                  editableStages.length > 0 && !selectedTemplateId
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-300 hover:border-brand-300'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Plus className="h-4 w-4 text-brand-500" />
                  <p className="text-sm font-bold text-gray-900">직접 만들기</p>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  빈 파이프라인에서 단계를 직접 구성합니다.
                </p>
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-6 text-center">
              부서를 선택하면 템플릿이 표시됩니다.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ─── Step 2: 파이프라인 편집 (마감일 직접 선택) ─── */}
      {editableStages.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Pencil className="h-4 w-4" />
                  2. 파이프라인 편집
                </CardTitle>
                <p className="text-xs text-gray-500 mt-1">
                  단계를 추가/삭제/순서변경할 수 있습니다. 마감일을 직접 설정하세요.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="info">{editableStages.length}단계</Badge>
                <button
                  onClick={() => setShowSaveTemplate(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-500 hover:border-brand-300 hover:text-brand-600 transition-colors"
                >
                  <Save className="h-3 w-3" /> 템플릿 저장
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* 템플릿 저장 폼 */}
            {showSaveTemplate && (
              <div className="flex items-center gap-2 mb-3 p-2 bg-brand-50 border border-brand-200 rounded-lg">
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="템플릿 이름 입력"
                  className="flex-1 text-sm bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-brand-400"
                />
                <Button size="sm" onClick={handleSaveTemplate} disabled={savingTemplate || !newTemplateName.trim()}>
                  {savingTemplate ? <Loader2 className="h-3 w-3 animate-spin" /> : '저장'}
                </Button>
                <button onClick={() => setShowSaveTemplate(false)} className="text-xs text-gray-400 hover:text-gray-600">취소</button>
              </div>
            )}

            <div className="space-y-2">
              {/* 헤더 */}
              <div className="flex items-center gap-2 px-2 text-[10px] text-gray-400 uppercase tracking-wider">
                <span className="w-6" />
                <span className="flex-1">단계명</span>
                <span className="w-32 text-center">마감일</span>
                <span className="w-14" />
              </div>

              {editableStages.map((stage, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <Badge variant="default" className="shrink-0 w-6 justify-center">{stage.order}</Badge>

                  <input
                    type="text"
                    value={stage.name}
                    onChange={(e) => handleStageName(i, e.target.value)}
                    className="flex-1 text-sm font-medium bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-brand-400"
                  />

                  <input
                    type="date"
                    value={stage.deadline || ''}
                    onChange={(e) => handleStageDeadline(i, e.target.value)}
                    className="w-32 text-sm text-center bg-white border border-gray-200 rounded px-1 py-1 focus:outline-none focus:border-brand-400"
                  />

                  <div className="flex flex-col shrink-0">
                    <button
                      onClick={() => handleMoveStage(i, 'up')}
                      disabled={i === 0}
                      className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleMoveStage(i, 'down')}
                      disabled={i === editableStages.length - 1}
                      className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>

                  <button
                    onClick={() => handleRemoveStage(i)}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={handleAddStage}
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-brand-300 hover:text-brand-600 transition-colors"
            >
              <Plus className="h-4 w-4" /> 단계 추가
            </button>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 3: 프로젝트 정보 ─── */}
      {editableStages.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">3. 프로젝트 정보</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="프로젝트명 *"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="프로젝트명을 입력하세요"
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
              label="출시/마감 목표일"
              type="date"
              value={launchDate}
              onChange={(e) => setLaunchDate(e.target.value)}
            />

            {/* 담당자 — 부서별 그룹 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">담당자 *</label>
              <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-2">
                {Object.entries(employeesByDept).map(([deptName, emps]) => (
                  <div key={deptName}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 bg-gray-50 rounded">
                      {deptName} ({emps.length})
                    </p>
                    <div className="space-y-0.5 mt-1">
                      {emps.map((emp) => (
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
                  </div>
                ))}
              </div>
              {assigneeIds.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">{assigneeIds.length}명 선택</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 4: 부서 공유 ─── */}
      {editableStages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              4. 부서 공유 설정
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isFullAccess && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <Shield className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  임원 및 시스템 관리자는 모든 부서에 전체 권한이 자동 부여됩니다.
                </p>
              </div>
            )}
            <div className="space-y-2">
              {shareableDepts.map((dept) => {
                const checked = isFullAccess || sharedDepts.includes(dept.name)
                const isOwner = dept.name === selectedDept
                return (
                  <label
                    key={dept.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                      checked ? 'border-brand-300 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                    } ${isFullAccess ? 'opacity-80 cursor-default' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!!isFullAccess}
                        onChange={() => {
                          if (isFullAccess) return
                          setSharedDepts((prev) =>
                            prev.includes(dept.name)
                              ? prev.filter((d) => d !== dept.name)
                              : [...prev, dept.name]
                          )
                        }}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-sm font-medium text-gray-800">{dept.name}</span>
                      {isOwner && <Badge variant="default" className="text-[10px]">담당</Badge>}
                    </div>
                    {checked && <Badge variant="success" className="text-[10px]">공유</Badge>}
                  </label>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Actions ─── */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate('/admin/projects')}>취소</Button>
        <Button onClick={handleCreate} disabled={saving || editableStages.length === 0}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          프로젝트 생성
        </Button>
      </div>
    </div>
  )
}
