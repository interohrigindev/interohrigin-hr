import { useState, useEffect, useCallback } from 'react'
import { Repeat, Check, Clock, CircleDot } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { PageSpinner } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { fetchMyOccurrences, updateOccurrenceStatus } from '@/hooks/useRecurringTasks'
import type { OccurrenceWithTemplate, OccurrenceStatus } from '@/types/recurring-task'

// Design Ref: §5 — 반복업무 전용 체크 화면. 오늘 본인 발생 occurrence 진행여부 체크.
// Plan SC-4: 진행여부(완료/진행) + 메모. (missed 는 cron 전이 — 사용자 수동 설정 불가)

function todayKST(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const STATUS_BADGE: Record<OccurrenceStatus, { label: string; variant: 'success' | 'info' | 'default' | 'danger' }> = {
  done: { label: '완료', variant: 'success' },
  in_progress: { label: '진행중', variant: 'info' },
  pending: { label: '미체크', variant: 'default' },
  missed: { label: '미진행', variant: 'danger' },
}

export default function RecurringCheckPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [date] = useState(todayKST())
  const [items, setItems] = useState<OccurrenceWithTemplate[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    try {
      const occ = await fetchMyOccurrences(profile.id, date)
      setItems(occ)
      setNotes(Object.fromEntries(occ.map((o) => [o.id, o.note || ''])))
    } catch (err: unknown) {
      toast('불러오기 실패: ' + (err instanceof Error ? err.message : '오류'), 'error')
    }
    setLoading(false)
  }, [profile?.id, date, toast])

  useEffect(() => { load() }, [load])

  async function setStatus(id: string, status: 'pending' | 'in_progress' | 'done') {
    setSavingId(id)
    try {
      await updateOccurrenceStatus(id, status, notes[id] ?? null)
      setItems((prev) => prev.map((o) =>
        o.id === id
          ? { ...o, status, completed_at: status === 'done' ? new Date().toISOString() : null }
          : o
      ))
      toast('저장되었습니다.', 'success')
    } catch (err: unknown) {
      toast('저장 실패: ' + (err instanceof Error ? err.message : '오류'), 'error')
    }
    setSavingId(null)
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Repeat className="h-5 w-5 text-[#6B3FA0]" />
        <h1 className="text-lg font-bold">반복업무 체크</h1>
        <span className="text-sm text-gray-400">({date.replace(/-/g, '.')})</span>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">오늘 예정된 반복업무 ({items.length})</CardTitle></CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">오늘 예정된 반복업무가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {items.map((o) => {
                const badge = STATUS_BADGE[o.status]
                return (
                  <div key={o.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">{o.title}</span>
                          <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                        </div>
                        {o.description && <p className="text-xs text-gray-500 mt-1">{o.description}</p>}
                      </div>
                    </div>

                    <div className="mt-2.5">
                      <Input
                        value={notes[o.id] ?? ''}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [o.id]: e.target.value }))}
                        placeholder="메모 (선택)"
                        className="text-sm"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                      <Button
                        size="sm"
                        variant={o.status === 'done' ? 'primary' : 'outline'}
                        onClick={() => setStatus(o.id, 'done')}
                        disabled={savingId === o.id}
                      >
                        <Check className="h-4 w-4" /> 완료
                      </Button>
                      <Button
                        size="sm"
                        variant={o.status === 'in_progress' ? 'primary' : 'outline'}
                        onClick={() => setStatus(o.id, 'in_progress')}
                        disabled={savingId === o.id}
                      >
                        <Clock className="h-4 w-4" /> 진행중
                      </Button>
                      <Button
                        size="sm"
                        variant={o.status === 'pending' ? 'primary' : 'outline'}
                        onClick={() => setStatus(o.id, 'pending')}
                        disabled={savingId === o.id}
                      >
                        <CircleDot className="h-4 w-4" /> 미체크
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-4">
            완료·진행중으로 체크한 반복업무는 오늘 일일 업무보고에 자동 반영됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
