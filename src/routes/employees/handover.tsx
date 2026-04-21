import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { UserX, FileText, Package, Link2, CheckCircle, Clock, Plus, X, Pencil, Search, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { generateHandoverDraft } from '@/lib/handover-generator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type {
  HandoverAsset, HandoverAssetType, HandoverReturnStatus,
  HandoverDocument, HandoverStatus,
} from '@/types/employee-lifecycle'
import {
  HANDOVER_ASSET_TYPE_LABELS,
  HANDOVER_RETURN_LABELS,
  HANDOVER_STATUS_LABELS,
} from '@/types/employee-lifecycle'

const ADMIN_ROLES = ['ceo', 'director', 'division_head', 'admin']

interface EmployeeLite {
  id: string
  name: string
  email: string | null
  department_id: string | null
  is_active: boolean
  updated_at: string
}

const ASSET_TYPE_OPTIONS: { value: HandoverAssetType; label: string; icon: string }[] = [
  { value: 'contract', label: HANDOVER_ASSET_TYPE_LABELS.contract, icon: '📑' },
  { value: 'device',   label: HANDOVER_ASSET_TYPE_LABELS.device,   icon: '💻' },
  { value: 'document', label: HANDOVER_ASSET_TYPE_LABELS.document, icon: '📂' },
  { value: 'account',  label: HANDOVER_ASSET_TYPE_LABELS.account,  icon: '🔑' },
  { value: 'other',    label: HANDOVER_ASSET_TYPE_LABELS.other,    icon: '🧩' },
]

const STATUS_BADGE: Record<HandoverStatus, 'default' | 'warning' | 'info' | 'success'> = {
  draft: 'default',
  generated: 'info',
  reviewed: 'warning',
  completed: 'success',
}

const RETURN_BADGE: Record<HandoverReturnStatus, 'default' | 'warning' | 'success'> = {
  pending: 'warning',
  returned: 'success',
  n_a: 'default',
}

function HandoverSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{title}</p>
      {children}
    </div>
  )
}

