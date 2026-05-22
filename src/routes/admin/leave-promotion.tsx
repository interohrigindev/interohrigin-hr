/**
 * 관리자 — 연차 촉진 관리 (/admin/leave-promotion)
 *  - 미사용 잔여 + 잠재 수당 부채 + 촉진서 발송 현황
 *  - feature_rollouts.leave_promotion = true 일 때만 노출
 */
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { CalendarPlus, AlertCircle, Send, RefreshCw, Info, FileSignature, ExternalLink } from 'lucide-react'
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

interface WaiverRow {
  id: string
  employee_id: string
  waiver_year: number
  waiver_days: number
  status: 'pending_signature' | 'signed' | 'revoked'
  payout_status: 'pending' | 'waived' | 'partial' | 'revoked'
  signed_at: string | null
  created_at: string
}

const DEFAULT_WAIVER_TEMPLATE = (name: string, year: number, days: number) => `
<h3>${year}년 미사용 연차 포기 각서</h3>
<p><strong>${name}</strong> 는(은) 회사가 시행한 「근로기준법」 제61조에 따른 연차 사용 촉진 절차에 따라
${year}년도 미사용 연차 <strong>${days}일</strong> 에 대하여 사용 의사가 없음을 확인하며,
해당 연차 일수에 대한 연차 수당 청구권을 자발적으로 포기함을 서약합니다.</p>
<p>본 각서는 노무 분쟁 시 증빙으로 활용될 수 있으며, 본인은 위 내용을 충분히 숙지하고
자유로운 의사로 서명함을 확인합니다.</p>
`.trim()

