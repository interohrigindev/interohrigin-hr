/**
 * 관리자 — 익명 신고 처리 (/admin/system/anonymous-reports)
 *  - HR 전용
 *  - feature_rollouts.anonymous_report = true 일 때만 노출
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
import { Shield, AlertCircle, MessageSquare, Send, Filter } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { FEATURE_KEYS } from '@/types/compliance'
import { logAudit } from '@/lib/audit-logger'
import { formatDate } from '@/lib/utils'

const CATEGORY_LABELS: Record<string, string> = {
  harassment: '직장 내 괴롭힘',
  sexual: '성희롱·성차별',
  discrimination: '차별',
  retaliation: '보복',
  safety: '안전·보건',
  other: '기타',
}

const STATUS_LABELS: Record<string, string> = {
  received: '접수',
  reviewing: '검토중',
  escalated: '상신',
  resolved: '해결',
  closed: '종결',
}

interface ReportRow {
  id: string
  category: string
  subject: string | null
  body: string
  related_persons: string | null
  status: string
  severity: string
  hr_internal_notes: string | null
  assigned_to: string | null
  created_at: string
  resolved_at: string | null
}

export default function AnonymousReportsPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [featureOn, setFeatureOn] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [selected, setSelected] = useState<ReportRow | null>(null)
  const [replies, setReplies] = useState<any[]>([])
  const [filterStatus, setFilterStatus] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [hrReply, setHrReply] = useState('')
  const [posting, setPosting] = useState(false)

  const canAccess = !!profile?.role && ['admin','hr_admin','ceo'].includes(profile.role)

  useEffect(() => { isFeatureEnabled(FEATURE_KEYS.ANONYMOUS_REPORT).then(setFeatureOn) }, [])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('anonymous_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data } = await q
    setRows((data || []) as ReportRow[])
    setLoading(false)
  }

  useEffect(() => { if (featureOn && canAccess) load() }, [featureOn, canAccess, filterStatus])

  async function openDetail(r: ReportRow) {
    setSelected(r)
    setInternalNotes(r.hr_internal_notes || '')
    const { data } = await supabase
      .from('anonymous_report_replies')
      .select('*')
      .eq('report_id', r.id)
      .order('created_at', { ascending: true })
    setReplies(data || [])
  }

  async function updateReport(patch: Partial<ReportRow>) {
    if (!selected) return
    const { error } = await supabase
      .from('anonymous_reports')
      .update(patch)
      .eq('id', selected.id)
    if (error) { toast('업데이트 실패: ' + error.message, 'error'); return }
    await logAudit({
      action: 'update', entity: 'anonymous_report', entityId: selected.id,
      diff: `상태/내부메모 갱신 — ${JSON.stringify(patch)}`,
    })
    toast('업데이트 완료', 'success')
    setSelected({ ...selected, ...patch } as ReportRow)
    load()
  }

  async function sendHrReply() {
    if (!selected || !hrReply.trim()) return
    setPosting(true)
    const { error } = await supabase.rpc('reply_anonymous_report_hr', {
      p_report_id: selected.id,
      p_body: hrReply.trim(),
    })
    setPosting(false)
    if (error) { toast('답변 실패: ' + error.message, 'error'); return }
    setHrReply('')
    openDetail(selected)
    toast('답변 전송 완료', 'success')
  }

  if (featureOn === null || loading) return <PageSpinner />

  if (!featureOn) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-amber-800">익명 신고 핫라인 비활성 상태</h2>
        <p className="text-sm text-amber-700 mt-1">시스템 관리 &gt; 기능 토글에서 활성화 후 사용하세요.</p>
      </div>
    )
  }
  if (!canAccess) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 text-center text-sm text-rose-800">
        HR/관리자/대표만 접근할 수 있습니다.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-brand-500" /> 익명 신고 처리
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">제보자 신원 정보는 저장되지 않습니다. 토큰 기반 응답.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" /> 필터</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            {['', 'received', 'reviewing', 'escalated', 'resolved', 'closed'].map((s) => (
              <button
                key={s || 'all'}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  filterStatus === s ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s ? STATUS_LABELS[s] : '전체'}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">접수 목록 ({rows.length}건)</CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[600px] overflow-y-auto">
            {rows.length === 0 && <p className="text-center text-gray-400 py-8">접수된 제보 없음</p>}
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => openDetail(r)}
                className={`block w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${
                  selected?.id === r.id ? 'bg-brand-50' : ''
                }`}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="info">{CATEGORY_LABELS[r.category]}</Badge>
                  <Badge variant={r.status === 'resolved' ? 'success' : r.status === 'closed' ? 'default' : 'warning'}>
                    {STATUS_LABELS[r.status]}
                  </Badge>
                  <span className="text-[11px] text-gray-400">{formatDate(r.created_at, 'yyyy.MM.dd HH:mm')}</span>
                </div>
                {r.subject && <div className="font-semibold text-sm text-gray-900">{r.subject}</div>}
                <p className="text-xs text-gray-600 line-clamp-2 break-keep mt-1">{r.body}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">상세 처리</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap break-keep">{selected.body}</div>
              {selected.related_persons && (
                <div className="text-xs text-gray-600">관련자: {selected.related_persons}</div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-medium text-gray-700">상태:</label>
                {Object.entries(STATUS_LABELS).map(([s, label]) => (
                  <button
                    key={s}
                    onClick={() => updateReport({ status: s })}
                    className={`px-2 py-0.5 rounded text-xs border ${
                      selected.status === s ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >{label}</button>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">HR 내부 메모 (제보자에게 보이지 않음)</label>
                <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={3} />
                <Button size="sm" variant="outline" className="mt-1"
                  onClick={() => updateReport({ hr_internal_notes: internalNotes })}>
                  내부 메모 저장
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" /> 대화 ({replies.length}건)
                </h3>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {replies.map((r) => (
                    <div key={r.id} className={`p-2 rounded text-xs ${
                      r.from_role === 'hr' ? 'bg-brand-50 ml-4' : 'bg-gray-100 mr-4'
                    }`}>
                      <div className="text-[10px] text-gray-500 mb-0.5">
                        {r.from_role === 'hr' ? 'HR' : '제보자'} · {formatDate(r.created_at, 'MM.dd HH:mm')}
                      </div>
                      <div className="whitespace-pre-wrap break-keep">{r.body}</div>
                    </div>
                  ))}
                </div>
                <Textarea
                  value={hrReply}
                  onChange={(e) => setHrReply(e.target.value)}
                  placeholder="HR 답변 (토큰 기반으로 제보자에게 전달됨)"
                  rows={3}
                />
                <Button size="sm" onClick={sendHrReply} disabled={posting || !hrReply.trim()}>
                  <Send className="h-3 w-3 mr-1" /> HR 답변 전송
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
