/**
 * 익명 신고 핫라인 — 공개 페이지 (로그인 불필요)
 *  - /report-anonymous : 새 제보 작성
 *  - /report-anonymous/track : 토큰으로 본인 제보 + HR 응답 확인
 *  - feature_rollouts.anonymous_report = true 일 때만 정상 동작
 */
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { Shield, AlertCircle, CheckCircle2, Search, MessageSquare, Send, Copy } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { FEATURE_KEYS } from '@/types/compliance'
import { formatDate } from '@/lib/utils'

const CATEGORY_OPTIONS = [
  { value: 'harassment', label: '직장 내 괴롭힘' },
  { value: 'sexual', label: '성희롱·성차별' },
  { value: 'discrimination', label: '차별 (연령/성별/장애 등)' },
  { value: 'retaliation', label: '신고에 대한 보복' },
  { value: 'safety', label: '안전·보건 문제' },
  { value: 'other', label: '기타' },
]

export default function ReportAnonymousPage() {
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const initialTrackToken = searchParams.get('token') || ''
  const [featureOn, setFeatureOn] = useState<boolean | null>(null)
  const [mode, setMode] = useState<'submit' | 'track'>(initialTrackToken ? 'track' : 'submit')

  // submit 상태
  const [form, setForm] = useState({
    category: 'harassment',
    subject: '',
    body: '',
    relatedPersons: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submittedToken, setSubmittedToken] = useState<string | null>(null)

  // track 상태
  const [trackToken, setTrackToken] = useState(initialTrackToken)
  const [trackData, setTrackData] = useState<any>(null)
  const [trackError, setTrackError] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replying, setReplying] = useState(false)

  useEffect(() => { isFeatureEnabled(FEATURE_KEYS.ANONYMOUS_REPORT).then(setFeatureOn) }, [])

  async function handleSubmit() {
    if (form.body.trim().length < 10) {
      toast('제보 내용을 10자 이상 입력해주세요.', 'error')
      return
    }
    setSubmitting(true)
    const { data, error } = await supabase.rpc('submit_anonymous_report', {
      p_category: form.category,
      p_subject: form.subject || null,
      p_body: form.body.trim(),
      p_related_persons: form.relatedPersons || null,
    })
    setSubmitting(false)
    if (error) {
      toast(`접수 실패: ${error.message}`, 'error')
      return
    }
    setSubmittedToken((data as { token: string }).token)
  }

  async function loadTrack() {
    if (!trackToken.trim()) return
    setTrackError(null)
    const { data, error } = await supabase.rpc('get_anonymous_report_by_token', { p_token: trackToken.trim() })
    if (error) {
      setTrackError(error.message)
      setTrackData(null)
      return
    }
    setTrackData(data)
  }

  async function sendReply() {
    if (replyBody.trim().length === 0) return
    setReplying(true)
    const { error } = await supabase.rpc('reply_anonymous_report_by_token', {
      p_token: trackToken.trim(),
      p_body: replyBody.trim(),
    })
    setReplying(false)
    if (error) {
      toast(`전송 실패: ${error.message}`, 'error')
      return
    }
    setReplyBody('')
    loadTrack()
  }

  if (featureOn === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-base font-bold text-gray-900">현재 익명 신고 채널 점검 중</h2>
            <p className="text-sm text-gray-500 mt-1">잠시 후 다시 시도하거나 인사팀에 직접 문의해주세요.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-brand-500" /> 익명 신고 핫라인
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              본 채널은 <strong>익명</strong>으로 운영됩니다. 제보자의 이름·이메일·계정 정보를 저장하지 않습니다.
            </p>
          </CardHeader>
        </Card>

        <div className="flex items-center gap-1 border-b border-gray-200">
          <button
            onClick={() => setMode('submit')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              mode === 'submit' ? 'text-brand-700 border-brand-500' : 'text-gray-500 border-transparent'
            }`}
          >새 제보 작성</button>
          <button
            onClick={() => setMode('track')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              mode === 'track' ? 'text-brand-700 border-brand-500' : 'text-gray-500 border-transparent'
            }`}
          >내 제보 진행 확인</button>
        </div>

        {mode === 'submit' && (
          <>
            {!submittedToken ? (
              <Card>
                <CardContent className="space-y-4 pt-6">
                  <Select
                    label="카테고리 *"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    options={CATEGORY_OPTIONS}
                  />
                  <Input
                    label="제목 (선택)"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="간단한 한 줄 제목"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">내용 * (10자 이상)</label>
                    <Textarea
                      value={form.body}
                      onChange={(e) => setForm({ ...form, body: e.target.value })}
                      placeholder="언제, 어디서, 누가, 어떤 일이 있었는지 가능한 한 구체적으로 작성해주세요. 시간이 지나도 본인이 알아볼 수 있도록 메모도 함께 남겨두는 것이 좋습니다."
                      rows={8}
                    />
                  </div>
                  <Input
                    label="관련자 (선택, 자유 기재)"
                    value={form.relatedPersons}
                    onChange={(e) => setForm({ ...form, relatedPersons: e.target.value })}
                    placeholder="예) ○○팀 ○○○ 팀장"
                  />
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    <p className="font-semibold mb-1">⚠ 주의</p>
                    <ul className="ml-4 list-disc space-y-0.5">
                      <li>제보자 본인 이름·이메일은 저장되지 않습니다.</li>
                      <li>제출 후 <strong>추적 토큰</strong>을 받게 됩니다. 이 토큰을 잘 보관해야 진행 상황을 다시 확인할 수 있습니다.</li>
                      <li>회사는 제보 내용을 신중히 검토하며, 보복성 조치는 별도 신고 대상입니다.</li>
                    </ul>
                  </div>
                  <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? '접수 중...' : '익명 제보 접수'}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-emerald-300">
                <CardContent className="pt-6 space-y-4 text-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                  <h2 className="text-lg font-bold text-gray-900">제보가 접수되었습니다</h2>
                  <p className="text-sm text-gray-600">아래 추적 토큰을 <strong>반드시</strong> 안전한 곳에 저장하세요. 이 토큰으로만 진행 상황 확인이 가능합니다.</p>
                  <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 font-mono text-sm break-all select-all">
                    {submittedToken}
                  </div>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" size="sm" onClick={() => {
                      navigator.clipboard.writeText(submittedToken)
                      toast('토큰이 복사되었습니다', 'success')
                    }}>
                      <Copy className="h-3 w-3 mr-1" /> 토큰 복사
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      setSubmittedToken(null)
                      setForm({ category: 'harassment', subject: '', body: '', relatedPersons: '' })
                    }}>
                      새 제보 작성
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {mode === 'track' && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="추적 토큰 (32자 hex)"
                  value={trackToken}
                  onChange={(e) => setTrackToken(e.target.value)}
                  className="font-mono"
                />
                <Button onClick={loadTrack}><Search className="h-4 w-4 mr-1" /> 조회</Button>
              </div>
              {trackError && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
                  {trackError}
                </div>
              )}
              {trackData?.report && (
                <div className="space-y-3">
                  <div className="bg-gray-50 border rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="info">{CATEGORY_OPTIONS.find((c) => c.value === trackData.report.category)?.label}</Badge>
                      <Badge variant={
                        trackData.report.status === 'resolved' ? 'success' :
                        trackData.report.status === 'closed' ? 'default' : 'warning'
                      }>{trackData.report.status}</Badge>
                      <span className="text-xs text-gray-500">{formatDate(trackData.report.created_at, 'yyyy.MM.dd HH:mm')}</span>
                    </div>
                    {trackData.report.subject && <div className="font-semibold text-gray-900">{trackData.report.subject}</div>}
                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-keep">{trackData.report.body}</p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" /> 응답 ({trackData.replies?.length || 0}건)
                    </h3>
                    {(trackData.replies || []).map((r: any) => (
                      <div key={r.id} className={`rounded-lg p-3 text-sm ${
                        r.from_role === 'hr' ? 'bg-brand-50 border border-brand-200' : 'bg-gray-100 border border-gray-200'
                      }`}>
                        <div className="text-xs text-gray-500 mb-1">
                          {r.from_role === 'hr' ? 'HR 답변' : '내 메시지'} · {formatDate(r.created_at, 'yyyy.MM.dd HH:mm')}
                        </div>
                        <div className="whitespace-pre-wrap break-keep">{r.body}</div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="추가로 전달할 내용이 있으면 입력하세요. (익명 유지)"
                      rows={3}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={sendReply} disabled={replying || !replyBody.trim()}>
                        <Send className="h-3 w-3 mr-1" /> 전송
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-gray-400">
          본 채널은 사내 조기 발견 및 자체 해결을 위한 시스템입니다. 형사·노동 분쟁은 별도 외부 절차도 가능합니다.
        </p>
      </div>
    </div>
  )
}
