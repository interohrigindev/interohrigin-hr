import { jsPDF } from 'jspdf'
import { registerKoreanFonts } from './pdf-fonts'
import { PROBATION_CRITERIA, type ProbationEvaluation, type ProbationStage, type ContinuationRecommendation } from '@/types/employee-lifecycle'

const BRAND = {
  primary: [107, 63, 160] as [number, number, number],
  primaryDark: [74, 44, 111] as [number, number, number],
  primaryLight: [236, 226, 246] as [number, number, number],
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
  danger: [220, 38, 38] as [number, number, number],
  dangerBg: [254, 226, 226] as [number, number, number],
}

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 15

const STAGE_LABEL: Record<ProbationStage, string> = {
  round1: '1회차 (입사 2주)',
  round2: '2회차 (입사 6주)',
  round3: '3회차 (입사 10주)',
}

const EVALUATOR_LABEL: Record<string, string> = {
  leader: '팀장/리더',
  executive: '이사/임원',
  ceo: '대표',
}

const RECOMMENDATION: Record<ContinuationRecommendation, { label: string; fg: [number, number, number]; bg: [number, number, number] }> = {
  continue: { label: '계속 근무 권고', fg: BRAND.success, bg: BRAND.successBg },
  warning: { label: '경고/주의', fg: BRAND.amber, bg: BRAND.amberBg },
  terminate: { label: '수습 종료 권고', fg: BRAND.danger, bg: BRAND.dangerBg },
}

