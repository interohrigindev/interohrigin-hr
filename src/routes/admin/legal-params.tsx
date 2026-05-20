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
import { Scale, AlertCircle, Plus, Check, Download, Key, Globe, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { FEATURE_KEYS } from '@/types/compliance'
import { logAudit } from '@/lib/audit-logger'
import { formatDate } from '@/lib/utils'
import { loadApiKeys, saveApiKeys, fetchKoreanHolidays, type ApiKeys } from '@/lib/legal-params-api'

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
  const [showApiSection, setShowApiSection] = useState(false)
  const [apiKeys, setApiKeys] = useState<ApiKeys>({})
  const [savingKeys, setSavingKeys] = useState(false)
  const [holidayYear, setHolidayYear] = useState(new Date().getFullYear())
  const [fetchingHolidays, setFetchingHolidays] = useState(false)

  useEffect(() => { isFeatureEnabled(FEATURE_KEYS.LEGAL_PARAMS_SYNC).then(setFeatureOn) }, [])
  useEffect(() => { if (featureOn) loadApiKeys().then(setApiKeys) }, [featureOn])

  async function handleSaveKeys() {
    setSavingKeys(true)
    const result = await saveApiKeys(apiKeys)
    setSavingKeys(false)
    if (!result.ok) { toast('저장 실패: ' + result.error, 'error'); return }
    toast('API 키 저장 완료', 'success')
    await logAudit({ action: 'update', entity: 'legal_param_api_keys', diff: 'API 키 갱신' })
  }

  async function handleFetchHolidays() {
    if (!apiKeys.data_go_kr) { toast('공공데이터포털 인증키를 먼저 등록하세요', 'error'); return }
    setFetchingHolidays(true)
    const result = await fetchKoreanHolidays(holidayYear, apiKeys.data_go_kr)
    setFetchingHolidays(false)
    if (!result.ok) { toast('공휴일 조회 실패: ' + result.error, 'error'); return }
    const holidayList = (result.holidays || []).filter((h) => h.isHoliday)
    if (holidayList.length === 0) { toast('해당 연도 공휴일 데이터 없음', 'error'); return }

    const { error } = await supabase.from('legal_params').insert({
      param_key: `public_holidays_${holidayYear}`,
      param_value: { year: holidayYear, holidays: holidayList } as any,
      effective_from: `${holidayYear}-01-01`,
      source: '한국천문연구원 특일정보 API (data.go.kr)',
      status: 'active',
      notes: `${holidayList.length}일 등록 — 자동 동기화`,
    } as any)
    if (error) { toast('DB 저장 실패: ' + error.message, 'error'); return }
    await logAudit({
      action: 'create', entity: 'legal_param',
      diff: `${holidayYear} 공휴일 자동 동기화 — ${holidayList.length}일`,
    })
    toast(`${holidayYear}년 공휴일 ${holidayList.length}일 등록 완료`, 'success')
    load()
  }

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
        <div className="flex items-center gap-2">
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setShowApiSection((v) => !v)}>
              <Globe className="h-4 w-4 mr-1" /> 공공 API 연동
              {showApiSection ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
          )}
          {canManage && (
            <Button size="sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4 mr-1" /> 신규 등록
            </Button>
          )}
        </div>
      </div>

      {showApiSection && canManage && (
        <Card className="border-brand-200 bg-brand-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-brand-500" /> 정부 공공 API 연동
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              인증키 발급은 무료입니다. 키 입력 후 자동 동기화 버튼을 누르세요.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* API 1: 한국천문연구원 공휴일 */}
            <div className="bg-white rounded-lg p-3 border border-gray-200 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">① 한국천문연구원 — 공휴일/특일 정보</h3>
                  <p className="text-[11px] text-gray-500">공공데이터포털 일반 인증키 필요. 회원가입 후 즉시 발급.</p>
                </div>
                <a
                  href="https://www.data.go.kr/data/15012690/openapi.do"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-brand-600 hover:underline flex items-center gap-0.5"
                >
                  키 발급 <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <Input
                label="data.go.kr 일반 인증키 (Decoding)"
                value={apiKeys.data_go_kr || ''}
                onChange={(e) => setApiKeys({ ...apiKeys, data_go_kr: e.target.value })}
                placeholder="발급받은 인증키 붙여넣기"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  type="number"
                  value={String(holidayYear)}
                  onChange={(e) => setHolidayYear(Number(e.target.value))}
                  className="w-28"
                />
                <Button size="sm" onClick={handleFetchHolidays} disabled={fetchingHolidays || !apiKeys.data_go_kr}>
                  <Download className="h-3 w-3 mr-1" />
                  {fetchingHolidays ? '조회 중...' : `${holidayYear}년 공휴일 자동 등록`}
                </Button>
              </div>
            </div>

            {/* API 2: 국가법령정보센터 */}
            <div className="bg-white rounded-lg p-3 border border-gray-200 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">② 국가법령정보센터 — 법령 본문</h3>
                  <p className="text-[11px] text-gray-500">law.go.kr OPEN API. OC(이메일 아이디) 필요. CORS 제약으로 수동 등록 권장.</p>
                </div>
                <a
                  href="https://open.law.go.kr/LSO/openApi/cuAskList.do"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-brand-600 hover:underline flex items-center gap-0.5"
                >
                  키 발급 <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <Input
                label="law.go.kr OC (이메일 아이디 부분)"
                value={apiKeys.law_go_kr_oc || ''}
                onChange={(e) => setApiKeys({ ...apiKeys, law_go_kr_oc: e.target.value })}
                placeholder="예) interohrigin"
              />
            </div>

            {/* API 미지원 항목 안내 */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> 자동 API 미제공 항목 (정부 공식 API 부재)</p>
              <ul className="ml-5 list-disc space-y-0.5 text-amber-800">
                <li>최저임금 — 마이그레이션 106 에서 2024/2025/2026 시드 자동 등록됨</li>
                <li>4대보험 요율 — 2026년 시드 자동 등록 (변경 시 신규 등록 + 시행일 명시)</li>
                <li>주 52시간/연차 부여 기준 — 근로기준법 §50,53,60 — 시드 등록됨</li>
                <li>업종별 산재요율 — 근로복지공단 PDF 공시 → 수동 등록 필요</li>
              </ul>
              <p className="mt-1">매년 7월 최저임금 발표 / 12월 4대보험 요율 변경 시 신규 등록 + 이전 row 는 archived 처리.</p>
            </div>

            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={handleSaveKeys} disabled={savingKeys}>
                <Key className="h-3 w-3 mr-1" /> {savingKeys ? '저장 중...' : 'API 키 저장'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* 현재 활성 파라미터 요약 — 오늘 기준 effective_from 가 가장 최근인 active row */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600" /> 현재 적용 중 파라미터 (오늘 기준)
          </CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            상태=active 이고 시행일이 오늘 이전인 row 중 키별 최신값. 향후 시급/4대보험 계산 코드는 여기 값을 참조해야 합니다.
          </p>
        </CardHeader>
        <CardContent>
          {(() => {
            const today = new Date().toISOString().slice(0, 10)
            const activeMap = new Map<string, ParamRow>()
            rows
              .filter((r) => r.status === 'active' && r.effective_from <= today)
              .forEach((r) => {
                const prev = activeMap.get(r.param_key)
                if (!prev || r.effective_from > prev.effective_from) activeMap.set(r.param_key, r)
              })
            const activeList = Array.from(activeMap.values()).sort((a, b) => a.param_key.localeCompare(b.param_key))
            if (activeList.length === 0) {
              return (
                <div className="text-center text-rose-600 text-sm py-4">
                  ⚠️ 현재 active 상태인 파라미터가 없습니다. 아래 목록에서 필요한 row 를 active 로 복구하세요.
                </div>
              )
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {activeList.map((r) => (
                  <div key={r.id} className="bg-white rounded p-2 border border-emerald-100 text-xs">
                    <div className="font-semibold text-gray-800">{r.param_key}</div>
                    <div className="text-gray-600 font-mono break-all">{JSON.stringify(r.param_value)}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">시행: {formatDate(r.effective_from, 'yyyy.MM.dd')}</div>
                  </div>
                ))}
              </div>
            )
          })()}
        </CardContent>
      </Card>

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
                      {canManage && r.status === 'archived' && (
                        <Button size="sm" variant="outline" onClick={() => changeStatus(r, 'active')}
                          className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                          active 로 복구
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
    </div>
  )
}
