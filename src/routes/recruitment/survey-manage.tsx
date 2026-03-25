import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, Sparkles, Loader2, FileText, GraduationCap, Briefcase, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature } from '@/lib/ai-client'
import { useAuth } from '@/hooks/useAuth'
import type { PreSurveyTemplate, SurveyQuestion } from '@/types/recruitment'

const EXP_GROUPS = [
  { key: 'entry', label: '신입용 템플릿', Icon: GraduationCap, color: { bar: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' } },
  { key: 'experienced', label: '경력용 템플릿', Icon: Briefcase, color: { bar: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700' } },
  { key: 'any', label: '공통 템플릿', Icon: FileText, color: { bar: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' } },
]

export default function SurveyManage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [templates, setTemplates] = useState<PreSurveyTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['entry', 'experienced', 'any']))

  const [form, setForm] = useState({
    name: '',
    job_type: '',
    experience_type: 'any' as string,
    questions: [] as SurveyQuestion[],
  })

  async function fetchTemplates() {
    setLoading(true)
    const { data } = await supabase
      .from('pre_survey_templates')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setTemplates(data as PreSurveyTemplate[])
    setLoading(false)
  }

  useEffect(() => { fetchTemplates() }, [])

  function openNew() {
    setEditingId(null)
    setForm({ name: '', job_type: '', experience_type: 'any', questions: [] })
    setDialogOpen(true)
  }

  function openEdit(t: PreSurveyTemplate) {
    setEditingId(t.id)
    setForm({
      name: t.name,
      job_type: t.job_type || '',
      experience_type: t.experience_type || 'any',
      questions: t.questions || [],
    })
    setDialogOpen(true)
  }

  async function generateQuestions() {
    setGenerating(true)
    try {
      const config = await getAIConfigForFeature('survey_generation')

      if (!config) {
        toast('AI 설정이 필요합니다.', 'error')
        setGenerating(false)
        return
      }

      const expLabel = form.experience_type === 'entry' ? '신입' : form.experience_type === 'experienced' ? '경력직' : '무관'

      const prompt = `채용 사전 질의서 질문을 7~10개 생성해주세요.

조건:
- 직무: ${form.job_type || '일반'}
- 경력: ${expLabel}
- 10분 이내에 답변 가능한 분량
${form.experience_type === 'experienced' ? '- 경력직이므로 이전 경력, 프로젝트 경험, 전문 역량 중심으로 질문' : ''}
${form.experience_type === 'entry' ? '- 신입이므로 전공, 학업, 동아리/프로젝트 경험, 성장 가능성 중심으로 질문' : ''}
- 마지막에 생년월일, MBTI, 한자이름 수집 질문을 포함하세요

각 질문을 JSON 배열로만 출력하세요:
[
  {"id":"q1","question":"질문 텍스트","type":"text","required":true},
  {"id":"q2","question":"질문 텍스트","type":"choice","options":["옵션1","옵션2"],"required":true}
]

type은 "text", "choice", "scale" 중 하나입니다.`

      const result = await generateAIContent(config, prompt)
      const jsonMatch = result.content.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const questions = JSON.parse(jsonMatch[0]) as SurveyQuestion[]
        setForm((prev) => ({ ...prev, questions }))
        toast('질문이 생성되었습니다.', 'success')
      }
    } catch (err: any) {
      toast('AI 질문 생성 실패: ' + err.message, 'error')
    }
    setGenerating(false)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast('템플릿 이름을 입력하세요.', 'error')
      return
    }

    const payload = {
      name: form.name,
      job_type: form.job_type || null,
      experience_type: form.experience_type,
      questions: form.questions,
      created_by: profile?.id,
    }

    if (editingId) {
      const { error } = await supabase
        .from('pre_survey_templates')
        .update(payload)
        .eq('id', editingId)
      if (error) { toast('수정 실패', 'error'); return }
    } else {
      const { error } = await supabase
        .from('pre_survey_templates')
        .insert(payload)
      if (error) { toast('저장 실패', 'error'); return }
    }

    toast('저장되었습니다.', 'success')
    setDialogOpen(false)
    fetchTemplates()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) return
    await supabase.from('pre_survey_templates').delete().eq('id', id)
    toast('삭제되었습니다.', 'success')
    fetchTemplates()
  }

  function removeQuestion(index: number) {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }))
  }

  function updateQuestion(index: number, field: string, value: string) {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === index ? { ...q, [field]: value } : q
      ),
    }))
  }

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 경력구분별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, PreSurveyTemplate[]>()
    for (const t of templates) {
      const key = t.experience_type || 'any'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return map
  }, [templates])

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">사전 질의서 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">경력 구분별 질의서 템플릿을 관리합니다</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> 새 템플릿
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-400 mb-4">등록된 질의서 템플릿이 없습니다.</p>
            <Button onClick={openNew}>첫 템플릿 만들기</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {EXP_GROUPS.map((group) => {
            const items = grouped.get(group.key) || []
            if (items.length === 0) return null
            const isOpen = expanded.has(group.key)
            const { Icon } = group

            return (
              <Card key={group.key} className="overflow-hidden">
                {/* 그룹 헤더 */}
                <button
                  onClick={() => toggleExpand(group.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 ${group.color.bg} hover:opacity-90 transition-opacity`}
                >
                  <div className={`w-1.5 h-6 rounded-full ${group.color.bar}`} />
                  {isOpen
                    ? <ChevronDown className={`h-4 w-4 ${group.color.text}`} />
                    : <ChevronRight className={`h-4 w-4 ${group.color.text}`} />
                  }
                  <Icon className={`h-4 w-4 ${group.color.text}`} />
                  <span className={`text-sm font-bold ${group.color.text}`}>{group.label}</span>
                  <Badge variant="default" className="text-[10px]">
                    {items.length}개 템플릿
                  </Badge>
                  <span className="ml-auto text-[10px] text-gray-400">
                    {isOpen ? '접기' : '펼치기'}
                  </span>
                </button>

                {/* 템플릿 카드 그리드 */}
                {isOpen && (
                  <CardContent className="py-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {items.map((t) => (
                        <div
                          key={t.id}
                          className="p-4 rounded-lg border border-gray-200 hover:shadow-md transition-all cursor-pointer"
                          onClick={() => openEdit(t)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className={`w-10 h-10 rounded-lg ${group.color.bg} flex items-center justify-center shrink-0`}>
                                <Icon className={`h-5 w-5 ${group.color.text}`} />
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-semibold text-gray-900 text-sm truncate">{t.name}</h4>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {t.job_type && (
                                    <Badge variant="default" className="text-[10px]">{t.job_type}</Badge>
                                  )}
                                  <Badge variant="info" className="text-[10px]">
                                    질문 {t.questions?.length || 0}개
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0 ml-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); openEdit(t) }}
                                className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(t.id) }}
                                className="p-1.5 rounded hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-400 hover:text-red-600" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* 편집 다이얼로그 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingId ? '템플릿 수정' : '새 템플릿'} className="max-w-2xl">
        <div className="space-y-4">
          <Input
            label="템플릿 이름"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="예: 마케팅팀 신입용 질의서"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="직무 유형"
              value={form.job_type}
              onChange={(e) => setForm((p) => ({ ...p, job_type: e.target.value }))}
              placeholder="예: 마케팅, 개발"
            />
            <Select
              label="경력 구분"
              value={form.experience_type}
              onChange={(e) => setForm((p) => ({ ...p, experience_type: e.target.value }))}
              options={[
                { value: 'any', label: '무관' },
                { value: 'entry', label: '신입' },
                { value: 'experienced', label: '경력직' },
              ]}
            />
          </div>

          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-700">질문 목록</h3>
            <Button variant="outline" size="sm" onClick={generateQuestions} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              AI 질문 생성
            </Button>
          </div>

          {form.questions.length === 0 ? (
            <p className="text-sm text-gray-400">AI로 질문을 생성하거나 직접 추가하세요.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {form.questions.map((q, i) => (
                <div key={i} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs font-medium text-brand-600 mt-1">{i + 1}</span>
                  <div className="flex-1">
                    <Input
                      value={q.question}
                      onChange={(e) => updateQuestion(i, 'question', e.target.value)}
                    />
                    <div className="flex gap-2 mt-1">
                      <Badge variant="default">{q.type}</Badge>
                      {q.required && <Badge variant="warning">필수</Badge>}
                    </div>
                  </div>
                  <button onClick={() => removeQuestion(i)} className="text-red-400 hover:text-red-600 mt-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setForm((p) => ({
                ...p,
                questions: [...p.questions, { id: `q${Date.now()}`, question: '', type: 'text', required: false }],
              }))
            }
          >
            <Plus className="h-4 w-4 mr-1" /> 질문 추가
          </Button>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave}>저장</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
