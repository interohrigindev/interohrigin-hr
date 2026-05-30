/**
 * Cloudflare Pages Function — Web Push 발송 (RFC8030 aes128gcm 완전 동작)
 * POST /api/send-push
 * Body: { recipient_uid, title, body, url? }
 *
 * Design Ref: §7.1 — @block65/webcrypto-web-push 채택 (Web Crypto 네이티브, wrangler.toml 불요)
 * Plan SC: SC-01, FR-12
 *
 * 환경변수 (Cloudflare Pages Settings):
 *   VAPID_PUBLIC_KEY    — base64url 인코딩된 VAPID 공개키 (DB notification_channel_configs.vapid_public_key 와 동일)
 *   VAPID_PRIVATE_KEY   — base64url 인코딩된 VAPID 비공개키 (32 bytes raw key)
 *   VAPID_SUBJECT       — mailto: 또는 https: URL (예: mailto:hr@interohrigin.com)
 *   VITE_SUPABASE_URL          — Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service Role Key (push_subscriptions 조회용)
 */

import {
  buildPushPayload,
  type PushSubscription,
  type PushMessage,
  type VapidKeys,
} from '@block65/webcrypto-web-push'

interface Env {
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
  VITE_SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface PushRequestBody {
  recipient_uid: string
  title: string
  body: string
  url?: string
}

interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth_secret: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS_HEADERS })

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const env = ctx.env
    if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) {
      return jsonResponse({ error: 'VAPID 환경변수 미설정 (VAPID_PRIVATE_KEY/PUBLIC_KEY/SUBJECT)' }, 500)
    }
    if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: 'Supabase 서비스 키 미설정' }, 500)
    }

    const body = (await ctx.request.json()) as PushRequestBody
    if (!body.recipient_uid) return jsonResponse({ error: 'recipient_uid 필수' }, 400)

    // 1) 대상 구독 목록 조회 (service role)
    const subRes = await fetch(
      `${env.VITE_SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${body.recipient_uid}&select=endpoint,p256dh,auth_secret`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    )
    if (!subRes.ok) return jsonResponse({ error: '구독 조회 실패' }, 500)
    const subs = (await subRes.json()) as PushSubscriptionRow[]
    if (subs.length === 0) {
      return jsonResponse({ sent: 0, results: [], note: '등록된 구독 없음 (직원이 알림 권한 미허용 또는 미접속)' })
    }

    // 2) VAPID 키 객체
    const vapid: VapidKeys = {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    }

    // 3) Payload (Service Worker 가 받을 데이터)
    const messageData = JSON.stringify({
      title: body.title,
      body: body.body,
      url: body.url || '/',
    })

    const message: PushMessage = {
      data: messageData,
      options: {
        ttl: 60 * 60, // 1시간
        urgency: 'normal',
      },
    }

    // 4) 각 endpoint 로 발송 (allSettled — 일부 실패 무관)
    const results: Array<{ endpoint: string; status: number | 'error'; error?: string }> = []

    await Promise.allSettled(
      subs.map(async (sub) => {
        const subscription: PushSubscription = {
          endpoint: sub.endpoint,
          expirationTime: null,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth_secret,
          },
        }
        try {
          const pushInit = await buildPushPayload(message, subscription, vapid)
          const res = await fetch(sub.endpoint, pushInit)
          results.push({ endpoint: sub.endpoint, status: res.status })

          // 410 Gone / 404 Not Found — 구독 만료. 자동 정리.
          if (res.status === 404 || res.status === 410) {
            await fetch(
              `${env.VITE_SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
              {
                method: 'DELETE',
                headers: {
                  apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
                  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
                },
              },
            ).catch(() => {})
          }
        } catch (err: any) {
          results.push({
            endpoint: sub.endpoint,
            status: 'error',
            error: err?.message || 'unknown',
          })
        }
      }),
    )

    const successCount = results.filter(
      (r) => typeof r.status === 'number' && r.status >= 200 && r.status < 300,
    ).length
    return jsonResponse({
      sent: successCount,
      total: results.length,
      results,
    })
  } catch (err: any) {
    return jsonResponse({ error: err?.message || '발송 실패' }, 500)
  }
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'OPTIONS') return onRequestOptions()
  if (ctx.request.method === 'POST') return onRequestPost(ctx)
  return new Response('Method not allowed', { status: 405 })
}
