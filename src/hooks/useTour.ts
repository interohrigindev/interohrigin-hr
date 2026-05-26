/**
 * useTour — 매뉴얼 Tour 상태 관리 훅
 *
 * 책임:
 *  - current step index 관리
 *  - next/prev/jumpTo/complete
 *  - 시작 시 startRoute navigate
 *  - Esc 키로 종료
 *  - 진행률 계산
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ManualChapter } from '@/types/manual'

export interface UseTourResult {
  active: boolean
  stepIndex: number
  totalSteps: number
  progress: number // 0~100
  currentStep: ManualChapter['steps'][number] | null
  start: () => void
  next: () => void
  prev: () => void
  jumpTo: (i: number) => void
  finish: (completed?: boolean) => void
}

export function useTour(chapter: ManualChapter | null, onComplete?: () => void): UseTourResult {
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const navigate = useNavigate()

  const totalSteps = chapter?.steps.length ?? 0
  const currentStep = active && chapter ? chapter.steps[stepIndex] ?? null : null
  const progress = totalSteps > 0 ? Math.round(((stepIndex + 1) / totalSteps) * 100) : 0

  const finish = useCallback((completed = false) => {
    setActive(false)
    setStepIndex(0)
    if (completed && onComplete) onComplete()
  }, [onComplete])

  const start = useCallback(() => {
    if (!chapter) return
    setStepIndex(0)
    setActive(true)
    if (chapter.startRoute) navigate(chapter.startRoute)
  }, [chapter, navigate])

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

  const jumpTo = useCallback((i: number) => {
    if (i < 0 || i >= totalSteps) return
    setStepIndex(i)
  }, [totalSteps])

  // Esc 종료
  useEffect(() => {
    if (!active) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish(false)
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, finish, next, prev])

  return { active, stepIndex, totalSteps, progress, currentStep, start, next, prev, jumpTo, finish }
}
