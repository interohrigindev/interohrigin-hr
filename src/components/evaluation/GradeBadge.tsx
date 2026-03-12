import { cn } from '@/lib/utils'
import { GRADE_COLORS, GRADE_LABELS } from '@/lib/constants'

interface GradeBadgeProps {
  grade: string | null
  className?: string
  showLabel?: boolean
}

export function GradeBadge({ grade, className, showLabel }: GradeBadgeProps) {
  if (!grade) {
    return (
      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-500', className)}>
        미평가
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        GRADE_COLORS[grade] ?? 'bg-gray-100 text-gray-800',
        className
      )}
    >
      {showLabel ? GRADE_LABELS[grade] ?? grade : grade}
    </span>
  )
}
