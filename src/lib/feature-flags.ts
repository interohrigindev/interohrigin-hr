// 법적 리스크 대응 P0 — 기능 토글 (feature_rollouts)
// 사용 예:
//   if (await isFeatureEnabled(FEATURE_KEYS.OVERTIME_APPROVAL)) { ... }
//
// 캐시: 메모리(60초) — localStorage/sessionStorage 사용 금지 (절대 규칙)

import { supabase } from '@/lib/supabase'
import type { FeatureKey, FeatureRolloutRow } from '@/types/compliance'

const CACHE_TTL_MS = 60_000  // 60초
let cache: { rows: FeatureRolloutRow[]; expiresAt: number } | null = null

/**
 * 전체 feature_rollouts 캐시 로드 (60초 메모리)
 */
async function loadAllFeatures(): Promise<FeatureRolloutRow[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.rows
  }
  const { data, error } = await supabase
    .from('feature_rollouts')
    .select('*')
  if (error) {
    console.warn('[feature-flags] 로드 실패:', error.message)
    return cache?.rows || []
  }
  cache = {
    rows: (data || []) as FeatureRolloutRow[],
    expiresAt: Date.now() + CACHE_TTL_MS,
  }
  return cache.rows
}

/**
 * 특정 feature 활성 여부 확인.
 * scope='none' 이면 false. 'admin_only' 면 호출자 role 체크 필요 (UI 에서 별도).
 */
export async function isFeatureEnabled(key: FeatureKey | string): Promise<boolean> {
  const rows = await loadAllFeatures()
  const row = rows.find((r) => r.feature_key === key)
  return !!row?.is_enabled
}

/**
 * Sync 버전 — useFeatureFlags() 훅과 함께 사용 권장.
 * 캐시 미로드 시 false 반환 (보수적 fallback).
 */
export function isFeatureEnabledSync(key: FeatureKey | string): boolean {
  if (!cache) return false
  const row = cache.rows.find((r) => r.feature_key === key)
  return !!row?.is_enabled
}

/**
 * 모든 feature 상태 일괄 조회 (관리자 UI 용)
 */
export async function listAllFeatures(): Promise<FeatureRolloutRow[]> {
  return loadAllFeatures()
}

/**
 * 캐시 무효화 — 토글 직후 호출
 */
export function invalidateFeatureCache(): void {
  cache = null
}

/**
 * Feature 토글 (SECURITY DEFINER RPC).
 * 권한 없으면 RPC 가 직접 에러.
 */
export async function setFeatureRollout(args: {
  featureKey: string
  isEnabled: boolean
  scope: 'none' | 'admin_only' | 'department' | 'company_wide'
  scopeFilter?: Record<string, unknown>
  notes?: string
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('set_feature_rollout', {
    p_feature_key: args.featureKey,
    p_is_enabled: args.isEnabled,
    p_scope: args.scope,
    p_scope_filter: args.scopeFilter || {},
    p_notes: args.notes ?? null,
  })
  if (error) return { ok: false, error: error.message }
  invalidateFeatureCache()
  return { ok: true }
}
