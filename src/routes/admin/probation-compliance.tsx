/**
 * 관리자 — 수습 종료 컴플라이언스 (/admin/probation-compliance)
 *  - hire_date + 90일 기준으로 30/7/오늘 알림 대상 자동 식별
 *  - 정당성 체크리스트 저장
 *  - feature_rollouts.probation_compliance = true 일 때만 노출
 */
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { GraduationCap, AlertCircle, AlertTriangle, CheckSquare } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { FEATURE_KEYS } from '@/types/compliance'
import { logAudit } from '@/lib/audit-logger'
import { formatDate } from '@/lib/utils'

interface ProbEmp {
  id: string
  name: string
  hire_date: string | null
  position: string | null
  department_id: string | null
  daysToExpiry: number
  expiryDate: string
}

interface ReviewRow {
  id: string
  employee_id: string
  reviewed_at: string
  eval_objective_done: boolean
  meeting_count_sufficient: boolean
  written_notice_prepared: boolean
  improvement_period_given: boolean
  documents_complete: boolean
  overall_decision: string | null
  notes: string | null
}

const CHECK_FIELDS: { key: keyof ReviewRow; label: string }[] = [
  { key: 'eval_objective_done', label: '평가 객관성 확보 (점수표/근거)' },
  { key: 'meeting_count_sufficient', label: '면담 횟수 충족 (최소 2회 권장)' },
  { key: 'written_notice_prepared', label: '서면 통보 준비 완료' },
  { key: 'improvement_period_given', label: '개선 기회 부여' },
  { key: 'documents_complete', label: '증빙 문서 일체 보관' },
]

