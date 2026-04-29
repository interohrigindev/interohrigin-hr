import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Upload, FileText, Loader2, CheckCircle, MapPin, Clock, Users, Banknote, CalendarDays, Briefcase, Gift, ListChecks, Building2, ArrowLeft, ChevronRight, Plus, X, Link as LinkIcon, FolderUp } from 'lucide-react'
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

  const [agencyGate, setAgencyGate] = useState(false)
  const [agencyConfirmed, setAgencyConfirmed] = useState(false)
  const isAgency = source === 'agency' || source === 'headhunter' || agencyConfirmed
  const [form, setForm] = useState({ name: '', email: '', phone: '', cover_letter_text: '', agency_name: '', agency_contact: '', agency_email: '' })
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null)
  // 포트폴리오: 다중 파일 + 링크 (드라이브 등)
  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([])
  const [portfolioLinks, setPortfolioLinks] = useState<{ url: string; label: string }[]>([])
  const [error, setError] = useState('')

  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

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
    if (isAgency && (!form.agency_name.trim() || !form.agency_contact.trim() || !form.agency_email.trim())) {
      setError('업체명, 담당자명, 담당자 이메일은 필수입니다.'); return
    }
    // 50MB 초과 파일 사전 검사
    const allFiles: { f: File; label: string }[] = [
      { f: resumeFile, label: '이력서' },
      ...(coverLetterFile ? [{ f: coverLetterFile, label: '자기소개서' }] : []),
      ...portfolioFiles.map((f) => ({ f, label: `포트폴리오(${f.name})` })),
    ]
    for (const { f, label } of allFiles) {
      if (f.size > MAX_FILE_SIZE) {
        setError(`${label} 파일이 50MB 를 초과합니다. Drive 등 외부 링크를 이용해주세요.`)
        return
      }
    }

    setSubmitting(true)
    try {
      const getExt = (name: string) => {
        const dot = name.lastIndexOf('.')
        return dot >= 0 ? name.slice(dot).toLowerCase() : ''
      }

      // 1) 이력서 업로드
      const resumePath = `${postingId}/${Date.now()}_resume${getExt(resumeFile.name)}`
      const { error: uploadErr } = await supabase.storage.from('resumes').upload(resumePath, resumeFile)
      if (uploadErr) throw new Error('이력서 업로드 실패: ' + uploadErr.message)

      // 2) 자기소개서 업로드 (선택)
      let coverLetterPath: string | null = null
      if (coverLetterFile) {
        coverLetterPath = `${postingId}/${Date.now()}_cover_letter${getExt(coverLetterFile.name)}`
        const { error: clUploadErr } = await supabase.storage.from('resumes').upload(coverLetterPath, coverLetterFile)
        if (clUploadErr) throw new Error('자기소개서 업로드 실패: ' + clUploadErr.message)
      }

      // 3) 포트폴리오 파일 다중 업로드
      const uploadedPortfolioFiles: { path: string; filename: string; size: number }[] = []
      for (let i = 0; i < portfolioFiles.length; i++) {
        const pf = portfolioFiles[i]
        const path = `${postingId}/${Date.now()}_portfolio_${i}${getExt(pf.name)}`
        const { error: pfErr } = await supabase.storage.from('resumes').upload(path, pf)
        if (pfErr) throw new Error(`포트폴리오 업로드 실패 (${pf.name}): ${pfErr.message}`)
        uploadedPortfolioFiles.push({ path, filename: pf.name, size: pf.size })
      }

      // 4) 포트폴리오 링크 정리 (URL 채워진 항목만)
      const cleanLinks = portfolioLinks
        .map((l) => ({ url: l.url.trim(), label: l.label.trim() }))
        .filter((l) => l.url.length > 0)

      const { error: insertErr } = await supabase.rpc('submit_application', {
        p_job_posting_id: postingId,
        p_name: form.name,
        p_email: form.email,
        p_phone: form.phone || null,
        p_source_channel: source,
        p_source_detail: isAgency
          ? JSON.stringify({ agency: form.agency_name, contact: form.agency_contact, email: form.agency_email })
          : (ref || null),
        p_resume_url: resumePath,
        p_cover_letter_url: coverLetterPath,
        p_cover_letter_text: form.cover_letter_text || null,
        p_portfolio_files: uploadedPortfolioFiles,
        p_portfolio_links: cleanLinks,
      })
      if (insertErr) throw new Error('지원서 제출 실패: ' + insertErr.message)
      setStep('done')
    } catch (err: any) { setError(err.message) }
    setSubmitting(false)
  }

  function addPortfolioFiles(filesList: FileList | null) {
    if (!filesList) return
    const newFiles = Array.from(filesList)
    const oversized = newFiles.filter((f) => f.size > MAX_FILE_SIZE)
    if (oversized.length > 0) {
      setError(`${oversized.map((f) => f.name).join(', ')} 파일이 50MB 를 초과합니다. Drive 링크를 이용해주세요.`)
      return
    }
    setError('')
    setPortfolioFiles((prev) => [...prev, ...newFiles])
  }

  function removePortfolioFile(idx: number) {
    setPortfolioFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function addPortfolioLink() {
    setPortfolioLinks((prev) => [...prev, { url: '', label: '' }])
  }

  function updatePortfolioLink(idx: number, key: 'url' | 'label', value: string) {
    setPortfolioLinks((prev) => prev.map((l, i) => i === idx ? { ...l, [key]: value } : l))
  }

  function removePortfolioLink(idx: number) {
    setPortfolioLinks((prev) => prev.filter((_, i) => i !== idx))
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
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {isAgency ? '후보자 추천이 완료되었습니다!' : '지원이 완료되었습니다!'}
          </h1>
          <p className="text-gray-500">
            {isAgency
              ? `${form.agency_name} 담당자님, 후보자 ${form.name}님의 추천이 접수되었습니다. 사전질의서 링크가 후보자 이메일로 발송될 예정입니다.`
              : `${form.name}님, 지원해주셔서 감사합니다. 검토 후 별도로 연락드리겠습니다.`}
          </p>
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
            <h2 className="text-lg font-semibold text-gray-900">
              {isAgency ? '후보자 추천 (파견/헤드헌터)' : '지원서 작성'}
            </h2>

            {isAgency && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                파견업체/헤드헌터를 통한 후보자 추천입니다. 후보자 정보와 함께 업체 정보를 입력해주세요.
              </div>
            )}

            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

            {/* 파견업체 정보 (agency/headhunter일 때만) */}
            {isAgency && (
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
                <p className="text-sm font-semibold text-gray-700">업체 정보</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">업체명 *</label>
                  <input type="text" value={form.agency_name} onChange={(e) => updateForm('agency_name', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none" placeholder="파견업체/헤드헌팅 회사명" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">담당자명 *</label>
                    <input type="text" value={form.agency_contact} onChange={(e) => updateForm('agency_contact', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none" placeholder="담당자 이름" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">담당자 이메일 *</label>
                    <input type="email" value={form.agency_email} onChange={(e) => updateForm('agency_email', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none" placeholder="agency@company.com" required />
                  </div>
                </div>
              </div>
            )}

            <p className="text-sm font-semibold text-gray-700">{isAgency ? '후보자 정보' : ''}</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isAgency ? '후보자 이름' : '이름'} *</label>
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
                  {resumeFile ? <span className="text-sm font-medium text-brand-600">{resumeFile.name}</span> : <span className="text-sm text-gray-500">파일을 선택하거나 드래그하세요 (50MB 이하)</span>}
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

            {/* 포트폴리오 섹션 — 다중 파일 + 외부 링크 */}
            <div className="border-t border-gray-100 pt-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">포트폴리오 (선택)</label>
              <p className="text-xs text-gray-500 mb-3">
                디자이너·콘텐츠 직무는 여러 작품을 첨부할 수 있습니다. 50MB 초과 파일은 Google Drive 등 외부 링크로 등록해주세요.
              </p>

              {/* 파일 목록 */}
              {portfolioFiles.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {portfolioFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <FolderUp className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="text-sm text-emerald-900 truncate flex-1">{f.name}</span>
                      <span className="text-[10px] text-emerald-600 shrink-0">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button type="button" onClick={() => removePortfolioFile(i)} className="text-emerald-700 hover:text-emerald-900 shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 파일 추가 */}
              <label className="flex items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 cursor-pointer hover:border-brand-400 transition-colors mb-3">
                <Upload className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">파일 추가 (PDF, 이미지, ZIP — 여러 개 선택 가능)</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.zip,.ai,.psd"
                  multiple
                  className="hidden"
                  onChange={(e) => addPortfolioFiles(e.target.files)}
                />
              </label>

              {/* 외부 링크 */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600">🔗 외부 링크 (Google Drive, Behance, Notion 등)</p>
                {portfolioLinks.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-gray-400 shrink-0" />
                    <input
                      type="text"
                      value={l.label}
                      onChange={(e) => updatePortfolioLink(i, 'label', e.target.value)}
                      className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
                      placeholder="제목 (예: 포트폴리오 1)"
                    />
                    <input
                      type="url"
                      value={l.url}
                      onChange={(e) => updatePortfolioLink(i, 'url', e.target.value)}
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
                      placeholder="https://drive.google.com/..."
                    />
                    <button type="button" onClick={() => removePortfolioLink(i)} className="text-gray-400 hover:text-red-500 shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addPortfolioLink}
                  className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
                >
                  <Plus className="h-4 w-4" /> 링크 추가
                </button>
              </div>
            </div>

            <button type="submit" disabled={submitting}
              className="w-full bg-brand-600 text-white rounded-lg py-3 font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> 제출 중...</> : isAgency ? '후보자 추천 제출' : '지원서 제출'}
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
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setStep('apply')}
              className="inline-flex items-center gap-2 bg-brand-600 text-white rounded-xl px-8 py-3.5 font-semibold text-base hover:bg-brand-700 transition-colors shadow-lg shadow-brand-600/20"
            >
              지원하기 <ChevronRight className="h-5 w-5" />
            </button>
            <button
              onClick={() => setAgencyGate(true)}
              className="inline-flex items-center gap-2 bg-white text-gray-700 border-2 border-gray-300 rounded-xl px-6 py-3 font-medium text-sm hover:border-brand-400 hover:text-brand-700 transition-colors"
            >
              <Building2 className="h-4 w-4" /> 파견업체 / 헤드헌터
            </button>
          </div>
        </div>

        {/* 파견업체 인증 게이트 */}
        {agencyGate && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
              <div className="text-center">
                <Building2 className="h-10 w-10 text-brand-600 mx-auto mb-2" />
                <h3 className="text-lg font-bold text-gray-900">파견업체 / 헤드헌터 입장</h3>
                <p className="text-sm text-gray-500 mt-1">업체 정보를 입력하시면 후보자 추천 페이지로 이동합니다.</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">업체명 *</label>
                  <input type="text" value={form.agency_name} onChange={(e) => updateForm('agency_name', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none" placeholder="파견업체 / 헤드헌팅 회사명" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">담당자명 *</label>
                  <input type="text" value={form.agency_contact} onChange={(e) => updateForm('agency_contact', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none" placeholder="담당자 이름" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">담당자 연락처 (이메일) *</label>
                  <input type="email" value={form.agency_email} onChange={(e) => updateForm('agency_email', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none" placeholder="agency@company.com" />
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setAgencyGate(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  취소
                </button>
                <button
                  onClick={() => {
                    if (!form.agency_name.trim() || !form.agency_contact.trim() || !form.agency_email.trim()) return
                    setAgencyConfirmed(true)
                    setAgencyGate(false)
                    setStep('apply')
                  }}
                  disabled={!form.agency_name.trim() || !form.agency_contact.trim() || !form.agency_email.trim()}
                  className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors">
                  입장하기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 하단 정보 */}
        <p className="text-xs text-gray-400 text-center pb-4">
          (주)인터오리진 · 채용 문의: {posting.contact_email || 'hr@interohrigin.com'}
        </p>
      </div>
    </div>
  )
}
