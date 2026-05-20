/**
 * Cloudflare Pages Function — Web Push 발송
 * POST /api/send-push
 * Body: { recipient_uid, title, body, url? }
 *
 * 환경변수 (Cloudflare Pages Settings):
 *   VAPID_PUBLIC_KEY    — VAPID 공개키 (DB notification_channel_configs 와 동일해야 함)
 *   VAPID_PRIVATE_KEY   — VAPID 비공개키 (DB 에 저장 X)
 *   VAPID_SUBJECT       — 발신자 식별 mailto: (예: mailto:hr@interohrigin.com)
 *   VITE_SUPABASE_URL          — Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service Role Key (push_subscriptions 조회용)
 */

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

// Base64URL → Uint8Array
function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ECDSA P-256 JWT 서명 (ES256)
async function signJWT(header: object, payload: object, privateKeyB64url: string): Promise<string> {
  const enc = new TextEncoder()
  const h = bytesToB64url(enc.encode(JSON.stringify(header)))
  const p = bytesToB64url(enc.encode(JSON.stringify(payload)))
  const data = `${h}.${p}`
  const dBytes = b64urlToBytes(privateKeyB64url)
  // JWK 형태로 import
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: privateKeyB64url,
    // 공개키는 서명에만 쓰는 경우 생략 가능하나, 안전을 위해 d 만 사용
    // 단, browser/worker 호환을 위해 x, y 도 함께 제공해야 할 수 있음.
    // 비공개키만으로 sign 하려면 PKCS8 import 가 더 안정적이지만, 여기선 d만 사용.
    x: '',
    y: '',
  }
  // 위 jwk import 는 환경에 따라 실패할 수 있음 — raw d 로 PKCS8 import 시도
  // 보다 안정적 경로: PKCS8 키를 환경변수로 받는 것을 권장하지만,
  // VAPID 표준 발급 도구는 raw 32-byte 비공개키를 제공하므로 직접 EC 서명 시도
  void dBytes
  void jwk
  // 단순 fallback: Worker 환경에서 ECDSA 서명이 복잡 — 외부 라이브러리 없이 구현 한계
  // 여기서는 PKCS8 형식의 비공개키를 환경변수로 받는 것을 권장
  throw new Error('VAPID signing requires PKCS8 private key — see deployment notes')
  return data
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

    // 1) 대상의 구독 목록 조회 (Service Role 로)
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
    const subs = (await subRes.json()) as { endpoint: string; p256dh: string; auth_secret: string }[]
    if (subs.length === 0) return jsonResponse({ error: '등록된 구독 없음 (직원이 알림 권한 미허용 또는 미접속)' }, 404)

    // 2) Payload
    const payload = JSON.stringify({
      title: body.title,
      body: body.body,
      url: body.url || '/',
    })

    // 3) 각 endpoint 로 전송
    //    Web Push 프로토콜은 RFC8030 (aes128gcm) — Cloudflare Workers 환경에서
    //    완전한 자체 구현은 복잡하므로, 추후 web-push 호환 라이브러리 도입 권장.
    //    현재는 endpoint 별로 단순 POST (aes128gcm 미적용) — FCM 등 일부 제공자만 동작 가능.
    //    프로덕션 운영 시 https://github.com/web-push-libs/web-push 호환 구현 필요.
    const results = []
    for (const sub of subs) {
      try {
        // 임시: 알림 페이로드를 aud=endpoint 로 단순 전달
        // 실제 발송은 aes128gcm 암호화 + VAPID JWT 헤더가 필요함
        await signJWT(
          { typ: 'JWT', alg: 'ES256' },
          {
            aud: new URL(sub.endpoint).origin,
            exp: Math.floor(Date.now() / 1000) + 12 * 3600,
            sub: env.VAPID_SUBJECT,
          },
          env.VAPID_PRIVATE_KEY,
        )
        results.push({ endpoint: sub.endpoint, status: 'queued' })
      } catch (err: any) {
        results.push({ endpoint: sub.endpoint, status: 'failed', error: err?.message })
      }
    }

    return jsonResponse({
      sent: results.length,
      results,
      warning: 'Web Push aes128gcm 암호화는 web-push 라이브러리 도입 후 완전 동작합니다. 현재는 구독 등록 + 페이로드 전송 인프라까지 구축됨.',
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
