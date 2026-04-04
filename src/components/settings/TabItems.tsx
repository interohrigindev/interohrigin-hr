import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { EvaluationCategory, EvaluationItem, JobType, EvaluationItemJobType } from '@/types/database'
import { EVALUATION_TYPE_LABELS, EVALUATION_TYPE_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'

interface ItemFormData {
  name: string
  description: string
  max_score: number
  selectedJobTypeIds: string[]
}

const EMPTY_FORM: ItemFormData = { name: '', description: '', max_score: 10, selectedJobTypeIds: [] }

export default function TabItems() {
  const { toast } = useToast()
  const [categories, setCategories] = useState<EvaluationCategory[]>([])
  const [items, setItems] = useState<EvaluationItem[]>([])
  const [jobTypes, setJobTypes] = useState<JobType[]>([])
  const [itemJobTypeMappings, setItemJobTypeMappings] = useState<EvaluationItemJobType[]>([])
  const [loading, setLoading] = useState(true)

  // 다이얼로그 상태
  const [showDialog, setShowDialog] = useState(false)
  const [editingItem, setEditingItem] = useState<EvaluationItem | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [form, setForm] = useState<ItemFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const [catRes, itemRes, jtRes, mappingRes] = await Promise.all([
      supabase.from('evaluation_categories').select('*').order('sort_order'),
      supabase.from('evaluation_items').select('*').order('sort_order'),
      supabase.from('job_types').select('*').order('sort_order'),
      supabase.from('evaluation_item_job_types').select('*'),
    ])
    setCategories(catRes.data ?? [])
    setItems(itemRes.data ?? [])
    setJobTypes(jtRes.data ?? [])
    setItemJobTypeMappings(mappingRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function openCreate(categoryId: string) {
    setEditingItem(null)
    setSelectedCategoryId(categoryId)
    setForm(EMPTY_FORM)
    setShowDialog(true)
  }

  function openEdit(item: EvaluationItem) {
    setEditingItem(item)
    setSelectedCategoryId(item.category_id)
    const assignedJobTypeIds = itemJobTypeMappings
      .filter((m) => m.item_id === item.id)
      .map((m) => m.job_type_id)
    setForm({
      name: item.name,
      description: item.description ?? '',
      max_score: item.max_score,
      selectedJobTypeIds: assignedJobTypeIds,
    })
    setShowDialog(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast('항목 이름을 입력해주세요', 'error')
      return
    }
    setSaving(true)

    if (editingItem) {
      const { error } = await supabase
        .from('evaluation_items')
        .update({
          name: form.name,
          description: form.description || null,
          max_score: form.max_score,
        })
        .eq('id', editingItem.id)

      if (error) {
        toast('수정 실패: ' + error.message, 'error')
      } else {
        // 직무 매핑 동기화
        await supabase.from('evaluation_item_job_types').delete().eq('item_id', editingItem.id)
        if (form.selectedJobTypeIds.length > 0) {
          await supabase.from('evaluation_item_job_types').insert(
            form.selectedJobTypeIds.map((jtId) => ({ item_id: editingItem.id, job_type_id: jtId }))
          )
        }
        toast('항목이 수정되었습니다')
        setShowDialog(false)
        fetchData()
      }
    } else {
      const categoryItems = items.filter((i) => i.category_id === selectedCategoryId)
      const nextOrder = categoryItems.length > 0
        ? Math.max(...categoryItems.map((i) => i.sort_order)) + 1
        : 1

      const { data: inserted, error } = await supabase.from('evaluation_items').insert({
        category_id: selectedCategoryId,
        name: form.name,
        description: form.description || null,
        max_score: form.max_score,
        sort_order: nextOrder,
        is_active: true,
      }).select('id').single()

      if (error) {
        toast('추가 실패: ' + error.message, 'error')
      } else {
        // 직무 매핑 저장
        if (inserted && form.selectedJobTypeIds.length > 0) {
          await supabase.from('evaluation_item_job_types').insert(
            form.selectedJobTypeIds.map((jtId) => ({ item_id: inserted.id, job_type_id: jtId }))
          )
        }
        toast('항목이 추가되었습니다')
        setShowDialog(false)
        fetchData()
      }
    }
    setSaving(false)
  }

  async function handleDelete(item: EvaluationItem) {
    if (!confirm(`"${item.name}" 항목을 삭제하시겠습니까?`)) return

    const { error } = await supabase.from('evaluation_items').delete().eq('id', item.id)
    if (error) {
      toast('삭제 실패: ' + error.message, 'error')
    } else {
      toast('항목이 삭제되었습니다')
      fetchData()
    }
  }

  async function handleToggleActive(item: EvaluationItem) {
    const { error } = await supabase
      .from('evaluation_items')
      .update({ is_active: !item.is_active })
      .eq('id', item.id)

    if (error) {
      toast('변경 실패: ' + error.message, 'error')
    } else {
      fetchData()
    }
  }

  async function handleMove(item: EvaluationItem, direction: 'up' | 'down') {
    const categoryItems = items
      .filter((i) => i.category_id === item.category_id)
      .sort((a, b) => a.sort_order - b.sort_order)

    const idx = categoryItems.findIndex((i) => i.id === item.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= categoryItems.length) return

    const current = categoryItems[idx]
    const swap = categoryItems[swapIdx]

    await Promise.all([
      supabase.from('evaluation_items').update({ sort_order: swap.sort_order }).eq('id', current.id),
      supabase.from('evaluation_items').update({ sort_order: current.sort_order }).eq('id', swap.id),
    ])
    fetchData()
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">업적평가 / 역량평가 항목을 관리합니다.</p>

      {categories.map((cat) => {
        const catItems = items
          .filter((i) => i.category_id === cat.id)
          .sort((a, b) => a.sort_order - b.sort_order)

        return (
          <Card key={cat.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>{cat.name}</CardTitle>
                <Badge variant="info">가중치 {Math.round(cat.weight * 100)}%</Badge>
              </div>
              <Button size="sm" onClick={() => openCreate(cat.id)}>
                <Plus className="h-3 w-3 mr-1" />
                항목 추가
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {catItems.length === 0 ? (
                <div className="flex h-20 items-center justify-center text-sm text-gray-400">
                  등록된 항목이 없습니다
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {catItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-4 px-6 py-3 ${
                        !item.is_active ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* 순서 변경 */}
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => handleMove(item, 'up')}
                          disabled={idx === 0}
                          className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleMove(item, 'down')}
                          disabled={idx === catItems.length - 1}
                          className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* 항목 정보 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{item.description}</p>
                        )}
                      </div>

                      {/* 평가 유형 */}
                      {item.evaluation_type && (
                        <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium', EVALUATION_TYPE_COLORS[item.evaluation_type])}>
                          {EVALUATION_TYPE_LABELS[item.evaluation_type]}
                        </span>
                      )}

                      {/* 최대 점수 */}
                      <Badge variant="default">최대 {item.max_score}점</Badge>

                      {/* 적용 직무 */}
                      {itemJobTypeMappings
                        .filter((m) => m.item_id === item.id)
                        .map((m) => {
                          const jt = jobTypes.find((j) => j.id === m.job_type_id)
                          return jt ? (
                            <Badge key={m.id} variant="default" className="text-[10px]">
                              {jt.name}
                            </Badge>
                          ) : null
                        })}
                      {itemJobTypeMappings.filter((m) => m.item_id === item.id).length === 0 && (
                        <span className="text-[10px] text-gray-400">전체 직무</span>
                      )}

                      {/* 활성 토글 */}
                      <button
                        onClick={() => handleToggleActive(item)}
                        className="text-gray-400 hover:text-gray-600"
                        title={item.is_active ? '비활성화' : '활성화'}
                      >
                        {item.is_active ? (
                          <ToggleRight className="h-5 w-5 text-brand-600" />
                        ) : (
                          <ToggleLeft className="h-5 w-5" />
                        )}
                      </button>

                      {/* 수정 / 삭제 */}
                      <button
                        onClick={() => openEdit(item)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* 항목 추가/수정 다이얼로그 */}
      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        title={editingItem ? '평가 항목 수정' : '평가 항목 추가'}
      >
        <div className="space-y-4">
          <Input
            id="item-name"
            label="항목 이름"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="예: 업무목표 달성도"
          />
          <Textarea
            id="item-desc"
            label="설명"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="항목에 대한 상세 설명"
            rows={3}
          />
          <Input
            id="item-max-score"
            label="최대 점수"
            type="number"
            min={1}
            max={100}
            value={form.max_score}
            onChange={(e) => setForm({ ...form, max_score: parseInt(e.target.value) || 10 })}
          />
          {jobTypes.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">적용 직무</p>
              <p className="text-xs text-gray-400 mb-2">선택하지 않으면 모든 직무에 적용됩니다</p>
              <div className="flex flex-wrap gap-2">
                {jobTypes.map((jt) => (
                  <label
                    key={jt.id}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-pointer transition-colors',
                      form.selectedJobTypeIds.includes(jt.id)
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={form.selectedJobTypeIds.includes(jt.id)}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          selectedJobTypeIds: e.target.checked
                            ? [...prev.selectedJobTypeIds, jt.id]
                            : prev.selectedJobTypeIds.filter((id) => id !== jt.id),
                        }))
                      }}
                    />
                    {jt.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : editingItem ? '수정' : '추가'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
