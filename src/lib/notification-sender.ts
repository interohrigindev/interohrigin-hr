// 법적 리스크 대응 P0 — 알림 디스패처
// 채널: email (현재) / push / slack / webhook / in_app (추후)
// 모든 발송은 notification_deliveries 에 성공/실패 로그 기록

import { supabase } from '@/lib/supabase'
import type { NotificationChannel, NotificationStatus } from '@/types/compliance'

export interface SendNotificationArgs {
  templateKey?: string                   // notification_templates.key (옵션 — 직접 본문 전달도 가능)
  channel: NotificationChannel
  recipientUid?: string | null
  recipientEmail?: string | null
  subject?: string
  body?: string                          // HTML 또는 plain text
  /** 변수 치환용 payload (예: {name: '홍길동', date: '2026.05.20'}) */
  variables?: Record<string, unknown>
  /** 관련 엔티티 (감사 추적용) */
  relatedEntity?: { type: string; id?: string }
  /** dry-run — 발송하지 않고 'skipped' 로 기록 (테스트용) */
  dryRun?: boolean
}

export interface SendNotificationResult {
  deliveryId: string | null
  status: NotificationStatus
  error?: string
}

/**
 * 채널 설정 캐시 (60초)
 */
let channelConfigCache: { data: Record<string, string | null>; ts: number } | null = null

async function getChannelConfig(key: 'slack_webhook_url' | 'generic_webhook_url' | 'vapid_public_key'): Promise<string | null> {
  if (channelConfigCache && Date.now() - channelConfigCache.ts < 60_000) {
    return channelConfigCache.data[key] || null
  }
  const { data } = await supabase
    .from('notification_channel_configs')
    .select('slack_webhook_url, generic_webhook_url, vapid_public_key')
    .eq('config_key', 'default')
    .maybeSingle()
  channelConfigCache = {
    data: {
      slack_webhook_url: data?.slack_webhook_url || null,
      generic_webhook_url: data?.generic_webhook_url || null,
      vapid_public_key: data?.vapid_public_key || null,
    },
    ts: Date.now(),
  }
  return channelConfigCache.data[key] || null
}

export function invalidateChannelConfigCache() {
  channelConfigCache = null
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

/**
 * 변수 치환: {{key}} → variables[key]
 */
function renderTemplate(tpl: string, variables: Record<string, unknown> = {}): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = variables[key]
    return v == null ? '' : String(v)
  })
}

/**
 * 알림 발송 + 결과 로그.
 * 이메일은 기존 /api/send-email 엔드포인트 재사용.
 */
export async function sendNotification(args: SendNotificationArgs): Promise<SendNotificationResult> {
  let subject = args.subject || ''
  let body = args.body || ''

  // 템플릿 키가 있으면 DB 에서 로드 + 치환
  if (args.templateKey) {
    const { data: tpl } = await supabase
      .from('notification_templates')
      .select('subject_tpl, body_tpl, is_active')
      .eq('key', args.templateKey)
      .eq('channel', args.channel)
      .maybeSingle()
    if (tpl && tpl.is_active) {
      subject = renderTemplate(tpl.subject_tpl || '', args.variables || {})
      body = renderTemplate(tpl.body_tpl || '', args.variables || {})
    }
  }

  // dry-run: 발송 X, 로그만
  if (args.dryRun) {
    const deliveryId = await recordDelivery(args, subject, body, 'skipped', 'dry-run')
    return { deliveryId, status: 'skipped' }
  }

  // 채널별 발송
  try {
    if (args.channel === 'email') {
      if (!args.recipientEmail) throw new Error('recipientEmail 필수')
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: args.recipientEmail,
          subject,
          html: body,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `이메일 발송 실패 (HTTP ${res.status})`)
      }
      const deliveryId = await recordDelivery(args, subject, body, 'sent')
      return { deliveryId, status: 'sent' }
    }

    if (args.channel === 'in_app') {
      // 인앱 알림 — DB INSERT 만으로 완료. 헤더 종 아이콘이 polling 으로 가져감.
      if (!args.recipientUid) throw new Error('recipientUid 필수 (in_app)')
      const deliveryId = await recordDelivery(args, subject, body, 'sent')
      return { deliveryId, status: 'sent' }
    }

    if (args.channel === 'slack') {
      const url = await getChannelConfig('slack_webhook_url')
      if (!url) throw new Error('Slack Webhook URL 미설정 (시스템 관리 > 알림 채널)')
      const slackText = stripHtml(body)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: subject ? `*${subject}*\n${slackText}` : slackText,
        }),
      })
      if (!res.ok) throw new Error(`Slack 발송 실패 (HTTP ${res.status})`)
      const deliveryId = await recordDelivery(args, subject, body, 'sent')
      return { deliveryId, status: 'sent' }
    }

    if (args.channel === 'webhook') {
      const url = await getChannelConfig('generic_webhook_url')
      if (!url) throw new Error('Webhook URL 미설정 (시스템 관리 > 알림 채널)')
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body,
          recipient_uid: args.recipientUid,
          recipient_email: args.recipientEmail,
          related_entity: args.relatedEntity,
          variables: args.variables,
          sent_at: new Date().toISOString(),
        }),
      })
      if (!res.ok) throw new Error(`Webhook 발송 실패 (HTTP ${res.status})`)
      const deliveryId = await recordDelivery(args, subject, body, 'sent')
      return { deliveryId, status: 'sent' }
    }

    if (args.channel === 'push') {
      // Web Push — 서버측 VAPID 비공개 키 필요. /api/send-push 엔드포인트로 위임.
      if (!args.recipientUid) throw new Error('recipientUid 필수 (push)')
      const res = await fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_uid: args.recipientUid,
          title: subject || '알림',
          body: stripHtml(body).slice(0, 200),
          url: typeof window !== 'undefined' ? window.location.origin : '',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `Push 발송 실패 (HTTP ${res.status})`)
      }
      const deliveryId = await recordDelivery(args, subject, body, 'sent')
      return { deliveryId, status: 'sent' }
    }

    // 알 수 없는 채널
    const deliveryId = await recordDelivery(args, subject, body, 'skipped', `${args.channel} 채널 미지원`)
    return { deliveryId, status: 'skipped' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    const deliveryId = await recordDelivery(args, subject, body, 'failed', msg)
    return { deliveryId, status: 'failed', error: msg }
  }
}

async function recordDelivery(
  args: SendNotificationArgs,
  subject: string,
  body: string,
  status: NotificationStatus,
  error?: string,
): Promise<string | null> {
  const { data, error: rpcErr } = await supabase.rpc('record_notification_delivery', {
    p_template_key: args.templateKey ?? null,
    p_channel: args.channel,
    p_recipient_uid: args.recipientUid ?? null,
    p_recipient_email: args.recipientEmail ?? null,
    p_subject: subject,
    p_payload: {
      body,
      variables: args.variables || {},
    },
    p_status: status,
    p_error_message: error ?? null,
    p_related_entity_type: args.relatedEntity?.type ?? null,
    p_related_entity_id: args.relatedEntity?.id ?? null,
  })
  if (rpcErr) {
    console.warn('[notification-sender] 발송 로그 기록 실패:', rpcErr.message)
    return null
  }
  return (data as string) || null
}
