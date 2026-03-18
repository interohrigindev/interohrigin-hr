import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { PageSpinner } from '@/components/ui/Spinner'
import { ClipboardCheck, Save, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  SIMPLE_EVAL_ITEMS,
  SIMPLE_SCORE_LABELS,
  RECOMMENDATION_LABELS,
  RECOMMENDATION_COLORS,
  type SimpleScoreValue,
  type OverallRecommendation,
  type SimpleEvalData,
  type AIReferenceData,
} from '@/types/simple-evaluation'
import type { Employee } from '@/types/database'

// ─── 메인 컴포넌트 ───────────────────────────────────────────────
export default function SimpleEvaluation() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [evalData, setEvalData] = useState<Record<string, SimpleEvalData>>({})
  const [aiData, setAiData] = useState<Record<string, AIReferenceData>>({})
  const [submitting, setSubmitting] = useState(false)
  const [selectedDept, setSelectedDept] = useState<string>('all')
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])

  // 직원 + 부서 로딩
  useEffect(() => {
    async function fetch() {
      setLoading(true)

      const [empRes, deptRes] = await Promise.all([
        supabase.from('employees').select('*').eq('is_active', true).order('name'),
        supabase.from('departments').select('id, name').order('name'),
      ])

      if (empRes.data) setEmployees(empRes.data as Employee[])
      if (deptRes.data) setDepartments(deptRes.data)

      // 초기 평가 데이터 세팅
      if (empRes.data) {
        const initial: Record<string, SimpleEvalData> = {}
        for (const emp of empRes.data) {
          initial[emp.id] = {
            employee_id: emp.id,
            scores: {},
            recommendation: null,
            overall_comment: '',
            special_note: '',
          }
        }
        setEvalData(initial)
      }

      // AI 참고 데이터 가져오기 (긴급업무 리마인드 데이터)
      await fetchAIReferenceData(empRes.data || [])

      setLoading(false)
    }
    fetch()
  }, [])

  const fetchAIReferenceData = useCallback(async (emps: Employee[]) => {
    const aiRef: Record<string, AIReferenceData> = {}

    // 리마인드 패널티 데이터
    const { data: penalties } = await supabase
      .from('reminder_penalties')
      .select('*')

    // 특이사항 카운트
    const { data: notes } = await supabase
      .from('special_notes')
      .select('employee_id, note_type')

    for (const emp of emps) {
      const empPenalty = penalties?.find((p: { employee_id: string }) => p.employee_id === emp.id)
      const empNotes = notes?.filter((n: { employee_id: string }) => n.employee_id === emp.id) || []

      aiRef[emp.id] = {
        task_completion_rate: null,
        deadline_compliance_rate: null,
        urgent_reminder_count: empPenalty?.total_reminders_received ?? 0,
        ojt_score: null,
        mentor_rating: null,
        positive_notes: empNotes.filter((n: { note_type: string }) => n.note_type === 'positive').length,
        negative_notes: empNotes.filter((n: { note_type: string }) => n.note_type === 'negative').length,
        penalty_score: empPenalty?.penalty_score ?? 0,
      }
    }

    setAiData(aiRef)
  }, [])

  // 점수 업데이트
  function updateScore(employeeId: string, itemKey: string, value: SimpleScoreValue) {
    setEvalData((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        scores: { ...prev[employeeId].scores, [itemKey]: value },
      },
    }))
  }

  function updateRecommendation(employeeId: string, value: OverallRecommendation) {
    setEvalData((prev) => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], recommendation: value },
    }))
  }

  function updateComment(employeeId: string, field: 'overall_comment' | 'special_note', value: string) {
    setEvalData((prev) => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], [field]: value },
    }))
  }

  // 필터링된 직원
  const filteredEmployees = selectedDept === 'all'
    ? employees
    : employees.filter((e) => e.department_id === selectedDept)

  // 제출
  async function handleSubmit() {
    setSubmitting(true)
    try {
      // 각 직원의 평가 데이터를 evaluator_scores에 저장
      for (const emp of filteredEmployees) {
        const data = evalData[emp.id]
        if (!data) continue

        const scores = Object.entries(data.scores).filter(([, v]) => v !== null)
        if (scores.length === 0 && !data.recommendation) continue

        // evaluator_comments에 총평 저장
        if (data.overall_comment || data.special_note) {
          await supabase.from('evaluator_comments').upsert({
            target_id: emp.id,
            evaluator_id: profile?.id,
            evaluator_role: profile?.role,
            overall: data.overall_comment,
            strength: data.special_note || null,
          }, { onConflict: 'target_id,evaluator_id' })
        }
      }

      toast('평가가 저장되었습니다')
    } catch {
      toast('저장 중 오류가 발생했습니다', 'error')
    }
    setSubmitting(false)
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-7 w-7 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">간편 인사평가</h1>
            <p className="text-sm text-gray-500">객관식 10문항 + 총평 2줄 (5분 내 완료)</p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={submitting}>
          <Save className="h-4 w-4" />
          {submitting ? '저장 중...' : '전체 제출'}
        </Button>
      </div>

      {/* 부서 필터 */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedDept('all')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            selectedDept === 'all'
              ? 'bg-brand-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          전체
        </button>
        {departments.map((dept) => (
          <button
            key={dept.id}
            onClick={() => setSelectedDept(dept.id)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              selectedDept === dept.id
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {dept.name}
          </button>
        ))}
      </div>

      {/* 평가 항목 헤더 안내 */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <Info className="h-4 w-4 shrink-0" />
            <span>
              각 항목을 클릭하여 점수를 선택하세요. <strong>1: 매우미흡 ~ 5: 매우우수</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 그리드 뷰 평가 */}
      {filteredEmployees.map((emp) => {
        const data = evalData[emp.id]
        const ai = aiData[emp.id]
        if (!data) return null

        return (
          <Card key={emp.id} className="overflow-hidden">
            <CardHeader className="bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                    {emp.name.charAt(0)}
                  </div>
                  <div>
                    <CardTitle className="text-base">{emp.name}</CardTitle>
                    <p className="text-xs text-gray-500">{emp.position ?? emp.role}</p>
                  </div>
                </div>

                {/* AI 참고 데이터 */}
                {ai && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {ai.urgent_reminder_count > 0 && (
                      <span className="rounded bg-red-50 px-2 py-0.5 text-red-600">
                        긴급 리마인드 {ai.urgent_reminder_count}회
                      </span>
                    )}
                    {ai.positive_notes > 0 && (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-600">
                        +{ai.positive_notes}건
                      </span>
                    )}
                    {ai.negative_notes > 0 && (
                      <span className="rounded bg-red-50 px-2 py-0.5 text-red-600">
                        -{ai.negative_notes}건
                      </span>
                    )}
                    {ai.penalty_score !== 0 && (
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-600">
                        감점 {ai.penalty_score}점
                      </span>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-3 py-4">
              {/* 9개 항목 (5점 척도) */}
              <div className="grid gap-2">
                {SIMPLE_EVAL_ITEMS.slice(0, 9).map((item) => (
                  <div key={item.key} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-sm font-medium text-gray-700">
                      {item.label}
                    </span>
                    <div className="flex gap-1">
                      {([1, 2, 3, 4, 5] as SimpleScoreValue[]).map((score) => (
                        <button
                          key={score}
                          type="button"
                          onClick={() => updateScore(emp.id, item.key, score)}
                          className={cn(
                            'h-8 w-8 rounded-full text-xs font-medium transition-all',
                            data.scores[item.key] === score
                              ? score <= 2
                                ? 'bg-red-500 text-white ring-2 ring-red-300'
                                : score === 3
                                  ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                                  : 'bg-emerald-500 text-white ring-2 ring-emerald-300'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          )}
                          title={SIMPLE_SCORE_LABELS[score]}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">
                      {data.scores[item.key] ? SIMPLE_SCORE_LABELS[data.scores[item.key] as SimpleScoreValue] : ''}
                    </span>
                  </div>
                ))}
              </div>

              {/* 종합 추천 */}
              <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
                <span className="w-28 shrink-0 text-sm font-medium text-gray-700">종합 추천</span>
                <div className="flex gap-2">
                  {(Object.entries(RECOMMENDATION_LABELS) as [OverallRecommendation, string][]).map(
                    ([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => updateRecommendation(emp.id, key)}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                          data.recommendation === key
                            ? RECOMMENDATION_COLORS[key] + ' ring-2 ring-offset-1'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        )}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* 총평 + 특이사항 */}
              <div className="grid gap-3 border-t border-gray-100 pt-3 md:grid-cols-2">
                <Textarea
                  label="총평 (2줄 이내)"
                  value={data.overall_comment}
                  onChange={(e) => updateComment(emp.id, 'overall_comment', e.target.value)}
                  placeholder="간략한 총평을 입력하세요"
                  rows={2}
                />
                <Textarea
                  label="특이사항 (선택)"
                  value={data.special_note}
                  onChange={(e) => updateComment(emp.id, 'special_note', e.target.value)}
                  placeholder="특이사항이 있으면 입력하세요"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        )
      })}

      {/* 하단 제출 버튼 */}
      {filteredEmployees.length > 0 && (
        <div className="flex justify-center pb-8">
          <Button size="lg" onClick={handleSubmit} disabled={submitting}>
            <Save className="h-4 w-4" />
            {submitting ? '저장 중...' : '전체 제출'}
          </Button>
        </div>
      )}
    </div>
  )
}
