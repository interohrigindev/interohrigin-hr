/**
 * 통합 AI 비용 데이터 레이어 (unified-ai-cost-dashboard)
 * Design Ref: §3.3, §2.2 — get_unified_ai_costs RPC 호출 + 단가 환산 + 집계
 *
 * RPC 는 raw 토큰/단위만 반환(provider=NULL for finance). 여기서 estimateCost + 집계.
 */

import { supabase } from '@/lib/supabase'
import { estimateCost, inferProvider, type AiProvider } from '@/lib/ai-cost-pricing'

export type SourceSystem = 'hr' | 'cs' | 'finance' | 'mall'

/** RPC 원본 행 (get_unified_ai_costs 반환 컬럼과 1:1) */
export interface UnifiedAiCostRow {
  source_system: SourceSystem
  feature: string | null
  provider: string | null
  model: string | null
  tokens_input: number
  tokens_output: number
  unit_count: number | null
  unit_type: string | null
  occurred_at: string
}

/** 환산 비용이 덧붙은 행 */
export interface PricedAiCostRow extends UnifiedAiCostRow {
  provider_resolved: AiProvider
  cost_usd: number
  priced: boolean
}

export interface AiCostAggregates {
  totalUsd: number
  rows: PricedAiCostRow[]
  bySystem: Record<string, number>           // source_system → usd
  byModel: Record<string, number>            // model(또는 'unknown') → usd
  byMonth: Record<string, number>            // 'YYYY-MM' → usd
  unpricedCount: number                      // 단가 미등록 행 수 (UI disclaimer 용)
}

/**
 * 기간 내 통합 AI 비용 조회 (RPC) → 단가 환산 → 집계.
 * 비관리자 / 데이터 없음이면 빈 집계 반환 (throw 안 함).
 */
export async function getUnifiedAiCosts(start: string, end: string): Promise<AiCostAggregates> {
  const { data, error } = await supabase.rpc('get_unified_ai_costs', {
    p_start: start,
    p_end: end,
  })

  if (error) {
    console.warn('[getUnifiedAiCosts] RPC 실패:', error.message)
    return emptyAggregates()
  }

  const rows = (data ?? []) as UnifiedAiCostRow[]
  return aggregate(rows)
}

function emptyAggregates(): AiCostAggregates {
  return { totalUsd: 0, rows: [], bySystem: {}, byModel: {}, byMonth: {}, unpricedCount: 0 }
}

function aggregate(rows: UnifiedAiCostRow[]): AiCostAggregates {
  const priced: PricedAiCostRow[] = []
  const bySystem: Record<string, number> = {}
  const byModel: Record<string, number> = {}
  const byMonth: Record<string, number> = {}
  let totalUsd = 0
  let unpricedCount = 0

  for (const r of rows) {
    const cost = estimateCost({
      provider: r.provider,
      model: r.model,
      tokens_input: r.tokens_input,
      tokens_output: r.tokens_output,
      unit_count: r.unit_count,
      unit_type: r.unit_type,
    })
    const provider_resolved = (r.provider as AiProvider) || inferProvider(r.model)
    priced.push({ ...r, provider_resolved, cost_usd: cost.usd, priced: cost.priced })

    if (!cost.priced) unpricedCount += 1
    totalUsd += cost.usd

    bySystem[r.source_system] = (bySystem[r.source_system] || 0) + cost.usd
    const modelKey = r.model || 'unknown'
    byModel[modelKey] = (byModel[modelKey] || 0) + cost.usd
    const month = (r.occurred_at || '').slice(0, 7) // 'YYYY-MM'
    if (month) byMonth[month] = (byMonth[month] || 0) + cost.usd
  }

  return { totalUsd, rows: priced, bySystem, byModel, byMonth, unpricedCount }
}
