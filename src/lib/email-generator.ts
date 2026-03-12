/**
 * 한글 이름 → 이메일 자동 생성
 * 예: "차주용" → "jycha@interohrigin.com"
 *     성(마지막 글자) → 뒤에 배치
 *     이름(앞 글자들) → 영문 이니셜
 */

const DOMAIN = 'interohrigin.com'

// 한글 성씨 → 로마자 (표준 로마자 표기법 + 관용 표기)
const SURNAME_MAP: Record<string, string> = {
  '김': 'kim', '이': 'lee', '박': 'park', '최': 'choi', '정': 'jung',
  '강': 'kang', '조': 'cho', '윤': 'yoon', '장': 'jang', '임': 'lim',
  '한': 'han', '오': 'oh', '서': 'seo', '신': 'shin', '권': 'kwon',
  '황': 'hwang', '안': 'ahn', '송': 'song', '류': 'ryu', '유': 'yoo',
  '전': 'jeon', '홍': 'hong', '고': 'ko', '문': 'moon', '양': 'yang',
  '손': 'son', '배': 'bae', '백': 'baek', '허': 'huh', '노': 'noh',
  '남': 'nam', '하': 'ha', '주': 'joo', '구': 'koo', '곽': 'kwak',
  '성': 'sung', '차': 'cha', '우': 'woo', '민': 'min', '진': 'jin',
  '나': 'na', '지': 'ji', '엄': 'um', '채': 'chae', '원': 'won',
  '천': 'chun', '방': 'bang', '공': 'gong', '현': 'hyun',
  '변': 'byun', '염': 'yeom', '여': 'yeo', '추': 'choo', '도': 'do',
  '소': 'so', '석': 'seok', '선': 'sun', '설': 'seol', '마': 'ma',
  '길': 'gil', '연': 'yeon', '위': 'wi', '표': 'pyo', '명': 'myung',
  '기': 'ki', '반': 'ban', '라': 'ra', '왕': 'wang', '금': 'geum',
  '옥': 'ok', '육': 'yuk', '인': 'in', '맹': 'maeng', '제': 'je',
  '모': 'mo', '탁': 'tak', '국': 'kook', '어': 'eo', '음': 'eum',
  '편': 'pyeon', '피': 'pi', '빈': 'bin',
}

// 초성 (가~힣 19개 자음)
const CHOSUNG = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp',
  's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
]

// 중성 (21개 모음) — 풀 로마자
const JUNGSUNG = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o',
  'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu',
  'eu', 'ui', 'i',
]

// 종성 (28개, 첫 번째는 없음)
const JONGSUNG = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 'd', 'l',
  'l', 'l', 'l', 'l', 'l', 'l', 'l', 'm', 'b',
  'b', 's', 's', 'ng', 'j', 'j', 'k', 't', 'p', 'h',
]

/**
 * 한글 한 글자 → 로마자 변환
 */
function hangulToRoman(char: string): string {
  const code = char.charCodeAt(0)
  if (code < 0xAC00 || code > 0xD7A3) return char.toLowerCase()

  const offset = code - 0xAC00
  const cho = Math.floor(offset / (21 * 28))
  const jung = Math.floor((offset % (21 * 28)) / 28)
  const jong = offset % 28

  return CHOSUNG[cho] + JUNGSUNG[jung] + JONGSUNG[jong]
}

/**
 * 한글 글자의 초성 이니셜 추출
 */
function getInitial(char: string): string {
  const code = char.charCodeAt(0)
  if (code < 0xAC00 || code > 0xD7A3) return char.toLowerCase()
  const cho = Math.floor((code - 0xAC00) / (21 * 28))
  const initial = CHOSUNG[cho]
  return initial || 'a' // '' (ㅇ) → 'a' 대체
}

/**
 * 한글 이름 → 이메일 prefix 생성
 * "차주용" → "jycha" (이름 이니셜 + 성)
 * "홍길동" → "gdhong"
 */
export function generateEmailPrefix(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''

  // 한글이 아닌 경우 그대로 소문자 변환
  if (!/[가-힣]/.test(trimmed)) {
    return trimmed.toLowerCase().replace(/[^a-z0-9]/g, '')
  }

  const chars = [...trimmed]
  if (chars.length < 2) {
    return hangulToRoman(chars[0])
  }

  // 성 = 마지막 글자가 아니라 첫 글자 (한국식)
  const surname = chars[0]
  const givenName = chars.slice(1)

  // 성씨 로마자
  const surnameRoman = SURNAME_MAP[surname] ?? hangulToRoman(surname)

  // 이름 이니셜
  const givenInitials = givenName.map((c) => getInitial(c)).join('')

  return givenInitials + surnameRoman
}

/**
 * 풀 이름 로마자 변환 (중복 시 대안용)
 * "차주용" → "juyongcha"
 */
export function generateFullRomanName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  if (!/[가-힣]/.test(trimmed)) {
    return trimmed.toLowerCase().replace(/[^a-z0-9]/g, '')
  }

  const chars = [...trimmed]
  if (chars.length < 2) return hangulToRoman(chars[0])

  const surname = chars[0]
  const givenName = chars.slice(1)

  const surnameRoman = SURNAME_MAP[surname] ?? hangulToRoman(surname)
  const givenRoman = givenName.map((c) => hangulToRoman(c)).join('')

  return givenRoman + surnameRoman
}

/**
 * 이메일 주소 생성
 */
export function generateEmail(name: string): string {
  const prefix = generateEmailPrefix(name)
  return prefix ? `${prefix}@${DOMAIN}` : ''
}

/**
 * 중복 시 대안 이메일 목록 생성
 */
export function generateAlternativeEmails(name: string, existingCount: number): string[] {
  const prefix = generateEmailPrefix(name)
  const fullPrefix = generateFullRomanName(name)
  const alternatives: string[] = []

  // 번호 추가 버전
  if (existingCount > 0) {
    alternatives.push(`${prefix}${existingCount + 1}@${DOMAIN}`)
  }

  // 풀네임 버전 (이니셜과 다를 때만)
  if (fullPrefix !== prefix) {
    alternatives.push(`${fullPrefix}@${DOMAIN}`)
  }

  // 풀네임 + 번호
  if (existingCount > 0 && fullPrefix !== prefix) {
    alternatives.push(`${fullPrefix}${existingCount + 1}@${DOMAIN}`)
  }

  return alternatives
}

export { DOMAIN }
