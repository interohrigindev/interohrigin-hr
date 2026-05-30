/**
 * IO Mall SSO 연동 헬퍼
 *
 * HR 플랫폼과 IO Mall은 동일 Supabase 프로젝트를 공유하므로
 * 세션 토큰이 그대로 유효함.
 *
 * 방식: URL fragment로 access_token + refresh_token 전달
 * - fragment는 서버로 전송되지 않아 네트워크 로그에 남지 않음
 * - IO Mall의 /sso 페이지가 토큰을 받아 setSession → 홈 리다이렉트
 * - IO Mall 쪽에서 수신 직후 fragment 제거 (브라우저 히스토리 청소)
 */

import { supabase } from '@/lib/supabase'

export const IOMALL_URL =
  import.meta.env.VITE_IOMALL_URL || 'https://iomall.pages.dev'

/**
 * 현재 HR 세션을 IO Mall로 전달하며 새 탭으로 이동.
 * 세션이 없으면 IO Mall 로그인 페이지로 보냄.
 *
 * @param redirect IO Mall 내부 경로 (기본: '/')
 * @param newTab 새 탭 여부 (기본: true)
 */
export async function openIoMall(redirect: string = '/', newTab: boolean = true): Promise<void> {
  // 토큰 회전 race 방지 — refreshSession 으로 가장 신선한 access/refresh 토큰 보장
  await supabase.auth.refreshSession().catch(() => { /* getSession 으로 fallback */ })
  const { data: { session } } = await supabase.auth.getSession()

  // 세션 강제 — 토큰 없으면 IO Mall 신규 로그인 페이지로 보내지 않고 HR 재로그인 안내.
  // (사용자 요구: "새로운 로그인 페이지가 나오면 안 됨" 2026-05-30)
  if (!session?.access_token || !session?.refresh_token) {
    alert('HR 세션이 만료되어 IO Mall 로 자동 로그인할 수 없습니다.\nHR 에서 다시 로그인 후 시도해주세요.')
    return
  }

  const params = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    redirect,
  })
  const url = `${IOMALL_URL}/sso#${params.toString()}`

  if (newTab) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    window.location.href = url
  }
}
