/**
 * 채용 관련 AI 프롬프트 빌더
 */

import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature, type AIConfig } from '@/lib/ai-client'

// AI 설정 가져오기 (기본 — 레거시 호환)
export async function getAIConfig(): Promise<AIConfig | null> {
  const { data } = await supabase
    .from('ai_settings')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!data) return null
  return {
    provider: data.provider,
    apiKey: data.api_key,
    model: data.model,
  }
}

// 종합 분석 프롬프트 빌더
export function buildComprehensiveAnalysisPrompt(data: {
  candidateName: string
  postingTitle: string
  resumeAnalysis: any
  surveyData: any
  faceToFaceEval: any
  interviewAnalyses: any[]
  talentProfiles: any[]
  candidateMetadata: any
}) {
  // 면접 분석 데이터 포맷
  const interviewSection = data.interviewAnalyses.length > 0
    ? data.interviewAnalyses.map((ia, idx) => {
        const type = ia.interview_type === 'video' ? '화상면접' : '대면면접'
        return `### ${type} ${idx + 1}
- 종합점수: ${ia.overall_score ?? '미측정'}/100
- 의사소통: ${ia.communication_score ?? '-'}, 전문성: ${ia.expertise_score ?? '-'}, 태도: ${ia.attitude_score ?? '-'}
- 강점: ${(ia.strengths || []).join(', ') || '없음'}
- 우려사항: ${(ia.concerns || []).join(', ') || '없음'}
- 전체 인상: ${ia.overall_impression || '없음'}
- 주요 Q&A:
${(ia.key_answers || []).map((qa: any) => `  Q: ${qa.question}\n  A: ${qa.answer}\n  평가: ${qa.evaluation}`).join('\n')}`
      }).join('\n\n')
    : '면접 분석 미실시'

  return `HR 전문가로서 이 지원자에 대한 종합 분석 리포트를 작성하세요.

## 지원자 정보
- 이름: ${data.candidateName}
- 지원 포지션: ${data.postingTitle}
${data.candidateMetadata?.mbti ? `- MBTI: ${data.candidateMetadata.mbti}` : ''}
${data.candidateMetadata?.birth_date ? `- 생년월일: ${data.candidateMetadata.birth_date}` : ''}

## 이력서 AI 분석 결과
${data.resumeAnalysis ? JSON.stringify(data.resumeAnalysis, null, 2) : '분석 미실시'}

## 사전 질의서 응답
${data.surveyData ? JSON.stringify(data.surveyData, null, 2) : '미응답'}

## 대면 면접 평가 (평가자 기록)
${data.faceToFaceEval ? JSON.stringify(data.faceToFaceEval, null, 2) : '미실시'}

## 면접 AI 분석 결과 (녹음/녹화 기반)
${interviewSection}

## 회사 인재상
${data.talentProfiles.length > 0 ? data.talentProfiles.map((t) => `${t.name}: ${(t.traits || []).join(', ')}`).join('\n') : '미설정'}

다음 JSON 형식으로만 응답하세요:
{
  "overall_score": 0~100,
  "summary": "2~3줄 종합 평가",
  "detailed_analysis": {
    "resume_fit": { "score": 0~100, "comment": "..." },
    "interview_performance": { "score": 0~100, "comment": "..." },
    "cultural_fit": { "score": 0~100, "comment": "..." },
    "growth_potential": { "score": 0~100, "comment": "..." }
  },
  "talent_match": {
    "best_match_profile": "가장 유사한 인재상 이름",
    "match_percentage": 0~100,
    "similar_traits": ["유사 특성들"]
  },
  "saju_mbti_analysis": {
    "personality_summary": "성격 요약",
    "work_style": "업무 스타일",
    "team_compatibility": "팀 호환성",
    "cautions": ["주의 사항"]
  },
  "salary_recommendation": "추천 연봉 범위",
  "department_recommendation": "추천 부서",
  "position_recommendation": "추천 직급",
  "ai_recommendation": "STRONG_HIRE 또는 HIRE 또는 REVIEW 또는 NO_HIRE",
  "key_strengths": ["강점 3개"],
  "key_concerns": ["우려 사항"],
  "interview_questions_for_final": ["최종 면접 시 추가 질문 3개"]
}`
}

// 종합 분석 실행
export async function runComprehensiveAnalysis(candidateId: string) {
  const config = await getAIConfigForFeature('comprehensive_analysis')
  if (!config) throw new Error('AI 설정이 필요합니다.')

  // 데이터 수집
  const [candRes, analysisRes, f2fRes, interviewAnaRes, talentRes] = await Promise.all([
    supabase.from('candidates').select('*, job_postings(title)').eq('id', candidateId).single(),
    supabase.from('resume_analysis').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('face_to_face_evals').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('interview_analyses').select('*').eq('candidate_id', candidateId).eq('status', 'completed').order('created_at', { ascending: true }),
    supabase.from('talent_profiles').select('*').eq('is_active', true),
  ])

  const candidate = candRes.data as any
  if (!candidate) throw new Error('지원자를 찾을 수 없습니다.')

  const prompt = buildComprehensiveAnalysisPrompt({
    candidateName: candidate.name,
    postingTitle: candidate.job_postings?.title || '미정',
    resumeAnalysis: analysisRes.data,
    surveyData: candidate.pre_survey_data,
    faceToFaceEval: f2fRes.data,
    interviewAnalyses: interviewAnaRes.data || [],
    talentProfiles: talentRes.data || [],
    candidateMetadata: candidate.metadata,
  })

  const result = await generateAIContent(config, prompt)

  // JSON 파싱
  const jsonMatch = result.content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI 응답 파싱 실패')
  const parsed = JSON.parse(jsonMatch[0])

  // recruitment_reports 저장
  const { data: report, error } = await supabase
    .from('recruitment_reports')
    .insert({
      candidate_id: candidateId,
      report_type: 'comprehensive',
      overall_score: parsed.overall_score,
      summary: parsed.summary,
      detailed_analysis: parsed.detailed_analysis,
      talent_match: parsed.talent_match,
      saju_mbti_analysis: parsed.saju_mbti_analysis,
      salary_recommendation: parsed.salary_recommendation,
      department_recommendation: parsed.department_recommendation,
      position_recommendation: parsed.position_recommendation,
      ai_recommendation: parsed.ai_recommendation,
      provider: config.provider,
      model: config.model,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // 지원자 상태 업데이트
  await supabase
    .from('candidates')
    .update({
      status: 'analyzed',
      talent_match_score: parsed.talent_match?.match_percentage || null,
    })
    .eq('id', candidateId)

  return { report, parsed }
}
