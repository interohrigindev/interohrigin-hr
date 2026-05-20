/**
 * 시스템 관리 > 감사 로그 (audit_logs)
 *  - 모든 민감 액션 변경 이력 조회
 *  - 권한: admin / hr_admin / ceo / director / division_head
 *  - 활성화 조건: feature_rollouts.audit_log_view = true (기본 ON)
 */
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { ScrollText, RefreshCw, Filter, Download, AlertCircle } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { logAudit } from '@/lib/audit-logger'
import { FEATURE_KEYS } from '@/types/compliance'
import type { AuditLogRow } from '@/types/compliance'
import { formatDate } from '@/lib/utils'

interface RowWithActor extends AuditLogRow {
  actor_name?: string | null
}

const PAGE_SIZE = 50

export default function AuditLogsPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [rows, setRows] = useState<RowWithActor[]>([])
  const [loading, setLoading] = useState(true)
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null)
  const [filterAction, setFilterAction] = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [filterActor, setFilterActor] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const canExport = !!profile?.role && ['admin','hr_admin','ceo'].includes(profile.role)

  useEffect(() => {
    isFeatureEnabled(FEATURE_KEYS.AUDIT_LOG_VIEW).then(setFeatureEnabled)
  }, [])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (filterAction.trim()) q = q.ilike('action_type', `%${filterAction.trim()}%`)
    if (filterEntity.trim()) q = q.ilike('entity_type', `%${filterEntity.trim()}%`)

    const { data, error, count } = await q
    if (error) {
      toast(`로딩 실패: ${error.message}`, 'error')
      setLoading(false)
      return
    }
    const logs = (data || []) as AuditLogRow[]
    setTotalCount(count || 0)

    // actor 이름 조인 (별도 쿼리 — employees 는 READ ONLY)
    const actorIds = Array.from(new Set(logs.map((r) => r.actor_uid).filter(Boolean))) as string[]
    let nameMap = new Map<string, string>()
    if (actorIds.length > 0) {
      const { data: emps } = await supabase
        .from('employees')
        .select('id, name')
        .in('id', actorIds)
      ;(emps || []).forEach((e: { id: string; name: string }) => nameMap.set(e.id, e.name))
    }

    let merged: RowWithActor[] = logs.map((r) => ({
      ...r,
      actor_name: r.actor_uid ? nameMap.get(r.actor_uid) || null : null,
    }))

    // actor 이름 필터 (클라이언트 사이드 — 적은 결과)
    if (filterActor.trim()) {
      const needle = filterActor.trim()
      merged = merged.filter((r) => (r.actor_name || '').includes(needle))
    }

    setRows(merged)
    setLoading(false)
  }

  useEffect(() => { load() }, [page])

  function applyFilters() {
    setPage(0)
    load()
  }

  function exportCsv() {
    if (!canExport) {
      toast('내보내기 권한 없음', 'error')
      return
    }
    const reason = prompt('내보내기 사유를 입력하세요 (감사 기록용):')
    if (!reason) return

    const header = ['시각', '액션', '엔티티', '엔티티 ID', '작성자', '역할', '요약']
    const lines = [header.join(',')]
    for (const r of rows) {
      const fields = [
        formatDate(r.created_at, 'yyyy.MM.dd HH:mm:ss'),
        r.action_type,
        r.entity_type,
        r.entity_id || '',
        r.actor_name || r.actor_uid || '',
        r.actor_role || '',
        (r.diff_summary || '').replace(/"/g, '""'),
      ].map((s) => `"${String(s).replace(/"/g, '""')}"`)
      lines.push(fields.join(','))
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs-${formatDate(new Date().toISOString(), 'yyyy.MM.dd-HHmm')}.csv`
    a.click()
    URL.revokeObjectURL(url)

    // 내보내기 자체도 감사 기록
    logAudit({
      action: 'export',
      entity: 'audit_logs',
      diff: `CSV ${rows.length}건 내보내기 — 사유: ${reason}`,
    })
    // audit_exports 별도 기록
    supabase.from('audit_exports').insert({
      filter_summary: { action: filterAction, entity: filterEntity, actor: filterActor, page },
      row_count: rows.length,
      format: 'csv',
      reason,
    })

    toast(`${rows.length}건 CSV 내보내기 완료`, 'success')
  }

  if (loading && rows.length === 0) return <PageSpinner />

  // 기능 비활성 (audit_log_view) — 안내 후 종료
  if (featureEnabled === false) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-amber-800">감사 로그 조회 기능 비활성 상태</h2>
        <p className="text-sm text-amber-700 mt-1">시스템 관리 &gt; 기능 토글에서 활성화 후 사용하세요.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-brand-500" /> 감사 로그
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            민감 데이터 변경·승인·발송 이력 (변경 전/후, 작성자, 시각 영구 보존)
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" /> 새로고침
          </Button>
          {canExport && (
            <Button size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" /> CSV 내보내기
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> 필터
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Input
              placeholder="액션 (예: update, approve)"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            />
            <Input
              placeholder="엔티티 (예: leave_promotion)"
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
            />
            <Input
              placeholder="작성자 이름"
              value={filterActor}
              onChange={(e) => setFilterActor(e.target.value)}
            />
            <Button onClick={applyFilters}>필터 적용</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 w-40">시각</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 w-24">액션</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 w-32">엔티티</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 w-28">작성자</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">요약</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-8">기록 없음</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      {formatDate(r.created_at, 'yyyy.MM.dd HH:mm:ss')}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={badgeVariantForAction(r.action_type)}>{r.action_type}</Badge>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      <code className="text-[11px]">{r.entity_type}</code>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.actor_name || <span className="text-gray-400">시스템</span>}
                      {r.actor_role && <span className="text-[10px] text-gray-400 ml-1">({r.actor_role})</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-700 break-keep">
                      {r.diff_summary || <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between p-3 border-t bg-gray-50 text-xs text-gray-600">
              <span>총 {totalCount}건 · {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</Button>
                <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage(page + 1)}>다음</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function badgeVariantForAction(action: string): 'success' | 'danger' | 'info' | 'warning' | 'default' | 'purple' {
  if (action === 'create' || action === 'enable') return 'success'
  if (action === 'delete' || action === 'disable' || action === 'reject') return 'danger'
  if (action === 'update') return 'info'
  if (action === 'approve') return 'purple'
  if (action === 'send' || action === 'export') return 'warning'
  return 'default'
}
