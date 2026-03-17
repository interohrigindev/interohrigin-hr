import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Upload, FileText, Loader2, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { JobPosting } from '@/types/recruitment'

export default function PublicApply() {
  const { postingId } = useParams()
  const [searchParams] = useSearchParams()
  const source = searchParams.get('source') || 'direct'
  const ref = searchParams.get('ref') || ''

  const [posting, setPosting] = useState<JobPosting | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    cover_letter_text: '',
  })
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!postingId) return
    supabase
      .from('job_postings')
      .select('*')
      .eq('id', postingId)
      .single()
      .then(({ data }) => {
        if (data) setPosting(data as JobPosting)
        setLoading(false)
      })
  }, [postingId])

  function updateForm(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.name.trim() || !form.email.trim()) {
      setError('이름과 이메일은 필수입니다.')
      return
    }
    if (!resumeFile) {
      setError('이력서를 업로드해주세요.')
      return
    }

    setSubmitting(true)
    try {
      // 1. 이력서 업로드
      const resumePath = `${postingId}/${Date.now()}_${resumeFile.name}`
      const { error: uploadErr } = await supabase.storage
        .from('resumes')
        .upload(resumePath, resumeFile)
      if (uploadErr) throw new Error('이력서 업로드 실패: ' + uploadErr.message)

      const { data: resumeUrlData } = supabase.storage
        .from('resumes')
        .getPublicUrl(resumePath)
      const resumeUrl = resumeUrlData.publicUrl

      // 2. 자기소개서 파일 업로드 (선택)
      let coverLetterUrl = null
      if (coverLetterFile) {
        const clPath = `${postingId}/${Date.now()}_${coverLetterFile.name}`
        await supabase.storage.from('resumes').upload(clPath, coverLetterFile)
        const { data: clUrlData } = supabase.storage.from('resumes').getPublicUrl(clPath)
        coverLetterUrl = clUrlData.publicUrl
      }

      // 3. 지원자 레코드 생성
      const { error: insertErr } = await supabase.from('candidates').insert({
        job_posting_id: postingId,
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        source_channel: source,
        source_detail: ref || null,
        resume_url: resumeUrl,
        cover_letter_url: coverLetterUrl,
        cover_letter_text: form.cover_letter_text || null,
        status: 'applied',
      })

      if (insertErr) throw new Error('지원서 제출 실패: ' + insertErr.message)

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

  if (!posting || posting.status !== 'open') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">채용공고를 찾을 수 없습니다</h1>
          <p className="text-gray-500">이미 마감되었거나 잘못된 링크입니다.</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">지원이 완료되었습니다!</h1>
          <p className="text-gray-500">
            {form.name}님, 지원해주셔서 감사합니다.<br />
            검토 후 별도로 연락드리겠습니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* 공고 정보 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <p className="text-sm text-brand-600 font-medium mb-1">(주)인터오리진 채용</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{posting.title}</h1>
          {posting.description && (
            <p className="text-sm text-gray-600 line-clamp-3">{posting.description}</p>
          )}
        </div>

        {/* 지원 폼 */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">지원서 작성</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
              placeholder="홍길동"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일 *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateForm('email', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
              placeholder="example@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => updateForm('phone', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
              placeholder="010-0000-0000"
            />
          </div>

          {/* 이력서 업로드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이력서 * (PDF, DOC, 이미지)</label>
            <label className="flex items-center gap-3 w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-6 cursor-pointer hover:border-brand-400 transition-colors">
              <Upload className="h-6 w-6 text-gray-400" />
              <div className="flex-1">
                {resumeFile ? (
                  <span className="text-sm font-medium text-brand-600">{resumeFile.name}</span>
                ) : (
                  <span className="text-sm text-gray-500">파일을 선택하거나 드래그하세요</span>
                )}
              </div>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {/* 자기소개서 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">자기소개서 (파일 또는 직접 작성)</label>
            <label className="flex items-center gap-3 w-full rounded-lg border border-gray-300 px-4 py-3 cursor-pointer hover:border-brand-400 transition-colors mb-2">
              <FileText className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-500">
                {coverLetterFile ? coverLetterFile.name : '파일 선택 (선택사항)'}
              </span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={(e) => setCoverLetterFile(e.target.files?.[0] || null)}
              />
            </label>
            <textarea
              value={form.cover_letter_text}
              onChange={(e) => updateForm('cover_letter_text', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
              rows={6}
              placeholder="직접 자기소개서를 작성하실 수 있습니다. (파일 업로드와 중복 가능)"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-600 text-white rounded-lg py-3 font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> 제출 중...
              </>
            ) : (
              '지원서 제출'
            )}
          </button>

          <p className="text-xs text-gray-400 text-center">
            제출하신 개인정보는 채용 목적으로만 사용되며, 채용 절차 종료 후 파기됩니다.
          </p>
        </form>
      </div>
    </div>
  )
}
