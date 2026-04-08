/**
 * AI 응답 → Google Workspace 문서 변환 오케스트레이터
 */
import { createPresentation, createDocument } from './google-workspace'
import type { DocumentResult, DocumentType, SlideData } from './google-workspace'

// ─── 문서 요청 감지 ─────────────────────────────────────────────

const DOC_PATTERNS: { type: DocumentType; keywords: string[] }[] = [
  {
    type: 'slides',
    keywords: ['ppt', 'PPT', '슬라이드', '프레젠테이션', '발표자료', '피피티'],
  },
  {
    type: 'docs',
    keywords: ['문서 작성', '보고서 작성', '기획서', '제안서', '레포트', '문서로 만들어', '문서화', 'docs'],
  },
]

export function detectDocumentRequest(message: string): DocumentType | null {
  const lower = message.toLowerCase()
  for (const { type, keywords } of DOC_PATTERNS) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return type
    }
  }
  return null
}

// ─── AI 응답 → 슬라이드 구조 파싱 ──────────────────────────────

function parseSlides(aiResponse: string, title: string): SlideData[] {
  const slides: SlideData[] = []

  // 타이틀 슬라이드
  slides.push({ title, layout: 'TITLE' })

  // ## 헤딩 → 섹션, - 불릿 → 슬라이드 내용
  const lines = aiResponse.split('\n')
  let currentSlide: SlideData | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      // 이전 슬라이드 저장
      if (currentSlide) slides.push(currentSlide)
      const heading = trimmed.replace(/^#{2,3}\s+/, '').replace(/\*\*/g, '')
      currentSlide = { title: heading, bullets: [], layout: 'TITLE_AND_BODY' }
    } else if (trimmed.startsWith('# ')) {
      if (currentSlide) slides.push(currentSlide)
      const heading = trimmed.replace(/^#\s+/, '').replace(/\*\*/g, '')
      currentSlide = { title: heading, bullets: [], layout: 'SECTION_HEADER' }
    } else if ((trimmed.startsWith('- ') || trimmed.startsWith('• ') || /^\d+\.\s/.test(trimmed)) && currentSlide) {
      const bullet = trimmed.replace(/^[-•]\s+/, '').replace(/^\d+\.\s+/, '').replace(/\*\*/g, '')
      if (bullet) currentSlide.bullets?.push(bullet)
    }
  }
  if (currentSlide) slides.push(currentSlide)

  // 슬라이드가 타이틀만 있으면 AI 응답을 통으로 하나의 슬라이드로
  if (slides.length <= 1) {
    const allText = aiResponse.replace(/[#*]/g, '').trim()
    const chunks = allText.split('\n').filter((l) => l.trim())
    slides.push({ title: '내용', bullets: chunks.slice(0, 10), layout: 'TITLE_AND_BODY' })
  }

  return slides
}

// ─── 문서 생성 실행 ─────────────────────────────────────────────

export async function generateDocument(
  docType: DocumentType,
  title: string,
  aiResponse: string
): Promise<DocumentResult> {
  switch (docType) {
    case 'slides': {
      const slides = parseSlides(aiResponse, title)
      return await createPresentation(title, slides)
    }
    case 'docs': {
      return await createDocument(title, aiResponse)
    }
    default:
      throw new Error(`지원하지 않는 문서 유형: ${docType}`)
  }
}