export default function HandoverPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const isAdmin = !!profile?.role && ADMIN_ROLES.includes(profile.role)

  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [documents, setDocuments] = useState<HandoverDocument[]>([])
  const [selectedEmpId, setSelectedEmpId] = useState<string>('')
  const [assets, setAssets] = useState<HandoverAsset[]>([])
  const [savingDoc, setSavingDoc] = useState(false)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [contentExpanded, setContentExpanded] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  // asset edit state
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [assetForm, setAssetForm] = useState<{
    asset_type: HandoverAssetType
    name: string
    location: string
    url: string
    note: string
    return_status: HandoverReturnStatus
  }>({ asset_type: 'document', name: '', location: '', url: '', note: '', return_status: 'pending' })
  const [showAssetDialog, setShowAssetDialog] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const empQuery = isAdmin
      ? supabase.from('employees').select('id, name, email, department_id, is_active, updated_at').order('is_active', { ascending: true }).order('updated_at', { ascending: false })
      : supabase.from('employees').select('id, name, email, department_id, is_active, updated_at').eq('id', profile?.id || '')
    const [empRes, docRes] = await Promise.all([
      empQuery,
      supabase.from('handover_documents').select('*').order('updated_at', { ascending: false }),
    ])

    const empList = (empRes.data || []) as EmployeeLite[]
    setEmployees(empList)

    // B1 테이블이 아직 없는 환경 방어: 에러 메시지에 'handover_documents' 포함 시 migration 안내
    if (docRes.error) {
      const msg = docRes.error.message || ''
      if (/handover_documents/i.test(msg) || /relation.*does not exist/i.test(msg)) {
        toast('인수인계 테이블이 아직 설정되지 않았습니다. 관리자에게 migration 050 실행을 요청해주세요.', 'error')
      } else {
        toast('문서 조회 실패: ' + msg, 'error')
      }
      setDocuments([])
    } else {
      setDocuments((docRes.data || []) as HandoverDocument[])
    }

    // 일반 직원은 본인 자동 선택
    if (!isAdmin && profile?.id && empList.some((e) => e.id === profile.id)) {
      setSelectedEmpId((cur) => cur || profile.id)
    }

    setLoading(false)
  }, [isAdmin, profile?.id, toast])

  useEffect(() => { fetchAll() }, [fetchAll])

  // 선택 직원 변경 시 해당 자산 로드
  useEffect(() => {
    if (!selectedEmpId) { setAssets([]); return }
    supabase.from('handover_assets').select('*').eq('employee_id', selectedEmpId).order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          const msg = error.message || ''
          if (/handover_assets/i.test(msg) || /relation.*does not exist/i.test(msg)) {
            // migration 미적용 — 빈 배열 + 경고 한 번
            console.warn('[handover] handover_assets 테이블 없음. migration 050 실행 필요.')
          }
          setAssets([])
          return
        }
        setAssets((data || []) as HandoverAsset[])
      })
  }, [selectedEmpId])

  const selectedEmp = useMemo(() => employees.find(e => e.id === selectedEmpId) || null, [employees, selectedEmpId])
  const selectedDoc = useMemo(() => documents.find(d => d.employee_id === selectedEmpId) || null, [documents, selectedEmpId])

  // 후임자 선택 상태
  const [successorId, setSuccessorId] = useState<string>('')
  useEffect(() => { setSuccessorId(selectedDoc?.successor_id || '') }, [selectedDoc?.successor_id])

  const activeEmployees = useMemo(() => employees.filter(e => e.is_active), [employees])
  const filteredEmployees = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(e => e.name.toLowerCase().includes(q))
  }, [employees, searchQ])

  async function ensureDocument(): Promise<HandoverDocument | null> {
    if (!selectedEmpId) return null
    if (selectedDoc) return selectedDoc
    if (!isAdmin) {
      toast('관리자만 새 인수인계서를 생성할 수 있습니다.', 'error')
      return null
    }
    const { data, error } = await supabase
      .from('handover_documents')
      .insert({ employee_id: selectedEmpId, status: 'draft', successor_id: successorId || null })
      .select()
      .single()
    if (error) { toast('생성 실패: ' + error.message, 'error'); return null }
    const doc = data as HandoverDocument
    setDocuments((prev) => [doc, ...prev])
    return doc
  }

  async function handleSaveSuccessor() {
    if (!selectedDoc) {
      await ensureDocument()
      return
    }
    setSavingDoc(true)
    const { error } = await supabase
      .from('handover_documents')
      .update({ successor_id: successorId || null })
      .eq('id', selectedDoc.id)
    setSavingDoc(false)
    if (error) { toast('후임자 저장 실패: ' + error.message, 'error'); return }
    toast('후임자가 저장되었습니다.', 'success')
    fetchAll()
  }

  async function handleGenerateDraft() {
    if (!selectedEmpId || !selectedEmp) { toast('직원을 선택해주세요.', 'error'); return }
    const doc = await ensureDocument()
    if (!doc) return
    setGeneratingDraft(true)
    const { content, error } = await generateHandoverDraft(selectedEmpId, selectedEmp.name)
    if (error || !content) {
      toast('AI 초안 생성 실패: ' + (error || '알 수 없는 오류'), 'error')
      setGeneratingDraft(false)
      return
    }
    const { error: updateErr } = await supabase
      .from('handover_documents')
      .update({ content, status: 'generated', ai_generated_at: new Date().toISOString() })
      .eq('id', doc.id)
    setGeneratingDraft(false)
    if (updateErr) { toast('저장 실패: ' + updateErr.message, 'error'); return }
    toast('AI 초안이 생성되었습니다.', 'success')
    setContentExpanded(true)
    fetchAll()
  }

  async function handleChangeStatus(newStatus: HandoverStatus) {
    if (!selectedDoc) return
    const patch: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'reviewed') patch.reviewed_at = new Date().toISOString()
    const { error } = await supabase.from('handover_documents').update(patch).eq('id', selectedDoc.id)
    if (error) { toast('상태 변경 실패: ' + error.message, 'error'); return }
    toast(`상태: ${HANDOVER_STATUS_LABELS[newStatus]}`, 'success')
    fetchAll()
  }

  // ─── 자산 인벤토리 ────────────────────────────────────
  function openNewAsset() {
    setEditingAssetId(null)
    setAssetForm({ asset_type: 'document', name: '', location: '', url: '', note: '', return_status: 'pending' })
    setShowAssetDialog(true)
  }

  function openEditAsset(a: HandoverAsset) {
    setEditingAssetId(a.id)
    setAssetForm({
      asset_type: a.asset_type,
      name: a.name,
      location: a.location || '',
      url: a.url || '',
      note: a.note || '',
      return_status: a.return_status,
    })
    setShowAssetDialog(true)
  }

  async function handleSaveAsset() {
    if (!selectedEmpId) { toast('직원을 먼저 선택하세요.', 'error'); return }
    if (!assetForm.name.trim()) { toast('자산 이름을 입력하세요.', 'error'); return }

    const payload = {
      employee_id: selectedEmpId,
      asset_type: assetForm.asset_type,
      name: assetForm.name.trim(),
      location: assetForm.location.trim() || null,
      url: assetForm.url.trim() || null,
      note: assetForm.note.trim() || null,
      return_status: assetForm.return_status,
    }

    if (editingAssetId) {
      const { error } = await supabase.from('handover_assets').update(payload).eq('id', editingAssetId)
      if (error) { toast('수정 실패: ' + error.message, 'error'); return }
      toast('자산 정보가 수정되었습니다.', 'success')
    } else {
      const { error } = await supabase.from('handover_assets').insert(payload)
      if (error) { toast('등록 실패: ' + error.message, 'error'); return }
      toast('자산이 등록되었습니다.', 'success')
    }
    setShowAssetDialog(false)
    // 자산 재로드
    const { data } = await supabase.from('handover_assets').select('*').eq('employee_id', selectedEmpId).order('created_at', { ascending: true })
    setAssets((data || []) as HandoverAsset[])
  }

  async function handleDeleteAsset(id: string) {
    if (!confirm('이 자산 항목을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('handover_assets').delete().eq('id', id)
    if (error) { toast('삭제 실패: ' + error.message, 'error'); return }
    setAssets((prev) => prev.filter((a) => a.id !== id))
    toast('삭제되었습니다.', 'success')
  }

  async function toggleReturnStatus(a: HandoverAsset) {
    const next: HandoverReturnStatus =
      a.return_status === 'pending' ? 'returned'
      : a.return_status === 'returned' ? 'n_a'
      : 'pending'
    const { error } = await supabase.from('handover_assets').update({ return_status: next }).eq('id', a.id)
    if (error) { toast('상태 변경 실패: ' + error.message, 'error'); return }
    setAssets((prev) => prev.map((x) => x.id === a.id ? { ...x, return_status: next } : x))
  }

  if (loading) return <PageSpinner />

  // 자산 요약
  const returned = assets.filter(a => a.return_status === 'returned').length
  const pending = assets.filter(a => a.return_status === 'pending').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">인수인계</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isAdmin ? '퇴사 예정/퇴사자의 인수인계 문서와 자산을 관리합니다.' : '본인의 인수인계 문서와 자산을 확인·정리할 수 있습니다.'}
        </p>
      </div>

      {/* 대상 직원 선택 */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="직원 이름 검색..."
                  className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-full focus:outline-none focus:border-brand-400"
                  disabled={!isAdmin}
                />
              </div>
              <Select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                options={[
                  { value: '', label: '대상 직원 선택' },
                  ...filteredEmployees.map(e => ({
                    value: e.id,
                    label: `${e.name}${e.is_active ? '' : ' (퇴사)'}`,
                  })),
                ]}
              />
            </div>
            {selectedDoc && (
              <Badge variant={STATUS_BADGE[selectedDoc.status]}>
                {HANDOVER_STATUS_LABELS[selectedDoc.status]}
              </Badge>
            )}
          </div>

          {selectedEmp && (
            <div className="flex items-center gap-3 text-sm flex-wrap pt-2 border-t">
              <div className="flex items-center gap-1.5">
                {selectedEmp.is_active
                  ? <Badge variant="success">재직</Badge>
                  : <Badge variant="default">퇴사</Badge>}
                <span className="font-semibold text-gray-900">{selectedEmp.name}</span>
              </div>
              {selectedEmp.email && <span className="text-xs text-gray-500">{selectedEmp.email}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {!selectedEmpId && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <UserX className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            대상 직원을 선택해주세요.
          </CardContent>
        </Card>
      )}

      {selectedEmpId && (
        <>
          {/* 인수인계 문서 메타 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-600" /> 인수인계서
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedDoc ? (
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <p className="text-sm text-gray-500">아직 생성된 인수인계서가 없습니다.</p>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={ensureDocument}>
                        <Plus className="h-3 w-3 mr-1" /> 빈 초안 생성
                      </Button>
                      <Button size="sm" onClick={handleGenerateDraft} disabled={generatingDraft}>
                        <Sparkles className="h-3 w-3 mr-1" />
                        {generatingDraft ? 'AI 생성 중...' : 'AI 자동 초안 생성'}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">상태</label>
                      <Select
                        value={selectedDoc.status}
                        onChange={(e) => handleChangeStatus(e.target.value as HandoverStatus)}
                        options={(Object.keys(HANDOVER_STATUS_LABELS) as HandoverStatus[]).map(s => ({
                          value: s, label: HANDOVER_STATUS_LABELS[s],
                        }))}
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">후임자</label>
                      <div className="flex gap-2">
                        <Select
                          value={successorId}
                          onChange={(e) => setSuccessorId(e.target.value)}
                          options={[
                            { value: '', label: '미지정' },
                            ...activeEmployees
                              .filter(e => e.id !== selectedEmpId)
                              .map(e => ({ value: e.id, label: e.name })),
                          ]}
                          disabled={!isAdmin}
                        />
                        {isAdmin && (
                          <Button size="sm" variant="outline" onClick={handleSaveSuccessor} disabled={savingDoc}>
                            {savingDoc ? '저장 중...' : '저장'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AI 초안 재생성 버튼 */}
                  {isAdmin && (
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                      <span className="text-xs text-gray-400">
                        {selectedDoc.ai_generated_at
                          ? `AI 생성: ${new Date(selectedDoc.ai_generated_at).toLocaleDateString('ko-KR')}`
                          : 'AI 초안 미생성'}
                      </span>
                      <Button size="sm" onClick={handleGenerateDraft} disabled={generatingDraft}>
                        <Sparkles className="h-3 w-3 mr-1" />
                        {generatingDraft ? 'AI 생성 중...' : selectedDoc.ai_generated_at ? 'AI 초안 재생성' : 'AI 자동 초안 생성'}
                      </Button>
                    </div>
                  )}

                  {/* 인수인계서 콘텐츠 뷰어 */}
                  {selectedDoc.content && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        onClick={() => setContentExpanded((v) => !v)}
                      >
                        <span className="text-sm font-semibold text-gray-700">인수인계서 내용 보기</span>
                        {contentExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </button>
                      {contentExpanded && (
                        <div className="p-4 space-y-4">
                          {selectedDoc.content.overview && (
                            <HandoverSection title="개요">
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedDoc.content.overview}</p>
                            </HandoverSection>
                          )}
                          {selectedDoc.content.projects && selectedDoc.content.projects.length > 0 && (
                            <HandoverSection title="프로젝트">
                              <div className="space-y-3">
                                {selectedDoc.content.projects.map((p, i) => (
                                  <div key={i} className="bg-white border border-gray-100 rounded-lg p-3">
                                    <p className="text-sm font-semibold text-gray-800">{p.name} {p.role && <span className="font-normal text-gray-500 text-xs">— {p.role}</span>}</p>
                                    {p.status && <p className="text-xs text-gray-500 mt-0.5">상태: {p.status}</p>}
                                    {p.handover_points && p.handover_points.length > 0 && (
                                      <ul className="mt-1.5 space-y-0.5 list-disc list-inside">
                                        {p.handover_points.map((pt, j) => <li key={j} className="text-xs text-gray-600">{pt}</li>)}
                                      </ul>
                                    )}
                                    {p.successor_action && p.successor_action.length > 0 && (
                                      <div className="mt-2">
                                        <p className="text-[11px] font-semibold text-brand-600 mb-0.5">후임자 액션</p>
                                        <ul className="space-y-0.5 list-disc list-inside">
                                          {p.successor_action.map((a, j) => <li key={j} className="text-xs text-gray-600">{a}</li>)}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </HandoverSection>
                          )}
                          {selectedDoc.content.daily_summary && (
                            <HandoverSection title="일상 루틴">
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedDoc.content.daily_summary}</p>
                            </HandoverSection>
                          )}
                          {selectedDoc.content.pending_tasks && selectedDoc.content.pending_tasks.length > 0 && (
                            <HandoverSection title="미완료 업무">
                              <div className="space-y-1.5">
                                {selectedDoc.content.pending_tasks.map((t, i) => (
                                  <div key={i} className="flex gap-2 text-sm">
                                    <span className="text-amber-500 shrink-0">•</span>
                                    <div>
                                      <span className="font-medium text-gray-800">{t.title}</span>
                                      {t.note && <span className="text-gray-500 text-xs ml-1">— {t.note}</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </HandoverSection>
                          )}
                          {selectedDoc.content.knowhow && (
                            <HandoverSection title="노하우 · 주의사항">
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedDoc.content.knowhow}</p>
                            </HandoverSection>
                          )}
                          {selectedDoc.content.contacts && selectedDoc.content.contacts.length > 0 && (
                            <HandoverSection title="주요 연락처">
                              <div className="space-y-1">
                                {selectedDoc.content.contacts.map((c, i) => (
                                  <div key={i} className="text-sm text-gray-700">
                                    <span className="font-medium">{c.name}</span>
                                    {c.role && <span className="text-gray-500 text-xs ml-1">({c.role})</span>}
                                    {c.contact && <span className="text-xs text-gray-500 ml-2">{c.contact}</span>}
                                  </div>
                                ))}
                              </div>
                            </HandoverSection>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* 자산 인벤토리 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-brand-600" /> 자산/문서/계정 체크리스트
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    <strong className="text-emerald-600">{returned}</strong> 반납 / <strong className="text-amber-600">{pending}</strong> 대기 / 총 {assets.length}건
                  </span>
                  {isAdmin && (
                    <Button size="sm" onClick={openNewAsset}>
                      <Plus className="h-3 w-3 mr-1" /> 자산 추가
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {assets.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  등록된 자산이 없습니다. {isAdmin ? '"자산 추가" 버튼으로 시작하세요.' : '관리자가 등록할 때까지 기다려주세요.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {assets.map((a) => {
                    const cfg = ASSET_TYPE_OPTIONS.find((o) => o.value === a.asset_type)
                    return (
                      <div key={a.id} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:border-brand-200 transition-colors">
                        <span className="text-xl shrink-0">{cfg?.icon || '🧩'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-800">{a.name}</span>
                            <Badge variant="default" className="text-[10px]">{HANDOVER_ASSET_TYPE_LABELS[a.asset_type]}</Badge>
                            <Badge variant={RETURN_BADGE[a.return_status]} className="text-[10px]">
                              {a.return_status === 'returned' ? <CheckCircle className="h-3 w-3 mr-0.5 inline" /> : a.return_status === 'pending' ? <Clock className="h-3 w-3 mr-0.5 inline" /> : null}
                              {HANDOVER_RETURN_LABELS[a.return_status]}
                            </Badge>
                          </div>
                          {a.location && <p className="text-xs text-gray-600 mt-1">📍 {a.location}</p>}
                          {a.url && (
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-brand-600 hover:underline mt-0.5 inline-flex items-center gap-1 break-all"
                            >
                              <Link2 className="h-3 w-3 shrink-0" /> {a.url.length > 60 ? a.url.slice(0, 60) + '...' : a.url}
                            </a>
                          )}
                          {a.note && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">📝 {a.note}</p>}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => toggleReturnStatus(a)} title="반납 상태 토글">
                            {a.return_status === 'returned' ? '✓' : a.return_status === 'pending' ? '↻' : '—'}
                          </Button>
                          {(isAdmin || profile?.id === a.employee_id) && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => openEditAsset(a)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteAsset(a.id)} className="text-red-500 hover:bg-red-50">
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* 자산 추가/편집 다이얼로그 */}
      <Dialog
        open={showAssetDialog}
        onClose={() => setShowAssetDialog(false)}
        title={editingAssetId ? '자산 수정' : '자산 추가'}
        className="max-w-lg"
      >
        <div className="space-y-3">
          <Select
            label="유형"
            value={assetForm.asset_type}
            onChange={(e) => setAssetForm((p) => ({ ...p, asset_type: e.target.value as HandoverAssetType }))}
            options={ASSET_TYPE_OPTIONS.map(o => ({ value: o.value, label: `${o.icon} ${o.label}` }))}
          />
          <Input
            label="이름 *"
            value={assetForm.name}
            onChange={(e) => setAssetForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="예: 2024 근로계약서 / 맥북 M2"
          />
          <Input
            label="위치"
            value={assetForm.location}
            onChange={(e) => setAssetForm((p) => ({ ...p, location: e.target.value }))}
            placeholder="예: 구글드라이브 > IO인사 > 계약서"
          />
          <Input
            label="URL (선택)"
            value={assetForm.url}
            onChange={(e) => setAssetForm((p) => ({ ...p, url: e.target.value }))}
            placeholder="https://..."
          />
          <Textarea
            label="비고"
            value={assetForm.note}
            onChange={(e) => setAssetForm((p) => ({ ...p, note: e.target.value }))}
            rows={2}
            placeholder="추가 설명이나 전달 사항"
          />
          <Select
            label="반납 상태"
            value={assetForm.return_status}
            onChange={(e) => setAssetForm((p) => ({ ...p, return_status: e.target.value as HandoverReturnStatus }))}
            options={(Object.keys(HANDOVER_RETURN_LABELS) as HandoverReturnStatus[]).map(s => ({
              value: s, label: HANDOVER_RETURN_LABELS[s],
            }))}
          />
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowAssetDialog(false)}>취소</Button>
            <Button onClick={handleSaveAsset}>{editingAssetId ? '수정 저장' : '등록'}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
