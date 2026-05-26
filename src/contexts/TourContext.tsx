/**
 * TourContext — 글로벌 매뉴얼 Tour 상태
 *
 * 문제 해결:
 *   초기 구현(useTour 훅 + tour.tsx 라우트 내부 Overlay)은 navigate(startRoute)
 *   호출 시 tour.tsx 가 unmount 되어 Overlay 가 사라지는 회귀 발생.
 *
 * 해결:
 *   Context 로 글로벌화 → 어느 라우트에서든 Overlay 유지.
 *   GlobalTourOverlay 를 DashboardLayout 안에 한 번만 배치.
 *
 * 책임:
 *   - 활성 챕터/step 상태
 *   - start(chapter)  — startRoute navigate + step 0 시작
 *   - next/prev/finish
 *   - 글로벌 키보드 (Esc / ←→)
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ManualChapter, TourStep } from '@/types/manual'

interface TourContextType {
  active: boolean
  chapter: ManualChapter | null
  stepIndex: number
  totalSteps: number
  progress: number
  currentStep: TourStep | null
  start: (chapter: ManualChapter) => void
  next: () => void
  prev: () => void
  finish: (completed?: boolean) => void
}

const TourContext = createContext<TourContextType | null>(null)

export function useTourContext(): TourContextType {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTourContext must be used within TourProvider')
  return ctx
}

export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [chapter, setChapter] = useState<ManualChapter | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [active, setActive] = useState(false)
  const [completionCallback, setCompletionCallback] = useState<(() => void) | null>(null)

  const totalSteps = chapter?.steps.length ?? 0
  const currentStep = active && chapter ? chapter.steps[stepIndex] ?? null : null
  const progress = totalSteps > 0 ? Math.round(((stepIndex + 1) / totalSteps) * 100) : 0

  const finish = useCallback((completed = false) => {
    setActive(false)
    setStepIndex(0)
    setChapter(null)
    if (completed && completionCallback) completionCallback()
    setCompletionCallback(null)
  }, [completionCallback])

  const start = useCallback((newChapter: ManualChapter) => {
    setChapter(newChapter)
    setStepIndex(0)
    setActive(true)
    if (newChapter.startRoute) navigate(newChapter.startRoute)
  }, [navigate])

  const next = useCallback(() => {
    if (!chapter) return
    if (stepIndex >= totalSteps - 1) {
      finish(true)
      return
    }
    const nextStep = chapter.steps[stepIndex + 1]
    if (nextStep?.route) navigate(nextStep.route)
    setStepIndex((i) => i + 1)
  }, [chapter, stepIndex, totalSteps, navigate, finish])

  const prev = useCallback(() => {
    if (stepIndex <= 0) return
    setStepIndex((i) => i - 1)
  }, [stepIndex])

  // 글로벌 키보드 (Esc 종료, 화살표 키 네비)
  useEffect(() => {
    if (!active) return
    function onKey(e: KeyboardEvent) {
      // 입력 필드에서는 키 이벤트 무시 (사용자가 input 에 타이핑 중이면)
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        if (e.key === 'Escape') finish(false)
        return
      }
      if (e.key === 'Escape') finish(false)
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, finish, next, prev])

  // 완료 콜백 등록 (외부에서 toast 등 표시 가능하도록)
  // 현재는 미사용 — 추후 확장
  void setCompletionCallback

  return (
    <TourContext.Provider value={{ active, chapter, stepIndex, totalSteps, progress, currentStep, start, next, prev, finish }}>
      {children}
    </TourContext.Provider>
  )
}
