// 법적 리스크 대응 P0 — 감사 로그 유틸
// 사용 예:
//   await logAudit({
//     action: 'update',
//     entity: 'leave_promotion',
//     entityId: id,
//     before: oldRow,
//     after: newRow,
//     diff: '연차 촉진서 회신 완료',
//   })

import { supabase } from '@/lib/supabase'
import type { AuditActionType, AuditEntityType } from '@/types/compliance'

export interface LogAuditArgs {
  action: AuditActionType
  entity: AuditEntityType
  entityId?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  diff?: string | null
  /** 'web' | 'cron' | 'api' | 'rpc' */
  source?: string
}

// 브라우저 user-agent 정도만 캡처 (IP 는 서버측에서 별도 처리 — 클라이언트에서는 hash 안 함)
function captureUserAgent(): string | null {
  if (typeof navigator === 'undefined') return null
  return navigator.userAgent?.slice(0, 200) || null
}

/**
 * 감사 로그를 SECURITY DEFINER RPC 로 기록.
 * 실패해도 사용자 액션을 막지 않음 — 로그만 콘솔 경고.
 */
export async function logAudit(args: LogAuditArgs): Promise<string | null> {
  const { error, data } = await supabase.rpc('log_audit', {
    p_action_type: args.action,
    p_entity_type: args.entity,
    p_entity_id: args.entityId ?? null,
    p_before: args.before ?? null,
    p_after: args.after ?? null,
    p_diff_summary: args.diff ?? null,
    p_request_source: args.source ?? 'web',
    p_ip_hash: null,
    p_user_agent: captureUserAgent(),
  })
  if (error) {
    console.warn('[audit-logger] 기록 실패:', error.message, args)
    return null
  }
  return (data as string) || null
}

/**
 * 민감 데이터 마스킹 — before/after 에 포함될 수 있는 PII 가림.
 * 신규 모듈에서 before/after 저장 전에 호출 권장.
 */
export function maskSensitive(
  row: Record<string, unknown> | null | undefined,
  fields: string[] = ['ssn','resident_id','password','phone','email','salary','annual_salary'],
): Record<string, unknown> | null {
  if (!row) return null
  const masked: Record<string, unknown> = { ...row }
  for (const f of fields) {
    if (f in masked && masked[f] != null) {
      const val = String(masked[f])
      // 앞 2자 + 가림
      masked[f] = val.length <= 2 ? '**' : val.slice(0, 2) + '***'
    }
  }
  return masked
}
