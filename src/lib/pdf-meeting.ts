/**
 * Meeting Minutes PDF Generator using jsPDF
 * A4 레터헤드 디자인 포함 회의록 문서 생성
 */
import { jsPDF } from 'jspdf'
import { registerKoreanFonts } from './pdf-fonts'

// ─── Brand Colors (pdf-report.ts 공유) ──────────────────────────
const BRAND = {
  primary: [107, 63, 160] as [number, number, number],
  primaryLight: [236, 226, 246] as [number, number, number],
  primaryDark: [74, 44, 111] as [number, number, number],
  dark: [31, 41, 55] as [number, number, number],
  text: [55, 65, 81] as [number, number, number],
  textLight: [107, 114, 128] as [number, number, number],
  border: [229, 231, 235] as [number, number, number],
  bgLight: [249, 250, 251] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  success: [5, 150, 105] as [number, number, number],
  successBg: [209, 250, 229] as [number, number, number],
  amber: [217, 119, 6] as [number, number, number],
  amberBg: [254, 243, 199] as [number, number, number],
  blue: [37, 99, 235] as [number, number, number],
  blueBg: [219, 234, 254] as [number, number, number],
  danger: [220, 38, 38] as [number, number, number],
}

// ─── Page constants ─────────────────────────────────────────────
const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2
const HEADER_H = 26
const FOOTER_H = 14

export interface MeetingPdfInput {
  title: string
  date: string
  duration: string
  recorder: string
  participants: string[]
  summary: string | null
  actionItems: string[]
  decisions: string[]
  transcription: string | null
}

