/**
 * 관리자 — 주 52시간 사전 경고 대시보드 (/admin/hours-warning)
 *  - feature_rollouts.weekly_52h_warning = true 일 때만 노출
 */
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { AlertCircle, AlertTriangle, RefreshCw, Clock } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { FEATURE_KEYS } from '@/types/compliance'
import { formatDate } from '@/lib/utils'

interface SnapRow {
  id: string
  employee_id: string
  week_start: string
  week_end: string
  attendance_hours: number
  overtime_hours: number
  total_hours: number
  current_level: 'safe' | 'warn_45' | 'warn_50' | 'over_52'
  computed_at: string
}

export default function WeeklyHoursPage() {
  const { toast } = useToast()
  const [featureOn, setFeatureOn] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<SnapRow[]>([])
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map())
  const [recomputing, setRecomputing] = useState(false)

  useEffect(() => { isFeatureEnabled(FEATURE_KEYS.WEEKLY_52H_WARNING).then(setFeatureOn) }, [])

  async function load() {
    setLoading(true)
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))   // 월요일
    const ws = weekStart.toISOString().slice(0, 10)

    const { data } = await supabase
      .from('weekly_hours_snapshots')
      .select('*')
      .eq('week_start', ws)
      .order('total_hours', { ascending: false })
    setRows((data || []) as SnapRow[])
    const ids = Array.from(new Set((data || []).map((r: SnapRow) => r.employee_id)))
    if (ids.length > 0) {
      const { data: emps } = await supabase.from('employees').select('id, name').in('id', ids)
      const m = new Map<string, string>()
      ;(emps || []).forEach((e: { id: string; name: string }) => m.set(e.id, e.name))
      setNameMap(m)
    }
    setLoading(false)
  }
  useEffect(() => { if (featureOn) load() }, [featureOn])

  async function recomputeAll() {
    setRecomputing(true)
    const { data: emps } = await supabase
      .from('employees')
      .select('id')
      .eq('is_active', true)
    if (!emps) { setRecomputing(false); return }
    let ok = 0
    for (const e of emps) {
      const { error } = await supabase.rpc('compute_weekly_hours', { p_employee_id: e.id, p_week_start: null })
      if (!error) ok++
    }
    toast(`${ok}/${emps.length}명 재계산 완료`, 'success')
    setRecomputing(false)
    load()
  }

  if (featureOn === null || loading) return <PageSpinner />

  if (!featureOn) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-amber-800">주 52시간 사전 경고 비활성 상태</h2>
        <p className="text-sm text-amber-700 mt-1">시스템 관리 &gt; 기능 토글에서 활성화 후 사용하세요.</p>
      </div>
    )
  }

  const buckets = {
    over_52: rows.filter((r) => r.current_level === 'over_52'),
    warn_50: rows.filter((r) => r.current_level === 'warn_50'),
    warn_45: rows.filter((r) => r.current_level === 'warn_45'),
    safe: rows.filter((r) => r.current_level === 'safe'),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="h-6 w-6 text-brand-500" /> 주 52시간 사전 경고
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            이번 주 누적 근무시간 + 승인 연장근로 기준 — 45h(주의) / 50h(위험) / 52h(초과)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={recomputeAll} disabled={recomputing}>
          <RefreshCw className="h-4 w-4 mr-1" /> {recomputing ? '계산 중...' : '전체 재계산'}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <SummaryCard label="초과 52h" count={buckets.over_52.length} color="rose" />
        <SummaryCard label="위험 50h+" count={buckets.warn_50.length} color="amber" />
        <SummaryCard label="주의 45h+" count={buckets.warn_45.length} color="yellow" />
        <SummaryCard label="안전" count={buckets.safe.length} color="emerald" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">금주 직원별 누적 시간</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-gray-600">
                  <th className="text-left px-3 py-2 font-semibold">직원</th>
                  <th className="text-center px-3 py-2 font-semibold">근태</th>
                  <th className="text-center px-3 py-2 font-semibold">연장</th>
                  <th className="text-center px-3 py-2 font-semibold">총합</th>
                  <th className="text-center px-3 py-2 font-semibold">상태</th>
                  <th className="text-right px-3 py-2 font-semibold">최근 계산</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-8">데이터 없음 — '전체 재계산' 실행</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{nameMap.get(r.employee_id) || '—'}</td>
                    <td className="px-3 py-2 text-center text-gray-600">{r.attendance_hours.toFixed(1)}h</td>
                    <td className="px-3 py-2 text-center text-gray-600">{r.overtime_hours.toFixed(1)}h</td>
                    <td className="px-3 py-2 text-center font-bold text-gray-900">{r.total_hours.toFixed(1)}h</td>
                    <td className="px-3 py-2 text-center">
                      {r.current_level === 'over_52' && <Badge variant="danger">52h 초과</Badge>}
                      {r.current_level === 'warn_50' && <Badge variant="warning">위험 50h+</Badge>}
                      {r.current_level === 'warn_45' && <Badge variant="warning">주의 45h+</Badge>}
                      {r.current_level === 'safe' && <Badge variant="success">안전</Badge>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400 text-xs">{formatDate(r.computed_at, 'MM.dd HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          본 화면은 <strong>제안/권장</strong> 목적입니다. 실제 근로시간 인정·연장 한도 판단은 별도 검토가 필요합니다.
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, count, color }: { label: string; count: number; color: 'rose'|'amber'|'yellow'|'emerald' }) {
  const cls = {
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  }[color]
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{count}명</div>
    </div>
  )
}
