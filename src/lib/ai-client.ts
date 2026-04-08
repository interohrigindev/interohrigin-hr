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
  // 1) 기능별 매핑 확인
  const { data: featureSetting } = await supabase
    .from('ai_feature_settings')
    .select('ai_setting_id')
    .eq('feature_key', featureKey)
    .single()

  if (featureSetting?.ai_setting_id) {
    const { data: setting } = await supabase
      .from('ai_settings')
      .select('provider, api_key, model')
      .eq('id', featureSetting.ai_setting_id)
      .single()

    if (setting) {
      return { provider: setting.provider, apiKey: setting.api_key, model: setting.model }
    }
  }

  // 2) fallback: 기본 활성 설정
  const { data: defaultSetting } = await supabase
    .from('ai_settings')
    .select('provider, api_key, model')
    .eq('is_active', true)
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

// ─── API key validation ─────────────────────────────────────────

export async function validateApiKey(config: AIConfig): Promise<{ valid: boolean; error?: string }> {
  try {
    if (config.provider === 'deepgram') {
      // Deepgram: 프로젝트 목록 조회로 키 검증
      const res = await fetch('https://api.deepgram.com/v1/projects', {
        headers: { 'Authorization': `Token ${config.apiKey}` },
      })
      if (!res.ok) throw new Error(`Deepgram 키 검증 실패 (${res.status})`)
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
