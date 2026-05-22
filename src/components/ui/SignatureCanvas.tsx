/**
 * Canvas 기반 손그림 서명 컴포넌트
 *
 * - 마우스 + 터치 (포인터 이벤트) 통합 처리 — 모바일 반응형
 * - 빈 캔버스 검증 — 서명 안 그리고 onConfirm 호출 시 false 반환
 * - PNG Blob 으로 외부에 전달 (Supabase Storage 업로드 직전 형태)
 *
 * 사용 예:
 *   <SignatureCanvas
 *     onConfirm={async (blob) => { ... await safeStorageUpload(...) ... }}
 *   />
 */
import { useRef, useState, useEffect, useCallback } from 'react'
import { Button } from './Button'
import { RotateCcw } from 'lucide-react'

interface SignatureCanvasProps {
  width?: number
  height?: number
  disabled?: boolean
  /** 서명 PNG Blob 을 받아서 처리. 성공 시 true, 실패 시 false 반환. */
  onConfirm: (blob: Blob) => Promise<boolean> | boolean
  confirmLabel?: string
}

export function SignatureCanvas({
  width = 600,
  height = 220,
  disabled = false,
  onConfirm,
  confirmLabel = '서명 확정',
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasStroke, setHasStroke] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // DPR 대응 — 고해상도 출력
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2
    ctx.strokeStyle = '#0f172a'
    // 초기 배경 — 흰색으로 채워야 PNG 변환 시 투명 배경 방지
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }, [width, height])

  const getCanvasPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || submitting) return
    e.preventDefault()
    drawingRef.current = true
    const pt = getCanvasPoint(e)
    lastPointRef.current = pt
    canvasRef.current?.setPointerCapture(e.pointerId)
  }, [disabled, submitting, getCanvasPoint])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled || submitting) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const pt = getCanvasPoint(e)
    const last = lastPointRef.current
    if (last) {
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(pt.x, pt.y)
      ctx.stroke()
    }
    lastPointRef.current = pt
    if (!hasStroke) setHasStroke(true)
  }, [disabled, submitting, getCanvasPoint, hasStroke])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false
    lastPointRef.current = null
    canvasRef.current?.releasePointerCapture(e.pointerId)
  }, [])

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    setHasStroke(false)
  }, [width, height])

  const handleConfirm = useCallback(async () => {
    if (!hasStroke || submitting) return
    const canvas = canvasRef.current
    if (!canvas) return
    setSubmitting(true)
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png')
      })
      if (!blob) return
      const ok = await onConfirm(blob)
      if (!ok) {
        // 실패 시 캔버스 유지 (재시도 가능)
        setSubmitting(false)
      }
      // 성공 시 부모가 unmount 하거나 상태 변경하므로 submitting 풀지 않음
    } catch {
      setSubmitting(false)
    }
  }, [hasStroke, submitting, onConfirm])

  return (
    <div className="space-y-3">
      <div className="rounded-lg border-2 border-gray-300 bg-white overflow-hidden inline-block max-w-full">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="block touch-none cursor-crosshair"
          style={{ maxWidth: '100%' }}
          aria-label="서명 입력 캔버스"
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>위 영역에 손가락(모바일) 또는 마우스로 서명해주세요.</span>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={!hasStroke || submitting || disabled}
        >
          <RotateCcw className="h-4 w-4" />
          지우기
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!hasStroke || submitting || disabled}
        >
          {submitting ? '서명 저장 중...' : confirmLabel}
        </Button>
      </div>
    </div>
  )
}
