/**
 * Unified AI Client — Edge Function 프록시 경유
 * 브라우저에서 직접 AI API 호출하지 않고 /api/ai 프록시를 통해 호출
 */

import { supabase } from '@/lib/supabase'

export interface AIConfig {
  provider: 'gemini' | 'openai' | 'claude' | 'deepgram'
  apiKey: string
  model: string
}

// ─── 기능별 AI 설정 조회 ──────────────────────────────────────────
// ai_feature_settings에 매핑이 있으면 해당 provider 사용, 없으면 is_active=true 기본 설정 사용
export async function getAIConfigForFeature(featureKey: string): Promise<AIConfig | null> {
  // 1) 기능별 매핑 확인 — 활성 상태인 설정만 사용
  const { data: featureSetting } = await supabase
    .from('ai_feature_settings')
    .select('ai_setting_id')
    .eq('feature_key', featureKey)
    .single()

  if (featureSetting?.ai_setting_id) {
    const { data: setting } = await supabase
      .from('ai_settings')
      .select('provider, api_key, model, is_active')
      .eq('id', featureSetting.ai_setting_id)
      .single()

    // 배정된 설정이 활성 상태이면 사용
    if (setting?.is_active) {
      return { provider: setting.provider, apiKey: setting.api_key, model: setting.model }
    }
    // 비활성이면 fallback으로 넘어감
  }

  // 2) fallback: 활성 설정 중 텍스트 생성 가능한 provider (deepgram 제외)
  const { data: defaultSetting } = await supabase
    .from('ai_settings')
    .select('provider, api_key, model')
    .eq('is_active', true)
    .neq('provider', 'deepgram')
    .limit(1)
    .single()

  if (!defaultSetting) return null
  return { provider: defaultSetting.provider, apiKey: defaultSetting.api_key, model: defaultSetting.model }
}

export interface AIResponse {
  content: string
  provider: string
  model: string
}

// ─── Proxy helper ────────────────────────────────────────────────

async function callAIProxy(apiKey: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AI-Key': apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any)?.error || `AI proxy error: ${res.status}`)
  }

  const data = await res.json()
  return (data as any).content ?? ''
}

// ─── File attachment type ────────────────────────────────────────

export interface AIFileAttachment {
  mimeType: string
  base64: string
  name?: string
}

// ─── Unified call (자동 폴백 포함) ─────────────────────────────
// 1차: 전달된 config로 호출
// 2차: 키 오류 발생 시 다른 활성 provider로 자동 재시도 (최대 2회)
// 모든 실패 → throw (호출자가 catch하여 처리). 기존 호출자는 코드 변경 없이도 보호됨.

export async function generateAIContent(config: AIConfig, prompt: string, files?: AIFileAttachment[]): Promise<AIResponse> {
  const body = {
    action: 'generate',
    prompt,
    ...(files && files.length > 0 ? { files } : {}),
  }

  // 1차 시도
  try {
    const content = await callAIProxy(config.apiKey, {
      provider: config.provider,
      model: config.model,
      ...body,
    })
    return { content, provider: config.provider, model: config.model }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const cls = classifyError(msg)
    // 키 오류 또는 할당량 초과만 폴백 — 그 외(네트워크 등)는 원본 에러 유지
    if (!cls.keyError && !cls.quotaError) throw err

    console.warn(`[AI auto-fallback] ${config.provider} ${cls.keyError ? '키 오류' : '할당량'}. 다른 provider 시도.`)

    // 폴백 후보 조회 (현재 config 제외)
    const { data: candidates } = await supabase
      .from('ai_settings')
      .select('provider, api_key, model')
      .eq('is_active', true)
      .neq('provider', 'deepgram')
      .order('updated_at', { ascending: false })
      .limit(5)

    if (!candidates || candidates.length === 0) throw err

    for (const c of candidates) {
      if (c.provider === config.provider && c.api_key === config.apiKey) continue
      try {
        const content = await callAIProxy(c.api_key, {
          provider: c.provider,
          model: c.model,
          ...body,
        })
        return { content, provider: c.provider, model: c.model }
      } catch (fallbackErr) {
        const fmsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        const fcls = classifyError(fmsg)
        if (!fcls.keyError && !fcls.quotaError) throw fallbackErr
        console.warn(`[AI auto-fallback] ${c.provider} 실패, 다음 후보 시도`)
      }
    }

    // 전체 폴백 실패 → 사용자 친화 메시지로 재throw
    throw new Error(
      cls.keyError
        ? 'AI 키가 유효하지 않습니다. 관리자에게 설정 > AI에서 키 갱신을 요청해주세요.'
        : 'AI 할당량이 초과되었습니다. 잠시 후 다시 시도해주세요.'
    )
  }
}

