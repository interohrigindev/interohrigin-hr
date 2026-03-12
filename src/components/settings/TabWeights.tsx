import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useEvaluationPeriods } from '@/hooks/useEvaluation'
import type { EvaluationWeight, EvaluationCategory } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { Save, AlertCircle, CheckCircle } from 'lucide-react'

// 평가자 역할 목록 (self 포함)
const EVALUATOR_ROLES = [
  { key: 'self', label: '자기평가' },
  { key: 'leader', label: '리더' },
  { key: 'director', label: '이사' },
  { key: 'ceo', label: '대표이사' },
] as const

export default function TabWeights() {
  const { toast } = useToast()
  const { periods, loading: periodsLoading } = useEvaluationPeriods()
  const [categories, setCategories] = useState<EvaluationCategory[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')
  const [weights, setWeights] = useState<EvaluationWeight[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 평가자별 가중치 로컬 상태 (% 단위)
  const [localWeights, setLocalWeights] = useState<Record<string, number>>({})
  // 카테고리 가중치 로컬 상태 (% 단위)
  const [categoryWeights, setCategoryWeights] = useState<Record<string, number>>({})

  // 카테고리 로드
  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('evaluation_categories')
        .select('*')
        .order('sort_order')
      setCategories(data ?? [])
      const catW: Record<string, number> = {}
      for (const c of data ?? []) {
        catW[c.id] = Math.round(c.weight * 100)
      }
      setCategoryWeights(catW)
    }
    fetch()
  }, [])

  // 기간 선택 시 가중치 로드
  const fetchWeights = useCallback(async (periodId: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('evaluation_weights')
      .select('*')
      .eq('period_id', periodId)

    setWeights(data ?? [])

    const map: Record<string, number> = {}
    for (const role of EVALUATOR_ROLES) {
      const found = (data ?? []).find((w) => w.evaluator_role === role.key)
      map[role.key] = found ? Math.round(found.weight * 100) : 0
    }
    setLocalWeights(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (selectedPeriod) {
      fetchWeights(selectedPeriod)
    }
  }, [selectedPeriod, fetchWeights])

  // 기간 자동 선택
  useEffect(() => {
    if (!selectedPeriod && periods.length > 0) {
      const active = periods.find((p) => p.status === 'in_progress')
      setSelectedPeriod(active?.id ?? periods[0].id)
    }
  }, [periods, selectedPeriod])

  const evaluatorTotal = Object.values(localWeights).reduce((sum, v) => sum + v, 0)
  const categoryTotal = Object.values(categoryWeights).reduce((sum, v) => sum + v, 0)

  async function handleSaveEvaluatorWeights() {
    if (evaluatorTotal !== 100) {
      toast('평가자별 가중치 합계가 100%여야 합니다', 'error')
      return
    }
    setSaving(true)

    for (const role of EVALUATOR_ROLES) {
      const existing = weights.find((w) => w.evaluator_role === role.key)
      const weight = localWeights[role.key] / 100

      if (existing) {
        await supabase
          .from('evaluation_weights')
          .update({ weight })
          .eq('id', existing.id)
      } else {
        await supabase.from('evaluation_weights').insert({
          period_id: selectedPeriod,
          evaluator_role: role.key,
          weight,
        })
      }
    }

    toast('평가자별 가중치가 저장되었습니다')
    fetchWeights(selectedPeriod)
    setSaving(false)
  }

  async function handleSaveCategoryWeights() {
    if (categoryTotal !== 100) {
      toast('카테고리 가중치 합계가 100%여야 합니다', 'error')
      return
    }
    setSaving(true)

    for (const cat of categories) {
      const weight = categoryWeights[cat.id] / 100
      await supabase
        .from('evaluation_categories')
        .update({ weight })
        .eq('id', cat.id)
    }

    toast('카테고리 가중치가 저장되었습니다')
    setSaving(false)
  }

  if (periodsLoading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        업적/역량 카테고리 가중치와 평가자별 가중치를 설정합니다.
      </p>

      {/* ─── 카테고리 가중치 (업적/역량) ─────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>업적/역량 가중치</CardTitle>
          <div className="flex items-center gap-2">
            {categoryTotal === 100 ? (
              <Badge variant="success">
                <CheckCircle className="h-3 w-3 mr-1" />
                합계 100%
              </Badge>
            ) : (
              <Badge variant="danger">
                <AlertCircle className="h-3 w-3 mr-1" />
                합계 {categoryTotal}%
              </Badge>
            )}
            <Button
              size="sm"
              onClick={handleSaveCategoryWeights}
              disabled={saving || categoryTotal !== 100}
            >
              <Save className="h-3 w-3 mr-1" />
              저장
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-end gap-3">
                <div className="flex-1">
                  <Input
                    id={`cat-weight-${cat.id}`}
                    label={cat.name}
                    type="number"
                    min={0}
                    max={100}
                    value={categoryWeights[cat.id] ?? 0}
                    onChange={(e) =>
                      setCategoryWeights({
                        ...categoryWeights,
                        [cat.id]: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <span className="pb-2 text-sm text-gray-500">%</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-400">
            기본값: 업적평가 70%, 역량평가 30%
          </p>
        </CardContent>
      </Card>

      {/* ─── 평가자별 가중치 ─────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>평가자별 가중치</CardTitle>
            <Select
              options={periods.map((p) => ({
                value: p.id,
                label: `${p.year}년 ${p.quarter}분기`,
              }))}
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            {evaluatorTotal === 100 ? (
              <Badge variant="success">
                <CheckCircle className="h-3 w-3 mr-1" />
                합계 100%
              </Badge>
            ) : (
              <Badge variant="danger">
                <AlertCircle className="h-3 w-3 mr-1" />
                합계 {evaluatorTotal}%
              </Badge>
            )}
            <Button
              size="sm"
              onClick={handleSaveEvaluatorWeights}
              disabled={saving || evaluatorTotal !== 100 || !selectedPeriod}
            >
              <Save className="h-3 w-3 mr-1" />
              저장
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-20 items-center justify-center">
              <PageSpinner />
            </div>
          ) : !selectedPeriod ? (
            <p className="text-sm text-gray-400 text-center py-4">평가 기간을 선택해주세요</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {EVALUATOR_ROLES.map((role) => (
                  <div key={role.key} className="flex items-end gap-3">
                    <div className="flex-1">
                      <Input
                        id={`weight-${role.key}`}
                        label={role.label}
                        type="number"
                        min={0}
                        max={100}
                        value={localWeights[role.key] ?? 0}
                        onChange={(e) =>
                          setLocalWeights({
                            ...localWeights,
                            [role.key]: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <span className="pb-2 text-sm text-gray-500">%</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-400">
                기본값: 자기 10%, 리더 25%, 이사 35%, 대표이사 30%
              </p>

              {/* 시각적 바 */}
              {evaluatorTotal > 0 && (
                <div className="mt-4">
                  <div className="flex h-6 w-full overflow-hidden rounded-full bg-gray-100">
                    {EVALUATOR_ROLES.map((role, i) => {
                      const pct = localWeights[role.key] ?? 0
                      if (pct === 0) return null
                      const colors = [
                        'bg-brand-500',
                        'bg-blue-500',
                        'bg-violet-500',
                        'bg-emerald-500',
                      ]
                      return (
                        <div
                          key={role.key}
                          className={`${colors[i]} flex items-center justify-center text-[10px] font-medium text-white`}
                          style={{ width: `${(pct / evaluatorTotal) * 100}%` }}
                          title={`${role.label}: ${pct}%`}
                        >
                          {pct >= 10 && `${pct}%`}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {EVALUATOR_ROLES.map((role, i) => {
                      const pct = localWeights[role.key] ?? 0
                      if (pct === 0) return null
                      const colors = [
                        'bg-brand-500',
                        'bg-blue-500',
                        'bg-violet-500',
                        'bg-emerald-500',
                      ]
                      return (
                        <span key={role.key} className="flex items-center gap-1 text-xs text-gray-600">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[i]}`} />
                          {role.label} {pct}%
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
