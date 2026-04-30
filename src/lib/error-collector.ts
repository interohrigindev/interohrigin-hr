/**
 * 에러 자동 수집 — Phase 1
 *  - window.onerror / unhandledrejection 캐치
 *  - Supabase RLS 거부·DB 에러 인터셉터 (lazy 등록)
 *  - 해시 기반 중복 카운트 (서버 RPC log_error)
 *  - dev 모드에서는 console 만, prod 에서만 서버 전송
 */
import { supabase } from '@/lib/supabase'

const IS_DEV = import.meta.env.DEV

// 에러 폭주 방지: 같은 해시는 클라이언트 측에서도 30초간 재전송 차단
const recentlySent = new Map<string, number>()
const DEDUP_WINDOW_MS = 30 * 1000
const MAX_BUFFER_MS = 5 * 60 * 1000

function shouldSend(hash: string): boolean {
  const now = Date.now()
  // 만료된 항목 청소
  for (const [k, t] of recentlySent.entries()) {
    if (now - t > MAX_BUFFER_MS) recentlySent.delete(k)
  }
  const last = recentlySent.get(hash)
  if (last && now - last < DEDUP_WINDOW_MS) return false
  recentlySent.set(hash, now)
  return true
}

// 단순 해시 (FNV-1a 32-bit)
function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

interface ErrorPayload {
  errorType: 'react_error' | 'unhandled_rejection' | 'window_error' | 'manual'
  message: string
  stack?: string
  componentStack?: string
  severity?: 'info' | 'warning' | 'error' | 'critical'
}

export async function reportError(payload: ErrorPayload) {
  const route = typeof window !== 'undefined' ? window.location.pathname : ''
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

  // 해시: 메시지 + route + 스택 첫 줄
  const stackHead = (payload.stack || '').split('\n').slice(0, 2).join('|')
  const hash = hashString(`${payload.errorType}|${payload.message}|${route}|${stackHead}`)

  if (!shouldSend(hash)) return

  if (IS_DEV) {
    // dev 환경에서는 console 만, 서버 전송 안 함
    console.warn('[error-collector]', payload.errorType, payload.message, payload)
    return
  }

  try {
    let userRole: string | null = null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle()
        userRole = (data as { role?: string } | null)?.role || null
      }
    } catch { /* 익명 사용자 등 */ }

    await supabase.rpc('log_error', {
      p_error_hash: hash,
      p_error_type: payload.errorType,
      p_message: payload.message?.slice(0, 2000) || null,
      p_stack: payload.stack?.slice(0, 5000) || null,
      p_component_stack: payload.componentStack?.slice(0, 3000) || null,
      p_route: route,
      p_user_agent: ua.slice(0, 300),
      p_severity: payload.severity || 'error',
      p_user_role: userRole,
    })
  } catch (err) {
    // 에러 보고 자체가 실패하면 조용히 무시 (무한 루프 방지)
    if (IS_DEV) console.error('[error-collector] report failed', err)
  }
}

/**
 * 전역 핸들러 설치 — main.tsx 에서 1회 호출
 */
export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    // 이미지·css 로드 실패 등 ResourceError 는 message 비어있음 → 스킵
    if (!event.message) return
    reportError({
      errorType: 'window_error',
      message: event.message,
      stack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
      severity: 'error',
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    let message = 'Unhandled promise rejection'
    let stack: string | undefined

    if (reason instanceof Error) {
      message = reason.message
      stack = reason.stack
    } else if (typeof reason === 'string') {
      message = reason
    } else if (reason && typeof reason === 'object') {
      try { message = JSON.stringify(reason).slice(0, 500) } catch { /* */ }
    }

    reportError({
      errorType: 'unhandled_rejection',
      message,
      stack,
      severity: 'error',
    })
  })
}
