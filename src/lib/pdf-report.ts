/**
 * Branded PDF Report Generator using jsPDF
 * Generates a professional evaluation report with InterOhrigin branding.
 * Supports Korean text via NanumGothic font (loaded at runtime).
 */
import { jsPDF } from 'jspdf'
import { registerKoreanFonts } from './pdf-fonts'

// ─── Brand Colors ────────────────────────────────────────────────
const BRAND = {
  primary: [107, 63, 160] as [number, number, number],     // #6B3FA0
  primaryLight: [236, 226, 246] as [number, number, number], // #ECE2F6
  primaryDark: [74, 44, 111] as [number, number, number],   // #4A2C6F
  dark: [31, 41, 55] as [number, number, number],           // #1F2937
  text: [55, 65, 81] as [number, number, number],           // #374151
  textLight: [107, 114, 128] as [number, number, number],   // #6B7280
  border: [229, 231, 235] as [number, number, number],      // #E5E7EB
  bgLight: [249, 250, 251] as [number, number, number],     // #F9FAFB
  white: [255, 255, 255] as [number, number, number],
  success: [5, 150, 105] as [number, number, number],       // #059669
  successBg: [209, 250, 229] as [number, number, number],   // #D1FAE5
  danger: [220, 38, 38] as [number, number, number],        // #DC2626
  dangerBg: [254, 226, 226] as [number, number, number],    // #FEE2E2
  amber: [217, 119, 6] as [number, number, number],         // #D97706
  amberBg: [254, 243, 199] as [number, number, number],     // #FEF3C7
  blue: [37, 99, 235] as [number, number, number],          // #2563EB
  blueBg: [219, 234, 254] as [number, number, number],      // #DBEAFE
  green: [22, 163, 74] as [number, number, number],         // #16A34A
  greenBg: [220, 252, 231] as [number, number, number],     // #DCFCE7
  yellow: [202, 138, 4] as [number, number, number],        // #CA8A04
  red: [220, 38, 38] as [number, number, number],
  navy: [20, 30, 70] as [number, number, number],           // Logo navy
}

const GRADE_COLORS: Record<string, { fg: [number, number, number]; bg: [number, number, number] }> = {
  S: { fg: BRAND.amber, bg: BRAND.amberBg },
  A: { fg: BRAND.blue, bg: BRAND.blueBg },
  B: { fg: BRAND.green, bg: BRAND.greenBg },
  C: { fg: BRAND.yellow, bg: [254, 249, 195] },
  D: { fg: BRAND.red, bg: BRAND.dangerBg },
}

// ─── Page constants ─────────────────────────────────────────────
const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 20
const CONTENT_W = PAGE_W - MARGIN * 2
const HEADER_H = 28
const FOOTER_H = 16

export interface PdfReportInput {
  employee: { name: string; role: string }
  departmentName: string | null
  period: { year: number; quarter: number }
  finalScore: number | null
  grade: string | null
  deptRank: { rank: number; total: number } | null
  weightFormula: string
  groupedItems: {
    categoryName: string
    weight: number
    items: {
      name: string
      selfScore: number | null
      leaderScore: number | null
      directorScore: number | null
      ceoScore: number | null
      weightedAvg: number | null
    }[]
  }[]
  top3: { name: string; score: number }[]
  bottom3: { name: string; score: number }[]
  comments: {
    role: string
    roleLabel: string
    strength?: string | null
    improvement?: string | null
    overall?: string | null
  }[]
  aiReport?: {
    content: string
    provider: string
    model: string
    createdAt: string
  } | null
}

// Korean fonts are loaded from shared utility: src/lib/pdf-fonts.ts

// ─── Main export ────────────────────────────────────────────────