// ─── 중앙집중 폴백 래퍼 (C3) ──────────────────────────────────
// API 키 무효 / 할당량 초과 / 네트워크 실패 등으로 1차 provider가 실패해도
// ai_settings 내 다른 활성 provider로 순차 재시도. 모두 실패하면 안전한 기본값 반환.

export interface AIFallbackResult {
  success: boolean
  content: string
  provider?: string
  model?: string
  error?: string
  /** 키 오류 여부 (true면 관리자에게 설정 안내 필요) */
  keyError?: boolean
}

function classifyError(msg: string): { keyError: boolean; quotaError: boolean } {
  const lower = msg.toLowerCase()
  const keyError =
    lower.includes('incorrect api key') ||
    lower.includes('invalid api key') ||
    lower.includes('api key not valid') ||
    lower.includes('api_key') ||
    lower.includes('unauthoriz') ||
    lower.includes('401') ||
    lower.includes('403')
  const quotaError =
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('resource_exhausted')
  return { keyError, quotaError }
}

/**
 * 기능키 기반으로 AI 콘텐츠를 생성하되, 실패 시 다른 활성 provider로 자동 폴백.
 * 모든 provider 실패 시에도 throw 하지 않고 `{ success: false, ... }` 반환.
 *
 * @param featureKey ai_feature_settings.feature_key
 * @param prompt 프롬프트
 * @param options.fallbackContent 전체 실패 시 사용할 기본 텍스트 (선택)
 * @param options.files 첨부 파일 (선택)
 * @param options.maxAttempts 최대 시도 provider 수 (기본 3)
 */
export async function generateAIContentSafe(
  featureKey: string,
  prompt: string,
  options?: {
    fallbackContent?: string
    files?: AIFileAttachment[]
    maxAttempts?: number
  }
): Promise<AIFallbackResult> {
  const maxAttempts = options?.maxAttempts ?? 3

  // 1) 시도 후보 목록 수집 (feature 매핑 우선, 그 다음 활성 설정)
  const tried = new Set<string>()
  const candidates: AIConfig[] = []

  const primary = await getAIConfigForFeature(featureKey)
  if (primary) {
    candidates.push(primary)
    tried.add(`${primary.provider}:${primary.apiKey}`)
  }

  const { data: others } = await supabase
    .from('ai_settings')
    .select('provider, api_key, model, is_active')
    .eq('is_active', true)
    .neq('provider', 'deepgram')
    .order('updated_at', { ascending: false })

  if (others) {
    for (const s of others) {
      const key = `${s.provider}:${s.api_key}`
      if (tried.has(key)) continue
      tried.add(key)
      candidates.push({ provider: s.provider, apiKey: s.api_key, model: s.model })
      if (candidates.length >= maxAttempts) break
    }
  }

  if (candidates.length === 0) {
    return {
      success: false,
      content: options?.fallbackContent ?? '',
      error: 'AI가 설정되지 않았습니다. 관리자에게 설정 > AI에서 활성 provider를 추가하도록 요청해주세요.',
      keyError: true,
    }
  }

  // 2) 순차 시도
  let lastErr = ''
  let lastKeyErr = false
  for (const cfg of candidates) {
    try {
      const res = await generateAIContent(cfg, prompt, options?.files)
      if (res.content.trim()) {
        return { success: true, content: res.content, provider: res.provider, model: res.model }
      }
      lastErr = '빈 응답'
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const cls = classifyError(msg)
      lastErr = msg
      lastKeyErr = cls.keyError
      // 키 오류 로그 (개발자 디버깅용)
      if (cls.keyError) {
        console.warn(`[AI fallback] ${cfg.provider} 키 오류, 다음 provider 시도`, msg)
      } else if (cls.quotaError) {
        console.warn(`[AI fallback] ${cfg.provider} 할당량 초과, 다음 provider 시도`)
      } else {
        console.warn(`[AI fallback] ${cfg.provider} 실패`, msg)
      }
      // 다음 후보로 계속
    }
  }

  // 3) 전원 실패
  return {
    success: false,
    content: options?.fallbackContent ?? '',
    error: lastKeyErr
      ? 'AI 키가 유효하지 않습니다. 관리자에게 설정 > AI에서 키를 갱신하도록 요청해주세요.'
      : `AI 호출이 실패했습니다: ${lastErr || '알 수 없는 오류'}`,
    keyError: lastKeyErr,
  }
}

