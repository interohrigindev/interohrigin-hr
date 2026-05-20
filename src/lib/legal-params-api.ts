/**
 * 한국 정부 공공 API 연동 — 법령 파라미터 자동 동기화
 *  - 한국천문연구원 특일정보(공휴일) — data.go.kr 일반 인증키 필요 (무료)
 *  - 국가법령정보센터 OPEN API — law.go.kr OC(이메일ID) 필요 (무료)
 *  - 최저임금/4대보험 요율: 정부 공식 API 부재 → 정부 발표 시점에 수동 등록
 *
 * 인증키 저장은 localStorage 금지 정책상 — DB 의 legal_params 에 'system' key 로 저장
 *   { param_key: 'api_keys', param_value: { data_go_kr: '...', law_go_kr_oc: '...' } }
 */
import { supabase } from './supabase'

export interface ApiKeys {
  data_go_kr?: string  // 공공데이터포털 일반 인증키
  law_go_kr_oc?: string // 국가법령정보센터 OC (보통 이메일 아이디)
}

export async function loadApiKeys(): Promise<ApiKeys> {
  const { data } = await supabase
    .from('legal_params')
    .select('param_value')
    .eq('param_key', 'api_keys')
    .eq('status', 'active')
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.param_value as ApiKeys) || {}
}

export async function saveApiKeys(keys: ApiKeys): Promise<{ ok: boolean; error?: string }> {
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('legal_params')
    .upsert({
      param_key: 'api_keys',
      param_value: keys,
      effective_from: today,
      source: 'manual',
      status: 'active',
      notes: 'API 인증키 저장소 (시스템 내부 용)',
    } as any, { onConflict: 'param_key,effective_from' } as any)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/**
 * 한국천문연구원 — 특일정보 (공휴일) 조회
 *  - 엔드포인트: https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo
 *  - 응답: XML (기본). 본 구현은 JSON 변환 후 사용 (_type=json 파라미터)
 */
export async function fetchKoreanHolidays(year: number, key: string): Promise<{
  ok: boolean
  holidays?: { date: string; name: string; isHoliday: boolean }[]
  error?: string
}> {
  if (!key) return { ok: false, error: 'data.go.kr 인증키 없음' }
  try {
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
    const all: { date: string; name: string; isHoliday: boolean }[] = []
    for (const m of months) {
      const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?ServiceKey=${encodeURIComponent(key)}&solYear=${year}&solMonth=${m}&_type=json`
      const res = await fetch(url)
      if (!res.ok) continue
      const json = await res.json() as any
      const items = json?.response?.body?.items?.item
      const list = Array.isArray(items) ? items : items ? [items] : []
      for (const it of list) {
        const dateStr = String(it.locdate)
        const formatted = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
        all.push({
          date: formatted,
          name: it.dateName,
          isHoliday: it.isHoliday === 'Y',
        })
      }
    }
    return { ok: true, holidays: all }
  } catch (e: any) {
    return { ok: false, error: e?.message || '공휴일 조회 실패' }
  }
}

/**
 * 국가법령정보센터 — 법령 본문 조회
 *  - 엔드포인트: https://www.law.go.kr/DRF/lawService.do
 *  - 필수: OC (이메일 아이디), target=law, type=JSON, MST 또는 LM 검색
 *  - 무료 / 무인증 호출 시 'OC=test' 사용 가능 (제한적)
 */
export async function fetchLawArticle(
  lawName: string,
  oc: string = 'test',
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const url = `https://www.law.go.kr/DRF/lawService.do?OC=${encodeURIComponent(oc)}&target=law&LM=${encodeURIComponent(lawName)}&type=JSON`
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const text = await res.text()
    // 일부 응답은 HTML 일 수 있음 — JSON 파싱 시도
    try {
      const json = JSON.parse(text)
      return { ok: true, data: json }
    } catch {
      return { ok: false, error: '응답 형식이 JSON 이 아닙니다 (CORS 또는 키 문제 가능)' }
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || '법령 조회 실패' }
  }
}

/**
 * 현재 적용 중인 법령 파라미터 조회 — 시급/4대보험 등 계산 코드는 이 함수만 호출
 *  - status='active' AND effective_from <= today
 *  - 같은 key 가 여러 개면 가장 최근 effective_from 채택
 */
export async function getActiveLegalParam<T = unknown>(
  paramKey: string,
  asOf?: string,
): Promise<T | null> {
  const today = asOf || new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('legal_params')
    .select('param_value')
    .eq('param_key', paramKey)
    .eq('status', 'active')
    .lte('effective_from', today)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.param_value as T) ?? null
}

/**
 * 정부 발표 알려진 값 시드 — 이미 마이그레이션 106 에서 DB 등록됨
 * UI 에서 '재시드' 가 필요한 경우 사용
 */
export const KNOWN_GOV_VALUES = {
  min_wage_hourly: {
    2024: { amount: 9860 },
    2025: { amount: 10030 },
    2026: { amount: 10320 },
  },
  social_insurance_2026: {
    national_pension: { employee: 0.045, employer: 0.045 },
    health_insurance: { employee: 0.03545, employer: 0.03545 },
    long_term_care: 0.001281,
    employment_insurance: { employee: 0.009, employer: 0.009 },
    industrial_accident_avg: 0.014,
  },
}