export async function generatePdfReport(input: PdfReportInput) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = 0
  let pageNum = 1

  // Load Korean fonts
  const hasKoreanFont = await registerKoreanFonts(doc)
  const fontFamily = hasKoreanFont ? 'NanumGothic' : 'helvetica'

  // ── Helper: set font ──────────────────────────────────────────
  function setFont(style: 'normal' | 'bold' | 'italic' = 'normal') {
    if (style === 'italic' && !hasKoreanFont) {
      doc.setFont('helvetica', 'italic')
    } else {
      doc.setFont(fontFamily, style === 'italic' ? 'normal' : style)
    }
  }

  // ── Helper: check page break ────────────────────────────────
  function ensureSpace(needed: number) {
    if (y + needed > PAGE_H - FOOTER_H - 10) {
      drawFooter()
      doc.addPage()
      pageNum++
      drawHeader()
      y = HEADER_H + MARGIN + 4
    }
  }

  // ── Draw header ─────────────────────────────────────────────
  function drawHeader() {
    // Purple gradient-like header bar
    doc.setFillColor(...BRAND.primary)
    doc.rect(0, 0, PAGE_W, HEADER_H, 'F')

    // Subtle darker accent line at bottom
    doc.setFillColor(...BRAND.primaryDark)
    doc.rect(0, HEADER_H - 1, PAGE_W, 1, 'F')

    // Logo text "INTEROHRIGIN" in white
    const logoX = MARGIN
    const logoY = 6
    doc.setTextColor(...BRAND.white)
    doc.setFontSize(15)
    setFont('bold')
    doc.text('INTEROHRIGIN', logoX, logoY + 8)

    // Subtitle
    doc.setFontSize(8)
    setFont('normal')
    doc.text('HR Evaluation Report', logoX, logoY + 14)

    // Period & date (right side)
    doc.setFontSize(8)
    setFont('normal')
    const periodText = `${input.period.year}년 Q${input.period.quarter}`
    doc.text(periodText, PAGE_W - MARGIN, logoY + 7, { align: 'right' })
    const dateText = new Date().toLocaleDateString('ko-KR')
    doc.text(dateText, PAGE_W - MARGIN, logoY + 12, { align: 'right' })
  }

  // ── Draw footer ─────────────────────────────────────────────
  function drawFooter() {
    const footerY = PAGE_H - FOOTER_H

    // Thin accent line
    doc.setDrawColor(...BRAND.primaryLight)
    doc.setLineWidth(0.5)
    doc.line(MARGIN, footerY, PAGE_W - MARGIN, footerY)

    doc.setFontSize(7)
    doc.setTextColor(...BRAND.textLight)
    setFont('normal')
    doc.text('InterOhrigin HR Evaluation System', MARGIN, footerY + 6)
    doc.text('Confidential', MARGIN, footerY + 10)

    doc.text(`${pageNum}`, PAGE_W - MARGIN, footerY + 8, { align: 'right' })
  }

  // ── Section title ───────────────────────────────────────────
  function drawSectionTitle(title: string) {
    ensureSpace(14)

    // Purple accent bar
    doc.setFillColor(...BRAND.primary)
    doc.roundedRect(MARGIN, y, 3, 8, 1, 1, 'F')

    doc.setFontSize(11)
    setFont('bold')
    doc.setTextColor(...BRAND.dark)
    doc.text(title, MARGIN + 6, y + 6)

    y += 12
  }

  // ── Sub-section title ───────────────────────────────────────
  function drawSubTitle(title: string) {
    ensureSpace(10)
    doc.setFontSize(9)
    setFont('bold')
    doc.setTextColor(...BRAND.text)
    doc.text(title, MARGIN + 2, y + 4)
    y += 8
  }

  // ── Body text with word wrapping ────────────────────────────
  function drawText(text: string, indent = 0, color?: [number, number, number]) {
    ensureSpace(8)
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

  // ── Table helper ────────────────────────────────────────────
  function drawTable(
    headers: string[],
    colWidths: number[],
    rows: (string | number | null)[][],
    options?: { highlightCol?: number }
  ) {
    const rowH = 7
    const headerH = 8
    ensureSpace(headerH + Math.min(rows.length, 3) * rowH)

    const startX = MARGIN

    // Header
    doc.setFillColor(...BRAND.primary)
    doc.rect(startX, y, CONTENT_W, headerH, 'F')
    doc.setTextColor(...BRAND.white)
    doc.setFontSize(7.5)
    setFont('bold')

    let cx = startX
    headers.forEach((h, i) => {
      doc.text(h, cx + colWidths[i] / 2, y + 5.5, { align: 'center' })
      cx += colWidths[i]
    })
    y += headerH

    // Rows
    rows.forEach((row, rowIdx) => {
      ensureSpace(rowH)

      const isOdd = rowIdx % 2 === 1
      if (isOdd) {
        doc.setFillColor(...BRAND.bgLight)
        doc.rect(startX, y, CONTENT_W, rowH, 'F')
      }

      cx = startX
      row.forEach((cell, colIdx) => {
        const cellStr = cell != null ? String(cell) : '-'
        const isHighlight = colIdx === options?.highlightCol && cell != null

        if (isHighlight) {
          doc.setTextColor(...BRAND.primary)
          setFont('bold')
        } else if (colIdx === 0) {
          doc.setTextColor(...BRAND.dark)
          setFont('normal')
        } else {
          doc.setTextColor(...BRAND.text)
          setFont('normal')
        }

        doc.setFontSize(7.5)
        if (colIdx === 0) {
          doc.text(cellStr, cx + 3, y + 5)
        } else {
          doc.text(cellStr, cx + colWidths[colIdx] / 2, y + 5, { align: 'center' })
        }
        cx += colWidths[colIdx]
      })
      y += rowH
    })

    // Bottom border
    doc.setDrawColor(...BRAND.border)
    doc.setLineWidth(0.3)
    doc.line(startX, y, startX + CONTENT_W, y)
    y += 4
  }

  // ══════════════════════════════════════════════════════════════
  // START BUILDING PDF
  // ══════════════════════════════════════════════════════════════

  drawHeader()
  y = HEADER_H + 8

  // ── Title Card ──────────────────────────────────────────────
  // Light purple background card
  doc.setFillColor(...BRAND.primaryLight)
  doc.roundedRect(MARGIN, y, CONTENT_W, 32, 4, 4, 'F')

  // Employee name
  doc.setFontSize(16)
  setFont('bold')
  doc.setTextColor(...BRAND.primaryDark)
  doc.text(input.employee.name, MARGIN + 8, y + 12)

  // Role & department
  doc.setFontSize(9)
  setFont('normal')
  doc.setTextColor(...BRAND.text)
  const roleInfo = [input.employee.role, input.departmentName].filter(Boolean).join('  |  ')
  doc.text(roleInfo, MARGIN + 8, y + 19)

  // Period
  doc.setFontSize(8)
  doc.setTextColor(...BRAND.textLight)
  doc.text(`${input.period.year}년 ${input.period.quarter}분기 인사평가`, MARGIN + 8, y + 25)

  // Score & Grade (right side)
  if (input.finalScore != null) {
    const scoreX = PAGE_W - MARGIN - 40

    // Score circle
    doc.setFillColor(...BRAND.white)
    doc.circle(scoreX + 10, y + 13, 11, 'F')
    doc.setFillColor(...BRAND.primary)
    doc.setDrawColor(...BRAND.primary)
    doc.setLineWidth(1.2)
    doc.circle(scoreX + 10, y + 13, 11, 'S')

    doc.setFontSize(14)
    setFont('bold')
    doc.setTextColor(...BRAND.primary)
    doc.text(String(input.finalScore), scoreX + 10, y + 15, { align: 'center' })

    doc.setFontSize(5.5)
    setFont('normal')
    doc.text('SCORE', scoreX + 10, y + 20, { align: 'center' })

    // Grade badge
    if (input.grade) {
      const gc = GRADE_COLORS[input.grade] ?? { fg: BRAND.text, bg: BRAND.bgLight }
      const gradeX = scoreX + 26

      doc.setFillColor(...gc.bg)
      doc.roundedRect(gradeX, y + 5, 16, 16, 3, 3, 'F')
      doc.setFontSize(14)
      setFont('bold')
      doc.setTextColor(...gc.fg)
      doc.text(input.grade, gradeX + 8, y + 16, { align: 'center' })
    }
  }

  y += 36

  // ── Summary info row ────────────────────────────────────────
  if (input.weightFormula || input.deptRank) {
    const infoItems: string[] = []
    if (input.weightFormula) infoItems.push(`산출 근거: ${input.weightFormula}`)
    if (input.deptRank) infoItems.push(`부서 순위: ${input.deptRank.rank}위 / ${input.deptRank.total}명`)

    doc.setFontSize(7.5)
    setFont('normal')
    doc.setTextColor(...BRAND.textLight)
    doc.text(infoItems.join('     |     '), MARGIN, y + 3)
    y += 8
  }

  // ── Score Tables by Category ────────────────────────────────
  for (const group of input.groupedItems) {
    drawSectionTitle(`${group.categoryName} (${Math.round(group.weight * 100)}%)`)

    const headers = ['항목', '자기', '리더', '이사', '대표', '가중평균']
    const firstColW = CONTENT_W - 5 * 18
    const colWidths = [firstColW, 18, 18, 18, 18, 18]
    const rows = group.items.map((item) => [
      item.name,
      item.selfScore,
      item.leaderScore,
      item.directorScore,
      item.ceoScore,
      item.weightedAvg,
    ])

    drawTable(headers, colWidths, rows, { highlightCol: 5 })
  }

  // ── Strength / Improvement TOP 3 ───────────────────────────
  if (input.top3.length > 0 || input.bottom3.length > 0) {
    ensureSpace(40)

    // Two-column layout
    const halfW = (CONTENT_W - 6) / 2

    // LEFT: Strengths
    if (input.top3.length > 0) {
      const lx = MARGIN

      // Section header
      doc.setFillColor(...BRAND.successBg)
      doc.roundedRect(lx, y, halfW, 8, 2, 2, 'F')
      doc.setFontSize(8.5)
      setFont('bold')
      doc.setTextColor(...BRAND.success)
      doc.text('▲  강점 TOP 3', lx + 4, y + 5.5)

      let ty = y + 11
      input.top3.forEach((item, idx) => {
        doc.setFillColor(...BRAND.successBg)
        doc.roundedRect(lx, ty, halfW, 8, 1.5, 1.5, 'F')

        doc.setFontSize(7.5)
        setFont('normal')
        doc.setTextColor(...BRAND.dark)
        doc.text(`${idx + 1}. ${item.name}`, lx + 4, ty + 5.5)

        setFont('bold')
        doc.setTextColor(...BRAND.success)
        doc.text(`${item.score}점`, lx + halfW - 4, ty + 5.5, { align: 'right' })

        ty += 10
      })
    }

    // RIGHT: Improvements
    if (input.bottom3.length > 0) {
      const rx = MARGIN + halfW + 6

      doc.setFillColor(...BRAND.dangerBg)
      doc.roundedRect(rx, y, halfW, 8, 2, 2, 'F')
      doc.setFontSize(8.5)
      setFont('bold')
      doc.setTextColor(...BRAND.danger)
      doc.text('▼  개선 필요 TOP 3', rx + 4, y + 5.5)

      let ty = y + 11
      input.bottom3.forEach((item, idx) => {
        doc.setFillColor(...BRAND.dangerBg)
        doc.roundedRect(rx, ty, halfW, 8, 1.5, 1.5, 'F')

        doc.setFontSize(7.5)
        setFont('normal')
        doc.setTextColor(...BRAND.dark)
        doc.text(`${idx + 1}. ${item.name}`, rx + 4, ty + 5.5)

        setFont('bold')
        doc.setTextColor(...BRAND.danger)
        doc.text(`${item.score}점`, rx + halfW - 4, ty + 5.5, { align: 'right' })

        ty += 10
      })
    }

    y += 11 + Math.max(input.top3.length, input.bottom3.length) * 10 + 4
  }

  // ── Evaluator Comments ─────────────────────────────────────
  const hasComments = input.comments.some((c) => c.strength || c.improvement || c.overall)
  if (hasComments) {
    drawSectionTitle('평가자 코멘트')

    for (const comment of input.comments) {
      if (!comment.strength && !comment.improvement && !comment.overall) continue

      ensureSpace(20)

      // Role badge
      doc.setFillColor(...BRAND.primaryLight)
      doc.roundedRect(MARGIN, y, CONTENT_W, 7, 2, 2, 'F')
      doc.setFontSize(8)
      setFont('bold')
      doc.setTextColor(...BRAND.primary)
      doc.text(`${comment.roleLabel} 평가`, MARGIN + 4, y + 5)
      y += 9

      if (comment.strength) {
        drawSubTitle('▶ 강점')
        drawText(comment.strength, 4, BRAND.text)
      }
      if (comment.improvement) {
        drawSubTitle('▶ 개선 필요')
        drawText(comment.improvement, 4, BRAND.text)
      }
      if (comment.overall) {
        drawSubTitle('▶ 종합 평가')
        drawText(comment.overall, 4, BRAND.text)
      }
      y += 3
    }
  }

  // ── AI Analysis Report ─────────────────────────────────────
  if (input.aiReport) {
    drawSectionTitle('AI 분석 리포트')

    // Provider badge
    doc.setFillColor(...BRAND.primaryLight)
    doc.roundedRect(MARGIN, y, CONTENT_W, 7, 2, 2, 'F')
    doc.setFontSize(7)
    setFont('normal')
    doc.setTextColor(...BRAND.textLight)
    const providerLabel = input.aiReport.provider === 'gemini' ? 'Google Gemini' : 'OpenAI'
    doc.text(
      `${providerLabel}  ·  ${input.aiReport.model}  ·  ${new Date(input.aiReport.createdAt).toLocaleDateString('ko-KR')}`,
      MARGIN + 4,
      y + 5
    )
    y += 10

    // Parse markdown content line by line
    const lines = input.aiReport.content.split('\n')
    for (const line of lines) {
      if (line.startsWith('## ')) {
        ensureSpace(12)
        y += 2
        doc.setFillColor(...BRAND.primary)
        doc.roundedRect(MARGIN, y, 3, 6, 0.5, 0.5, 'F')

        doc.setFontSize(10)
        setFont('bold')
        doc.setTextColor(...BRAND.dark)
        doc.text(line.slice(3), MARGIN + 6, y + 5)
        y += 10
      } else if (line.startsWith('### ')) {
        ensureSpace(10)
        doc.setFontSize(9)
        setFont('bold')
        doc.setTextColor(...BRAND.text)
        doc.text(line.slice(4), MARGIN + 4, y + 4)
        y += 8
      } else if (line.startsWith('# ')) {
        ensureSpace(12)
        doc.setFontSize(11)
        setFont('bold')
        doc.setTextColor(...BRAND.dark)
        doc.text(line.slice(2), MARGIN, y + 5)
        y += 10
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        ensureSpace(6)
        const content = line.slice(2).replace(/\*\*(.*?)\*\*/g, '$1')

        doc.setFillColor(...BRAND.primary)
        doc.circle(MARGIN + 5, y + 3, 1, 'F')

        doc.setFontSize(8)
        setFont('normal')
        doc.setTextColor(...BRAND.text)

        const wrapped = doc.splitTextToSize(content, CONTENT_W - 10)
        for (const wl of wrapped) {
          ensureSpace(4.5)
          doc.text(wl, MARGIN + 8, y + 4)
          y += 4.5
        }
        y += 1
      } else if (/^\d+\.\s/.test(line)) {
        ensureSpace(6)
        const num = line.match(/^(\d+)\./)?.[1] ?? ''
        const content = line.replace(/^\d+\.\s/, '').replace(/\*\*(.*?)\*\*/g, '$1')

        // Numbered circle
        doc.setFillColor(...BRAND.primary)
        doc.circle(MARGIN + 5, y + 3, 2.5, 'F')
        doc.setFontSize(6.5)
        setFont('bold')
        doc.setTextColor(...BRAND.white)
        doc.text(num, MARGIN + 5, y + 4.2, { align: 'center' })

        doc.setFontSize(8)
        setFont('normal')
        doc.setTextColor(...BRAND.text)

        const wrapped = doc.splitTextToSize(content, CONTENT_W - 12)
        for (const wl of wrapped) {
          ensureSpace(4.5)
          doc.text(wl, MARGIN + 10, y + 4)
          y += 4.5
        }
        y += 1
      } else if (line.startsWith('---')) {
        ensureSpace(6)
        doc.setDrawColor(...BRAND.border)
        doc.setLineWidth(0.3)
        doc.line(MARGIN, y + 2, PAGE_W - MARGIN, y + 2)
        y += 6
      } else if (line.trim() === '') {
        y += 3
      } else {
        const content = line.replace(/\*\*(.*?)\*\*/g, '$1')
        drawText(content, 2)
      }
    }
  }

  // ── Disclaimer ──────────────────────────────────────────────
  ensureSpace(16)
  y += 4
  doc.setDrawColor(...BRAND.border)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 5
  doc.setFontSize(6.5)
  setFont('normal')
  doc.setTextColor(...BRAND.textLight)
  doc.text(
    '본 평가 리포트는 내부 인사평가 목적으로 생성되었으며, 외부 공유가 제한됩니다.',
    PAGE_W / 2,
    y + 3,
    { align: 'center' }
  )
  if (input.aiReport) {
    doc.text(
      'AI 분석은 참고용이며, 최종 평가는 관리자의 판단에 따릅니다.',
      PAGE_W / 2,
      y + 7,
      { align: 'center' }
    )
  }

  // Final footer
  drawFooter()

  // ── Save ────────────────────────────────────────────────────
  const filename = `평가리포트_${input.employee.name}_${input.period.year}Q${input.period.quarter}.pdf`
  doc.save(filename)
}
