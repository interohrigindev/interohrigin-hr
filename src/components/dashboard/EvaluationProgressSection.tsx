import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { EvaluationProgress } from '@/hooks/useDashboard'
import { EVALUATION_STATUS_LABELS } from '@/lib/constants'

interface EvaluationProgressSectionProps {
  progress: EvaluationProgress
}

const STAGES: { key: keyof EvaluationProgress; label: string }[] = [
  { key: 'self_done_count', label: EVALUATION_STATUS_LABELS['self_done'] },
  { key: 'leader_done_count', label: EVALUATION_STATUS_LABELS['leader_done'] },
  { key: 'director_done_count', label: EVALUATION_STATUS_LABELS['director_done'] },
  { key: 'ceo_done_count', label: EVALUATION_STATUS_LABELS['ceo_done'] },
  { key: 'completed_count', label: EVALUATION_STATUS_LABELS['completed'] },
]

function getColor(pct: number): 'emerald' | 'amber' | 'red' {
  if (pct >= 100) return 'emerald'
  if (pct >= 50) return 'amber'
  return 'red'
}

export function EvaluationProgressSection({ progress }: EvaluationProgressSectionProps) {
  const total = progress.total_employees

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>평가 진행 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">평가 대상이 없습니다</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>평가 진행 현황</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {STAGES.map(({ key, label }) => {
          const count = (progress[key] as number) ?? 0
          const pct = Math.round((count / total) * 100)
          return (
            <ProgressBar
              key={key}
              value={count}
              max={total}
              label={`${label} (${count}/${total})`}
              color={getColor(pct)}
              size="md"
            />
          )
        })}
      </CardContent>
    </Card>
  )
}
