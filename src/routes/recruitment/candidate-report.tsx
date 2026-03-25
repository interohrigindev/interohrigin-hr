import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Sparkles, Loader2, CheckCircle, XCircle, AlertTriangle, Video, MapPin, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { generateAIContent, type AIConfig } from '@/lib/ai-client'
import { runComprehensiveAnalysis } from '@/lib/recruitment-ai'
import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_COLORS, SOURCE_CHANNEL_LABELS } from '@/lib/recruitment-constants'
import type { Candidate, CandidateStatus, SourceChannel, ResumeAnalysis, RecruitmentReport } from '@/types/recruitment'
import { formatDate } from '@/lib/utils'
import { surveyInviteEmail } from '@/lib/email-templates'
import InterviewAnalysis from '@/components/recruitment/InterviewAnalysis'

export default function CandidateReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [report, setReport] = useState<RecruitmentReport | null>(null)
  const [comprehensiveAnalyzing, setComprehensiveAnalyzing] = useState(false)
  const [, setActiveTab] = useState<'resume' | 'comprehensive'>('resume')

  useEffect(() => {
    if (!id) return
    async function fetch() {
      const [candRes, analysisRes] = await Promise.all([
        supabase.from('candidates').select('*').eq('id', id).single(),
        supabase.from('resume_analysis').select('*').eq('candidate_id', id).order('created_at', { ascending: false }).limit(1).single(),
      ])
      if (candRes.data) setCandidate(candRes.data as Candidate)
      if (analysisRes.data) setAnalysis(analysisRes.data as ResumeAnalysis)

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
    try {
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .single()

      if (!aiSettings) {
        toast('AI 설정이 필요합니다.', 'error')
        setAnalyzing(false)
        return
      }

      // 채용공고 정보
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

      const config: AIConfig = {
        provider: aiSettings.provider,
        apiKey: aiSettings.api_key,
        model: aiSettings.model,
      }

      const prompt = `HR 전문가로서 이 지원자의 이력서와 자기소개서를 분석하세요.

채용공고 정보:
${postingInfo || '정보 없음'}

지원자 정보:
- 이름: ${candidate.name}
- 이메일: ${candidate.email}
- 자기소개서: ${candidate.cover_letter_text || '미제출'}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "summary": "1~2줄 요약",
  "strengths": ["강점 3개"],
  "weaknesses": ["약점 2개"],
  "position_fit": 0~100,
  "organization_fit": 0~100,
  "suggested_department": "추천 부서",
  "suggested_position": "추천 직급",
  "suggested_salary_range": "추천 연봉 범위",
  "red_flags": ["우려 사항"],
  "recommendation": "PROCEED 또는 REVIEW 또는 REJECT"
}`

      const result = await generateAIContent(config, prompt)

      // JSON 파싱
      let parsed
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/)
        parsed = JSON.parse(jsonMatch?.[0] || result.content)
      } catch {
        toast('AI 응답 파싱 실패', 'error')
        setAnalyzing(false)
        return
      }

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
      const surveyUrl = `${baseUrl}/survey/${candidate.invite_token}`
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
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">이력서</span>
                  <a
                    href={candidate.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-600 hover:underline"
                  >
                    다운로드
                  </a>
                </div>
              )}
              {candidate.cover_letter_url && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">자기소개서 (파일)</span>
                  <a
                    href={candidate.cover_letter_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-600 hover:underline"
                  >
                    다운로드
                  </a>
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

          {/* AI 분석 결과 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" /> AI 1차 분석
                </CardTitle>
                {!analysis && (
                  <Button size="sm" onClick={runAIAnalysis} disabled={analyzing}>
                    {analyzing ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 분석 중...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-1" /> AI 분석 실행</>
                    )}
                  </Button>
                )}
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
                  <Button className="w-full" onClick={async () => {
                    await supabase.from('hiring_decisions').insert({
                      candidate_id: id,
                      decision: 'hired',
                      decided_by: null,
                      ai_recommendation: report.ai_recommendation,
                      ai_score: report.overall_score,
                    })
                    await supabase.from('candidates').update({ status: 'hired' }).eq('id', id)
                    setCandidate((p) => p ? { ...p, status: 'hired' } : p)
                    toast('합격 처리되었습니다.', 'success')
                  }}>
                    <CheckCircle className="h-4 w-4 mr-1" /> 합격
                  </Button>
                  <Button variant="danger" className="w-full" onClick={async () => {
                    await supabase.from('hiring_decisions').insert({
                      candidate_id: id,
                      decision: 'rejected',
                      decided_by: null,
                      ai_recommendation: report.ai_recommendation,
                      ai_score: report.overall_score,
                    })
                    await supabase.from('candidates').update({ status: 'rejected' }).eq('id', id)
                    setCandidate((p) => p ? { ...p, status: 'rejected' } : p)
                    toast('불합격 처리되었습니다.', 'success')
                  }}>
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
    </div>
  )
}
