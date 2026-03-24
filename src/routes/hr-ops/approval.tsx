import { useState, useEffect, useMemo } from 'react'
import {
  FileCheck, ClipboardList, Clock, CheckCircle, XCircle,
  Plus, Search, ChevronRight, User, ArrowRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { Textarea } from '@/components/ui/Textarea'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'

/* ────── Types ────── */

interface ApprovalTemplate {
  id: string
  name: string
  description: string | null
  fields: { key: string; label: string; type: string; required?: boolean }[]
  approval_flow: { step: number; role: string; name?: string }[]
  category: string | null
  is_active: boolean
}

interface ApprovalHistoryEntry {
  step: number
  role: string
  name?: string
  action: 'approved' | 'rejected' | 'pending'
  comment?: string
  acted_at?: string
}

interface ApprovalRequest {
  id: string
  template_id: string
  requester_id: string
  title: string
  data: Record<string, any>
  attachments: string[] | null
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled'
  current_step: number
  approval_history: ApprovalHistoryEntry[]
  final_approved_at: string | null
  final_approved_by: string | null
  created_at: string
  updated_at: string
}

interface Employee {
  id: string
  name: string
  position: string | null
}

/* ────── Constants ────── */

type TabKey = 'pending' | 'in_review' | 'completed'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: '결재 대기' },
  { key: 'in_review', label: '진행중' },
  { key: 'completed', label: '완료' },
]

