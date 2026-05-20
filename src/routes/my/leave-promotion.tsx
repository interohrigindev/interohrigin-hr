/**
 * 내 연차 촉진 회신 — /my/leave-promotion
 *  - 본인이 받은 6개월/2개월 전 촉진 통지 조회
 *  - 사용 예정일(다중) 입력 후 제출 → respond_leave_promotion RPC
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
import { CalendarCheck, AlertTriangle, Check, Plus, X } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface PromotionRow {
  promotion_id: string
  stage: '6m' | '2m'
  remaining_days: number
  expires_on: string
  sent_at: string
  has_responded: boolean
  response_id: string | null
  planned_dates: string[]
  notes: string | null
}

export default function MyLeavePromotionPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [rows, setRows] = useState<PromotionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dates, setDates] = useState<string[]>([''])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.rpc('list_my_leave_promotions')
    if (error) toast('조회 실패: ' + error.message, 'error')
    setRows((data || []) as PromotionRow[])
    setLoading(false)
  }
  useEffect(() => { if (profile?.id) load() }, [profile?.id])

  function startResponse(row: PromotionRow) {
    setActiveId(row.promotion_id)
    setDates(row.planned_dates.length > 0 ? row.planned_dates : [''])
    setNotes(row.notes || '')
  }

  function addDate() { setDates([...dates, '']) }
  function removeDate(i: number) {
    if (dates.length === 1) { setDates(['']); return }
    setDates(dates.filter((_, idx) => idx !== i))
  }
  function updateDate(i: number, v: string) {
    const next = [...dates]
    next[i] = v
    setDates(next)
  }

  async function submit() {
    if (!activeId) return
    const validDates = dates.filter((d) => d.trim()).map((d) => d.trim())
    if (validDates.length === 0) {
      toast('사용 예정일을 1개 이상 입력해주세요', 'error')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.rpc('respond_leave_promotion', {
      p_promotion_id: activeId,
      p_planned_dates: validDates,
      p_notes: notes.trim() || null,
    })
    setSubmitting(false)
    if (error) { toast('제출 실패: ' + error.message, 'error'); return }
    toast('사용 예정일 회신 완료', 'success')
    setActiveId(null)
    setDates([''])
    setNotes('')
    load()
  }

  if (loading) return <PageSpinner />

  const pending = rows.filter((r) => !r.has_responded)
  const responded = rows.filter((r) => r.has_responded)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CalendarCheck className="h-6 w-6 text-brand-500" /> 내 연차 촉진 회신
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          회사로부터 받은 연차 사용 촉진 통지에 사용 예정일을 회신합니다 (근로기준법 §61 법정 절차).
        </p>
      </div>

      {pending.length === 0 && responded.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-gray-400">
            받은 촉진 통지가 없습니다.
          </CardContent>
        </Card>
      )}

      {/* 미응답 통지 */}
      {pending.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> 회신 대기 ({pending.length}건)
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              아래 통지에 대해 <strong>사용 예정일</strong>을 회신해 주세요.
              회신하지 않으면 회사가 사용 시기를 지정할 수 있고, 미사용 연차가 소멸될 수 있습니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map((r) => (
              <div key={r.promotion_id} className="border border-amber-200 rounded-lg p-3 bg-amber-50/50">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant="warning">{r.stage === '6m' ? '6개월 전 통지' : '2개월 전 통지'}</Badge>
                  <span className="text-sm font-semibold text-gray-900">
                    잔여 {r.remaining_days}일 · 소멸 예정 {formatDate(r.expires_on, 'yyyy.MM.dd')}
                  </span>
                  <span className="text-xs text-gray-500 ml-auto">
                    수신 {formatDate(r.sent_at, 'yyyy.MM.dd HH:mm')}
                  </span>
                </div>
                {activeId === r.promotion_id ? (
                  <div className="space-y-2 mt-3">
                    <label className="block text-xs font-medium text-gray-700">사용 예정일 (다중 입력 가능)</label>
                    {dates.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input type="date" value={d} onChange={(e) => updateDate(i, e.target.value)} className="flex-1" />
                        <Button size="sm" variant="outline" onClick={() => removeDate(i)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={addDate}>
                      <Plus className="h-3 w-3 mr-1" /> 날짜 추가
                    </Button>
                    <Textarea
                      placeholder="회사에 전달할 메모 (선택)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => setActiveId(null)}>취소</Button>
                      <Button size="sm" onClick={submit} disabled={submitting}>
                        <Check className="h-3 w-3 mr-1" /> {submitting ? '제출 중...' : '회신 제출'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => startResponse(r)} className="mt-2">
                    사용 예정일 회신하기
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 회신 완료 */}
      {responded.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500" /> 회신 완료 ({responded.length}건)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {responded.map((r) => (
              <div key={r.promotion_id} className="border border-gray-200 rounded-lg p-3 bg-white">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant="success">{r.stage === '6m' ? '6개월 전' : '2개월 전'}</Badge>
                  <span className="text-sm text-gray-700">
                    잔여 {r.remaining_days}일 · 소멸 {formatDate(r.expires_on, 'yyyy.MM.dd')}
                  </span>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  사용 예정일: {r.planned_dates.length > 0 ? r.planned_dates.map((d) => formatDate(d, 'yyyy.MM.dd')).join(', ') : '-'}
                </div>
                {r.notes && <div className="text-xs text-gray-500 italic mt-1">메모: {r.notes}</div>}
                <Button size="sm" variant="outline" className="mt-2" onClick={() => startResponse(r)}>
                  회신 수정
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