export default function ProbationCompliancePage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [featureOn, setFeatureOn] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [probEmps, setProbEmps] = useState<ProbEmp[]>([])
  const [reviews, setReviews] = useState<Map<string, ReviewRow>>(new Map())
  const [selectedEmp, setSelectedEmp] = useState<ProbEmp | null>(null)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [notes, setNotes] = useState('')
  const [decision, setDecision] = useState<string>('')

  const canManage = !!profile?.role && ['admin','hr_admin','ceo'].includes(profile.role)

  useEffect(() => { isFeatureEnabled(FEATURE_KEYS.PROBATION_COMPLIANCE).then(setFeatureOn) }, [])

  async function load() {
    setLoading(true)
    const { data: emps } = await supabase
      .from('employees')
      .select('id, name, hire_date, position, department_id, employment_type')
      .eq('is_active', true)
    const probation = (emps || []).filter((e: { employment_type?: string; position?: string }) =>
      e.employment_type === 'probation' || (e.position || '').includes('수습'))

    const today = new Date()
    const list: ProbEmp[] = probation
      .filter((e) => !!e.hire_date)
      .map((e) => {
        const hire = new Date(e.hire_date as string)
        const expiry = new Date(hire.getTime() + 90 * 86400000)
        const daysTo = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
        return {
          id: e.id, name: e.name, hire_date: e.hire_date as string,
          position: e.position, department_id: e.department_id,
          daysToExpiry: daysTo,
          expiryDate: expiry.toISOString().slice(0, 10),
        }
      })
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry)
    setProbEmps(list)

    // 최신 리뷰 1건씩 매핑
    if (list.length > 0) {
      const { data: revs } = await supabase
        .from('probation_compliance_reviews')
        .select('*')
        .in('employee_id', list.map((e) => e.id))
        .order('reviewed_at', { ascending: false })
      const m = new Map<string, ReviewRow>()
      for (const r of (revs || []) as ReviewRow[]) {
        if (!m.has(r.employee_id)) m.set(r.employee_id, r)
      }
      setReviews(m)
    }
    setLoading(false)
  }
  useEffect(() => { if (featureOn) load() }, [featureOn])

  function selectEmp(e: ProbEmp) {
    setSelectedEmp(e)
    const existing = reviews.get(e.id)
    if (existing) {
      const c: Record<string, boolean> = {}
      CHECK_FIELDS.forEach((f) => c[f.key as string] = (existing as any)[f.key])
      setChecks(c)
      setNotes(existing.notes || '')
      setDecision(existing.overall_decision || '')
    } else {
      setChecks({})
      setNotes('')
      setDecision('')
    }
  }

  async function saveReview() {
    if (!selectedEmp) return
    const payload: any = {
      employee_id: selectedEmp.id,
      reviewer_uid: profile?.id,
      notes,
      overall_decision: decision || null,
    }
    CHECK_FIELDS.forEach((f) => payload[f.key as string] = !!checks[f.key as string])
    const { data, error } = await supabase.from('probation_compliance_reviews').insert(payload).select().single()
    if (error) { toast('저장 실패: ' + error.message, 'error'); return }
    await logAudit({
      action: 'create', entity: 'probation_compliance_review', entityId: data.id,
      after: payload, diff: `${selectedEmp.name} 수습 정당성 체크`,
    })
    toast('체크리스트 저장 완료', 'success')
    load()
  }

  if (featureOn === null || loading) return <PageSpinner />
  if (!featureOn) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-amber-800">수습 종료 컴플라이언스 비활성 상태</h2>
      </div>
    )
  }

  const urgent = probEmps.filter((e) => e.daysToExpiry <= 30 && e.daysToExpiry >= 0)
  const expired = probEmps.filter((e) => e.daysToExpiry < 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-brand-500" /> 수습 종료 컴플라이언스
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          수습 만료 30일 전 알림 대상 + 정당성 체크리스트 (서면 통보 의무·평가 객관성 등)
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
          <div className="text-xs text-rose-700 font-medium">D-0 이하 (이미 종료/오늘)</div>
          <div className="text-2xl font-bold text-rose-700 mt-1">{expired.length}명</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-xs text-amber-700 font-medium">30일 이내</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{urgent.length}명</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="text-xs text-emerald-700 font-medium">전체 수습</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{probEmps.length}명</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">수습 직원 목록</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-[600px] overflow-y-auto">
            {probEmps.length === 0 && <p className="text-center text-gray-400 py-8">수습 직원 없음</p>}
            {probEmps.map((e) => {
              const rev = reviews.get(e.id)
              return (
                <button
                  key={e.id}
                  onClick={() => selectEmp(e)}
                  className={`block w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${
                    selectedEmp?.id === e.id ? 'bg-brand-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-semibold text-sm text-gray-900">{e.name}</span>
                    <span className={`text-xs font-bold ${
                      e.daysToExpiry < 0 ? 'text-rose-600' :
                      e.daysToExpiry <= 7 ? 'text-rose-600' :
                      e.daysToExpiry <= 30 ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      D{e.daysToExpiry >= 0 ? '-' : '+'}{Math.abs(e.daysToExpiry)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    만료: {formatDate(e.expiryDate, 'yyyy.MM.dd')} · 입사: {formatDate(e.hire_date || '', 'yyyy.MM.dd')}
                  </div>
                  {rev && <Badge variant={rev.overall_decision === 'proceed' ? 'success' : rev.overall_decision === 'stop' ? 'danger' : 'warning'} className="mt-1">{rev.overall_decision || '검토중'}</Badge>}
                </button>
              )
            })}
          </CardContent>
        </Card>

        {selectedEmp && canManage && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckSquare className="h-4 w-4" /> {selectedEmp.name} — 정당성 체크리스트
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {CHECK_FIELDS.map((f) => (
                <label key={f.key as string} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!checks[f.key as string]}
                    onChange={(e) => setChecks({ ...checks, [f.key as string]: e.target.checked })}
                    className="rounded"
                  />
                  <span>{f.label}</span>
                </label>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">메모</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">종합 판단</label>
                <div className="flex gap-2">
                  {(['proceed','more_review','stop'] as const).map((v) => (
                    <button key={v}
                      onClick={() => setDecision(v)}
                      className={`px-3 py-1 rounded-full text-xs border ${
                        decision === v ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-700 border-gray-200'
                      }`}>
                      {v === 'proceed' ? '정규 전환 진행' : v === 'more_review' ? '추가 검토' : '중단(해지)'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>이 체크리스트는 <strong>부당해고 분쟁 시 회사 측 증빙</strong>으로 활용됩니다. 모든 체크가 사실에 기반해야 합니다.</span>
              </div>
              <Button onClick={saveReview} className="w-full">체크리스트 저장</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
