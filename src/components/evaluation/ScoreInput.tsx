import { cn } from '@/lib/utils'
import { SCORE_LABELS } from '@/lib/constants'

interface ScoreInputProps {
  value: number | null
  onChange: (score: number) => void
  disabled?: boolean
  maxScore?: number
}

export function ScoreInput({ value, onChange, disabled, maxScore = 10 }: ScoreInputProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {Array.from({ length: maxScore + 1 }, (_, i) => i).map((score) => (
        <button
          key={score}
          type="button"
          disabled={disabled}
          onClick={() => onChange(score)}
          title={SCORE_LABELS[score]}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors',
            value === score
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          {score}
        </button>
      ))}
      {value != null && (
        <span className="ml-2 text-xs text-gray-500">{SCORE_LABELS[value]}</span>
      )}
    </div>
  )
}