// ─── Multi-turn chat (AI Agent용) ────────────────────────────────

export async function generateAIChat(
  config: AIConfig,
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[]
): Promise<AIResponse> {
  const content = await callAIProxy(config.apiKey, {
    provider: config.provider,
    model: config.model,
    action: 'chat',
    systemPrompt,
    messages,
  })

  return { content, provider: config.provider, model: config.model }
}

// ─── Deepgram Nova-3 STT (음성→텍스트, 화자분리 포함) ─────────────

export const DEEPGRAM_COST_PER_MIN = 0.0043 // USD $0.0043/분

export async function transcribeAudio(
  apiKey: string,
  audioBlob: Blob,
  language = 'ko'
): Promise<{
  text: string
  segments: { start: number; end: number; text: string; speaker?: number }[]
  durationSeconds: number
}> {
  const params = new URLSearchParams({
    model: 'nova-3',
    language,
    smart_format: 'true',
    diarize: 'true',
    utterances: 'true',
    punctuate: 'true',
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000) // 5분 타임아웃

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': audioBlob.type || 'audio/webm',
    },
    body: audioBlob,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, any>
    throw new Error(err?.err_msg || err?.error || `Deepgram API error: ${res.status}`)
  }

  const data = await res.json()
  const channel = data.results?.channels?.[0]?.alternatives?.[0]
  const durationSeconds = Math.round(data.metadata?.duration || 0)

  // utterances → 화자 구분 세그먼트
  const utterances = data.results?.utterances || []
  const segments = utterances.map((u: any) => ({
    start: u.start,
    end: u.end,
    text: u.transcript,
    speaker: u.speaker,
  }))

  // 화자 구분 텍스트 (요약 AI에 전달 시 화자별 발화 구분 가능)
  let text: string
  if (utterances.length > 0) {
    text = utterances
      .map((u: any) => `[화자 ${(u.speaker ?? 0) + 1}] ${u.transcript}`)
      .join('\n')
  } else {
    text = channel?.transcript || ''
  }

  return { text, segments, durationSeconds }
}

// ─── 회의록 AI 요약 (2단계 구조화 분석) ──────────────────────────

export interface MeetingSummaryResult {
  summary: string
  actionItems: string[]
  decisions: string[]
}

const MEETING_SYSTEM_PROMPT = `당신은 회의 내용을 실무 액션으로 전환하는 전문가입니다.
회의록을 읽은 사람이 바로 실행에 옮길 수 있도록 프로젝트별/업무별로 분류하여 정리합니다.
반드시 한국어로 작성하며, 녹취록에 없는 내용은 추가하지 마세요.
모든 항목은 실무 수행이 가능한 수준으로 구체적이어야 합니다.`

