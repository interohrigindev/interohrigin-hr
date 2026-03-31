import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Upload, FileText, Loader2, CheckCircle, MapPin, Clock, Users, Banknote, CalendarDays, Briefcase, Gift, ListChecks, Building2, ArrowLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { JobPosting } from '@/types/recruitment'
import { formatDate } from '@/lib/utils'

type PageStep = 'detail' | 'apply' | 'done'

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: '정규직', contract: '계약직', intern: '인턴', part_time: '파트타임',
}
const EXPERIENCE_LABELS: Record<string, string> = {
  any: '경력 무관', entry: '신입', junior: '주니어 (1~3년)', mid: '미드 (3~5년)', senior: '시니어 (5년+)', executive: '임원급',
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm text-gray-800 font-medium">{value}</p>
      </div>
    </div>
  )
}

function Section({ title, content }: { title: string; content: string | null | undefined }) {
  if (!content) return null
  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
      <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-white rounded-lg border border-gray-100 p-4">
        {content}
      </div>
    </div>
  )
}

export default function PublicApply() {
  const { postingId } = useParams()
  const [searchParams] = useSearchParams()
  const source = searchParams.get('source') || 'direct'
  const ref = searchParams.get('ref') || ''

  const [posting, setPosting] = useState<JobPosting | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<PageStep>('detail')
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({ name: '', email: '', phone: '', cover_letter_text: '' })
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!postingId) return
    supabase.from('job_postings').select('*').eq('id', postingId).single()
      .then(({ data }) => { if (data) setPosting(data as JobPosting); setLoading(false) })
  }, [postingId])

  function updateForm(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.email.trim()) { setError('이름과 이메일은 필수입니다.'); return }
    if (!resumeFile) { setError('이력서를 업로드해주세요.'); return }

    setSubmitting(true)
    try {
      // 파일명에서 확장자만 추출 (한글 등 특수문자 제거)
      const getExt = (name: string) => {
        const dot = name.lastIndexOf('.')
        return dot >= 0 ? name.slice(dot).toLowerCase() : ''
      }

      // 파일 경로만 DB에 저장 (private 버킷이므로 public URL 사용 불가)
      const resumePath = `${postingId}/${Date.now()}_resume${getExt(resumeFile.name)}`
      const { error: uploadErr } = await supabase.storage.from('resumes').upload(resumePath, resumeFile)
      if (uploadErr) throw new Error('이력서 업로드 실패: ' + uploadErr.message)

      let coverLetterPath = null
      if (coverLetterFile) {
        coverLetterPath = `${postingId}/${Date.now()}_cover_letter${getExt(coverLetterFile.name)}`
        const { error: clUploadErr } = await supabase.storage.from('resumes').upload(coverLetterPath, coverLetterFile)
        if (clUploadErr) throw new Error('자기소개서 업로드 실패: ' + clUploadErr.message)
      }

      const { error: insertErr } = await supabase.rpc('submit_application', {
        p_job_posting_id: postingId,
        p_name: form.name,
        p_email: form.email,
        p_phone: form.phone || null,
        p_source_channel: source,
        p_source_detail: ref || null,
        p_resume_url: resumePath,
        p_cover_letter_url: coverLetterPath,
        p_cover_letter_text: form.cover_letter_text || null,
      })
      if (insertErr) throw new Error('지원서 제출 실패: ' + insertErr.message)
      setStep('done')
    } catch (err: any) { setError(err.message) }
    setSubmitting(false)
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
  }

  if (!posting || posting.status !== 'open') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">채용공고를 찾을 수 없습니다</h1>
          <p className="text-gray-500">이미 마감되었거나 잘못된 링크입니다.</p>
        </div>
      </div>
    )
  }

  // ─── STEP 3: 제출 완료 ─────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">지원이 완료되었습니다!</h1>
          <p className="text-gray-500">{form.name}님, 지원해주셔서 감사합니다.<br />검토 후 별도로 연락드리겠습니다.</p>
        </div>
      </div>
    )
  }

  // ─── STEP 2: 지원서 작성 ───────────────────────────────────────
  if (step === 'apply') {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          {/* 뒤로가기 */}
          <button onClick={() => setStep('detail')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" /> 공고 상세로 돌아가기
          </button>

          <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
            <p className="text-xs text-brand-600 font-medium mb-1">(주)인터오리진 채용</p>
            <h1 className="text-xl font-bold text-gray-900">{posting.title}</h1>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">지원서 작성</h2>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
              <input type="text" value={form.name} onChange={(e) => updateForm('name', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none" placeholder="홍길동" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이메일 *</label>
              <input type="email" value={form.email} onChange={(e) => updateForm('email', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none" placeholder="example@email.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
              <input type="tel" value={form.phone} onChange={(e) => updateForm('phone', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none" placeholder="010-0000-0000" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이력서 * (PDF, 이미지)</label>
              <label className="flex items-center gap-3 w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-6 cursor-pointer hover:border-brand-400 transition-colors">
                <Upload className="h-6 w-6 text-gray-400" />
                <span className="flex-1">
                  {resumeFile ? <span className="text-sm font-medium text-brand-600">{resumeFile.name}</span> : <span className="text-sm text-gray-500">파일을 선택하거나 드래그하세요</span>}
                </span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => setResumeFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">자기소개서 (파일 또는 직접 작성)</label>
              <label className="flex items-center gap-3 w-full rounded-lg border border-gray-300 px-4 py-3 cursor-pointer hover:border-brand-400 transition-colors mb-2">
                <FileText className="h-5 w-5 text-gray-400" />
                <span className="text-sm text-gray-500">{coverLetterFile ? coverLetterFile.name : '파일 선택 (선택사항)'}</span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" className="hidden" onChange={(e) => setCoverLetterFile(e.target.files?.[0] || null)} />
              </label>
              <textarea value={form.cover_letter_text} onChange={(e) => updateForm('cover_letter_text', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none" rows={6}
                placeholder="직접 자기소개서를 작성하실 수 있습니다." />
            </div>

            <button type="submit" disabled={submitting}
              className="w-full bg-brand-600 text-white rounded-lg py-3 font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> 제출 중...</> : '지원서 제출'}
            </button>

            <p className="text-xs text-gray-400 text-center">제출하신 개인정보는 채용 목적으로만 사용되며, 채용 절차 종료 후 파기됩니다.</p>
          </form>
        </div>
      </div>
    )
  }

  // ─── STEP 1: 공고 상세 보기 ────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 헤더 */}
      <div className="bg-brand-600 text-white py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-brand-200 text-sm font-medium mb-2">(주)인터오리진 채용</p>
          <h1 className="text-2xl sm:text-3xl font-bold mb-3">{posting.title}</h1>
          <div className="flex flex-wrap gap-3 text-sm text-brand-100">
            {posting.position && <span className="bg-white/10 rounded-full px-3 py-1">{posting.position}</span>}
            <span className="bg-white/10 rounded-full px-3 py-1">{EMPLOYMENT_LABELS[posting.employment_type] || posting.employment_type}</span>
            <span className="bg-white/10 rounded-full px-3 py-1">{EXPERIENCE_LABELS[posting.experience_level] || posting.experience_level}</span>
            {posting.headcount && <span className="bg-white/10 rounded-full px-3 py-1">{posting.headcount}명 채용</span>}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* 핵심 정보 카드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <InfoItem icon={Banknote} label="연봉" value={posting.salary_range} />
            <InfoItem icon={MapPin} label="근무지" value={posting.location} />
            <InfoItem icon={Clock} label="근무시간" value={posting.work_hours} />
            <InfoItem icon={CalendarDays} label="마감일" value={posting.deadline ? formatDate(posting.deadline, 'yyyy년 MM월 dd일') : '상시 채용'} />
            <InfoItem icon={Briefcase} label="고용형태" value={EMPLOYMENT_LABELS[posting.employment_type]} />
            <InfoItem icon={Users} label="채용인원" value={posting.headcount ? `${posting.headcount}명` : null} />
          </div>
        </div>

        {/* 회사/팀 소개 */}
        {(posting.company_intro || posting.team_intro) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-brand-500" /> 회사 / 팀 소개
            </h2>
            {posting.company_intro && (
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{posting.company_intro}</div>
            )}
            {posting.team_intro && (
              <div className="bg-brand-50 rounded-lg p-4">
                <p className="text-xs text-brand-600 font-medium mb-1">팀 소개</p>
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{posting.team_intro}</div>
              </div>
            )}
          </div>
        )}

        {/* 직무 상세 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          <Section title="담당 업무" content={posting.description} />
          <Section title="자격 요건 (필수)" content={posting.requirements} />
          <Section title="우대 사항" content={posting.preferred} />
        </div>

        {/* 복리후생 */}
        {posting.benefits && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-3">
              <Gift className="h-5 w-5 text-green-500" /> 복리후생
            </h2>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{posting.benefits}</div>
          </div>
        )}

        {/* 전형 절차 */}
        {posting.hiring_process && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-3">
              <ListChecks className="h-5 w-5 text-blue-500" /> 채용 전형
            </h2>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{posting.hiring_process}</div>
          </div>
        )}

        {/* 지원하기 CTA */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <h2 className="text-lg font-bold text-gray-900 mb-2">이 포지션에 관심이 있으신가요?</h2>
          <p className="text-sm text-gray-500 mb-5">아래 버튼을 눌러 지원서를 작성해주세요.</p>
          <button
            onClick={() => setStep('apply')}
            className="inline-flex items-center gap-2 bg-brand-600 text-white rounded-xl px-8 py-3.5 font-semibold text-base hover:bg-brand-700 transition-colors shadow-lg shadow-brand-600/20"
          >
            지원하기 <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* 하단 정보 */}
        <p className="text-xs text-gray-400 text-center pb-4">
          (주)인터오리진 · 채용 문의: {posting.contact_email || 'hr@interohrigin.com'}
        </p>
      </div>
    </div>
  )
}
