import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { generateAIContent } from '@/lib/ai-client'
import type { EmployeeProfile, PersonalityAnalysis as PAType } from '@/types/employee-lifecycle'
import type { Employee } from '@/types/database'

interface EmployeeWithProfile extends Employee {
  employee_profiles?: EmployeeProfile[]
}

export default function PersonalityAnalysisPage() {
  const { toast } = useToast()
  const { hasRole } = useAuth()
  const [employees, setEmployees] = useState<EmployeeWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithProfile | null>(null)
  const [analyses, setAnalyses] = useState<PAType[]>([])
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [aiRunning, setAiRunning] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})

  const canSeeDetails = hasRole('director')

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*, employee_profiles(*)')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      setEmployees((data ?? []) as any)
    } catch {
      toast('직원 목록 로딩 실패', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  async function handleSelectEmployee(emp: EmployeeWithProfile) {
    setSelectedEmployee(emp)
    setShowDetail(true)
    setAnalysisLoading(true)
    try {
      const [analysisRes, visRes] = await Promise.all([
        supabase
          .from('personality_analysis')
          .select('*')
          .eq('employee_id', emp.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profile_visibility_settings')
          .select('*')
          .eq('employee_id', emp.id)
          .limit(1),
      ])
      setAnalyses((analysisRes.data ?? []) as any)
      if (visRes.data && visRes.data.length > 0) {
        const v = visRes.data[0] as any
        setVisibility({
          show_mbti: v.show_mbti,
          show_blood_type: v.show_blood_type,
          show_saju: v.show_saju,
          show_birth_date: v.show_birth_date,
        })
      } else {
        setVisibility({ show_mbti: true, show_blood_type: true, show_saju: true, show_birth_date: true })
      }
    } catch {
      toast('분석 데이터 로딩 실패', 'error')
    } finally {
      setAnalysisLoading(false)
    }
  }

  async function handleToggleVisibility(field: string) {
    if (!selectedEmployee) return
    const newVal = !visibility[field]
    const newVis = { ...visibility, [field]: newVal }
    setVisibility(newVis)

    try {
      const { data: existing } = await supabase
        .from('profile_visibility_settings')
        .select('id')
        .eq('employee_id', selectedEmployee.id)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase
          .from('profile_visibility_settings')
          .update({ [field]: newVal })
          .eq('employee_id', selectedEmployee.id)
      } else {
        await supabase.from('profile_visibility_settings').insert({
          employee_id: selectedEmployee.id,
          ...newVis,
        })
      }
      toast('공개 설정 변경 완료', 'success')
    } catch {
      toast('공개 설정 변경 실패', 'error')
    }
  }

  async function handleRunAIAnalysis() {
    if (!selectedEmployee) return
    const profile = selectedEmployee.employee_profiles?.[0]
    if (!profile?.birth_date && !profile?.mbti) {
      toast('생년월일 또는 MBTI 정보가 필요합니다', 'error')
      return
    }

    setAiRunning(true)
    try {
      const apiKey = localStorage.getItem('ai_api_key') || ''
      const provider = (localStorage.getItem('ai_provider') || 'gemini') as 'gemini' | 'openai'
      const model = localStorage.getItem('ai_model') || 'gemini-2.5-flash'

      if (!apiKey) {
        toast('AI 설정에서 API 키를 먼저 등록하세요', 'error')
        return
      }

      const prompt = `다음 직원의 사주/MBTI 기반 성향 분석을 해주세요.

이름: ${selectedEmployee.name}
생년월일: ${profile?.birth_date ?? '미제공'}
출생시간: ${profile?.birth_time ?? '미제공'}
음력 여부: ${profile?.lunar_birth ? '음력' : '양력'}
MBTI: ${profile?.mbti ?? '미제공'}
혈액형: ${profile?.blood_type ?? '미제공'}

다음 항목을 JSON 형식으로 분석해주세요:
{
  "summary": "종합 성향 요약 (2-3문장)",
  "strengths": ["강점1", "강점2", "강점3"],
  "cautions": ["주의사항1", "주의사항2"],
  "job_fit": { "적합직무": ["직무1", "직무2"], "부적합직무": ["직무1"] },
  "team_fit": { "잘맞는유형": ["유형1"], "주의유형": ["유형1"] },
  "saju_analysis": "사주 기반 분석 (해당되는 경우)",
  "mbti_detail": "MBTI 상세 분석 (해당되는 경우)"
}

참고: 사주/MBTI는 참고 자료이며 과학적 근거가 제한적입니다. 분석은 참고용으로만 활용됩니다.`

      const result = await generateAIContent({ provider, apiKey, model }, prompt)

      let parsed: Record<string, unknown> = {}
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/)
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
      } catch {
        parsed = { raw: result.content }
      }

      const strengths = Array.isArray(parsed.strengths) ? parsed.strengths as string[] : []
      const cautions = Array.isArray(parsed.cautions) ? parsed.cautions as string[] : []

      const { error } = await supabase.from('personality_analysis').insert({
        employee_id: selectedEmployee.id,
        analysis_type: profile?.mbti && profile?.birth_date ? 'comprehensive' : profile?.mbti ? 'mbti' : 'saju',
        result: parsed,
        strengths,
        cautions,
        job_fit: (parsed.job_fit as Record<string, unknown>) ?? {},
        team_fit: (parsed.team_fit as Record<string, unknown>) ?? {},
        provider: result.provider,
        model: result.model,
      })

      if (error) throw error
      toast('AI 분석 완료', 'success')
      handleSelectEmployee(selectedEmployee)
    } catch {
      toast('AI 분석 실패', 'error')
    } finally {
      setAiRunning(false)
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">사주/MBTI 분석</h1>

      {/* Disclaimer */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-800">
          ⚠ 사주/MBTI는 참고 자료입니다. 과학적 근거가 제한적이며, 인사 결정의 주요 기준으로 사용하지 않습니다.
          직원의 다양성을 존중하고, 참고 목적으로만 활용하세요.
        </p>
      </div>

      {/* Employee List */}
      <Card>
        <CardHeader>
          <CardTitle>직원 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <p className="text-sm text-gray-500">직원이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {employees.map((emp) => {
                const profile = emp.employee_profiles?.[0]
                return (
                  <div
                    key={emp.id}
                    className="flex cursor-pointer items-center justify-between rounded-lg border p-3 hover:bg-gray-50 transition-colors"
                    onClick={() => handleSelectEmployee(emp)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-700">
                        {emp.name.slice(0, 1)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{emp.name}</p>
                        <p className="text-xs text-gray-500">{emp.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {profile?.mbti && <Badge variant="purple">{profile.mbti}</Badge>}
                      {profile?.blood_type && (
                        <Badge variant="info">{profile.blood_type}형</Badge>
                      )}
                      {!profile?.mbti && !profile?.blood_type && (
                        <Badge variant="default">미등록</Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog
        open={showDetail}
        onClose={() => setShowDetail(false)}
        title={selectedEmployee ? `${selectedEmployee.name} 성향 분석` : '성향 분석'}
        className="max-w-2xl"
      >
        {analysisLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !canSeeDetails ? (
          <p className="text-sm text-gray-500">임원(이사) 이상만 상세 정보를 열람할 수 있습니다.</p>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Profile Info */}
            {selectedEmployee?.employee_profiles?.[0] && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">기본 정보</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-gray-500">MBTI</span>
                  <span>{selectedEmployee.employee_profiles[0].mbti ?? '-'}</span>
                  <span className="text-gray-500">혈액형</span>
                  <span>{selectedEmployee.employee_profiles[0].blood_type ? `${selectedEmployee.employee_profiles[0].blood_type}형` : '-'}</span>
                  <span className="text-gray-500">생년월일</span>
                  <span>{selectedEmployee.employee_profiles[0].birth_date ?? '-'}</span>
                </div>
              </div>
            )}

            {/* Visibility toggles */}
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium text-gray-700">공개 설정</p>
              <div className="flex flex-wrap gap-3">
                {[
                  { key: 'show_mbti', label: 'MBTI' },
                  { key: 'show_blood_type', label: '혈액형' },
                  { key: 'show_saju', label: '사주' },
                  { key: 'show_birth_date', label: '생년월일' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={!!visibility[key]}
                      onChange={() => handleToggleVisibility(key)}
                      className="rounded border-gray-300"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* AI Analysis Button */}
            <Button onClick={handleRunAIAnalysis} disabled={aiRunning} className="w-full">
              {aiRunning ? 'AI 분석 실행 중...' : 'AI 분석 실행'}
            </Button>

            {/* Analysis Results */}
            {analyses.length === 0 ? (
              <p className="text-sm text-gray-500">분석 결과가 없습니다. AI 분석을 실행해주세요.</p>
            ) : (
              analyses.map((analysis) => (
                <Card key={analysis.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {analysis.analysis_type === 'comprehensive' && '종합 분석'}
                        {analysis.analysis_type === 'saju' && '사주 분석'}
                        {analysis.analysis_type === 'mbti' && 'MBTI 분석'}
                        {analysis.analysis_type === 'cross' && '교차 분석'}
                      </CardTitle>
                      <span className="text-xs text-gray-400">
                        {new Date(analysis.created_at).toLocaleString('ko-KR')}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Summary */}
                    {(analysis.result as any)?.summary && (
                      <p className="text-sm text-gray-700">{(analysis.result as any).summary}</p>
                    )}
                    {/* Strengths */}
                    {analysis.strengths.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">강점</p>
                        <div className="flex flex-wrap gap-1">
                          {analysis.strengths.map((s, i) => (
                            <Badge key={i} variant="success">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Cautions */}
                    {analysis.cautions.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">주의사항</p>
                        <div className="flex flex-wrap gap-1">
                          {analysis.cautions.map((c, i) => (
                            <Badge key={i} variant="warning">{c}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Raw result for deeper info */}
                    {(analysis.result as any)?.saju_analysis && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">사주 분석</p>
                        <p className="text-sm text-gray-600">{(analysis.result as any).saju_analysis}</p>
                      </div>
                    )}
                    {(analysis.result as any)?.mbti_detail && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">MBTI 상세</p>
                        <p className="text-sm text-gray-600">{(analysis.result as any).mbti_detail}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </Dialog>
    </div>
  )
}
