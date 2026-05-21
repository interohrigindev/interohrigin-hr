/**
 * 외부로 나가는 링크(이메일/공유)에 사용할 공식 앱 도메인.
 *
 * - 기본값: https://hr.interohrigin.com (production)
 * - 오버라이드: 환경변수 VITE_APP_URL
 *
 * 주의: window.location.origin 을 쓰면 관리자가 pages.dev 같은 미리보기 도메인에서
 * 작업할 때 그 도메인이 그대로 외부로 전송되는 문제가 생긴다.
 * 사전질의서·공유 링크 등 외부 노출 URL 은 항상 이 상수를 사용한다.
 */
export const PUBLIC_APP_URL: string =
  ((import.meta.env.VITE_APP_URL as string | undefined) || 'https://hr.interohrigin.com').replace(/\/+$/, '')
