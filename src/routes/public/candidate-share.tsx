import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, FileText, Mail, Phone, Briefcase, Calendar, AlertCircle, CheckCircle2, Download, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

type ShareData = {
  candidate: {
    id: string
    name: string
    email: string
    phone: string | null
    status: string
    source_channel: string | null
    resume_url: string | null
    cover_letter_text: string | null
    cover_letter_url: string | null
    pre_survey_data: any
    metadata: any
    interviewer_comments: any
    created_at: string
  }
  job: { id: string; title: string; department: string | null; job_type: string | null } | null
  resume_analysis: {
    ai_summary: string | null
    strengths: any
    weaknesses: any
    position_fit: number | null
    organization_fit: number | null
    recommendation: string | null
  } | null
  interview_schedules: Array<{
    id: string
    scheduled_at: string
    interview_type: string
    interviewer_ids: any
    notes?: string | null
  }>
}

const STATUS_LABELS: Record<string, string> = {
  applied: '접수 완료',
  resume_reviewed: '서류 검토 완료',
  survey_sent: '사전 질의서 발송',
  survey_done: '사전 질의서 완료',
  interview_scheduled: '면접 예정',
  video_done: '화상 면접 완료',
  face_to_face_done: '대면 면접 완료',
  processing: '검토 중',
  analyzed: 'AI 분석 완료',
  decided: '결정 완료',
  hired: '채용 확정',
  rejected: '불합격',
}

type FileInfo = { url: string; filename: string }