export async function generateMeetingPdf(input: MeetingPdfInput) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = 0
  let pageNum = 1

  const hasKoreanFont = await registerKoreanFonts(doc)
  const fontFamily = hasKoreanFont ? 'NanumGothic' : 'helvetica'

  function setFont(style: 'normal' | 'bold' = 'normal') {
    doc.setFont(fontFamily, style)
  }

  function ensureSpace(needed: number) {
    if (y + needed > PAGE_H - FOOTER_H - 8) {
      drawFooter()
      doc.addPage()
      pageNum++
      drawHeader()
      y = HEADER_H + MARGIN + 2
    }
  }

  // ── 레터헤드 헤더 ──────────────────────────────────────────
  function drawHeader() {
    // 보라색 헤더 바
    doc.setFillColor(...BRAND.primary)
    doc.rect(0, 0, PAGE_W, HEADER_H, 'F')

    // 하단 액센트 라인
    doc.setFillColor(...BRAND.primaryDark)
    doc.rect(0, HEADER_H - 0.8, PAGE_W, 0.8, 'F')

    // 로고
    doc.setTextColor(...BRAND.white)
    doc.setFontSize(14)
    setFont('bold')
    doc.text('INTEROHRIGIN', MARGIN, 10)

    doc.setFontSize(8)
    setFont('normal')
    doc.text('Meeting Minutes', MARGIN, 16)

    // 우측 날짜
    doc.setFontSize(8)
    doc.text(input.date, PAGE_W - MARGIN, 10, { align: 'right' })
    doc.text(`Document No. MTG-${Date.now().toString(36).toUpperCase()}`, PAGE_W - MARGIN, 15, { align: 'right' })
  }

  // ── 푸터 ────────────────────────────────────────────────────
  function drawFooter() {
    const footerY = PAGE_H - FOOTER_H

    doc.setDrawColor(...BRAND.primaryLight)
    doc.setLineWidth(0.4)
    doc.line(MARGIN, footerY, PAGE_W - MARGIN, footerY)

    doc.setFontSize(6.5)
    doc.setTextColor(...BRAND.textLight)
    setFont('normal')
    doc.text('InterOhrigin HR Platform  |  Meeting Minutes  |  Confidential', MARGIN, footerY + 5)
    doc.text(`${pageNum}`, PAGE_W - MARGIN, footerY + 5, { align: 'right' })
  }

  // ── 섹션 타이틀 ─────────────────────────────────────────────
  function drawSectionTitle(title: string) {
    ensureSpace(14)
    y += 2

    // 보라색 액센트 바
    doc.setFillColor(...BRAND.primary)
    doc.roundedRect(MARGIN, y, 3, 7, 1, 1, 'F')

    doc.setFontSize(10.5)
    setFont('bold')
    doc.setTextColor(...BRAND.dark)
    doc.text(title, MARGIN + 6, y + 5.5)

    y += 11
  }

  // ── 텍스트 출력 (자동 줄바꿈) ──────────────────────────────
  function drawText(text: string, indent = 0, color?: [number, number, number]) {
    doc.setFontSize(8.5)
    setFont('normal')
    doc.setTextColor(...(color ?? BRAND.text))

    const maxWidth = CONTENT_W - indent
    const lines = doc.splitTextToSize(text, maxWidth)
    for (const line of lines) {
      ensureSpace(5)
      doc.text(line, MARGIN + indent, y + 4)
      y += 4.5
    }
    y += 1
  }

  // ── 불릿 아이템 ─────────────────────────────────────────────
  function drawBulletItem(
    text: string,
    icon: string,
    bgColor?: [number, number, number],
    textColor?: [number, number, number]
  ) {
    const cleanText = text.replace(/\*\*/g, '')
    const lines = doc.splitTextToSize(cleanText, CONTENT_W - 12)
    const itemH = lines.length * 4.5 + 3
    ensureSpace(itemH)

    if (bgColor) {
      doc.setFillColor(...bgColor)
      doc.roundedRect(MARGIN, y, CONTENT_W, itemH, 1.5, 1.5, 'F')
    }

    doc.setFontSize(8.5)
    setFont('normal')
    doc.setTextColor(...(textColor ?? BRAND.text))
    doc.text(icon, MARGIN + 3, y + 4.5)

    for (const line of lines) {
      doc.text(line, MARGIN + 10, y + 4.5)
      y += 4.5
    }
    y += 2
  }

  // ── 체크박스 아이템 ─────────────────────────────────────────
  function drawCheckboxItem(text: string) {
    const cleanText = text.replace(/\*\*/g, '')
    const lines = doc.splitTextToSize(cleanText, CONTENT_W - 14)
    const itemH = lines.length * 4.5 + 3
    ensureSpace(itemH)

    // 체크박스
    doc.setDrawColor(...BRAND.text)
    doc.setLineWidth(0.3)
    doc.rect(MARGIN + 2, y + 1.5, 3.5, 3.5)

    doc.setFontSize(8.5)
    setFont('normal')
    doc.setTextColor(...BRAND.text)
    for (const line of lines) {
      doc.text(line, MARGIN + 10, y + 4.5)
      y += 4.5
    }
    y += 2
  }

  // ══════════════════════════════════════════════════════════════
  // PDF 생성 시작
  // ══════════════════════════════════════════════════════════════

  drawHeader()
  y = HEADER_H + 6

  // ── 제목 카드 ───────────────────────────────────────────────
  doc.setFillColor(...BRAND.primaryLight)
  doc.roundedRect(MARGIN, y, CONTENT_W, 28, 3, 3, 'F')

  doc.setFontSize(15)
  setFont('bold')
  doc.setTextColor(...BRAND.primaryDark)
  doc.text(input.title || '회의록', MARGIN + 8, y + 11)

  doc.setFontSize(8)
  setFont('normal')
  doc.setTextColor(...BRAND.text)
  doc.text(`일시: ${input.date}     녹음 시간: ${input.duration}     녹음자: ${input.recorder}`, MARGIN + 8, y + 18)

  if (input.participants.length > 0) {
    const participantText = `참석자: ${input.participants.join(', ')}`
    doc.setFontSize(8)
    doc.setTextColor(...BRAND.textLight)
    const pLines = doc.splitTextToSize(participantText, CONTENT_W - 16)
    doc.text(pLines[0], MARGIN + 8, y + 23)
  }

  y += 32

  // ── 마크다운 요약 파싱 + 출력 ───────────────────────────────
  if (input.summary) {
    const lines = input.summary.split('\n')

    for (const line of lines) {
      // 번호 붙은 섹션 헤더: ## 1. 제목 또는 ## 제목
      if (/^## \d+\.\s/.test(line)) {
        drawSectionTitle(line.replace(/^## /, ''))
      } else if (line.startsWith('## ')) {
        drawSectionTitle(line.slice(3))
      } else if (line.startsWith('### ')) {
        // 서브 헤더
        ensureSpace(10)
        doc.setFontSize(9)
        setFont('bold')
        doc.setTextColor(...BRAND.dark)
        doc.text(line.slice(4), MARGIN + 4, y + 4)
        y += 8
      } else if (/^- \[ \] /.test(line)) {
        // 체크박스 아이템
        drawCheckboxItem(line.replace(/^- \[ \] /, ''))
      } else if (/^- \[x\] /.test(line)) {
        drawCheckboxItem(line.replace(/^- \[x\] /, ''))
      } else if (line.startsWith('- ✅ ')) {
        drawBulletItem(line.slice(4), '✓', BRAND.successBg, BRAND.success)
      } else if (line.startsWith('- ⚠️ ')) {
        drawBulletItem(line.slice(5), '!', BRAND.amberBg, BRAND.amber)
      } else if (line.startsWith('- 💡 ')) {
        drawBulletItem(line.slice(5), '◆', BRAND.blueBg, BRAND.blue)
      } else if (line.startsWith('- ')) {
        // 일반 불릿
        const content = line.slice(2).replace(/\*\*(.*?)\*\*/g, '$1')
        ensureSpace(6)
        doc.setFillColor(...BRAND.primary)
        doc.circle(MARGIN + 4, y + 3.5, 0.8, 'F')
        doc.setFontSize(8.5)
        setFont('normal')
        doc.setTextColor(...BRAND.text)
        const wrapped = doc.splitTextToSize(content, CONTENT_W - 10)
        for (const wl of wrapped) {
          ensureSpace(4.5)
          doc.text(wl, MARGIN + 8, y + 4)
          y += 4.5
        }
        y += 1.5
      } else if (/^\d+\.\s/.test(line)) {
        // 번호 리스트
        ensureSpace(6)
        const num = line.match(/^(\d+)\./)?.[1] ?? ''
        const content = line.replace(/^\d+\.\s/, '').replace(/\*\*(.*?)\*\*/g, '$1')

        doc.setFillColor(...BRAND.primary)
        doc.circle(MARGIN + 4, y + 3.5, 2.2, 'F')
        doc.setFontSize(6.5)
        setFont('bold')
        doc.setTextColor(...BRAND.white)
        doc.text(num, MARGIN + 4, y + 4.5, { align: 'center' })

        doc.setFontSize(8.5)
        setFont('normal')
        doc.setTextColor(...BRAND.text)
        const wrapped = doc.splitTextToSize(content, CONTENT_W - 12)
        for (const wl of wrapped) {
          ensureSpace(4.5)
          doc.text(wl, MARGIN + 10, y + 4)
          y += 4.5
        }
        y += 1.5
      } else if (line.startsWith('---')) {
        ensureSpace(6)
        doc.setDrawColor(...BRAND.border)
        doc.setLineWidth(0.3)
        doc.line(MARGIN, y + 2, PAGE_W - MARGIN, y + 2)
        y += 6
      } else if (line.trim() === '') {
        y += 2
      } else {
        // 일반 텍스트 (볼드 제거)
        const content = line.replace(/\*\*(.*?)\*\*/g, '$1')
        if (content.trim()) {
          drawText(content, 2)
        }
      }
    }
  }

  // ── 서명란 ──────────────────────────────────────────────────
  ensureSpace(35)
  y += 6
  doc.setDrawColor(...BRAND.border)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 8

  doc.setFontSize(9)
  setFont('bold')
  doc.setTextColor(...BRAND.dark)
  doc.text('확인', MARGIN, y + 4)
  y += 10

  // 3열 서명란
  const sigW = (CONTENT_W - 12) / 3
  const labels = ['작성자', '검토자', '승인자']
  labels.forEach((label, i) => {
    const sx = MARGIN + i * (sigW + 6)

    doc.setDrawColor(...BRAND.border)
    doc.setLineWidth(0.3)
    doc.roundedRect(sx, y, sigW, 18, 2, 2)

    doc.setFontSize(7)
    setFont('normal')
    doc.setTextColor(...BRAND.textLight)
    doc.text(label, sx + 4, y + 5)

    // 서명선
    doc.setDrawColor(...BRAND.border)
    doc.line(sx + 4, y + 14, sx + sigW - 4, y + 14)
  })

  y += 22

  // ── 면책조항 ────────────────────────────────────────────────
  ensureSpace(12)
  y += 2
  doc.setFontSize(6.5)
  setFont('normal')
  doc.setTextColor(...BRAND.textLight)
  doc.text(
    '본 회의록은 AI 음성인식 기반으로 작성되었으며, 실제 발언과 차이가 있을 수 있습니다.',
    PAGE_W / 2, y + 3, { align: 'center' }
  )
  doc.text(
    '최종 내용은 참석자 확인 후 확정됩니다.',
    PAGE_W / 2, y + 7, { align: 'center' }
  )

  // 마지막 푸터
  drawFooter()

  // ── 저장 ────────────────────────────────────────────────────
  const safeTitle = (input.title || '회의록').replace(/[/\\?%*:|"<>]/g, '')
  const dateStr = input.date.replace(/\./g, '').replace(/\s/g, '_').slice(0, 10)
  doc.save(`회의록_${safeTitle}_${dateStr}.pdf`)
}
