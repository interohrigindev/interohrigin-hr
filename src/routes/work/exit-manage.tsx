import { useState, useEffect, useCallback } from 'react'
import { Link2, Eye, Sparkles, UserX } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature } from '@/lib/ai-client'
import type { Employee } from '@/types/database'
import type { ExitSurvey } from '@/types/employee-lifecycle'

export default function ExitManagement() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [surveys, setSurveys] = useState<(ExitSurvey & { employee_name?: string })[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  // Create link dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [createdLink, setCreatedLink] = useState<string | null>(null)

  // View survey dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [viewSurvey, setViewSurvey] = useState<(ExitSurvey & { employee_name?: string }) | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [surveyRes, empRes] = await Promise.all([
      supabase.from('exit_surveys').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('*'),
    ])

    const emps = (empRes.data || []) as Employee[]
    setEmployees(emps)

    if (surveyRes.data) {
      const enriched = (surveyRes.data as ExitSurvey[]).map((s) => ({
        ...s,
        employee_name: emps.find((e) => e.id === s.employee_id)?.name || '알 수 없음',
      }))
      setSurveys(enriched)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleCreateLink() {
    if (!selectedEmployeeId) {
      toast('직원을 선택하세요.', 'error')
      return
    }

    const token = crypto.randomUUID()
    const { error } = await supabase.from('exit_surveys').insert({
      employee_id: selectedEmployeeId,
      token,
    })

    if (error) {
      toast('링크 생성 실패: ' + error.message, 'error')
      return
    }

    const link = `${window.location.origin}/exit-survey/${token}`
    setCreatedLink(link)
    toast('퇴사 설문 링크가 생성되었습니다.', 'success')
    fetchData()
  }

  async function handleAIInsight() {
    setAiLoading(true)
    try {
      const config = await getAIConfigForFeature('exit_analysis')

      if (!config) {
        toast('AI 설정이 필요합니다.', 'error')
        setAiLoading(false)
        return
      }

      const completedSurveys = surveys.filter((s) => s.completed_at)
      const reasons = completedSurveys
        .map((s) => `- 사유: ${s.exit_reason_category || '미기입'} / ${s.exit_reason_detail || '상세 없음'} / 아쉬운 점: ${s.worst_experience || '없음'}`)
        .join('\n')

      const prompt = `다음 퇴사 설문 데이터를 분석하여 트렌드와 인사이트를 제공해주세요.

완료된 퇴사 설문 ${completedSurveys.length}건:
${reasons || '데이터 없음'}

다음을 포함하여 분석해주세요:
1. 주요 퇴사 사유 패턴
2. 반복적으로 나타나는 문제점
3. "최근 6개월 퇴사 N명 중 M명이 'OO'을 사유로 선택" 형태의 구체적 인사이트
4. 개선 제안 3가지

간결하게 답변해주세요.`

      const result = await generateAIContent(config, prompt)
      setAiInsight(result.content)
    } catch (err: any) {
      toast('AI 분석 실패: ' + err.message, 'error')
    }
    setAiLoading(false)
  }

  if (loading) return <PageSpinner />

  const completedCount = surveys.filter((s) => s.completed_at).length
  const pendingCount = surveys.filter((s) => !s.completed_at).length
  const activeEmployees = employees.filter((e) => e.is_active)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">퇴사 관리</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAIInsight} disabled={aiLoading}>
            {aiLoading ? <Spinner size="sm" /> : <Sparkles className="h-4 w-4" />}
            AI 분석
          </Button>
          <Button onClick={() => { setCreateDialogOpen(true); setCreatedLink(null); setSelectedEmployeeId('') }}>
            <Link2 className="h-4 w-4" /> 설문 링크 생성
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-700">{surveys.length}</p>
            <p className="text-xs text-gray-500">전체 설문</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{completedCount}</p>
            <p className="text-xs text-gray-500">완료</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
            <p className="text-xs text-gray-500">미완료</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Insight */}
      {aiInsight && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" /> AI 퇴사 트렌드 분석
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-purple-50 p-4 rounded-lg text-sm text-purple-900 whitespace-pre-wrap">
              {aiInsight}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Survey List */}
      <Card>
        <CardHeader>
          <CardTitle>퇴사 설문 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {surveys.length === 0 ? (
            <div className="text-center py-8">
              <UserX className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">퇴사 설문이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {surveys.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.employee_name}</p>
                    <p className="text-xs text-gray-500">
                      {s.exit_date && `퇴사일: ${s.exit_date} · `}
                      {s.exit_reason_category && `사유: ${s.exit_reason_category} · `}
                      생성: {new Date(s.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.completed_at ? 'success' : 'warning'}>
                      {s.completed_at ? '완료' : '미완료'}
                    </Badge>
                    {s.completed_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setViewSurvey(s); setViewDialogOpen(true) }}
                      >
                        <Eye className="h-3 w-3" /> 보기
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Link Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="퇴사 설문 링크 생성"
      >
        <div className="space-y-4">
          <Select
            label="대상 직원"
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            options={[
              { value: '', label: '직원 선택' },
              ...activeEmployees.map((e) => ({ value: e.id, label: e.name })),
            ]}
          />

          {createdLink && (
            <div className="bg-emerald-50 p-3 rounded-lg">
              <p className="text-xs text-emerald-600 font-medium mb-1">설문 링크가 생성되었습니다:</p>
              <p className="text-sm text-emerald-800 break-all select-all">{createdLink}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>닫기</Button>
            {!createdLink && (
              <Button onClick={handleCreateLink} disabled={!selectedEmployeeId}>
                <Link2 className="h-4 w-4" /> 링크 생성
              </Button>
            )}
          </div>
        </div>
      </Dialog>

      {/* View Survey Dialog */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        title={`퇴사 설문 - ${viewSurvey?.employee_name}`}
        className="max-w-lg"
      >
        {viewSurvey && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-gray-500 text-xs">퇴사일</p>
                <p className="font-medium">{viewSurvey.exit_date || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">퇴사 사유</p>
                <p className="font-medium">{viewSurvey.exit_reason_category || '-'}</p>
              </div>
            </div>
            {viewSurvey.exit_reason_detail && (
              <div>
                <p className="text-gray-500 text-xs">상세 사유</p>
                <p>{viewSurvey.exit_reason_detail}</p>
              </div>
            )}
            {viewSurvey.best_experience && (
              <div>
                <p className="text-gray-500 text-xs">좋았던 경험</p>
                <p>{viewSurvey.best_experience}</p>
              </div>
            )}
            {viewSurvey.worst_experience && (
              <div>
                <p className="text-gray-500 text-xs">아쉬웠던 경험</p>
                <p>{viewSurvey.worst_experience}</p>
              </div>
            )}
            {viewSurvey.suggestions && (
              <div>
                <p className="text-gray-500 text-xs">제안사항</p>
                <p>{viewSurvey.suggestions}</p>
              </div>
            )}
            {viewSurvey.anonymous_feedback && (
              <div>
                <p className="text-gray-500 text-xs">익명 피드백</p>
                <p>{viewSurvey.anonymous_feedback}</p>
              </div>
            )}
            <div className="flex justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>닫기</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
