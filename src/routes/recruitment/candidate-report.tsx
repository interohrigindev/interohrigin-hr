import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Sparkles, Loader2, CheckCircle, XCircle, AlertTriangle, Video, MapPin, Calendar, ClipboardList, RefreshCw, Send, Mail, MessageCircle, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { FileRetentionBadge } from '@/components/ui/FileRetentionBadge'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature, type AIFileAttachment } from '@/lib/ai-client'
import { runComprehensiveAnalysis } from '@/lib/recruitment-ai'
import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_COLORS, SOURCE_CHANNEL_LABELS } from '@/lib/recruitment-constants'
import type { Candidate, CandidateStatus, SourceChannel, ResumeAnalysis, RecruitmentReport } from '@/types/recruitment'
import { formatDate } from '@/lib/utils'
import { surveyInviteEmail, hiringAcceptEmail, hiringRejectEmail } from '@/lib/email-templates'
import { Dialog } from '@/components/ui/Dialog'
import InterviewAnalysis from '@/components/recruitment/InterviewAnalysis'

export default function CandidateReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { profile } = useAuth()

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [report, setReport] = useState<RecruitmentReport | null>(null)
  const [comprehensiveAnalyzing, setComprehensiveAnalyzing] = useState(false)
  const [, setActiveTab] = useState<'resume' | 'comprehensive'>('resume')
  const [resumeSignedUrl, setResumeSignedUrl] = useState<string | null>(null)
  const [coverLetterSignedUrl, setCoverLetterSignedUrl] = useState<string | null>(null)
  const [surveyQuestions, setSurveyQuestions] = useState<{ id: string; question: string; type: string; options?: string[]; required?: boolean }[]>([])
  const [resendingSurvey, setResendingSurvey] = useState(false)
  const [surveyReanalyzing, setSurveyReanalyzing] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState('')
  const [decisionDialog, setDecisionDialog] = useState<{ open: boolean; decision: 'hired' | 'rejected' | null }>({ open: false, decision: null })
  const [offerConditions, setOfferConditions] = useState({
    salary: '',
    probation_salary: '',
    regular_salary: '',
    job_title: '',
    start_date: '',
  })
  const [sendEmail, setSendEmail] = useState(true)
  const [decidingInProgress, setDecidingInProgress] = useState(false)
  const [aiQuestions, setAiQuestions] = useState<string[]>([])
  const [comments, setComments] = useState<{ author_id: string; author_name: string; content: string; created_at: string }[]>([])
  const [newComment, setNewComment] = useState('')

  useEffect(() => {
    if (!id) return
    async function fetch() {
      const [candRes, analysisRes] = await Promise.all([
        supabase.from('candidates').select('*').eq('id', id).single(),
        supabase.from('resume_analysis').select('*').eq('candidate_id', id).order('created_at', { ascending: false }).limit(1).single(),
      ])
      const cand = candRes.data as Candidate | null
      if (cand) {
        setCandidate(cand)
        // private 버킷 → signed URL 생성 (1시간 유효)
        if (cand.resume_url && !cand.resume_url.startsWith('http')) {
          const { data: sUrl } = await supabase.storage.from('resumes').createSignedUrl(cand.resume_url, 3600)
          if (sUrl?.signedUrl) setResumeSignedUrl(sUrl.signedUrl)
        } else if (cand.resume_url) {
          setResumeSignedUrl(cand.resume_url)
        }
        if (cand.cover_letter_url && !cand.cover_letter_url.startsWith('http')) {
          const { data: sUrl } = await supabase.storage.from('resumes').createSignedUrl(cand.cover_letter_url, 3600)
          if (sUrl?.signedUrl) setCoverLetterSignedUrl(sUrl.signedUrl)
        } else if (cand.cover_letter_url) {
          setCoverLetterSignedUrl(cand.cover_letter_url)
        }
      }
      if (analysisRes.data) setAnalysis(analysisRes.data as ResumeAnalysis)

      // 사전질의서 질문 목록 가져오기 (응답이 있는 경우)
      if (cand?.pre_survey_data && cand.job_posting_id) {
        const { data: posting } = await supabase
          .from('job_postings')
          .select('survey_template_id')
          .eq('id', cand.job_posting_id)
          .single()
        if (posting?.survey_template_id) {
          const { data: tmpl } = await supabase
            .from('pre_survey_templates')
            .select('questions')
            .eq('id', posting.survey_template_id)
            .single()
          if (tmpl?.questions) setSurveyQuestions(tmpl.questions as typeof surveyQuestions)
        }
      }

      // AI 면접 질문 로딩
      if (cand?.job_posting_id) {
        const { data: jp } = await supabase
          .from('job_postings')
          .select('ai_questions')
          .eq('id', cand.job_posting_id)
          .single()
        if (jp?.ai_questions) setAiQuestions((jp.ai_questions as string[]) || [])
      }

      // 면접관 코멘트 로딩
      if (cand?.interviewer_comments) {
        setComments((cand.interviewer_comments as typeof comments) || [])
      }

      // 종합 리포트
      const reportRes = await supabase
        .from('recruitment_reports')
        .select('*')
        .eq('candidate_id', id)
        .eq('report_type', 'comprehensive')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (reportRes.data) setReport(reportRes.data as RecruitmentReport)

      setLoading(false)
    }
    fetch()
  }, [id])

  async function runAIAnalysis() {
    if (!candidate) return
    setAnalyzing(true)
    setAnalysisStatus('AI 설정 확인 중...')
    try {
      const config = await getAIConfigForFeature('resume_analysis')
      if (!config) {
        toast('AI 설정이 필요합니다.', 'error')
        setAnalyzing(false)
        setAnalysisStatus('')
        return
      }

      // 채용공고 정보
      setAnalysisStatus('채용공고 정보 로딩 중...')
      let postingInfo = ''
      if (candidate.job_posting_id) {
        const { data: posting } = await supabase
          .from('job_postings')
          .select('title, description, requirements')
          .eq('id', candidate.job_posting_id)
          .single()
        if (posting) {
          postingInfo = `직무: ${posting.title}\n설명: ${posting.description || ''}\n요건: ${posting.requirements || ''}`
        }
      }

      // ─── 첨부 파일 다운로드 (이력서, 자기소개서) → base64 변환 ───
      const files: AIFileAttachment[] = []

      async function downloadFileAsBase64(storagePath: string): Promise<{ base64: string; mimeType: string } | null> {
        try {
          // storage path 또는 full URL 처리
          let filePath = storagePath
          if (storagePath.startsWith('http')) {
            // public URL에서 경로 추출: .../resumes/path/to/file → path/to/file
            const match = storagePath.match(/\/resumes\/(.+)$/)
            if (match) filePath = match[1]
            else return null
          }
          const { data, error } = await supabase.storage.from('resumes').download(filePath)
          if (error || !data) return null

          const arrayBuffer = await data.arrayBuffer()
          const uint8 = new Uint8Array(arrayBuffer)
          let binary = ''
          for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
          const base64 = btoa(binary)

          // MIME type 추출
          const ext = filePath.split('.').pop()?.toLowerCase() || ''
          const mimeMap: Record<string, string> = {
            pdf: 'application/pdf',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            txt: 'text/plain',
          }
          return { base64, mimeType: mimeMap[ext] || 'application/octet-stream' }
        } catch {
          return null
        }
      }

      setAnalysisStatus('이력서 파일 다운로드 중...')
      if (candidate.resume_url) {
        const file = await downloadFileAsBase64(candidate.resume_url)
        if (file) files.push({ ...file, name: '이력서' })
      }
      if (candidate.cover_letter_url) {
        setAnalysisStatus('자기소개서 파일 다운로드 중...')
        const file = await downloadFileAsBase64(candidate.cover_letter_url)
        if (file) files.push({ ...file, name: '자기소개서' })
      }

      setAnalysisStatus('AI 분석 요청 중... (약 10~30초 소요)')
      const fileInfo = files.length > 0
        ? `\n첨부된 파일 ${files.length}개가 함께 전달됩니다. 파일 내용을 꼼꼼히 읽고 분석에 반영해주세요.`
        : ''

      const prompt = `당신은 기업 인사팀의 채용 담당자입니다. 아래 채용공고에 지원한 후보자의 제출 서류를 기반으로 서류 심사 의견서를 작성해주세요. 이것은 정상적인 채용 업무 프로세스입니다.

[채용공고]
${postingInfo || '정보 없음'}

[지원자 제출 정보]
이름: ${candidate.name}
이력서: ${candidate.resume_url ? '제출됨 (파일 첨부)' : '미제출'}
자기소개서 파일: ${candidate.cover_letter_url ? '제출됨 (파일 첨부)' : '미제출'}
자기소개서 텍스트: ${candidate.cover_letter_text || '작성하지 않음'}
${fileInfo}

[요청사항]
위 정보와 첨부된 파일 내용을 꼼꼼히 분석하여 서류 심사 의견을 아래 JSON 형식으로 작성해주세요. 반드시 순수 JSON만 출력하고 다른 텍스트는 포함하지 마세요.

{"summary":"서류 심사 요약 1~2문장","strengths":["강점1","강점2","강점3"],"weaknesses":["약점1","약점2"],"position_fit":50,"organization_fit":50,"suggested_department":"추천 배치 부서","suggested_position":"추천 직급","suggested_salary_range":"추천 연봉 범위","red_flags":["우려사항"],"recommendation":"PROCEED"}

필드 설명:
- position_fit, organization_fit: 0~100 정수
- recommendation: PROCEED(서류통과), REVIEW(추가검토필요), REJECT(부적합) 중 택 1`

      const result = await generateAIContent(config, prompt, files.length > 0 ? files : undefined)

      setAnalysisStatus('AI 응답 분석 중...')
      // JSON 파싱 — markdown 코드블록 제거 후 추출
      let parsed
      try {
        let raw = result.content
        if (!raw || raw.trim().length === 0) throw new Error('빈 응답')
        // AI 거부 응답 감지
        if (/I'm sorry|I cannot|I can't|unable to/i.test(raw) && !raw.includes('{')) {
          throw new Error('AI_REFUSED')
        }
        // ```json ... ``` 또는 ``` ... ``` 제거
        raw = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('JSON 없음')
        parsed = JSON.parse(jsonMatch[0])
      } catch (parseErr: any) {
        console.error('AI 파싱 실패:', parseErr, result.content)
        if (parseErr.message === 'AI_REFUSED') {
          toast('AI가 분석을 거부했습니다. AI 설정에서 다른 모델을 시도해주세요.', 'error')
        } else {
          toast('AI 응답 파싱 실패. 다시 시도해주세요.', 'error')
        }
        setAnalyzing(false)
        return
      }

      setAnalysisStatus('분석 결과 저장 중...')
      // resume_analysis 저장
      const { data: savedAnalysis, error: saveErr } = await supabase
        .from('resume_analysis')
        .insert({
          candidate_id: id,
          ai_summary: parsed.summary,
          strengths: parsed.strengths,
          weaknesses: parsed.weaknesses,
          position_fit: parsed.position_fit,
          organization_fit: parsed.organization_fit,
          suggested_department: parsed.suggested_department,
          suggested_position: parsed.suggested_position,
          suggested_salary_range: parsed.suggested_salary_range,
          red_flags: parsed.red_flags,
          recommendation: parsed.recommendation,
        })
        .select()
        .single()

      if (saveErr) throw new Error(saveErr.message)

      // 지원자 상태 업데이트
      await supabase
        .from('candidates')
        .update({ status: 'resume_reviewed' })
        .eq('id', id)

      setAnalysis(savedAnalysis as ResumeAnalysis)
      setCandidate((prev) => prev ? { ...prev, status: 'resume_reviewed' } : prev)
      toast('AI 분석이 완료되었습니다.', 'success')
    } catch (err: any) {
      toast('AI 분석 실패: ' + err.message, 'error')
    }
    setAnalyzing(false)
    setAnalysisStatus('')
  }

  async function runComprehensive() {
    if (!id) return
    setComprehensiveAnalyzing(true)
    try {
      const { report: newReport } = await runComprehensiveAnalysis(id)
      setReport(newReport as RecruitmentReport)
      setCandidate((prev) => prev ? { ...prev, status: 'analyzed' } : prev)
      toast('종합 분석이 완료되었습니다.', 'success')
      setActiveTab('comprehensive')
    } catch (err: any) {
      toast('종합 분석 실패: ' + err.message, 'error')
    }
    setComprehensiveAnalyzing(false)
  }

  async function handleDecision(decision: 'proceed' | 'reject') {
    if (!id || !candidate) return

    if (decision === 'proceed') {
      // 이메일 발송
      const baseUrl = window.location.origin
      const surveyUrl = `${baseUrl}/survey/${candidate.invite_token}?t=${Date.now()}`
      const { subject, html } = surveyInviteEmail(candidate.name, surveyUrl)

      try {
        const emailRes = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: candidate.email,
            subject,
            html,
          }),
        })

        if (!emailRes.ok) {
          const errData = await emailRes.json().catch(() => ({}))
          toast('이메일 발송 실패: ' + ((errData as Record<string, string>)?.error || '알 수 없는 오류'), 'error')
          return
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '네트워크 오류'
        toast('이메일 발송 실패: ' + message, 'error')
        return
      }
    }

    const newStatus = decision === 'proceed' ? 'survey_sent' : 'rejected'
    const { error } = await supabase
      .from('candidates')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) {
      toast('상태 변경 실패', 'error')
    } else {
      toast(decision === 'proceed' ? '사전 질의서 이메일이 발송되었습니다.' : '불합격 처리되었습니다.', 'success')
      setCandidate((prev) => prev ? { ...prev, status: newStatus as CandidateStatus } : prev)
    }
  }

  // 공고 제목 가져오기 (이메일 템플릿용)
  function getJobTitle(): string | undefined {
    if (!candidate?.job_posting_id) return undefined
    // report에 공고 제목이 포함되어 있으면 사용
    return (report as any)?.job_title || undefined
  }

  // 최종 합격/불합격 결정 + AI 신뢰도 자동 기록 + 이메일 발송
  async function handleHiringDecision(decision: 'hired' | 'rejected') {
    if (!id || !candidate || !report) return
    setDecidingInProgress(true)

    try {
      // 1. hiring_decisions 기록
      await supabase.from('hiring_decisions').insert({
        candidate_id: id,
        decision,
        decided_by: null,
        ai_recommendation: report.ai_recommendation,
        ai_score: report.overall_score,
        offered_salary: decision === 'hired' && offerConditions.salary ? parseInt(offerConditions.salary) : null,
        offered_position: decision === 'hired' ? offerConditions.job_title || null : null,
        start_date: decision === 'hired' && offerConditions.start_date ? offerConditions.start_date : null,
      })

      // 2. 지원자 상태 변경
      await supabase.from('candidates').update({ status: decision }).eq('id', id)

      // 3. AI 신뢰도 자동 기록 — ai_accuracy_log
      const aiRec = report.ai_recommendation // 'STRONG_HIRE', 'HIRE', 'REVIEW', 'NO_HIRE'
      const aiSaysHire = aiRec === 'STRONG_HIRE' || aiRec === 'HIRE'
      const actualHire = decision === 'hired'
      const matchResult = aiSaysHire === actualHire
        ? 'match'
        : (aiRec === 'REVIEW' ? 'partial' : 'mismatch')

      await supabase.from('ai_accuracy_log').insert({
        candidate_id: id,
        context_type: 'hiring',
        ai_recommendation: aiRec,
        ai_score: report.overall_score,
        actual_decision: decision === 'hired' ? '합격' : '불합격',
        match_result: matchResult,
        notes: `AI: ${aiRec} (${report.overall_score}점) → 실제: ${decision === 'hired' ? '합격' : '불합격'}`,
      })

      // 4. ai_trust_metrics 자동 집계 업데이트
      await updateTrustMetrics()

      // 5. 이메일 발송
      if (sendEmail) {
        try {
          const jobTitle = getJobTitle()
          const template = decision === 'hired'
            ? hiringAcceptEmail(candidate.name, jobTitle, {
                salary: offerConditions.salary,
                probation_salary: offerConditions.probation_salary,
                regular_salary: offerConditions.regular_salary,
                job_title: offerConditions.job_title,
                start_date: offerConditions.start_date,
              })
            : hiringRejectEmail(candidate.name, jobTitle)

          const emailRes = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: candidate.email, subject: template.subject, html: template.html }),
          })

          if (!emailRes.ok) {
            const errData = await emailRes.json().catch(() => ({}))
            toast(`이메일 발송 실패: ${(errData as any)?.error || emailRes.status}`, 'error')
          }
        } catch {
          toast('이메일 발송 중 오류가 발생했습니다.', 'error')
        }
      }

      setCandidate((p) => p ? { ...p, status: decision as CandidateStatus } : p)
      setDecisionDialog({ open: false, decision: null })

      const decisionLabel = decision === 'hired' ? '합격' : '불합격'
      const emailLabel = sendEmail ? ' 및 이메일 발송' : ''
      toast(`${decisionLabel} 처리${emailLabel} 완료`, 'success')
    } catch (err: any) {
      toast('결정 처리 실패: ' + err.message, 'error')
    } finally {
      setDecidingInProgress(false)
    }
  }

  // ai_trust_metrics 자동 집계
  async function updateTrustMetrics() {
    // ai_accuracy_log에서 전체 통계 집계
    const { data: allLogs } = await supabase
      .from('ai_accuracy_log')
      .select('match_result')

    if (!allLogs || allLogs.length === 0) return

    const total = allLogs.length
    const correct = allLogs.filter((l: any) => l.match_result === 'match').length
    const partial = allLogs.filter((l: any) => l.match_result === 'partial').length
    const accuracyRate = (correct + partial * 0.5) / total // partial은 0.5점

    // 기존 metrics 레코드 확인
    const { data: existingMetrics } = await supabase
      .from('ai_trust_metrics')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingMetrics && existingMetrics.length > 0) {
      await supabase
        .from('ai_trust_metrics')
        .update({
          total_predictions: total,
          correct_predictions: correct,
          accuracy_rate: Math.round(accuracyRate * 1000) / 1000,
          period_end: new Date().toISOString().slice(0, 10),
        })
        .eq('id', existingMetrics[0].id)
    } else {
      await supabase.from('ai_trust_metrics').insert({
        period_start: new Date().toISOString().slice(0, 10),
        period_end: new Date().toISOString().slice(0, 10),
        total_predictions: total,
        correct_predictions: correct,
        accuracy_rate: Math.round(accuracyRate * 1000) / 1000,
        current_phase: 'A',
        details: {},
      })
    }
  }

  // 사전질의서 재발송 (상태를 survey_sent로 리셋 + 이메일 재발송)
  async function handleResendSurvey() {
    if (!candidate) return
    setResendingSurvey(true)
    try {
      const baseUrl = window.location.origin
      const surveyUrl = `${baseUrl}/survey/${candidate.invite_token}?t=${Date.now()}`
      const { subject, html } = surveyInviteEmail(candidate.name, surveyUrl)

      const emailRes = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: candidate.email, subject, html }),
      })
      if (!emailRes.ok) {
        const errData = await emailRes.json().catch(() => ({}))
        toast('이메일 발송 실패: ' + ((errData as Record<string, string>)?.error || '알 수 없는 오류'), 'error')
        setResendingSurvey(false)
        return
      }

      // 상태를 survey_sent로 리셋 + pre_survey_data 초기화
      await supabase
        .from('candidates')
        .update({ status: 'survey_sent', pre_survey_data: null })
        .eq('id', candidate.id)

      setCandidate((prev) => prev ? { ...prev, status: 'survey_sent' as CandidateStatus, pre_survey_data: null } : prev)
      toast('사전질의서가 재발송되었습니다.', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '네트워크 오류'
      toast('재발송 실패: ' + message, 'error')
    }
    setResendingSurvey(false)
  }

  // 사전질의서 포함 AI 재분석
  async function runSurveyInclusiveAnalysis() {
    if (!candidate || !candidate.pre_survey_data) return
    setSurveyReanalyzing(true)
    setAnalysisStatus('AI 설정 확인 중...')
    try {
      const config = await getAIConfigForFeature('resume_analysis')
      if (!config) {
        toast('AI 설정이 필요합니다.', 'error')
        setSurveyReanalyzing(false)
        setAnalysisStatus('')
        return
      }

      // 채용공고 정보
      setAnalysisStatus('채용공고 정보 로딩 중...')
      let postingInfo = ''
      if (candidate.job_posting_id) {
        const { data: posting } = await supabase
          .from('job_postings')
          .select('title, description, requirements')
          .eq('id', candidate.job_posting_id)
          .single()
        if (posting) {
          postingInfo = `직무: ${posting.title}\n설명: ${posting.description || ''}\n요건: ${posting.requirements || ''}`
        }
      }

      // 첨부 파일 다운로드
      const files: AIFileAttachment[] = []
      async function downloadFileAsBase64(storagePath: string): Promise<{ base64: string; mimeType: string } | null> {
        try {
          let filePath = storagePath
          if (storagePath.startsWith('http')) {
            const match = storagePath.match(/\/resumes\/(.+)$/)
            if (match) filePath = match[1]
            else return null
          }
          const { data, error } = await supabase.storage.from('resumes').download(filePath)
          if (error || !data) return null
          const arrayBuffer = await data.arrayBuffer()
          const uint8 = new Uint8Array(arrayBuffer)
          let binary = ''
          for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
          const base64 = btoa(binary)
          const ext = filePath.split('.').pop()?.toLowerCase() || ''
          const mimeMap: Record<string, string> = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain' }
          return { base64, mimeType: mimeMap[ext] || 'application/octet-stream' }
        } catch { return null }
      }
      setAnalysisStatus('첨부 파일 다운로드 중...')
      if (candidate.resume_url) {
        const file = await downloadFileAsBase64(candidate.resume_url)
        if (file) files.push({ ...file, name: '이력서' })
      }
      if (candidate.cover_letter_url) {
        const file = await downloadFileAsBase64(candidate.cover_letter_url)
        if (file) files.push({ ...file, name: '자기소개서' })
      }

      setAnalysisStatus('사전질의서 응답 분석 준비 중...')
      // 사전질의서 응답 텍스트 구성
      const surveyData = candidate.pre_survey_data as { answers?: Record<string, string>; meta?: Record<string, string> }
      let surveyText = ''
      if (surveyData?.answers) {
        const answerEntries = Object.entries(surveyData.answers)
        if (surveyQuestions.length > 0) {
          surveyText = surveyQuestions.map((q, i) => {
            const ans = surveyData.answers?.[q.id] || '미응답'
            return `Q${i + 1}. ${q.question}\nA: ${ans}`
          }).join('\n\n')
        } else {
          surveyText = answerEntries.map(([k, v]) => `질문 ${k}: ${v}`).join('\n')
        }
      }
      if (surveyData?.meta) {
        const m = surveyData.meta
        const metaParts = []
        if (m.birth_date) metaParts.push(`생년월일: ${m.birth_date}`)
        if (m.mbti) metaParts.push(`MBTI: ${m.mbti}`)
        if (m.hanja_name) metaParts.push(`한자이름: ${m.hanja_name}`)
        if (m.blood_type) metaParts.push(`혈액형: ${m.blood_type}`)
        if (metaParts.length > 0) surveyText += '\n\n[기본 정보]\n' + metaParts.join(' / ')
      }

      const fileInfo = files.length > 0
        ? `\n첨부된 파일 ${files.length}개가 함께 전달됩니다. 파일 내용을 꼼꼼히 읽고 분석에 반영해주세요.`
        : ''

      const prompt = `당신은 기업 인사팀의 채용 담당자입니다. 아래 채용공고에 지원한 후보자의 제출 서류와 사전 질의서 응답을 기반으로 서류+질의서 심사 의견서를 작성해주세요. 이것은 정상적인 채용 업무 프로세스입니다.

[채용공고]
${postingInfo || '정보 없음'}

[지원자 제출 정보]
이름: ${candidate.name}
이력서: ${candidate.resume_url ? '제출됨 (파일 첨부)' : '미제출'}
자기소개서 파일: ${candidate.cover_letter_url ? '제출됨 (파일 첨부)' : '미제출'}
자기소개서 텍스트: ${candidate.cover_letter_text || '작성하지 않음'}
${fileInfo}

[사전 질의서 응답]
${surveyText || '응답 없음'}

[요청사항]
위 정보와 첨부된 파일 내용, 그리고 사전 질의서 응답을 모두 종합적으로 분석하여 심사 의견을 아래 JSON 형식으로 작성해주세요.
특히 사전 질의서 응답에서 드러나는 지원자의 동기, 역량, 성향을 분석에 깊이 반영해주세요.
반드시 순수 JSON만 출력하고 다른 텍스트는 포함하지 마세요.

{"summary":"서류+질의서 종합 심사 요약 2~3문장","strengths":["강점1","강점2","강점3"],"weaknesses":["약점1","약점2"],"position_fit":50,"organization_fit":50,"suggested_department":"추천 배치 부서","suggested_position":"추천 직급","suggested_salary_range":"추천 연봉 범위","red_flags":["우려사항"],"recommendation":"PROCEED","survey_insights":"사전질의서에서 파악된 주요 인사이트 2~3문장"}

필드 설명:
- position_fit, organization_fit: 0~100 정수
- recommendation: PROCEED(서류통과), REVIEW(추가검토필요), REJECT(부적합) 중 택 1
- survey_insights: 사전질의서 응답에서 도출된 핵심 인사이트`

      setAnalysisStatus('AI 분석 요청 중... (서류+질의서 종합, 약 15~40초 소요)')
      const result = await generateAIContent(config, prompt, files.length > 0 ? files : undefined)

      setAnalysisStatus('AI 응답 분석 중...')
      let parsed
      try {
        let raw = result.content
        if (!raw || raw.trim().length === 0) throw new Error('빈 응답')
        if (/I'm sorry|I cannot|I can't|unable to/i.test(raw) && !raw.includes('{')) {
          throw new Error('AI_REFUSED')
        }
        raw = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('JSON 없음')
        parsed = JSON.parse(jsonMatch[0])
      } catch (parseErr: any) {
        console.error('AI 파싱 실패:', parseErr, result.content)
        if (parseErr.message === 'AI_REFUSED') {
          toast('AI가 분석을 거부했습니다. AI 설정에서 다른 모델을 시도해주세요.', 'error')
        } else {
          toast('AI 응답 파싱 실패. 다시 시도해주세요.', 'error')
        }
        setSurveyReanalyzing(false)
        return
      }

      // resume_analysis 저장 (사전질의서 포함 버전)
      const { data: savedAnalysis, error: saveErr } = await supabase
        .from('resume_analysis')
        .insert({
          candidate_id: id,
          ai_summary: parsed.summary,
          strengths: parsed.strengths,
          weaknesses: parsed.weaknesses,
          position_fit: parsed.position_fit,
          organization_fit: parsed.organization_fit,
          suggested_department: parsed.suggested_department,
          suggested_position: parsed.suggested_position,
          suggested_salary_range: parsed.suggested_salary_range,
          red_flags: parsed.red_flags,
          recommendation: parsed.recommendation,
        })
        .select()
        .single()

      if (saveErr) throw new Error(saveErr.message)

      // 사전질의서 분석 결과를 candidate에 저장
      await supabase
        .from('candidates')
        .update({
          pre_survey_analysis: { survey_insights: parsed.survey_insights, analyzed_at: new Date().toISOString() },
        })
        .eq('id', id)

      setAnalysis(savedAnalysis as ResumeAnalysis)
      setCandidate((prev) => prev ? {
        ...prev,
        pre_survey_analysis: { survey_insights: parsed.survey_insights, analyzed_at: new Date().toISOString() },
      } : prev)
      toast('사전질의서 포함 AI 재분석이 완료되었습니다.', 'success')
    } catch (err: any) {
      toast('AI 분석 실패: ' + err.message, 'error')
    }
    setSurveyReanalyzing(false)
    setAnalysisStatus('')
  }

  if (loading) return <PageSpinner />
  if (!candidate) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">지원자를 찾을 수 없습니다.</p>
      </div>
    )
  }

  const recommendationConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
    PROCEED: { icon: CheckCircle, color: 'text-green-600', label: '진행 권장' },
    REVIEW: { icon: AlertTriangle, color: 'text-amber-600', label: '검토 필요' },
    REJECT: { icon: XCircle, color: 'text-red-600', label: '부적합' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{candidate.name}</h1>
          <p className="text-sm text-gray-500">
            {candidate.email} · {SOURCE_CHANNEL_LABELS[candidate.source_channel as SourceChannel]}
            · 지원일: {formatDate(candidate.created_at, 'yyyy.MM.dd')}
          </p>
        </div>
        <Badge variant="default" className={CANDIDATE_STATUS_COLORS[candidate.status as CandidateStatus] || ''}>
          {CANDIDATE_STATUS_LABELS[candidate.status as CandidateStatus]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* 이력서/자기소개서 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> 제출 서류
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {candidate.resume_url && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700">이력서</span>
                    {resumeSignedUrl ? (
                      <a
                        href={resumeSignedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-brand-600 hover:underline"
                      >
                        다운로드
                      </a>
                    ) : (
                      <span className="text-sm text-gray-400">URL 생성 중...</span>
                    )}
                  </div>
                  <FileRetentionBadge
                    createdAt={candidate.created_at}
                    retentionDays={365}
                    downloadUrl={resumeSignedUrl || undefined}
                    fileName={`이력서_${candidate.name}.pdf`}
                    compact
                  />
                </div>
              )}
              {candidate.cover_letter_url && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700">자기소개서 (파일)</span>
                    {coverLetterSignedUrl ? (
                      <a
                        href={coverLetterSignedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-brand-600 hover:underline"
                      >
                        다운로드
                      </a>
                    ) : (
                      <span className="text-sm text-gray-400">URL 생성 중...</span>
                    )}
                  </div>
                  <FileRetentionBadge
                    createdAt={candidate.created_at}
                    retentionDays={365}
                    downloadUrl={coverLetterSignedUrl || undefined}
                    fileName={`자기소개서_${candidate.name}.pdf`}
                    compact
                  />
                </div>
              )}
              {candidate.cover_letter_text && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">자기소개서 (텍스트)</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{candidate.cover_letter_text}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 사전질의서 응답 상세 */}
          {candidate.pre_survey_data && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" /> 사전 질의서 응답
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleResendSurvey} disabled={resendingSurvey}>
                      {resendingSurvey ? (
                        <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 발송 중...</>
                      ) : (
                        <><Send className="h-3 w-3 mr-1" /> 재발송</>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {(() => {
                  const surveyData = candidate.pre_survey_data as {
                    answers?: Record<string, string>
                    meta?: { birth_date?: string; mbti?: string; hanja_name?: string; blood_type?: string }
                    completed_at?: string
                  }

                  return (
                    <>
                      {/* 기본 정보 (메타데이터) */}
                      {surveyData.meta && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {surveyData.meta.birth_date && (
                            <div className="p-2 bg-gray-50 rounded-lg text-center">
                              <p className="text-xs text-gray-500">생년월일</p>
                              <p className="text-sm font-medium">{surveyData.meta.birth_date}</p>
                            </div>
                          )}
                          {surveyData.meta.mbti && (
                            <div className="p-2 bg-purple-50 rounded-lg text-center">
                              <p className="text-xs text-purple-500">MBTI</p>
                              <p className="text-sm font-bold text-purple-700">{surveyData.meta.mbti}</p>
                            </div>
                          )}
                          {surveyData.meta.hanja_name && (
                            <div className="p-2 bg-gray-50 rounded-lg text-center">
                              <p className="text-xs text-gray-500">한자 이름</p>
                              <p className="text-sm font-medium">{surveyData.meta.hanja_name}</p>
                            </div>
                          )}
                          {surveyData.meta.blood_type && (
                            <div className="p-2 bg-gray-50 rounded-lg text-center">
                              <p className="text-xs text-gray-500">혈액형</p>
                              <p className="text-sm font-medium">{surveyData.meta.blood_type}형</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 질의 응답 */}
                      {surveyData.answers && Object.keys(surveyData.answers).length > 0 && (
                        <div className="space-y-3">
                          {surveyQuestions.length > 0 ? (
                            surveyQuestions.map((q, i) => (
                              <div key={q.id} className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs font-medium text-gray-600 mb-1">
                                  Q{i + 1}. {q.question}
                                  {q.required && <span className="text-red-500 ml-1">*</span>}
                                </p>
                                <p className="text-sm text-gray-900">
                                  {surveyData.answers?.[q.id] || <span className="text-gray-400 italic">미응답</span>}
                                </p>
                              </div>
                            ))
                          ) : (
                            Object.entries(surveyData.answers).map(([qId, answer], i) => (
                              <div key={qId} className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs font-medium text-gray-600 mb-1">질문 {i + 1}</p>
                                <p className="text-sm text-gray-900">{answer}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* 완료 시간 */}
                      {surveyData.completed_at && (
                        <p className="text-xs text-gray-400 text-right">
                          응답 완료: {formatDate(surveyData.completed_at, 'yyyy.MM.dd HH:mm')}
                        </p>
                      )}

                      {/* 사전질의서 AI 인사이트 */}
                      {candidate.pre_survey_analysis && (candidate.pre_survey_analysis as any).survey_insights && (
                        <div className="p-3 bg-brand-50 border border-brand-200 rounded-lg">
                          <p className="text-xs font-medium text-brand-600 mb-1">
                            <Sparkles className="h-3 w-3 inline mr-1" />AI 질의서 분석 인사이트
                          </p>
                          <p className="text-sm text-brand-800">
                            {(candidate.pre_survey_analysis as any).survey_insights}
                          </p>
                        </div>
                      )}
                    </>
                  )
                })()}
              </CardContent>
            </Card>
          )}

          {/* 발송 완료 but 미응답 상태 */}
          {!candidate.pre_survey_data && ['survey_sent'].includes(candidate.status) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> 사전 질의서
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
                  <p className="text-sm text-amber-700">사전 질의서가 발송되었습니다. 지원자의 응답을 기다리고 있습니다.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI 분석 결과 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" /> AI 1차 분석
                </CardTitle>
                <div className="flex items-center gap-2">
                  {analysisStatus && (
                    <span className="text-xs text-brand-600 animate-pulse">{analysisStatus}</span>
                  )}
                  <Button size="sm" variant={analysis ? 'outline' : 'primary'} onClick={runAIAnalysis} disabled={analyzing || surveyReanalyzing}>
                    {analyzing ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 분석 중...</>
                    ) : analysis ? (
                      <><Sparkles className="h-4 w-4 mr-1" /> 재분석</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-1" /> AI 분석 실행</>
                    )}
                  </Button>
                  {candidate.pre_survey_data && (
                    <Button size="sm" variant="primary" onClick={runSurveyInclusiveAnalysis} disabled={surveyReanalyzing || analyzing}>
                      {surveyReanalyzing ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 분석 중...</>
                      ) : (
                        <><RefreshCw className="h-4 w-4 mr-1" /> 질의서 포함 재분석</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!analysis ? (
                <p className="text-gray-400 text-sm">AI 분석을 실행하면 이력서/자기소개서 분석 결과가 표시됩니다.</p>
              ) : (
                <div className="space-y-4">
                  {/* 추천 */}
                  {analysis.recommendation && (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const cfg = recommendationConfig[analysis.recommendation]
                        const Icon = cfg?.icon || AlertTriangle
                        return (
                          <>
                            <Icon className={`h-5 w-5 ${cfg?.color || ''}`} />
                            <span className={`font-semibold ${cfg?.color || ''}`}>
                              {cfg?.label || analysis.recommendation}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {/* 요약 */}
                  {analysis.ai_summary && (
                    <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">{analysis.ai_summary}</p>
                  )}

                  {/* 적합도 점수 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-600 mb-1">직무 적합도</p>
                      <p className="text-2xl font-bold text-blue-700">{analysis.position_fit ?? '-'}<span className="text-sm">점</span></p>
                    </div>
                    <div className="text-center p-3 bg-brand-50 rounded-lg">
                      <p className="text-xs text-brand-600 mb-1">조직 적합도</p>
                      <p className="text-2xl font-bold text-brand-700">{analysis.organization_fit ?? '-'}<span className="text-sm">점</span></p>
                    </div>
                  </div>

                  {/* 강점/약점 */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-green-600 mb-2">강점</p>
                      <ul className="space-y-1">
                        {(analysis.strengths || []).map((s, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start gap-1">
                            <span className="text-green-500 mt-0.5">+</span> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-red-600 mb-2">약점</p>
                      <ul className="space-y-1">
                        {(analysis.weaknesses || []).map((w, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start gap-1">
                            <span className="text-red-500 mt-0.5">-</span> {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* 우려사항 */}
                  {analysis.red_flags && (analysis.red_flags as string[]).length > 0 && (
                    <div className="bg-red-50 p-3 rounded-lg">
                      <p className="text-xs font-medium text-red-600 mb-1">우려 사항</p>
                      <ul className="space-y-1">
                        {(analysis.red_flags as string[]).map((f, i) => (
                          <li key={i} className="text-sm text-red-700">• {f}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* AI 추천 정보 */}
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="p-2 bg-gray-50 rounded text-center">
                      <p className="text-xs text-gray-500">추천 부서</p>
                      <p className="font-medium">{analysis.suggested_department || '-'}</p>
                    </div>
                    <div className="p-2 bg-gray-50 rounded text-center">
                      <p className="text-xs text-gray-500">추천 직급</p>
                      <p className="font-medium">{analysis.suggested_position || '-'}</p>
                    </div>
                    <div className="p-2 bg-gray-50 rounded text-center">
                      <p className="text-xs text-gray-500">추천 연봉</p>
                      <p className="font-medium">{analysis.suggested_salary_range || '-'}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI 추천 면접 질문 */}
          {aiQuestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand-600" />
                  AI 추천 면접 질문 ({aiQuestions.length}개)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-400 mb-3">면접 시 활용할 수 있는 AI 추천 질문입니다.</p>
                <ol className="space-y-2">
                  {aiQuestions.map((q, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-bold">{i + 1}</span>
                      <span className="text-gray-700 pt-0.5">{q}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* 면접관 코멘트 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                면접관 코멘트 ({comments.length}개)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {comments.length > 0 && (
                <div className="space-y-3 mb-4">
                  {comments.map((c, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800">{c.author_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
                          {c.author_id === profile?.id && (
                            <button
                              onClick={async () => {
                                const updated = comments.filter((_, idx) => idx !== i)
                                await supabase.from('candidates').update({ interviewer_comments: updated }).eq('id', id)
                                setComments(updated)
                                toast('코멘트가 삭제되었습니다.')
                              }}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="면접 평가, 인상, 특이사항 등을 기록하세요..."
                  rows={2}
                  className="text-sm"
                />
                <Button
                  className="shrink-0 self-end"
                  disabled={!newComment.trim()}
                  onClick={async () => {
                    if (!profile || !newComment.trim()) return
                    const entry = {
                      author_id: profile.id,
                      author_name: profile.name,
                      content: newComment.trim(),
                      created_at: new Date().toISOString(),
                    }
                    const updated = [...comments, entry]
                    await supabase.from('candidates').update({ interviewer_comments: updated }).eq('id', id)
                    setComments(updated)
                    setNewComment('')
                    toast('코멘트가 등록되었습니다.')
                  }}
                >
                  <Send className="h-4 w-4 mr-1" />등록
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 면접 분석 */}
          <InterviewAnalysis candidateId={id!} candidateName={candidate.name} />

          {/* 종합 AI 분석 리포트 — 2차 대면면접 완료 후에만 실행 가능 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" /> AI 최종 종합 분석
                </CardTitle>
                {!report && ['face_to_face_done', 'processing'].includes(candidate.status) && (
                  <Button size="sm" onClick={runComprehensive} disabled={comprehensiveAnalyzing}>
                    {comprehensiveAnalyzing ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 분석 중...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-1" /> 최종 종합 분석 실행</>
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!report ? (
                <div className="space-y-2">
                  <p className="text-gray-400 text-sm">1차 화상면접 + 2차 대면면접 결과를 모두 종합한 최종 AI 분석을 실행합니다.</p>
                  {!['face_to_face_done', 'processing', 'analyzed', 'decided', 'hired', 'rejected'].includes(candidate.status) && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-sm text-amber-700">
                        종합 분석은 <strong>2차 대면면접이 완료된 후</strong>에 실행할 수 있습니다.
                        1차 화상면접 → 2차 대면면접 순서로 진행해주세요.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 종합 점수 + 추천 */}
                  <div className="flex items-center gap-4">
                    <div className="text-center p-4 bg-brand-50 rounded-xl">
                      <p className="text-xs text-brand-600 mb-1">종합 점수</p>
                      <p className="text-3xl font-bold text-brand-700">{report.overall_score}</p>
                    </div>
                    <div className="flex-1">
                      <Badge variant={
                        report.ai_recommendation === 'STRONG_HIRE' ? 'success' :
                        report.ai_recommendation === 'HIRE' ? 'success' :
                        report.ai_recommendation === 'REVIEW' ? 'warning' : 'danger'
                      } className="text-sm px-3 py-1">
                        {report.ai_recommendation === 'STRONG_HIRE' ? '강력 추천' :
                         report.ai_recommendation === 'HIRE' ? '채용 추천' :
                         report.ai_recommendation === 'REVIEW' ? '추가 검토' : '비추천'}
                      </Badge>
                      <p className="text-sm text-gray-700 mt-2">{report.summary}</p>
                    </div>
                  </div>

                  {/* 세부 분석 */}
                  {report.detailed_analysis && (
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(report.detailed_analysis as Record<string, any>).map(([key, val]) => (
                        <div key={key} className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500 mb-1">
                            {key === 'resume_fit' ? '이력서 적합도' :
                             key === 'interview_performance' ? '면접 수행' :
                             key === 'cultural_fit' ? '조직 적합도' :
                             key === 'growth_potential' ? '성장 가능성' : key}
                          </p>
                          <p className="text-lg font-bold text-gray-900">{val?.score ?? '-'}</p>
                          <p className="text-xs text-gray-600 mt-1">{val?.comment || ''}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 인재상 매칭 */}
                  {report.talent_match && (report.talent_match as any).best_match_profile && (
                    <div className="p-3 bg-amber-50 rounded-lg">
                      <p className="text-xs text-amber-600 mb-1">인재상 매칭</p>
                      <p className="font-medium text-amber-800">
                        {(report.talent_match as any).best_match_profile} ({(report.talent_match as any).match_percentage}%)
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {((report.talent_match as any).similar_traits || []).map((t: string, i: number) => (
                          <Badge key={i} variant="warning">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 추천 정보 */}
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="p-2 bg-gray-50 rounded text-center">
                      <p className="text-xs text-gray-500">추천 부서</p>
                      <p className="font-medium">{report.department_recommendation || '-'}</p>
                    </div>
                    <div className="p-2 bg-gray-50 rounded text-center">
                      <p className="text-xs text-gray-500">추천 직급</p>
                      <p className="font-medium">{report.position_recommendation || '-'}</p>
                    </div>
                    <div className="p-2 bg-gray-50 rounded text-center">
                      <p className="text-xs text-gray-500">추천 연봉</p>
                      <p className="font-medium">{report.salary_recommendation || '-'}</p>
                    </div>
                  </div>

                  {/* 사주/MBTI */}
                  {report.saju_mbti_analysis && (report.saju_mbti_analysis as any).personality_summary && (
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <p className="text-xs text-purple-600 mb-1">성향 분석 (참고)</p>
                      <p className="text-sm text-purple-800">{(report.saju_mbti_analysis as any).personality_summary}</p>
                      <p className="text-xs text-purple-600 mt-1">업무 스타일: {(report.saju_mbti_analysis as any).work_style}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 사이드바: 의사결정 + 채용 전형 진행 현황 */}
        <div className="space-y-6">
          {/* 채용 전형 진행 단계 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">채용 전형 진행</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const steps = [
                  { key: 'applied', label: '서류 접수' },
                  { key: 'resume_reviewed', label: 'AI 이력서 분석' },
                  { key: 'survey', label: '사전 질의서' },
                  { key: 'interview_1', label: '1차 화상면접' },
                  { key: 'interview_2', label: '2차 대면면접' },
                  { key: 'analyzed', label: '최종 종합 분석' },
                  { key: 'decided', label: '최종 결정' },
                ]
                const statusOrder = [
                  'applied', 'resume_reviewed', 'survey_sent', 'survey_done',
                  'interview_scheduled', 'video_done', 'face_to_face_scheduled',
                  'face_to_face_done', 'processing', 'analyzed', 'decided', 'hired', 'rejected',
                ]
                const currentIdx = statusOrder.indexOf(candidate.status)
                const getStepState = (key: string) => {
                  const thresholds: Record<string, number> = {
                    applied: 0, resume_reviewed: 1, survey: 2,
                    interview_1: 4, interview_2: 6, analyzed: 9, decided: 10,
                  }
                  const threshold = thresholds[key] ?? 0
                  if (currentIdx > threshold) return 'done'
                  if (currentIdx === threshold) return 'current'
                  return 'pending'
                }
                return (
                  <div className="space-y-1">
                    {steps.map((step, i) => {
                      const state = getStepState(step.key)
                      return (
                        <div key={step.key} className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            state === 'done' ? 'bg-green-500 text-white' :
                            state === 'current' ? 'bg-brand-500 text-white ring-2 ring-brand-200' :
                            'bg-gray-200 text-gray-400'
                          }`}>
                            {state === 'done' ? '✓' : i + 1}
                          </div>
                          <span className={`text-xs ${
                            state === 'done' ? 'text-green-700' :
                            state === 'current' ? 'text-brand-700 font-semibold' :
                            'text-gray-400'
                          }`}>
                            {step.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          {/* 의사결정 액션 */}
          <Card>
            <CardHeader>
              <CardTitle>의사결정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Step 1: 이력서 분석 완료 → 사전 질의서 발송 */}
              {candidate.status === 'resume_reviewed' && analysis ? (
                <>
                  <Button className="w-full" onClick={() => handleDecision('proceed')}>
                    <CheckCircle className="h-4 w-4 mr-1" /> OK — 사전 질의서 발송
                  </Button>
                  <Button variant="danger" className="w-full" onClick={() => handleDecision('reject')}>
                    <XCircle className="h-4 w-4 mr-1" /> 불합격 처리
                  </Button>
                </>
              ) : /* Step 2: 질의서 완료 → 1차 화상면접 일정 잡기 */
              candidate.status === 'survey_done' ? (
                <>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-700 font-medium mb-1">
                      <Video className="h-4 w-4 inline mr-1" />
                      다음 단계: 1차 화상면접
                    </p>
                    <p className="text-xs text-blue-600">면접 일정을 배정해주세요.</p>
                  </div>
                  <Button className="w-full" onClick={() => navigate('/admin/recruitment/schedules')}>
                    <Calendar className="h-4 w-4 mr-1" /> 1차 면접 일정 잡기
                  </Button>
                  <Button variant="danger" className="w-full" onClick={() => handleDecision('reject')}>
                    <XCircle className="h-4 w-4 mr-1" /> 불합격 처리
                  </Button>
                </>
              ) : /* Step 3: 1차 화상면접 완료 → 2차 대면면접 일정 잡기 */
              candidate.status === 'video_done' ? (
                <>
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-sm text-orange-700 font-medium mb-1">
                      <CheckCircle className="h-4 w-4 inline mr-1" />
                      1차 화상면접 완료
                    </p>
                    <p className="text-xs text-orange-600">면접 녹화 AI 분석 확인 후, 2차 대면면접을 배정해주세요.</p>
                  </div>
                  <Button className="w-full" onClick={() => navigate('/admin/recruitment/schedules')}>
                    <MapPin className="h-4 w-4 mr-1" /> 2차 대면면접 일정 잡기
                  </Button>
                  <Button variant="danger" className="w-full" onClick={() => handleDecision('reject')}>
                    <XCircle className="h-4 w-4 mr-1" /> 불합격 처리
                  </Button>
                </>
              ) : /* Step 4: 2차 대면면접 완료 → 최종 종합 분석 */
              candidate.status === 'face_to_face_done' && !report ? (
                <>
                  <div className="p-3 bg-brand-50 border border-brand-200 rounded-lg">
                    <p className="text-sm text-brand-700 font-medium mb-1">
                      <CheckCircle className="h-4 w-4 inline mr-1" />
                      2차 대면면접 완료
                    </p>
                    <p className="text-xs text-brand-600">최종 종합 분석을 실행하여 합격 여부를 결정하세요.</p>
                  </div>
                  <Button className="w-full" onClick={runComprehensive} disabled={comprehensiveAnalyzing}>
                    {comprehensiveAnalyzing ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 분석 중...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-1" /> 최종 종합 분석 실행</>
                    )}
                  </Button>
                </>
              ) : /* Step 5: 분석 완료 → 합격/불합격 결정 */
              candidate.status === 'analyzed' && report ? (
                <>
                  <Button className="w-full" onClick={() => { setSendEmail(true); setDecisionDialog({ open: true, decision: 'hired' }) }}>
                    <CheckCircle className="h-4 w-4 mr-1" /> 합격
                  </Button>
                  <Button variant="danger" className="w-full" onClick={() => { setSendEmail(true); setDecisionDialog({ open: true, decision: 'rejected' }) }}>
                    <XCircle className="h-4 w-4 mr-1" /> 불합격
                  </Button>
                </>
              ) : candidate.status === 'applied' ? (
                <p className="text-sm text-gray-500">AI 이력서 분석을 먼저 실행하세요.</p>
              ) : candidate.status === 'hired' ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                  <CheckCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
                  <p className="text-sm text-green-700 font-semibold">합격</p>
                </div>
              ) : candidate.status === 'rejected' ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
                  <XCircle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                  <p className="text-sm text-red-700 font-semibold">불합격</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  현재 상태: {CANDIDATE_STATUS_LABELS[candidate.status as CandidateStatus]}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>지원자 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">이름</span>
                <span className="font-medium">{candidate.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">이메일</span>
                <span className="font-medium">{candidate.email}</span>
              </div>
              {candidate.phone && (
                <div className="flex justify-between">
                  <span className="text-gray-500">전화번호</span>
                  <span className="font-medium">{candidate.phone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">유입경로</span>
                <span className="font-medium">
                  {SOURCE_CHANNEL_LABELS[candidate.source_channel as SourceChannel]}
                  {candidate.source_detail && ` (${candidate.source_detail})`}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 합격/불합격 확인 다이얼로그 */}
      {candidate && decisionDialog.decision && (
        <Dialog
          open={decisionDialog.open}
          onClose={() => setDecisionDialog({ open: false, decision: null })}
          title={decisionDialog.decision === 'hired' ? '합격 처리' : '불합격 처리'}
        >
          <div className="space-y-4">
            <div className={`p-4 rounded-lg text-center ${
              decisionDialog.decision === 'hired'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              {decisionDialog.decision === 'hired' ? (
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              ) : (
                <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              )}
              <p className={`font-semibold ${
                decisionDialog.decision === 'hired' ? 'text-green-700' : 'text-red-700'
              }`}>
                {candidate.name}님을 {decisionDialog.decision === 'hired' ? '합격' : '불합격'} 처리합니다.
              </p>
            </div>

            {/* 합격 조건 입력 (합격일 때만) */}
            {decisionDialog.decision === 'hired' && (
              <div className="border rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700">합격 조건</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">연봉 (만원)</label>
                    <input type="number" placeholder="예: 4000" value={offerConditions.salary}
                      onChange={(e) => setOfferConditions(p => ({ ...p, salary: e.target.value }))}
                      className="w-full mt-1 px-3 py-1.5 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">수습 급여 (만원)</label>
                    <input type="number" placeholder="예: 3600" value={offerConditions.probation_salary}
                      onChange={(e) => setOfferConditions(p => ({ ...p, probation_salary: e.target.value }))}
                      className="w-full mt-1 px-3 py-1.5 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">정규직 전환 급여 (만원)</label>
                    <input type="number" placeholder="예: 4000" value={offerConditions.regular_salary}
                      onChange={(e) => setOfferConditions(p => ({ ...p, regular_salary: e.target.value }))}
                      className="w-full mt-1 px-3 py-1.5 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">직무명</label>
                    <input type="text" placeholder="예: 마케팅 기획" value={offerConditions.job_title}
                      onChange={(e) => setOfferConditions(p => ({ ...p, job_title: e.target.value }))}
                      className="w-full mt-1 px-3 py-1.5 border rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">입사 예정일</label>
                  <input type="date" value={offerConditions.start_date}
                    onChange={(e) => setOfferConditions(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full mt-1 px-3 py-1.5 border rounded-lg text-sm" />
                </div>
              </div>
            )}

            {/* 이메일 발송 옵션 */}
            <div className="border rounded-lg p-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <Mail className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">지원자에게 결과 이메일 발송</span>
              </label>

              {sendEmail && (
                <div className="ml-6 space-y-2">
                  <p className="text-xs text-gray-500">
                    받는 사람: <strong>{candidate.email}</strong>
                  </p>
                  <p className="text-xs text-gray-500">
                    제목: <strong>
                      {decisionDialog.decision === 'hired'
                        ? `[인터오리진] ${candidate.name}님, 합격을 축하드립니다`
                        : `[인터오리진] ${candidate.name}님, 채용 결과 안내`}
                    </strong>
                  </p>
                  <div className="border rounded p-3 bg-gray-50 max-h-40 overflow-y-auto">
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {decisionDialog.decision === 'hired' ? (
                        <>
                          {candidate.name}님, 안녕하세요.<br />
                          인터오리진에 관심을 가져주시고 채용 과정에 참여해 주셔서 진심으로 감사드립니다.<br /><br />
                          <strong className="text-green-700">합격을 축하드립니다!</strong><br /><br />
                          심사숙고 끝에 {candidate.name}님을 인터오리진의 새로운 구성원으로 모시게 되었습니다.
                          입사 일정 및 필요 서류 등 세부 사항은 별도로 안내드릴 예정입니다.
                        </>
                      ) : (
                        <>
                          {candidate.name}님, 안녕하세요.<br />
                          인터오리진에 관심을 가져주시고 채용 과정에 참여해 주셔서 진심으로 감사드립니다.<br /><br />
                          안타깝지만, 종합적인 검토 결과 이번 채용에서는 함께하지 못하게 되었음을 알려드립니다.<br /><br />
                          {candidate.name}님의 역량과 경험은 충분히 인상적이었으며,
                          향후 적합한 포지션이 생길 경우 다시 연락드릴 수 있기를 희망합니다.
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setDecisionDialog({ open: false, decision: null })}
                disabled={decidingInProgress}
              >
                취소
              </Button>
              <Button
                variant={decisionDialog.decision === 'hired' ? 'primary' : 'danger'}
                onClick={() => handleHiringDecision(decisionDialog.decision!)}
                disabled={decidingInProgress}
              >
                {decidingInProgress ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 처리 중...</>
                ) : (
                  <>
                    {sendEmail ? <Mail className="h-4 w-4 mr-1" /> : decisionDialog.decision === 'hired' ? <CheckCircle className="h-4 w-4 mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                    {decisionDialog.decision === 'hired' ? '합격' : '불합격'} 확정{sendEmail ? ' 및 이메일 발송' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
