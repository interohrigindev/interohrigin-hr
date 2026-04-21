import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useSelfEvaluation, type SelfEvalFormData } from '@/hooks/useSelfEvaluation'
import { useToast } from '@/components/ui/Toast'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { EvaluationCard } from '@/components/evaluation/EvaluationCard'
import type { EvaluationCardData } from '@/components/evaluation/EvaluationCard'
import { CheckCircle, Lock } from 'lucide-react'

export default function SelfEvaluation() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const {
    period,
    target,
    categories,
    items,
    selfEvals,
    departmentName,
    loading,
    saving,
    submitting,
    isReadOnly,
    isLocked,
    currentPhase,
    saveAll,
    submitGoals,
    submit,
  } = useSelfEvaluation()

  const [formData, setFormData] = useState<Record<string, SelfEvalFormData>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)

  // 임원/관리자는 자기평가 대상이 아님
  if (!loading && profile?.role && ['director', 'division_head', 'ceo', 'admin'].includes(profile.role)) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-lg font-medium text-gray-600">자기평가 대상이 아닙니다</p>
        <p className="text-sm text-gray-400">이사, 대표이사 및 관리자는 평가를 수행하는 역할입니다</p>
        <a href="/" className="mt-2 text-sm text-brand-600 hover:underline">
          대시보드로 돌아가기
        </a>
      </div>
    )
  }

  // Hydrate form from loaded selfEvals
  useEffect(() => {
    const map: Record<string, SelfEvalFormData> = {}
    items.forEach((item) => {
      const existing = selfEvals.find((se) => se.item_id === item.id)
      map[item.id] = {
        personal_goal: existing?.personal_goal ?? '',
        achievement_method: existing?.achievement_method ?? '',
        self_comment: existing?.self_comment ?? '',
        score: existing?.score ?? null,
      }
    })
    setFormData(map)
  }, [items, selfEvals])

  if (loading) return <PageSpinner />

  if (!period) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-lg font-medium text-gray-600">현재 진행 중인 평가 기간이 없습니다</p>
      </div>
    )
  }

  if (!target) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">자기평가</h2>
          <p className="text-sm text-gray-500 mt-1">
            {period.year}년 {period.quarter}분기
          </p>
        </div>
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
          <p className="text-gray-500">평가 대상으로 등록되지 않았습니다</p>
        </div>
      </div>
    )
  }

  // ─── Computed ────────────────────────────────────────────
  const totalItems = items.length
  const completedItems = items.filter((item) => {
    const d = formData[item.id]
    if (!d) return false
    if (currentPhase === 'goal_setting') {
      return d.personal_goal.trim() !== '' && d.achievement_method.trim() !== ''
    }
    if (currentPhase === 'quarterly_eval') {
      return d.score != null && d.self_comment.trim() !== ''
    }
    // readonly — count all filled
    return (
      d.score != null &&
      d.personal_goal.trim() !== '' &&
      d.achievement_method.trim() !== '' &&
      d.self_comment.trim() !== ''
    )
  }).length

  const groupedItems = categories
    .map((cat) => ({
      category: cat,
      items: items.filter((item) => item.category_id === cat.id),
    }))
    .filter((g) => g.items.length > 0)

  function updateItem(itemId: string, data: EvaluationCardData) {
    setFormData((prev) => ({ ...prev, [itemId]: data }))
  }

  async function handleSave() {
    const { error } = await saveAll(formData)
    if (error) {
      toast(error, 'error')
    } else {
      toast('임시저장되었습니다')
    }
  }

  function handleSubmitClick() {
    if (currentPhase === 'goal_setting') {
      const missing = items.filter((item) => {
        const d = formData[item.id]
        return !d || d.personal_goal.trim() === '' || d.achievement_method.trim() === ''
      })
      if (missing.length > 0) {
        toast(`목표/달성방법이 입력되지 않은 항목이 ${missing.length}개 있습니다`, 'error')
        return
      }
    } else if (currentPhase === 'quarterly_eval') {
      const missing = items.filter((item) => {
        const d = formData[item.id]
        return !d || d.score == null || d.self_comment.trim() === ''
      })
      if (missing.length > 0) {
        toast(`점수 또는 코멘트가 입력되지 않은 항목이 ${missing.length}개 있습니다`, 'error')
        return
      }
    }
    setConfirmOpen(true)
  }

  async function handleConfirmSubmit() {
    setConfirmOpen(false)
    if (currentPhase === 'goal_setting') {
      const { error } = await submitGoals(formData)
      if (error) {
        toast('제출 중 오류가 발생했습니다: ' + error, 'error')
      } else {
        toast('목표 설정이 제출되었습니다')
      }
    } else {
      const { error } = await submit(formData)
      if (error) {
        toast('제출 중 오류가 발생했습니다: ' + error, 'error')
      } else {
        toast('분기 평가가 제출되었습니다')
      }
    }
  }

  // ─── Read-only mode (after submission or locked) ────────
  if (isReadOnly) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">자기평가</h2>
          <p className="text-sm text-gray-500 mt-1">
            {period.year}년 {period.quarter}분기
          </p>
        </div>

        {isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-center gap-2">
            <Lock className="h-4 w-4" />
            평가 기간이 종료되어 수정이 불가합니다. 관리자에게 문의하세요.
          </div>
        )}

        {!isLocked && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-gray-200 bg-white p-12">
            <CheckCircle className="h-12 w-12 text-emerald-500" />
            <p className="text-lg font-medium text-gray-900">자기평가 제출 완료</p>
            <p className="text-sm text-gray-500">
              제출된 자기평가는 수정할 수 없습니다. 평가자 검토를 기다려주세요.
            </p>
          </div>
        )}

        {/* Show submitted data as read-only */}
        {groupedItems.map((group) => {
          const categoryIcon = group.category.name.includes('업적') ? '📊' : '📈'
          return (
            <div key={group.category.id} className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {categoryIcon} {group.category.name}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({Math.round(group.category.weight * 100)}%)
                </span>
              </h3>
              {group.items.map((item, idx) => (
                <EvaluationCard
                  key={item.id}
                  index={idx + 1}
                  name={item.name}
                  description={item.description}
                  maxScore={item.max_score}
                  data={formData[item.id] ?? { personal_goal: '', achievement_method: '', self_comment: '', score: null }}
                  onChange={() => {}}
                  readOnly
                />
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Editable mode ─────────────────────────────────────

  const phaseLabel = currentPhase === 'goal_setting' ? '목표 설정' : '분기 평가'

  // Running item index across categories
  let runningIndex = 0

  return (
    <div className="space-y-6 pb-24">
      {/* Locked banner */}
      {isLocked && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-center gap-2">
          <Lock className="h-4 w-4" />
          평가 기간이 종료되어 수정이 불가합니다. 관리자에게 문의하세요.
        </div>
      )}

      {/* Phase stepper */}
      {target && target.status === 'pending' && (
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className={`flex items-center gap-2 ${currentPhase === 'goal_setting' ? 'text-brand-600 font-semibold' : 'text-gray-400'}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${
              currentPhase === 'goal_setting' ? 'bg-brand-600 text-white' :
              target.goals_submitted ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {target.goals_submitted ? '✓' : '1'}
            </span>
            <span>목표 설정</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-200" />
          <div className={`flex items-center gap-2 ${currentPhase === 'quarterly_eval' ? 'text-brand-600 font-semibold' : 'text-gray-400'}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${
              currentPhase === 'quarterly_eval' ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>2</span>
            <span>분기 평가</span>
          </div>
        </div>
      )}

      {/* C1: 목표 설정 제출 후 분기 평가로 전환됐을 때 안내 배너 */}
      {target && target.status === 'pending' && target.goals_submitted && currentPhase === 'quarterly_eval' && (
        <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-brand-800">목표 설정이 완료되었습니다. 이제 분기 평가를 진행해주세요.</p>
            <p className="text-brand-700 mt-0.5">각 항목마다 <strong>점수(0~100)</strong>와 <strong>자기 코멘트</strong>를 입력한 뒤 하단 "평가 제출" 버튼을 눌러주세요.</p>
          </div>
        </div>
      )}

      {/* Top info bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {period.year}년 {period.quarter}분기 {phaseLabel}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
              <span>{profile?.name}</span>
              {departmentName && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>{departmentName}</span>
                </>
              )}
            </div>
          </div>
          <div className="w-full sm:w-64">
            <ProgressBar
              value={completedItems}
              max={totalItems}
              label={`${completedItems}/${totalItems} 항목 완료`}
              color={completedItems === totalItems ? 'emerald' : 'brand'}
            />
          </div>
        </div>
      </div>

      {/* Category sections */}
      {groupedItems.map((group) => {
        const categoryIcon = group.category.name.includes('업적') ? '📊' : '📈'
        return (
          <div key={group.category.id} className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {categoryIcon} {group.category.name}
              </h3>
              <Badge variant="primary">
                {Math.round(group.category.weight * 100)}%
              </Badge>
            </div>

            {group.items.map((item) => {
              runningIndex++
              return (
                <EvaluationCard
                  key={item.id}
                  index={runningIndex}
                  name={item.name}
                  description={item.description}
                  maxScore={item.max_score}
                  data={formData[item.id] ?? { personal_goal: '', achievement_method: '', self_comment: '', score: null }}
                  onChange={(data) => updateItem(item.id, data)}
                  phase={currentPhase}
                />
              )
            })}
          </div>
        )
      })}

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {saving && (
              <>
                <Spinner size="sm" />
                저장 중...
              </>
            )}
            {submitting && (
              <>
                <Spinner size="sm" />
                제출 중...
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleSave} disabled={saving || submitting}>
              임시저장
            </Button>
            <Button onClick={handleSubmitClick} disabled={saving || submitting}>
              {submitting ? '제출 중...' : currentPhase === 'goal_setting' ? '목표 제출' : '평가 제출'}
            </Button>
          </div>
        </div>
      </div>

      {/* Confirm dialog */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={currentPhase === 'goal_setting' ? '목표 설정 제출' : '분기 평가 제출'}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {currentPhase === 'goal_setting'
              ? '목표 설정을 제출하시겠습니까? 제출 후 목표는 수정할 수 없으며, 이어서 분기 평가 단계로 이동합니다.'
              : '분기 평가를 제출하시겠습니까? 제출 후에는 수정할 수 없습니다.'}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button onClick={handleConfirmSubmit}>제출</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
