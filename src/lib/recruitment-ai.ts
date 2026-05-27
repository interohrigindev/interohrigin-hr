/**
 * 채용 관련 AI 프롬프트 빌더
 */

import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature, type AIConfig } from '@/lib/ai-client'
import { readPreSurveyEntries } from '@/lib/pre-survey-entries'
import type { PreSurveyData } from '@/types/recruitment'

/**
 * 외부 업로드(manual_upload) entries 만 사람-친화적 텍스트로 직렬화.
 *
 * 본 사이클 (PDCA #2 external-pre-survey-import) 회귀 0 원칙:
 *   - 기존 PBD/v1 surveyData 직렬화는 그대로 유지 (jsonb dump 또는 surveyText 흐름)
 *   - manual_upload entries 만 별도 섹션으로 prompt 끝에 append
 *   - manual entries 0개면 빈 문자열 반환 → caller 가 자연스럽게 생략
 */
function serializeManualEntriesForPrompt(raw: unknown): string {
  const entries = readPreSurveyEntries(raw as PreSurveyData | null | undefined)
    .filter((e) => e.source === 'manual_upload')
  if (entries.length === 0) return ''

  return entries
    .map((entry, idx) => {
      const qs = (entry.questions || []).slice().sort((a, b) => a.order - b.order)
      const qaLines = qs.length === 0
        ? ['(질문/답변 없음)']
        : qs.map((q, i) => `Q${i + 1}. ${q.text}\nA${i + 1}. ${entry.answers[q.id] || '(미응답)'}`)
      const header = entries.length > 1 ? `[${entry.source_label} — #${idx + 1}]` : `[${entry.source_label}]`
      return `${header}\n${qaLines.join('\n\n')}`
    })
    .join('\n\n---\n\n')
}

/**
 * 채용공고 정보 기반 AI 면접 질문 자동 생성
 *  - 직무 적합성 + 역량 검증 + 사례 기반 + 동기/문화 적합성 등 다양한 카테고리
 *  - 응답은 string 배열로 파싱 후 반환
 */
