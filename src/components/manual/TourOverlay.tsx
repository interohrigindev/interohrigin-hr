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
  const tooltipWidth = 420
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  let style: React.CSSProperties = {}

  switch (placement) {
    case 'top':
      style = {
        bottom: `${viewportH - rect.top + offset}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translateX(-50%)',
      }
      break
    case 'bottom':
      style = {
        top: `${rect.top + rect.height + offset}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translateX(-50%)',
      }
      break
    case 'left':
      style = {
        top: `${rect.top + rect.height / 2}px`,
        right: `${viewportW - rect.left + offset}px`,
        transform: 'translateY(-50%)',
      }
      break
    case 'right':
      style = {
        top: `${rect.top + rect.height / 2}px`,
        left: `${rect.left + rect.width + offset}px`,
        transform: 'translateY(-50%)',
      }
      break
  }

  // viewport 밖으로 나가면 center 폴백
  // 모바일에서 화면이 좁을 때 — 단순화: viewport 폭이 tooltipWidth+32 보다 작으면 center
  if (viewportW < tooltipWidth + 32) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  return style
}
