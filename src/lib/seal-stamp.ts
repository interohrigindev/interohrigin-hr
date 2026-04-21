import { supabase } from '@/lib/supabase'

/**
 * 회사 인감 URL 조회 (company_settings 우선, localStorage 폴백)
 * 증명서·수습평가서·기타 PDF에서 공통 사용
 */
export async function loadCompanySealUrl(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('value')
      .eq('key', 'seal_image_url')
      .maybeSingle()
    if (!error && data?.value) return data.value as string
  } catch {
    // 테이블 없으면 localStorage로
  }
  return localStorage.getItem('company_seal_url')
}

/**
 * URL을 dataURL(base64)로 변환 — jsPDF.addImage에 사용
 * CORS 방어: 3단계 시도 순서
 *  1) 원본 URL로 cors 모드 fetch
 *  2) 실패 시 Supabase Storage 동일 URL을 signed URL로 재시도
 *  3) 실패 시 Image → Canvas → toDataURL (크롬 crossOrigin 익명 로드)
 *  4) 전부 실패 시 null
 */
export async function fetchImageAsDataURL(url: string): Promise<string | null> {
  // 이미 data URL이면 그대로 반환
  if (url.startsWith('data:')) return url

  const toDataURLFromBlob = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('FileReader 실패'))
    reader.readAsDataURL(blob)
  })

  // 1) 직접 fetch
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'no-cache' })
    if (res.ok) {
      const blob = await res.blob()
      return await toDataURLFromBlob(blob)
    }
  } catch {
    // fallthrough
  }

  // 2) Supabase Storage 경로면 signed URL로 재시도
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
    if (match) {
      const bucket = match[1]
      const path = decodeURIComponent(match[2])
      const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10)
      if (data?.signedUrl) {
        const res = await fetch(data.signedUrl, { mode: 'cors', cache: 'no-cache' })
        if (res.ok) {
          const blob = await res.blob()
          return await toDataURLFromBlob(blob)
        }
      }
    }
  } catch {
    // fallthrough
  }

  // 3) Image → Canvas 방식 (익명 crossOrigin)
  try {
    return await new Promise<string | null>((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) { resolve(null); return }
          ctx.drawImage(img, 0, 0)
          resolve(canvas.toDataURL('image/png'))
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      // 캐시 우회 (CORS 헤더 신규 요청)
      img.src = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now()
    })
  } catch {
    return null
  }
}

/** 통합 헬퍼: URL 조회 → dataURL 변환까지 한 번에.
 *  실패 시 null — 호출 측에서 서명란 텍스트로 대체하면 됨 */
export async function loadSealDataURL(): Promise<string | null> {
  const url = await loadCompanySealUrl()
  if (!url) return null
  return await fetchImageAsDataURL(url)
}