export async function generateInterviewQuestions(input: {
  title: string
  department?: string | null
  position?: string | null
  employment_type?: string | null
  experience_level?: string | null
  description?: string | null
  requirements?: string | null
  preferred?: string | null
  count?: number
}): Promise<{ ok: true; questions: string[] } | { ok: false; error: string }> {
  const config = (await getAIConfigForFeature('recruitment_screening'))
    || (await getAIConfigForFeature('resume_analysis'))
    || (await getAIConfig())
  if (!config) {
    return { ok: false, error: 'AI 설정이 없습니다. 시스템 관리 > AI 설정에서 등록해주세요.' }
  }

  const count = input.count || 5
  const prompt = `당신은 채용 면접 전문가입니다. 아래 채용공고를 분석하여 면접 시 활용할 수 있는 면접 질문 ${count}개를 한국어로 작성해주세요.

## 채용공고 정보
- 공고 제목: ${input.title}
${input.department ? `- 부서: ${input.department}` : ''}
${input.position ? `- 포지션: ${input.position}` : ''}
${input.employment_type ? `- 고용 형태: ${input.employment_type}` : ''}
${input.experience_level ? `- 경력 수준: ${input.experience_level}` : ''}
${input.description ? `\n## 직무 설명\n${input.description}` : ''}
${input.requirements ? `\n## 필수 요건\n${input.requirements}` : ''}
${input.preferred ? `\n## 우대 사항\n${input.preferred}` : ''}

## 작성 가이드
1. 다음 카테고리를 골고루 포함:
   - 직무 전문성 / 역량 검증 (40%)
   - 경험·사례 기반 (행동 면접, STAR) (30%)
   - 문화 적합성 / 가치관 (15%)
   - 지원 동기 / 커리어 비전 (15%)
2. 단답형이 아닌 구체적 사고 과정·사례를 묻는 개방형 질문
3. 한 질문은 한 가지 핵심만 (multi-part 지양)
4. 너무 일반적인 클리셰 ("자기소개 해주세요") 제외
5. 직무와 직접 연관된 구체적 질문 우선

## 출력 형식 (엄격)
JSON 배열로만 출력. 다른 설명/주석/코드 펜스 없이 순수 배열만.
예: ["질문1", "질문2", "질문3"]`

  try {
    const res = await generateAIContent(config, prompt)
    const text = (res.content || '').trim()
    let jsonText = text
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) jsonText = fence[1].trim()
    const start = jsonText.indexOf('[')
    const end = jsonText.lastIndexOf(']')
    if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1)
    const parsed = JSON.parse(jsonText)
    if (!Array.isArray(parsed)) throw new Error('응답이 배열 형식이 아닙니다')
    const questions = parsed
      .map((q) => (typeof q === 'string' ? q.trim() : String(q || '').trim()))
      .filter((q) => q.length > 0)
    if (questions.length === 0) throw new Error('빈 질문 배열')
    return { ok: true, questions }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'AI 응답 파싱 실패' }
  }
}

/**
 * 2차 대면면접용 지원자 맞춤 AI 질문 생성
 *  - 1차 면접 통과 / 2차 면접 예정 단계 지원자 한정 (UI 측 가드)
 *  - 종합 입력: 공고 + 이력서 분석 + 사전질의 + 1차 면접 분석 + 면접관 코멘트
 *  - 결과를 candidates.second_interview_questions / _generated_at 에 저장
 */
export async function generateSecondInterviewQuestions(
  candidateId: string,
  options?: { count?: number }
): Promise<{ ok: true; questions: string[]; generatedAt: string } | { ok: false; error: string }> {
  const config =
    (await getAIConfigForFeature('comprehensive_analysis')) ||
    (await getAIConfigForFeature('recruitment_screening')) ||
    (await getAIConfigForFeature('resume_analysis')) ||
    (await getAIConfig())
  if (!config) {
    return { ok: false, error: 'AI 설정이 없습니다. 시스템 관리 > AI 설정에서 등록해주세요.' }
  }

  const count = options?.count || 7

  // 데이터 수집 (병렬)
  const [candRes, resumeRes, intvRes] = await Promise.all([
    supabase
      .from('candidates')
      .select('id, name, status, pre_survey_data, pre_survey_analysis, metadata, interviewer_comments, job_posting_id, job_postings(title, position, department_id, employment_type, experience_level, description, requirements, preferred)')
      .eq('id', candidateId)
      .single(),
    supabase
      .from('resume_analysis')
      .select('ai_summary, strengths, weaknesses, position_fit, organization_fit, suggested_position, red_flags, recommendation')
      .eq('candidate_id', candidateId)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('interview_analyses')
      .select('interview_type, ai_summary, key_answers, communication_score, expertise_score, attitude_score, overall_score, strengths, concerns, overall_impression, status, created_at')
      .eq('candidate_id', candidateId)
      .eq('status', 'completed')
      .order('created_at', { ascending: true }),
  ])

  if (candRes.error || !candRes.data) {
    return { ok: false, error: '지원자 정보를 불러올 수 없습니다.' }
  }

  const cand: any = candRes.data
  const posting: any = Array.isArray(cand.job_postings) ? cand.job_postings[0] : cand.job_postings
  const resume = resumeRes.data || null
  const interviews = intvRes.data || []
  // 1차 면접 (video) 만 사용 — 2차(face_to_face)는 아직 진행 전
  const firstInterview = interviews.find((i: any) => i.interview_type === 'video') || interviews[0] || null
  const comments: any[] = Array.isArray(cand.interviewer_comments) ? cand.interviewer_comments : []

  // 직렬화 헬퍼
  const J = (v: any) => (v == null ? '없음' : typeof v === 'string' ? v : JSON.stringify(v, null, 2))

  const prompt = `당신은 채용 면접 전문가입니다. 아래 지원자의 1차 면접까지의 모든 정보를 종합하여,
이 지원자만을 위한 2차 대면면접용 맞춤 질문 ${count}개를 한국어로 작성해주세요.

## 채용공고
- 제목: ${posting?.title ?? '미정'}
- 포지션: ${posting?.position ?? '-'}
- 고용 형태: ${posting?.employment_type ?? '-'}
- 경력 수준: ${posting?.experience_level ?? '-'}
- 직무 설명: ${posting?.description ?? '-'}
- 자격 요건: ${posting?.requirements ?? '-'}
- 우대 사항: ${posting?.preferred ?? '-'}

## 지원자
- 이름: ${cand.name}
- 현재 단계: ${cand.status}

## 이력서 AI 분석
${
  resume
    ? `- 요약: ${resume.ai_summary || '-'}
- 직무 적합도: ${resume.position_fit ?? '-'}점
- 조직 적합도: ${resume.organization_fit ?? '-'}점
- 추천: ${resume.recommendation || '-'}
- 강점: ${J(resume.strengths)}
- 약점: ${J(resume.weaknesses)}
- 우려: ${J(resume.red_flags)}`
    : '없음'
}

## 사전 질의서 답변
${J(cand.pre_survey_data)}
${(() => {
  // PDCA #2: 외부 업로드 entries 가 있으면 사람-친화적 형태로 추가 (raw jsonb 보완)
  const manual = serializeManualEntriesForPrompt(cand.pre_survey_data)
  return manual ? `\n### 외부 사전질의서 (수동 업로드) — 사람이 읽기 좋은 형태\n${manual}` : ''
})()}

## 사전 질의서 AI 분석
${J(cand.pre_survey_analysis)}

## 1차 화상면접 분석
${
  firstInterview
    ? `- 요약: ${firstInterview.ai_summary || '-'}
- 종합 점수: ${firstInterview.overall_score ?? '-'} (의사소통 ${firstInterview.communication_score ?? '-'} / 전문성 ${firstInterview.expertise_score ?? '-'} / 태도 ${firstInterview.attitude_score ?? '-'})
- 강점: ${J(firstInterview.strengths)}
- 우려: ${J(firstInterview.concerns)}
- 전반적 인상: ${firstInterview.overall_impression || '-'}
- 핵심 답변 요지: ${J(firstInterview.key_answers)}`
    : '없음 (1차 면접 데이터가 아직 없거나 분석 미완료)'
}

## 면접관 코멘트 (1차 면접 이후 수집)
${
  comments.length === 0
    ? '없음'
    : comments
        .map((c) => `- [${c.author_name || '익명'} · ${c.created_at || ''}] ${c.content || ''}`)
        .join('\n')
}

## 작성 가이드
1. 위 정보에서 드러난 **이 지원자만의** 강점/약점/우려/궁금증을 직접 검증하는 질문 위주로 작성
2. 1차 면접에서 다뤄진 내용을 단순 반복하지 말고, 부족했던 부분·후속 확인이 필요한 부분을 심층적으로 파고들 것
3. 면접관 코멘트에 명시된 의문점/관찰사항이 있다면 그것을 직접 확인하는 질문을 반드시 포함
4. 이력서/사전질의/1차 면접의 답변과 실제 행동·사례 간 일관성을 검증하는 질문 포함
5. 단답형이 아닌 구체적 사고 과정·사례(STAR)를 묻는 개방형 질문
6. 한 질문은 한 가지 핵심만 (multi-part 지양)
7. "자기소개", "지원 동기" 같은 일반 클리셰는 제외 (이미 1차에서 다룸)
8. 직무/조직 적합도와 직접 연관된 구체적 질문 우선

## 출력 형식 (엄격)
JSON 배열로만 출력. 다른 설명/주석/코드 펜스 없이 순수 배열만.
예: ["질문1", "질문2", "질문3"]`

  try {
    const res = await generateAIContent(config, prompt)
    const text = (res.content || '').trim()
    let jsonText = text
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) jsonText = fence[1].trim()
    const start = jsonText.indexOf('[')
    const end = jsonText.lastIndexOf(']')
    if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1)
    const parsed = JSON.parse(jsonText)
    if (!Array.isArray(parsed)) throw new Error('응답이 배열 형식이 아닙니다')
    const questions = parsed
      .map((q) => (typeof q === 'string' ? q.trim() : String(q || '').trim()))
      .filter((q) => q.length > 0)
    if (questions.length === 0) throw new Error('빈 질문 배열')

    // DB 저장
    const generatedAt = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('candidates')
      .update({
        second_interview_questions: questions as any,
        second_interview_questions_generated_at: generatedAt,
      } as any)
      .eq('id', candidateId)
    if (updErr) {
      return { ok: false, error: '생성은 성공했으나 저장 실패: ' + updErr.message }
    }

    return { ok: true, questions, generatedAt }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'AI 응답 파싱 실패' }
  }
}

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
  interviewerComments?: { author_name?: string; content?: string; created_at?: string }[]
  interviewAnswers?: Record<string, string>
  aiQuestions?: string[]
  secondQuestions?: string[]
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

  const today = new Date()
  const todayStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1

  return `[ABSOLUTE TIME ANCHOR — 반드시 준수]
오늘 날짜: ${todayStr} (${todayYear}년 ${todayMonth}월)
당신의 학습 시점이 아닌 위 날짜를 "현재" 로 사용하세요.

[날짜 해석 규칙]
- 종료일 < ${todayStr} → 이미 완료된 과거 사실 (예: "2026.02 졸업" → 이미 졸업)
- 종료일 > ${todayStr} → 미래 (예정)
- "미래 시점 표기 오류"·"졸업 예정"·"신뢰성 의심" 같은 우려는 종료일이 ${todayStr} 이전인 항목에 절대 사용 금지

HR 전문가로서 이 지원자에 대한 종합 분석 리포트를 작성하세요.

## 지원자 정보
- 이름: ${data.candidateName}
- 지원 포지션: ${data.postingTitle}
${data.candidateMetadata?.mbti ? `- MBTI: ${data.candidateMetadata.mbti}` : ''}
${data.candidateMetadata?.birth_date ? `- 생년월일: ${data.candidateMetadata.birth_date}` : ''}

## 이력서 AI 분석 결과
${data.resumeAnalysis ? JSON.stringify(data.resumeAnalysis, null, 2) : '분석 미실시'}

## 사전 질의서 응답
${data.surveyData ? JSON.stringify(data.surveyData, null, 2) : '미응답'}
${(() => {
  // PDCA #2: 외부 업로드 entries 가 있으면 사람-친화적 형태로 추가
  const manual = serializeManualEntriesForPrompt(data.surveyData)
  return manual ? `\n### 외부 사전질의서 (수동 업로드) — 사람이 읽기 좋은 형태\n${manual}` : ''
})()}

## 대면 면접 평가 (평가자 기록)
${data.faceToFaceEval ? JSON.stringify(data.faceToFaceEval, null, 2) : '미실시'}

## 면접 AI 분석 결과 (녹음/녹화 기반)
${interviewSection}

## 면접 질문별 답변 기록 (면접관이 면접 진행 중 직접 기재)
${(() => {
  const ans = data.interviewAnswers || {}
  const aiQs = data.aiQuestions || []
  const secondQs = data.secondQuestions || []
  const lines: string[] = []
  aiQs.forEach((q, i) => {
    const a = ans[`ai:${i}`]
    if (a && a.trim().length > 0) lines.push(`[공고 권장 질문 ${i + 1}]\nQ: ${q}\nA: ${a}`)
  })
  secondQs.forEach((q, i) => {
    const a = ans[`second:${i}`]
    if (a && a.trim().length > 0) lines.push(`[2차 맞춤 질문 ${i + 1}]\nQ: ${q}\nA: ${a}`)
  })
  return lines.length === 0 ? '기재된 답변 없음' : lines.join('\n\n')
})()}

## 면접관 정성 코멘트 (관리자/외부 면접관 직접 기록)
${
  (data.interviewerComments && data.interviewerComments.length > 0)
    ? data.interviewerComments
        .map((c) => `- [${c.author_name || '익명'} · ${c.created_at || ''}]\n  ${(c.content || '').trim()}`)
        .join('\n')
    : '없음'
}

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
    supabase.from('candidates').select('*, job_postings(title, ai_questions)').eq('id', candidateId).single(),
    supabase.from('resume_analysis').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('face_to_face_evals').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('interview_analyses').select('*').eq('candidate_id', candidateId).eq('status', 'completed').order('created_at', { ascending: true }),
    supabase.from('talent_profiles').select('*').eq('is_active', true),
  ])

  const candidate = candRes.data as any
  if (!candidate) throw new Error('지원자를 찾을 수 없습니다.')

  const posting = Array.isArray(candidate.job_postings) ? candidate.job_postings[0] : candidate.job_postings
  const aiQuestions: string[] = Array.isArray(posting?.ai_questions) ? posting.ai_questions : []
  const secondQuestions: string[] = Array.isArray(candidate.second_interview_questions) ? candidate.second_interview_questions : []
  const interviewAnswers: Record<string, string> =
    candidate.interview_answers && typeof candidate.interview_answers === 'object'
      ? (candidate.interview_answers as Record<string, string>)
      : {}
  const interviewerComments = Array.isArray(candidate.interviewer_comments)
    ? candidate.interviewer_comments
    : []

  const prompt = buildComprehensiveAnalysisPrompt({
    candidateName: candidate.name,
    postingTitle: posting?.title || '미정',
    resumeAnalysis: analysisRes.data,
    surveyData: candidate.pre_survey_data,
    faceToFaceEval: f2fRes.data,
    interviewAnalyses: interviewAnaRes.data || [],
    talentProfiles: talentRes.data || [],
    candidateMetadata: candidate.metadata,
    interviewerComments,
    interviewAnswers,
    aiQuestions,
    secondQuestions,
  })

  const result = await generateAIContent(config, prompt)

  // JSON 파싱 (안전한 추출 — 3단계 폴백)
  let parsed: any

  // 1차: 직접 파싱 (깔끔한 JSON 응답)
  try {
    parsed = JSON.parse(result.content)
  } catch {
    // 2차: 마크다운 코드블록 제거 후 재시도
    let cleaned = result.content
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```/g, '')
      .trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('AI 응답 파싱 실패')
    let jsonStr = jsonMatch[0]
      .replace(/,\s*([\]}])/g, '$1')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')

    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      // 3차: JSON 문자열 값 내부의 이스케이프 안 된 줄바꿈 처리
      jsonStr = jsonStr.replace(/"((?:[^"\\]|\\.)*)"/g, (match) => {
        return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
      })
      parsed = JSON.parse(jsonStr)
    }
  }

  // AI 추천값 검증
  const validRecs = ['STRONG_HIRE', 'HIRE', 'REVIEW', 'NO_HIRE']
  if (!validRecs.includes(parsed.ai_recommendation)) {
    parsed.ai_recommendation = 'REVIEW'
  }
  if (typeof parsed.overall_score !== 'number') {
    parsed.overall_score = parseInt(parsed.overall_score) || 50
  }

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

  // 지원자 상태 업데이트 — 이미 결정/합격/불합격 단계인 경우 회귀 금지
  const POST_ANALYZED = ['decided', 'hired', 'rejected']
  const updatePayload: Record<string, any> = {
    talent_match_score: parsed.talent_match?.match_percentage || null,
  }
  if (!POST_ANALYZED.includes(candidate.status)) {
    updatePayload.status = 'analyzed'
  }
  await supabase
    .from('candidates')
    .update(updatePayload)
    .eq('id', candidateId)

  return { report, parsed }
}
