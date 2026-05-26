/**
 * /manual/tour/:chapterId — Tour 시연 모드
 *
 * 진입 즉시:
 *  1) chapterId 로 챕터 조회
 *  2) startRoute 로 navigate (실제 화면 이동)
 *  3) TourOverlay 활성화 + step 0 부터 시작
 *
 * 종료 시:
 *  - /manual/employee 로 복귀
 */
import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TourOverlay } from '@/components/manual/TourOverlay'
import { useTour } from '@/hooks/useTour'
import { getChapterById } from '@/lib/manual/chapters'
import { useToast } from '@/components/ui/Toast'

export default function ManualTour() {
  const { chapterId } = useParams<{ chapterId: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const startedRef = useRef(false)

  const chapter = chapterId ? getChapterById(chapterId) : null

  const tour = useTour(chapter, () => {
    toast(`"${chapter?.title}" 챕터를 완료했습니다! 🎉`, 'success')
    navigate('/manual/employee')
  })

  // 진입 즉시 자동 시작 (1회만)
  useEffect(() => {
    if (!chapter || startedRef.current) return
    startedRef.current = true
    // 약간 지연: route navigate + DOM mount 시간 확보
    const timer = setTimeout(() => tour.start(), 200)
    return () => clearTimeout(timer)
  }, [chapter, tour])

  // 종료 시 라우트 복귀
  useEffect(() => {
    if (startedRef.current && !tour.active) {
      // active 가 false 가 되면 종료 — onComplete 콜백이 아닌 종료(Esc)도 처리
      const t = setTimeout(() => navigate('/manual/employee'), 100)
      return () => clearTimeout(t)
    }
  }, [tour.active, navigate])

  if (!chapter) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-gray-600 mb-3">해당 챕터를 찾을 수 없습니다.</p>
          <button
            onClick={() => navigate('/manual')}
            className="text-brand-600 underline text-sm"
          >
            매뉴얼 허브로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  // tour.active = false 인 경우 (시작 전 / 종료 후) — 빈 화면
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
