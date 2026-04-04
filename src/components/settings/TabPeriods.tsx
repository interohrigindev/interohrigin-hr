import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useEvaluationPeriods } from '@/hooks/useEvaluation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { PERIOD_STATUS_LABELS } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { Plus, Play, Lock, Unlock, Eye } from 'lucide-react'

export default function TabPeriods() {
  const { periods, loading, refetch } = useEvaluationPeriods()
  const { toast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [autoGenerate, setAutoGenerate] = useState(true)
  const [publishDialogPeriodId, setPublishDialogPeriodId] = useState<string | null>(null)
  const [publishTargets, setPublishTargets] = useState<any[]>([])
  const [publishLoading, setPublishLoading] = useState(false)
  const [form, setForm] = useState({
    year: new Date().getFullYear(),
    quarter: 1,
    start_date: '',
    end_date: '',
  })

  async function handleCreate() {
    setCreating(true)
    const { data, error } = await supabase
      .from('evaluation_periods')
      .insert({
        year: form.year,
        quarter: form.quarter,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      })
      .select()
      .single()

    if (error) {
      toast('생성 실패: ' + error.message, 'error')
    } else {
      toast('평가 기간이 생성되었습니다')
      if (autoGenerate && data) {
        await handleGenerateSheets(data.id)
      }
      setShowCreate(false)
      setForm({ year: new Date().getFullYear(), quarter: 1, start_date: '', end_date: '' })
      refetch()
    }
    setCreating(false)
  }

  async function handleStatusChange(periodId: string, status: string) {
    const { error } = await supabase
      .from('evaluation_periods')
      .update({ status })
      .eq('id', periodId)

    if (error) {
      toast('상태 변경 실패: ' + error.message, 'error')
    } else {
      toast(`상태가 "${PERIOD_STATUS_LABELS[status]}"(으)로 변경되었습니다`)
      refetch()
    }
  }

  async function handleGenerateSheets(periodId: string) {
    setGenerating(periodId)
    const { error } = await supabase.rpc('generate_evaluation_sheets', { p_period_id: periodId })
    if (error) {
      toast('평가 시트 생성 실패: ' + error.message, 'error')
    } else {
      toast('평가 시트가 생성되었습니다')
    }
    setGenerating(null)
  }

  async function handleToggleLock(periodId: string, currentlyLocked: boolean) {
    const { error } = await supabase
      .from('evaluation_periods')
      .update({
        is_locked: !currentlyLocked,
        locked_at: !currentlyLocked ? new Date().toISOString() : null,
      })
      .eq('id', periodId)
    if (error) { toast('잠금 상태 변경 실패: ' + error.message, 'error'); return }
    toast(!currentlyLocked ? '평가 기간이 잠겼습니다' : '평가 기간 잠금이 해제되었습니다')
    refetch()
  }

  async function openPublishDialog(periodId: string) {
    setPublishDialogPeriodId(periodId)
    setPublishLoading(true)
    const { data } = await supabase
      .from('evaluation_targets')
      .select('*, employee:employees!evaluation_targets_employee_id_fkey(id, name)')
      .eq('period_id', periodId)
      .eq('status', 'completed')
      .order('created_at')
    setPublishTargets(data ?? [])
    setPublishLoading(false)
  }

  async function togglePublish(targetId: string, currentlyPublished: boolean) {
    const { error } = await supabase
      .from('evaluation_targets')
      .update({
        is_published: !currentlyPublished,
        published_at: !currentlyPublished ? new Date().toISOString() : null,
      })
      .eq('id', targetId)
    if (error) { toast('공개 상태 변경 실패: ' + error.message, 'error'); return }
    if (publishDialogPeriodId) openPublishDialog(publishDialogPeriodId)
  }

  async function publishAll() {
    const unpublished = publishTargets.filter(t => !t.is_published)
    for (const t of unpublished) {
      await supabase.from('evaluation_targets').update({
        is_published: true,
        published_at: new Date().toISOString(),
      }).eq('id', t.id)
    }
    toast(`${unpublished.length}명의 결과가 공개되었습니다`)
    if (publishDialogPeriodId) openPublishDialog(publishDialogPeriodId)
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">평가 기간을 생성하고 상태를 관리합니다.</p>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />
          평가 기간 추가
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>평가 기간 목록</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {periods.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-gray-400">
              등록된 평가 기간이 없습니다
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-6 py-3 text-left font-medium text-gray-500">평가 기간</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">기간</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">상태</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">상태 변경</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">작업</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">잠금</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">결과 공개</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period) => (
                    <tr key={period.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {period.year}년 {period.quarter}분기
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {period.start_date && period.end_date
                          ? `${formatDate(period.start_date, 'MM/dd')} ~ ${formatDate(period.end_date, 'MM/dd')}`
                          : '-'}
                      </td>
                      <td className="px-6 py-3">
                        <Badge
                          variant={
                            period.status === 'in_progress'
                              ? 'success'
                              : period.status === 'completed'
                              ? 'default'
                              : 'warning'
                          }
                        >
                          {PERIOD_STATUS_LABELS[period.status]}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        <Select
                          options={[
                            { value: 'draft', label: '준비 중' },
                            { value: 'in_progress', label: '진행 중' },
                            { value: 'completed', label: '종료' },
                          ]}
                          value={period.status}
                          onChange={(e) => handleStatusChange(period.id, e.target.value)}
                          className="w-28"
                        />
                      </td>
                      <td className="px-6 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleGenerateSheets(period.id)}
                          disabled={generating === period.id}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          {generating === period.id ? '생성 중...' : '시트 생성'}
                        </Button>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleLock(period.id, !!period.is_locked)}
                            className={`p-1.5 rounded-md transition-colors ${
                              period.is_locked
                                ? 'text-red-600 bg-red-50 hover:bg-red-100'
                                : 'text-gray-400 hover:bg-gray-100'
                            }`}
                            title={period.is_locked ? '잠금 해제' : '잠금'}
                          >
                            {period.is_locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                          </button>
                          {period.is_locked && period.locked_at && (
                            <span className="text-xs text-gray-400">{formatDate(period.locked_at, 'MM/dd HH:mm')}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openPublishDialog(period.id)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          결과 공개
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="평가 기간 추가">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="period-year"
              label="연도"
              type="number"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })}
            />
            <Select
              id="period-quarter"
              label="분기"
              options={[
                { value: '1', label: '1분기' },
                { value: '2', label: '2분기' },
                { value: '3', label: '3분기' },
                { value: '4', label: '4분기' },
              ]}
              value={String(form.quarter)}
              onChange={(e) => setForm({ ...form, quarter: parseInt(e.target.value) })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="period-start"
              label="시작일"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
            <Input
              id="period-end"
              label="종료일"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={autoGenerate}
              onChange={(e) => setAutoGenerate(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            생성 시 평가 시트 자동 생성 (generate_evaluation_sheets)
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              취소
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? '생성 중...' : '생성'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!publishDialogPeriodId}
        onClose={() => setPublishDialogPeriodId(null)}
        title="결과 공개 관리"
      >
        <div className="space-y-4">
          {publishLoading ? (
            <div className="flex h-24 items-center justify-center text-sm text-gray-400">
              불러오는 중...
            </div>
          ) : publishTargets.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-gray-400">
              완료된 평가 대상이 없습니다
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  총 {publishTargets.length}명 / 공개 {publishTargets.filter(t => t.is_published).length}명
                </span>
                <Button size="sm" onClick={publishAll} disabled={publishTargets.every(t => t.is_published)}>
                  일괄 공개
                </Button>
              </div>
              <div className="max-h-80 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 sticky top-0">
                      <th className="px-4 py-2 text-left font-medium text-gray-500">이름</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">등급</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">점수</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-500">공개</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publishTargets.map((target) => (
                      <tr key={target.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">
                          {target.employee?.name ?? '-'}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{target.grade ?? '-'}</td>
                        <td className="px-4 py-2 text-gray-600">{target.final_score ?? '-'}</td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => togglePublish(target.id, !!target.is_published)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              target.is_published ? 'bg-brand-600' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                target.is_published ? 'translate-x-4.5' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setPublishDialogPeriodId(null)}>
              닫기
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
