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
import { Bell, Send, AlertCircle, ExternalLink, Save, MessageSquare, Link2, Smartphone, Mail, MessageCircle, RefreshCw, BookOpen } from 'lucide-react'
import { sendNotification, invalidateChannelConfigCache } from '@/lib/notification-sender'
import { logAudit } from '@/lib/audit-logger'

// PDCA #6 Phase 7 — kakao_work 추가
type Channel = 'email' | 'in_app' | 'slack' | 'webhook' | 'push' | 'kakao_work'

interface ChannelConfig {
  slack_webhook_url: string | null
  generic_webhook_url: string | null
  vapid_public_key: string | null
  enabled_channels: Channel[]
  // KakaoWork (Phase 7)
  kakaowork_app_key: string | null
  kakaowork_bot_name: string | null
  kakaowork_enabled: boolean
}

interface KakaoSyncResult {
  total: number
  matched: number
  failed: number
  failedList: Array<{ employee_id: string; email: string; name: string | null; reason: string }>
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
    kakaowork_app_key: '',
    kakaowork_bot_name: '',
    kakaowork_enabled: false,
  })
  // KakaoWork 동기화 상태
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<KakaoSyncResult | null>(null)

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
        kakaowork_app_key: (data as any).kakaowork_app_key || '',
        kakaowork_bot_name: (data as any).kakaowork_bot_name || '',
        kakaowork_enabled: !!(data as any).kakaowork_enabled,
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
        kakaowork_app_key: cfg.kakaowork_app_key || null,
        kakaowork_bot_name: cfg.kakaowork_bot_name || null,
        kakaowork_enabled: cfg.kakaowork_enabled,
        updated_at: new Date().toISOString(),
        updated_by: profile?.id || null,
      } as any)
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
    kakao_work: { label: '카카오워크', icon: MessageCircle, desc: '결재자 1:1 DM (Bot Token 필요)' },
  }

  async function runKakaoSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      // Supabase JWT 를 그대로 사용 (관리자 인증)
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) { toast('세션 없음 — 다시 로그인하세요', 'error'); setSyncing(false); return }
      const res = await fetch('/api/kakaowork-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast(`동기화 실패: ${json?.error || res.status}`, 'error'); setSyncing(false); return }
      setSyncResult(json as KakaoSyncResult)
      toast(`매핑 완료 — ${json.matched}/${json.total}명 매칭, ${json.failed}명 실패`, 'success')
    } catch (err: any) {
      toast(`동기화 오류: ${err?.message || '알 수 없음'}`, 'error')
    }
    setSyncing(false)
  }

  async function testKakao() {
    setTesting('kakao_work')
    const result = await sendNotification({
      channel: 'kakao_work',
      recipientUid: profile?.id,
      subject: '[테스트] 카카오워크 연동 확인',
      body: '카카오워크 연동이 정상 작동 중입니다. 결재 알림이 이 채널로 전달됩니다.',
      relatedEntity: { type: 'test' },
    })
    setTesting(null)
    if (result.status === 'sent') toast('카카오워크 테스트 발송 성공 — 카카오워크 앱에서 확인하세요', 'success')
    else if (result.status === 'skipped') toast(`카카오워크 skip: ${result.error || '미설정/미매핑'} (먼저 토큰 입력 + 매핑 동기화 실행)`, 'error')
    else toast(`카카오워크 테스트 실패: ${result.error || result.status}`, 'error')
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
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
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

      {/* KakaoWork — PDCA #6 Phase 7 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> 카카오워크 (KakaoWork)
            <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${cfg.kakaowork_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {cfg.kakaowork_enabled ? '활성' : '비활성'}
            </span>
          </CardTitle>
          <p className="text-xs text-gray-500 mt-1">결재자에게 카카오워크 봇이 1:1 DM 발송. 토큰 입력 + 매핑 동기화 1회로 즉시 활성화.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 활성화 토글 */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cfg.kakaowork_enabled}
              onChange={(e) => setCfg({ ...cfg, kakaowork_enabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="font-medium">카카오워크 채널 활성화</span>
            <span className="text-xs text-gray-500">— OFF 면 다른 3채널(in_app/push/email)만 발송</span>
          </label>

          <Input
            label="Bot Access Token (App Key) — Bearer 토큰"
            type="password"
            value={cfg.kakaowork_app_key || ''}
            onChange={(e) => setCfg({ ...cfg, kakaowork_app_key: e.target.value })}
            placeholder="발급받은 Bot Access Token 입력 (시크릿 — 저장 시 마스킹)"
          />
          <Input
            label="봇 표시 이름 (참고용)"
            value={cfg.kakaowork_bot_name || ''}
            onChange={(e) => setCfg({ ...cfg, kakaowork_bot_name: e.target.value })}
            placeholder="예: HR결재봇"
          />

          {/* 안내 */}
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold flex items-center gap-1"><AlertCircle className="h-3 w-3" /> 카카오워크 연동 절차</p>
            <ol className="ml-5 list-decimal space-y-0.5">
              <li>카카오워크 관리자 콘솔 → 봇 생성 → <strong>App Key (Access Token)</strong> 발급</li>
              <li>위 입력란에 토큰 붙여넣기 + "활성화" 체크 → <strong>전체 설정 저장</strong></li>
              <li>아래 <strong>매핑 동기화</strong> 클릭 → 직원 이메일 → 카카오워크 user_id 자동 매칭</li>
              <li>매핑 실패 직원은 카카오워크 가입 이메일이 HR 시스템과 다른 경우 → 수동 처리 필요</li>
              <li>본인 카카오워크로 테스트 발송 → 정상 수신 확인</li>
            </ol>
            <p className="mt-2">
              <a href="/docs/카카오워크-연동-매뉴얼.md" target="_blank" rel="noreferrer" className="text-amber-900 underline inline-flex items-center gap-0.5">
                <BookOpen className="h-3 w-3" /> 상세 매뉴얼 보기
              </a>
            </p>
          </div>

          {/* 매핑 동기화 */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={runKakaoSync}
              disabled={!cfg.kakaowork_app_key || !cfg.kakaowork_enabled || syncing}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '동기화 중...' : '이메일 매핑 동기화'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={testKakao}
              disabled={!cfg.kakaowork_app_key || !cfg.kakaowork_enabled || testing === 'kakao_work'}
            >
              <Send className="h-3 w-3 mr-1" /> {testing === 'kakao_work' ? '발송 중...' : '본인에게 테스트 발송'}
            </Button>
          </div>

          {/* 동기화 결과 */}
          {syncResult && (
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded p-3 text-xs">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-semibold text-gray-700">동기화 결과</span>
                <span className="text-emerald-700">✓ 매칭 {syncResult.matched}</span>
                <span className="text-rose-700">✗ 실패 {syncResult.failed}</span>
                <span className="text-gray-500">총 {syncResult.total}명</span>
              </div>
              {syncResult.failedList.length > 0 && (
                <details className="text-gray-600">
                  <summary className="cursor-pointer font-medium">실패 직원 목록 (이메일이 카카오워크 가입과 다른 경우)</summary>
                  <ul className="mt-2 ml-4 list-disc space-y-0.5">
                    {syncResult.failedList.slice(0, 30).map((f) => (
                      <li key={f.employee_id}>
                        <span className="font-medium">{f.name || '(이름없음)'}</span>{' '}
                        <span className="font-mono text-[10px]">{f.email}</span>{' '}
                        <span className="text-rose-600">— {f.reason}</span>
                      </li>
                    ))}
                    {syncResult.failedList.length > 30 && (
                      <li className="text-gray-400">... 외 {syncResult.failedList.length - 30}명</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          )}
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
