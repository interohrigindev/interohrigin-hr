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
import { useAuth } from '@/hooks/useAuth'
import { Upload, FileCheck, X, Loader2 } from 'lucide-react'

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
  const [sourceDetail, setSourceDetail] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [dragOver, setDragOver] = useState<'resume' | 'cover' | null>(null)

  const resumeInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

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
    setName(''); setEmail(''); setPhone(''); setSourceDetail('')
    setResumeFile(null); setCoverFile(null)
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
          source_channel: 'manual_upload',
          source_detail: sourceDetail.trim() || null,
          status: 'applied',
        })
        .select()
        .single()
      if (insertErr || !candidate) throw new Error(insertErr?.message || '지원자 등록 실패')

      // 3) Storage 업로드 (이력서)
      const resumeExt = resumeFile.name.split('.').pop() || 'pdf'
      const resumePath = `${jobPostingId}/${candidate.id}/resume.${resumeExt}`
      const { error: resumeErr } = await supabase.storage
        .from('recruitment-files')
        .upload(resumePath, resumeFile, { upsert: true, contentType: resumeFile.type })
      if (resumeErr) throw new Error('이력서 업로드 실패: ' + resumeErr.message)
      const { data: resumeUrl } = supabase.storage.from('recruitment-files').getPublicUrl(resumePath)

      // 4) Storage 업로드 (자소서, 선택)
      let coverUrl: string | null = null
      let coverFilename: string | null = null
      if (coverFile) {
        const coverExt = coverFile.name.split('.').pop() || 'pdf'
        const coverPath = `${jobPostingId}/${candidate.id}/cover-letter.${coverExt}`
        const { error: coverErr } = await supabase.storage
          .from('recruitment-files')
          .upload(coverPath, coverFile, { upsert: true, contentType: coverFile.type })
        if (coverErr) throw new Error('자기소개서 업로드 실패: ' + coverErr.message)
        const { data: cu } = supabase.storage.from('recruitment-files').getPublicUrl(coverPath)
        coverUrl = cu.publicUrl
        coverFilename = coverFile.name
      }

      // 5) candidates 행에 URL/filename 업데이트
      await supabase.from('candidates').update({
        resume_url: resumeUrl.publicUrl,
        resume_filename: resumeFile.name,
        cover_letter_url: coverUrl,
        cover_letter_filename: coverFilename,
      }).eq('id', candidate.id)

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
            <Input label="출처 (선택)" value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} placeholder="지인 추천, 이메일 직접 등" />
          </div>
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