function buildMeetingSummaryPrompt(title: string, transcription: string): string {
  return `다음은 "${title}" 회의의 녹취록입니다. 아래 형식을 **정확히** 따라 실무 실행 가능한 회의록을 작성하세요.

반드시 지킬 규칙:
- 각 섹션은 3~5줄 이내로 간결하게
- 추상적 표현("검토 필요", "논의됨") 금지 → 구체적 실행 문장
- 가능하면 담당자/기한 명시
- 프로젝트명은 녹취록에 언급된 그대로 사용

---

## 📋 핵심 요약
3~5줄로 회의 전체를 한눈에 파악할 수 있도록 요약하세요. 회의 목적, 주요 결정, 가장 중요한 액션 1~2건을 포함합니다.

## 📁 프로젝트별 업무 정리
회의에서 언급된 프로젝트/주제별로 구분하세요. 프로젝트가 없으면 "일반 업무"로 묶어도 됩니다.

### [프로젝트/주제명 1]
**핵심 논의**: (무엇이 논의되었나 1~2줄)
**결정사항**:
- ✅ (구체적 결정)
**해야 할 일**:
- [ ] **담당자**: 업무 내용 (기한)
- [ ] **담당자**: 업무 내용 (기한)

### [프로젝트/주제명 2]
(동일 구조 반복)

## ⚡ 즉시 조치 필요 사항
회의 이후 **24~48시간 이내** 반드시 처리해야 할 우선순위 사항입니다. 없으면 "없음".
- 🚨 **담당자**: 조치 내용 + 왜 긴급한지 (1줄)

## 🔄 다음 미팅 논의 안건
결론이 나지 않아 **다음 회의에서 반드시 재논의**가 필요한 사항입니다.
- ⚠️ (안건 + 관련 이해관계자)

## 💡 참고 의견 / 리스크
업무 실행 시 주의해야 할 아이디어, 리스크, 제안 사항입니다. 없으면 생략.
- 💡 (의견/리스크 1줄 설명)

---
녹취록:
${transcription}`
}

function parseMeetingSummary(content: string): MeetingSummaryResult {
  // 액션아이템 추출: "- [ ] **담당자**: 내용" 또는 "- [ ] 담당자: 내용"
  const actionItems = (content.match(/- \[[ x]\] .+/g) || [])
    .map((s) => s.replace(/^- \[[ x]\] /, '').replace(/\*\*/g, ''))

  // 결정사항 추출: "- ✅ 내용"
  const decisions = (content.match(/- ✅ .+/g) || [])
    .map((s) => s.replace(/^- ✅ /, ''))

  return { summary: content, actionItems, decisions }
}

export async function summarizeMeeting(
  geminiKey: string,
  title: string,
  transcription: string
): Promise<MeetingSummaryResult> {
  if (!transcription.trim()) {
    return { summary: '', actionItems: [], decisions: [] }
  }

  const fullPrompt = `${MEETING_SYSTEM_PROMPT}\n\n${buildMeetingSummaryPrompt(title, transcription)}`

  // 1차: Gemini 시도
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: MEETING_SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: buildMeetingSummaryPrompt(title, transcription) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
        }),
      }
    )

    if (res.ok) {
      const data = await res.json()
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (content.trim()) return parseMeetingSummary(content)
    }
    // Gemini 실패 — 폴백 진행
  } catch {
    // Gemini 네트워크 오류 — 폴백 진행
  }

  // 2차: 등록된 다른 AI 엔진으로 폴백
  const fallbackConfig = await getAIConfigForFeature('meeting_summary')
  if (fallbackConfig) {
    try {
      const result = await generateAIContent(fallbackConfig, fullPrompt)
      if (result.content.trim()) return parseMeetingSummary(result.content)
    } catch {
      // 폴백도 실패
    }
  }

  // 3차: ai_settings에서 활성 엔진 아무거나
  const { data: anySetting } = await supabase
    .from('ai_settings')
    .select('provider, api_key, model')
    .eq('is_active', true)
    .neq('provider', 'deepgram')
    .limit(1)
    .single()

  if (anySetting) {
    const result = await generateAIContent(
      { provider: anySetting.provider, apiKey: anySetting.api_key, model: anySetting.model },
      fullPrompt
    )
    if (result.content.trim()) return parseMeetingSummary(result.content)
  }

  throw new Error('모든 AI 엔진이 응답하지 않습니다. 잠시 후 재시도해주세요.')
}

// ─── CEO 경영 브리핑 생성 ──────────────────────────────────────

export interface CEOBriefingData {
  date: string
  totalEmployees: number
  signals: { green: number; yellow: number; red: number; black: number; riskNames: string[] }
  projects: { name: string; status: string; priority: number; delayedStages: string[] }[]
  probation: { name: string; hireDate: string; scores: { stage: string; avg: number; recommendation: string }[] }[]
  pipeline: { applied: number; screening: number; interview: number; hired: number; totalPostings: number }
  recentDecisions: string[]
  recentActionItems: string[]
}

