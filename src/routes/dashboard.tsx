import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { usePushSubscription } from '@/hooks/usePushSubscription'
import { GlobalTourOverlay } from '@/components/manual/GlobalTourOverlay'
// FloatingHelpButton 은 IO 플로팅(FloatingAIAgent) 빠른 링크로 통합되어 제거 (2026-05-30)

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Web Push 구독 자동 등록 (VAPID 키 설정 + push 채널 활성화 + 권한 허용 시)
  usePushSubscription()

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <Header onMenuToggle={() => setSidebarOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>

      <MobileBottomNav />

      {/* 매뉴얼 Tour 글로벌 오버레이 — 어느 라우트에서든 활성 유지 */}
      <GlobalTourOverlay />

      {/* 사용 매뉴얼은 IO 플로팅(FloatingAIAgent) 빠른 링크에서 진입 */}
    </div>
  )
}
