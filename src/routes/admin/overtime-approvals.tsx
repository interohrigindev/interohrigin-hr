/**
 * 관리자 — 연장근로 승인 관리 (/admin/overtime)
 *  - 대기 신청 처리 + 전체 이력 + 검토 필요 항목 (편차 큼/무승인)
 *  - 권한: 리더 이상
 *  - feature_rollouts.overtime_approval = true 일 때만 노출
 */
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Clock, RefreshCw, AlertCircle, Check, X } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { FEATURE_KEYS } from '@/types/compliance'
import { decideOvertime } from '@/lib/overtime-client'
import type { OvertimeRequestRow, OvertimeActualRow } from '@/types/overtime'
import { STATUS_LABELS } from '@/types/overtime'
import { formatDate } from '@/lib/utils'

type Tab = 'pending' | 'approved' | 'review'

export default function OvertimeApprovalsPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [featureOn, setFeatureOn] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('pending')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<OvertimeRequestRow[]>([])
  const [actualRows, setActualRows] = useState<OvertimeActualRow[]>([])
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map())
  const [processingId, setProcessingId] = useState<string | null>(null)

  const isAuthorized = !!profile?.role && ['admin','hr_admin','ceo','director','division_head','executive','leader'].includes(profile.role)

  useEffect(() => {
    isFeatureEnabled(FEATURE_KEYS.OVERTIME_APPROVAL).then(setFeatureOn)
  }, [])

  async function load() {
    setLoading(true)
    if (tab === 'review') {
      const { data } = await supabase
        .from('overtime_actuals')
        .select('*')
        .eq('needs_review', true)
        .eq('review_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100)
      setActualRows((data || []) as OvertimeActualRow[])
      setRows([])
      await fillNames((data || []).map((r: { employee_uid: string }) => r.employee_uid))
    } else {
      const status = tab === 'pending' ? 'pending' : 'approved'
      const { data } = await supabase
        .from('overtime_requests')
        .select('*')
        .eq('status', status)
        .order('request_date', { ascending: false })
        .limit(100)
      setRows((data || []) as OvertimeRequestRow[])
      setActualRows([])
      await fillNames((data || []).map((r: { requester_uid: string }) => r.requester_uid))
    }
    setLoading(false)
  }

  async function fillNames(ids: string[]) {
    const uniq = Array.from(new Set(ids.filter(Boolean)))
    if (uniq.length === 0) return
    const { data } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', uniq)
    const m = new Map(nameMap)
    ;(data || []).forEach((e: { id: string; name: string }) => m.set(e.id, e.name))
    setNameMap(m)
  }

  useEffect(() => { load() }, [tab])

  async function handleDecide(row: OvertimeRequestRow, decision: 'approved' | 'rejected') {
    const comment = decision === 'rejected' ? prompt('반려 사유 (선택):') ?? '' : ''
    if (decision === 'rejected' && !confirm(`${nameMap.get(row.requester_uid) || ''} 신청을 반려하시겠습니까?`)) return
    setProcessingId(row.id)
    const result = await decideOvertime({ requestId: row.id, decision, comment: comment || undefined })
    setProcessingId(null)
    if (result.error) {
      toast(`처리 실패: ${result.error}`, 'error')
      return
    }
    toast(`${decision === 'approved' ? '승인' : '반려'} 처리 완료`, 'success')
    load()
  }

  if (featureOn === null || loading) return <PageSpinner />

  if (!featureOn) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-amber-800">연장근로 사전 승인제 비활성 상태</h2>
        <p className="text-sm text-amber-700 mt-1">시스템 관리 &gt; 기능 토글에서 활성화 후 사용하세요.</p>
      </div>
    )
  }

  if (!isAuthorized) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 text-center text-sm text-rose-800">
        승인 권한이 없습니다. (리더 이상)
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="h-6 w-6 text-brand-500" /> 연장근로 승인 관리
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            직원이 사전에 신청한 연장근로를 승인 / 반려하고 무승인 케이스를 검토합니다.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1" /> 새로고침
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        {(
          [
            { key: 'pending' as Tab, label: '승인 대기' },
            { key: 'approved' as Tab, label: '승인됨' },
            { key: 'review'   as Tab, label: '검토 필요' },
          ]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key ? 'text-brand-700 border-brand-500' : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'review' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{tab === 'pending' ? '승인 대기' : '승인 완료'} ({rows.length}건)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-gray-600">
                    <th className="text-left px-3 py-2 font-semibold">신청자</th>
                    <th className="text-left px-3 py-2 font-semibold">일자</th>
                    <th className="text-left px-3 py-2 font-semibold">예정 시각</th>
                    <th className="text-center px-3 py-2 font-semibold">시간</th>
                    <th className="text-left px-3 py-2 font-semibold">사유</th>
                    <th className="text-center px-3 py-2 font-semibold">상태</th>
                    <th className="text-right px-3 py-2 font-semibold">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-gray-400 py-8">{tab === 'pending' ? '대기 중인 신청 없음' : '승인된 신청 없음'}</td></tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">{nameMap.get(r.requester_uid) || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{formatDate(r.request_date, 'yyyy.MM.dd')}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{formatDate(r.start_at_planned, 'HH:mm')} – {formatDate(r.end_at_planned, 'HH:mm')}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{Math.round(r.expected_minutes / 6) / 10}h</td>
                      <td className="px-3 py-2 text-gray-700 text-xs break-keep max-w-md">{r.reason}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={r.status === 'approved' ? 'success' : 'warning'}>{STATUS_LABELS[r.status]}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {r.status === 'pending' && (
                          <>
                            <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300 mr-1"
                              onClick={() => handleDecide(r, 'approved')} disabled={processingId === r.id}>
                              <Check className="h-3 w-3 mr-0.5" /> 승인
                            </Button>
                            <Button size="sm" variant="outline" className="text-rose-600 border-rose-300"
                              onClick={() => handleDecide(r, 'rejected')} disabled={processingId === r.id}>
                              <X className="h-3 w-3 mr-0.5" /> 반려
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'review' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">검토 필요 ({actualRows.length}건)</CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              무승인 야근 또는 승인 종료 시각 대비 편차가 큰 케이스. 관리자 검토 후 처리해주세요.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-gray-600">
                    <th className="text-left px-3 py-2 font-semibold">직원</th>
                    <th className="text-left px-3 py-2 font-semibold">실제 시각</th>
                    <th className="text-center px-3 py-2 font-semibold">분</th>
                    <th className="text-center px-3 py-2 font-semibold">편차</th>
                    <th className="text-left px-3 py-2 font-semibold">유형</th>
                    <th className="text-left px-3 py-2 font-semibold">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {actualRows.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-gray-400 py-8">검토 필요 항목 없음</td></tr>
                  )}
                  {actualRows.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">{nameMap.get(r.employee_uid) || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">
                        {formatDate(r.actual_start_at, 'yyyy.MM.dd HH:mm')} – {formatDate(r.actual_end_at, 'HH:mm')}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">{r.actual_minutes}</td>
                      <td className="px-3 py-2 text-center text-amber-700 font-semibold">
                        {r.deviation_minutes != null ? `${r.deviation_minutes > 0 ? '+' : ''}${r.deviation_minutes}분` : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">
                        {r.request_id ? '편차 큼' : '무승인 야근'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 text-xs break-keep">{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
