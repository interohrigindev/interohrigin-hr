import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { useJobPostingMutations } from '@/hooks/useRecruitment'
import { supabase } from '@/lib/supabase'
import { generateAIContent, type AIConfig } from '@/lib/ai-client'
import { EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LEVEL_LABELS } from '@/lib/recruitment-constants'
import type { Department } from '@/types/database'
import { useEffect } from 'react'

export default function RecruitmentJobNew() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast } = useToast()
  const { createPosting } = useJobPostingMutations()

  const [departments, setDepartments] = useState<Department[]>([])
  const [saving, setSaving] = useState(false)
  const [generatingAI, setGeneratingAI] = useState(false)

  const [form, setForm] = useState({
    title: '',
    department_id: '',
    position: '',
    employment_type: 'full_time',
    experience_level: 'any',
    description: '',
    requirements: '',
    preferred: '',
    salary_range: '',
    deadline: '',
  })
  const [aiQuestions, setAiQuestions] = useState<string[]>([])

  useEffect(() => {
    supabase.from('departments').select('*').then(({ data }) => {
      if (data) setDepartments(data)
    })
  }, [])

  function updateForm(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function generateAIQuestions() {
    setGeneratingAI(true)
    try {
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .single()

      if (!aiSettings) {
        toast('AI 설정이 필요합니다. 설정 > AI 탭에서 API 키를 등록하세요.', 'error')
        setGeneratingAI(false)
        return
      }

      const config: AIConfig = {
        provider: aiSettings.provider,
        apiKey: aiSettings.api_key,
        model: aiSettings.model,
      }

      const prompt = `채용 면접 질문을 5개 생성해주세요.

채용공고 정보:
- 제목: ${form.title}
- 포지션: ${form.position || '미정'}
- 경력: ${EXPERIENCE_LEVEL_LABELS[form.experience_level]}
- 고용형태: ${EMPLOYMENT_TYPE_LABELS[form.employment_type]}
- 직무 설명: ${form.description || '없음'}
- 요구사항: ${form.requirements || '없음'}

각 질문은 번호 없이 한 줄씩 출력해주세요. 직무 역량, 문제 해결 능력, 팀워크, 성장 가능성, 조직 적합성을 평가할 수 있는 질문으로 생성하세요.`

      const result = await generateAIContent(config, prompt)
      const questions = result.content
        .split('\n')
        .map((q) => q.replace(/^\d+[\.\)]\s*/, '').replace(/^[-*]\s*/, '').trim())
        .filter((q) => q.length > 5)
        .slice(0, 5)

      setAiQuestions(questions)
      toast('AI 면접 질문이 생성되었습니다.', 'success')
    } catch (err: any) {
      toast('AI 질문 생성 실패: ' + err.message, 'error')
    }
    setGeneratingAI(false)
  }

  async function handleSubmit(status: 'draft' | 'open') {
    if (!form.title.trim()) {
      toast('공고 제목을 입력하세요.', 'error')
      return
    }

    setSaving(true)
    const { error } = await createPosting({
      ...form,
      department_id: form.department_id || null,
      deadline: form.deadline || null,
      ai_questions: aiQuestions as any,
      status,
      created_by: profile?.id,
      employment_type: form.employment_type as any,
      experience_level: form.experience_level as any,
    })

    if (error) {
      toast('저장 실패: ' + error.message, 'error')
    } else {
      toast(status === 'open' ? '채용공고가 게시되었습니다.' : '임시저장되었습니다.', 'success')
      navigate('/admin/recruitment/jobs')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">새 채용공고</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="공고 제목 *"
            value={form.title}
            onChange={(e) => updateForm('title', e.target.value)}
            placeholder="예: 마케팅팀 주니어 디자이너 채용"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="부서"
              value={form.department_id}
              onChange={(e) => updateForm('department_id', e.target.value)}
              options={[
                { value: '', label: '선택 안 함' },
                ...departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
            <Input
              label="포지션"
              value={form.position}
              onChange={(e) => updateForm('position', e.target.value)}
              placeholder="예: 디자이너, 개발자"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="고용 형태"
              value={form.employment_type}
              onChange={(e) => updateForm('employment_type', e.target.value)}
              options={Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
            <Select
              label="경력 수준"
              value={form.experience_level}
              onChange={(e) => updateForm('experience_level', e.target.value)}
              options={Object.entries(EXPERIENCE_LEVEL_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
            <Input
              label="연봉 범위"
              value={form.salary_range}
              onChange={(e) => updateForm('salary_range', e.target.value)}
              placeholder="예: 3,000~4,000만원"
            />
          </div>

          <Input
            label="마감일"
            type="date"
            value={form.deadline}
            onChange={(e) => updateForm('deadline', e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>상세 내용</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            label="직무 설명"
            value={form.description}
            onChange={(e) => updateForm('description', e.target.value)}
            placeholder="담당 업무, 역할 등을 작성하세요"
            rows={4}
          />
          <Textarea
            label="자격 요건"
            value={form.requirements}
            onChange={(e) => updateForm('requirements', e.target.value)}
            placeholder="필수 자격 요건을 작성하세요"
            rows={3}
          />
          <Textarea
            label="우대 사항"
            value={form.preferred}
            onChange={(e) => updateForm('preferred', e.target.value)}
            placeholder="우대 사항을 작성하세요"
            rows={3}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>AI 면접 질문</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={generateAIQuestions}
              disabled={generatingAI || !form.title.trim()}
            >
              {generatingAI ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1" />
              )}
              AI 질문 생성
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {aiQuestions.length === 0 ? (
            <p className="text-gray-400 text-sm">
              공고 정보를 입력하고 "AI 질문 생성"을 누르면 면접 질문이 자동으로 생성됩니다.
            </p>
          ) : (
            <div className="space-y-3">
              {aiQuestions.map((q, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="text-sm font-medium text-brand-600 mt-0.5">{i + 1}.</span>
                  <Input
                    value={q}
                    onChange={(e) => {
                      const updated = [...aiQuestions]
                      updated[i] = e.target.value
                      setAiQuestions(updated)
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 유입경로별 링크 안내 */}
      <Card>
        <CardHeader>
          <CardTitle>유입경로별 지원 링크</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-2">
            공고 저장 후 공고 상세에서 유입경로별 지원 링크를 복사할 수 있습니다.
          </p>
          <div className="text-xs text-gray-400 space-y-1">
            <p>일반: /apply/&#123;id&#125;</p>
            <p>헤드헌터: /apply/&#123;id&#125;?source=headhunter&ref=업체명</p>
            <p>대학: /apply/&#123;id&#125;?source=university&ref=대학명</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={saving}>
          임시저장
        </Button>
        <Button onClick={() => handleSubmit('open')} disabled={saving}>
          {saving ? '저장 중...' : '게시하기'}
        </Button>
      </div>
    </div>
  )
}
