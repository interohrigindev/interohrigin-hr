import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Candidate } from '@/types/recruitment'

interface SurveyQuestion {
  id: string
  question: string
  type: 'text' | 'choice' | 'scale'
  options?: string[]
  required?: boolean
}

export default function PublicSurvey() {
  const { token } = useParams()
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  // 생년월일/MBTI/한자이름 추가 필드
  const [meta, setMeta] = useState({ birth_date: '', mbti: '', hanja_name: '', blood_type: '' })

  useEffect(() => {
    if (!token) return
    async function load() {
      // 토큰으로 지원자 찾기
      const { data: cand } = await supabase
        .from('candidates')
        .select('*')
        .eq('invite_token', token)
        .single()

      if (!cand) {
        setLoading(false)
        return
      }
      setCandidate(cand as Candidate)

      // 이미 완료한 경우
      if (cand.status === 'survey_done') {
        setSubmitted(true)
        setLoading(false)
        return
      }

      // 해당 공고의 질의서 템플릿 가져오기
      if (cand.job_posting_id) {
        const { data: posting } = await supabase
          .from('job_postings')
          .select('experience_level, survey_template_id')
          .eq('id', cand.job_posting_id)
          .single()

        let loaded = false

        // 1) 공고에 명시적으로 연결된 질의서 우선
        if (posting?.survey_template_id) {
          const { data: linked } = await supabase
            .from('pre_survey_templates')
            .select('questions')
            .eq('id', posting.survey_template_id)
            .single()
          if (linked?.questions) {
            setQuestions(linked.questions as SurveyQuestion[])
            loaded = true
          }
        }

        // 2) fallback: 경력 수준 기반 자동 매칭
        if (!loaded) {
          const expType = posting?.experience_level === 'entry' ? 'entry' : 'experienced'
          const { data: templates } = await supabase
            .from('pre_survey_templates')
            .select('*')
            .eq('is_active', true)
            .or(`experience_type.eq.${expType},experience_type.eq.any`)
            .order('created_at', { ascending: false })
            .limit(1)

          if (templates && templates.length > 0) {
            setQuestions(templates[0].questions as SurveyQuestion[])
          }
        }
      }

      setLoading(false)
    }
    load()
  }, [token])

  function setAnswer(qId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [qId]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!candidate) return
    setError('')

    // 필수 질문 검증
    const missing = questions.filter((q) => q.required && !answers[q.id]?.trim())
    if (missing.length > 0) {
      setError(`필수 질문 ${missing.length}개에 답변해주세요.`)
      return
    }

    setSubmitting(true)
    try {
      const surveyData = {
        answers,
        meta: {
          birth_date: meta.birth_date || null,
          mbti: meta.mbti || null,
          hanja_name: meta.hanja_name || null,
          blood_type: meta.blood_type || null,
        },
        completed_at: new Date().toISOString(),
      }

      const { error: updateErr } = await supabase
        .from('candidates')
        .update({
          pre_survey_data: surveyData,
          status: 'survey_done',
          metadata: {
            ...(candidate.metadata || {}),
            birth_date: meta.birth_date,
            mbti: meta.mbti,
            hanja_name: meta.hanja_name,
            blood_type: meta.blood_type,
          },
        })
        .eq('id', candidate.id)

      if (updateErr) throw new Error(updateErr.message)
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message)
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">유효하지 않은 링크</h1>
          <p className="text-gray-500">만료되었거나 잘못된 링크입니다.</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">응답이 완료되었습니다!</h1>
          <p className="text-gray-500">감사합니다. 다음 단계를 안내해드리겠습니다.</p>
        </div>
      </div>
    )
  }

  const MBTI_OPTIONS = [
    'ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP',
    'ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ',
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <p className="text-sm text-brand-600 font-medium mb-1">(주)인터오리진 채용</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">사전 질의서</h1>
          <p className="text-sm text-gray-500">{candidate.name}님, 아래 질문에 답변해주세요. (약 10분 소요)</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 기본 정보 수집 */}
          <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">기본 정보</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">생년월일</label>
              <input
                type="date"
                value={meta.birth_date}
                onChange={(e) => setMeta((p) => ({ ...p, birth_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MBTI</label>
              <select
                value={meta.mbti}
                onChange={(e) => setMeta((p) => ({ ...p, mbti: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
              >
                <option value="">선택하세요</option>
                {MBTI_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">한자 이름 (선택)</label>
                <input
                  type="text"
                  value={meta.hanja_name}
                  onChange={(e) => setMeta((p) => ({ ...p, hanja_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
                  placeholder="洪吉東"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">혈액형 (선택)</label>
                <select
                  value={meta.blood_type}
                  onChange={(e) => setMeta((p) => ({ ...p, blood_type: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
                >
                  <option value="">선택하세요</option>
                  <option value="A">A형</option>
                  <option value="B">B형</option>
                  <option value="O">O형</option>
                  <option value="AB">AB형</option>
                </select>
              </div>
            </div>
          </div>

          {/* 질의서 질문 */}
          {questions.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6 space-y-5">
              <h2 className="text-lg font-semibold text-gray-900">질의 항목</h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                  {error}
                </div>
              )}

              {questions.map((q, i) => (
                <div key={q.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {i + 1}. {q.question}
                    {q.required && <span className="text-red-500 ml-1">*</span>}
                  </label>

                  {q.type === 'text' && (
                    <textarea
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
                      rows={3}
                    />
                  )}

                  {q.type === 'choice' && q.options && (
                    <div className="space-y-2">
                      {q.options.map((opt) => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={q.id}
                            value={opt}
                            checked={answers[q.id] === opt}
                            onChange={() => setAnswer(q.id, opt)}
                            className="text-brand-600"
                          />
                          <span className="text-sm text-gray-700">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === 'scale' && (
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setAnswer(q.id, String(n))}
                          className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
                            answers[q.id] === String(n)
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'border-gray-300 text-gray-600 hover:border-brand-400'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-600 text-white rounded-lg py-3 font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> 제출 중...</>
            ) : (
              '응답 제출'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
