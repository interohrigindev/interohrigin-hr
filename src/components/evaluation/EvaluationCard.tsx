import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { SCORE_LABELS, EVALUATION_TYPE_LABELS, EVALUATION_TYPE_COLORS } from '@/lib/constants'
import type { EvaluationType } from '@/types/database'
import { CheckCircle } from 'lucide-react'

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
  evaluationType?: EvaluationType
  data: EvaluationCardData
  onChange: (data: EvaluationCardData) => void
  readOnly?: boolean
}

export function EvaluationCard({
  index,
  name,
  description,
  maxScore,
  evaluationType,
  data,
  onChange,
  readOnly,
}: EvaluationCardProps) {
  const isComplete =
    data.score != null &&
    data.personal_goal.trim() !== '' &&
    data.achievement_method.trim() !== '' &&
    data.self_comment.trim() !== ''

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
          {evaluationType && (
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', EVALUATION_TYPE_COLORS[evaluationType])}>
              {EVALUATION_TYPE_LABELS[evaluationType]}
            </span>
          )}
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
        <Textarea
          label="🎯 나의 목표"
          placeholder="이 항목에서 달성하고자 하는 구체적인 목표를 작성하세요"
          rows={3}
          value={data.personal_goal}
          onChange={(e) => update({ personal_goal: e.target.value })}
          disabled={readOnly}
        />
        <Textarea
          label="🔧 달성 방법"
          placeholder="목표를 달성하기 위한 구체적인 방법과 전략을 작성하세요"
          rows={3}
          value={data.achievement_method}
          onChange={(e) => update({ achievement_method: e.target.value })}
          disabled={readOnly}
        />
        <Textarea
          label="💬 자기평가 코멘트"
          placeholder="자기평가에 대한 의견을 작성하세요"
          rows={3}
          value={data.self_comment}
          onChange={(e) => update({ self_comment: e.target.value })}
          disabled={readOnly}
        />
      </div>

      {/* Score */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">⭐ 점수</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {Array.from({ length: maxScore }, (_, i) => i + 1).map((score) => (
            <button
              key={score}
              type="button"
              disabled={readOnly}
              onClick={() => update({ score })}
              title={SCORE_LABELS[score]}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                data.score === score
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-brand-50 hover:text-brand-600',
                readOnly && 'cursor-not-allowed opacity-50'
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
    </div>
  )
}
