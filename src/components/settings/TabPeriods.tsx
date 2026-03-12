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
import { Plus, Play } from 'lucide-react'

export default function TabPeriods() {
  const { periods, loading, refetch } = useEvaluationPeriods()
  const { toast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [autoGenerate, setAutoGenerate] = useState(true)
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
    </div>
  )
}
