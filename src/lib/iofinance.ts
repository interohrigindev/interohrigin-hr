/**
 * IO Finance 회계 플랫폼 SSO 연동 헬퍼
 *
 * HR 플랫폼과 IO Finance 는 동일 Supabase 프로젝트를 공유하므로
 * 세션 토큰이 그대로 유효함. (IO Mall · IO CS 와 동일 방식)
 *
 * 방식: URL fragment 로 access_token + refresh_token 전달
 * - fragment 는 서버로 전송되지 않아 네트워크 로그에 남지 않음
 * - IO Finance 의 /sso 페이지가 토큰을 받아 setSession → 홈 리다이렉트
 * - 수신 직후 fragment 제거 (브라우저 히스토리 청소)
 */

import { supabase } from '@/lib/supabase'

export const IOFINANCE_URL =
  import.meta.env.VITE_IOFINANCE_URL || 'https://fn.interohrigin.com'

// 초기 접근 권한 (사용자 결정 2026-05-30): 재무회계 직원 + 강제묵 이사 + 대표이사
// 추후 menu_permissions 시스템 또는 employees.iofinance_access 컬럼으로 확장 가능.
const FINANCE_DEPT_ID = '063197e4-375c-47ac-9342-991149398128'  // 재무회계
const KANG_JM_ID = '70323171-d1f2-4828-a14e-80896ee4eccf'       // 강제묵 이사

export interface IoFinanceAccessCheck {
  id?: string
  role?: string | null
  department_id?: string | null
  name?: string | null
}

export function canAccessIoFinance(p: IoFinanceAccessCheck | null | undefined): boolean {
  if (!p) return false
  if (p.role === 'ceo' || p.role === 'admin') return true
  if (p.id === KANG_JM_ID) return true
  if (p.department_id === FINANCE_DEPT_ID) return true
  return false
}

/**
 * 현재 HR 세션을 IO Finance 로 전달하며 새 탭으로 이동.
 * 세션이 없으면 IO Finance 로그인 페이지로 보냄.
 *
 * @param redirect IO Finance 내부 경로 (기본: '/')
 * @param newTab 새 탭 여부 (기본: true)
 */
export async function openIoFinance(
  redirect: string = '/',
  newTab: boolean = true,
  profile?: IoFinanceAccessCheck | null,
): Promise<void> {
  // 권한 체크 (profile 전달된 경우)
  if (profile !== undefined && !canAccessIoFinance(profile)) {
    alert('IO Finance 회계 플랫폼은 승인된 사용자만 사용할 수 있습니다.\n(허용: 재무회계 부서 · 강제묵 이사 · 대표이사)')
    return
  }

  // 세션 강제 — 토큰 없으면 IO Finance 신규 로그인 페이지로 보내지 않고 HR 재로그인 안내
  // (사용자 요구: "새로운 로그인 페이지가 나오면 안 됨")
  // 토큰 회전 race 방지 — refreshSession 으로 가장 신선한 access/refresh 토큰 보장
  await supabase.auth.refreshSession().catch(() => { /* getSession 으로 fallback */ })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token || !session?.refresh_token) {
    alert('HR 세션이 만료되어 IO Finance 로 자동 로그인할 수 없습니다.\nHR 에서 다시 로그인 후 시도해주세요.')
    return
  }

  const params = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    redirect,
  })
  const url = `${IOFINANCE_URL}/sso#${params.toString()}`

  if (newTab) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    window.location.href = url
  }
}
