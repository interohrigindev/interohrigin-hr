/**
 * Shared Korean font utility for jsPDF
 * NanumGothic 폰트를 로드하고 jsPDF에 등록하는 공유 유틸리티
 */
import { jsPDF } from 'jspdf'

// ─── Font cache ─────────────────────────────────────────────────
let fontCacheRegular: ArrayBuffer | null = null
let fontCacheBold: ArrayBuffer | null = null

async function loadFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`)
  return res.arrayBuffer()
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * NanumGothic 한글 폰트를 jsPDF 문서에 등록
 * @returns true if fonts loaded successfully, false if fallback needed
 */
export async function registerKoreanFonts(doc: jsPDF): Promise<boolean> {
  try {
    if (!fontCacheRegular) {
      fontCacheRegular = await loadFont('/fonts/NanumGothic-Regular.ttf')
    }
    if (!fontCacheBold) {
      fontCacheBold = await loadFont('/fonts/NanumGothic-Bold.ttf')
    }

    const regularBase64 = arrayBufferToBase64(fontCacheRegular)
    const boldBase64 = arrayBufferToBase64(fontCacheBold)

    doc.addFileToVFS('NanumGothic-Regular.ttf', regularBase64)
    doc.addFont('NanumGothic-Regular.ttf', 'NanumGothic', 'normal')

    doc.addFileToVFS('NanumGothic-Bold.ttf', boldBase64)
    doc.addFont('NanumGothic-Bold.ttf', 'NanumGothic', 'bold')

    return true
  } catch (e) {
    console.warn('Korean font loading failed, falling back to Helvetica:', e)
    return false
  }
}
