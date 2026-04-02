/**
 * Shared Korean font utility for jsPDF
 * NanumGothic 폰트를 base64 임베드 방식으로 jsPDF에 등록
 * (네트워크 fetch 실패 문제 해결)
 */
import { jsPDF } from 'jspdf'
import { NANUM_GOTHIC_REGULAR, NANUM_GOTHIC_BOLD } from './pdf-font-data'

/**
 * NanumGothic 한글 폰트를 jsPDF 문서에 등록
 * @returns true if fonts loaded successfully
 */
export async function registerKoreanFonts(doc: jsPDF): Promise<boolean> {
  try {
    doc.addFileToVFS('NanumGothic-Regular.ttf', NANUM_GOTHIC_REGULAR)
    doc.addFont('NanumGothic-Regular.ttf', 'NanumGothic', 'normal')

    doc.addFileToVFS('NanumGothic-Bold.ttf', NANUM_GOTHIC_BOLD)
    doc.addFont('NanumGothic-Bold.ttf', 'NanumGothic', 'bold')

    return true
  } catch (e) {
    console.warn('Korean font registration failed:', e)
    return false
  }
}
