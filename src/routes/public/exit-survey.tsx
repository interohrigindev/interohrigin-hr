import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'

const EXIT_REASONS = [
  { value: '', label: '선택하세요' },
  { value: '급여/복리후생', label: '급여/복리후생' },
  { value: '업무 과중', label: '업무 과중' },
  { value: '야근 과다', label: '야근 과다' },
  { value: '인간관계', label: '인간관계' },
  { value: '성장 기회 부족', label: '성장 기회 부족' },
  { value: '이직', label: '이직' },
  { value: '개인 사유', label: '개인 사유' },
  { value: '회사 문화', label: '회사 문화' },
  { value: '기타', label: '기타' },
]

export default function PublicExitSurvey() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const [alreadyCompleted, setAlreadyCompleted] = useState(false)
  const [surveyId, setSurveyId] = useState<string | null>(null)

  const [form, setForm] = useState({
    exit_date: '',
    exit_reason_category: '',
    exit_reason_detail: '',
    best_experience: '',
    worst_experience: '',
    suggestions: '',
    anonymous_feedback: '',
  })

  useEffect(() => {
    async function load() {
      if (!token) {
        setError('유효하지 않은 링크입니다.')
        setLoading(false)
        return
      }

      const { data, error: fetchErr } = await supabase
        .from('exit_surveys')
        .select('*')
        .eq('token', token)
        .maybeSingle()

      if (fetchErr || !data) {
        setError('유효하지 않은 설문 링크입니다.')
        setLoading(false)
        return
      }

      if (data.completed_at) {
        setAlreadyCompleted(true)
        setLoading(false)
        return
      }

      setSurveyId(data.id)
      if (data.exit_date) {
        setForm((p) => ({ ...p, exit_date: data.exit_date }))
      }
      setLoading(false)
    }
    load()
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!surveyId) return

    if (!form.exit_reason_category) {
      setError('퇴사 사유를 선택해주세요.')
      return
    }

    setSubmitting(true)
    setError(null)

    const { error: updateErr } = await supabase
      .from('exit_surveys')
      .update({
        exit_date: form.exit_date || null,
        exit_reason_category: form.exit_reason_category,
        exit_reason_detail: form.exit_reason_detail.trim() || null,
        best_experience: form.best_experience.trim() || null,
        worst_experience: form.worst_experience.trim() || null,
        suggestions: form.suggestions.trim() || null,
        anonymous_feedback: form.anonymous_feedback.trim() || null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', surveyId)

    if (updateErr) {
      setError('제출 실패: ' + updateErr.message)
      setSubmitting(false)
      return
    }

    setCompleted(true)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Spinner size="lg" />
      </div>
    )
  }

  if (alreadyCompleted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8 text-center">
          <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">이미 제출된 설문입니다</h1>
          <p className="text-gray-500">이 퇴사 설문은 이미 완료되었습니다. 감사합니다.</p>
        </div>
      </div>
    )
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8 text-center">
          <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">설문이 제출되었습니다</h1>
          <p className="text-gray-500">소중한 의견 감사합니다. 더 나은 회사가 되겠습니다.</p>
        </div>
      </div>
    )
  }

  if (error && !surveyId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">오류</h1>
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">퇴사 설문</h1>
        <p className="text-gray-500 mb-6">솔직한 의견을 남겨주세요. 답변은 회사 개선에만 사용됩니다.</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="퇴사일"
            type="date"
            value={form.exit_date}
            onChange={(e) => setForm((p) => ({ ...p, exit_date: e.target.value }))}
          />

          <Select
            label="퇴사 사유 *"
            value={form.exit_reason_category}
            onChange={(e) => setForm((p) => ({ ...p, exit_reason_category: e.target.value }))}
            options={EXIT_REASONS}
          />

          <Textarea
            label="퇴사 사유 상세"
            value={form.exit_reason_detail}
            onChange={(e) => setForm((p) => ({ ...p, exit_reason_detail: e.target.value }))}
            placeholder="구체적인 사유를 적어주세요."
            rows={3}
          />

          <Textarea
            label="회사에서 가장 좋았던 경험"
            value={form.best_experience}
            onChange={(e) => setForm((p) => ({ ...p, best_experience: e.target.value }))}
            placeholder="재직 기간 중 가장 긍정적이었던 경험은?"
            rows={3}
          />

          <Textarea
            label="회사에서 가장 아쉬웠던 경험"
            value={form.worst_experience}
            onChange={(e) => setForm((p) => ({ ...p, worst_experience: e.target.value }))}
            placeholder="개선이 필요하다고 느꼈던 부분은?"
            rows={3}
          />

          <Textarea
            label="회사에 대한 제안"
            value={form.suggestions}
            onChange={(e) => setForm((p) => ({ ...p, suggestions: e.target.value }))}
            placeholder="후임자 또는 회사에 대한 건설적인 제안이 있다면 적어주세요."
            rows={3}
          />

          <Textarea
            label="익명 피드백"
            value={form.anonymous_feedback}
            onChange={(e) => setForm((p) => ({ ...p, anonymous_feedback: e.target.value }))}
            placeholder="자유롭게 의견을 남겨주세요. (이 내용은 익명으로 처리됩니다)"
            rows={3}
          />

          <div className="pt-4 border-t">
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? <Spinner size="sm" /> : '설문 제출'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