const STATUS_CONFIG: Record<string, { color: string; border: string; badge: 'warning' | 'info' | 'success' | 'danger' | 'default'; label: string }> = {
  pending:    { color: 'text-amber-600',   border: 'border-l-amber-500',   badge: 'warning', label: '대기' },
  in_review:  { color: 'text-blue-600',    border: 'border-l-blue-500',    badge: 'info',    label: '진행중' },
  approved:   { color: 'text-emerald-600', border: 'border-l-emerald-500', badge: 'success', label: '승인' },
  rejected:   { color: 'text-red-600',     border: 'border-l-red-500',     badge: 'danger',  label: '반려' },
  cancelled:  { color: 'text-gray-500',    border: 'border-l-gray-400',    badge: 'default', label: '취소' },
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace(/\.$/, '')

/* ────── Component ────── */

export default function ApprovalManagementPage() {
  const { toast } = useToast()
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [templates, setTemplates] = useState<ApprovalTemplate[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('pending')
  const [searchQuery, setSearchQuery] = useState('')

  // Detail
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null)
  const [actionComment, setActionComment] = useState('')
  const [processing, setProcessing] = useState(false)

  // New request dialog
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newTemplateId, setNewTemplateId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newData, setNewData] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /* ── Fetch ── */

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [reqRes, tplRes, empRes] = await Promise.all([
      supabase.from('approval_requests').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('approval_templates').select('*').eq('is_active', true).order('name'),
      supabase.from('employees').select('id, name, position').eq('is_active', true).order('name'),
    ])
    setRequests((reqRes.data || []) as ApprovalRequest[])
    setTemplates((tplRes.data || []) as ApprovalTemplate[])
    setEmployees((empRes.data || []) as Employee[])
    setLoading(false)
  }

  /* ── Helpers ── */

  const getEmpName = (id: string) => employees.find((e) => e.id === id)?.name || '-'
  const getTplName = (id: string) => templates.find((t) => t.id === id)?.name || '-'
  const getTemplate = (id: string) => templates.find((t) => t.id === id)

  /* ── Stats ── */

  const stats = useMemo(() => {
    const total = requests.length
    const pending = requests.filter((r) => r.status === 'pending').length
    const inReview = requests.filter((r) => r.status === 'in_review').length
    const approved = requests.filter((r) => r.status === 'approved').length
    const rejected = requests.filter((r) => r.status === 'rejected').length
    return { total, pending, inReview, approved, rejected }
  }, [requests])

  /* ── Filtered ── */

  const filteredRequests = useMemo(() => {
    let result = requests
    if (activeTab === 'pending') result = result.filter((r) => r.status === 'pending')
    else if (activeTab === 'in_review') result = result.filter((r) => r.status === 'in_review')
    else result = result.filter((r) => r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled')

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        getEmpName(r.requester_id).toLowerCase().includes(q) ||
        getTplName(r.template_id).toLowerCase().includes(q)
      )
    }
    return result
  }, [requests, activeTab, searchQuery, employees, templates])

  /* ── Actions ── */

  async function handleAction(requestId: string, action: 'approved' | 'rejected') {
    setProcessing(true)
    const request = requests.find((r) => r.id === requestId)
    if (!request) { setProcessing(false); return }

    const tpl = getTemplate(request.template_id)
    const totalSteps = tpl?.approval_flow?.length || 1
    const currentStep = request.current_step || 1

    const newHistoryEntry: ApprovalHistoryEntry = {
      step: currentStep,
      role: tpl?.approval_flow?.[currentStep - 1]?.role || '결재자',
      action,
      comment: actionComment || undefined,
      acted_at: new Date().toISOString(),
    }

    const updatedHistory = [...(request.approval_history || []), newHistoryEntry]

    let newStatus: ApprovalRequest['status'] = request.status
    let newStep = currentStep
    let finalApprovedAt: string | null = null
    let finalApprovedBy: string | null = null

    if (action === 'rejected') {
      newStatus = 'rejected'
    } else if (currentStep >= totalSteps) {
      newStatus = 'approved'
      finalApprovedAt = new Date().toISOString()
    } else {
      newStatus = 'in_review'
      newStep = currentStep + 1
    }

    const { error } = await supabase.from('approval_requests').update({
      status: newStatus,
      current_step: newStep,
      approval_history: updatedHistory,
      final_approved_at: finalApprovedAt,
      final_approved_by: finalApprovedBy,
      updated_at: new Date().toISOString(),
    }).eq('id', requestId)

    setProcessing(false)
    if (error) { toast('처리 실패: ' + error.message, 'error'); return }
    toast(action === 'approved' ? '승인 완료' : '반려 완료', 'success')
    setActionComment('')
    setSelectedRequest(null)
    fetchData()
  }

  /* ── New request ── */

  const selectedTemplate = getTemplate(newTemplateId)

  function resetNewForm() {
    setNewTemplateId('')
    setNewTitle('')
    setNewData({})
  }

  async function handleCreateRequest() {
    if (!newTemplateId || !newTitle) {
      toast('양식과 제목을 입력하세요', 'error')
      return
    }
    // Validate required fields
    if (selectedTemplate) {
      for (const field of selectedTemplate.fields) {
        if (field.required && !newData[field.key]) {
          toast(`${field.label} 항목을 입력하세요`, 'error')
          return
        }
      }
    }

    setSaving(true)
    const { error } = await supabase.from('approval_requests').insert({
      template_id: newTemplateId,
      title: newTitle,
      data: newData,
      attachments: null,
      status: 'pending',
      current_step: 1,
      approval_history: [],
    })
    setSaving(false)
    if (error) { toast('신청 실패: ' + error.message, 'error'); return }
    toast('결재 신청이 완료되었습니다', 'success')
    setShowNewDialog(false)
    resetNewForm()
    fetchData()
  }

  /* ── Render ── */

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">전자 결재</h1>
          <p className="text-sm text-gray-500 mt-0.5">결재 요청을 관리하고 승인/반려 처리합니다</p>
        </div>
        <Button onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> 새 결재 신청
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-gray-500">전체 신청</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{stats.total}건</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-[11px] text-gray-500">결재 대기</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{stats.pending}건</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] text-gray-500">승인</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{stats.approved}건</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-[11px] text-gray-500">반려</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{stats.rejected}건</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {TABS.map(({ key, label }) => {
            const count = key === 'pending' ? stats.pending : key === 'in_review' ? stats.inReview : stats.approved + stats.rejected
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label} {count > 0 && <span className="ml-1 text-[10px]">({count})</span>}
              </button>
            )
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="제목, 신청자 검색..."
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-56 focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      {/* Request List */}
      <div className="space-y-2">
        {filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400 text-sm">
              해당 조건의 결재 건이 없습니다
            </CardContent>
          </Card>
        ) : (
          filteredRequests.map((req) => {
            const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending
            const tpl = getTemplate(req.template_id)
            const totalSteps = tpl?.approval_flow?.length || 1

            return (
              <Card
                key={req.id}
                className={`border-l-4 ${cfg.border} cursor-pointer hover:shadow-md transition-shadow`}
                onClick={() => setSelectedRequest(req)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900 truncate">{req.title}</span>
                        <Badge variant={cfg.badge} className="text-[10px] shrink-0">{cfg.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {getEmpName(req.requester_id)}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileCheck className="h-3 w-3" />
                          {getTplName(req.template_id)}
                        </span>
                        <span>단계 {req.current_step}/{totalSteps}</span>
                        <span>{fmtDate(req.created_at)}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedRequest}
        onClose={() => { setSelectedRequest(null); setActionComment('') }}
        title="결재 상세"
        className="max-w-lg"
      >
        {selectedRequest && (() => {
          const req = selectedRequest
          const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending
          const tpl = getTemplate(req.template_id)
          const totalSteps = tpl?.approval_flow?.length || 1
          const isPending = req.status === 'pending' || req.status === 'in_review'

          return (
            <div className="space-y-5">
              {/* Title + Status */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-bold text-gray-900">{req.title}</h3>
                  <Badge variant={cfg.badge}>{cfg.label}</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                  <span>신청자: {getEmpName(req.requester_id)}</span>
                  <span>양식: {getTplName(req.template_id)}</span>
                  <span>신청일: {fmtDate(req.created_at)}</span>
                </div>
              </div>

              {/* Request Data */}
              {req.data && Object.keys(req.data).length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 mb-2">신청 내용</p>
                  {Object.entries(req.data).map(([key, value]) => {
                    const fieldLabel = tpl?.fields?.find((f) => f.key === key)?.label || key
                    return (
                      <div key={key} className="flex text-sm">
                        <span className="text-gray-500 w-28 shrink-0">{fieldLabel}</span>
                        <span className="text-gray-900">{String(value)}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Approval Flow Progress */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">결재 흐름 ({req.current_step}/{totalSteps}단계)</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {(tpl?.approval_flow || []).map((step, idx) => {
                    const historyEntry = (req.approval_history || []).find((h) => h.step === step.step)
                    const isActive = step.step === req.current_step && isPending
                    let dotColor = 'bg-gray-300'
                    if (historyEntry?.action === 'approved') dotColor = 'bg-emerald-500'
                    else if (historyEntry?.action === 'rejected') dotColor = 'bg-red-500'
                    else if (isActive) dotColor = 'bg-blue-500 animate-pulse'

                    return (
                      <div key={idx} className="flex items-center gap-1">
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full ${dotColor}`} />
                          <span className="text-[10px] text-gray-500 mt-0.5">{step.role}</span>
                        </div>
                        {idx < (tpl?.approval_flow?.length || 1) - 1 && (
                          <ArrowRight className="h-3 w-3 text-gray-300 mb-3" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Approval History */}
              {req.approval_history && req.approval_history.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">처리 이력</p>
                  <div className="space-y-2">
                    {req.approval_history.map((entry, idx) => {
                      const entryCfg = STATUS_CONFIG[entry.action] || STATUS_CONFIG.pending
                      return (
                        <div key={idx} className="flex items-start gap-2 text-sm">
                          <Badge variant={entryCfg.badge} className="text-[10px] mt-0.5 shrink-0">
                            {entryCfg.label}
                          </Badge>
                          <div className="min-w-0">
                            <span className="text-gray-700">{entry.role}</span>
                            {entry.comment && <p className="text-xs text-gray-500 mt-0.5">{entry.comment}</p>}
                            {entry.acted_at && <p className="text-[10px] text-gray-400">{fmtDate(entry.acted_at)}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Action Area */}
              {isPending && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <Textarea
                    label="의견 (선택)"
                    value={actionComment}
                    onChange={(e) => setActionComment(e.target.value)}
                    placeholder="승인/반려 의견을 입력하세요"
                    rows={2}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={processing}
                      onClick={() => handleAction(req.id, 'rejected')}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      반려
                    </Button>
                    <Button
                      size="sm"
                      disabled={processing}
                      onClick={() => handleAction(req.id, 'approved')}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      {processing ? '처리중...' : '승인'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </Dialog>

      {/* New Request Dialog */}
      <Dialog
        open={showNewDialog}
        onClose={() => { setShowNewDialog(false); resetNewForm() }}
        title="새 결재 신청"
        className="max-w-md"
      >
        <div className="space-y-4">
          <Select
            label="결재 양식 *"
            value={newTemplateId}
            onChange={(e) => { setNewTemplateId(e.target.value); setNewData({}) }}
            options={[
              { value: '', label: '양식을 선택하세요' },
              ...templates.map((t) => ({ value: t.id, label: `${t.name}${t.category ? ` (${t.category})` : ''}` })),
            ]}
          />
          <Input
            label="제목 *"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="결재 제목을 입력하세요"
          />

          {/* Dynamic fields from template */}
          {selectedTemplate && selectedTemplate.fields.length > 0 && (
            <div className="space-y-3 bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500">양식 항목</p>
              {selectedTemplate.fields.map((field) => {
                if (field.type === 'textarea') {
                  return (
                    <Textarea
                      key={field.key}
                      label={`${field.label}${field.required ? ' *' : ''}`}
                      value={newData[field.key] || ''}
                      onChange={(e) => setNewData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      rows={3}
                    />
                  )
                }
                return (
                  <Input
                    key={field.key}
                    label={`${field.label}${field.required ? ' *' : ''}`}
                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                    value={newData[field.key] || ''}
                    onChange={(e) => setNewData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  />
                )
              })}
            </div>
          )}

          {/* Approval flow preview */}
          {selectedTemplate && selectedTemplate.approval_flow.length > 0 && (
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-600 mb-1.5">결재 흐름</p>
              <div className="flex items-center gap-1 text-xs text-blue-700">
                {selectedTemplate.approval_flow.map((step, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    <span className="bg-blue-100 px-2 py-0.5 rounded-full">{step.role}</span>
                    {idx < selectedTemplate.approval_flow.length - 1 && <ArrowRight className="h-3 w-3" />}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowNewDialog(false); resetNewForm() }}>취소</Button>
            <Button onClick={handleCreateRequest} disabled={saving}>
              {saving ? '처리중...' : '신청'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
