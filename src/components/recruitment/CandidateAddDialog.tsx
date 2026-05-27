/**
 * 외부 이력서·자기소개서 업로드로 지원자 직접 등록 모달
 * - 채용공고 선택 + 이름·이메일 + 이력서/자소서 파일 업로드
 * - 등록 후 status='applied' 로 시작 → 다른 외부 지원자와 동일한 채용 프로세스 진입
 */
import { useState, useRef, useMemo, useEffect } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { safeStorageUpload, describeUploadError } from '@/lib/storage-upload'
import { sanitizeStorageKey } from '@/lib/candidate-storage'
import { useAuth } from '@/hooks/useAuth'
import { SOURCE_CHANNEL_LABELS } from '@/lib/recruitment-constants'
import type { SourceChannel } from '@/types/recruitment'
import { Upload, FileCheck, X, Loader2, Link2, Plus } from 'lucide-react'

interface JobPostingOption { id: string; title: string; status: string }

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: () => void
  defaultJobPostingId?: string
}

const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ALLOWED_EXT = ['.pdf', '.doc', '.docx']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export function CandidateAddDialog({ open, onClose, onCreated, defaultJobPostingId }: Props) {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [jobs, setJobs] = useState<JobPostingOption[]>([])
  const [jobPostingId, setJobPostingId] = useState(defaultJobPostingId || '')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  // 유입 경로 — 담당자가 수동 추가 시에도 어느 채널로 들어온 지원자인지 선택
  const [sourceChannel, setSourceChannel] = useState<SourceChannel>('direct')
  const [sourceDetail, setSourceDetail] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  // 포트폴리오 파일 (다중) + 링크 (label + url)
  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([])
  const [portfolioLinks, setPortfolioLinks] = useState<{ label: string; url: string }[]>([])
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dragOver, setDragOver] = useState<'resume' | 'cover' | 'portfolio' | null>(null)

  const resumeInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const portfolioInputRef = useRef<HTMLInputElement>(null)

  // 활성 채용공고 로드
  useEffect(() => {
    if (!open) return
    supabase.from('job_postings')
      .select('id, title, status')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .then(({ data }) => setJobs((data as JobPostingOption[]) || []))
  }, [open])

  function reset() {
    setJobPostingId(defaultJobPostingId || '')
    setName(''); setEmail(''); setPhone(''); setSourceChannel('direct'); setSourceDetail('')
    setResumeFile(null); setCoverFile(null)
    setPortfolioFiles([]); setPortfolioLinks([])
    setLinkLabel(''); setLinkUrl('')
    setSubmitting(false)
  }

  function handleClose() {
    if (submitting) return
    reset()
    onClose()
  }

  function validateFile(file: File): string | null {
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
    if (!ALLOWED_EXT.includes(ext) && !ALLOWED_MIME.includes(file.type)) {
      return 'PDF, DOC, DOCX 파일만 업로드 가능합니다.'
    }
    if (file.size > MAX_SIZE) {
      return '파일 크기는 10MB 이하여야 합니다.'
    }
    return null
  }

  function handleFileSelect(file: File | null, kind: 'resume' | 'cover') {
    if (!file) return
    const err = validateFile(file)
    if (err) { toast(err, 'error'); return }
    if (kind === 'resume') setResumeFile(file)
    else setCoverFile(file)
  }

  function handleDrop(e: React.DragEvent, kind: 'resume' | 'cover') {
    e.preventDefault()
    setDragOver(null)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file, kind)
  }

  // ── 포트폴리오 파일 (다중, 50MB 까지, 확장자 제한 없음) ──────────────
  const PORTFOLIO_MAX_SIZE = 50 * 1024 * 1024
  function handlePortfolioSelect(files: FileList | File[] | null) {
    if (!files) return
    const arr = Array.from(files)
    const accepted: File[] = []
    for (const f of arr) {
      if (f.size > PORTFOLIO_MAX_SIZE) {
        toast(`${f.name} — 50MB 초과로 건너뜀`, 'error')
        continue
      }
      accepted.push(f)
    }
    if (accepted.length === 0) return
    setPortfolioFiles((prev) => [...prev, ...accepted])
  }

  function handlePortfolioDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(null)
    if (e.dataTransfer.files?.length) handlePortfolioSelect(e.dataTransfer.files)
  }

  function removePortfolioFile(idx: number) {
    setPortfolioFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── 포트폴리오 링크 ──────────────────────────────────────────────
  function addPortfolioLink() {
    const url = linkUrl.trim()
    if (!url) {
      toast('링크 URL을 입력하세요.', 'error')
      return
    }
    // 간단 URL 검증 (http(s) 시작)
    if (!/^https?:\/\//i.test(url)) {
      toast('http:// 또는 https:// 로 시작하는 URL을 입력하세요.', 'error')
      return
    }
    setPortfolioLinks((prev) => [...prev, { label: linkLabel.trim() || '링크', url }])
    setLinkLabel('')
    setLinkUrl('')
  }

  function removePortfolioLink(idx: number) {
    setPortfolioLinks((prev) => prev.filter((_, i) => i !== idx))
  }

  const canSubmit = useMemo(() => (
    !!jobPostingId && !!name.trim() && !!email.trim() && !!resumeFile && !submitting
  ), [jobPostingId, name, email, resumeFile, submitting])

  async function handleSubmit() {
    if (!canSubmit || !resumeFile) return
    if (!profile?.id) { toast('로그인이 필요합니다.', 'error'); return }
    setSubmitting(true)

    try {
      // 1) 중복 검사 (같은 채용공고 + 동일 이메일)
      const { data: existing } = await supabase
        .from('candidates')
        .select('id, name')
        .eq('job_posting_id', jobPostingId)
        .eq('email', email.trim())
        .maybeSingle()
      if (existing) {
        if (!confirm(`'${existing.name}'님이 이미 같은 공고에 등록되어 있습니다. 그래도 새로 등록할까요?`)) {
          setSubmitting(false)
          return
        }
      }

      // 2) candidates 행 먼저 생성 → ID 확보 후 Storage 경로에 사용
      const { data: candidate, error: insertErr } = await supabase
        .from('candidates')
        .insert({
          job_posting_id: jobPostingId,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          // 담당자가 선택한 채널 (기본 direct) — 면접 시 공유 페이지에서 유입경로로 노출
          source_channel: sourceChannel,
          source_detail: sourceDetail.trim() || null,
          status: 'applied',
        })
        .select()
        .single()
      if (insertErr || !candidate) throw new Error(insertErr?.message || '지원자 등록 실패')

      // 3) Storage 업로드 (이력서) — resumes 버킷 (공개 지원 흐름과 동일하게 통일)
      //    저장 형식: 상대 PATH 만 candidates.resume_url 에 저장.
      //    candidate-report.tsx 가 자동으로 createSignedUrl 로 변환해서 표시.
      const resumeExt = resumeFile.name.split('.').pop() || 'pdf'
      const resumePath = `${jobPostingId}/${candidate.id}/resume.${resumeExt}`
      const { error: resumeErr } = await safeStorageUpload('resumes', resumePath, resumeFile, {
        upsert: true,
        contentType: resumeFile.type,
      })
      if (resumeErr) throw new Error('이력서 업로드 실패: ' + describeUploadError(resumeErr))

      // 4) Storage 업로드 (자소서, 선택)
      let coverPath: string | null = null
      let coverFilename: string | null = null
      if (coverFile) {
        const coverExt = coverFile.name.split('.').pop() || 'pdf'
        coverPath = `${jobPostingId}/${candidate.id}/cover-letter.${coverExt}`
        const { error: coverErr } = await safeStorageUpload('resumes', coverPath, coverFile, {
          upsert: true,
          contentType: coverFile.type,
        })
        if (coverErr) throw new Error('자기소개서 업로드 실패: ' + describeUploadError(coverErr))
        coverFilename = coverFile.name
      }

      // 5) 포트폴리오 파일 업로드 (선택) — candidate-report 와 동일 경로 패턴 사용
      //    candidates.portfolio_files: [{ path, filename, size }]
      const uploadedPortfolioFiles: { path: string; filename: string; size: number }[] = []
      for (const f of portfolioFiles) {
        const safeName = sanitizeStorageKey(f.name)
        const path = `portfolios/${candidate.id}/${Date.now()}_${safeName}`
        const { error: pfErr } = await safeStorageUpload('resumes', path, f, {
          upsert: false,
          contentType: f.type || undefined,
        })
        if (pfErr) {
          // 한 개 실패해도 나머지는 계속 진행 + 사용자에게 알림
          toast(`포트폴리오 "${f.name}" 업로드 실패: ${describeUploadError(pfErr)}`, 'error')
          continue
        }
        uploadedPortfolioFiles.push({ path, filename: f.name, size: f.size })
      }

      // 6) candidates 행에 PATH/filename + 포트폴리오 업데이트
      await supabase.from('candidates').update({
        resume_url: resumePath,
        resume_filename: resumeFile.name,
        cover_letter_url: coverPath,
        cover_letter_filename: coverFilename,
        portfolio_files: uploadedPortfolioFiles.length > 0 ? uploadedPortfolioFiles : null,
        portfolio_links: portfolioLinks.length > 0 ? portfolioLinks : null,
      } as any).eq('id', candidate.id)

      toast(`${name.trim()}님이 지원자로 등록되었습니다.`, 'success')
      onCreated?.()
      handleClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      toast('등록 실패: ' + msg, 'error')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="지원자 추가 (외부 이력서 등록)" className="max-w-xl">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto">
        <p className="text-sm text-gray-500">
          외부에서 받은 이력서·자기소개서 파일을 업로드하면 해당 채용공고에 일반 지원자로 등록됩니다.
          이후 진행 절차는 다른 지원자와 동일합니다.
        </p>

        {/* 채용공고 */}
        <Select
          label="채용공고 *"
          value={jobPostingId}
          onChange={(e) => setJobPostingId(e.target.value)}
          options={[
            { value: '', label: '선택하세요' },
            ...jobs.map((j) => ({ value: j.id, label: j.title })),
          ]}
        />
        {jobs.length === 0 && (
          <p className="text-xs text-amber-600">진행 중인 채용공고가 없습니다. 먼저 새 공고를 등록하세요.</p>
        )}

        {/* 기본 정보 */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">기본 정보</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="이름 *" value={name} onChange={(e) => setName(e.target.value)} placeholder="김민지" />
            <Input label="이메일 *" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="연락처 (선택)" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" />
            <Select
              label="유입 경로 *"
              value={sourceChannel}
              onChange={(e) => setSourceChannel(e.target.value as SourceChannel)}
              options={(Object.entries(SOURCE_CHANNEL_LABELS) as [SourceChannel, string][])
                .map(([v, l]) => ({ value: v, label: l }))}
            />
          </div>
          <Input
            label="출처 상세 (선택)"
            value={sourceDetail}
            onChange={(e) => setSourceDetail(e.target.value)}
            placeholder={
              sourceChannel === 'headhunter' ? '예: ○○ 헤드헌팅 - 김XX 매니저'
              : sourceChannel === 'referral' ? '예: 디자인팀 홍길동 추천'
              : sourceChannel === 'university' ? '예: ○○대 진로상담센터'
              : sourceChannel === 'agency' ? '예: ○○ 파견업체'
              : sourceChannel === 'job_korea' ? '예: 잡코리아 일반 공고'
              : sourceChannel === 'direct' ? '예: 사람인 / 링크드인 / 인스타그램 등 — 구체 채널'
              : '필요 시 자세한 출처를 입력하세요'
            }
          />
          <p className="text-[11px] text-gray-400">유입 경로는 면접 시 공유 페이지에 표시됩니다.</p>
        </div>

        {/* 첨부 파일 */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">첨부 파일</p>

          {/* 이력서 */}
          <FileDropZone
            label="이력서 *"
            file={resumeFile}
            dragOver={dragOver === 'resume'}
            onDragOver={(e) => { e.preventDefault(); setDragOver('resume') }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => handleDrop(e, 'resume')}
            onClick={() => resumeInputRef.current?.click()}
            onClear={() => setResumeFile(null)}
          />
          <input
            ref={resumeInputRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0] || null, 'resume')}
          />

          {/* 자기소개서 (선택) */}
          <FileDropZone
            label="자기소개서 (선택)"
            file={coverFile}
            dragOver={dragOver === 'cover'}
            onDragOver={(e) => { e.preventDefault(); setDragOver('cover') }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => handleDrop(e, 'cover')}
            onClick={() => coverInputRef.current?.click()}
            onClear={() => setCoverFile(null)}
          />
          <input
            ref={coverInputRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0] || null, 'cover')}
          />

          <p className="text-[11px] text-gray-400">PDF, DOC, DOCX (10MB 이하)</p>
        </div>

        {/* 포트폴리오 (선택) */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">포트폴리오 (선택)</p>

          {/* 포트폴리오 파일 (다중) */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">포트폴리오 파일</p>
            {portfolioFiles.length > 0 && (
              <ul className="space-y-1.5 mb-2">
                {portfolioFiles.map((f, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="text-sm text-emerald-900 truncate">{f.name}</span>
                      <span className="text-[10px] text-emerald-600 shrink-0">({(f.size / 1024).toFixed(0)}KB)</span>
                    </div>
                    <button onClick={() => removePortfolioFile(i)} className="text-emerald-600 hover:text-emerald-800 shrink-0 ml-2" type="button">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div
              onClick={() => portfolioInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver('portfolio') }}
              onDragLeave={() => setDragOver(null)}
              onDrop={handlePortfolioDrop}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                dragOver === 'portfolio'
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-gray-100'
              }`}
            >
              <Upload className={`h-6 w-6 mx-auto mb-1 ${dragOver === 'portfolio' ? 'text-brand-600' : 'text-gray-400'}`} />
              <p className={`text-sm ${dragOver === 'portfolio' ? 'text-brand-700 font-medium' : 'text-gray-600'}`}>
                여러 파일 끌어다 놓거나 <span className="text-brand-600 font-medium">클릭해 업로드</span>
              </p>
              <p className="text-[11px] text-gray-400 mt-1">파일 형식 무관 · 개당 최대 50MB</p>
            </div>
            <input
              ref={portfolioInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handlePortfolioSelect(e.target.files)}
            />
          </div>

          {/* 포트폴리오 링크 */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">포트폴리오 링크</p>
            {portfolioLinks.length > 0 && (
              <ul className="space-y-1.5 mb-2">
                {portfolioLinks.map((l, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link2 className="h-4 w-4 text-brand-600 shrink-0" />
                      <span className="text-sm font-medium text-brand-900 truncate">{l.label}</span>
                      <a href={l.url} target="_blank" rel="noreferrer" className="text-xs text-brand-700 truncate hover:underline">
                        {l.url}
                      </a>
                    </div>
                    <button onClick={() => removePortfolioLink(i)} className="text-brand-600 hover:text-brand-800 shrink-0 ml-2" type="button">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2">
              <Input
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="라벨 (예: Behance)"
              />
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPortfolioLink() } }}
              />
              <Button variant="outline" onClick={addPortfolioLink} type="button">
                <Plus className="h-4 w-4 mr-1" /> 추가
              </Button>
            </div>
          </div>
        </div>

        {/* 액션 */}
        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>취소</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 등록 중...</> : '지원자 등록'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function FileDropZone({
  label, file, dragOver, onDragOver, onDragLeave, onDrop, onClick, onClear,
}: {
  label: string
  file: File | null
  dragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onClick: () => void
  onClear: () => void
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-700 mb-1">{label}</p>
      {file ? (
        <div className="flex items-center justify-between px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            <FileCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-sm text-emerald-900 truncate">{file.name}</span>
            <span className="text-[10px] text-emerald-600 shrink-0">({(file.size / 1024).toFixed(0)}KB)</span>
          </div>
          <button onClick={onClear} className="text-emerald-600 hover:text-emerald-800 shrink-0 ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={onClick}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-brand-500 bg-brand-50'
              : 'border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-gray-100'
          }`}
        >
          <Upload className={`h-7 w-7 mx-auto mb-1.5 ${dragOver ? 'text-brand-600' : 'text-gray-400'}`} />
          <p className={`text-sm ${dragOver ? 'text-brand-700 font-medium' : 'text-gray-600'}`}>
            끌어다 놓거나 <span className="text-brand-600 font-medium">클릭해 업로드</span>
          </p>
        </div>
      )}
    </div>
  )
}

// useAuth 사용 시 unused import 방지
export const _ = Spinner
