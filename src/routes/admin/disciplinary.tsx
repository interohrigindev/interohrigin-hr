/**
 * 관리자 — 징계/면담 케이스 관리 (/admin/disciplinary)
 *  - feature_rollouts.disciplinary_case = true 일 때만 노출
 */
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Gavel, AlertCircle, Plus, FileText } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { FEATURE_KEYS } from '@/types/compliance'
import { logAudit } from '@/lib/audit-logger'
import { formatDate } from '@/lib/utils'

const TYPE_LABELS: Record<string, string> = {
  warning: '경고', meeting: '면담', suspension: '정직', demotion: '강등', dismissal: '해고', other: '기타',
}
const STATUS_LABELS: Record<string, string> = {
  open: '접수', review: '검토', decided: '결정', notified: '통보', closed: '종결',
}

interface CaseRow {
  id: string
  employee_id: string
  case_type: string
  subject: string
  reason: string
  status: string
  decision: string | null
  decision_at: string | null
  notified_at: string | null
  created_at: string
}

export default function DisciplinaryPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [featureOn, setFeatureOn] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<CaseRow[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ employee_id: '', case_type: 'warning', subject: '', reason: '' })

  const canManage = !!profile?.role && ['admin','hr_admin','ceo'].includes(profile.role)
  const canView = !!profile?.role && ['admin','hr_admin','ceo','director','division_head'].includes(profile.role)

  useEffect(() => { isFeatureEnabled(FEATURE_KEYS.DISCIPLINARY_CASE).then(setFeatureOn) }, [])

  async function load() {
    setLoading(true)
    const [casesRes, empsRes] = await Promise.all([
      supabase.from('disciplinary_cases').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('employees').select('id, name').eq('is_active', true).order('name'),
    ])
    setRows((casesRes.data || []) as CaseRow[])
    setEmployees((empsRes.data || []) as { id: string; name: string }[])
    setLoading(false)
  }
  useEffect(() => { if (featureOn && canView) load() }, [featureOn, canView])

  async function createCase() {
    if (!form.employee_id || !form.subject.trim() || form.reason.trim().length < 10) {
      toast('직원/제목/사유(10자+) 모두 입력해주세요', 'error')
      return
    }
    const { data, error } = await supabase
      .from('disciplinary_cases')
      .insert({
        employee_id: form.employee_id,
        case_type: form.case_type,
        subject: form.subject.trim(),
        reason: form.reason.trim(),
        created_by: profile?.id,
      })
      .select()
      .single()
    if (error) { toast('등록 실패: ' + error.message, 'error'); return }
    await logAudit({
      action: 'create', entity: 'disciplinary_case', entityId: data.id,
      after: { case_type: form.case_type, subject: form.subject, employee_id: form.employee_id },
      diff: `징계 케이스 등록 (${TYPE_LABELS[form.case_type]} — ${form.subject})`,
    })
    toast('케이스 등록 완료', 'success')
    setShowForm(false)
    setForm({ employee_id: '', case_type: 'warning', subject: '', reason: '' })
    load()
  }

  if (featureOn === null || loading) return <PageSpinner />
  if (!featureOn) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-amber-800">징계/면담 케이스 관리 비활성 상태</h2>
      </div>
    )
  }
  if (!canView) return <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 text-center text-sm text-rose-800">접근 권한 없음</div>

  const nameMap = new Map(employees.map((e) => [e.id, e.name]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Gavel className="h-6 w-6 text-brand-500" /> 징계/면담 케이스
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">사유·의결·통보 증빙을 체계적으로 보관합니다.</p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4 mr-1" /> 신규 케이스
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">신규 징계 케이스</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select
              label="대상 직원 *"
              value={form.employee_id}
              onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
              options={[{ value: '', label: '선택' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
            />
            <Select
              label="유형 *"
              value={form.case_type}
              onChange={(e) => setForm({ ...form, case_type: e.target.value })}
              options={Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
            <Input
              label="제목 *"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="예) 무단 결근 3회 발생 건"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">사유 * (10자 이상)</label>
              <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={5} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>취소</Button>
              <Button size="sm" onClick={createCase}>등록</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">케이스 목록 ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-gray-600">
                  <th className="text-left px-3 py-2 font-semibold">접수일</th>
                  <th className="text-left px-3 py-2 font-semibold">직원</th>
                  <th className="text-center px-3 py-2 font-semibold">유형</th>
                  <th className="text-left px-3 py-2 font-semibold">제목</th>
                  <th className="text-center px-3 py-2 font-semibold">상태</th>
                  <th className="text-left px-3 py-2 font-semibold">통보</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-8">등록된 케이스 없음</td></tr>}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600">{formatDate(r.created_at, 'yyyy.MM.dd')}</td>
                    <td className="px-3 py-2 text-gray-700">{nameMap.get(r.employee_id) || '—'}</td>
                    <td className="px-3 py-2 text-center"><Badge variant="info">{TYPE_LABELS[r.case_type]}</Badge></td>
                    <td className="px-3 py-2 text-gray-700">{r.subject}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={
                        r.status === 'closed' ? 'default' :
                        r.status === 'notified' ? 'success' :
                        r.status === 'decided' ? 'purple' : 'warning'
                      }>{STATUS_LABELS[r.status]}</Badge>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {r.notified_at ? formatDate(r.notified_at, 'yyyy.MM.dd') : '미통보'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-start gap-2">
        <FileText className="h-4 w-4 shrink-0 mt-0.5" />
        <div>모든 케이스 등록·수정은 감사 로그에 기록됩니다. 의결서/통보문 PDF 첨부 기능은 추후 확장 예정.</div>
      </div>
    </div>
  )
}
