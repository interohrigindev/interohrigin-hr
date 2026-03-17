import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Sparkles, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { generateAIContent, type AIConfig } from '@/lib/ai-client'
import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_COLORS, SOURCE_CHANNEL_LABELS } from '@/lib/recruitment-constants'
import type { Candidate, CandidateStatus, SourceChannel, ResumeAnalysis } from '@/types/recruitment'
import { formatDate } from '@/lib/utils'

export default function CandidateReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    if (!id) return
    async function fetch() {
      const [candRes, analysisRes] = await Promise.all([
        supabase.from('candidates').select('*').eq('id', id).single(),
        supabase.from('resume_analysis').select('*').eq('candidate_id', id).order('created_at', { ascending: false }).limit(1).single(),
      ])
      if (candRes.data) setCandidate(candRes.data as Candidate)
      if (analysisRes.data) setAnalysis(analysisRes.data as ResumeAnalysis)
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

  async function handleDecision(decision: 'proceed' | 'reject') {
    if (!id) return
    const newStatus = decision === 'proceed' ? 'survey_sent' : 'rejected'
    const { error } = await supabase
      .from('candidates')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) {
      toast('상태 변경 실패', 'error')
    } else {
      toast(decision === 'proceed' ? '사전 질의서 발송 처리되었습니다.' : '불합격 처리되었습니다.', 'success')
      setCandidate((prev) => prev ? { ...prev, status: newStatus as any } : prev)
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
        </div>

        {/* 사이드바: 의사결정 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>의사결정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {candidate.status === 'resume_reviewed' && analysis ? (
                <>
                  <Button
                    className="w-full"
                    onClick={() => handleDecision('proceed')}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" /> OK — 사전 질의서 발송
                  </Button>
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={() => handleDecision('reject')}
                  >
                    <XCircle className="h-4 w-4 mr-1" /> 불합격 처리
                  </Button>
                </>
              ) : candidate.status === 'applied' ? (
                <p className="text-sm text-gray-500">AI 분석을 먼저 실행하세요.</p>
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