export default function CandidateSharePage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ShareData | null>(null)
  const [resumeFile, setResumeFile] = useState<FileInfo | null>(null)
  const [coverLetterFile, setCoverLetterFile] = useState<FileInfo | null>(null)

  useEffect(() => {
    if (!token) {
      setError('잘못된 링크입니다')
      setLoading(false)
      return
    }
    ;(async () => {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_shared_candidate', { p_token: token })
      if (rpcErr) {
        setError(rpcErr.message || '링크를 열 수 없습니다')
        setLoading(false)
        return
      }
      const sd = rpcData as ShareData
      setData(sd)
      setLoading(false)

      // 이력서/자기소개서 signed URL 가져오기 (있는 경우만)
      if (sd?.candidate?.resume_url) {
        try {
          const r = await fetch(`/api/share-file?token=${encodeURIComponent(token)}&kind=resume`)
          if (r.ok) setResumeFile(await r.json())
        } catch { /* 무시 */ }
      }
      if (sd?.candidate?.cover_letter_url) {
        try {
          const r = await fetch(`/api/share-file?token=${encodeURIComponent(token)}&kind=cover_letter`)
          if (r.ok) setCoverLetterFile(await r.json())
        } catch { /* 무시 */ }
      }
    })()
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white border border-red-200 rounded-2xl shadow-sm p-8 max-w-md text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900 mb-2">열람할 수 없습니다</h1>
          <p className="text-sm text-gray-600">{error || '링크가 만료되었거나 비활성화되었습니다.'}</p>
        </div>
      </div>
    )
  }

  const { candidate, job, resume_analysis, interview_schedules } = data

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-brand-600 to-brand-500 rounded-2xl shadow-sm p-6 text-white mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs text-brand-100 mb-1">INTEROHRIGIN · 지원자 정보 (외부 공유)</p>
              <h1 className="text-2xl font-bold">{candidate.name}</h1>
            </div>
            <span className="bg-white/20 text-white text-xs px-3 py-1 rounded-full whitespace-nowrap">
              {STATUS_LABELS[candidate.status] || candidate.status}
            </span>
          </div>
        </div>

        {/* 지원 공고 */}
        {job && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <div className="flex items-start gap-3">
              <Briefcase className="h-5 w-5 text-brand-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-400 mb-0.5">지원 포지션</p>
                <p className="text-base font-bold text-gray-900">{job.title}</p>
                {job.department && <p className="text-sm text-gray-600">{job.department}</p>}
              </div>
            </div>
          </div>
        )}

        {/* 연락처 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 space-y-3">
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-700">{candidate.email}</span>
          </div>
          {candidate.phone && (
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-700">{candidate.phone}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-700">접수일 {formatDate(candidate.created_at)}</span>
          </div>
        </div>

        {/* AI 분석 요약 */}
        {resume_analysis && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-brand-500" />
              AI 분석 요약
            </h2>
            {resume_analysis.ai_summary && (
              <p className="text-sm text-gray-700 leading-relaxed mb-3 whitespace-pre-line">{resume_analysis.ai_summary}</p>
            )}
            <div className="grid grid-cols-2 gap-3 mb-3">
              {resume_analysis.position_fit !== null && (
                <div className="bg-brand-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">포지션 적합도</p>
                  <p className="text-xl font-bold text-brand-700">{resume_analysis.position_fit}<span className="text-sm font-normal">/100</span></p>
                </div>
              )}
              {resume_analysis.organization_fit !== null && (
                <div className="bg-brand-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">조직 적합도</p>
                  <p className="text-xl font-bold text-brand-700">{resume_analysis.organization_fit}<span className="text-sm font-normal">/100</span></p>
                </div>
              )}
            </div>
            {Array.isArray(resume_analysis.strengths) && resume_analysis.strengths.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-semibold text-emerald-700 mb-1">강점</p>
                <ul className="text-sm text-gray-700 space-y-0.5">
                  {resume_analysis.strengths.map((s: any, i: number) => (
                    <li key={i} className="flex gap-1.5">·<span>{typeof s === 'string' ? s : s?.text || s?.title}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(resume_analysis.weaknesses) && resume_analysis.weaknesses.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-700 mb-1">보완 필요</p>
                <ul className="text-sm text-gray-700 space-y-0.5">
                  {resume_analysis.weaknesses.map((w: any, i: number) => (
                    <li key={i} className="flex gap-1.5">·<span>{typeof w === 'string' ? w : w?.text || w?.title}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 이력서 (인라인 미리보기) */}
        {(candidate.resume_url || resumeFile) && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-500" />
                이력서
              </h2>
              {resumeFile && (
                <div className="flex items-center gap-2">
                  <a href={resumeFile.url} download={resumeFile.filename}
                     className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                    <Download className="h-3.5 w-3.5" /> 다운로드
                  </a>
                  <a href={resumeFile.url} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600">
                    <ExternalLink className="h-3.5 w-3.5" /> 새 탭
                  </a>
                </div>
              )}
            </div>
            <FilePreview file={resumeFile} />
          </div>
        )}

        {/* 자기소개 */}
        {(candidate.cover_letter_text || candidate.cover_letter_url) && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-500" />
                자기소개
              </h2>
              {coverLetterFile && (
                <div className="flex items-center gap-2">
                  <a href={coverLetterFile.url} download={coverLetterFile.filename}
                     className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                    <Download className="h-3.5 w-3.5" /> 다운로드
                  </a>
                  <a href={coverLetterFile.url} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600">
                    <ExternalLink className="h-3.5 w-3.5" /> 새 탭
                  </a>
                </div>
              )}
            </div>
            {candidate.cover_letter_text && (
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed mb-3">{candidate.cover_letter_text}</p>
            )}
            {coverLetterFile && <FilePreview file={coverLetterFile} />}
          </div>
        )}

        {/* 면접 일정 */}
        {interview_schedules.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-brand-500" />
              면접 일정
            </h2>
            <ul className="space-y-2">
              {interview_schedules.map((s) => (
                <li key={s.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">
                      {s.interview_type === 'video' ? '화상 면접' : '대면 면접'}
                    </span>
                    <span className="text-xs text-gray-500">{formatDate(s.scheduled_at)}</span>
                  </div>
                  {s.notes && <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{s.notes}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 면접관 코멘트 */}
        {Array.isArray(candidate.interviewer_comments) && candidate.interviewer_comments.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <h2 className="text-base font-bold text-gray-900 mb-3">면접관 코멘트</h2>
            <ul className="space-y-2">
              {candidate.interviewer_comments.map((c: any, i: number) => (
                <li key={i} className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                  {c?.text || c?.comment || JSON.stringify(c)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          이 페이지는 외부 공유 링크입니다. 외부 유출 및 재공유를 금지합니다.
        </p>
      </div>
    </div>
  )
}

// 파일 인라인 미리보기 — PDF iframe / 이미지 / 그 외 다운로드 안내
function FilePreview({ file }: { file: FileInfo | null }) {
  if (!file) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-xs text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
        파일을 불러오는 중...
      </div>
    )
  }
  const ext = (file.filename.split('.').pop() || '').toLowerCase()
  const isPdf = ext === 'pdf'
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)
  if (isPdf) {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
        <iframe src={file.url} title={file.filename} className="w-full h-[600px]" />
      </div>
    )
  }
  if (isImage) {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 text-center">
        <img src={file.url} alt={file.filename} className="max-w-full max-h-[600px] mx-auto" loading="lazy" />
      </div>
    )
  }
  // 미리보기 불가 (HWP/DOC/etc)
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
      <FileText className="h-8 w-8 text-gray-400 mx-auto mb-2" />
      <p className="text-sm text-gray-600 mb-1">{file.filename}</p>
      <p className="text-xs text-gray-400 mb-3">이 형식은 브라우저에서 미리보기를 지원하지 않습니다. 다운로드 후 확인해주세요.</p>
      <a href={file.url} download={file.filename}
         className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline">
        <Download className="h-3.5 w-3.5" /> 다운로드
      </a>
    </div>
  )
}
