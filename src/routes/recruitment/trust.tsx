import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { AITrustMetrics, AIAccuracyLog, AIPhaseTransition, AIPhase } from '@/types/recruitment'

const PHASE_DESCRIPTIONS: Record<AIPhase, string> = {
  A: 'AI 보조 (참고만) — AI가 데이터를 제시하지만 모든 결정은 면접관이 함',
  B: 'AI 추천 (면접관 결정) — AI가 추천을 제공하고 면접관이 최종 결정',
  C: 'AI 주도 (면접관 검토) — AI가 결정을 내리고 면접관이 검토/승인',
}

const PHASE_COLORS: Record<AIPhase, string> = {
  A: 'bg-blue-500',
  B: 'bg-amber-500',
  C: 'bg-emerald-500',
}

export default function AITrustDashboard() {
  const { toast } = useToast()
  const { hasRole } = useAuth()
  const [metrics, setMetrics] = useState<AITrustMetrics | null>(null)
  const [logs, setLogs] = useState<AIAccuracyLog[]>([])
  const [transitions, setTransitions] = useState<AIPhaseTransition[]>([])
  const [loading, setLoading] = useState(true)
  const [showTransitionDialog, setShowTransitionDialog] = useState(false)
  const [newPhase, setNewPhase] = useState<AIPhase>('B')
  const [transitionReason, setTransitionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [metricsRes, logsRes, transRes] = await Promise.all([
        supabase
          .from('ai_trust_metrics')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('ai_accuracy_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('ai_phase_transitions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      if (metricsRes.data && metricsRes.data.length > 0) {
        setMetrics(metricsRes.data[0] as any)
      }
      setLogs((logsRes.data ?? []) as any)
      setTransitions((transRes.data ?? []) as any)
    } catch {
      toast('데이터 로딩 실패', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const currentPhase: AIPhase = metrics?.current_phase ?? 'A'

  async function handlePhaseTransition() {
    if (!transitionReason.trim()) {
      toast('전환 사유를 입력해주세요', 'error')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase.from('ai_phase_transitions').insert({
        from_phase: currentPhase,
        to_phase: newPhase,
        reason: transitionReason,
        accuracy_at_transition: metrics?.accuracy_rate ?? null,
      })
      if (error) throw error

      // Update the latest metrics record
      if (metrics) {
        await supabase
          .from('ai_trust_metrics')
          .update({ current_phase: newPhase })
          .eq('id', metrics.id)
      } else {
        await supabase.from('ai_trust_metrics').insert({
          period_start: new Date().toISOString().slice(0, 10),
          period_end: new Date().toISOString().slice(0, 10),
          total_predictions: 0,
          correct_predictions: 0,
          accuracy_rate: 0,
          current_phase: newPhase,
          details: {},
        })
      }

      toast('Phase 전환 완료', 'success')
      setShowTransitionDialog(false)
      setTransitionReason('')
      fetchData()
    } catch {
      toast('Phase 전환 실패', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PageSpinner />

  const accuracyRate = metrics?.accuracy_rate ?? 0
  const totalPredictions = metrics?.total_predictions ?? logs.length
  const correctPredictions = metrics?.correct_predictions ?? logs.filter((l) => l.match_result === 'match').length
  const partialCount = logs.filter((l) => l.match_result === 'partial').length
  const mismatchCount = logs.filter((l) => l.match_result === 'mismatch').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">AI 신뢰도 대시보드</h1>
        {hasRole('admin') && (
          <Button onClick={() => setShowTransitionDialog(true)}>Phase 전환</Button>
        )}
      </div>

      {/* Current Phase */}
      <Card>
        <CardHeader>
          <CardTitle>현재 AI Phase</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white ${PHASE_COLORS[currentPhase]}`}
            >
              {currentPhase}
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">Phase {currentPhase}</p>
              <p className="text-sm text-gray-500">{PHASE_DESCRIPTIONS[currentPhase]}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500">정확도</p>
            <p className="text-3xl font-bold text-gray-900">
              {(accuracyRate * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500">총 예측 수</p>
            <p className="text-3xl font-bold text-gray-900">{totalPredictions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500">정확한 예측</p>
            <p className="text-3xl font-bold text-gray-900">{correctPredictions}</p>
          </CardContent>
        </Card>
      </div>

      {/* Accuracy Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>정확도 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-gray-600">정확 (Match)</span>
                <span className="font-medium">{correctPredictions}건</span>
              </div>
              <div className="h-6 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{
                    width: logs.length > 0
                      ? `${(correctPredictions / logs.length) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-gray-600">부분 일치 (Partial)</span>
                <span className="font-medium">{partialCount}건</span>
              </div>
              <div className="h-6 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{
                    width: logs.length > 0
                      ? `${(partialCount / logs.length) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-gray-600">불일치 (Mismatch)</span>
                <span className="font-medium">{mismatchCount}건</span>
              </div>
              <div className="h-6 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-red-500 transition-all"
                  style={{
                    width: logs.length > 0
                      ? `${(mismatchCount / logs.length) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Accuracy Logs */}
      <Card>
        <CardHeader>
          <CardTitle>최근 정확도 기록</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-500">기록이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">날짜</th>
                    <th className="pb-2 pr-4">유형</th>
                    <th className="pb-2 pr-4">AI 추천</th>
                    <th className="pb-2 pr-4">실제 결정</th>
                    <th className="pb-2 pr-4">결과</th>
                    <th className="pb-2">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-gray-600">
                        {new Date(log.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="info">{log.context_type}</Badge>
                      </td>
                      <td className="py-2 pr-4">{log.ai_recommendation ?? '-'}</td>
                      <td className="py-2 pr-4">{log.actual_decision ?? '-'}</td>
                      <td className="py-2 pr-4">
                        {log.match_result === 'match' && (
                          <Badge variant="success">일치</Badge>
                        )}
                        {log.match_result === 'partial' && (
                          <Badge variant="warning">부분 일치</Badge>
                        )}
                        {log.match_result === 'mismatch' && (
                          <Badge variant="danger">불일치</Badge>
                        )}
                        {!log.match_result && '-'}
                      </td>
                      <td className="py-2 text-gray-500">{log.notes ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase Transition History */}
      <Card>
        <CardHeader>
          <CardTitle>Phase 전환 이력</CardTitle>
        </CardHeader>
        <CardContent>
          {transitions.length === 0 ? (
            <p className="text-sm text-gray-500">전환 이력이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {transitions.map((t) => (
                <div key={t.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">Phase {t.from_phase}</Badge>
                    <span className="text-gray-400">&rarr;</span>
                    <Badge variant="primary">Phase {t.to_phase}</Badge>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">{t.reason ?? '사유 없음'}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(t.created_at).toLocaleString('ko-KR')}
                      {t.accuracy_at_transition != null &&
                        ` · 전환 시 정확도: ${(t.accuracy_at_transition * 100).toFixed(1)}%`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase Transition Dialog */}
      <Dialog
        open={showTransitionDialog}
        onClose={() => setShowTransitionDialog(false)}
        title="Phase 전환"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            현재 Phase: <strong>{currentPhase}</strong> ({PHASE_DESCRIPTIONS[currentPhase]})
          </p>
          <Select
            label="전환할 Phase"
            options={(['A', 'B', 'C'] as AIPhase[])
              .filter((p) => p !== currentPhase)
              .map((p) => ({ value: p, label: `Phase ${p} — ${PHASE_DESCRIPTIONS[p].split('—')[0].trim()}` }))}
            value={newPhase}
            onChange={(e) => setNewPhase(e.target.value as AIPhase)}
          />
          <Textarea
            label="전환 사유"
            placeholder="Phase 전환 사유를 입력하세요"
            value={transitionReason}
            onChange={(e) => setTransitionReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowTransitionDialog(false)}>
              취소
            </Button>
            <Button onClick={handlePhaseTransition} disabled={submitting}>
              {submitting ? '처리 중...' : '전환 실행'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