const CEO_BRIEFING_PROMPT = `당신은 대한민국 중소기업 CEO의 참모입니다. 아래 HR 데이터를 분석하여 경영 의사결정에 필요한 핵심 브리핑을 작성하세요.

작성 규칙:
- 수치와 근거를 반드시 포함
- 문제점만 나열하지 말고 구체적인 조치 방안을 제시
- CEO가 이번 주 즉시 실행할 수 있는 액션 위주
- 긍정적 성과도 균형있게 포함
- 마크다운 형식, 한국어로 작성

다음 구조로 작성하세요:

## 핵심 요약
(가장 시급한 3가지 사안을 1문장씩)

## 프로젝트 현황 분석
- 지연/홀딩 프로젝트 진단 및 원인 추정
- 우선순위 재설정이 필요한 프로젝트
- 정상 진행 중인 프로젝트 성과

## 인력 현황 분석
- 수습 직원 평가 추이 및 정규직 전환 권고
- 직원 신호등 위험 인원 분석 및 조치 제안
- 팀 안정성 진단

## 채용 파이프라인 분석
- 단계별 전환율 및 병목 구간
- 채용 속도 진단 및 개선 제안

## 이번 주 CEO 집중 사항
(가장 중요한 3가지를 우선순위 순으로, 각각 구체적 액션 포함)`

export async function generateCEOBriefing(data: CEOBriefingData): Promise<string> {
  const dataText = `
[분석 기준일] ${data.date}

[전체 인원] ${data.totalEmployees}명

[직원 신호등]
우수(Green): ${data.signals.green}명 / 보통(Yellow): ${data.signals.yellow}명 / 주의(Red): ${data.signals.red}명 / 위험(Black): ${data.signals.black}명
${data.signals.riskNames.length > 0 ? `위험/주의 직원: ${data.signals.riskNames.join(', ')}` : '위험/주의 직원 없음'}

[프로젝트 현황] (${data.projects.length}개)
${data.projects.map((p) => `- ${p.name} | 상태: ${p.status} | 우선순위: ${p.priority}/10${p.delayedStages.length > 0 ? ` | 지연 단계: ${p.delayedStages.join(', ')}` : ''}`).join('\n')}

[수습 직원] (${data.probation.length}명)
${data.probation.map((p) => `- ${p.name} (입사: ${p.hireDate})\n  ${p.scores.map((s) => `${s.stage}: ${s.avg}점 [${s.recommendation}]`).join(' → ')}`).join('\n')}

[채용 파이프라인] (공고 ${data.pipeline.totalPostings}건)
지원 ${data.pipeline.applied}명 → 서류/설문 ${data.pipeline.screening}명 → 면접 ${data.pipeline.interview}명 → 합격 ${data.pipeline.hired}명
${data.pipeline.applied > 0 ? `서류 통과율: ${Math.round((data.pipeline.screening / data.pipeline.applied) * 100)}% / 최종 합격률: ${Math.round((data.pipeline.hired / data.pipeline.applied) * 100)}%` : '지원자 없음'}

[최근 회의 결정사항]
${data.recentDecisions.length > 0 ? data.recentDecisions.map((d) => `- ${d}`).join('\n') : '없음'}

[미완료 액션아이템]
${data.recentActionItems.length > 0 ? data.recentActionItems.map((a) => `- ${a}`).join('\n') : '없음'}
`

  const fullPrompt = `${CEO_BRIEFING_PROMPT}\n\n${dataText}`

  // 1차: feature 설정된 AI
  const config = await getAIConfigForFeature('ceo_report')
  if (config) {
    try {
      const result = await generateAIContent(config, fullPrompt)
      if (result.content.trim()) return result.content
    } catch { /* 폴백 */ }
  }

  // 2차: 활성 AI 아무거나
  const { data: fallback } = await supabase
    .from('ai_settings')
    .select('provider, api_key, model')
    .eq('is_active', true)
    .neq('provider', 'deepgram')
    .limit(1)
    .single()

  if (fallback) {
    const result = await generateAIContent(
      { provider: fallback.provider, apiKey: fallback.api_key, model: fallback.model },
      fullPrompt
    )
    if (result.content.trim()) return result.content
  }

  throw new Error('AI 엔진이 응답하지 않습니다. 잠시 후 재시도해주세요.')
}

