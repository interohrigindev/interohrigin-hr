/**
 * /manual/tour/:chapterId — Tour 진입 트리거
 *
 * 단순 redirect 컴포넌트:
 *  1) chapterId 로 챕터 조회
 *  2) TourContext.start(chapter) 호출 → 전역 활성화 + startRoute navigate
 *  3) 이 컴포넌트는 startRoute navigate 직후 unmount 되어도 OK
 *     (Overlay 는 GlobalTourOverlay 가 Layout 안에서 유지)
 */
import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTourContext } from '@/contexts/TourContext'
import { getChapterById } from '@/lib/manual/chapters'

export default function ManualTour() {
  const { chapterId } = useParams<{ chapterId: string }>()
  const navigate = useNavigate()
  const tour = useTourContext()
  const triggered = useRef(false)

  const chapter = chapterId ? getChapterById(chapterId) : null

  useEffect(() => {
    if (triggered.current) return
    if (!chapter) return
    triggered.current = true
    // 한 프레임 지연 후 시작 (Layout mount 보장)
    requestAnimationFrame(() => tour.start(chapter))
  }, [chapter, tour])

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

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center text-gray-500 text-sm">
        <p>"{chapter.title}" 시작 중...</p>
      </div>
    </div>
  )
}
