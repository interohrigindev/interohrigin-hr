import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { GradeCriteria } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { Save, RotateCcw } from 'lucide-react'

const GRADE_COLORS: Record<string, string> = {
  S: 'bg-amber-100 text-amber-800 border-amber-200',
  A: 'bg-blue-100 text-blue-800 border-blue-200',
  B: 'bg-green-100 text-green-800 border-green-200',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  D: 'bg-red-100 text-red-800 border-red-200',
}

const GRADES_ORDER = ['S', 'A', 'B', 'C', 'D'] as const

const DEFAULTS: Record<string, { min: number; max: number; label: string }> = {
  S: { min: 90, max: 100, label: '탁월' },
  A: { min: 80, max: 89, label: '우수' },
  B: { min: 70, max: 79, label: '보통' },
  C: { min: 60, max: 69, label: '미흡' },
  D: { min: 0, max: 59, label: '부진' },
}

interface LocalGrade {
  id?: string
  grade: string
  min_score: number
  max_score: number
  label: string
}

export default function TabGrades() {
  const { toast } = useToast()
  const [local, setLocal] = useState<LocalGrade[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from('grade_criteria')
      .select('*')
      .order('min_score', { ascending: false })

    // DB에 데이터가 있으면 그걸 사용, 없으면 기본값
    const grades: LocalGrade[] = GRADES_ORDER.map((g) => {
      const found = (data ?? []).find((c: GradeCriteria) => c.grade === g)
      if (found) {
        return {
          id: found.id,
          grade: found.grade,
          min_score: found.min_score,
          max_score: found.max_score,
          label: found.label ?? DEFAULTS[g].label,
        }
      }
      return { grade: g, min_score: DEFAULTS[g].min, max_score: DEFAULTS[g].max, label: DEFAULTS[g].label }
    })
    setLocal(grades)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function updateGrade(grade: string, field: keyof LocalGrade, value: string | number) {
    setLocal((prev) =>
      prev.map((g) => (g.grade === grade ? { ...g, [field]: value } : g))
    )
  }

  function resetToDefaults() {
    setLocal(
      GRADES_ORDER.map((g) => {
        const existing = local.find((l) => l.grade === g)
        return {
          id: existing?.id,
          grade: g as string,
          min_score: DEFAULTS[g].min,
          max_score: DEFAULTS[g].max,
          label: DEFAULTS[g].label,
        }
      })
    )
  }

  function validate(): string | null {
    for (const g of local) {
      if (g.min_score < 0 || g.max_score > 100) return '점수는 0~100 범위여야 합니다'
      if (g.min_score > g.max_score) return `${g.grade} 등급: 최소 점수가 최대 점수보다 클 수 없습니다`
    }
    // 점수 범위 겹침 확인
    const sorted = [...local].sort((a, b) => b.min_score - a.min_score)
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i]
      const next = sorted[i + 1]
      if (next.max_score >= curr.min_score) {
        return `${curr.grade}(${curr.min_score}~)과 ${next.grade}(~${next.max_score}) 범위가 겹칩니다`
      }
    }
    return null
  }

  async function handleSave() {
    const error = validate()
    if (error) {
      toast(error, 'error')
      return
    }

    setSaving(true)

    for (const g of local) {
      if (g.id) {
        // 기존 레코드 업데이트
        await supabase
          .from('grade_criteria')
          .update({
            min_score: g.min_score,
            max_score: g.max_score,
            label: g.label,
          })
          .eq('id', g.id)
      } else {
        // 신규 삽입
        await supabase.from('grade_criteria').insert({
          grade: g.grade,
          min_score: g.min_score,
          max_score: g.max_score,
          label: g.label,
        })
      }
    }

    toast('등급 기준이 저장되었습니다')
    fetchData()
    setSaving(false)
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        S/A/B/C/D 등급별 점수 범위를 설정합니다. 0~100점 기준입니다.
      </p>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>등급 기준 설정</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={resetToDefaults}>
              <RotateCcw className="h-3 w-3 mr-1" />
              기본값 복원
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-3 w-3 mr-1" />
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 헤더 */}
            <div className="grid grid-cols-[80px_1fr_120px_120px_1fr] gap-4 px-2 text-xs font-medium text-gray-500">
              <span>등급</span>
              <span>라벨</span>
              <span>최소 점수</span>
              <span>최대 점수</span>
              <span>범위</span>
            </div>

            {local.map((g) => (
              <div
                key={g.grade}
                className="grid grid-cols-[80px_1fr_120px_120px_1fr] gap-4 items-center rounded-lg border border-gray-100 px-2 py-3"
              >
                {/* 등급 뱃지 */}
                <div>
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold ${GRADE_COLORS[g.grade]}`}
                  >
                    {g.grade}
                  </span>
                </div>

                {/* 라벨 */}
                <Input
                  value={g.label}
                  onChange={(e) => updateGrade(g.grade, 'label', e.target.value)}
                  placeholder="등급 설명"
                />

                {/* 최소 점수 */}
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={g.min_score}
                  onChange={(e) =>
                    updateGrade(g.grade, 'min_score', parseInt(e.target.value) || 0)
                  }
                />

                {/* 최대 점수 */}
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={g.max_score}
                  onChange={(e) =>
                    updateGrade(g.grade, 'max_score', parseInt(e.target.value) || 0)
                  }
                />

                {/* 시각적 범위 바 */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden relative">
                    <div
                      className={`absolute h-full rounded-full ${GRADE_COLORS[g.grade].split(' ')[0]}`}
                      style={{
                        left: `${g.min_score}%`,
                        width: `${Math.max(g.max_score - g.min_score + 1, 0)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap w-16 text-right">
                    {g.min_score}~{g.max_score}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* 전체 커버리지 미리보기 */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">점수 범위 분포</p>
            <div className="flex h-8 w-full overflow-hidden rounded-full bg-gray-100">
              {[...local].sort((a, b) => a.min_score - b.min_score).map((g) => {
                const width = g.max_score - g.min_score + 1
                return (
                  <div
                    key={g.grade}
                    className={`flex items-center justify-center text-xs font-bold ${GRADE_COLORS[g.grade]}`}
                    style={{ width: `${width}%` }}
                    title={`${g.grade} (${g.label}): ${g.min_score}~${g.max_score}점`}
                  >
                    {g.grade}
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-gray-400">
              <span>0</span>
              <span>20</span>
              <span>40</span>
              <span>60</span>
              <span>80</span>
              <span>100</span>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            기본값: S(90~100), A(80~89), B(70~79), C(60~69), D(0~59)
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
