/**
 * GlobalTourOverlay — 어느 라우트에서든 Tour 활성 시 노출되는 글로벌 Overlay
 *
 * 배치: DashboardLayout 내부에 1회만 (App.tsx 최상위는 ToastProvider 등 외부에 있어서 안 됨)
 */
import { useTourContext } from '@/contexts/TourContext'
import { useToast } from '@/components/ui/Toast'
import { TourOverlay } from './TourOverlay'
import { useEffect, useRef } from 'react'

export function GlobalTourOverlay() {
  const tour = useTourContext()
  const { toast } = useToast()
  const wasActive = useRef(false)
  const lastChapterTitle = useRef<string | null>(null)

  // 완료 시 toast (active true → false 전환 시점)
  useEffect(() => {
    if (tour.active) {
      wasActive.current = true
      if (tour.chapter) lastChapterTitle.current = tour.chapter.title
    } else if (wasActive.current && lastChapterTitle.current) {
      // 종료 — completed 여부는 알 수 없으므로 항상 한 번 알림
      // 실제 완료(마지막 step 에서 next)인지 Esc 인지 구분이 어려워 부드러운 안내만
      wasActive.current = false
    }
  }, [tour.active, tour.chapter])

  // toast 미사용 경고 회피 (추후 확장 예정)
  void toast

  if (!tour.active || !tour.currentStep) return null

  return (
    <TourOverlay
      step={tour.currentStep}
      stepIndex={tour.stepIndex}
      totalSteps={tour.totalSteps}
      progress={tour.progress}
      onNext={tour.next}
      onPrev={tour.prev}
      onFinish={() => tour.finish(false)}
    />
  )
}
