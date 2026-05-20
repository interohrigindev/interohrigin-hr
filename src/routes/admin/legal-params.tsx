/**
 * 관리자 — 법령 파라미터 관리 (/admin/system/legal-params)
 *  - 최저임금/4대보험 요율/공휴일 등
 *  - feature_rollouts.legal_params_sync = true 일 때만 노출
 *  - 자동 동기화는 추후 cron 으로 / 본 화면은 수동 등록·승인 + 이력 조회
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
import { Scale, AlertCircle, Plus, Check } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { FEATURE_KEYS } from '@/types/compliance'
import { logAudit } from '@/lib/audit-logger'
import { formatDate } from '@/lib/utils'

interface ParamRow {
  id: string
  param_key: string
  param_value: Record<string, unknown>
  effective_from: string
  effective_to: string | null
  source: string | null
  status: 'draft' | 'approved' | 'active' | 'archived'
  approved_by: string | null
  approved_at: string | null
  notes: string | null
  created_at: string
}

export default function LegalParamsPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [featureOn, setFeatureOn] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ParamRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    param_key: '',
    param_value: '{"amount": 0, "currency": "KRW"}',
    effective_from: new Date().toISOString().slice(0, 10),
    source: '',
    notes: '',
  })

  const canManage = !!profile?.role && ['admin','hr_admin','ceo'].includes(profile.role)

  useEffect(() => { isFeatureEnabled(FEATURE_KEYS.LEGAL_PARAMS_SYNC).then(setFeatureOn) }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('legal_params')
      .select('*')
      .order('effective_from', { ascending: false })
      .limit(50)
    setRows((data || []) as ParamRow[])
    setLoading(false)
  }
  useEffect(() => { if (featureOn) load() }, [featureOn])

  async function createParam() {
    if (!form.param_key.trim()) { toast('파라미터 키 입력 필요', 'error'); return }
    let value: Record<string, unknown>
    try { value = JSON.parse(form.param_value) } catch { toast('JSON 형식이 아닙니다', 'error'); return }

    const { data, error } = await supabase
      .from('legal_params')
      .insert({
        param_key: form.param_key.trim(),
        param_value: value,
        effective_from: form.effective_from,
        source: form.source || null,
        notes: form.notes || null,
        status: 'draft',
      }).select().single()
    if (error) { toast('등록 실패: ' + error.message, 'error'); return }
    await logAudit({
      action: 'create', entity: 'legal_param', entityId: data.id,
      diff: `법령 파라미터 등록 — ${form.param_key} (draft)`,
    })
    toast('등록 완료 (draft 상태)', 'success')
    setShowForm(false)
    load()
  }

  async function changeStatus(row: ParamRow, status: 'approved' | 'active' | 'archived') {
    const patch: any = { status }
    if (status === 'approved') {
      patch.approved_by = profile?.id
      patch.approved_at = new Date().toISOString()
    }
    const { error } = await supabase.from('legal_params').update(patch).eq('id', row.id)
    if (error) { toast('변경 실패: ' + error.message, 'error'); return }
    await logAudit({
      action: 'update', entity: 'legal_param', entityId: row.id,
      before: { status: row.status }, after: { status },
      diff: `${row.param_key} 상태 ${row.status} → ${status}`,
    })
    toast(`상태 변경 완료 — ${status}`, 'success')
    load()
  }

  if (featureOn === null || loading) return <PageSpinner />
  if (!featureOn) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-amber-800">법령 파라미터 자동 동기 비활성 상태</h2>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Scale className="h-6 w-6 text-brand-500" /> 법령 파라미터 관리
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            최저임금·4대보험 요율·공휴일 등. draft → approved → active 단계 승인.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4 mr-1" /> 신규 등록
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">신규 파라미터</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input label="키 *" value={form.param_key} onChange={(e) => setForm({ ...form, param_key: e.target.value })}
              placeholder="예) min_wage_hourly, national_pension_rate" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">값 (JSON) *</label>
              <Textarea value={form.param_value} onChange={(e) => setForm({ ...form, param_value: e.target.value })}
                rows={3} className="font-mono text-xs" />
            </div>
            <Input label="시행일 *" type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
            <Input label="출처" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="공공데이터포털 URL 등" />
            <Textarea placeholder="메모" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>취소</Button>
              <Button size="sm" onClick={createParam}>등록 (draft)</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">등록된 파라미터 ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-gray-600">
                  <th className="text-left px-3 py-2 font-semibold">키</th>
                  <th className="text-left px-3 py-2 font-semibold">값</th>
                  <th className="text-left px-3 py-2 font-semibold">시행일</th>
                  <th className="text-center px-3 py-2 font-semibold">상태</th>
                  <th className="text-right px-3 py-2 font-semibold">액션</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-8">등록된 파라미터 없음</td></tr>}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2"><code className="text-xs">{r.param_key}</code></td>
                    <td className="px-3 py-2 text-gray-700 text-xs font-mono break-all max-w-xs">{JSON.stringify(r.param_value)}</td>
                    <td className="px-3 py-2 text-gray-600">{formatDate(r.effective_from, 'yyyy.MM.dd')}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={
                        r.status === 'active' ? 'success' :
                        r.status === 'approved' ? 'info' :
                        r.status === 'archived' ? 'default' : 'warning'
                      }>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {canManage && r.status === 'draft' && (
                        <Button size="sm" variant="outline" onClick={() => changeStatus(r, 'approved')}>
                          <Check className="h-3 w-3 mr-0.5" /> 승인
                        </Button>
                      )}
                      {canManage && r.status === 'approved' && (
                        <Button size="sm" onClick={() => changeStatus(r, 'active')}>적용</Button>
                      )}
                      {canManage && r.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => changeStatus(r, 'archived')}>아카이브</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
