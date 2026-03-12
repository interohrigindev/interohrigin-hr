import { useEffect, useState } from 'react'
import type { EvaluationCategory, EvaluationItem, SelfEvaluation } from '@/types/database'
import { ScoreInput } from './ScoreInput'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

interface EvaluationFormProps {
  categories: EvaluationCategory[]
  items: EvaluationItem[]
  selfEvals: SelfEvaluation[]
  readOnly?: boolean
  onScoreChange?: (itemId: string, score: number) => void
  onCommentChange?: (itemId: string, comment: string) => void
}

export function EvaluationForm({
  categories,
  items,
  selfEvals,
  readOnly,
  onScoreChange,
  onCommentChange,
}: EvaluationFormProps) {
  const [scores, setScores] = useState<Record<string, { score: number | null; comment: string }>>(
    {}
  )

  useEffect(() => {
    const map: Record<string, { score: number | null; comment: string }> = {}
    selfEvals.forEach((se) => {
      map[se.item_id] = { score: se.score, comment: se.self_comment ?? '' }
    })
    setScores(map)
  }, [selfEvals])

  const groupedItems = categories
    .map((cat) => ({
      category: cat,
      items: items.filter((item) => item.category_id === cat.id),
    }))
    .filter((g) => g.items.length > 0)

  function handleScore(itemId: string, score: number) {
    setScores((prev) => ({ ...prev, [itemId]: { ...prev[itemId], score } }))
    onScoreChange?.(itemId, score)
  }

  function handleComment(itemId: string, comment: string) {
    setScores((prev) => ({ ...prev, [itemId]: { ...prev[itemId], comment } }))
    onCommentChange?.(itemId, comment)
  }

  return (
    <div className="space-y-6">
      {groupedItems.map((group) => (
        <Card key={group.category.id}>
          <CardHeader>
            <CardTitle>
              {group.category.name}
              <span className="ml-2 text-sm font-normal text-gray-500">
                (가중치: {Math.round(group.category.weight * 100)}%)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {group.items.map((item) => (
              <div key={item.id} className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {item.name}
                    <span className="ml-2 text-xs text-gray-500">
                      (최대 {item.max_score}점)
                    </span>
                  </p>
                  {item.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                  )}
                </div>
                <ScoreInput
                  value={scores[item.id]?.score ?? null}
                  onChange={(score) => handleScore(item.id, score)}
                  maxScore={item.max_score}
                  disabled={readOnly}
                />
                <input
                  type="text"
                  placeholder="의견 (선택사항)"
                  value={scores[item.id]?.comment ?? ''}
                  onChange={(e) => handleComment(item.id, e.target.value)}
                  disabled={readOnly}
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