export interface ProbationPdfInput {
  evaluation: ProbationEvaluation
  employee: {
    name: string
    department_name?: string | null
    position?: string | null
    hire_date?: string | null
  }
  evaluator_name?: string | null
  probation_end_date?: string | null
  sealDataUrl?: string | null
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '-'
  const dt = new Date(d)
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`
}

export async function generateProbationPdf(input: ProbationPdfInput): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const hasKoreanFont = await registerKoreanFonts(doc)
  const fontFamily = hasKoreanFont ? 'NanumGothic' : 'helvetica'

  const setFont = (style: 'normal' | 'bold' = 'normal') => doc.setFont(fontFamily, style)

  const { evaluation: ev, employee, evaluator_name, probation_end_date, sealDataUrl } = input

  // ── 헤더 ─────────────────────────────────────
  doc.setFillColor(...BRAND.primary)
  doc.rect(0, 0, PAGE_W, 24, 'F')
  doc.setFillColor(...BRAND.primaryDark)
  doc.rect(0, 23, PAGE_W, 1, 'F')

  doc.setTextColor(...BRAND.white)
  setFont('bold')
  doc.setFontSize(16)
  doc.text('수습 평가서', MARGIN, 12)
  setFont('normal')
  doc.setFontSize(8.5)
  doc.text('INTEROHRIGIN HR Platform', MARGIN, 18)

  doc.setFontSize(8)
  doc.text(`생성일: ${new Date().toLocaleDateString('ko-KR')}`, PAGE_W - MARGIN, 12, { align: 'right' })
  doc.text(STAGE_LABEL[ev.stage as ProbationStage] || ev.stage, PAGE_W - MARGIN, 18, { align: 'right' })

  let y = 32

  // ── 직원 정보 박스 ────────────────────────────
  doc.setFillColor(...BRAND.bgLight)
  doc.setDrawColor(...BRAND.border)
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 26, 2, 2, 'FD')

  doc.setTextColor(...BRAND.dark)
  setFont('bold')
  doc.setFontSize(12)
  doc.text(employee.name, MARGIN + 4, y + 7)

  setFont('normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...BRAND.textLight)
  const meta1 = `${employee.department_name || '-'}  ·  ${employee.position || '-'}`
  doc.text(meta1, MARGIN + 4, y + 13)

  doc.setTextColor(...BRAND.text)
  doc.setFontSize(8.5)
  doc.text(`입사일: ${fmtDate(employee.hire_date)}`, MARGIN + 4, y + 19.5)
  doc.text(`수습종료: ${fmtDate(probation_end_date || null)}`, MARGIN + 55, y + 19.5)
  doc.text(`평가자: ${evaluator_name || '-'} (${EVALUATOR_LABEL[ev.evaluator_role || ''] || ev.evaluator_role || '-'})`, MARGIN + 105, y + 19.5)

  y += 32

  // ── 점수 테이블 ──────────────────────────────
  const colW = [68, 24, 74]
  const rowH = 7
  const contentW = PAGE_W - MARGIN * 2

  // Header row
  doc.setFillColor(...BRAND.primary)
  doc.rect(MARGIN, y, contentW, rowH + 1, 'F')
  doc.setTextColor(...BRAND.white)
  setFont('bold')
  doc.setFontSize(8.5)
  let cx = MARGIN
  const headers = ['평가 항목', '점수', '설명']
  headers.forEach((h, i) => {
    const align: 'left' | 'center' = i === 1 ? 'center' : 'left'
    doc.text(h, align === 'center' ? cx + colW[i] / 2 : cx + 3, y + 5, { align })
    cx += colW[i]
  })
  y += rowH + 1

  // Rows
  let total = 0
  PROBATION_CRITERIA.forEach((c, idx) => {
    const score = (ev.scores as Record<string, number>)[c.key] || 0
    total += score

    if (idx % 2 === 1) {
      doc.setFillColor(...BRAND.bgLight)
      doc.rect(MARGIN, y, contentW, rowH, 'F')
    }
    doc.setDrawColor(...BRAND.border)
    doc.line(MARGIN, y + rowH, MARGIN + contentW, y + rowH)

    setFont('normal')
    doc.setFontSize(8)
    doc.setTextColor(...BRAND.text)

    cx = MARGIN
    doc.text(c.label, cx + 3, y + 5)
    cx += colW[0]

    setFont('bold')
    doc.setTextColor(...BRAND.primary)
    doc.text(`${score}/20`, cx + colW[1] / 2, y + 5, { align: 'center' })
    cx += colW[1]

    setFont('normal')
    doc.setTextColor(...BRAND.textLight)
    doc.setFontSize(7)
    const descLines = doc.splitTextToSize(c.desc, colW[2] - 4)
    doc.text(descLines[0] || '', cx + 2, y + 5)

    y += rowH
  })

  // Total row
  doc.setFillColor(...BRAND.primaryLight)
  doc.rect(MARGIN, y, contentW, rowH + 1, 'F')
  setFont('bold')
  doc.setFontSize(9)
  doc.setTextColor(...BRAND.primaryDark)
  doc.text('총점', MARGIN + 3, y + 5.5)
  doc.text(`${total}/100`, MARGIN + colW[0] + colW[1] / 2, y + 5.5, { align: 'center' })

  // Recommendation badge
  if (ev.continuation_recommendation) {
    const rec = RECOMMENDATION[ev.continuation_recommendation as ContinuationRecommendation]
    if (rec) {
      const badgeX = MARGIN + colW[0] + colW[1] + 4
      doc.setFillColor(...rec.bg)
      doc.roundedRect(badgeX, y + 1, 60, rowH - 1, 1.5, 1.5, 'F')
      doc.setTextColor(...rec.fg)
      doc.setFontSize(8)
      doc.text(rec.label, badgeX + 30, y + 5.5, { align: 'center' })
    }
  }
  y += rowH + 5

  // ── 1페이지 보장: 남은 높이 관리 ────────────
  const SIG_RESERVE = 28 // 서명 영역 예약
  const PAGE_MAX_Y = PAGE_H - SIG_RESERVE

  const remaining = () => PAGE_MAX_Y - y

  // 줄을 넘치면 마지막 줄에 '…' 추가
  const addEllipsis = (lines: string[], max: number): string[] => {
    if (lines.length <= max) return lines
    const truncated = lines.slice(0, max)
    const last = truncated[max - 1]
    truncated[max - 1] = last.length > 3 ? last.slice(0, -1) + '…' : last + '…'
    return truncated
  }

  // ── 코멘트 섹션 ───────────────────────────────
  const drawSection = (title: string, text: string | null | undefined, desiredLines = 3) => {
    if (!text) return
    const lineH = 4
    const headerH = 6
    const tail = 2.5
    // 남은 공간 기준으로 실제 출력 가능 줄 수 산출
    const maxByRemain = Math.max(1, Math.floor((remaining() - headerH - tail) / lineH))
    const maxLines = Math.min(desiredLines, maxByRemain)
    if (maxLines < 1) return

    doc.setFillColor(...BRAND.primary)
    doc.roundedRect(MARGIN, y, 2.5, 5, 0.5, 0.5, 'F')
    setFont('bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...BRAND.dark)
    doc.text(title, MARGIN + 5, y + 4)
    y += headerH

    setFont('normal')
    doc.setFontSize(8)
    doc.setTextColor(...BRAND.text)
    const raw = doc.splitTextToSize(text, PAGE_W - MARGIN * 2 - 2)
    const lines = addEllipsis(raw, maxLines)
    lines.forEach((ln: string) => {
      doc.text(ln, MARGIN + 2, y + 3.5)
      y += lineH
    })
    y += tail
  }

  drawSection('총평', ev.comments, 3)

  // 2열: 칭찬 / 보완 (남은 공간 있을 때만)
  if ((ev.praise || ev.improvement) && remaining() >= 26) {
    const colGap = 4
    const halfW = (PAGE_W - MARGIN * 2 - colGap) / 2
    const startY = y
    const boxLineH = 3.8
    const boxMaxLines = Math.max(1, Math.min(3, Math.floor((remaining() - 10) / boxLineH)))
    const boxH = 6.5 + boxMaxLines * boxLineH

    if (ev.praise) {
      doc.setFillColor(...BRAND.successBg)
      doc.roundedRect(MARGIN, y, halfW, boxH, 1.5, 1.5, 'F')
      setFont('bold')
      doc.setFontSize(8)
      doc.setTextColor(...BRAND.success)
      doc.text('✓ 칭찬할 점', MARGIN + 3, y + 4.5)
      setFont('normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...BRAND.text)
      const raw = doc.splitTextToSize(ev.praise, halfW - 5)
      addEllipsis(raw, boxMaxLines).forEach((ln: string, i: number) => doc.text(ln, MARGIN + 3, y + 9 + i * boxLineH))
    }

    if (ev.improvement) {
      doc.setFillColor(...BRAND.amberBg)
      doc.roundedRect(MARGIN + halfW + colGap, startY, halfW, boxH, 1.5, 1.5, 'F')
      setFont('bold')
      doc.setFontSize(8)
      doc.setTextColor(...BRAND.amber)
      doc.text('△ 보완할 점', MARGIN + halfW + colGap + 3, startY + 4.5)
      setFont('normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...BRAND.text)
      const raw = doc.splitTextToSize(ev.improvement, halfW - 5)
      addEllipsis(raw, boxMaxLines).forEach((ln: string, i: number) => doc.text(ln, MARGIN + halfW + colGap + 3, startY + 9 + i * boxLineH))
    }

    y = startY + boxH + 3
  }

  // 역할별 추가 필드 (공간 있을 때만)
  if (ev.leader_summary && remaining() >= 12) drawSection('리더 총평', ev.leader_summary, 2)
  if (ev.exec_one_liner && remaining() >= 12) drawSection('한줄 코멘트', ev.exec_one_liner, 2)
  if (ev.strengths && remaining() >= 12) drawSection('강점', ev.strengths, 2)

  // AI 분석 (공간 있을 때만, 남은 공간 기반 가변 줄 수)
  if (ev.ai_assessment && remaining() >= 12) {
    const headerH = 6.5
    const lineH = 3.8
    const maxLines = Math.max(1, Math.min(5, Math.floor((remaining() - headerH - 2) / lineH)))
    doc.setFillColor(236, 242, 255)
    doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 5, 0.5, 0.5, 'F')
    setFont('bold')
    doc.setFontSize(8)
    doc.setTextColor(37, 99, 235)
    doc.text('🤖 AI 평가 분석', MARGIN + 2, y + 3.5)
    y += headerH
    setFont('normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND.text)
    const raw = doc.splitTextToSize(ev.ai_assessment, PAGE_W - MARGIN * 2 - 2)
    addEllipsis(raw, maxLines).forEach((ln: string) => {
      doc.text(ln, MARGIN + 2, y + 3)
      y += lineH
    })
    y += 2
  }

  // ── 평가자 서명 영역 (하단 고정) ────────────
  const sigY = Math.max(y + 4, PAGE_H - 30)
  doc.setDrawColor(...BRAND.border)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, sigY, PAGE_W - MARGIN, sigY)

  setFont('normal')
  doc.setFontSize(8)
  doc.setTextColor(...BRAND.textLight)
  doc.text('평가일', MARGIN + 2, sigY + 5)
  doc.setTextColor(...BRAND.text)
  doc.text(fmtDate(ev.updated_at || ev.created_at), MARGIN + 16, sigY + 5)

  doc.setTextColor(...BRAND.textLight)
  doc.text('평가자', MARGIN + 60, sigY + 5)
  doc.setTextColor(...BRAND.text)
  doc.text(`${evaluator_name || '-'}`, MARGIN + 74, sigY + 5)

  // 인감 이미지
  if (sealDataUrl) {
    try {
      doc.addImage(sealDataUrl, 'PNG', PAGE_W - MARGIN - 22, sigY - 8, 20, 20)
    } catch (e) {
      console.warn('Seal image failed:', e)
    }
  } else {
    doc.setTextColor(...BRAND.textLight)
    doc.setFontSize(7)
    doc.text('(서명/인감)', PAGE_W - MARGIN - 2, sigY + 5, { align: 'right' })
  }

  // 푸터
  doc.setFontSize(6.5)
  doc.setTextColor(...BRAND.textLight)
  doc.text('InterOhrigin HR · Confidential', MARGIN, PAGE_H - 6)
  doc.text('본 평가서는 인사 내부용이며 외부 유출을 금합니다.', PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' })

  const fileName = `수습평가서_${employee.name}_${STAGE_LABEL[ev.stage as ProbationStage]?.split(' ')[0] || ev.stage}_${fmtDate(ev.created_at).replace(/\./g, '')}.pdf`
  doc.save(fileName)
}
