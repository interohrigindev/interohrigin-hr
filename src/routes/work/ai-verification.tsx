import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import type { Employee } from '@/types/database'

interface HiredEmployeeData {
  employee: Employee
  department_name: string | null
  ai_recommendation: string | null
  ai_score: number | null
  work_completion_rate: number | null
  eval_score: number | null
  accuracy: number | null
}

export default function AIVerification() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<HiredEmployeeData[]>([])
  const [overallAccuracy, setOverallAccuracy] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)

    // Get all hiring decisions with 'hired'
    const { data: decisions } = await supabase
      .from('hiring_decisions')
      .select('*')
      .eq('decision', 'hired')

    if (!decisions || decisions.length === 0) {
      setData([])
      setLoading(false)
      return
    }

    // Get candidates
    const candidateIds = decisions.map((d: any) => d.candidate_id).filter(Boolean)
    const { data: candidates } = await supabase
      .from('candidates')
      .select('id, name, email')
      .in('id', candidateIds)

    // Get all employees
    const { data: allEmps } = await supabase.from('employees').select('*')
    const { data: depts } = await supabase.from('departments').select('id, name')
    const { data: metrics } = await supabase.from('work_metrics').select('*')
    const { data: evalTargets } = await supabase.from('evaluation_targets').select('employee_id, final_score')

    const employees = (allEmps || []) as Employee[]
    const departments = (depts || []) as { id: string; name: string }[]

    const results: HiredEmployeeData[] = []

    for (const dec of decisions as any[]) {
      const candidate = (candidates || []).find((c: any) => c.id === dec.candidate_id)
      if (!candidate) continue

      // Find matching employee by email
      const emp = employees.find((e) => e.email === (candidate as any).email)
      if (!emp) continue

      const dept = departments.find((d) => d.id === emp.department_id)

      // Get AI recommendation score from hiring decision
      const aiRec = dec.ai_recommendation || null
      const aiScore = dec.ai_score ?? null

      // Get work performance
      const empMetrics = (metrics || []).filter((m: any) => m.employee_id === emp.id)
      const avgCompletion = empMetrics.length > 0
        ? Math.round(empMetrics.reduce((sum: number, m: any) => sum + (m.task_completion_rate || 0), 0) / empMetrics.length)
        : null

      // Get evaluation score
      const empEvals = (evalTargets || []).filter((e: any) => e.employee_id === emp.id && e.final_score)
      const avgEval = empEvals.length > 0
        ? Math.round(empEvals.reduce((sum: number, e: any) => sum + e.final_score, 0) / empEvals.length * 10) / 10
        : null

      // Calculate accuracy: compare AI predicted score with actual performance
      const actualPerformance = avgCompletion ?? avgEval ?? null
      let accuracy: number | null = null
      if (aiScore !== null && actualPerformance !== null) {
        // Accuracy = 100 - abs(predicted - actual), capped at 0
        accuracy = Math.max(0, Math.round(100 - Math.abs(aiScore - actualPerformance)))
      }

      results.push({
        employee: emp,
        department_name: dept?.name || null,
        ai_recommendation: aiRec,
        ai_score: aiScore,
        work_completion_rate: avgCompletion,
        eval_score: avgEval,
        accuracy,
      })
    }

    setData(results)

    // Overall accuracy
    const withAccuracy = results.filter((r) => r.accuracy !== null)
    if (withAccuracy.length > 0) {
      setOverallAccuracy(
        Math.round(withAccuracy.reduce((s, r) => s + (r.accuracy || 0), 0) / withAccuracy.length)
      )
    }

    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleFeedback() {
    setSaving(true)
    try {
      const entries = data.filter((d) => d.accuracy !== null).map((d) => {
        const actual = d.work_completion_rate ?? d.eval_score ?? 0
        const diff = Math.abs((d.ai_score ?? 0) - actual)
        const matchResult = diff <= 15 ? 'match' : diff <= 30 ? 'partial' : 'mismatch'
        return {
          employee_id: d.employee.id,
          context_type: 'performance' as const,
          ai_recommendation: d.ai_recommendation,
          ai_score: d.ai_score,
          actual_decision: `성과 ${actual}점`,
          match_result: matchResult,
          notes: `AI ${d.ai_score}점 → 실제 ${actual}점 (정확도 ${d.accuracy}%)`,
        }
      })

      if (entries.length === 0) {
        toast('피드백할 데이터가 없습니다.', 'info')
        setSaving(false)
        return
      }

      const { error } = await supabase.from('ai_accuracy_log').insert(entries)
      if (error) {
        toast('저장 실패: ' + error.message, 'error')
      } else {
        toast(`${entries.length}건의 정확도 피드백이 저장되었습니다.`, 'success')
      }
    } catch (err: any) {
      toast('오류: ' + err.message, 'error')
    }
    setSaving(false)
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">AI 예측 vs 실제 성과 검증</h1>
        <Button onClick={handleFeedback} disabled={saving || data.length === 0}>
          {saving ? <Spinner size="sm" /> : <ShieldCheck className="h-4 w-4" />}
          정확도 피드백 저장
        </Button>
      </div>

      {/* Overall accuracy */}
      {overallAccuracy !== null && (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-gray-500 mb-1">전체 AI 예측 정확도</p>
            <p className={`text-4xl font-bold ${overallAccuracy >= 70 ? 'text-emerald-600' : overallAccuracy >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {overallAccuracy}%
            </p>
          </CardContent>
        </Card>
      )}

      {/* Employee comparison table */}
      <Card>
        <CardHeader>
          <CardTitle>채용 AI 예측 vs 실제 성과</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              AI 채용 추천으로 입사한 직원 데이터가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-4">직원</th>
                    <th className="py-2 pr-4">부서</th>
                    <th className="py-2 pr-4">AI 추천</th>
                    <th className="py-2 pr-4">AI 점수</th>
                    <th className="py-2 pr-4">업무 완료율</th>
                    <th className="py-2 pr-4">평가 점수</th>
                    <th className="py-2 pr-4">정확도</th>
                    <th className="py-2">추세</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d) => (
                    <tr key={d.employee.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium">{d.employee.name}</td>
                      <td className="py-2 pr-4 text-gray-500">{d.department_name || '-'}</td>
                      <td className="py-2 pr-4">
                        {d.ai_recommendation ? (
                          <Badge variant={d.ai_recommendation === '강력 추천' ? 'success' : d.ai_recommendation === '추천' ? 'primary' : 'default'}>
                            {d.ai_recommendation}
                          </Badge>
                        ) : '-'}
                      </td>
                      <td className="py-2 pr-4">{d.ai_score ?? '-'}</td>
                      <td className="py-2 pr-4">{d.work_completion_rate !== null ? `${d.work_completion_rate}%` : '-'}</td>
                      <td className="py-2 pr-4">{d.eval_score ?? '-'}</td>
                      <td className="py-2 pr-4">
                        {d.accuracy !== null ? (
                          <Badge variant={d.accuracy >= 70 ? 'success' : d.accuracy >= 50 ? 'warning' : 'danger'}>
                            {d.accuracy}%
                          </Badge>
                        ) : '-'}
                      </td>
                      <td className="py-2">
                        {d.ai_score !== null && d.work_completion_rate !== null ? (
                          d.work_completion_rate >= d.ai_score ? (
                            <TrendingUp className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-500" />
                          )
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
