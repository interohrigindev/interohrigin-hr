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

// ─── Unified call ────────────────────────────────────────────────

export async function generateAIContent(config: AIConfig, prompt: string, files?: AIFileAttachment[]): Promise<AIResponse> {
  const content = await callAIProxy(config.apiKey, {
    provider: config.provider,
    model: config.model,
    action: 'generate',
    prompt,
    ...(files && files.length > 0 ? { files } : {}),
  })

  return { content, provider: config.provider, model: config.model }
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

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': audioBlob.type || 'audio/webm',
    },
    body: audioBlob,
  })

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

const MEETING_SYSTEM_PROMPT = `당신은 10년 경력의 전문 회의록 작성자입니다.
참가자 간 컨센서스를 명확히 하고, 회의 후 실행력을 높이는 구조화된 회의록을 작성합니다.
반드시 한국어로 작성하며, 녹취록에 없는 내용은 추가하지 마세요.
화자 구분이 있는 경우 발언자를 명시하세요.`

function buildMeetingSummaryPrompt(title: string, transcription: string): string {
  return `다음은 "${title}" 회의의 녹취록입니다. 아래 형식을 **정확히** 따라 회의록을 작성하세요.

---

## 1. 회의 개요
- **회의 주제**: (회의의 핵심 목적 1문장)
- **주요 안건**: (논의된 안건을 번호로 나열)

## 2. 논의 내용 정리
각 안건별로 누가 어떤 의견을 냈는지 구조화하세요.
### 안건 1: (제목)
- (화자/발언자): 핵심 발언 내용
- (화자/발언자): 핵심 발언 내용
- **합의점**: (이 안건에서 합의된 내용, 없으면 "미합의"로 표시)

### 안건 2: (제목)
(동일 구조 반복)

## 3. 결정사항
회의에서 **확정된** 사항만 기록합니다.
- ✅ (구체적 결정 내용)
- ✅ (구체적 결정 내용)

## 4. 추가 협의 필요사항
회의 중 결론이 나지 않아 **추후 협의가 필요한** 사항입니다.
- ⚠️ (미결 사항 + 관련 이해관계자)
- ⚠️ (미결 사항 + 관련 이해관계자)

## 5. 액션 아이템 (To-Do)
다음 미팅 전까지 각 담당자가 수행해야 할 업무입니다.
- [ ] **담당자**: 업무 내용 (기한: YYYY.MM.DD 또는 "다음 미팅 전")
- [ ] **담당자**: 업무 내용 (기한: YYYY.MM.DD 또는 "다음 미팅 전")

## 6. 참고 의견 및 제안
회의 흐름에서 나온 부가 의견, 아이디어, 리스크 사항 등을 기록합니다.
- 💡 (의견/제안 내용)
- 💡 (의견/제안 내용)

## 7. 다음 미팅 안건 (예정)
이번 회의에서 도출된 다음 미팅 시 다뤄야 할 주제입니다.
- (안건 1)
- (안건 2)

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

  const prompt = buildMeetingSummaryPrompt(title, transcription)

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: MEETING_SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, any>
    throw new Error(err?.error?.message || `Gemini API error: ${res.status}`)
  }

  const data = await res.json()
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  return parseMeetingSummary(content)
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
