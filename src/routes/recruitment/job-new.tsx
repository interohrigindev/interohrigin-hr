import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Sparkles, Loader2, Copy, ClipboardList } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { useJobPostingMutations } from '@/hooks/useRecruitment'
import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature } from '@/lib/ai-client'
import { EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LEVEL_LABELS } from '@/lib/recruitment-constants'
import type { Department } from '@/types/database'
import type { JobPosting } from '@/types/recruitment'

const INITIAL_FORM = {
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
  location: '',
  work_hours: '',
  headcount: '1',
  benefits: '',
  hiring_process: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  company_intro: '',
  team_intro: '',
}

export default function RecruitmentJobNew() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const cloneId = searchParams.get('clone')
  const { profile } = useAuth()
  const { toast } = useToast()
  const { createPosting } = useJobPostingMutations()

  const [departments, setDepartments] = useState<Department[]>([])
  const [surveyTemplates, setSurveyTemplates] = useState<{ id: string; name: string; experience_type: string; questions: any[] }[]>([])
  const [saving, setSaving] = useState(false)
  const [generatingAI, setGeneratingAI] = useState(false)
  const [isClone, setIsClone] = useState(false)

  const [form, setForm] = useState({ ...INITIAL_FORM })
  const [aiQuestions, setAiQuestions] = useState<string[]>([])
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>('')

  useEffect(() => {
    Promise.all([
      supabase.from('departments').select('*'),
      supabase.from('pre_survey_templates').select('id, name, experience_type, questions').eq('is_active', true).order('created_at', { ascending: false }),
    ]).then(([deptRes, surveyRes]) => {
      if (deptRes.data) setDepartments(deptRes.data)
      if (surveyRes.data) setSurveyTemplates(surveyRes.data as any)
    })
  }, [])

  // 복제 모드: 기존 공고 데이터 불러오기
  useEffect(() => {
    if (!cloneId) return
    async function loadClone() {
      const { data } = await supabase
        .from('job_postings')
        .select('*')
        .eq('id', cloneId)
        .single()
      if (!data) return
      const p = data as JobPosting
      setForm({
        title: `[복사] ${p.title}`,
        department_id: p.department_id ?? '',
        position: p.position ?? '',
        employment_type: p.employment_type ?? 'full_time',
        experience_level: p.experience_level ?? 'any',
        description: p.description ?? '',
        requirements: p.requirements ?? '',
        preferred: p.preferred ?? '',
        salary_range: p.salary_range ?? '',
        deadline: '',
        location: p.location ?? '',
        work_hours: p.work_hours ?? '',
        headcount: String(p.headcount ?? 1),
        benefits: p.benefits ?? '',
        hiring_process: p.hiring_process ?? '',
        contact_name: p.contact_name ?? '',
        contact_email: p.contact_email ?? '',
        contact_phone: p.contact_phone ?? '',
        company_intro: p.company_intro ?? '',
        team_intro: p.team_intro ?? '',
      })
      setAiQuestions((p.ai_questions as string[]) || [])
      if ((p as any).survey_template_id) setSelectedSurveyId((p as any).survey_template_id)
      setIsClone(true)
      toast('기존 공고가 복제되었습니다. 수정 후 저장하세요.', 'info')
    }
    loadClone()
  }, [cloneId, toast])

  function updateForm(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function generateAIQuestions() {
    setGeneratingAI(true)
    try {
      const config = await getAIConfigForFeature('job_posting_ai')

      if (!config) {
        toast('AI 설정이 필요합니다. 설정 > AI 탭에서 API 키를 등록하세요.', 'error')
        setGeneratingAI(false)
        return
      }

      const prompt = `채용 면접 질문을 5개 생성해주세요.

채용공고 정보:
- 제목: ${form.title}
- 포지션: ${form.position || '미정'}
- 경력: ${EXPERIENCE_LEVEL_LABELS[form.experience_level]}
- 고용형태: ${EMPLOYMENT_TYPE_LABELS[form.employment_type]}
- 근무지: ${form.location || '미정'}
- 직무 설명: ${form.description || '없음'}
- 자격 요건: ${form.requirements || '없음'}
- 우대 사항: ${form.preferred || '없음'}
- 팀 소개: ${form.team_intro || '없음'}

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
      title: form.title,
      department_id: form.department_id || null,
      position: form.position || null,
      employment_type: form.employment_type as any,
      experience_level: form.experience_level as any,
      description: form.description || null,
      requirements: form.requirements || null,
      preferred: form.preferred || null,
      salary_range: form.salary_range || null,
      deadline: form.deadline || null,
      location: form.location || null,
      work_hours: form.work_hours || null,
      headcount: parseInt(form.headcount) || 1,
      benefits: form.benefits || null,
      hiring_process: form.hiring_process || null,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      company_intro: form.company_intro || null,
      team_intro: form.team_intro || null,
      ai_questions: aiQuestions as any,
      survey_template_id: selectedSurveyId || null,
      status,
      created_by: profile?.id,
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isClone ? '공고 복제' : '새 채용공고'}
          </h1>
          {isClone && (
            <p className="text-sm text-brand-600 flex items-center gap-1 mt-0.5">
              <Copy className="h-3.5 w-3.5" /> 기존 공고에서 복제됨 — 수정 후 저장하세요
            </p>
          )}
        </div>
      </div>

      {/* 기본 정보 */}
      <Card>
        <CardHeader><CardTitle>기본 정보</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="공고 제목 *"
            value={form.title}
            onChange={(e) => updateForm('title', e.target.value)}
            placeholder="예: [경력] 브랜드사업본부 마케팅 매니저 채용"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="부서 *"
              value={form.department_id}
              onChange={(e) => updateForm('department_id', e.target.value)}
              options={[
                { value: '', label: '선택 안 함' },
                ...departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
            <Input
              label="포지션/직급"
              value={form.position}
              onChange={(e) => updateForm('position', e.target.value)}
              placeholder="예: 마케팅 매니저, 시니어 개발자"
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
              label="채용 인원"
              type="number"
              value={form.headcount}
              onChange={(e) => updateForm('headcount', e.target.value)}
              placeholder="1"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="연봉 범위"
              value={form.salary_range}
              onChange={(e) => updateForm('salary_range', e.target.value)}
              placeholder="예: 4,000~5,000만원 (경력에 따라 협의)"
            />
            <Input
              label="마감일"
              type="date"
              value={form.deadline}
              onChange={(e) => updateForm('deadline', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 근무 조건 */}
      <Card>
        <CardHeader><CardTitle>근무 조건</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="근무지"
              value={form.location}
              onChange={(e) => updateForm('location', e.target.value)}
              placeholder="예: 서울 강남구 테헤란로 (2호선 역삼역 도보 5분)"
            />
            <Input
              label="근무시간"
              value={form.work_hours}
              onChange={(e) => updateForm('work_hours', e.target.value)}
              placeholder="예: 09:00~18:00 (주 5일), 유연근무제"
            />
          </div>
          <Textarea
            label="복리후생"
            value={form.benefits}
            onChange={(e) => updateForm('benefits', e.target.value)}
            placeholder="예:&#10;- 4대보험, 퇴직금&#10;- 연차 15일 + 특별휴가&#10;- 점심 식대 지원&#10;- 자기개발비 연 100만원&#10;- 건강검진 연 1회"
            rows={5}
          />
        </CardContent>
      </Card>

      {/* 직무 상세 */}
      <Card>
        <CardHeader><CardTitle>직무 상세</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            label="담당 업무 (직무 설명) *"
            value={form.description}
            onChange={(e) => updateForm('description', e.target.value)}
            placeholder="예:&#10;- 브랜드 마케팅 전략 수립 및 실행&#10;- SNS 채널 운영 및 콘텐츠 기획&#10;- 캠페인 성과 분석 및 리포트 작성&#10;- 외부 협력업체/인플루언서 관리&#10;- 신규 브랜드 런칭 프로젝트 참여"
            rows={6}
          />
          <Textarea
            label="자격 요건 (필수) *"
            value={form.requirements}
            onChange={(e) => updateForm('requirements', e.target.value)}
            placeholder="예:&#10;- 마케팅 관련 경력 3년 이상&#10;- SNS 채널 운영 경험 필수&#10;- 데이터 기반 의사결정 역량&#10;- MS Office, Google Workspace 활용 능력&#10;- 원활한 커뮤니케이션 능력"
            rows={5}
          />
          <Textarea
            label="우대 사항"
            value={form.preferred}
            onChange={(e) => updateForm('preferred', e.target.value)}
            placeholder="예:&#10;- 뷰티/패션 업계 경험자&#10;- 영상 편집 가능자 (Premiere, After Effects)&#10;- GA4/Meta 광고 운영 경험&#10;- 관련 학과 전공자"
            rows={4}
          />
        </CardContent>
      </Card>

      {/* 채용 전형 */}
      <Card>
        <CardHeader><CardTitle>채용 전형</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            label="전형 절차"
            value={form.hiring_process}
            onChange={(e) => updateForm('hiring_process', e.target.value)}
            placeholder="예:&#10;1. 서류 접수&#10;2. AI 이력서 분석 + 사전 질의서&#10;3. 1차 화상면접 (실무진)&#10;4. 2차 대면면접 (임원)&#10;5. 최종 합격 통보&#10;&#10;※ 전형 결과는 합격자에 한해 개별 통보"
            rows={6}
          />
        </CardContent>
      </Card>

      {/* 회사/팀 소개 */}
      <Card>
        <CardHeader><CardTitle>회사 / 팀 소개</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            label="회사 소개"
            value={form.company_intro}
            onChange={(e) => updateForm('company_intro', e.target.value)}
            placeholder="예: (주)인터오리진은 브랜드 마케팅, 뉴미디어 콘텐츠, IT 솔루션을 아우르는 종합 크리에이티브 기업입니다..."
            rows={4}
          />
          <Textarea
            label="팀 소개"
            value={form.team_intro}
            onChange={(e) => updateForm('team_intro', e.target.value)}
            placeholder="예: 브랜드사업본부는 10명 규모의 팀으로, 국내외 뷰티/패션 브랜드의 통합 마케팅을 담당합니다..."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* 담당자 정보 */}
      <Card>
        <CardHeader><CardTitle>채용 담당자</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="담당자명"
              value={form.contact_name}
              onChange={(e) => updateForm('contact_name', e.target.value)}
              placeholder="인사담당 홍길동"
            />
            <Input
              label="담당자 이메일"
              type="email"
              value={form.contact_email}
              onChange={(e) => updateForm('contact_email', e.target.value)}
              placeholder="hr@interohrigin.com"
            />
            <Input
              label="담당자 연락처"
              type="tel"
              value={form.contact_phone}
              onChange={(e) => updateForm('contact_phone', e.target.value)}
              placeholder="02-0000-0000"
            />
          </div>
        </CardContent>
      </Card>

      {/* 사전질의서 선택 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-gray-400" />
            <CardTitle>사전질의서 연결</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            이력서 검토 후 지원자에게 발송할 사전질의서를 선택하세요. 질의서 관리 페이지에서 새 템플릿을 만들 수 있습니다.
          </p>
          <select
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
            value={selectedSurveyId}
            onChange={(e) => setSelectedSurveyId(e.target.value)}
          >
            <option value="">선택 안 함 (경력 수준 기반 자동 매칭)</option>
            {surveyTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.experience_type === 'entry' ? '신입' : t.experience_type === 'experienced' ? '경력' : '공통'} · {t.questions?.length || 0}문항)
              </option>
            ))}
          </select>

          {/* 선택된 질의서 미리보기 */}
          {selectedSurveyId && (() => {
            const selected = surveyTemplates.find((t) => t.id === selectedSurveyId)
            if (!selected) return null
            return (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="text-xs text-gray-500 font-medium">질문 미리보기 ({selected.questions?.length || 0}문항)</p>
                {(selected.questions || []).slice(0, 5).map((q: any, i: number) => (
                  <div key={q.id || i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-gray-400 shrink-0">{i + 1}.</span>
                    <span>{q.question}</span>
                    {q.required && <span className="text-red-400 text-xs">필수</span>}
                  </div>
                ))}
                {(selected.questions?.length || 0) > 5 && (
                  <p className="text-xs text-gray-400">외 {selected.questions.length - 5}문항...</p>
                )}
              </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* AI 면접 질문 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>AI 면접 질문 (참고용)</CardTitle>
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
              공고 정보를 입력하고 "AI 질문 생성"을 누르면 면접 시 참고할 질문이 자동으로 생성됩니다.
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

      {/* 유입경로 안내 */}
      <Card>
        <CardHeader><CardTitle>유입경로별 지원 링크</CardTitle></CardHeader>
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
