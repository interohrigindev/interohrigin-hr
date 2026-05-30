/**
 * IO CS 고객관리 플랫폼 SSO 연동 헬퍼
 *
 * HR 플랫폼과 IO CS 는 동일 Supabase 프로젝트를 공유하므로
 * 세션 토큰이 그대로 유효함. (IO Mall 과 동일 방식)
 *
 * 방식: URL fragment 로 access_token + refresh_token 전달
 * - fragment 는 서버로 전송되지 않아 네트워크 로그에 남지 않음
 * - IO CS 의 /sso 페이지가 토큰을 받아 setSession → 홈 리다이렉트
 * - IO CS 쪽에서 수신 직후 fragment 제거 (브라우저 히스토리 청소)
 */

import { supabase } from '@/lib/supabase'

export const IOCS_URL =
  import.meta.env.VITE_IOCS_URL || 'https://cs.interohrigin.com'

/**
 * 현재 HR 세션을 IO CS 로 전달하며 새 탭으로 이동.
 * 세션이 없으면 IO CS 로그인 페이지로 보냄.
 *
 * @param redirect IO CS 내부 경로 (기본: '/')
 * @param newTab 새 탭 여부 (기본: true)
 */
export async function openIoCs(redirect: string = '/', newTab: boolean = true): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()

  // 세션 강제 — 토큰 없으면 IO CS 신규 로그인 페이지로 보내지 않고 HR 재로그인 안내.
  // (사용자 요구: "새로운 로그인 페이지가 나오면 안 됨" 2026-05-30)
  if (!session?.access_token || !session?.refresh_token) {
    alert('HR 세션이 만료되어 IO CS 로 자동 로그인할 수 없습니다.\nHR 에서 다시 로그인 후 시도해주세요.')
    return
  }

  const params = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    redirect,
  })
  const url = `${IOCS_URL}/sso#${params.toString()}`

  if (newTab) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    window.location.href = url
  }
}
