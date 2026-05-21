import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Loader2, FileText, Mail, Phone, Briefcase, Calendar, AlertCircle, CheckCircle2,
  Download, ExternalLink, MessageCircle, Sparkles, Link2, FolderOpen,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

interface PortfolioFile { path: string; filename: string; size?: number }
interface PortfolioLink { url: string; label: string }
interface InterviewerComment { author_id?: string; author_name?: string; content?: string; created_at?: string; text?: string; comment?: string }

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
    portfolio_files: PortfolioFile[] | null
    portfolio_links: PortfolioLink[] | null
    pre_survey_data: { answers?: Record<string, string>; meta?: Record<string, string>; completed_at?: string } | null
    pre_survey_analysis: { survey_insights?: string } | null
    metadata: any
    interviewer_comments: InterviewerComment[] | null
    talent_match_score: number | null
    pbd_survey_sent_at: string | null
    pbd_survey_completed_at: string | null
    second_interview_questions: string[] | null
    second_interview_questions_generated_at: string | null
    interview_answers: Record<string, string> | null
    created_at: string
  }
  job: {
    id: string
    title: string
    department: string | null
    job_type: string | null
    ai_questions: string[] | null
  } | null
  survey_template: { questions?: { id: string; question: string; type: string; required?: boolean }[] } | null
  pbd_response: any
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
  face_to_face_scheduled: '대면 면접 예정',
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
  const [portfolioSignedUrls, setPortfolioSignedUrls] = useState<Record<number, FileInfo>>({})
  const [surveyQuestions, setSurveyQuestions] = useState<{ id: string; question: string }[]>([])
  const [fallbackAiQuestions, setFallbackAiQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [savingAnswerKey, setSavingAnswerKey] = useState<string | null>(null)
  const [answerError, setAnswerError] = useState<string | null>(null)

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
      // 저장된 답변 동기화
      if (sd?.candidate?.interview_answers && typeof sd.candidate.interview_answers === 'object') {
        setAnswers(sd.candidate.interview_answers as Record<string, string>)
      }

      // 이력서/자기소개서
      if (sd?.candidate?.resume_url) {
        try {
          const r = await fetch(`/api/share-file?token=${encodeURIComponent(token)}&kind=resume`)
          if (r.ok) setResumeFile(await r.json())
        } catch { /* ignore */ }
      }
      if (sd?.candidate?.cover_letter_url) {
        try {
          const r = await fetch(`/api/share-file?token=${encodeURIComponent(token)}&kind=cover_letter`)
          if (r.ok) setCoverLetterFile(await r.json())
        } catch { /* ignore */ }
      }
      // 포트폴리오 파일 — 각 index 별 signed URL
      const pfList = sd?.candidate?.portfolio_files || []
      if (pfList.length > 0) {
        const urls: Record<number, FileInfo> = {}
        for (let i = 0; i < pfList.length; i++) {
          try {
            const r = await fetch(`/api/share-file?token=${encodeURIComponent(token)}&kind=portfolio&index=${i}`)
            if (r.ok) urls[i] = await r.json()
          } catch { /* ignore */ }
        }
        setPortfolioSignedUrls(urls)
      }

      // AI 면접 질문 fallback — RPC 가 113 마이그레이션 미실행으로 ai_questions 를 안 줄 때
      // job_postings 를 직접 조회 (RLS 통과: 임원/대표/관리자만 RPC 통과했으므로 이미 인증됨)
      const aiQs = (sd?.job as any)?.ai_questions
      if ((!Array.isArray(aiQs) || aiQs.length === 0) && sd?.job?.id) {
        try {
          const { data: jp } = await supabase
            .from('job_postings')
            .select('ai_questions')
            .eq('id', sd.job.id)
            .maybeSingle()
          if (jp?.ai_questions && Array.isArray(jp.ai_questions)) {
            setFallbackAiQuestions(jp.ai_questions as string[])
          }
        } catch { /* ignore */ }
      }

      // 사전질의서 질문 — survey_template 우선, 누락 시 전체 템플릿 fallback
      const answerIds = Object.keys(sd?.candidate?.pre_survey_data?.answers || {})
      if (answerIds.length > 0) {
        let qs = (sd.survey_template?.questions || []) as { id: string; question: string }[]
        const matched = new Set(qs.map((q) => q.id))
        const missing = answerIds.filter((id) => !matched.has(id))
        if (missing.length > 0) {
          const { data: allTmpls } = await supabase.from('pre_survey_templates').select('questions')
          if (allTmpls) {
            const extra: { id: string; question: string }[] = []
            for (const t of allTmpls as { questions: { id: string; question: string }[] }[]) {
              for (const q of (t.questions || [])) {
                if (missing.includes(q.id) && !extra.find((x) => x.id === q.id)) extra.push(q)
              }
            }
            qs = [...qs, ...extra]
          }
        }
        setSurveyQuestions(qs)
      }
    })()
  }, [token])

  function updateAnswerLocal(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  async function saveAnswer(key: string, value: string) {
    if (!token) return
    setSavingAnswerKey(key)
    setAnswerError(null)
    try {
      const { error } = await supabase.rpc('save_shared_interview_answer', {
        p_token: token,
        p_key: key,
        p_answer: value,
      })
      if (error) {
        setAnswerError(error.message || '답변 저장 실패')
      } else {
        const next: Record<string, string> = { ...answers }
        const trimmed = (value || '').trim()
        if (trimmed.length === 0) delete next[key]
        else next[key] = trimmed
        setAnswers(next)
      }
    } catch (err: any) {
      setAnswerError(err?.message || '답변 저장 실패')
    } finally {
      setSavingAnswerKey(null)
    }
  }

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
  const portfolioFiles = candidate.portfolio_files || []
  const portfolioLinks = candidate.portfolio_links || []
  const surveyAnswers = candidate.pre_survey_data?.answers || {}
  const surveyMeta = candidate.pre_survey_data?.meta || {}
  const interviewerComments = candidate.interviewer_comments || []
  // RPC 응답에 ai_questions 가 있으면 우선, 없으면 fallback (직접 조회) 사용
  const aiQuestions = (job?.ai_questions && job.ai_questions.length > 0)
    ? job.ai_questions
    : fallbackAiQuestions

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

        {/* 이력서 */}
        {(candidate.resume_url || resumeFile) && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-500" /> 이력서
              </h2>
              {resumeFile && (
                <FileActions file={resumeFile} />
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
                <FileText className="h-4 w-4 text-brand-500" /> 자기소개
              </h2>
              {coverLetterFile && <FileActions file={coverLetterFile} />}
            </div>
            {candidate.cover_letter_text && (
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed mb-3">{candidate.cover_letter_text}</p>
            )}
            {coverLetterFile && <FilePreview file={coverLetterFile} />}
          </div>
        )}

        {/* 포트폴리오 */}
        {(portfolioFiles.length > 0 || portfolioLinks.length > 0) && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-brand-500" /> 포트폴리오
            </h2>
            {portfolioFiles.length > 0 && (
              <div className="space-y-2 mb-3">
                <p className="text-xs font-semibold text-gray-500">파일 ({portfolioFiles.length}개)</p>
                {portfolioFiles.map((pf, idx) => {
                  const signed = portfolioSignedUrls[idx]
                  return (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="text-sm text-gray-700 truncate">{pf.filename}</span>
                          {pf.size && <span className="text-[10px] text-gray-400">{Math.round(pf.size / 1024)}KB</span>}
                        </div>
                        {signed && <FileActions file={signed} />}
                      </div>
                      {signed && <div className="mt-2"><FilePreview file={signed} /></div>}
                    </div>
                  )
                })}
              </div>
            )}
            {portfolioLinks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500">링크 ({portfolioLinks.length}개)</p>
                {portfolioLinks.map((pl, i) => (
                  <a key={i} href={pl.url} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 text-sm text-brand-600 hover:underline">
                    <Link2 className="h-3.5 w-3.5" />
                    {pl.label || pl.url}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 사전질의서 응답 */}
        {(Object.keys(surveyAnswers).length > 0 || Object.keys(surveyMeta).length > 0) && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-brand-500" /> 사전질의서 응답
            </h2>
            {Object.keys(surveyMeta).length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {surveyMeta.birth_date && <MetaItem label="생년월일" value={surveyMeta.birth_date} />}
                {surveyMeta.mbti && <MetaItem label="MBTI" value={surveyMeta.mbti} />}
                {surveyMeta.hanja_name && <MetaItem label="한자 이름" value={surveyMeta.hanja_name} />}
                {surveyMeta.blood_type && <MetaItem label="혈액형" value={`${surveyMeta.blood_type}형`} />}
              </div>
            )}
            {Object.keys(surveyAnswers).length > 0 && (
              <div className="space-y-3">
                {surveyQuestions.length > 0 ? (
                  surveyQuestions.map((q, i) => (
                    <div key={q.id} className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs font-medium text-gray-600 mb-1">Q{i + 1}. {q.question}</p>
                      <p className="text-sm text-gray-900 whitespace-pre-line">
                        {surveyAnswers[q.id] || <span className="text-gray-400 italic">미응답</span>}
                      </p>
                    </div>
                  ))
                ) : (
                  Object.entries(surveyAnswers).map(([qid, ans], i) => (
                    <div key={qid} className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs font-medium text-gray-600 mb-1">질문 {i + 1}</p>
                      <p className="text-sm text-gray-900 whitespace-pre-line">{ans}</p>
                    </div>
                  ))
                )}
              </div>
            )}
            {candidate.pre_survey_analysis?.survey_insights && (
              <div className="mt-3 p-3 bg-brand-50/50 border border-brand-100 rounded-lg">
                <p className="text-xs font-semibold text-brand-700 mb-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> AI 인사이트
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-line">{candidate.pre_survey_analysis.survey_insights}</p>
              </div>
            )}
          </div>
        )}

        {/* 권장 면접 질문 — 1차/2차 모두에서 항상 보임. 미생성 시 안내 표시 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-500" />
            AI 권장 면접 질문 {aiQuestions.length > 0 && `(${aiQuestions.length}개)`}
          </h2>
          {aiQuestions.length > 0 ? (
            <>
              <p className="text-xs text-gray-500 mb-3">면접 답변을 입력하면 자동 저장됩니다.</p>
              {answerError && (
                <p className="text-[11px] text-red-500 mb-2">{answerError}</p>
              )}
              <ol className="space-y-4">
                {aiQuestions.map((q, i) => {
                  const key = `ai:${i}`
                  return (
                    <li key={i} className="space-y-2">
                      <div className="flex gap-3 text-sm">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-bold">{i + 1}</span>
                        <span className="text-gray-700 pt-0.5 whitespace-pre-line">{q}</span>
                      </div>
                      <div className="pl-9 relative">
                        <textarea
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-y"
                          rows={2}
                          value={answers[key] || ''}
                          onChange={(e) => updateAnswerLocal(key, e.target.value)}
                          onBlur={(e) => {
                            const orig = ((data?.candidate?.interview_answers?.[key]) || '').trim()
                            const cur = (e.target.value || '').trim()
                            if (orig !== cur) saveAnswer(key, e.target.value)
                          }}
                          placeholder="면접 답변을 기재하세요 (입력란을 벗어나면 자동 저장)"
                        />
                        {savingAnswerKey === key && (
                          <span className="absolute right-2 top-2 text-[11px] text-gray-400 flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> 저장 중
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </>
          ) : (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              아직 AI 면접 질문이 생성되지 않았습니다. 관리자가 채용공고 상세 페이지에서 AI 질문을 생성하면 여기에 표시됩니다.
            </p>
          )}
        </div>

        {/* 2차 면접 맞춤 질문 — 1차 통과(video_done) / 2차 예정(face_to_face_scheduled) 단계에서만 노출 */}
        {(candidate.status === 'video_done' || candidate.status === 'face_to_face_scheduled') && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 border border-brand-200">
            <h2 className="text-base font-bold text-gray-900 mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600" />
              🎯 2차 면접 맞춤 질문
              {candidate.second_interview_questions && candidate.second_interview_questions.length > 0 &&
                ` (${candidate.second_interview_questions.length}개)`}
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              이 지원자의 이력서·사전질의·1차 면접 분석·면접관 코멘트를 종합한 <strong className="text-brand-700">맞춤 질문</strong>입니다.
            </p>
            {candidate.second_interview_questions && candidate.second_interview_questions.length > 0 ? (
              <>
                {candidate.second_interview_questions_generated_at && (
                  <p className="text-[11px] text-gray-400 mb-2">
                    마지막 생성: {formatDate(candidate.second_interview_questions_generated_at, 'yyyy.MM.dd HH:mm')}
                  </p>
                )}
                <ol className="space-y-4">
                  {candidate.second_interview_questions.map((q, i) => {
                    const key = `second:${i}`
                    return (
                      <li key={i} className="space-y-2">
                        <div className="flex gap-3 text-sm">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">{i + 1}</span>
                          <span className="text-gray-700 pt-0.5 whitespace-pre-line">{q}</span>
                        </div>
                        <div className="pl-9 relative">
                          <textarea
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-y"
                            rows={2}
                            value={answers[key] || ''}
                            onChange={(e) => updateAnswerLocal(key, e.target.value)}
                            onBlur={(e) => {
                              const orig = ((data?.candidate?.interview_answers?.[key]) || '').trim()
                              const cur = (e.target.value || '').trim()
                              if (orig !== cur) saveAnswer(key, e.target.value)
                            }}
                            placeholder="2차 면접 답변을 기재하세요 (자동 저장)"
                          />
                          {savingAnswerKey === key && (
                            <span className="absolute right-2 top-2 text-[11px] text-gray-400 flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" /> 저장 중
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </>
            ) : (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                아직 생성되지 않았습니다. 관리자가 지원자 상세 페이지에서 'AI 생성' 버튼을 누르면 여기에 표시됩니다.
              </p>
            )}
          </div>
        )}

        {/* 면접 일정 */}
        {interview_schedules.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-brand-500" />
              면접 일정 ({interview_schedules.length}건)
            </h2>
            <ul className="space-y-2">
              {interview_schedules.map((s) => (
                <li key={s.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-sm font-semibold text-gray-900">
                      {s.interview_type === 'video' ? '화상 면접' : '대면 면접'}
                    </span>
                    <span className="text-xs text-gray-500">{formatDate(s.scheduled_at, 'yyyy.MM.dd HH:mm')}</span>
                  </div>
                  {s.notes && <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{s.notes}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 면접관 코멘트 — 필드 정확 매칭: { author_name, content, created_at } */}
        {interviewerComments.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-brand-500" />
              면접관 코멘트 ({interviewerComments.length}건)
            </h2>
            <ul className="space-y-2">
              {interviewerComments.map((c, i) => {
                // 신규 구조 우선, 레거시 text/comment 폴백
                const body = c.content || c.text || c.comment || ''
                const authorName = c.author_name || '익명'
                const ts = c.created_at
                return (
                  <li key={i} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                      <span className="text-sm font-semibold text-gray-800">{authorName}</span>
                      {ts && <span className="text-[11px] text-gray-400">{formatDate(ts, 'yyyy.MM.dd HH:mm')}</span>}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{body}</p>
                  </li>
                )
              })}
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

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded p-2">
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}

function FileActions({ file }: { file: FileInfo }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <a href={file.url} download={file.filename}
         className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
        <Download className="h-3.5 w-3.5" /> 다운로드
      </a>
      <a href={file.url} target="_blank" rel="noopener noreferrer"
         className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600">
        <ExternalLink className="h-3.5 w-3.5" /> 새 탭
      </a>
    </div>
  )
}

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
