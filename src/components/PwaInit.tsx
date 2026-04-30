/**
 * IO Mall 동등 — 앱 설치 배너 (PWA)
 *  - beforeinstallprompt 이벤트 캡처 → 커스텀 배너로 노출
 *  - 우측 하단 토스트 형태 (FloatingAIAgent / UrgentTaskPopup 위치 회피)
 *  - 사용자가 닫으면 7일간 미노출 (localStorage)
 *  - 이미 standalone 으로 실행 중이면 미노출
 *  - iOS 사파리는 자동 프롬프트 미지원 → 별도 안내 메시지
 */
import { useEffect, useState } from 'react'
import { X, Smartphone } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

const DISMISS_KEY = 'iohr-pwa-dismiss-until'
const DISMISS_DAYS = 7

export function PwaInit() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 이미 dismiss 기간 내면 스킵
    const dismissUntil = localStorage.getItem(DISMISS_KEY)
    if (dismissUntil && Date.now() < Number(dismissUntil)) return

    // 이미 standalone (앱 모드) 이면 스킵
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    if (isStandalone) return

    // iOS 사파리 감지 (beforeinstallprompt 미지원)
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua)
    if (isIOS) {
      // iOS 는 1회 노출 후 dismiss 까지 안내
      setShowIosHint(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
      setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // 설치 완료 이벤트 리스너 (앱이 실제로 설치되면 배너 숨김)
    const installed = () => {
      setShowBanner(false)
      setShowIosHint(false)
    }
    window.addEventListener('appinstalled', installed)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  async function handleInstall() {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    if (outcome === 'accepted') {
      setShowBanner(false)
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400 * 1000))
    setShowBanner(false)
    setShowIosHint(false)
  }

  if (!showBanner && !showIosHint) return null

  return (
    <div className="fixed bottom-36 md:bottom-24 right-4 md:right-6 z-40 w-72 max-w-[calc(100vw-2rem)] bg-white border border-violet-200 rounded-xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-4">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
        aria-label="닫기"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-violet-600 shrink-0" />
        <p className="text-sm font-bold text-gray-800">앱처럼 사용하기</p>
      </div>

      <div className="px-4 pb-3">
        {showBanner ? (
          <p className="text-xs text-gray-600 leading-relaxed">
            홈 화면에 추가하면 빠른 접근 + 알림을 받을 수 있어요.
          </p>
        ) : (
          // iOS 안내
          <p className="text-xs text-gray-600 leading-relaxed">
            아래 <strong className="text-violet-700">공유 버튼</strong> →{' '}
            <strong className="text-violet-700">"홈 화면에 추가"</strong> 를 눌러주세요.
          </p>
        )}
      </div>

      {showBanner && (
        <div className="px-4 pb-4">
          <button
            onClick={handleInstall}
            className="w-full py-2 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            홈 화면에 추가
          </button>
          <p className="text-[10px] text-gray-400 text-center mt-1.5">7일 후 다시 알림</p>
        </div>
      )}
    </div>
  )
}
