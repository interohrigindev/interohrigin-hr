/**
 * 내 연장근로 신청 — /my/overtime
 *  - 직원이 야근 사전 신청 + 본인 신청 이력 + 실제 종료기록 입력
 *  - feature_rollouts.overtime_approval = true 일 때만 라우트 노출 (Sidebar 측)
 */
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Clock, Plus, X, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { FEATURE_KEYS } from '@/types/compliance'
import { requestOvertime, cancelOvertimeRequest, recordOvertimeActual } from '@/lib/overtime-client'
import type { OvertimeRequestRow } from '@/types/overtime'
import { STATUS_LABELS } from '@/types/overtime'
import { formatDate } from '@/lib/utils'

export default function MyOvertimePage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [featureOn, setFeatureOn] = useState<boolean | null>(null)
  const [rows, setRows] = useState<OvertimeRequestRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actualForId, setActualForId] = useState<string | null>(null)

  // 폼 상태
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    startTime: '18:00',
    endTime: '21:00',
    reason: '',
  })
  // 실제 종료기록 폼
  const [actualForm, setActualForm] = useState({
    startAt: '',
    endAt: '',
    notes: '',
  })

  useEffect(() => {
    isFeatureEnabled(FEATURE_KEYS.OVERTIME_APPROVAL).then(setFeatureOn)
  }, [])

  async function load() {
    if (!profile?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('overtime_requests')
      .select('*')
      .eq('requester_uid', profile.id)
      .order('request_date', { ascending: false })
      .limit(50)
    setRows((data || []) as OvertimeRequestRow[])
    setLoading(false)
  }
  useEffect(() => { load() }, [profile?.id])

  async function handleSubmit() {
    if (!form.reason.trim() || form.reason.trim().length < 5) {
      toast('사유를 5자 이상 입력해주세요.', 'error')
      return
    }
    const startAt = new Date(`${form.date}T${form.startTime}:00`).toISOString()
    const endAt = new Date(`${form.date}T${form.endTime}:00`).toISOString()
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      toast('종료 시각은 시작 시각 이후여야 합니다.', 'error')
      return
    }
    setSubmitting(true)
    const result = await requestOvertime({
      requestDate: form.date,
      startAtPlanned: startAt,
      endAtPlanned: endAt,
      reason: form.reason.trim(),
    })
    setSubmitting(false)
    if (result.error) {
      toast(`신청 실패: ${result.error}`, 'error')
      return
    }
    toast('연장근로 사전 신청이 접수되었습니다. 관리자 승인을 기다려주세요.', 'success')
    setShowForm(false)
    setForm({ date: new Date().toISOString().slice(0, 10), startTime: '18:00', endTime: '21:00', reason: '' })
    load()
  }

  async function handleCancel(row: OvertimeRequestRow) {
    const reason = prompt(`신청을 취소합니다. 사유:`)
    if (!reason) return
    const result = await cancelOvertimeRequest({ requestId: row.id, reason })
    if (result.error) {
      toast(`취소 실패: ${result.error}`, 'error')
      return
    }
    toast('신청이 취소되었습니다.', 'success')
    load()
  }

  async function handleRecordActual() {
    if (!actualForId) return
    const startIso = new Date(actualForm.startAt).toISOString()
    const endIso = new Date(actualForm.endAt).toISOString()
    const result = await recordOvertimeActual({
      requestId: actualForId,
      actualStartAt: startIso,
      actualEndAt: endIso,
      notes: actualForm.notes || undefined,
    })
    if (result.error) {
      toast(`기록 실패: ${result.error}`, 'error')
      return
    }
    toast('실제 종료 기록이 저장되었습니다.', 'success')
    setActualForId(null)
    setActualForm({ startAt: '', endAt: '', notes: '' })
    load()
  }

  if (featureOn === null || loading) return <PageSpinner />

  if (!featureOn) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-amber-800">연장근로 사전 승인제 비활성 상태</h2>
        <p className="text-sm text-amber-700 mt-1">관리자에게 활성화를 요청하세요.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="h-6 w-6 text-brand-500" /> 내 연장근로
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            야근은 사전 승인을 받아야 정식 근무로 인정됩니다.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" /> 새로고침
          </Button>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4 mr-1" /> 사전 신청
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">연장근로 사전 신청</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">날짜</label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">시작 시각</label>
                <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">종료 시각</label>
                <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">사유 (필수, 5자 이상)</label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="예) 월말 결산 마감, 긴급 장애 대응 등 구체적으로 작성"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>취소</Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                {submitting ? '신청 중...' : '신청'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">내 신청 이력 ({rows.length}건)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-gray-600">
                  <th className="text-left px-3 py-2 font-semibold">일자</th>
                  <th className="text-left px-3 py-2 font-semibold">예정 시각</th>
                  <th className="text-center px-3 py-2 font-semibold">시간</th>
                  <th className="text-center px-3 py-2 font-semibold">상태</th>
                  <th className="text-left px-3 py-2 font-semibold">사유 / 코멘트</th>
                  <th className="text-right px-3 py-2 font-semibold">액션</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-8">신청 이력 없음</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{formatDate(r.request_date, 'yyyy.MM.dd')}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {formatDate(r.start_at_planned, 'HH:mm')} – {formatDate(r.end_at_planned, 'HH:mm')}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-600">{Math.round(r.expected_minutes / 6) / 10}h</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={
                        r.status === 'approved' ? 'success' :
                        r.status === 'rejected' ? 'danger' :
                        r.status === 'cancelled' ? 'default' : 'warning'
                      }>
                        {STATUS_LABELS[r.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-xs break-keep">
                      <div>{r.reason}</div>
                      {r.approver_comment && (
                        <div className="text-gray-500 mt-0.5">↳ {r.approver_comment}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.status === 'pending' && (
                        <Button size="sm" variant="outline" onClick={() => handleCancel(r)}>
                          <X className="h-3 w-3 mr-0.5" /> 취소
                        </Button>
                      )}
                      {r.status === 'approved' && (
                        <Button size="sm" variant="outline" onClick={() => {
                          setActualForId(r.id)
                          setActualForm({
                            startAt: r.start_at_planned.slice(0, 16),
                            endAt: r.end_at_planned.slice(0, 16),
                            notes: '',
                          })
                        }}>
                          <CheckCircle2 className="h-3 w-3 mr-0.5" /> 실제 종료기록
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {actualForId && (
        <Card className="border-brand-300">
          <CardHeader>
            <CardTitle className="text-base">실제 종료 기록</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">
              승인 시각 대비 편차가 큰 경우(기본 30분 이상) 관리자 검토 대상으로 자동 분류됩니다.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">실제 시작</label>
                <Input type="datetime-local" value={actualForm.startAt} onChange={(e) => setActualForm({ ...actualForm, startAt: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">실제 종료</label>
                <Input type="datetime-local" value={actualForm.endAt} onChange={(e) => setActualForm({ ...actualForm, endAt: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">참고 메모 (선택)</label>
              <Textarea value={actualForm.notes} onChange={(e) => setActualForm({ ...actualForm, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setActualForId(null)}>취소</Button>
              <Button size="sm" onClick={handleRecordActual}>저장</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
