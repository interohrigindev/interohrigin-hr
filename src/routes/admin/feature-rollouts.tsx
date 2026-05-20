/**
 * 시스템 관리 > 기능 토글 (feature_rollouts)
 *  - 법적 리스크 대응 모듈 등 신규 기능을 모듈 단위로 ON/OFF
 *  - 권한: admin / hr_admin / ceo 만
 *  - 모든 토글은 SECURITY DEFINER RPC + audit_logs 기록
 */
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { ShieldCheck, ShieldOff, Info, RefreshCw } from 'lucide-react'
import { listAllFeatures, setFeatureRollout, invalidateFeatureCache } from '@/lib/feature-flags'
import type { FeatureRolloutRow } from '@/types/compliance'
import { formatDate } from '@/lib/utils'

export default function FeatureRolloutsPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [rows, setRows] = useState<FeatureRolloutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)

  const canToggle = !!profile?.role && ['admin','hr_admin','ceo'].includes(profile.role)

  async function load() {
    setLoading(true)
    invalidateFeatureCache()
    const list = await listAllFeatures()
    setRows(list.sort((a, b) => a.feature_key.localeCompare(b.feature_key)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleToggle(row: FeatureRolloutRow, next: boolean) {
    if (!canToggle) {
      toast('권한이 없습니다 (admin/hr_admin/ceo 만)', 'error')
      return
    }
    const confirmMsg = next
      ? `'${row.display_name}' 기능을 활성화하시겠습니까?\n\n활성화 시점부터 사용자 화면에 노출됩니다.`
      : `'${row.display_name}' 기능을 비활성화하시겠습니까?\n\n진행 중인 사용자 흐름에 영향을 줄 수 있습니다.`
    if (!confirm(confirmMsg)) return

    setTogglingKey(row.feature_key)
    const result = await setFeatureRollout({
      featureKey: row.feature_key,
      isEnabled: next,
      scope: next ? (row.scope === 'none' ? 'admin_only' : row.scope) : 'none',
      scopeFilter: row.scope_filter,
    })
    if (!result.ok) {
      toast(`토글 실패: ${result.error || '알 수 없는 오류'}`, 'error')
      setTogglingKey(null)
    } else {
      toast(`${row.display_name} ${next ? '활성화' : '비활성화'} 완료 — 사이드바 갱신 중...`, 'success')
      await load()
      setTogglingKey(null)
      // 사이드바 즉시 반영 — feature toggle 변경 후 페이지 강제 새로고침
      // (Sidebar 의 enabledFeatures state 가 mount 시 1회만 fetch 하므로)
      setTimeout(() => { window.location.reload() }, 600)
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">기능 토글</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            신규 모듈을 단계적으로 활성화/비활성화 합니다. 기본값은 모두 OFF — 활성화는 명시적 승인 필요.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1" /> 새로고침
        </Button>
      </div>

      {!canToggle && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>현재 역할({profile?.role || '없음'})에서는 조회만 가능합니다. 토글은 admin/hr_admin/ceo 만 가능.</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rows.map((row) => (
          <Card key={row.feature_key} className={row.is_enabled ? 'border-emerald-300' : 'border-gray-200'}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  {row.is_enabled
                    ? <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    : <ShieldOff className="h-4 w-4 text-gray-400" />}
                  {row.display_name}
                </CardTitle>
                <Badge variant={row.is_enabled ? 'success' : 'default'}>
                  {row.is_enabled ? '활성' : '비활성'}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1 break-keep">{row.description || '설명 없음'}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                <div><span className="text-gray-400">키:</span> <code className="text-[10px]">{row.feature_key}</code></div>
                <div><span className="text-gray-400">범위:</span> {row.scope}</div>
                {row.enabled_at && (
                  <div className="col-span-2">
                    <span className="text-gray-400">최근 활성화:</span> {formatDate(row.enabled_at, 'yyyy.MM.dd HH:mm')}
                  </div>
                )}
                {row.notes && (
                  <div className="col-span-2 text-gray-500 italic">{row.notes}</div>
                )}
              </div>
              <div className="flex justify-end gap-1.5 pt-1">
                {row.is_enabled ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggle(row, false)}
                    disabled={!canToggle || togglingKey === row.feature_key}
                    className="text-rose-600 border-rose-200 hover:bg-rose-50"
                  >
                    비활성화
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleToggle(row, true)}
                    disabled={!canToggle || togglingKey === row.feature_key}
                  >
                    활성화
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-800 space-y-1">
        <p className="font-semibold flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> 운영 가이드</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>모든 토글은 감사 로그에 기록됩니다 (시스템 관리 &gt; 감사 로그 참조).</li>
          <li>기능이 비활성화되어도 기존 코드/데이터에는 영향 없음 — UI 노출만 차단.</li>
          <li>활성화 시점부터 신규 데이터/알림이 생성될 수 있으므로 신중히 결정하세요.</li>
          <li>본격 운영 전 법무/노무 검토 필요한 모듈은 별도 확인 후 활성화.</li>
        </ul>
      </div>
    </div>
  )
}
