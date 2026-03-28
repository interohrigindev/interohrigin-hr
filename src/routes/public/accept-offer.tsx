import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface OfferData {
  id: string
  candidate_id: string
  decision: string
  offered_salary: number | null
  offered_position: string | null
  start_date: string | null
  offer_conditions: Record<string, any> | null
  candidate_response: Record<string, any> | null
  candidate_name?: string
  job_title?: string
}

export default function AcceptOfferPage() {
  const { token } = useParams()
  const [offer, setOffer] = useState<OfferData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    agreed: '',
    salary_negotiation: 'none',
    desired_salary: '',
    start_date_change: '',
    notes: '',
  })

  useEffect(() => {
    if (!token) return
    async function load() {
      const { data: hd } = await supabase
        .from('hiring_decisions')
        .select('*')
        .eq('offer_token', token)
        .eq('decision', 'hired')
        .maybeSingle()

      if (!hd) {
        setError('유효하지 않은 링크이거나 만료된 합격 통보입니다.')
        setLoading(false)
        return
      }

      if (hd.candidate_response) {
        setSubmitted(true)
        setLoading(false)
        return
      }

      // 지원자 이름 가져오기
      const { data: cand } = await supabase
        .from('candidates')
        .select('name, job_posting_id')
        .eq('id', hd.candidate_id)
        .maybeSingle()

      let jobTitle = ''
      if (cand?.job_posting_id) {
        const { data: jp } = await supabase
          .from('job_postings')
          .select('title')
          .eq('id', cand.job_posting_id)
          .maybeSingle()
        jobTitle = jp?.title || ''
      }

      setOffer({
        ...hd,
        candidate_name: cand?.name || '',
        job_title: jobTitle,
      } as OfferData)
      setLoading(false)
    }
    load()
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.agreed) return
    if (!offer) return

    setSubmitting(true)

    const response = {
      agreed: form.agreed === 'yes',
      salary_negotiation: {
        desired: form.salary_negotiation !== 'none',
        type: form.salary_negotiation,
        amount: form.desired_salary ? parseInt(form.desired_salary) : null,
      },
      start_date_change: form.start_date_change || null,
      notes: form.notes || null,
      submitted_at: new Date().toISOString(),
    }

    const { error: updateErr } = await supabase
      .from('hiring_decisions')
      .update({ candidate_response: response })
      .eq('offer_token', token)

    if (updateErr) {
      setError('응답 제출에 실패했습니다. 다시 시도해주세요.')
      setSubmitting(false)
      return
    }

    // 담당자에게 알림 이메일 발송
    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'hr@interohrigin.com',
          subject: `[채용] ${offer.candidate_name}님이 합격 조건에 응답했습니다`,
          html: `
            <p><strong>${offer.candidate_name}</strong>님이 합격 조건에 응답했습니다.</p>
            <ul>
              <li>동의 여부: ${form.agreed === 'yes' ? '동의' : '비동의'}</li>
              <li>연봉 협상: ${form.salary_negotiation === 'none' ? '없음' : form.salary_negotiation === 'negotiate' ? `협상 희망 (${form.desired_salary}만원)` : '협상 희망'}</li>
              ${form.start_date_change ? `<li>희망 입사일 변경: ${form.start_date_change}</li>` : ''}
              ${form.notes ? `<li>기타 요청: ${form.notes}</li>` : ''}
            </ul>
            <p>HR 플랫폼에서 상세 내용을 확인해주세요.</p>
          `,
        }),
      })
    } catch {}

    setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">응답이 제출되었습니다</h2>
          <p className="text-gray-600">인사담당자가 확인 후 연락드리겠습니다. 감사합니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-purple-700 to-purple-900 rounded-t-2xl p-6 text-center">
          <h1 className="text-white text-xl font-bold tracking-wider">INTEROHRIGIN</h1>
          <p className="text-purple-200 text-sm mt-1">합격 조건 확인</p>
        </div>

        <div className="bg-white rounded-b-2xl shadow-lg p-6">
          {/* 합격 축하 */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-center">
            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="font-bold text-green-800">{offer?.candidate_name}님, 합격을 축하드립니다!</p>
            {offer?.job_title && <p className="text-sm text-green-600 mt-1">{offer.job_title}</p>}
          </div>

          {/* 조건 표시 */}
          {(offer?.offered_salary || offer?.offered_position || offer?.start_date) && (
            <div className="bg-gray-50 border rounded-xl p-4 mb-6">
              <p className="font-semibold text-gray-700 mb-3">채용 조건</p>
              <table className="w-full text-sm">
                <tbody>
                  {offer?.offered_position && (
                    <tr><td className="py-1.5 font-medium text-gray-500 w-28">직무</td><td>{offer.offered_position}</td></tr>
                  )}
                  {offer?.offered_salary && (
                    <tr><td className="py-1.5 font-medium text-gray-500">연봉</td><td>{offer.offered_salary.toLocaleString()}만원</td></tr>
                  )}
                  {offer?.offer_conditions?.probation_salary && (
                    <tr><td className="py-1.5 font-medium text-gray-500">수습 급여</td><td>{Number(offer.offer_conditions.probation_salary).toLocaleString()}만원</td></tr>
                  )}
                  {offer?.offer_conditions?.regular_salary && (
                    <tr><td className="py-1.5 font-medium text-gray-500">정규직 급여</td><td>{Number(offer.offer_conditions.regular_salary).toLocaleString()}만원</td></tr>
                  )}
                  {offer?.start_date && (
                    <tr><td className="py-1.5 font-medium text-gray-500">입사 예정일</td><td>{offer.start_date}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 응답 폼 */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 동의 여부 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                합격 조건에 동의하십니까? <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3">
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  form.agreed === 'yes' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="agreed" value="yes" className="sr-only"
                    onChange={() => setForm(p => ({ ...p, agreed: 'yes' }))} />
                  <CheckCircle className={`h-5 w-5 ${form.agreed === 'yes' ? 'text-green-500' : 'text-gray-300'}`} />
                  <span className="font-medium">네, 동의합니다</span>
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  form.agreed === 'no' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="agreed" value="no" className="sr-only"
                    onChange={() => setForm(p => ({ ...p, agreed: 'no' }))} />
                  <AlertTriangle className={`h-5 w-5 ${form.agreed === 'no' ? 'text-red-500' : 'text-gray-300'}`} />
                  <span className="font-medium">아니오</span>
                </label>
              </div>
            </div>

            {/* 연봉 협상 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">연봉 협상 의사</label>
              <select value={form.salary_negotiation}
                onChange={(e) => setForm(p => ({ ...p, salary_negotiation: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="none">없음 (제시 조건 수락)</option>
                <option value="negotiate">협상 희망</option>
              </select>
              {form.salary_negotiation === 'negotiate' && (
                <input type="number" placeholder="희망 연봉 (만원)" value={form.desired_salary}
                  onChange={(e) => setForm(p => ({ ...p, desired_salary: e.target.value }))}
                  className="w-full mt-2 px-3 py-2 border rounded-lg text-sm" />
              )}
            </div>

            {/* 희망 입사일 변경 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">희망 입사일 변경 (선택)</label>
              <input type="date" value={form.start_date_change}
                onChange={(e) => setForm(p => ({ ...p, start_date_change: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>

            {/* 기타 요청 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">기타 요청사항</label>
              <textarea rows={3} placeholder="추가로 요청하실 사항이 있으면 작성해주세요." value={form.notes}
                onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm resize-none" />
            </div>

            <button type="submit" disabled={!form.agreed || submitting}
              className="w-full py-3 bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {submitting ? '제출 중...' : '응답 제출'}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-4">
            본 페이지는 인터오리진 채용 프로세스의 일환입니다. 문의: hr@interohrigin.com
          </p>
        </div>
      </div>
    </div>
  )
}
