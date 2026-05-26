/**
 * TourOverlay — 매뉴얼 시연 오버레이
 *
 * 동작:
 *  - target 이 있으면 해당 요소를 spotlight (주변 어둡게 + 테두리)
 *  - placement (top/bottom/left/right/center) 에 따라 tooltip 카드 위치 결정
 *  - 다음/이전/종료 버튼 + 진행률 표시
 *  - target 이 없거나 못 찾으면 화면 중앙 모달
 *  - 모바일: viewport 자동 조정
 */
import { useEffect, useState, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { TourStep } from '@/types/manual'

type Rect = { top: number; left: number; width: number; height: number }

interface TourOverlayProps {
  step: TourStep
  stepIndex: number
  totalSteps: number
  progress: number
  onNext: () => void
  onPrev: () => void
  onFinish: () => void
}

export function TourOverlay({
  step,
  stepIndex,
  totalSteps,
  progress,
  onNext,
  onPrev,
  onFinish,
}: TourOverlayProps) {
  const [rect, setRect] = useState<Rect | null>(null)
  const isLast = stepIndex === totalSteps - 1

  // target 요소 위치 추적 (리사이즈/스크롤 시 갱신)
  const updateRect = useCallback(() => {
    if (!step.target) {
      setRect(null)
      return
    }
    const el = document.querySelector(step.target) as HTMLElement | null
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    // 화면에 들어오도록 스크롤
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  }, [step.target])

  useEffect(() => {
    updateRect()
    const interval = setInterval(updateRect, 500) // SPA route 전환 후 요소가 늦게 생길 수 있음
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [updateRect])

  const placement = step.placement ?? (rect ? 'bottom' : 'center')
  const tooltipStyle = getTooltipStyle(rect, placement)
  const spotlightStyle = rect ? getSpotlightStyle(rect) : null

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none" aria-modal="true" role="dialog">
      {/* 어두운 배경 */}
      <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={onFinish} />

      {/* Spotlight (target 강조) */}
      {spotlightStyle && (
        <div
          className="absolute rounded-lg ring-4 ring-brand-400 ring-offset-2 ring-offset-transparent pointer-events-none"
          style={{
            ...spotlightStyle,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
            transition: 'all 0.3s ease',
          }}
        />
      )}

      {/* Tooltip 카드 */}
      <div
        className="absolute pointer-events-auto bg-white rounded-2xl shadow-2xl border border-gray-200 w-[min(420px,calc(100vw-32px))]"
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 진행률 바 */}
        <div className="h-1 bg-gray-100 rounded-t-2xl overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-500 shrink-0" />
              <span className="text-xs text-gray-500 font-medium">
                {stepIndex + 1} / {totalSteps} 단계
              </span>
            </div>
            <button
              onClick={onFinish}
              className="text-gray-400 hover:text-gray-600 -mt-1 -mr-1 p-1"
              aria-label="종료"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {step.description}
          </p>

          {step.hint && (
            <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              💡 {step.hint}
            </p>
          )}

          <div className="flex items-center justify-between mt-5 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onPrev}
              disabled={stepIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> 이전
            </Button>

            <span className="text-xs text-gray-400">
              <kbd className="px-1.5 py-0.5 border border-gray-200 rounded text-[10px]">Esc</kbd> 종료
            </span>

            <Button size="sm" onClick={onNext}>
              {isLast ? (
                <>완료 <Check className="h-4 w-4 ml-1" /></>
              ) : (
                <>다음 <ChevronRight className="h-4 w-4 ml-1" /></>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 위치 계산 헬퍼 ──────────────────────────────────────────────

function getSpotlightStyle(rect: Rect): React.CSSProperties {
  const pad = 8
  return {
    top: `${rect.top - pad}px`,
    left: `${rect.left - pad}px`,
    width: `${rect.width + pad * 2}px`,
    height: `${rect.height + pad * 2}px`,
  }
}

function getTooltipStyle(rect: Rect | null, placement: string): React.CSSProperties {
  if (!rect || placement === 'center') {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  const offset = 16
  const margin = 16 // viewport 가장자리 여백
  const tooltipWidth = 420
  const tooltipHeight = 280 // 대략적 — 카드 평균 높이
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  // viewport 가 너무 좁으면 center 폴백
  if (viewportW < tooltipWidth + margin * 2) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  // 1) 우선 placement 시도, 단 viewport 밖으로 튀어나가면 자동 fallback
  // 각 placement 의 tooltip 박스 left/top 계산 (transform 적용 전)
  const calcBox = (p: string) => {
    switch (p) {
      case 'top':
        return {
          left: rect.left + rect.width / 2 - tooltipWidth / 2,
          top: rect.top - offset - tooltipHeight,
        }
      case 'bottom':
        return {
          left: rect.left + rect.width / 2 - tooltipWidth / 2,
          top: rect.top + rect.height + offset,
        }
      case 'left':
        return {
          left: rect.left - offset - tooltipWidth,
          top: rect.top + rect.height / 2 - tooltipHeight / 2,
        }
      case 'right':
      default:
        return {
          left: rect.left + rect.width + offset,
          top: rect.top + rect.height / 2 - tooltipHeight / 2,
        }
    }
  }

  // 2) 4방향 시도 — viewport 안에 완전히 들어가는 placement 선택
  const tryOrder = [placement, 'bottom', 'right', 'top', 'left']
  let chosen: { left: number; top: number } | null = null
  for (const p of tryOrder) {
    const box = calcBox(p)
    if (
      box.left >= margin &&
      box.left + tooltipWidth <= viewportW - margin &&
      box.top >= margin &&
      box.top + tooltipHeight <= viewportH - margin
    ) {
      chosen = box
      break
    }
  }

  // 3) 그래도 못 찾으면 placement 박스를 viewport 안으로 clamp
  if (!chosen) {
    const box = calcBox(placement)
    chosen = {
      left: Math.max(margin, Math.min(box.left, viewportW - tooltipWidth - margin)),
      top: Math.max(margin, Math.min(box.top, viewportH - tooltipHeight - margin)),
    }
  }

  return { left: `${chosen.left}px`, top: `${chosen.top}px` }
}
