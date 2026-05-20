/**
 * 관리자 — 연차 촉진 관리 (/admin/leave-promotion)
 *  - 미사용 잔여 + 잠재 수당 부채 + 촉진서 발송 현황
 *  - feature_rollouts.leave_promotion = true 일 때만 노출
 */
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { CalendarPlus, AlertCircle, Send, RefreshCw, Info } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { FEATURE_KEYS } from '@/types/compliance'
import { logAudit } from '@/lib/audit-logger'
import { sendNotification } from '@/lib/notification-sender'
import { formatDate } from '@/lib/utils'

interface BalanceRow {
  id: string
  employee_id: string
  remaining_days: number
  total_days: number
  used_days: number
  estimated_liability_krw: number
  snapshot_date: string
}

interface PromotionRow {
  id: string
  employee_id: string
  stage: '6m' | '2m'
  remaining_days: number
  expires_on: string
  sent_at: string
  read_at: string | null
}

export default function LeavePromotionPage() {
  const { toast } = useToast()
  const [featureOn, setFeatureOn] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [promotions, setPromotions] = useState<PromotionRow[]>([])
  const [nameMap, setNameMap] = useState<Map<string, { name: string; email: string | null }>>(new Map())
  const [sending, setSending] = useState<string | null>(null)

  useEffect(() => { isFeatureEnabled(FEATURE_KEYS.LEAVE_PROMOTION).then(setFeatureOn) }, [])

  async function load() {
    setLoading(true)
    // 최신 잔여 (각 직원별 최신 스냅샷)
    const { data: bal } = await supabase
      .from('leave_balance_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(500)
    // 최신 1건만 직원별로
    const seen = new Set<string>()
    const balLatest: BalanceRow[] = []
    for (const r of (bal || []) as BalanceRow[]) {
      if (seen.has(r.employee_id)) continue
      seen.add(r.employee_id)
      balLatest.push(r)
    }
    setBalances(balLatest)

    const { data: pr } = await supabase
      .from('annual_leave_promotions')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(100)
    setPromotions((pr || []) as PromotionRow[])

    const ids = Array.from(new Set([
      ...balLatest.map((b) => b.employee_id),
      ...(pr || []).map((p: PromotionRow) => p.employee_id),
    ]))
    if (ids.length > 0) {
      const { data: emps } = await supabase.from('employees').select('id, name, email').in('id', ids)
      const m = new Map<string, { name: string; email: string | null }>()
      ;(emps || []).forEach((e: { id: string; name: string; email: string | null }) =>
        m.set(e.id, { name: e.name, email: e.email }))
      setNameMap(m)
    }

    setLoading(false)
  }

  useEffect(() => { if (featureOn) load() }, [featureOn])

  async function runAutomation(dryRun: boolean) {
    const label = dryRun ? '시뮬레이션' : '실행'
    if (!dryRun && !confirm('연차 촉진 자동화를 지금 실행하시겠습니까?\n\n- 소멸 6개월 전 직원 → 1차 자동 발송\n- 1차 발송 후 30일+회신없음+2개월 전 → 강제 사용일 지정 통보')) return

    const { data, error } = await supabase.rpc('run_leave_promotion_automation', { p_dry_run: dryRun })
    if (error) { toast(`${label} 실패: ${error.message}`, 'error'); return }
    const rows = (data || []) as any[]
    const sent6m = rows.filter((r) => r.stage === '6m').length
    const forced2m = rows.filter((r) => r.stage === '2m').length
    toast(`${label} 완료 — 6개월 통지: ${sent6m}건 · 강제지정: ${forced2m}건`, 'success')
    if (rows.length > 0) {
      console.log('[연차 촉진 자동화]', rows)
    }
    if (!dryRun) {
      await logAudit({
        action: 'send', entity: 'leave_promotion_automation',
        diff: `자동화 실행 — 6m=${sent6m}, 2m=${forced2m}`,
      })
      load()
    }
  }

  async function snapshotAll() {
    // SECURITY DEFINER RPC 호출 — RLS 우회 + 권한 체크 서버측 처리 (마이그레이션 106)
    const { data, error } = await supabase.rpc('snapshot_all_leave_balances')
    if (error) { toast('스냅샷 실패: ' + error.message, 'error'); return }
    const result = Array.isArray(data) && data[0] ? data[0] : { employee_count: 0 }
    await logAudit({
      action: 'create', entity: 'leave_balance_snapshot',
      diff: `${result.employee_count}건 스냅샷 (RPC)`,
    })
    toast(`${result.employee_count}명 잔여 연차 스냅샷 완료`, 'success')
    load()
  }

  async function sendPromotion(b: BalanceRow, stage: '6m' | '2m') {
    setSending(b.employee_id)
    const emp = nameMap.get(b.employee_id)
    // 소멸일: 회계연도 말 (간단히 12.31)
    const expiresOn = new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10)

    // 발송 — 이메일 + 인앱 알림 동시
    let deliveryId: string | null = null
    const subject = `[연차 사용 안내] ${emp?.name || ''} 님 미사용 ${b.remaining_days}일 — ${stage === '6m' ? '6개월' : '2개월'} 전 통지`
    const body = `<p><strong>${emp?.name || ''}</strong> 님</p>
<p>현재 미사용 연차가 <strong>${b.remaining_days}일</strong> 남아 있으며, 소멸 예정일은 ${expiresOn} 입니다.</p>
<p>법정 촉진 절차에 따라 사용 예정일을 회신해 주시기 바랍니다.</p>
<p>회사 HR 시스템 &gt; <strong>내 연차 촉진 회신</strong> 메뉴에서 사용 예정일을 등록할 수 있습니다.</p>`

    // 인앱 알림 (항상 발송 — 직원이 사이트 접속 시 확인 가능)
    await sendNotification({
      channel: 'in_app',
      recipientUid: b.employee_id,
      subject,
      body,
      relatedEntity: { type: 'leave_promotion' },
    })

    // 이메일
    if (emp?.email) {
      const result = await sendNotification({
        channel: 'email',
        recipientUid: b.employee_id,
        recipientEmail: emp.email,
        subject,
        body,
        relatedEntity: { type: 'leave_promotion' },
      })
      deliveryId = result.deliveryId
    }

    const { error } = await supabase.from('annual_leave_promotions').insert({
      employee_id: b.employee_id,
      stage,
      remaining_days: b.remaining_days,
      expires_on: expiresOn,
      delivery_id: deliveryId,
    })
    setSending(null)
    if (error) { toast('이력 저장 실패: ' + error.message, 'error'); return }
    await logAudit({
      action: 'send', entity: 'leave_promotion',
      diff: `${emp?.name || ''} ${stage} 촉진서 발송 (잔여 ${b.remaining_days}일)`,
    })
    toast(`${emp?.name || ''} ${stage === '6m' ? '6개월' : '2개월'} 전 촉진서 발송 완료`, 'success')
    load()
  }

  if (featureOn === null || loading) return <PageSpinner />

  if (!featureOn) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-amber-800">연차 촉진 자동화 비활성 상태</h2>
        <p className="text-sm text-amber-700 mt-1">시스템 관리 &gt; 기능 토글에서 활성화 후 사용하세요.</p>
      </div>
    )
  }

  const liability = balances.reduce((s, b) => s + (b.estimated_liability_krw || 0), 0)
  const totalRemaining = balances.reduce((s, b) => s + (b.remaining_days || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarPlus className="h-6 w-6 text-brand-500" /> 연차 촉진 관리
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            미사용 연차 현황 + 잠재 수당 부채 + 촉진서 발송
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={snapshotAll}>
            <RefreshCw className="h-4 w-4 mr-1" /> 잔여 연차 스냅샷
          </Button>
          <Button variant="outline" size="sm" onClick={() => runAutomation(true)}>
            자동화 미리보기 (dry-run)
          </Button>
          <Button size="sm" onClick={() => runAutomation(false)}>
            지금 자동화 실행
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="대상 인원" value={`${balances.length}명`} />
        <SummaryCard label="총 미사용일" value={`${totalRemaining.toFixed(1)}일`} />
        <SummaryCard label="잠재 수당 (추정)" value={`${liability.toLocaleString()}원`} highlight />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">직원별 잔여 연차</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-gray-600">
                  <th className="text-left px-3 py-2 font-semibold">직원</th>
                  <th className="text-center px-3 py-2 font-semibold">총 / 사용 / 잔여</th>
                  <th className="text-center px-3 py-2 font-semibold">잠재 수당</th>
                  <th className="text-right px-3 py-2 font-semibold">촉진</th>
                </tr>
              </thead>
              <tbody>
                {balances.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-gray-400 py-8">스냅샷 없음 — '잔여 연차 스냅샷' 실행</td></tr>
                )}
                {balances.map((b) => {
                  const emp = nameMap.get(b.employee_id)
                  return (
                    <tr key={b.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">{emp?.name || '—'}</td>
                      <td className="px-3 py-2 text-center text-gray-600 text-xs">
                        {b.total_days} / {b.used_days} / <strong className="text-gray-900">{b.remaining_days}</strong>일
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">
                        {(b.estimated_liability_krw || 0).toLocaleString()}원
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" className="mr-1"
                          onClick={() => sendPromotion(b, '6m')} disabled={sending === b.employee_id}>
                          <Send className="h-3 w-3 mr-0.5" /> 6개월 전
                        </Button>
                        <Button size="sm"
                          onClick={() => sendPromotion(b, '2m')} disabled={sending === b.employee_id}>
                          <Send className="h-3 w-3 mr-0.5" /> 2개월 전
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">발송 이력 ({promotions.length}건)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-gray-600">
                  <th className="text-left px-3 py-2 font-semibold">직원</th>
                  <th className="text-center px-3 py-2 font-semibold">단계</th>
                  <th className="text-center px-3 py-2 font-semibold">잔여 (당시)</th>
                  <th className="text-left px-3 py-2 font-semibold">발송일</th>
                  <th className="text-center px-3 py-2 font-semibold">열람</th>
                </tr>
              </thead>
              <tbody>
                {promotions.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-8">발송 이력 없음</td></tr>
                )}
                {promotions.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="px-3 py-2 text-gray-700">{nameMap.get(p.employee_id)?.name || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={p.stage === '6m' ? 'info' : 'warning'}>{p.stage === '6m' ? '6개월 전' : '2개월 전'}</Badge>
                    </td>
                    <td className="px-3 py-2 text-center text-gray-600">{p.remaining_days}일</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{formatDate(p.sent_at, 'yyyy.MM.dd HH:mm')}</td>
                    <td className="px-3 py-2 text-center">
                      {p.read_at
                        ? <Badge variant="success">열람</Badge>
                        : <Badge variant="default">미열람</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-start gap-2">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          잠재 수당 추정은 <strong>월 기본급 / 209 × 8 × 잔여일</strong> 공식으로 계산한 <strong>참고치</strong>입니다. 실제 지급액은 별도 계산 필요.
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-white border-gray-200 text-gray-700'}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  )
}