export default function LeavePromotionPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const [featureOn, setFeatureOn] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [promotions, setPromotions] = useState<PromotionRow[]>([])
  const [waivers, setWaivers] = useState<WaiverRow[]>([])
  const [nameMap, setNameMap] = useState<Map<string, { name: string; email: string | null }>>(new Map())
  const [sending, setSending] = useState<string | null>(null)

  // 포기 각서 발급 다이얼로그
  const [waiverDialog, setWaiverDialog] = useState<{ employee_id: string; remaining_days: number } | null>(null)
  const [waiverYear, setWaiverYear] = useState<number>(new Date().getFullYear())
  const [waiverDays, setWaiverDays] = useState<string>('')
  const [waiverText, setWaiverText] = useState<string>('')
  const [issuingWaiver, setIssuingWaiver] = useState(false)

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

    const { data: wv } = await supabase
      .from('leave_waivers')
      .select('id, employee_id, waiver_year, waiver_days, status, payout_status, signed_at, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
    setWaivers((wv || []) as WaiverRow[])

    const ids = Array.from(new Set([
      ...balLatest.map((b) => b.employee_id),
      ...(pr || []).map((p: PromotionRow) => p.employee_id),
      ...(wv || []).map((w: WaiverRow) => w.employee_id),
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

  // ─── 포기 각서 발급 ───
  function openWaiverDialog(b: BalanceRow) {
    const emp = nameMap.get(b.employee_id)
    setWaiverDialog({ employee_id: b.employee_id, remaining_days: b.remaining_days })
    setWaiverYear(new Date().getFullYear())
    setWaiverDays(String(b.remaining_days))
    setWaiverText(DEFAULT_WAIVER_TEMPLATE(emp?.name || '', new Date().getFullYear(), b.remaining_days))
  }

  function closeWaiverDialog() {
    setWaiverDialog(null)
    setWaiverDays('')
    setWaiverText('')
  }

  async function issueWaiver() {
    if (!waiverDialog || !profile?.id) return
    const daysNum = parseFloat(waiverDays)
    if (!daysNum || daysNum <= 0) { toast('포기 일수를 정확히 입력하세요.', 'error'); return }
    if (!waiverText.trim()) { toast('각서 본문을 입력하세요.', 'error'); return }

    setIssuingWaiver(true)
    const emp = nameMap.get(waiverDialog.employee_id)

    // 1) leave_waivers insert
    const { data: created, error } = await supabase.from('leave_waivers').insert({
      employee_id: waiverDialog.employee_id,
      waiver_year: waiverYear,
      waiver_days: daysNum,
      waiver_text: waiverText,
      created_by: profile.id,
    }).select('id').single()

    if (error || !created) {
      setIssuingWaiver(false)
      toast(`발급 실패: ${error?.message || '알 수 없는 오류'}`, 'error')
      return
    }

    // 2) 직원에게 알림 (인앱 + 이메일)
    const subject = `[연차 포기 각서 서명 요청] ${waiverYear}년 ${daysNum}일`
    const signUrl = `/my/leave-waiver/${created.id}`
    const body = `<p><strong>${emp?.name || ''}</strong> 님</p>
<p>${waiverYear}년 미사용 연차 <strong>${daysNum}일</strong>에 대한 포기 각서가 발급되었습니다.</p>
<p>아래 링크에서 내용을 확인하시고 전자서명을 완료해주세요.</p>
<p><a href="${signUrl}">각서 확인 및 서명하기</a></p>`

    await sendNotification({
      channel: 'in_app',
      recipientUid: waiverDialog.employee_id,
      subject,
      body,
      relatedEntity: { type: 'leave_waiver' },
    })

    if (emp?.email) {
      await sendNotification({
        channel: 'email',
        recipientUid: waiverDialog.employee_id,
        recipientEmail: emp.email,
        subject,
        body,
        relatedEntity: { type: 'leave_waiver' },
      })
    }

    await logAudit({
      action: 'create',
      entity: 'leave_waiver',
      diff: `${emp?.name || ''} ${waiverYear}년 ${daysNum}일 포기 각서 발급`,
    })

    setIssuingWaiver(false)
    toast(`${emp?.name || ''} 님에게 포기 각서 서명 요청을 발송했습니다.`, 'success')
    closeWaiverDialog()
    load()
  }

  async function updatePayoutStatus(id: string, payoutStatus: 'waived' | 'partial' | 'revoked') {
    const { error } = await supabase.from('leave_waivers').update({ payout_status: payoutStatus }).eq('id', id)
    if (error) { toast(`상태 변경 실패: ${error.message}`, 'error'); return }
    await logAudit({ action: 'update', entity: 'leave_waiver', diff: `payout_status=${payoutStatus}` })
    toast('처리 상태가 변경되었습니다.', 'success')
    load()
  }

  async function revokeWaiver(id: string) {
    if (!confirm('이 각서를 취소(무효) 처리하시겠습니까?\n취소 후에는 직원이 서명할 수 없습니다.')) return
    const { error } = await supabase.from('leave_waivers').update({ status: 'revoked', payout_status: 'revoked' }).eq('id', id)
    if (error) { toast(`취소 실패: ${error.message}`, 'error'); return }
    await logAudit({ action: 'update', entity: 'leave_waiver', diff: '취소 처리' })
    toast('각서가 취소되었습니다.', 'success')
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
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button size="sm" variant="outline"
                            onClick={() => sendPromotion(b, '6m')} disabled={sending === b.employee_id}>
                            <Send className="h-3 w-3 mr-0.5" /> 6개월 전
                          </Button>
                          <Button size="sm"
                            onClick={() => sendPromotion(b, '2m')} disabled={sending === b.employee_id}>
                            <Send className="h-3 w-3 mr-0.5" /> 2개월 전
                          </Button>
                          <Button size="sm" variant="outline"
                            onClick={() => openWaiverDialog(b)}
                            disabled={b.remaining_days <= 0}>
                            <FileSignature className="h-3 w-3 mr-0.5" /> 포기 각서
                          </Button>
                        </div>
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-brand-500" />
            연차 포기 각서 ({waivers.length}건)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-gray-600">
                  <th className="text-left px-3 py-2 font-semibold">직원</th>
                  <th className="text-center px-3 py-2 font-semibold">연도</th>
                  <th className="text-center px-3 py-2 font-semibold">포기일수</th>
                  <th className="text-center px-3 py-2 font-semibold">서명 상태</th>
                  <th className="text-center px-3 py-2 font-semibold">수당 처리</th>
                  <th className="text-right px-3 py-2 font-semibold">관리</th>
                </tr>
              </thead>
              <tbody>
                {waivers.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-8">발급된 각서 없음 — 위 표에서 '포기 각서' 발급</td></tr>
                )}
                {waivers.map((w) => (
                  <tr key={w.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{nameMap.get(w.employee_id)?.name || '—'}</td>
                    <td className="px-3 py-2 text-center text-gray-600">{w.waiver_year}년</td>
                    <td className="px-3 py-2 text-center text-gray-900 font-semibold">{w.waiver_days}일</td>
                    <td className="px-3 py-2 text-center">
                      {w.status === 'signed' && <Badge variant="success">서명 완료</Badge>}
                      {w.status === 'pending_signature' && <Badge variant="warning">서명 대기</Badge>}
                      {w.status === 'revoked' && <Badge variant="default">취소됨</Badge>}
                      {w.signed_at && (
                        <div className="text-[10px] text-gray-500 mt-0.5">{formatDate(w.signed_at, 'yyyy.MM.dd HH:mm')}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {w.payout_status === 'pending' && <Badge variant="default">대기</Badge>}
                      {w.payout_status === 'waived' && <Badge variant="success">미지급 확정</Badge>}
                      {w.payout_status === 'partial' && <Badge variant="warning">일부 지급</Badge>}
                      {w.payout_status === 'revoked' && <Badge variant="default">취소</Badge>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => window.open(`/my/leave-waiver/${w.id}`, '_blank')}>
                          <ExternalLink className="h-3 w-3 mr-0.5" /> 보기
                        </Button>
                        {w.status === 'signed' && w.payout_status === 'pending' && (
                          <Button size="sm" variant="outline"
                            onClick={() => updatePayoutStatus(w.id, 'waived')}>
                            미지급 확정
                          </Button>
                        )}
                        {w.status !== 'revoked' && (
                          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700"
                            onClick={() => revokeWaiver(w.id)}>
                            취소
                          </Button>
                        )}
                      </div>
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

      {/* 포기 각서 발급 다이얼로그 */}
      <Dialog
        open={!!waiverDialog}
        onClose={closeWaiverDialog}
        title="연차 포기 각서 발급"
      >
        {waiverDialog && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
              <strong>{nameMap.get(waiverDialog.employee_id)?.name || ''}</strong> 님에게 발급합니다.
              발급 후 직원이 전자서명을 완료해야 효력이 발생합니다.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700">대상 연도</label>
                <Input
                  type="number"
                  value={waiverYear}
                  onChange={(e) => setWaiverYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">포기 일수</label>
                <Input
                  type="number"
                  step="0.5"
                  value={waiverDays}
                  onChange={(e) => setWaiverDays(e.target.value)}
                  placeholder="예: 3"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700">각서 본문 (HTML)</label>
              <Textarea
                rows={10}
                value={waiverText}
                onChange={(e) => setWaiverText(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                기본 템플릿이 자동 채워졌습니다. 회사 사정에 맞게 수정 후 발급하세요.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={closeWaiverDialog} disabled={issuingWaiver}>취소</Button>
              <Button onClick={issueWaiver} disabled={issuingWaiver}>
                <FileSignature className="h-4 w-4 mr-1" />
                {issuingWaiver ? '발급 중...' : '발급 및 서명 요청'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
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
