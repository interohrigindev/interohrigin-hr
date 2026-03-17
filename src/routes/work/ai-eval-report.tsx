import { useState, useEffect, useCallback } from 'react'
import { FileBarChart, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { generateAIContent, type AIConfig } from '@/lib/ai-client'
import type { Employee } from '@/types/database'

export default function AIEvalReport() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])

  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString())
  const [selectedQuarter, setSelectedQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3).toString())
  const [report, setReport] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [empRes, deptRes] = await Promise.all([
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name'),
    ])
    if (empRes.data) setEmployees(empRes.data as Employee[])
    if (deptRes.data) setDepartments(deptRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleGenerate() {
    if (!selectedEmployee) {
      toast('직원을 선택하세요.', 'error')
      return
    }

    setGenerating(true)
    setReport(null)

    try {
      const { data: aiSettings } = await supabase
        .from('ai_settings').select('*').eq('is_active', true).limit(1).single()

      if (!aiSettings) {
        toast('AI 설정이 필요합니다.', 'error')
        setGenerating(false)
        return
      }

      const config: AIConfig = {
        provider: aiSettings.provider,
        apiKey: aiSettings.api_key,
        model: aiSettings.model,
      }

      const emp = employees.find((e) => e.id === selectedEmployee)
      const dept = departments.find((d) => d.id === emp?.department_id)

      // Gather data - first batch
      const [metricsRes, evalRes, ojtRes, mentorRes, notesRes] = await Promise.all([
        supabase.from('work_metrics').select('*')
          .eq('employee_id', selectedEmployee)
          .eq('period_year', parseInt(selectedYear))
          .eq('period_quarter', parseInt(selectedQuarter))
          .maybeSingle(),
        supabase.from('evaluation_targets').select('*, evaluator_scores(*)')
          .eq('employee_id', selectedEmployee)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('ojt_enrollments').select('*, ojt_programs(*)')
          .eq('employee_id', selectedEmployee)
          .order('created_at', { ascending: false })
          .limit(3),
        supabase.from('mentor_assignments').select('*')
          .or(`mentee_id.eq.${selectedEmployee},mentor_id.eq.${selectedEmployee}`)
          .order('created_at', { ascending: false })
          .limit(3),
        supabase.from('special_notes').select('*')
          .eq('employee_id', selectedEmployee)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      // Second fetch depends on evalRes
      const evalTargetId = (evalRes.data as any)?.id || '00000000-0000-0000-0000-000000000000'
      const scoresRes = await supabase.from('evaluator_scores').select('*, evaluation_items(*)')
        .eq('target_id', evalTargetId)

      const metrics = metricsRes.data as any
      const evalTarget = evalRes.data as any
      const ojtData = (ojtRes.data || []) as any[]
      const mentorData = (mentorRes.data || []) as any[]
      const notesData = (notesRes.data || []) as any[]
      const scoresData = (scoresRes.data || []) as any[]

      const prompt = `다음 직원의 종합 평가 리포트를 작성해주세요.

## 직원 정보
- 이름: ${emp?.name}
- 부서: ${dept?.name || '미배정'}
- 역할: ${emp?.role}
- 기간: ${selectedYear}년 ${selectedQuarter}분기

## 업무 성과 (Work Metrics)
${metrics ? `
- 전체 작업: ${metrics.total_tasks}
- 완료 작업: ${metrics.completed_tasks}
- 완료율: ${metrics.task_completion_rate}%
- 마감 준수율: ${metrics.deadline_compliance ?? '데이터 없음'}%
- 지연 작업: ${metrics.overdue_tasks}
- 평균 일일 만족도: ${metrics.avg_daily_satisfaction ?? '데이터 없음'}
` : '데이터 없음'}

## 인사평가 결과
${evalTarget ? `
- 최종 점수: ${evalTarget.final_score ?? '미산출'}
- 등급: ${evalTarget.grade ?? '미산출'}
- 상태: ${evalTarget.status}
` : '평가 이력 없음'}

## 평가 점수 상세
${scoresData.length > 0 ? scoresData.map((s: any) => `- ${s.evaluation_items?.name || '항목'}: ${s.score}점 (${s.evaluator_role})`).join('\n') : '상세 점수 없음'}

## OJT 이수 현황
${ojtData.length > 0 ? ojtData.map((o: any) => `- ${o.ojt_programs?.name || 'OJT'}: ${o.status} (점수: ${o.total_quiz_score ?? '미응시'})`).join('\n') : 'OJT 이력 없음'}

## 멘토링 현황
${mentorData.length > 0 ? mentorData.map((m: any) => `- ${m.assignment_type} (${m.status})`).join('\n') : '멘토링 이력 없음'}

## 특이사항
${notesData.length > 0 ? notesData.map((n: any) => `- [${n.note_type}/${n.severity}] ${n.content}`).join('\n') : '특이사항 없음'}

---

다음을 포함하여 **마크다운 형식**으로 종합 리포트를 작성해주세요:
1. **종합 평가 요약** - 전반적인 성과를 2-3문장으로
2. **업무 실적 분석** - 작업 완료율, 마감 준수 등
3. **역량 평가** - 인사평가 점수 기반
4. **성장 현황** - OJT, 멘토링 참여도
5. **특이사항 요약** - 긍정적/부정적 사항
6. **종합 의견 및 제안** - 향후 발전 방향

각 섹션은 ##로 구분하고, 구체적 수치를 인용하세요.`

      const result = await generateAIContent(config, prompt)
      setReport(result.content)
    } catch (err: any) {
      toast('리포트 생성 실패: ' + err.message, 'error')
    }

    setGenerating(false)
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">AI 평가 리포트 통합</h1>

      {/* Controls */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3 items-end">
            <Select
              label="직원"
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              options={[
                { value: '', label: '직원 선택' },
                ...employees.map((em) => ({ value: em.id, label: em.name })),
              ]}
            />
            <Select
              label="연도"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              options={[2024, 2025, 2026].map((y) => ({ value: y.toString(), label: `${y}년` }))}
            />
            <Select
              label="분기"
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value)}
              options={[1, 2, 3, 4].map((q) => ({ value: q.toString(), label: `${q}분기` }))}
            />
            <Button onClick={handleGenerate} disabled={generating || !selectedEmployee}>
              {generating ? (
                <><Spinner size="sm" /> 생성 중...</>
              ) : (
                <><FileBarChart className="h-4 w-4" /> 통합 리포트 생성</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI 통합 평가 리포트
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              {report.split('\n').map((line, idx) => {
                if (line.startsWith('## ')) {
                  return <h2 key={idx} className="text-lg font-bold text-gray-900 mt-6 mb-2">{line.replace('## ', '')}</h2>
                }
                if (line.startsWith('### ')) {
                  return <h3 key={idx} className="text-base font-semibold text-gray-800 mt-4 mb-1">{line.replace('### ', '')}</h3>
                }
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <p key={idx} className="font-semibold text-gray-800 mt-2">{line.replace(/\*\*/g, '')}</p>
                }
                if (line.startsWith('- ')) {
                  return <li key={idx} className="text-sm text-gray-700 ml-4">{line.replace('- ', '')}</li>
                }
                if (line.trim() === '---') {
                  return <hr key={idx} className="my-4" />
                }
                if (line.trim()) {
                  return <p key={idx} className="text-sm text-gray-700 mb-1">{line}</p>
                }
                return <br key={idx} />
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
