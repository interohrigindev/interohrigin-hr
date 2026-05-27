/**
 * 외부 비공개 이미지 감지 유틸
 *
 * 배경 (2026-05-27): 결재 본문에 Naver Works Flow(flow.worksmobile.com)에서
 * 복사한 이미지 src가 그대로 박혀 결재자 시야에서는 항상 깨져 보이는 사례
 * 발견. 외부 협업툴은 대부분 인증 쿠키가 필요해서 결재자/타인 브라우저에서는
 * 302 -> 로그인으로 리다이렉트되어 broken image로 표시됨.
 *
 * 본 유틸은 RichEditor 붙여넣기 시점(예방) + 결재 상세 렌더 시점(보수)
 * 양쪽에서 공통으로 사용된다.
 */

// 명확하게 인증이 필요한 비공개 협업툴 (도메인 또는 서픽스 매칭)
const PRIVATE_AUTH_HOST_SUFFIXES = [
  'worksmobile.com',      // Naver Works (flow, talk 등 전 서브도메인)
  'files.slack.com',
  'jandi.com',
  'static.jandi.com',
  'dooray.com',
  'kakaowork.com',
  'atlassian.net',        // Confluence / Jira 첨부
  'notion.so',            // Notion 첨부 (인증 + 만료)
  'notion.site',
] as const

// 우리 시스템 호스트는 절대 외부로 분류하지 않는다
const TRUSTED_HOST_PATTERNS = [
  /supabase\.co$/i,
  /supabase\.in$/i,
  /interohrigin-hr2?\.pages\.dev$/i,
  /^localhost$/i,
] as const

function getHost(url: string): string {
  try {
    const u = new URL(url, 'https://placeholder.local')
    return u.hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function isTrustedHost(url: string): boolean {
  const h = getHost(url)
  if (!h) return false
  return TRUSTED_HOST_PATTERNS.some((re) => re.test(h))
}

export function isPrivateAuthHost(url: string): boolean {
  const h = getHost(url)
  if (!h) return false
  return PRIVATE_AUTH_HOST_SUFFIXES.some(
    (suf) => h === suf || h.endsWith('.' + suf)
  )
}

export type ExternalImageScan = {
  /** 결재자에게 100% 깨질 것 (협업툴 인증 필요) */
  privateAuth: string[]
  /** 우리 시스템 외부 호스트 (의심 — 공개 URL일 수도, 아닐 수도) */
  otherExternal: string[]
  /** 우리 시스템 내부 호스트 */
  trusted: string[]
}

/**
 * HTML 문자열에서 모든 <img src="..."> 를 추출해 분류한다.
 * RichEditor 본문 / 결재 body_html 등 임의의 HTML 에 사용 가능.
 */
export function scanImagesInHtml(html: string): ExternalImageScan {
  const out: ExternalImageScan = { privateAuth: [], otherExternal: [], trusted: [] }
  if (!html) return out
  // 단순 정규식 — DOMParser 미사용 (SSR / 작은 의존성)
  const re = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  const seen = new Set<string>()
  while ((m = re.exec(html)) !== null) {
    const src = m[1]
    if (!src || seen.has(src)) continue
    seen.add(src)
    // data URI / 상대경로는 안전
    if (src.startsWith('data:') || src.startsWith('blob:')) {
      out.trusted.push(src)
      continue
    }
    if (src.startsWith('/') && !src.startsWith('//')) {
      out.trusted.push(src)
      continue
    }
    if (isTrustedHost(src)) {
      out.trusted.push(src)
    } else if (isPrivateAuthHost(src)) {
      out.privateAuth.push(src)
    } else {
      out.otherExternal.push(src)
    }
  }
  return out
}

/**
 * HTML body 안에서 비공개 협업툴 img 태그를 안내용 placeholder 로 치환.
 * 결재 상세 페이지 등 표시 측에서 사용 — 원본 img src 는 인증이 필요해
 * 어차피 깨져 보이므로 그 자리에 "외부 이미지 — 보이지 않음" 박스를 박는다.
 *
 * 일반 외부 도메인(공개 CDN 등)은 손대지 않는다 — 정상적으로 보일 가능성이 있어
 * 강제로 가리면 오히려 정보 손실.
 */
export function annotatePrivateAuthImages(html: string): string {
  if (!html) return html
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i)
    if (!srcMatch) return tag
    const src = srcMatch[1]
    if (!isPrivateAuthHost(src)) return tag
    const label = describeHost(src)
    return `<span style="display:block;padding:10px 14px;background:#fee2e2;border:1px dashed #dc2626;border-radius:6px;color:#991b1b;font-size:13px;font-weight:500;margin:8px 0">⚠️ ${label} 이미지 — 외부 인증이 필요해 결재자에게 표시되지 않습니다</span>`
  })
}

/**
 * 외부 비공개 호스트 이름을 사람이 읽기 좋은 라벨로 변환.
 * 안내 토스트 / 배너 문구에 사용.
 */
export function describeHost(url: string): string {
  const h = getHost(url)
  if (!h) return '외부 이미지'
  if (h.endsWith('worksmobile.com')) return 'Naver Works'
  if (h.endsWith('slack.com')) return 'Slack'
  if (h.endsWith('jandi.com')) return '잔디'
  if (h.endsWith('dooray.com')) return 'Dooray'
  if (h.endsWith('kakaowork.com')) return '카카오워크'
  if (h.endsWith('atlassian.net')) return 'Confluence/Jira'
  if (h.endsWith('notion.so') || h.endsWith('notion.site')) return 'Notion'
  return h
}
