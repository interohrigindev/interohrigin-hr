import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Sparkles, Loader2, CheckCircle, XCircle, AlertTriangle, Video, MapPin, Calendar, ClipboardList, RefreshCw, Send, Mail, MessageCircle, Trash2, Printer, Link2, Copy, EyeOff, Pencil, Upload } from 'lucide-react'
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
  // 포트폴리오 파일별 signed URL 매핑 (path → URL)
  const [portfolioSignedUrls, setPortfolioSignedUrls] = useState<Record<string, string>>({})
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
  const [hiringDecision, setHiringDecision] = useState<{
    decision: string
    offered_salary: number | null
    offered_position: string | null
    start_date: string | null
    offer_conditions: Record<string, any> | null
    candidate_response: Record<string, any> | null
    created_at: string
  } | null>(null)
  const [duplicateCandidates, setDuplicateCandidates] = useState<{ id: string; name: string; status: string; created_at: string; job_posting_id: string | null }[]>([])
  const [jobTitle, setJobTitle] = useState<string | null>(null)
  // 지원자 기본 정보 인라인 편집
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  // 포트폴리오 추가
  const [portfolioUploading, setPortfolioUploading] = useState(false)
  const [portfolioLinkForm, setPortfolioLinkForm] = useState({ url: '', label: '' })
  // 외부 공유 링크
  const [shareLinks, setShareLinks] = useState<{ id: string; token: string; expires_at: string | null; is_active: boolean; note: string | null; created_at: string; view_count: number; last_viewed_at: string | null }[]>([])
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareNote, setShareNote] = useState('')
  const [shareExpiresDays, setShareExpiresDays] = useState<string>('14')
  const [creatingShare, setCreatingShare] = useState(false)

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

        // 포트폴리오 파일별 signed URL 일괄 생성
        const pfList = (cand as unknown as { portfolio_files?: { path: string; filename: string; size: number }[] }).portfolio_files || []
        if (pfList.length > 0) {
          const urlMap: Record<string, string> = {}
          for (const pf of pfList) {
            if (!pf.path) continue
            if (pf.path.startsWith('http')) {
              urlMap[pf.path] = pf.path
              continue
            }
            const { data } = await supabase.storage.from('resumes').createSignedUrl(pf.path, 3600)
            if (data?.signedUrl) urlMap[pf.path] = data.signedUrl
          }
          setPortfolioSignedUrls(urlMap)
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

      // AI 면접 질문 + 직무명 로딩
      if (cand?.job_posting_id) {
        const { data: jp } = await supabase
          .from('job_postings')
          .select('ai_questions, title')
          .eq('id', cand.job_posting_id)
          .single()
        if (jp?.ai_questions) setAiQuestions((jp.ai_questions as string[]) || [])
        if (jp?.title) setJobTitle(jp.title)
      }

      // 면접관 코멘트 로딩
      if (cand?.interviewer_comments) {
        setComments((cand.interviewer_comments as typeof comments) || [])
      }

      // 중복 지원자 체크 (같은 이름 + 같은 전화번호 또는 이메일)
      if (cand) {
        const { data: dupes } = await supabase
          .from('candidates')
          .select('id, name, status, created_at, job_posting_id')
          .neq('id', id)
          .or(`name.eq.${cand.name},email.eq.${cand.email}`)
          .order('created_at', { ascending: false })
          .limit(10)
        if (dupes && dupes.length > 0) setDuplicateCandidates(dupes)
      }

      // 합격 결정 + 지원자 응답 로드
      const { data: hdData } = await supabase
        .from('hiring_decisions')
        .select('decision, offered_salary, offered_position, start_date, offer_conditions, candidate_response, created_at')
        .eq('candidate_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (hdData) setHiringDecision(hdData)

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
    loadShareLinks()
  }, [id])

  async function loadShareLinks() {
    if (!id) return
    const { data } = await supabase
      .from('candidate_share_links')
      .select('id, token, expires_at, is_active, note, created_at, view_count, last_viewed_at')
      .eq('candidate_id', id)
      .order('created_at', { ascending: false })
    setShareLinks((data as any) || [])
  }

  async function createShareLink() {
    if (!id || !profile?.id) return
    setCreatingShare(true)
    try {
      const days = parseInt(shareExpiresDays, 10)
      const expires_at = days > 0 ? new Date(Date.now() + days * 86400 * 1000).toISOString() : null
      const { error } = await supabase.from('candidate_share_links').insert({
        candidate_id: id,
        expires_at,
        note: shareNote.trim() || null,
        created_by: profile.id,
      })
      if (error) throw error
      toast('공유 링크가 생성되었습니다.', 'success')
      setShareDialogOpen(false)
      setShareNote('')
      setShareExpiresDays('14')
      await loadShareLinks()
    } catch (e: any) {
      toast(e.message || '공유 링크 생성 실패', 'error')
    } finally {
      setCreatingShare(false)
    }
  }

  async function deactivateShareLink(linkId: string) {
    if (!confirm('이 공유 링크를 비활성화하시겠습니까?')) return
    const { error } = await supabase
      .from('candidate_share_links')
      .update({ is_active: false })
      .eq('id', linkId)
    if (error) {
      toast(error.message, 'error')
      return
    }
    toast('비활성화되었습니다.', 'success')
    await loadShareLinks()
  }

  function copyShareUrl(token: string) {
    const url = `${window.location.origin}/share/candidate/${token}`
    navigator.clipboard.writeText(url).then(
      () => toast('링크가 복사되었습니다.', 'success'),
      () => toast('복사 실패. 직접 복사해주세요.', 'error'),
    )
  }

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

      // Gemini 지원 MIME: pdf, image/*, text/plain
      const GEMINI_SUPPORTED: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        txt: 'text/plain',
      }

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

          const ext = filePath.split('.').pop()?.toLowerCase() || ''

          // Word(.doc/.docx) → 텍스트 추출하여 text/plain으로 전달
          if (ext === 'docx' || ext === 'doc') {
            const text = await extractTextFromDocx(data)
            if (text) {
              const base64 = btoa(unescape(encodeURIComponent(text)))
              return { base64, mimeType: 'text/plain' }
            }
            return null
          }

          // Gemini 미지원 MIME 타입은 건너뜀
          const mimeType = GEMINI_SUPPORTED[ext]
          if (!mimeType) return null

          const arrayBuffer = await data.arrayBuffer()
          const uint8 = new Uint8Array(arrayBuffer)
          let binary = ''
          for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
          const base64 = btoa(binary)

          return { base64, mimeType }
        } catch {
          return null
        }
      }

      // docx에서 텍스트 추출 (바이너리에서 XML 텍스트 추출)
      async function extractTextFromDocx(blob: Blob): Promise<string | null> {
        try {
          const buffer = await blob.arrayBuffer()
          const bytes = new Uint8Array(buffer)
          // docx는 ZIP 파일 — 바이너리에서 <w:t> 태그를 직접 찾아 텍스트 추출
          const decoder = new TextDecoder('utf-8', { fatal: false })
          const raw = decoder.decode(bytes)
          const matches = raw.match(/<w:t[^>]*>([^<]*)<\/w:t>/g)
          if (matches && matches.length > 0) {
            return matches.map((m) => m.replace(/<[^>]+>/g, '')).join(' ').trim()
          }
          return null
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

      const today = new Date()
      const todayStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`
      const todayYear = today.getFullYear()
      const todayMonth = today.getMonth() + 1

      const prompt = `[ABSOLUTE TIME ANCHOR — 반드시 준수]
오늘 날짜: ${todayStr} (${todayYear}년 ${todayMonth}월)
당신의 학습 시점이 아닌 위 날짜를 "현재" 로 사용하세요. 이 시스템 시계는 정확합니다.

[날짜 해석 규칙]
- 종료일 < ${todayStr} → 이미 완료된 과거 경력/학력 (확정된 사실)
- 종료일 = ${todayStr} → 오늘 종료
- 종료일 > ${todayStr} → 미래 (졸업 예정 등)

[검증 예시 — 반드시 이 패턴으로 판단]
오늘이 ${todayStr} 일 때:
✅ "2021.03~2026.02 졸업" → 2026.02 < ${todayStr} → "이미 졸업한 학사 학위자" (재학 X, 졸업 예정 X)
✅ "2025.04~2025.12 경력" → 2025.12 < ${todayStr} → "이미 종료된 9개월 경력" (현재 재직 X)
✅ "2026.03 자격증 취득" → 2026.03 < ${todayStr} → "이미 취득한 자격증" (취득 예정 X)
❌ "이력서 상의 미래 시점 경력 표기 오류" 같은 우려 절대 작성 금지 — 모두 과거 사실

[금지 표현]
"미래 시점", "졸업 예정", "취득 예정", "기재 오류", "신뢰성 의심" — 종료일이 ${todayStr} 이전인 항목에 절대 사용 금지

당신은 기업 인사팀의 채용 담당자입니다. 아래 채용공고에 지원한 후보자의 제출 서류를 기반으로 서류 심사 의견서를 작성해주세요.

[채용공고]
${postingInfo || '정보 없음'}

[지원자 제출 정보]
이름: ${candidate.name}
이력서: ${candidate.resume_url ? '제출됨 (파일 첨부)' : '미제출'}
자기소개서 파일: ${candidate.cover_letter_url ? '제출됨 (파일 첨부)' : '미제출'}
자기소개서 텍스트: ${candidate.cover_letter_text || '작성하지 않음'}
${(() => {
  const pfFiles = (candidate as unknown as { portfolio_files?: { filename: string; size: number }[] }).portfolio_files || []
  const pfLinks = (candidate as unknown as { portfolio_links?: { url: string; label: string }[] }).portfolio_links || []
  if (pfFiles.length === 0 && pfLinks.length === 0) return ''
  const parts: string[] = []
  if (pfFiles.length > 0) parts.push(`포트폴리오 파일: ${pfFiles.map((p) => p.filename).join(', ')} (${pfFiles.length}개)`)
  if (pfLinks.length > 0) parts.push(`포트폴리오 링크: ${pfLinks.map((l) => `${l.label || '링크'}(${l.url})`).join(' | ')}`)
  return parts.join('\n')
})()}
${fileInfo}

[요청사항]
위 정보와 첨부된 파일 내용을 꼼꼼히 분석하여 서류 심사 의견을 아래 JSON 형식으로 작성해주세요. 반드시 순수 JSON만 출력하고 다른 텍스트는 포함하지 마세요.

{"summary":"서류 심사 요약 1~2문장","strengths":["강점1","강점2","강점3"],"weaknesses":["약점1","약점2"],"position_fit":50,"organization_fit":50,"suggested_department":"추천 배치 부서","suggested_position":"추천 직급","suggested_salary_range":"추천 연봉 범위","red_flags":["우려사항"],"recommendation":"PROCEED"}

필드 설명:
- position_fit, organization_fit: 0~100 정수
- recommendation: PROCEED(서류통과), REVIEW(추가검토필요), REJECT(부적합) 중 택 1
- 날짜 해석 오류로 인한 부적합 판정 금지 — 이력서의 졸업일·경력 종료일이 현재 날짜(${todayStr}) 이전이면 "이미 완료" 로 처리`

      let result
      try {
        result = await generateAIContent(config, prompt, files.length > 0 ? files : undefined)
      } catch (aiErr: any) {
        // 1차 AI 실패 시 다른 엔진으로 폴백
        setAnalysisStatus('AI 엔진 전환 중...')
        const { data: fallback } = await supabase
          .from('ai_settings')
          .select('provider, api_key, model')
          .eq('is_active', true)
          .neq('provider', 'deepgram')
          .neq('provider', config.provider)
          .limit(1)
          .single()
        if (fallback) {
          result = await generateAIContent(
            { provider: fallback.provider, apiKey: fallback.api_key, model: fallback.model },
            prompt, files.length > 0 ? files : undefined
          )
        } else {
          throw aiErr
        }
      }

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
        // JSON 파싱 (3단계 폴백)
        try {
          parsed = JSON.parse(raw)
        } catch {
          raw = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
          const jsonMatch = raw.match(/\{[\s\S]*\}/)
          if (!jsonMatch) throw new Error('JSON 없음')
          let jsonStr = jsonMatch[0].replace(/,\s*([\]}])/g, '$1').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
          try {
            parsed = JSON.parse(jsonStr)
          } catch {
            jsonStr = jsonStr.replace(/"((?:[^"\\]|\\.)*)"/g, (m) => m.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'))
            parsed = JSON.parse(jsonStr)
          }
        }
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

      // 지원자 상태 업데이트 — 이미 다음 단계(질의서/면접 등)로 진행된 경우 회귀 금지
      const PRE_RESUME_STATES = ['applied']
      const shouldAdvanceStatus = PRE_RESUME_STATES.includes(candidate?.status || '')
      if (shouldAdvanceStatus) {
        await supabase
          .from('candidates')
          .update({ status: 'resume_reviewed' })
          .eq('id', id)
        setCandidate((prev) => prev ? { ...prev, status: 'resume_reviewed' } : prev)
      }

      setAnalysis(savedAnalysis as ResumeAnalysis)
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
      // 이미 결정/합격/불합격 단계로 진행된 경우 status 회귀 금지
      const POST_ANALYZED = ['decided', 'hired', 'rejected']
      if (!POST_ANALYZED.includes(candidate?.status || '')) {
        setCandidate((prev) => prev ? { ...prev, status: 'analyzed' } : prev)
      }
      toast('종합 분석이 완료되었습니다.', 'success')
      setActiveTab('comprehensive')
    } catch (err: any) {
      toast('종합 분석 실패: ' + err.message, 'error')
    }
    setComprehensiveAnalyzing(false)
  }

  function openProfileEdit() {
    if (!candidate) return
    setProfileForm({
      name: candidate.name || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
    })
    setEditingProfile(true)
  }

  async function handleSaveProfile() {
    if (!candidate || !id) return
    const name = profileForm.name.trim()
    const email = profileForm.email.trim()
    const phone = profileForm.phone.trim()
    if (!name) { toast('이름은 필수입니다.', 'error'); return }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('올바른 이메일을 입력하세요.', 'error'); return
    }
    setSavingProfile(true)
    const { error } = await supabase
      .from('candidates')
      .update({ name, email, phone: phone || null })
      .eq('id', id)
    setSavingProfile(false)
    if (error) { toast('저장 실패: ' + error.message, 'error'); return }
    setCandidate((p) => p ? { ...p, name, email, phone: phone || null } : p)
    setEditingProfile(false)
    toast('지원자 정보가 수정되었습니다. 사전질의서를 재발송하면 새 이메일로 전송됩니다.', 'success')
  }

  async function handleNoShow() {
    if (!id || !candidate) return
    if (!confirm(`${candidate.name} 지원자를 '지원 불참'으로 처리합니다. (면접 무단 불참 등)\n\n이 작업은 되돌릴 수 있으나 평가 흐름에서 제외됩니다. 계속하시겠습니까?`)) return
    const { error } = await supabase.from('candidates').update({ status: 'no_show' }).eq('id', id)
    if (error) { toast('처리 실패: ' + error.message, 'error'); return }
    setCandidate((p) => p ? { ...p, status: 'no_show' as any } : p)
    toast('지원 불참으로 처리되었습니다.', 'success')
  }

  // 0512 미팅: 사전 질의서를 고정 단계에서 제거 — proceed = 면접 단계로 진행 (이메일 발송 X)
  async function handleDecision(decision: 'proceed' | 'reject') {
    if (!id || !candidate) return
    const newStatus = decision === 'proceed' ? 'interview_scheduled' : 'rejected'
    const { error } = await supabase
      .from('candidates')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) {
      toast('상태 변경 실패', 'error')
    } else {
      toast(decision === 'proceed' ? '1차 면접 단계로 진행했습니다.' : '불합격 처리되었습니다.', 'success')
      setCandidate((prev) => prev ? { ...prev, status: newStatus as CandidateStatus } : prev)
    }
  }

  // 사전 질의서 별도 발송 — 현재 단계와 무관하게 언제든 발송 가능 (0512 미팅 별건 옵션)
  async function handleSendSurvey() {
    if (!id || !candidate) return
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
      const sentAt = new Date().toISOString()
      const updatedHistory = [
        ...((candidate.survey_send_history as { sent_at: string }[] | undefined) || []),
        { sent_at: sentAt },
      ]
      await supabase
        .from('candidates')
        .update({ survey_send_history: updatedHistory })
        .eq('id', id)
      setCandidate((p) => p ? { ...p, survey_send_history: updatedHistory } : p)
      toast('사전 질의서가 발송되었습니다.', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '네트워크 오류'
      toast('발송 실패: ' + message, 'error')
    }
    setResendingSurvey(false)
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
      const offerToken = crypto.randomUUID()
      const { data: hdData } = await supabase.from('hiring_decisions').insert({
        candidate_id: id,
        decision,
        decided_by: null,
        ai_recommendation: report.ai_recommendation,
        ai_score: report.overall_score,
        offered_salary: decision === 'hired' && offerConditions.salary ? parseInt(offerConditions.salary) : null,
        offered_position: decision === 'hired' ? offerConditions.job_title || null : null,
        start_date: decision === 'hired' && offerConditions.start_date ? offerConditions.start_date : null,
        offer_token: decision === 'hired' ? offerToken : null,
        offer_conditions: decision === 'hired' ? {
          probation_salary: offerConditions.probation_salary || null,
          regular_salary: offerConditions.regular_salary || null,
        } : null,
      }).select('offer_token').single()

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
          const acceptUrl = decision === 'hired' && hdData?.offer_token
            ? `${window.location.origin}/accept/${hdData.offer_token}`
            : undefined
          const template = decision === 'hired'
            ? hiringAcceptEmail(candidate.name, jobTitle, {
                salary: offerConditions.salary,
                probation_salary: offerConditions.probation_salary,
                regular_salary: offerConditions.regular_salary,
                job_title: offerConditions.job_title,
                start_date: offerConditions.start_date,
              }, acceptUrl)
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

  // ─── 포트폴리오 추가/삭제 ──────────────────────────────────
  async function handleUploadPortfolioFiles(fileList: FileList) {
    if (!candidate || !id) return
    setPortfolioUploading(true)
    try {
      const existing = (candidate as unknown as { portfolio_files?: { path: string; filename: string; size: number }[] }).portfolio_files || []
      const uploaded: { path: string; filename: string; size: number }[] = []
      for (const file of Array.from(fileList)) {
        if (file.size > 50 * 1024 * 1024) {
          toast(`${file.name} — 50MB 초과로 건너뜀`, 'error')
          continue
        }
        const safeName = file.name.replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ.\-]/g, '_')
        const path = `portfolios/${id}/${Date.now()}_${safeName}`
        const { error } = await supabase.storage.from('resumes').upload(path, file, { upsert: false })
        if (error) {
          toast(`${file.name} 업로드 실패: ${error.message}`, 'error')
          continue
        }
        uploaded.push({ path, filename: file.name, size: file.size })
        const { data: sUrl } = await supabase.storage.from('resumes').createSignedUrl(path, 3600)
        if (sUrl?.signedUrl) setPortfolioSignedUrls((m) => ({ ...m, [path]: sUrl.signedUrl }))
      }
      if (uploaded.length === 0) { setPortfolioUploading(false); return }
      const merged = [...existing, ...uploaded]
      const { error: updErr } = await supabase
        .from('candidates')
        .update({ portfolio_files: merged })
        .eq('id', id)
      if (updErr) { toast('저장 실패: ' + updErr.message, 'error'); setPortfolioUploading(false); return }
      setCandidate((p) => p ? ({ ...p, portfolio_files: merged } as unknown as typeof p) : p)
      toast(`${uploaded.length}개 파일이 첨부되었습니다.`, 'success')
    } catch (err: any) {
      toast('업로드 오류: ' + err.message, 'error')
    }
    setPortfolioUploading(false)
  }

  async function handleDeletePortfolioFile(path: string) {
    if (!candidate || !id) return
    if (!confirm('해당 포트폴리오 파일을 삭제할까요?')) return
    const existing = (candidate as unknown as { portfolio_files?: { path: string; filename: string; size: number }[] }).portfolio_files || []
    const next = existing.filter((p) => p.path !== path)
    await supabase.storage.from('resumes').remove([path])
    const { error } = await supabase.from('candidates').update({ portfolio_files: next }).eq('id', id)
    if (error) { toast('삭제 실패: ' + error.message, 'error'); return }
    setCandidate((p) => p ? ({ ...p, portfolio_files: next } as unknown as typeof p) : p)
    toast('파일이 삭제되었습니다.', 'success')
  }

  async function handleAddPortfolioLink() {
    if (!candidate || !id) return
    const url = portfolioLinkForm.url.trim()
    if (!url || !/^https?:\/\//i.test(url)) { toast('http(s):// 로 시작하는 URL을 입력하세요.', 'error'); return }
    const label = portfolioLinkForm.label.trim() || '포트폴리오'
    const existing = (candidate as unknown as { portfolio_links?: { url: string; label: string }[] }).portfolio_links || []
    const next = [...existing, { url, label }]
    const { error } = await supabase.from('candidates').update({ portfolio_links: next }).eq('id', id)
    if (error) { toast('저장 실패: ' + error.message, 'error'); return }
    setCandidate((p) => p ? ({ ...p, portfolio_links: next } as unknown as typeof p) : p)
    setPortfolioLinkForm({ url: '', label: '' })
    toast('링크가 추가되었습니다.', 'success')
  }

  async function handleDeletePortfolioLink(idx: number) {
    if (!candidate || !id) return
    const existing = (candidate as unknown as { portfolio_links?: { url: string; label: string }[] }).portfolio_links || []
    const next = existing.filter((_, i) => i !== idx)
    const { error } = await supabase.from('candidates').update({ portfolio_links: next }).eq('id', id)
    if (error) { toast('삭제 실패: ' + error.message, 'error'); return }
    setCandidate((p) => p ? ({ ...p, portfolio_links: next } as unknown as typeof p) : p)
    toast('링크가 삭제되었습니다.', 'success')
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

      // 상태를 survey_sent로 리셋 + pre_survey_data 초기화 + 발송 이력 push
      const sentAt = new Date().toISOString()
      const updatedHistory = [
        ...((candidate.survey_send_history as { sent_at: string }[] | undefined) || []),
        { sent_at: sentAt },
      ]
      await supabase
        .from('candidates')
        .update({ status: 'survey_sent', pre_survey_data: null, survey_send_history: updatedHistory })
        .eq('id', candidate.id)

      setCandidate((prev) => prev ? {
        ...prev,
        status: 'survey_sent' as CandidateStatus,
        pre_survey_data: null,
        survey_send_history: updatedHistory,
      } : prev)
      toast('사전질의서가 재발송되었습니다.', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '네트워크 오류'
      toast('재발송 실패: ' + message, 'error')
    }
    setResendingSurvey(false)
  }

  // 사전질의서 인쇄
  function handlePrintSurvey() {
    if (!candidate || !candidate.pre_survey_data) return
    const surveyData = candidate.pre_survey_data as {
      answers?: Record<string, string>
      meta?: { birth_date?: string; mbti?: string; hanja_name?: string; blood_type?: string }
      completed_at?: string
    }

    const metaRows: string[] = []
    if (surveyData.meta?.birth_date) metaRows.push(`<td><strong>생년월일</strong><br/>${surveyData.meta.birth_date}</td>`)
    if (surveyData.meta?.mbti) metaRows.push(`<td><strong>MBTI</strong><br/>${surveyData.meta.mbti}</td>`)
    if (surveyData.meta?.hanja_name) metaRows.push(`<td><strong>한자 이름</strong><br/>${surveyData.meta.hanja_name}</td>`)
    if (surveyData.meta?.blood_type) metaRows.push(`<td><strong>혈액형</strong><br/>${surveyData.meta.blood_type}형</td>`)

    let qaHtml = ''
    if (surveyData.answers && Object.keys(surveyData.answers).length > 0) {
      if (surveyQuestions.length > 0) {
        qaHtml = surveyQuestions.map((q, i) => {
          const ans = surveyData.answers?.[q.id] || '미응답'
          return `<div class="qa"><p class="q">Q${i + 1}. ${q.question}${q.required ? ' <span style="color:red">*</span>' : ''}</p><p class="a">${ans}</p></div>`
        }).join('')
      } else {
        qaHtml = Object.entries(surveyData.answers).map(([, answer], i) =>
          `<div class="qa"><p class="q">질문 ${i + 1}</p><p class="a">${answer}</p></div>`
        ).join('')
      }
    }

    let insightHtml = ''
    if (candidate.pre_survey_analysis && (candidate.pre_survey_analysis as Record<string, unknown>).survey_insights) {
      insightHtml = `<div class="insight"><p class="insight-title">AI 질의서 분석 인사이트</p><p>${(candidate.pre_survey_analysis as Record<string, unknown>).survey_insights}</p></div>`
    }

    const completedAt = surveyData.completed_at ? `<p class="completed">응답 완료: ${formatDate(surveyData.completed_at, 'yyyy.MM.dd HH:mm')}</p>` : ''

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>사전질의서 - ${candidate.name}</title>
<style>
  @page { margin: 20mm; }
  body { font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 700px; margin: 0 auto; }
  h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 4px; }
  .sub { font-size: 13px; color: #666; margin-bottom: 24px; }
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  .meta-table td { border: 1px solid #ddd; padding: 10px 14px; text-align: center; font-size: 13px; }
  .meta-table strong { display: block; font-size: 11px; color: #666; margin-bottom: 2px; }
  .qa { background: #f8f8f8; border-radius: 6px; padding: 12px 16px; margin-bottom: 12px; }
  .q { font-size: 12px; font-weight: 600; color: #444; margin: 0 0 4px 0; }
  .a { font-size: 14px; margin: 0; white-space: pre-wrap; }
  .insight { background: #f0f7ff; border: 1px solid #c8ddf5; border-radius: 6px; padding: 12px 16px; margin-top: 20px; }
  .insight-title { font-size: 12px; font-weight: 600; color: #2563eb; margin: 0 0 4px 0; }
  .insight p:last-child { font-size: 13px; margin: 0; }
  .completed { font-size: 11px; color: #999; text-align: right; margin-top: 16px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <h1>사전 질의서</h1>
  <p class="sub">${candidate.name} · ${candidate.email || ''}</p>
  ${metaRows.length > 0 ? `<table class="meta-table"><tr>${metaRows.join('')}</tr></table>` : ''}
  ${qaHtml}
  ${insightHtml}
  ${completedAt}
</body></html>`

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.onload = () => printWindow.print()
    }
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

      // 첨부 파일 다운로드 (Gemini 지원 형식만, docx→텍스트 변환)
      const files: AIFileAttachment[] = []
      async function downloadFileAsBase64ForSurvey(storagePath: string): Promise<{ base64: string; mimeType: string } | null> {
        try {
          let filePath = storagePath
          if (storagePath.startsWith('http')) {
            const match = storagePath.match(/\/resumes\/(.+)$/)
            if (match) filePath = match[1]
            else return null
          }
          const { data, error } = await supabase.storage.from('resumes').download(filePath)
          if (error || !data) return null
          const ext = filePath.split('.').pop()?.toLowerCase() || ''

          // Word(.doc/.docx) → 텍스트 추출
          if (ext === 'docx' || ext === 'doc') {
            try {
              const text = await data.text()
              const matches = text.match(/<w:t[^>]*>([^<]*)<\/w:t>/g)
              if (matches) {
                const extracted = matches.map((m) => m.replace(/<[^>]+>/g, '')).join(' ')
                return { base64: btoa(unescape(encodeURIComponent(extracted))), mimeType: 'text/plain' }
              }
            } catch {}
            return null
          }

          const supported: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain' }
          const mimeType = supported[ext]
          if (!mimeType) return null

          const arrayBuffer = await data.arrayBuffer()
          const uint8 = new Uint8Array(arrayBuffer)
          let binary = ''
          for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
          return { base64: btoa(binary), mimeType }
        } catch { return null }
      }
      setAnalysisStatus('첨부 파일 다운로드 중...')
      if (candidate.resume_url) {
        const file = await downloadFileAsBase64ForSurvey(candidate.resume_url)
        if (file) files.push({ ...file, name: '이력서' })
      }
      if (candidate.cover_letter_url) {
        const file = await downloadFileAsBase64ForSurvey(candidate.cover_letter_url)
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

      const today = new Date()
      const todayStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`
      const todayYear = today.getFullYear()
      const todayMonth = today.getMonth() + 1

      const prompt = `[ABSOLUTE TIME ANCHOR — 반드시 준수]
오늘 날짜: ${todayStr} (${todayYear}년 ${todayMonth}월)
당신의 학습 시점이 아닌 위 날짜를 "현재" 로 사용하세요. 이 시스템 시계는 정확합니다.

[날짜 해석 규칙]
- 종료일 < ${todayStr} → 이미 완료된 과거 사실
- 종료일 > ${todayStr} → 미래 (예정)

[검증 예시]
✅ "2026.02 졸업" 이고 오늘이 ${todayStr} 이면 → 이미 졸업한 학사 학위자
✅ "2025.04~2025.12 경력" → 이미 종료된 과거 경력
❌ "미래 시점 표기 오류" 같은 우려 절대 작성 금지 — 종료일이 ${todayStr} 이전이면 모두 과거 사실

당신은 기업 인사팀의 채용 담당자입니다. 아래 채용공고에 지원한 후보자의 제출 서류와 사전 질의서 응답을 기반으로 서류+질의서 심사 의견서를 작성해주세요.

[채용공고]
${postingInfo || '정보 없음'}

[지원자 제출 정보]
이름: ${candidate.name}
이력서: ${candidate.resume_url ? '제출됨 (파일 첨부)' : '미제출'}
자기소개서 파일: ${candidate.cover_letter_url ? '제출됨 (파일 첨부)' : '미제출'}
자기소개서 텍스트: ${candidate.cover_letter_text || '작성하지 않음'}
${(() => {
  const pfFiles = (candidate as unknown as { portfolio_files?: { filename: string; size: number }[] }).portfolio_files || []
  const pfLinks = (candidate as unknown as { portfolio_links?: { url: string; label: string }[] }).portfolio_links || []
  if (pfFiles.length === 0 && pfLinks.length === 0) return ''
  const parts: string[] = []
  if (pfFiles.length > 0) parts.push(`포트폴리오 파일: ${pfFiles.map((p) => p.filename).join(', ')} (${pfFiles.length}개)`)
  if (pfLinks.length > 0) parts.push(`포트폴리오 링크: ${pfLinks.map((l) => `${l.label || '링크'}(${l.url})`).join(' | ')}`)
  return parts.join('\n')
})()}
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
          {jobTitle && (
            <Badge variant="info" className="mb-1 text-xs">{jobTitle}</Badge>
          )}
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

      {/* 외부 공유 링크 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" /> 외부 공유 링크
            </CardTitle>
            <Button size="sm" onClick={() => setShareDialogOpen(true)}>
              <Link2 className="h-3.5 w-3.5 mr-1" /> 공유 링크 생성
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {shareLinks.length === 0 ? (
            <p className="text-sm text-gray-500">생성된 공유 링크가 없습니다. 대표님 등 외부 인원에게 로그인 없이 지원자 정보를 보여줄 수 있습니다.</p>
          ) : (
            <ul className="space-y-2">
              {shareLinks.map((lk) => {
                const expired = lk.expires_at && new Date(lk.expires_at) < new Date()
                const url = `${window.location.origin}/share/candidate/${lk.token}`
                return (
                  <li key={lk.id} className={`border rounded-lg p-3 ${!lk.is_active || expired ? 'bg-gray-50 border-gray-200 opacity-70' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {lk.note && <span className="text-sm font-medium text-gray-900">{lk.note}</span>}
                          {!lk.is_active && <Badge variant="default" className="bg-gray-200 text-gray-600">비활성</Badge>}
                          {expired && lk.is_active && <Badge variant="default" className="bg-amber-100 text-amber-700">만료</Badge>}
                          {lk.is_active && !expired && <Badge variant="default" className="bg-emerald-100 text-emerald-700">활성</Badge>}
                        </div>
                        <p className="text-xs text-gray-500 break-all">{url}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          생성 {formatDate(lk.created_at, 'yyyy.MM.dd')}
                          {lk.expires_at && ` · 만료 ${formatDate(lk.expires_at, 'yyyy.MM.dd')}`}
                          {' · '}조회 {lk.view_count}회
                          {lk.last_viewed_at && ` (최근 ${formatDate(lk.last_viewed_at, 'yyyy.MM.dd')})`}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => copyShareUrl(lk.token)} disabled={!lk.is_active || !!expired}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {lk.is_active && (
                          <Button variant="outline" size="sm" onClick={() => deactivateShareLink(lk.id)}>
                            <EyeOff className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} title="공유 링크 생성">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메모 (선택)</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="예: 대표님 검토용"
              value={shareNote}
              onChange={(e) => setShareNote(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">유효 기간</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={shareExpiresDays}
              onChange={(e) => setShareExpiresDays(e.target.value)}
            >
              <option value="3">3일</option>
              <option value="7">7일</option>
              <option value="14">14일 (권장)</option>
              <option value="30">30일</option>
              <option value="0">만료 없음</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>취소</Button>
            <Button onClick={createShareLink} disabled={creatingShare}>
              {creatingShare && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              생성
            </Button>
          </div>
        </div>
      </Dialog>

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

              {/* 포트폴리오 — 파일 목록 + 외부 링크 + 추가 UI */}
              {(() => {
                const pfFiles = (candidate as unknown as { portfolio_files?: { path: string; filename: string; size: number }[] }).portfolio_files || []
                const pfLinks = (candidate as unknown as { portfolio_links?: { url: string; label: string }[] }).portfolio_links || []
                return (
                  <div className="mt-2 pt-3 border-t border-gray-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-600">
                        📎 포트폴리오 ({pfFiles.length}개 파일 / {pfLinks.length}개 링크)
                      </p>
                      <label className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg cursor-pointer transition-colors">
                        {portfolioUploading ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> 업로드 중...</>
                        ) : (
                          <><Upload className="h-3 w-3" /> 파일 첨부</>
                        )}
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          disabled={portfolioUploading}
                          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.ppt,.pptx,.zip,.psd,.ai,.fig,.sketch,.mp4,.mov"
                          onChange={async (e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              await handleUploadPortfolioFiles(e.target.files)
                              e.target.value = ''
                            }
                          }}
                        />
                      </label>
                    </div>

                    {/* 링크 추가 폼 (인라인) */}
                    <div className="flex items-center gap-1.5 p-2 bg-blue-50/60 border border-dashed border-blue-200 rounded-lg">
                      <input
                        type="text"
                        placeholder="라벨 (예: Behance)"
                        value={portfolioLinkForm.label}
                        onChange={(e) => setPortfolioLinkForm((f) => ({ ...f, label: e.target.value }))}
                        className="w-32 px-2 py-1 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                      <input
                        type="url"
                        placeholder="https://..."
                        value={portfolioLinkForm.url}
                        onChange={(e) => setPortfolioLinkForm((f) => ({ ...f, url: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddPortfolioLink() } }}
                        className="flex-1 min-w-0 px-2 py-1 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                      <button
                        type="button"
                        onClick={handleAddPortfolioLink}
                        className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md shrink-0"
                      >
                        링크 추가
                      </button>
                    </div>

                    {pfFiles.length === 0 && pfLinks.length === 0 && (
                      <p className="text-[11px] text-gray-400 text-center py-2">아직 첨부된 포트폴리오가 없습니다.</p>
                    )}

                    {pfFiles.map((pf, i) => {
                      const url = portfolioSignedUrls[pf.path]
                      return (
                        <div key={`pf-${i}`} className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-emerald-600 shrink-0">📄</span>
                            <span className="text-sm text-emerald-900 truncate">{pf.filename}</span>
                            <span className="text-[10px] text-emerald-600 shrink-0">({(pf.size / 1024 / 1024).toFixed(1)}MB)</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-700 hover:underline">다운로드</a>
                            ) : (
                              <span className="text-xs text-gray-400">URL 생성 중...</span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeletePortfolioFile(pf.path)}
                              className="p-1 rounded-md text-red-500 hover:bg-red-50"
                              title="삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {pfLinks.map((l, i) => (
                      <div key={`pl-${i}`} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-blue-600 shrink-0">🔗</span>
                          <span className="text-sm text-blue-900 font-medium shrink-0">{l.label || '포트폴리오'}</span>
                          <span className="text-xs text-blue-700 truncate">{l.url}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:underline">열기</a>
                          <button
                            type="button"
                            onClick={() => handleDeletePortfolioLink(i)}
                            className="p-1 rounded-md text-red-500 hover:bg-red-50"
                            title="삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
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
                    <Button size="sm" variant="outline" onClick={handlePrintSurvey}>
                      <Printer className="h-3 w-3 mr-1" /> 인쇄
                    </Button>
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

                      {/* 발송/응답 일시 */}
                      {(() => {
                        const history = (candidate.survey_send_history || []) as { sent_at: string }[]
                        if (history.length === 0 && !surveyData.completed_at) return null
                        const last = history[history.length - 1]
                        return (
                          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5 space-y-1">
                            {history.length > 0 && last && (
                              <div className="flex items-center justify-between">
                                <span>
                                  발송 <span className="font-semibold text-brand-700">{history.length}회</span>
                                  <span className="text-gray-400"> · 최근 {formatDate(last.sent_at, 'yyyy.MM.dd HH:mm')}</span>
                                </span>
                                {history.length > 1 && (
                                  <details className="cursor-pointer">
                                    <summary className="text-[11px] text-gray-400 hover:text-gray-600">이력 보기</summary>
                                    <ul className="mt-1.5 pl-3 space-y-0.5 text-[11px] text-gray-500 text-left">
                                      {[...history].reverse().map((h, i) => (
                                        <li key={i}>{history.length - i}회차 — {formatDate(h.sent_at, 'yyyy.MM.dd HH:mm')}</li>
                                      ))}
                                    </ul>
                                  </details>
                                )}
                              </div>
                            )}
                            {surveyData.completed_at && (
                              <p className="text-right text-gray-400">응답 완료: {formatDate(surveyData.completed_at, 'yyyy.MM.dd HH:mm')}</p>
                            )}
                          </div>
                        )
                      })()}

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

          {/* 발송 완료 but 미응답 상태 — 사전질의서가 옵션 발송된 경우에도 발송 이력만 있고 응답이 없으면 표시 */}
          {!candidate.pre_survey_data && (
            candidate.status === 'survey_sent' ||
            ((candidate.survey_send_history as { sent_at: string }[] | undefined)?.length || 0) > 0
          ) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> 사전 질의서
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
                  <p className="text-sm text-amber-700">사전 질의서가 발송되었습니다. 지원자의 응답을 기다리고 있습니다.</p>
                </div>

                {/* 발송 이력 */}
                {(() => {
                  const history = (candidate.survey_send_history || []) as { sent_at: string }[]
                  if (history.length === 0) return null
                  const last = history[history.length - 1]
                  return (
                    <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">발송 횟수: <span className="text-brand-700">{history.length}회</span></span>
                        <span className="text-gray-500">최근 발송: {formatDate(last.sent_at, 'yyyy.MM.dd HH:mm')}</span>
                      </div>
                      {history.length > 1 && (
                        <details className="cursor-pointer">
                          <summary className="text-[11px] text-gray-500 hover:text-gray-700">발송 이력 전체 보기</summary>
                          <ul className="mt-1.5 pl-3 space-y-0.5 text-[11px] text-gray-500">
                            {[...history].reverse().map((h, i) => (
                              <li key={i}>
                                {history.length - i}회차 — {formatDate(h.sent_at, 'yyyy.MM.dd HH:mm')}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  )
                })()}

                <Button size="sm" variant="outline" onClick={handleResendSurvey} disabled={resendingSurvey}>
                  {resendingSurvey ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 발송 중...</>
                  ) : (
                    <><Send className="h-3 w-3 mr-1" /> 사전 질의서 재발송</>
                  )}
                </Button>
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-sm">
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-sm">
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
                // 0512 미팅: 사전 질의서를 고정 단계에서 제거 — 언제든 별도 발송 가능한 옵션으로 분리
                const steps = [
                  { key: 'applied', label: '서류 접수' },
                  { key: 'resume_reviewed', label: 'AI 이력서 분석' },
                  { key: 'interview_1', label: '1차 화상면접' },
                  { key: 'interview_2', label: '2차 대면면접' },
                  { key: 'analyzed', label: '최종 종합 분석' },
                  { key: 'decided', label: '최종 결정' },
                ]
                // statusOrder 의 'survey_sent'/'survey_done' 은 기존 데이터 호환용 — 단계 표시상으로는 1차 면접 직전과 동일 취급
                const statusOrder = [
                  'applied', 'resume_reviewed', 'survey_sent', 'survey_done',
                  'interview_scheduled', 'video_done', 'face_to_face_scheduled',
                  'face_to_face_done', 'processing', 'analyzed', 'decided', 'hired', 'rejected', 'no_show',
                ]
                const currentIdx = statusOrder.indexOf(candidate.status)
                const getStepState = (key: string) => {
                  // 사전질의서가 사라지면서 interview_1/2 등의 threshold 가 statusOrder 인덱스와 그대로 매칭됨
                  const thresholds: Record<string, number> = {
                    applied: 0, resume_reviewed: 1,
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
              {/* Step 1: 이력서 분석 완료 → 1차 면접 단계로 진행 (0512: 사전질의서는 옵션) */}
              {candidate.status === 'resume_reviewed' && analysis ? (
                <>
                  <Button className="w-full" onClick={() => handleDecision('proceed')}>
                    <Video className="h-4 w-4 mr-1" /> 면접 단계로 진행
                  </Button>
                  <Button variant="outline" className="w-full" onClick={handleSendSurvey} disabled={resendingSurvey}>
                    {resendingSurvey ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 발송 중...</>
                    ) : (
                      <><ClipboardList className="h-4 w-4 mr-1" /> 사전 질의서 발송 (선택)</>
                    )}
                  </Button>
                  <Button variant="danger" className="w-full" onClick={() => handleDecision('reject')}>
                    <XCircle className="h-4 w-4 mr-1" /> 불합격 처리
                  </Button>
                </>
              ) : /* Step 1.5: 사전 질의서 발송 → 응답 대기 — 응답 미수신/연락두절 시 처리 (기존 데이터 호환) */
              candidate.status === 'survey_sent' ? (
                <>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-700 font-medium mb-1">
                      <ClipboardList className="h-4 w-4 inline mr-1" />
                      사전 질의서 응답 대기 중
                    </p>
                    <p className="text-xs text-amber-600">응답이 도착하면 다음 단계로 자동 진행됩니다. 연락두절/응답 미수신 시 아래 버튼으로 종결 처리할 수 있습니다.</p>
                  </div>
                  <Button variant="outline" className="w-full border-gray-300 text-gray-600 hover:bg-gray-50" onClick={handleNoShow}>
                    <XCircle className="h-4 w-4 mr-1" /> 지원 불참 (응답 없음/연락두절)
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
              ) : /* Step 2.5: 1차 면접 예정 — 진행/불합격/지원 불참 */
              candidate.status === 'interview_scheduled' ? (
                <>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-700 font-medium mb-1">
                      <Calendar className="h-4 w-4 inline mr-1" />
                      1차 화상면접 예정
                    </p>
                    <p className="text-xs text-amber-600">면접 진행 후 결과를 처리하거나, 지원자가 무단 불참한 경우 '지원 불참'으로 분류해주세요.</p>
                  </div>
                  <Button variant="outline" className="w-full border-gray-300 text-gray-600 hover:bg-gray-50" onClick={handleNoShow}>
                    <XCircle className="h-4 w-4 mr-1" /> 지원 불참 (면접 무단 불참)
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
              ) : /* Step 3.5: 2차 대면면접 예정 — 진행/불합격/지원 불참 */
              candidate.status === 'face_to_face_scheduled' ? (
                <>
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-sm text-purple-700 font-medium mb-1">
                      <Calendar className="h-4 w-4 inline mr-1" />
                      2차 대면면접 예정
                    </p>
                    <p className="text-xs text-purple-600">면접 진행 후 결과를 처리하거나, 지원자가 무단 불참한 경우 '지원 불참'으로 분류해주세요.</p>
                  </div>
                  <Button variant="outline" className="w-full border-gray-300 text-gray-600 hover:bg-gray-50" onClick={handleNoShow}>
                    <XCircle className="h-4 w-4 mr-1" /> 지원 불참 (면접 무단 불참)
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
                  <Button variant="danger" className="w-full" onClick={() => handleDecision('reject')}>
                    <XCircle className="h-4 w-4 mr-1" /> 불합격 처리 (분석 생략)
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
                <>
                  <p className="text-sm text-gray-500">AI 이력서 분석을 먼저 실행하세요.</p>
                  <Button variant="danger" className="w-full" onClick={() => handleDecision('reject')}>
                    <XCircle className="h-4 w-4 mr-1" /> 불합격 처리 (AI 분석 생략)
                  </Button>
                </>
              ) : candidate.status === 'hired' ? (
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                    <CheckCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
                    <p className="text-sm text-green-700 font-semibold">합격</p>
                  </div>

                  {/* 제시 조건 */}
                  {hiringDecision && (hiringDecision.offered_salary || hiringDecision.offered_position || hiringDecision.start_date) && (
                    <div className="border rounded-lg p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500">제시 조건</p>
                      <table className="w-full text-sm">
                        <tbody>
                          {hiringDecision.offered_position && (
                            <tr><td className="py-1 text-gray-500 w-24">직무</td><td className="font-medium">{hiringDecision.offered_position}</td></tr>
                          )}
                          {hiringDecision.offered_salary && (
                            <tr><td className="py-1 text-gray-500">연봉</td><td className="font-medium">{hiringDecision.offered_salary.toLocaleString()}만원</td></tr>
                          )}
                          {hiringDecision.offer_conditions?.probation_salary && (
                            <tr><td className="py-1 text-gray-500">수습 급여</td><td className="font-medium">{Number(hiringDecision.offer_conditions.probation_salary).toLocaleString()}만원</td></tr>
                          )}
                          {hiringDecision.offer_conditions?.regular_salary && (
                            <tr><td className="py-1 text-gray-500">정규직 급여</td><td className="font-medium">{Number(hiringDecision.offer_conditions.regular_salary).toLocaleString()}만원</td></tr>
                          )}
                          {hiringDecision.start_date && (
                            <tr><td className="py-1 text-gray-500">입사 예정일</td><td className="font-medium">{hiringDecision.start_date}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 지원자 응답 */}
                  {hiringDecision?.candidate_response ? (
                    <div className="border rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-purple-600">지원자 응답</p>
                      <table className="w-full text-sm">
                        <tbody>
                          <tr>
                            <td className="py-1 text-gray-500 w-24">동의 여부</td>
                            <td className="font-medium">
                              {hiringDecision.candidate_response.agreed ? (
                                <span className="text-green-600">동의</span>
                              ) : (
                                <span className="text-red-600">비동의</span>
                              )}
                            </td>
                          </tr>
                          {hiringDecision.candidate_response.salary_negotiation?.desired && (
                            <tr>
                              <td className="py-1 text-gray-500">연봉 협상</td>
                              <td className="font-medium text-amber-600">
                                협상 희망
                                {hiringDecision.candidate_response.salary_negotiation.amount && (
                                  <span> — {hiringDecision.candidate_response.salary_negotiation.amount.toLocaleString()}만원</span>
                                )}
                              </td>
                            </tr>
                          )}
                          {hiringDecision.candidate_response.start_date_change && (
                            <tr>
                              <td className="py-1 text-gray-500">희망 입사일</td>
                              <td className="font-medium">{hiringDecision.candidate_response.start_date_change}</td>
                            </tr>
                          )}
                          {hiringDecision.candidate_response.notes && (
                            <tr>
                              <td className="py-1 text-gray-500 align-top">기타 요청</td>
                              <td className="font-medium whitespace-pre-wrap">{hiringDecision.candidate_response.notes}</td>
                            </tr>
                          )}
                          {hiringDecision.candidate_response.submitted_at && (
                            <tr>
                              <td className="py-1 text-gray-500">응답 일시</td>
                              <td className="text-xs text-gray-400">{new Date(hiringDecision.candidate_response.submitted_at).toLocaleString('ko-KR')}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : hiringDecision ? (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs text-amber-700">지원자가 아직 합격 조건에 응답하지 않았습니다.</p>
                    </div>
                  ) : null}

                  {/* 합격 → 불합격 변경 */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-red-600 hover:bg-red-50 hover:text-red-700 mt-2"
                    onClick={async () => {
                      if (!confirm('정말 불합격으로 변경하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
                      await supabase.from('candidates').update({ status: 'rejected' }).eq('id', id)
                      setCandidate((p) => p ? { ...p, status: 'rejected' as any } : p)
                      toast('불합격으로 변경되었습니다.', 'success')
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-1" /> 합격 취소 (불합격 변경)
                  </Button>
                </div>
              ) : candidate.status === 'rejected' ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
                  <XCircle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                  <p className="text-sm text-red-700 font-semibold">불합격</p>
                </div>
              ) : candidate.status === 'no_show' ? (
                <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-center">
                  <XCircle className="h-5 w-5 text-gray-500 mx-auto mb-1" />
                  <p className="text-sm text-gray-700 font-semibold">지원 불참</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">면접 무단 불참 등으로 평가가 종료되었습니다.</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  현재 상태: {CANDIDATE_STATUS_LABELS[candidate.status as CandidateStatus]}
                </p>
              )}

              {/* 사전질의서 발송 이력 */}
              {(() => {
                const history = (candidate.survey_send_history || []) as { sent_at: string }[]
                if (history.length === 0) return null
                const last = history[history.length - 1]
                return (
                  <div className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span>
                        사전질의서 발송 <span className="font-semibold text-brand-700">{history.length}회</span>
                      </span>
                      <span className="text-gray-500">최근 {formatDate(last.sent_at, 'yyyy.MM.dd HH:mm')}</span>
                    </div>
                    {history.length > 1 && (
                      <details className="cursor-pointer">
                        <summary className="text-[11px] text-gray-500 hover:text-gray-700">발송 이력 전체 보기</summary>
                        <ul className="mt-1.5 pl-3 space-y-0.5 text-[11px] text-gray-500">
                          {[...history].reverse().map((h, i) => (
                            <li key={i}>{history.length - i}회차 — {formatDate(h.sent_at, 'yyyy.MM.dd HH:mm')}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          {/* 중복 지원자 알림 */}
          {duplicateCandidates.length > 0 && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">중복 지원자 감지 ({duplicateCandidates.length}건)</p>
                    <p className="text-xs text-amber-700 mt-0.5">동일 이름 또는 이메일로 지원한 이력이 있습니다.</p>
                    <div className="mt-2 space-y-1">
                      {duplicateCandidates.map((d) => (
                        <a
                          key={d.id}
                          href={`/admin/recruitment/candidates/${d.id}`}
                          className="block text-xs text-amber-700 hover:text-amber-900 hover:underline"
                        >
                          {d.name} — {CANDIDATE_STATUS_LABELS[d.status as CandidateStatus] || d.status} ({new Date(d.created_at).toLocaleDateString('ko-KR')})
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>지원자 정보</CardTitle>
                {!editingProfile ? (
                  <Button size="sm" variant="outline" onClick={openProfileEdit}>
                    <Pencil className="h-3 w-3 mr-1" /> 수정
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditingProfile(false)} disabled={savingProfile}>
                      취소
                    </Button>
                    <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile}>
                      {savingProfile ? <Loader2 className="h-3 w-3 animate-spin" /> : '저장'}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {editingProfile ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">이름 *</label>
                    <input
                      type="text"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                      placeholder="홍길동"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">이메일 * <span className="text-amber-600">(사전질의서 발송 주소)</span></label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                      placeholder="name@example.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">전화번호</label>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                      placeholder="010-1234-5678"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 pt-1">
                    수정 후 좌측 사전질의서 영역에서 <strong>재발송</strong>을 눌러야 새 이메일로 발송됩니다.
                  </p>
                </>
              ) : (
                <>
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
                </>
              )}
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
                    <label className="text-xs text-gray-500">연봉 (만원) *</label>
                    <input type="number" placeholder="예: 4000" value={offerConditions.salary}
                      onChange={(e) => setOfferConditions(p => ({ ...p, salary: e.target.value }))}
                      className="w-full mt-1 px-3 py-1.5 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">수습 급여 (만원) *</label>
                    <input type="number" placeholder="예: 3600" value={offerConditions.probation_salary}
                      onChange={(e) => setOfferConditions(p => ({ ...p, probation_salary: e.target.value }))}
                      className="w-full mt-1 px-3 py-1.5 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">직무명 *</label>
                    <input type="text" placeholder="예: 마케팅 기획" value={offerConditions.job_title}
                      onChange={(e) => setOfferConditions(p => ({ ...p, job_title: e.target.value }))}
                      className="w-full mt-1 px-3 py-1.5 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">입사 예정일 *</label>
                    <input type="date" value={offerConditions.start_date}
                      onChange={(e) => setOfferConditions(p => ({ ...p, start_date: e.target.value }))}
                      className="w-full mt-1 px-3 py-1.5 border rounded-lg text-sm" />
                  </div>
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