// ─── API key validation ─────────────────────────────────────────

export async function validateApiKey(config: AIConfig): Promise<{ valid: boolean; error?: string }> {
  try {
    if (config.provider === 'deepgram') {
      // Deepgram: 빈 오디오로 인증 검증 (관리 API는 CORS 차단)
      const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=ko', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${config.apiKey}`,
          'Content-Type': 'audio/wav',
        },
        body: new Blob([], { type: 'audio/wav' }),
      })
      // 401/403 = 키 오류, 400 = 키는 유효하지만 빈 오디오라서 발생하는 정상 에러
      if (res.status === 401 || res.status === 403) throw new Error('Deepgram API 키가 유효하지 않습니다.')
      return { valid: true }
    }
    await generateAIContent(config, 'Say "OK" in one word.')
    return { valid: true }
  } catch (err: any) {
    return { valid: false, error: err.message }
  }
}

// ─── Model options ──────────────────────────────────────────────

export const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
]

export const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
]

export const CLAUDE_MODELS = [
  { value: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
]

export const DEEPGRAM_MODELS = [
  { value: 'nova-3', label: 'Nova-3 (최신, 한국어 최적)' },
  { value: 'nova-2', label: 'Nova-2' },
]

// ─── Evaluation report prompt builder ────────────────────────────

export interface EvalReportData {
  employeeName: string
  departmentName: string | null
  role: string
  periodLabel: string
  selfScores: { itemName: string; score: number | null }[]
  leaderScores: { itemName: string; score: number | null }[]
  directorScores: { itemName: string; score: number | null }[]
  ceoScores: { itemName: string; score: number | null }[]
  finalScore: number | null
  grade: string | null
  comments: { role: string; strength?: string; improvement?: string; overall?: string }[]
  deptRank?: { rank: number; total: number }
}

export function buildEvalReportPrompt(data: EvalReportData): string {
  const scoreTable = data.selfScores.map((s, i) => {
    const leader = data.leaderScores[i]?.score ?? '-'
    const director = data.directorScores[i]?.score ?? '-'
    const ceo = data.ceoScores[i]?.score ?? '-'
    return `| ${s.itemName} | ${s.score ?? '-'} | ${leader} | ${director} | ${ceo} |`
  }).join('\n')

  const commentSection = data.comments
    .filter((c) => c.strength || c.improvement || c.overall)
    .map((c) => `**${c.role} 평가:**\n- 강점: ${c.strength || '없음'}\n- 개선점: ${c.improvement || '없음'}\n- 종합: ${c.overall || '없음'}`)
    .join('\n\n')

  return `다음 인사평가 데이터를 분석하여 종합 리포트를 작성해주세요.

## 대상 정보
- 이름: ${data.employeeName}
- 부서: ${data.departmentName ?? '미지정'}
- 역할: ${data.role}
- 평가 기간: ${data.periodLabel}
- 최종 점수: ${data.finalScore ?? '미산출'}
- 등급: ${data.grade ?? '미산출'}
${data.deptRank ? `- 부서 내 순위: ${data.deptRank.rank}위 / ${data.deptRank.total}명` : ''}

## 평가 점수
| 항목 | 자기 | 리더 | 이사 | 대표 |
|------|------|------|------|------|
${scoreTable}

## 평가자 코멘트
${commentSection || '코멘트 없음'}

---

다음 항목을 포함하여 **마크다운 형식**으로 리포트를 작성해주세요:

1. **종합 평가 요약** — 전체적인 평가 결과 요약 (2-3문장)
2. **강점 분석** — 높은 점수를 받은 항목과 그 의미
3. **개선 필요 영역** — 낮은 점수 항목과 구체적 개선 방향
4. **자기평가 vs 타인평가 갭 분석** — 자기 인식과 타인 평가의 차이점
5. **성장 제안** — 향후 역량 개발을 위한 구체적 제안 (3가지)
6. **부서 내 포지셔닝** — 부서 내 역할과 기여도 분석

각 섹션은 ##로 구분하고, 구체적인 숫자와 데이터를 인용하여 분석해주세요.`
}
