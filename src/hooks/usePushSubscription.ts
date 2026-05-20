/**
 * Web Push 구독 등록 훅
 *  - 로그인 직후 자동 실행
 *  - 알림 권한이 허용되어 있고, 아직 구독 안 된 경우에만 등록
 *  - VAPID 공개키는 notification_channel_configs.vapid_public_key 에서 로드
 *  - 구독 정보는 push_subscriptions 테이블에 저장 (RLS: user_id = auth.uid())
 */
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function usePushSubscription() {
  const { profile } = useAuth()

  useEffect(() => {
    if (!profile?.id) return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    let cancelled = false
    ;(async () => {
      try {
        // VAPID 키 로드
        const { data: cfg } = await supabase
          .from('notification_channel_configs')
          .select('vapid_public_key, enabled_channels')
          .eq('config_key', 'default')
          .maybeSingle()

        const vapidKey = cfg?.vapid_public_key
        const enabledChannels = (cfg?.enabled_channels as string[]) || []
        if (!vapidKey || !enabledChannels.includes('push')) return

        // 권한 확인
        if (Notification.permission === 'denied') return
        if (Notification.permission === 'default') {
          const result = await Notification.requestPermission()
          if (result !== 'granted') return
        }

        // Service Worker 등록 대기
        const reg = await navigator.serviceWorker.ready

        // 기존 구독 확인
        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
          })
        }

        if (cancelled) return

        const subJson: any = sub.toJSON()
        const endpoint = subJson.endpoint as string
        const p256dh = subJson.keys?.p256dh as string
        const authSecret = subJson.keys?.auth as string
        if (!endpoint || !p256dh || !authSecret) return

        // DB 저장 (멱등 — UNIQUE(user_id, endpoint))
        await supabase.from('push_subscriptions').upsert(
          {
            user_id: profile.id,
            endpoint,
            p256dh,
            auth_secret: authSecret,
            user_agent: navigator.userAgent.slice(0, 200),
            last_used_at: new Date().toISOString(),
          } as any,
          { onConflict: 'user_id,endpoint' } as any,
        )
      } catch (err) {
        console.warn('[push-subscription] 등록 실패:', err)
      }
    })()

    return () => { cancelled = true }
  }, [profile?.id])
}
