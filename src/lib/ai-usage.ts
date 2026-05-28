/**
 * AI 사용 기록 적재 (unified-ai-cost-dashboard)
 * Design Ref: §4 — best-effort insert. 실패해도 AI 기능 흐름을 막지 않는다.
 *
 * source_system 은 HR 앱이므로 'hr' 고정.
 * created_by 는 RLS/테이블 default(auth.uid())가 채우므로 명시하지 않는다.
 */

import { supabase } from '@/lib/supabase'

export interface AiUsageEntry {
  feature: string           // 'resume_analysis' | 'meeting_stt' | 'chat' ...
  provider: string          // 'gemini' | 'openai' | 'anthropic' | 'deepgram'
  model: string
  tokensInput?: number
  tokensOutput?: number
  unitCount?: number        // STT 분 등
  unitType?: string         // 'minutes'
  refTable?: string
  refId?: string
}

/**
 * AI 사용 1건을 ai_usage_log 에 적재. best-effort — 실패는 console.warn 만.
 * Plan SC-7: HR(ai.ts) 호출 후 토큰을 ai_usage_log 에 기록.
 */
export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  try {
    // 토큰/단위가 모두 0/없음이면 적재 가치 없음 — skip (노이즈 방지)
    const hasTokens = (entry.tokensInput || 0) > 0 || (entry.tokensOutput || 0) > 0
    const hasUnit = (entry.unitCount || 0) > 0
    if (!hasTokens && !hasUnit) return

    const { error } = await supabase.from('ai_usage_log').insert({
      source_system: 'hr',
      feature: entry.feature,
      provider: entry.provider,
      model: entry.model,
      tokens_input: entry.tokensInput ?? 0,
      tokens_output: entry.tokensOutput ?? 0,
      unit_count: entry.unitCount ?? null,
      unit_type: entry.unitType ?? null,
      ref_table: entry.refTable ?? null,
      ref_id: entry.refId ?? null,
    })
    if (error) console.warn('[logAiUsage] insert 실패(무시):', error.message)
  } catch (e) {
    console.warn('[logAiUsage] 예외(무시):', e instanceof Error ? e.message : String(e))
  }
}
