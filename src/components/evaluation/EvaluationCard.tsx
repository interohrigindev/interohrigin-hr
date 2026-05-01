import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { SCORE_LABELS } from '@/lib/constants'
import type { EvalPhase } from '@/hooks/useSelfEvaluation'
import { CheckCircle, Sparkles, Shuffle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export interface EvaluationCardData {
  personal_goal: string
  achievement_method: string
  self_comment: string
  score: number | null
}

interface EvaluationCardProps {
  index: number
  itemId?: string
  name: string
  description: string | null
  maxScore: number
  data: EvaluationCardData
  onChange: (data: EvaluationCardData) => void
  readOnly?: boolean
  phase?: EvalPhase
  /** 팀/부서명 — 캐시 키 */
  teamKey?: string | null
  /** 직무명 — 컨텍스트 */
  jobTitle?: string | null
  /** 평가 유형 */
  evalType?: 'quantitative' | 'qualitative' | 'mixed' | null
}

const DISPLAY_COUNT = 3

export function EvaluationCard({
  index,
  itemId,
  name,
  description,
  maxScore,
  data,
  onChange,
  readOnly,
  phase,
  teamKey,
}: EvaluationCardProps) {
  const effectivePhase = phase ?? (readOnly ? 'readonly' : undefined)

  const isGoalPhase = effectivePhase === 'goal_setting'
  const isEvalPhase = effectivePhase === 'quarterly_eval'
  const isFullReadOnly = effectivePhase === 'readonly' || readOnly

  // 캐시에서 가져온 풀(최대 30개) — 메모리에 보관 후 랜덤 3개씩 표시
  const [pool, setPool] = useState<string[]>([])
  const [shownExamples, setShownExamples] = useState<string[]>([])
  const [shownIndices, setShownIndices] = useState<number[]>([])
  const cacheTeamKey = (teamKey && teamKey.trim().length > 0) ? teamKey.trim() : 'default'

  function reshuffleFromPool(allItems: string[], prevIndices: number[]) {
    if (allItems.length === 0) {
      setShownExamples([])
      setShownIndices([])
      return
    }
    const allIndices = allItems.map((_, i) => i)

    // 풀이 표시 개수 이하: 인덱스 순서만 셔플 (내용은 동일하나 표시 순서 바뀜)
    if (allItems.length <= DISPLAY_COUNT) {
      const shuffled = [...allIndices]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      // 직전과 동일한 순서면 한 번 더 시도
      const sameAsPrev = shuffled.length === prevIndices.length && shuffled.every((v, i) => v === prevIndices[i])
      if (sameAsPrev && shuffled.length > 1) {
        ;[shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]]
      }
      setShownIndices(shuffled)
      setShownExamples(shuffled.map((i) => allItems[i]))
      return
    }

    // 풀이 충분: 가능하면 이전 인덱스 회피하여 새 조합
    const candidates = allIndices.filter((i) => !prevIndices.includes(i))
    const usable = candidates.length >= DISPLAY_COUNT ? candidates : allIndices
    const shuffled = [...usable]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const picked = shuffled.slice(0, DISPLAY_COUNT)
    setShownIndices(picked)
    setShownExamples(picked.map((i) => allItems[i]))
  }

  // 마운트 시 캐시 풀 로드 (팀별 → 'default' 폴백). 즉석 생성 안 함.
  useEffect(() => {
    if (!isGoalPhase || !itemId || isFullReadOnly) return
    let cancelled = false
    ;(async () => {
      // 1차: 팀별
      const { data: teamCached } = await supabase
        .from('evaluation_item_examples')
        .select('examples')
        .eq('item_id', itemId)
        .eq('team_key', cacheTeamKey)
        .maybeSingle()
      if (cancelled) return
      let loadedPool = ((teamCached?.examples as string[] | null) || []).filter((s) => typeof s === 'string')
      // 2차: default 폴백
      if (loadedPool.length === 0 && cacheTeamKey !== 'default') {
        const { data: defCached } = await supabase
          .from('evaluation_item_examples')
          .select('examples')
          .eq('item_id', itemId)
          .eq('team_key', 'default')
          .maybeSingle()
        if (cancelled) return
        loadedPool = ((defCached?.examples as string[] | null) || []).filter((s) => typeof s === 'string')
      }
      setPool(loadedPool)
      reshuffleFromPool(loadedPool, [])
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, isGoalPhase, isFullReadOnly, cacheTeamKey])

  function applySuggestion(text: string) {
    if (data.personal_goal.trim().length > 0) {
      if (!confirm('현재 입력한 목표를 이 예시로 교체하시겠습니까? (이후 직접 수정 가능)')) return
    }
    update({ personal_goal: text })
  }

  const isComplete = (() => {
    if (isGoalPhase) {
      return data.personal_goal.trim() !== '' && data.achievement_method.trim() !== ''
    }
    if (isEvalPhase) {
      return data.score != null && data.self_comment.trim() !== ''
    }
    return (
      data.score != null &&
      data.personal_goal.trim() !== '' &&
      data.achievement_method.trim() !== '' &&
      data.self_comment.trim() !== ''
    )
  })()

  function update(patch: Partial<EvaluationCardData>) {
    onChange({ ...data, ...patch })
  }

  return (
    <div
      className={cn(
        'rounded-xl bg-white p-5 transition-colors',
        isComplete
          ? 'border-2 border-brand-200 shadow-sm'
          : 'border-2 border-dashed border-gray-200'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">
            {index}. {name}
          </span>
          <Badge variant="primary">{maxScore}점 만점</Badge>
          {isComplete && <CheckCircle className="h-4 w-4 text-emerald-500" />}
        </div>
      </div>

      {/* Description */}
      {description && (
        <div className="mb-4 rounded-lg bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-600 leading-relaxed">{description}</p>
        </div>
      )}

      {/* Textareas */}
      <div className="space-y-4 mb-4">
        {/* 목표 + 달성방법 */}
        <div>
          <Textarea
            label="🎯 나의 목표"
            placeholder="이 항목에서 달성하고자 하는 구체적인 목표를 작성하세요"
            rows={3}
            value={data.personal_goal}
            onChange={(e) => update({ personal_goal: e.target.value })}
            disabled={isFullReadOnly || isEvalPhase}
          />

          {/* AI 예시 목표 — 사전 생성된 풀에서 랜덤 3개 (직원 재생성 X, 다른 예시 보기 O) */}
          {isGoalPhase && !isFullReadOnly && shownExamples.length > 0 && (
            <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <p className="text-xs font-semibold text-brand-700 inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI 예시 — 클릭해서 적용 후 자신의 생각·구체 목표를 덧붙여주세요
                  <span className="text-[10px] text-gray-400 ml-1">(풀 {pool.length}개)</span>
                </p>
                {pool.length > 1 && (
                  <button
                    type="button"
                    onClick={() => reshuffleFromPool(pool, shownIndices)}
                    className="text-[11px] text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 border border-brand-200 rounded-full px-2 py-0.5 bg-white hover:bg-brand-50"
                    title="같은 풀에서 다른 예시 보기 (AI 호출 없음)"
                  >
                    <Shuffle className="h-3 w-3" />
                    다른 예시 보기
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {shownExamples.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className="block w-full text-left text-xs text-gray-700 bg-white hover:bg-brand-50 hover:border-brand-300 border border-gray-200 rounded-md px-3 py-2 transition-colors"
                  >
                    <span className="text-brand-500 font-bold mr-1">{i + 1}.</span>
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-2">※ AI 제안은 결정이 아닌 권장입니다. 본인 직무·상황에 맞게 수정해서 활용해주세요.</p>
            </div>
          )}
        </div>

        <Textarea
          label="🔧 달성 방법"
          placeholder="목표를 달성하기 위한 구체적인 방법과 전략을 작성하세요"
          rows={3}
          value={data.achievement_method}
          onChange={(e) => update({ achievement_method: e.target.value })}
          disabled={isFullReadOnly || isEvalPhase}
        />

        {/* 자기평가 코멘트 */}
        {!isGoalPhase && (
          <Textarea
            label="💬 자기평가 코멘트"
            placeholder="자기평가에 대한 의견을 작성하세요"
            rows={3}
            value={data.self_comment}
            onChange={(e) => update({ self_comment: e.target.value })}
            disabled={isFullReadOnly}
          />
        )}
      </div>

      {/* Score */}
      {!isGoalPhase && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">⭐ 점수</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {Array.from({ length: maxScore }, (_, i) => i + 1).map((score) => (
              <button
                key={score}
                type="button"
                disabled={isFullReadOnly}
                onClick={() => update({ score })}
                title={SCORE_LABELS[score]}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                  data.score === score
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-brand-50 hover:text-brand-600',
                  isFullReadOnly && 'cursor-not-allowed opacity-50'
                )}
              >
                {score}
              </button>
            ))}
            {data.score != null && (
              <span className="ml-2 text-sm text-gray-500">{SCORE_LABELS[data.score]}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
