/**
 * 시스템 관리 > 알림 채널 설정 (/admin/system/notification-channels)
 *  - Slack Webhook URL
 *  - Generic Webhook URL
 *  - Web Push VAPID 공개키 (비공개키는 서버 환경변수)
 *  - 활성 채널 토글 (email/in_app/slack/webhook/push)
 *  - 테스트 발송 버튼
 */
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Bell, Send, AlertCircle, ExternalLink, Save, MessageSquare, Link2, Smartphone, Mail } from 'lucide-react'
import { sendNotification, invalidateChannelConfigCache } from '@/lib/notification-sender'
import { logAudit } from '@/lib/audit-logger'

type Channel = 'email' | 'in_app' | 'slack' | 'webhook' | 'push'

interface ChannelConfig {
  slack_webhook_url: string | null
  generic_webhook_url: string | null
  vapid_public_key: string | null
  enabled_channels: Channel[]
}

export default function NotificationChannelConfigPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<Channel | null>(null)
  const [cfg, setCfg] = useState<ChannelConfig>({
    slack_webhook_url: '',
    generic_webhook_url: '',
    vapid_public_key: '',
    enabled_channels: ['email', 'in_app'],
  })

  const canManage = !!profile?.role && ['admin', 'hr_admin', 'ceo'].includes(profile.role)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('notification_channel_configs')
      .select('*')
      .eq('config_key', 'default')
      .maybeSingle()
    if (data) {
      setCfg({
        slack_webhook_url: data.slack_webhook_url || '',
        generic_webhook_url: data.generic_webhook_url || '',
        vapid_public_key: data.vapid_public_key || '',
        enabled_channels: (data.enabled_channels as Channel[]) || ['email', 'in_app'],
      })
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    const { error } = await supabase
      .from('notification_channel_configs')
      .update({
        slack_webhook_url: cfg.slack_webhook_url || null,
        generic_webhook_url: cfg.generic_webhook_url || null,
        vapid_public_key: cfg.vapid_public_key || null,
        enabled_channels: cfg.enabled_channels,
        updated_at: new Date().toISOString(),
        updated_by: profile?.id || null,
      })
      .eq('config_key', 'default')
    setSaving(false)
    if (error) { toast('저장 실패: ' + error.message, 'error'); return }
    invalidateChannelConfigCache()
    await logAudit({ action: 'update', entity: 'notification_channel_config', diff: '알림 채널 설정 갱신' })
    toast('저장 완료', 'success')
  }

  function toggleChannel(ch: Channel) {
    setCfg((prev) => ({
      ...prev,
      enabled_channels: prev.enabled_channels.includes(ch)
        ? prev.enabled_channels.filter((c) => c !== ch)
        : [...prev.enabled_channels, ch],
    }))
  }

  async function testSend(ch: Channel) {
    setTesting(ch)
    const result = await sendNotification({
      channel: ch,
      recipientUid: profile?.id,
      recipientEmail: ch === 'email' ? (profile as any)?.email : undefined,
      subject: `[테스트] ${ch} 채널 발송 확인`,
      body: `<p>이 메시지는 ${ch} 채널의 발송 테스트입니다.</p><p>받으셨다면 채널이 정상 작동 중입니다.</p>`,
      relatedEntity: { type: 'test' },
    })
    setTesting(null)
    if (result.status === 'sent') toast(`${ch} 테스트 발송 성공`, 'success')
    else toast(`${ch} 테스트 실패: ${result.error || result.status}`, 'error')
  }

  if (loading) return <PageSpinner />
  if (!canManage) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 text-center text-sm text-rose-800">
        admin/hr_admin/ceo 만 접근할 수 있습니다.
      </div>
    )
  }

  const CHANNEL_META: Record<Channel, { label: string; icon: any; desc: string }> = {
    email: { label: '이메일', icon: Mail, desc: 'SMTP 기반 (이미 운영 중)' },
    in_app: { label: '인앱 (사내 알림)', icon: Bell, desc: '헤더 종 아이콘 인박스' },
    slack: { label: 'Slack', icon: MessageSquare, desc: 'Incoming Webhook 으로 채널 전송' },
    webhook: { label: '일반 Webhook', icon: Link2, desc: '외부 시스템 (Discord/Teams/자체) JSON POST' },
    push: { label: '웹 푸시', icon: Smartphone, desc: '브라우저 알림 (VAPID 필요)' },
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bell className="h-6 w-6 text-brand-500" /> 알림 채널 설정
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          연차 촉진/52h 경고/익명신고 등 모든 알림은 여기서 활성화한 채널로 동시에 발송됩니다.
        </p>
      </div>

      {/* 채널 활성화 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">활성 채널</CardTitle>
          <p className="text-xs text-gray-500 mt-1">체크된 채널에만 발송됩니다. 채널별 URL/키는 아래 섹션에서 설정.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {(Object.keys(CHANNEL_META) as Channel[]).map((ch) => {
            const meta = CHANNEL_META[ch]
            const Icon = meta.icon
            const active = cfg.enabled_channels.includes(ch)
            return (
              <button
                key={ch}
                onClick={() => toggleChannel(ch)}
                className={`text-left p-3 rounded-lg border-2 transition ${
                  active ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${active ? 'text-brand-600' : 'text-gray-400'}`} />
                  <span className={`text-sm font-semibold ${active ? 'text-brand-700' : 'text-gray-700'}`}>{meta.label}</span>
                </div>
                <p className="text-[11px] text-gray-500 break-keep">{meta.desc}</p>
                <p className="text-[10px] mt-1 font-mono">{active ? '✓ 활성' : '비활성'}</p>
              </button>
            )
          })}
        </CardContent>
      </Card>

      {/* Slack */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Slack Incoming Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            label="Webhook URL"
            value={cfg.slack_webhook_url || ''}
            onChange={(e) => setCfg({ ...cfg, slack_webhook_url: e.target.value })}
            placeholder="https://hooks.slack.com/services/..."
          />
          <div className="flex items-center justify-between flex-wrap gap-2">
            <a
              href="https://api.slack.com/messaging/webhooks"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-brand-600 hover:underline flex items-center gap-0.5"
            >
              Slack Webhook 발급 가이드 <ExternalLink className="h-3 w-3" />
            </a>
            <Button size="sm" variant="outline" onClick={() => testSend('slack')} disabled={!cfg.slack_webhook_url || testing === 'slack'}>
              <Send className="h-3 w-3 mr-1" /> {testing === 'slack' ? '발송 중...' : '테스트 발송'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generic Webhook */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" /> 일반 Webhook (Discord/Teams/자체 시스템)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            label="Webhook URL"
            value={cfg.generic_webhook_url || ''}
            onChange={(e) => setCfg({ ...cfg, generic_webhook_url: e.target.value })}
            placeholder="https://..."
          />
          <div className="bg-gray-50 rounded p-2 text-[11px] text-gray-600 font-mono">
            POST { } JSON: subject, body, recipient_uid, recipient_email, related_entity, variables, sent_at
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => testSend('webhook')} disabled={!cfg.generic_webhook_url || testing === 'webhook'}>
              <Send className="h-3 w-3 mr-1" /> {testing === 'webhook' ? '발송 중...' : '테스트 발송'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Web Push */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4" /> 웹 푸시 (Web Push)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            label="VAPID 공개키 (Public Key)"
            value={cfg.vapid_public_key || ''}
            onChange={(e) => setCfg({ ...cfg, vapid_public_key: e.target.value })}
            placeholder="BFG6X..."
          />
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold flex items-center gap-1"><AlertCircle className="h-3 w-3" /> VAPID 키 발급/설정 방법</p>
            <ol className="ml-5 list-decimal space-y-0.5">
              <li>CLI 로 한 번만 발급: <code className="bg-white px-1 rounded">npx web-push generate-vapid-keys</code></li>
              <li><strong>공개키</strong>는 위 입력란에 저장 (브라우저 구독 시 사용)</li>
              <li><strong>비공개키</strong>는 Cloudflare Pages 환경변수에 <code className="bg-white px-1 rounded">VAPID_PRIVATE_KEY</code> 로 추가</li>
              <li>발급자 식별용 이메일도 <code className="bg-white px-1 rounded">VAPID_SUBJECT</code> 환경변수 (예: mailto:hr@interohrigin.com)</li>
              <li>설정 후 직원이 처음 접속 시 알림 권한 요청 → 허용 시 구독 등록</li>
            </ol>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => testSend('push')} disabled={!cfg.vapid_public_key || testing === 'push'}>
              <Send className="h-3 w-3 mr-1" /> {testing === 'push' ? '발송 중...' : '본인에게 테스트 푸시'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 sticky bottom-2 bg-white/80 backdrop-blur p-2 rounded-lg shadow border">
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-1" /> {saving ? '저장 중...' : '전체 설정 저장'}
        </Button>
      </div>
    </div>
  )
}
