/**
 * Unified AI Client for Gemini and OpenAI API calls
 */

export interface AIConfig {
  provider: 'gemini' | 'openai' | 'claude'
  apiKey: string
  model: string
}

export interface AIResponse {
  content: string
  provider: string
  model: string
}

// ─── Gemini API ──────────────────────────────────────────────────

async function callGemini(config: AIConfig, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini API error: ${res.status}`)
  }

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

// ─── OpenAI API ─────────────────────────────────────────────────

async function callOpenAI(config: AIConfig, prompt: string): Promise<string> {
  const url = 'https://api.openai.com/v1/chat/completions'

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: '당신은 인사평가 전문 분석가입니다. 한국어로 응답하며, 구조화된 마크다운 형식으로 분석 리포트를 작성합니다.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenAI API error: ${res.status}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// ─── Claude (Anthropic) API ──────────────────────────────────────

async function callClaude(config: AIConfig, prompt: string): Promise<string> {
  const url = 'https://api.anthropic.com/v1/messages'

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: '당신은 인사평가 전문 분석가입니다. 한국어로 응답하며, 구조화된 마크다운 형식으로 분석 리포트를 작성합니다.',
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Claude API error: ${res.status}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}

// ─── Unified call ────────────────────────────────────────────────

export async function generateAIContent(config: AIConfig, prompt: string): Promise<AIResponse> {
  let content: string
  if (config.provider === 'gemini') {
    content = await callGemini(config, prompt)
  } else if (config.provider === 'claude') {
    content = await callClaude(config, prompt)
  } else {
    content = await callOpenAI(config, prompt)
  }

  return {
    content,
    provider: config.provider,
    model: config.model,
  }
}

// ─── Multi-turn chat (AI Agent용) ────────────────────────────────

export async function generateAIChat(
  config: AIConfig,
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[]
): Promise<AIResponse> {
  let content: string

  if (config.provider === 'gemini') {
    // Gemini: system instruction + contents 배열
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error?.message || `Gemini API error: ${res.status}`)
    }
    const data = await res.json()
    content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  } else if (config.provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error?.message || `Claude API error: ${res.status}`)
    }
    const data = await res.json()
    content = data.content?.[0]?.text ?? ''

  } else {
    // OpenAI
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error?.message || `OpenAI API error: ${res.status}`)
    }
    const data = await res.json()
    content = data.choices?.[0]?.message?.content ?? ''
  }

  return { content, provider: config.provider, model: config.model }
}

// ─── Whisper STT (음성→텍스트) ────────────────────────────────────

export async function transcribeAudio(
  apiKey: string,
  audioBlob: Blob,
  language = 'ko'
): Promise<{ text: string; segments: { start: number; end: number; text: string }[] }> {
  const formData = new FormData()
  formData.append('file', audioBlob, 'meeting.webm')
  formData.append('model', 'whisper-1')
  formData.append('language', language)
  formData.append('response_format', 'verbose_json')
  formData.append('timestamp_granularities[]', 'segment')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Whisper API error: ${res.status}`)
  }

  const data = await res.json()
  return {
    text: data.text || '',
    segments: (data.segments || []).map((s: { start: number; end: number; text: string }) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
  }
}

// ─── API key validation ─────────────────────────────────────────

export async function validateApiKey(config: AIConfig): Promise<{ valid: boolean; error?: string }> {
  try {
    const testPrompt = 'Say "OK" in one word.'
    if (config.provider === 'gemini') {
      await callGemini({ ...config }, testPrompt)
    } else if (config.provider === 'claude') {
      await callClaude({ ...config }, testPrompt)
    } else {
      await callOpenAI({ ...config }, testPrompt)
    }
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
