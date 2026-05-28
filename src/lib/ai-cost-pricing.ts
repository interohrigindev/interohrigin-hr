/**
 * AI 모델 단가 상수 + 비용 환산 (unified-ai-cost-dashboard)
 * Design Ref: §3.2, §10 — 단가 환산은 클라이언트 책임(RPC 는 raw 토큰만)
 *
 * ⚠️ 단가는 모두 "추정치" (공식 published 단가 기준, 실제 청구액과 다를 수 있음)
 *    출처/원문: docs/00-research/unified-ai-cost-dashboard/pricing-sources.md
 *    갱신일: 2026-05 — 분기마다 재확인 권장
 *    단위: LLM = USD per 1M tokens (input/output 분리), STT = USD per minute
 */

// Deepgram STT 단가는 ai-client.ts 의 단일 source 를 재사용 (DRY)
import { DEEPGRAM_COST_PER_MIN } from '@/lib/ai-client'

export type AiProvider = 'gemini' | 'openai' | 'anthropic' | 'deepgram' | 'unknown'

/** USD 환율 — billing.tsx 기존 값(1380) 상수화 */
export const USD_TO_KRW = 1380

interface ModelPrice {
  /** USD per 1M input tokens */
  input: number
  /** USD per 1M output tokens */
  output: number
}

/** model 키 → 단가. 키는 ai-client.ts 의 *_MODELS value 와 정합. */
export const MODEL_PRICING: Record<string, ModelPrice> = {
  // Gemini
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-3-flash-preview': { input: 0.30, output: 2.50 },
  'gemini-3.1-pro-preview': { input: 1.25, output: 10.00 },
  // OpenAI
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  // Anthropic
  'claude-sonnet-4-5-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-opus-4-6': { input: 15.00, output: 75.00 },
}

/** STT(분당) 단가 — provider 단위 */
export const STT_PRICING: Record<string, number> = {
  deepgram: DEEPGRAM_COST_PER_MIN, // 0.0043 USD/min
}

/** model 문자열로 provider 추론 (finance 레코드는 provider=NULL) */
export function inferProvider(model: string | null | undefined): AiProvider {
  const m = (model || '').toLowerCase()
  if (m.startsWith('gemini')) return 'gemini'
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3')) return 'openai'
  if (m.startsWith('claude')) return 'anthropic'
  if (m.startsWith('nova')) return 'deepgram'
  return 'unknown'
}

export interface CostInput {
  provider?: string | null
  model: string | null
  tokens_input?: number | null
  tokens_output?: number | null
  unit_count?: number | null   // STT 분 등
  unit_type?: string | null    // 'minutes'
}

export interface CostResult {
  /** 환산 비용 (USD). 단가 미등록이면 0 */
  usd: number
  /** 단가 등록 여부 — false 면 UI 에서 "단가 미등록" 표기 */
  priced: boolean
  provider: AiProvider
}

/**
 * 토큰/단위를 USD 비용으로 환산.
 * - STT(unit_type='minutes'): unit_count × 분당 단가
 * - LLM: (tokens_input/1e6 × input) + (tokens_output/1e6 × output)
 * - 단가 미등록 모델: usd=0, priced=false
 */
export function estimateCost(input: CostInput): CostResult {
  const provider = (input.provider as AiProvider) || inferProvider(input.model)

  // STT 단위 기반
  if (input.unit_count != null && input.unit_type === 'minutes') {
    const perMin = STT_PRICING[provider]
    if (perMin == null) return { usd: 0, priced: false, provider }
    return { usd: input.unit_count * perMin, priced: true, provider }
  }

  // LLM 토큰 기반
  const price = input.model ? MODEL_PRICING[input.model] : undefined
  if (!price) return { usd: 0, priced: false, provider }

  const ti = Number(input.tokens_input) || 0
  const to = Number(input.tokens_output) || 0
  const usd = (ti / 1_000_000) * price.input + (to / 1_000_000) * price.output
  return { usd, priced: true, provider }
}

/** USD → KRW (반올림) */
export function usdToKrw(usd: number): number {
  return Math.round(usd * USD_TO_KRW)
}
