import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { ItemScoreComparison } from '@/hooks/useDashboard'
import { AlertTriangle } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/constants'

interface DeviationAlertsProps {
  data: ItemScoreComparison[]
}

interface DeviationDetail {
  employee: string
  item: string
  scores: { role: string; score: number }[]
  deviation: number
}

export function DeviationAlerts({ data }: DeviationAlertsProps) {
  // Build detailed deviation info
  const details: DeviationDetail[] = data.map((d) => {
    const scores: { role: string; score: number }[] = []
    if (d.self_score != null) scores.push({ role: '자기', score: d.self_score })
    if (d.leader_score != null) scores.push({ role: ROLE_LABELS.leader, score: d.leader_score })
    if (d.director_score != null) scores.push({ role: ROLE_LABELS.director, score: d.director_score })
    if (d.ceo_score != null) scores.push({ role: ROLE_LABELS.ceo, score: d.ceo_score })

    return {
      employee: d.employee_name,
      item: d.item_name,
      scores,
      deviation: d.max_deviation ?? 0,
    }
  }).sort((a, b) => b.deviation - a.deviation)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          편차 알림
          {details.length > 0 && (
            <Badge variant="danger">{details.length}건</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {details.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-gray-400">
            3점 이상 편차가 있는 항목이 없습니다
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {details.map((d, idx) => {
              // Find the highest and lowest scorer
              const sorted = [...d.scores].sort((a, b) => b.score - a.score)
              const highest = sorted[0]
              const lowest = sorted[sorted.length - 1]

              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">{d.employee}</span>
                    <span className="text-gray-500"> - </span>
                    <span className="font-medium text-gray-900">{d.item}</span>
                    <span className="text-gray-500">: </span>
                    <span className="text-gray-700">
                      {highest.role} {highest.score} vs {lowest.role} {lowest.score}
                    </span>
                    <span className="text-amber-600 font-medium">
                      {' '}→ {d.deviation}점 차이
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
