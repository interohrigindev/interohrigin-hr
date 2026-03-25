/**
 * 면접 분석 컴포넌트
 * - 화상면접: 녹화본 → 텍스트 추출 → AI 분석
 * - 대면면접: 녹음파일 업로드 → 텍스트 추출 → AI 분석
 * - 향후: AI 면접관 실시간 분석 확장 가능
 */
import { useState, useEffect, useRef } from 'react'
import { Video, Mic, Upload, Loader2, Sparkles, ChevronDown, ChevronUp, Clock, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/utils'

interface InterviewAnalysisProps {
  candidateId: string
  candidateName: string
}

interface ScheduleRow {
  id: string
  interview_type: 'video' | 'face_to_face'
  scheduled_at: string
  duration_minutes: number
  status: string
  meeting_link: string | null
}

interface RecordingRow {
  id: string
  candidate_id: string
  recording_url: string
  recording_type: 'video' | 'audio'
  duration_seconds: number | null
  file_size_bytes: number | null
  status: string
}

interface AnalysisRow {
  id: string
  candidate_id: string
  schedule_id: string | null
  recording_id: string | null
  interview_type: string
  transcription: string | null
  ai_summary: string | null
  key_answers: { question: string; answer: string; evaluation: string }[]
  communication_score: number | null
  expertise_score: number | null
  attitude_score: number | null
  overall_score: number | null
  strengths: string[]
  concerns: string[]
  overall_impression: string | null
  status: string
  error_message: string | null
  analyzed_at: string | null
}

interface InterviewGroup {
  schedule: ScheduleRow | null
  recording: RecordingRow | null
  analysis: AnalysisRow | null
  type: 'video' | 'face_to_face'
}

export default function InterviewAnalysis({ candidateId, candidateName }: InterviewAnalysisProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [groups, setGroups] = useState<InterviewGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchData()
  }, [candidateId])

  async function fetchData() {
    const [schedRes, recRes, anaRes] = await Promise.all([
      supabase
        .from('interview_schedules')
        .select('id, interview_type, scheduled_at, duration_minutes, status, meeting_link')
        .eq('candidate_id', candidateId)
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('interview_recordings')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: true }),
      supabase
        .from('interview_analyses')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: true }),
    ])

    const schedules = (schedRes.data || []) as ScheduleRow[]
    const recordings = (recRes.data || []) as RecordingRow[]
    const analyses = (anaRes.data || []) as AnalysisRow[]

    // 스케줄 기준으로 그룹화
    const grouped: InterviewGroup[] = schedules.map((s) => ({
      schedule: s,
      recording: recordings.find((r) =>
        s.interview_type === 'video'
          ? r.recording_type === 'video'
          : r.recording_type === 'audio',
      ) || null,
      analysis: analyses.find((a) => a.schedule_id === s.id) || null,
      type: s.interview_type as 'video' | 'face_to_face',
    }))

    // 스케줄 없는 녹화/분석도 포함
    recordings.forEach((r) => {
      if (!grouped.some((g) => g.recording?.id === r.id)) {
        grouped.push({
          schedule: null,
          recording: r,
          analysis: analyses.find((a) => a.recording_id === r.id) || null,
          type: r.recording_type === 'video' ? 'video' : 'face_to_face',
        })
      }
    })

    setGroups(grouped)
    setLoading(false)
  }

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 20 * 1024 * 1024) {
      toast('파일 크기가 20MB를 초과합니다.', 'error')
      return
    }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'mp3'
      const filePath = `${candidateId}/${Date.now()}_face_to_face.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('interview-recordings')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('interview-recordings')
        .getPublicUrl(filePath)

      const { error: insertError } = await supabase
        .from('interview_recordings')
        .insert({
          candidate_id: candidateId,
          recording_url: urlData.publicUrl,
          recording_type: 'audio',
          file_size_bytes: file.size,
          status: 'uploaded',
        })

      if (insertError) throw insertError

      toast('녹음파일이 업로드되었습니다.', 'success')
      fetchData()
    } catch (err: any) {
      toast('업로드 실패: ' + err.message, 'error')
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleAnalyze(group: InterviewGroup) {
    const recording = group.recording
    if (!recording?.recording_url) {
      toast('분석할 녹음/녹화 파일이 없습니다.', 'error')
      return
    }

    const groupKey = group.schedule?.id || recording.id
    setAnalyzingId(groupKey)

    try {
      // AI 설정 가져오기
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .single()

      if (!aiSettings) {
        toast('AI 설정이 필요합니다. (설정 > AI 설정)', 'error')
        setAnalyzingId(null)
        return
      }

      // Supabase Storage signed URL 생성
      const storagePath = recording.recording_url.split('/interview-recordings/').pop()
      if (!storagePath) throw new Error('녹음 파일 경로 오류')

      const { data: signedData, error: signedError } = await supabase.storage
        .from('interview-recordings')
        .createSignedUrl(decodeURIComponent(storagePath), 3600) // 1시간

      if (signedError || !signedData?.signedUrl) {
        throw new Error('파일 접근 URL 생성 실패')
      }

      // interview_analyses 레코드 생성 (상태: transcribing)
      const { data: analysisRecord, error: createErr } = await supabase
        .from('interview_analyses')
        .insert({
          candidate_id: candidateId,
          schedule_id: group.schedule?.id || null,
          recording_id: recording.id,
          interview_type: group.type,
          status: 'transcribing',
          ai_provider: aiSettings.provider,
          ai_model: aiSettings.model,
        })
        .select()
        .single()

      if (createErr) throw createErr

      // /api/transcribe 호출
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordingUrl: signedData.signedUrl,
          apiKey: aiSettings.api_key,
          model: aiSettings.model,
          candidateName,
          interviewType: group.type,
        }),
      })

      const result = await res.json()

      if (!res.ok || !result.success) {
        // 에러 상태 업데이트
        await supabase
          .from('interview_analyses')
          .update({ status: 'error', error_message: result.error })
          .eq('id', analysisRecord.id)
        throw new Error(result.error || '분석 실패')
      }

      const a = result.analysis

      // 분석 결과 저장
      await supabase
        .from('interview_analyses')
        .update({
          transcription: a.transcription,
          ai_summary: a.overall_impression,
          key_answers: a.key_answers || [],
          communication_score: a.communication_score,
          expertise_score: a.expertise_score,
          attitude_score: a.attitude_score,
          overall_score: a.overall_score,
          strengths: a.strengths || [],
          concerns: a.concerns || [],
          overall_impression: a.overall_impression,
          status: 'completed',
          analyzed_at: new Date().toISOString(),
        })
        .eq('id', analysisRecord.id)

      toast('면접 내용 분석이 완료되었습니다.', 'success')
      fetchData()
    } catch (err: any) {
      toast('분석 오류: ' + err.message, 'error')
    }
    setAnalyzingId(null)
  }

  function toggleTranscript(id: string) {
    setExpandedTranscripts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto" />
        </CardContent>
      </Card>
    )
  }

  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> 면접 분석
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">등록된 면접 일정이 없습니다.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" /> 면접 분석
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group, idx) => {
          const key = group.schedule?.id || group.recording?.id || `group-${idx}`
          const isAnalyzing = analyzingId === key
          const analysis = group.analysis
          const hasRecording = !!group.recording
          const isTranscriptExpanded = expandedTranscripts.has(key)

          return (
            <div key={key} className="border rounded-lg overflow-hidden">
              {/* 헤더 */}
              <div className="flex items-center justify-between p-3 bg-gray-50">
                <div className="flex items-center gap-2">
                  {group.type === 'video' ? (
                    <Video className="h-4 w-4 text-blue-500" />
                  ) : (
                    <Mic className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="font-medium text-sm">
                    {group.type === 'video' ? '화상면접' : '대면면접'}
                  </span>
                  {group.schedule && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(group.schedule.scheduled_at)}
                      ({group.schedule.duration_minutes}분)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {group.schedule?.status && (
                    <Badge
                      variant="default"
                      className={
                        group.schedule.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : group.schedule.status === 'scheduled'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }
                    >
                      {group.schedule.status === 'completed' ? '면접 완료' :
                       group.schedule.status === 'scheduled' ? '예정' :
                       group.schedule.status === 'no_show' ? '불참' : '취소'}
                    </Badge>
                  )}
                  {analysis?.status === 'completed' && (
                    <Badge variant="default" className="bg-brand-100 text-brand-700">
                      분석 완료
                    </Badge>
                  )}
                </div>
              </div>

              <div className="p-3 space-y-3">
                {/* 녹음/녹화 상태 & 업로드 */}
                {group.type === 'video' && hasRecording && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Video className="h-3.5 w-3.5" />
                    <span>녹화 파일 있음</span>
                    {group.recording?.file_size_bytes && (
                      <span className="text-xs text-gray-400">
                        ({Math.round(group.recording.file_size_bytes / 1024 / 1024 * 10) / 10}MB)
                      </span>
                    )}
                  </div>
                )}

                {group.type === 'face_to_face' && !hasRecording && (
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                      className="hidden"
                      onChange={(e) => handleAudioUpload(e)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 업로드 중...</>
                      ) : (
                        <><Upload className="h-3.5 w-3.5 mr-1" /> 녹음파일 업로드</>
                      )}
                    </Button>
                    <span className="text-xs text-gray-400">MP3, WAV, M4A 등 (최대 20MB)</span>
                  </div>
                )}

                {group.type === 'face_to_face' && hasRecording && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mic className="h-3.5 w-3.5" />
                    <span>녹음 파일 있음</span>
                    {group.recording?.file_size_bytes && (
                      <span className="text-xs text-gray-400">
                        ({Math.round(group.recording.file_size_bytes / 1024 / 1024 * 10) / 10}MB)
                      </span>
                    )}
                  </div>
                )}

                {/* 내용 분석 버튼 */}
                {hasRecording && !analysis && (
                  <Button
                    size="sm"
                    onClick={() => handleAnalyze(group)}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 분석 중... (1~3분 소요)</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-1" /> 내용 분석</>
                    )}
                  </Button>
                )}

                {analysis?.status === 'error' && (
                  <div className="p-2 bg-red-50 rounded text-sm text-red-600">
                    분석 오류: {analysis.error_message || '알 수 없는 오류'}
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2"
                      onClick={() => handleAnalyze(group)}
                      disabled={isAnalyzing}
                    >
                      재시도
                    </Button>
                  </div>
                )}

                {/* 분석 결과 */}
                {analysis?.status === 'completed' && (
                  <div className="space-y-3">
                    {/* 점수 */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: '종합', score: analysis.overall_score, color: 'brand' },
                        { label: '의사소통', score: analysis.communication_score, color: 'blue' },
                        { label: '전문성', score: analysis.expertise_score, color: 'green' },
                        { label: '태도', score: analysis.attitude_score, color: 'amber' },
                      ].map((item) => (
                        <div key={item.label} className={`text-center p-2 bg-${item.color}-50 rounded-lg`}>
                          <p className={`text-[10px] text-${item.color}-600`}>{item.label}</p>
                          <p className={`text-lg font-bold text-${item.color}-700`}>{item.score ?? '-'}</p>
                        </div>
                      ))}
                    </div>

                    {/* 전체 인상 */}
                    {analysis.overall_impression && (
                      <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                        {analysis.overall_impression}
                      </p>
                    )}

                    {/* 강점/우려사항 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-green-600 mb-1">강점</p>
                        <ul className="space-y-0.5">
                          {(analysis.strengths || []).map((s, i) => (
                            <li key={i} className="text-xs text-gray-700 flex items-start gap-1">
                              <span className="text-green-500 mt-0.5 shrink-0">+</span> {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-red-600 mb-1">우려사항</p>
                        <ul className="space-y-0.5">
                          {(analysis.concerns || []).map((c, i) => (
                            <li key={i} className="text-xs text-gray-700 flex items-start gap-1">
                              <span className="text-red-500 mt-0.5 shrink-0">-</span> {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* 주요 Q&A */}
                    {analysis.key_answers && analysis.key_answers.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1.5">주요 질문 & 답변</p>
                        <div className="space-y-2">
                          {analysis.key_answers.map((qa, i) => (
                            <div key={i} className="p-2 bg-gray-50 rounded-lg text-xs">
                              <p className="font-medium text-gray-800">Q. {qa.question}</p>
                              <p className="text-gray-600 mt-0.5">A. {qa.answer}</p>
                              {qa.evaluation && (
                                <p className="text-brand-600 mt-0.5 italic">{qa.evaluation}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 전사 텍스트 (접기/펼치기) */}
                    {analysis.transcription && (
                      <div>
                        <button
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                          onClick={() => toggleTranscript(key)}
                        >
                          {isTranscriptExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                          전사 텍스트 {isTranscriptExpanded ? '접기' : '펼치기'}
                        </button>
                        {isTranscriptExpanded && (
                          <div className="mt-1 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 max-h-60 overflow-y-auto whitespace-pre-wrap">
                            {analysis.transcription}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
