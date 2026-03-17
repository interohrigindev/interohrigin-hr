import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Candidate } from '@/types/recruitment'

const SCORE_OPTIONS = [
  { value: '1', label: '1 - 매우 부족' },
  { value: '2', label: '2 - 부족' },
  { value: '3', label: '3 - 보통' },
  { value: '4', label: '4 - 우수' },
  { value: '5', label: '5 - 매우 우수' },
]

const PERSONALITY_QUESTIONS = [
  '야근이나 주말 근무가 필요한 경우 어떻게 대처하시겠습니까?',
  '동료와 의견이 충돌할 때 어떻게 해결하시나요?',
  '입사 후 가장 먼저 하고 싶은 일은 무엇인가요?',
  '가장 힘들었던 경험과 그것을 어떻게 극복했나요?',
  '5년 후 본인의 모습을 어떻게 그리고 계신가요?',
]

export default function FaceToFaceEval() {
  const { candidateId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast } = useToast()

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    scheduled_time: '',
    arrival_time: '',
    arrival_status: 'on_time',
    minutes_early_or_late: '0',
    pre_arrival_contact: false,
    appearance_score: '3',
    attitude_score: '3',
    pre_material_read: false,
    answer_consistency: '3',
    free_comments: '',
  })

  const [personalityAnswers, setPersonalityAnswers] = useState<{ question: string; answer: string; score: number }[]>(
    PERSONALITY_QUESTIONS.map((q) => ({ question: q, answer: '', score: 3 }))
  )

  const [materialVerification, setMaterialVerification] = useState<{ question: string; correct: boolean }[]>([
    { question: '우리 회사의 정식 명칭을 말씀해주세요', correct: false },
    { question: '우리 회사의 주요 사업 분야를 아시나요?', correct: false },
    { question: '회사소개서에서 인상 깊었던 부분이 있나요?', correct: false },
  ])

  useEffect(() => {
    if (!candidateId) return
    supabase
      .from('candidates')
      .select('*')
      .eq('id', candidateId)
      .single()
      .then(({ data }) => {
        if (data) setCandidate(data as Candidate)
        setLoading(false)
      })
  }, [candidateId])

  async function handleSubmit() {
    setSaving(true)
    try {
      const totalScore = Math.round(
        (parseInt(form.appearance_score) +
          parseInt(form.attitude_score) +
          parseInt(form.answer_consistency) +
          personalityAnswers.reduce((sum, a) => sum + a.score, 0) / personalityAnswers.length +
          (form.pre_material_read ? 5 : 2) +
          (form.arrival_status === 'early' ? 5 : form.arrival_status === 'on_time' ? 4 : 2)) /
          6 * 20
      )

      const { error: insertErr } = await supabase.from('face_to_face_evals').insert({
        candidate_id: candidateId,
        evaluator_id: profile?.id,
        scheduled_time: form.scheduled_time || null,
        arrival_time: form.arrival_time || null,
        arrival_status: form.arrival_status,
        minutes_early_or_late: parseInt(form.minutes_early_or_late),
        pre_arrival_contact: form.pre_arrival_contact,
        appearance_score: parseInt(form.appearance_score),
        attitude_score: parseInt(form.attitude_score),
        pre_material_read: form.pre_material_read,
        pre_material_verification: materialVerification,
        answer_consistency: parseInt(form.answer_consistency),
        personality_questions: personalityAnswers,
        free_comments: form.free_comments || null,
        total_score: totalScore,
      })

      if (insertErr) throw new Error(insertErr.message)

      // 지원자 상태 업데이트
      await supabase
        .from('candidates')
        .update({ status: 'face_to_face_done' })
        .eq('id', candidateId)

      toast('대면 면접 평가가 제출되었습니다.', 'success')
      navigate(`/admin/recruitment/candidates/${candidateId}`)
    } catch (err: any) {
      toast('제출 실패: ' + err.message, 'error')
    }
    setSaving(false)
  }

  if (loading) return <PageSpinner />
  if (!candidate) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">지원자를 찾을 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대면 면접 평가</h1>
          <p className="text-sm text-gray-500">{candidate.name} ({candidate.email})</p>
        </div>
      </div>

      {/* 도착 시간 */}
      <Card>
        <CardHeader><CardTitle>도착 정보</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="예정 시간"
              type="datetime-local"
              value={form.scheduled_time}
              onChange={(e) => setForm((p) => ({ ...p, scheduled_time: e.target.value }))}
            />
            <Input
              label="실제 도착 시간"
              type="datetime-local"
              value={form.arrival_time}
              onChange={(e) => setForm((p) => ({ ...p, arrival_time: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="도착 상태"
              value={form.arrival_status}
              onChange={(e) => setForm((p) => ({ ...p, arrival_status: e.target.value }))}
              options={[
                { value: 'early', label: '10분 전 도착' },
                { value: 'on_time', label: '정시 도착' },
                { value: 'late', label: '지각' },
              ]}
            />
            <Input
              label="빠른/늦은 시간 (분)"
              type="number"
              value={form.minutes_early_or_late}
              onChange={(e) => setForm((p) => ({ ...p, minutes_early_or_late: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.pre_arrival_contact}
              onChange={(e) => setForm((p) => ({ ...p, pre_arrival_contact: e.target.checked }))}
              className="rounded text-brand-600"
            />
            <span className="text-sm text-gray-700">사전 출발 연락 (주차 확인 등)</span>
          </label>
        </CardContent>
      </Card>

      {/* 외모/태도 */}
      <Card>
        <CardHeader><CardTitle>외모 / 태도</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Select
            label="복장/외모 (5점 척도)"
            value={form.appearance_score}
            onChange={(e) => setForm((p) => ({ ...p, appearance_score: e.target.value }))}
            options={SCORE_OPTIONS}
          />
          <Select
            label="태도/자세 (5점 척도)"
            value={form.attitude_score}
            onChange={(e) => setForm((p) => ({ ...p, attitude_score: e.target.value }))}
            options={SCORE_OPTIONS}
          />
        </CardContent>
      </Card>

      {/* 사전 자료 열람 검증 */}
      <Card>
        <CardHeader><CardTitle>사전 자료 열람 검증</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.pre_material_read}
              onChange={(e) => setForm((p) => ({ ...p, pre_material_read: e.target.checked }))}
              className="rounded text-brand-600"
            />
            <span className="text-sm text-gray-700">사전 자료를 읽은 것으로 확인됨</span>
          </label>

          <div className="space-y-3">
            {materialVerification.map((mv, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">{mv.question}</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mv.correct}
                    onChange={(e) => {
                      const updated = [...materialVerification]
                      updated[i] = { ...updated[i], correct: e.target.checked }
                      setMaterialVerification(updated)
                    }}
                    className="rounded text-brand-600"
                  />
                  <span className="text-xs text-gray-500">정답</span>
                </label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 답변 일관성 */}
      <Card>
        <CardHeader><CardTitle>답변 일관성</CardTitle></CardHeader>
        <CardContent>
          <Select
            label="화상면접 답변과 대면 답변의 일관성 (5점 척도)"
            value={form.answer_consistency}
            onChange={(e) => setForm((p) => ({ ...p, answer_consistency: e.target.value }))}
            options={SCORE_OPTIONS}
          />
        </CardContent>
      </Card>

      {/* 인성 질문 */}
      <Card>
        <CardHeader><CardTitle>인성 질문</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {personalityAnswers.map((pa, i) => (
            <div key={i} className="space-y-2">
              <p className="text-sm font-medium text-gray-700">{i + 1}. {pa.question}</p>
              <Textarea
                value={pa.answer}
                onChange={(e) => {
                  const updated = [...personalityAnswers]
                  updated[i] = { ...updated[i], answer: e.target.value }
                  setPersonalityAnswers(updated)
                }}
                rows={2}
                placeholder="답변 요약"
              />
              <Select
                label="점수"
                value={String(pa.score)}
                onChange={(e) => {
                  const updated = [...personalityAnswers]
                  updated[i] = { ...updated[i], score: parseInt(e.target.value) }
                  setPersonalityAnswers(updated)
                }}
                options={SCORE_OPTIONS}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 자유 코멘트 */}
      <Card>
        <CardHeader><CardTitle>자유 코멘트</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            value={form.free_comments}
            onChange={(e) => setForm((p) => ({ ...p, free_comments: e.target.value }))}
            rows={4}
            placeholder="종합적인 면접 소감, 특이사항 등을 자유롭게 작성하세요"
          />
        </CardContent>
      </Card>

      {/* 제출 */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate(-1)}>취소</Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 제출 중...</>
          ) : (
            <><Save className="h-4 w-4 mr-1" /> 평가 제출</>
          )}
        </Button>
      </div>
    </div>
  )
}
