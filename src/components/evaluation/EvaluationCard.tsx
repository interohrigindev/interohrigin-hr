import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { SCORE_LABELS } from '@/lib/constants'
import type { EvalPhase } from '@/hooks/useSelfEvaluation'
import { CheckCircle, Sparkles, Loader2, X } from 'lucide-react'
import { generateAIContentSafe } from '@/lib/ai-client'
import { useToast } from '@/components/ui/Toast'

export interface EvaluationCardData {
  personal_goal: string
  achievement_method: string
  self_comment: string
  score: number | null
}

interface EvaluationCardProps {
  index: number
  name: string
  description: string | null
  maxScore: number
  data: EvaluationCardData
  onChange: (data: EvaluationCardData) => void
  readOnly?: boolean
  phase?: EvalPhase
}

export function EvaluationCard({
  index,
  name,
  description,
  maxScore,
  data,
  onChange,
  readOnly,
  phase,
}: EvaluationCardProps) {
  const { toast } = useToast()
  const effectivePhase = phase ?? (readOnly ? 'readonly' : undefined)

  const isGoalPhase = effectivePhase === 'goal_setting'
  const isEvalPhase = effectivePhase === 'quarterly_eval'
  const isFullReadOnly = effectivePhase === 'readonly' || readOnly

  // AI 예시 목표 생성 — 목표 설정 단계에서만 노출
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [aiLoading, setAiLoading] = useState(false)

  async function generateGoalExamples() {
    setAiLoading(true)
    setAiSuggestions([])
    const prompt = `당신은 조직 성과관리 코치입니다. 아래 평가 항목에 대해, 직원이 자기평가 단계에서 작성할 수 있는 **구체적이고 측정 가능한 분기 목표** 3가지를 한국어로 제안해 주세요.

[평가 항목]
- 이름: ${name}
- 설명: ${description || '(설명 없음)'}
- 만점: ${maxScore}점

[작성 규칙]
- 각 목표는 1~2문장, 50자 이내로 간결하게
- 행동 중심·측정 가능하게 (가능하면 수치/빈도/대상 포함)
- 결정형이 아닌 제안형/권장형 (예: "~을 OO회 진행한다", "~을 정리한다" 등)
- 직원이 직접 골라 부연 설명을 덧붙일 수 있도록 시작점 역할

[출력 형식]
각 줄을 "- " 으로 시작하는 마크다운 목록으로만 출력. 그 외 안내·인사·서론·결론 일체 금지.`

    const res = await generateAIContentSafe('goal_examples', prompt, {
      fallbackContent: '',
      maxAttempts: 2,
    })
    if (!res.success || !res.content.trim()) {
      toast(res.error || 'AI 예시 생성에 실패했습니다.', 'error')
      setAiLoading(false)
      return
    }
    // 마크다운 "- " 라인만 추출
    const lines = res.content
      .split('\n')
      .map((l) => l.replace(/^[\s\-•·*0-9.]+/, '').trim())
      .filter((l) => l.length > 0 && l.length < 200)
    if (lines.length === 0) {
      toast('AI 응답을 해석할 수 없습니다. 다시 시도해주세요.', 'error')
      setAiLoading(false)
      return
    }
    setAiSuggestions(lines.slice(0, 3))
    setAiLoading(false)
  }

  function applySuggestion(text: string) {
    // 기존 입력이 있으면 덮어쓰기 확인
    if (data.personal_goal.trim().length > 0) {
      if (!confirm('현재 입력한 목표를 이 예시로 교체하시겠습니까? (이후 직접 수정 가능)')) return
    }
    update({ personal_goal: text })
    setAiSuggestions([])
    toast('예시가 적용되었습니다. 부연 설명을 덧붙여주세요.', 'success')
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
        {/* 목표 + 달성방법: goal_setting에서 편집, quarterly_eval/readonly에서 읽기전용 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700">🎯 나의 목표</label>
            {/* AI 예시 목표 생성 버튼 — goal_setting 단계에서만 */}
            {isGoalPhase && !isFullReadOnly && (
              <button
                type="button"
                onClick={generateGoalExamples}
                disabled={aiLoading}
                className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 disabled:opacity-50"
                title="AI 가 항목 설명을 바탕으로 예시 목표 3개를 제안합니다"
              >
                {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {aiLoading ? '생성 중…' : 'AI 예시 보기'}
              </button>
            )}
          </div>
          <Textarea
            label=""
            placeholder="이 항목에서 달성하고자 하는 구체적인 목표를 작성하세요"
            rows={3}
            value={data.personal_goal}
            onChange={(e) => update({ personal_goal: e.target.value })}
            disabled={isFullReadOnly || isEvalPhase}
          />

          {/* AI 예시 목표 카드 */}
          {aiSuggestions.length > 0 && (
            <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-brand-700 inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> AI 예시 — 클릭해서 적용 후 부연 설명을 덧붙여주세요
                </p>
                <button
                  type="button"
                  onClick={() => setAiSuggestions([])}
                  className="text-gray-400 hover:text-gray-600"
                  title="닫기"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-1.5">
                {aiSuggestions.map((s, i) => (
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
              <p className="text-[10px] text-gray-500 mt-2">※ AI 제안은 결정이 아닌 권장입니다. 본인 직무와 상황에 맞게 수정해서 활용해주세요.</p>
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

        {/* 자기평가 코멘트 + 점수: goal_setting에서 숨김, quarterly_eval에서 편집 */}
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

      {/* Score — goal_setting에서 숨김 */}
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
