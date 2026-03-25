/**
 * 면접 분석 컴포넌트
 *
 * 흐름:
 *   1. 관리자가 녹화(화상)/녹음(대면) 파일 업로드
 *   2. AI 전사 + 분석 (Gemini API)
 *   3. 관리자 분석 결과 확인
 *   4. "확인 완료" 클릭 → 원본 파일 Storage에서 삭제 (용량 절약)
 *   5. 분석 텍스트만 DB에 영구 보관
 */
import { useState, useEffect, useRef } from 'react'
import {
  Video, Mic, Upload, Loader2, Sparkles, ChevronDown, ChevronUp,
  Clock, MessageSquare, CheckCircle, Trash2, AlertTriangle, FileVideo, FileAudio,
  Cloud, Download,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { getAIConfigForFeature } from '@/lib/ai-client'
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
  google_event_id: string | null
}

interface DriveFile {
  id: string
  name: string
  size: string
  mimeType: string
  createdTime: string
}

interface RecordingRow {
  id: string
  candidate_id: string
  recording_url: string
  recording_type: 'video' | 'audio'
  duration_seconds: number | null
  file_size_bytes: number | null
  status: string
  schedule_id?: string | null
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
  confirmed_at?: string | null
  file_deleted?: boolean
}

interface InterviewGroup {
  schedule: ScheduleRow | null
  recording: RecordingRow | null
  analysis: AnalysisRow | null
  type: 'video' | 'face_to_face'
}

export default function InterviewAnalysis({ candidateId, candidateName }: InterviewAnalysisProps) {
  const { toast } = useToast()
  const videoInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  const [groups, setGroups] = useState<InterviewGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null) // schedule id or 'new'
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set())
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [confirmingGroup, setConfirmingGroup] = useState<InterviewGroup | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [driveFetching, setDriveFetching] = useState<string | null>(null)
  const [driveFiles, setDriveFiles] = useState<Record<string, DriveFile[]>>({})
  const [driveDownloading, setDriveDownloading] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [candidateId])

  async function fetchData() {
    const [schedRes, recRes, anaRes] = await Promise.all([
      supabase
        .from('interview_schedules')
        .select('id, interview_type, scheduled_at, duration_minutes, status, meeting_link, google_event_id')
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
      recording:
        recordings.find((r) => (r as any).schedule_id === s.id) ||
        recordings.find((r) =>
          s.interview_type === 'video'
            ? r.recording_type === 'video'
            : r.recording_type === 'audio',
        ) ||
        null,
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

  /* ─── Google Drive에서 녹화 파일 가져오기 ────────── */

  async function handleSearchDrive(group: InterviewGroup) {
    const key = group.schedule?.id || 'new'
    setDriveFetching(key)

    try {
      const params = new URLSearchParams()
      params.set('meetingTitle', `[인터오리진 면접] ${candidateName}`)

      const res = await fetch(`/api/drive-recordings?${params}`)
      const result = await res.json()

      if (res.ok && result.files?.length > 0) {
        setDriveFiles((prev) => ({ ...prev, [key]: result.files }))
        toast(`${result.files.length}개의 녹화 파일을 찾았습니다.`, 'success')
      } else if (res.ok && result.files?.length === 0) {
        toast('Google Drive에서 녹화 파일을 찾을 수 없습니다. 회의 종료 후 2~5분 뒤에 다시 시도하세요.', 'error')
      } else {
        toast(`Drive 검색 실패: ${result.error || '알 수 없는 오류'}`, 'error')
      }
    } catch (err: any) {
      toast('Drive 검색 오류: ' + err.message, 'error')
    }
    setDriveFetching(null)
  }

  async function handleFetchFromDrive(
    group: InterviewGroup,
    driveFile: DriveFile,
  ) {
    const key = group.schedule?.id || 'new'
    setDriveDownloading(key)

    try {
      // 1. Drive에서 파일 다운로드 (프록시 경유)
      const res = await fetch('/api/drive-recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveFileId: driveFile.id }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '다운로드 실패' }))
        throw new Error(err.error || '다운로드 실패')
      }

      const blob = await res.blob()
      const ext = driveFile.name.split('.').pop() || 'mp4'
      const filePath = `${candidateId}/${Date.now()}_video.${ext}`

      // 2. Supabase Storage에 업로드
      const { error: uploadError } = await supabase.storage
        .from('interview-recordings')
        .upload(filePath, blob)

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('interview-recordings')
        .getPublicUrl(filePath)

      // 3. interview_recordings 레코드 생성
      const { error: insertError } = await supabase.from('interview_recordings').insert({
        candidate_id: candidateId,
        recording_url: urlData.publicUrl,
        recording_type: 'video',
        file_size_bytes: parseInt(driveFile.size) || blob.size,
        status: 'uploaded',
        ...(group.schedule?.id ? { schedule_id: group.schedule.id } : {}),
      })

      if (insertError) throw insertError

      // 검색 결과 초기화
      setDriveFiles((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })

      toast('Google Drive 녹화 파일을 성공적으로 가져왔습니다.', 'success')
      fetchData()
    } catch (err: any) {
      toast('파일 가져오기 실패: ' + err.message, 'error')
    }
    setDriveDownloading(null)
  }

  /* ─── 파일 업로드 (화상/대면 공통) ─────────────── */

  async function handleFileUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'video' | 'face_to_face',
    scheduleId?: string,
  ) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 100 * 1024 * 1024) {
      toast('파일 크기가 100MB를 초과합니다.', 'error')
      return
    }

    const uploadKey = scheduleId || 'new'
    setUploading(uploadKey)

    try {
      const ext = file.name.split('.').pop() || (type === 'video' ? 'webm' : 'mp3')
      const recordingType = type === 'video' ? 'video' : 'audio'
      const filePath = `${candidateId}/${Date.now()}_${type}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('interview-recordings')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('interview-recordings')
        .getPublicUrl(filePath)

      const { error: insertError } = await supabase.from('interview_recordings').insert({
        candidate_id: candidateId,
        recording_url: urlData.publicUrl,
        recording_type: recordingType,
        file_size_bytes: file.size,
        status: 'uploaded',
        ...(scheduleId ? { schedule_id: scheduleId } : {}),
      })

      if (insertError) throw insertError

      toast(
        type === 'video' ? '면접 녹화 파일이 업로드되었습니다.' : '면접 녹음 파일이 업로드되었습니다.',
        'success',
      )
      fetchData()
    } catch (err: any) {
      toast('업로드 실패: ' + err.message, 'error')
    }
    setUploading(null)

    // input 초기화
    if (type === 'video' && videoInputRef.current) videoInputRef.current.value = ''
    if (type !== 'video' && audioInputRef.current) audioInputRef.current.value = ''
  }

  /* ─── AI 분석 ─────────────────────────────────── */

  async function handleAnalyze(group: InterviewGroup) {
    const recording = group.recording
    if (!recording?.recording_url) {
      toast('분석할 파일이 없습니다.', 'error')
      return
    }

    const groupKey = group.schedule?.id || recording.id
    setAnalyzingId(groupKey)

    try {
      const aiConfig = await getAIConfigForFeature('interview_transcription')

      if (!aiConfig) {
        toast('AI 설정이 필요합니다. (설정 > AI 설정)', 'error')
        setAnalyzingId(null)
        return
      }

      // Signed URL 생성
      const storagePath = recording.recording_url.split('/interview-recordings/').pop()
      if (!storagePath) throw new Error('파일 경로 오류')

      const { data: signedData, error: signedError } = await supabase.storage
        .from('interview-recordings')
        .createSignedUrl(decodeURIComponent(storagePath), 3600)

      if (signedError || !signedData?.signedUrl) {
        throw new Error('파일 접근 URL 생성 실패')
      }

      // 분석 레코드 생성
      const { data: analysisRecord, error: createErr } = await supabase
        .from('interview_analyses')
        .insert({
          candidate_id: candidateId,
          schedule_id: group.schedule?.id || null,
          recording_id: recording.id,
          interview_type: group.type,
          status: 'transcribing',
          ai_provider: aiConfig.provider,
          ai_model: aiConfig.model,
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
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          candidateName,
          interviewType: group.type,
        }),
      })

      const result = await res.json()

      if (!res.ok || !result.success) {
        await supabase
          .from('interview_analyses')
          .update({ status: 'error', error_message: result.error })
          .eq('id', analysisRecord.id)
        throw new Error(result.error || '분석 실패')
      }

      const a = result.analysis

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

  /* ─── 확인 완료 → 원본 파일 삭제 ───────────────── */

  function openConfirmDialog(group: InterviewGroup) {
    setConfirmingGroup(group)
    setConfirmDialogOpen(true)
  }

  async function handleConfirmAndDelete() {
    if (!confirmingGroup) return
    setConfirming(true)

    try {
      const recording = confirmingGroup.recording
      const analysis = confirmingGroup.analysis

      if (!analysis) throw new Error('분석 데이터 없음')

      // 1. 분석 확인 완료 표시
      await supabase
        .from('interview_analyses')
        .update({
          confirmed_at: new Date().toISOString(),
          file_deleted: true,
        })
        .eq('id', analysis.id)

      // 2. Storage에서 원본 파일 삭제
      if (recording?.recording_url) {
        const storagePath = recording.recording_url.split('/interview-recordings/').pop()
        if (storagePath) {
          await supabase.storage
            .from('interview-recordings')
            .remove([decodeURIComponent(storagePath)])
        }
      }

      // 3. recording 레코드 상태 업데이트 (파일 삭제됨)
      if (recording) {
        await supabase
          .from('interview_recordings')
          .update({ status: 'deleted', recording_url: null })
          .eq('id', recording.id)
      }

      toast('분석 결과가 확인되었습니다. 원본 파일이 삭제되어 용량이 절약됩니다.', 'success')
      setConfirmDialogOpen(false)
      setConfirmingGroup(null)
      fetchData()
    } catch (err: any) {
      toast('처리 실패: ' + err.message, 'error')
    }
    setConfirming(false)
  }

  /* ─── UI 헬퍼 ─────────────────────────────────── */

  function toggleTranscript(id: string) {
    setExpandedTranscripts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function getStepStatus(group: InterviewGroup) {
    const { recording, analysis } = group
    if (analysis?.confirmed_at) return 'confirmed'
    if (analysis?.status === 'completed') return 'analyzed'
    if (analysis?.status === 'transcribing' || analysis?.status === 'analyzing') return 'analyzing'
    if (analysis?.status === 'error') return 'error'
    if (recording && recording.status !== 'deleted') return 'uploaded'
    return 'empty'
  }

  /* ─── 렌더링 ──────────────────────────────────── */

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
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> 면접 분석
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 숨겨진 file input들 */}
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*,.webm,.mp4,.avi,.mov"
            className="hidden"
          />
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
            className="hidden"
          />

          {groups.map((group, idx) => {
            const key = group.schedule?.id || group.recording?.id || `group-${idx}`
            const isAnalyzing = analyzingId === key
            const analysis = group.analysis
            const step = getStepStatus(group)
            const isTranscriptExpanded = expandedTranscripts.has(key)
            const isVideo = group.type === 'video'
            const isUploading = uploading === (group.schedule?.id || 'new')

            return (
              <div key={key} className="border rounded-lg overflow-hidden">
                {/* ── 헤더 ──────────────────────── */}
                <div className="flex items-center justify-between p-3 bg-gray-50">
                  <div className="flex items-center gap-2">
                    {isVideo ? (
                      <Video className="h-4 w-4 text-blue-500" />
                    ) : (
                      <Mic className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="font-medium text-sm">
                      {isVideo ? '화상면접' : '대면면접'}
                    </span>
                    {group.schedule && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(group.schedule.scheduled_at)}
                        ({group.schedule.duration_minutes}분)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
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
                        {group.schedule.status === 'completed'
                          ? '면접 완료'
                          : group.schedule.status === 'scheduled'
                            ? '예정'
                            : group.schedule.status === 'no_show'
                              ? '불참'
                              : '취소'}
                      </Badge>
                    )}
                    {step === 'confirmed' && (
                      <Badge variant="default" className="bg-green-100 text-green-700">
                        <CheckCircle className="h-3 w-3 mr-0.5" /> 확인 완료
                      </Badge>
                    )}
                    {step === 'analyzed' && (
                      <Badge variant="default" className="bg-brand-100 text-brand-700">
                        분석 완료
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="p-3 space-y-3">
                  {/* ── 진행 단계 표시 ────────── */}
                  <div className="flex items-center gap-0 text-[10px]">
                    {[
                      { label: '파일 업로드', done: step !== 'empty' },
                      { label: 'AI 분석', done: step === 'analyzed' || step === 'confirmed' },
                      { label: '확인 완료', done: step === 'confirmed' },
                      { label: '파일 삭제', done: step === 'confirmed' },
                    ].map((s, i) => (
                      <div key={i} className="flex items-center">
                        <div
                          className={`flex items-center gap-0.5 px-2 py-1 rounded-full ${
                            s.done
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {s.done && <CheckCircle className="h-2.5 w-2.5" />}
                          {s.label}
                        </div>
                        {i < 3 && (
                          <div className={`w-3 h-px ${s.done ? 'bg-green-300' : 'bg-gray-200'}`} />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* ── Step 1: 파일 업로드 ────── */}
                  {step === 'empty' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 p-3 border-2 border-dashed border-gray-200 rounded-lg hover:border-brand-300 transition-colors">
                        {isVideo ? (
                          <FileVideo className="h-8 w-8 text-blue-300" />
                        ) : (
                          <FileAudio className="h-8 w-8 text-amber-300" />
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-700">
                            {isVideo
                              ? 'Google Meet 녹화 파일을 업로드하세요'
                              : '대면면접 녹음 파일을 업로드하세요'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {isVideo
                              ? 'MP4, WebM, AVI, MOV (최대 100MB)'
                              : 'MP3, WAV, M4A, OGG, WebM (최대 100MB)'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {isVideo && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSearchDrive(group)}
                              disabled={!!driveFetching || !!driveDownloading}
                              className="text-blue-600 border-blue-300 hover:bg-blue-50"
                            >
                              {driveFetching === key ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 검색 중...
                                </>
                              ) : (
                                <>
                                  <Cloud className="h-3.5 w-3.5 mr-1" /> Drive에서 가져오기
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const ref = isVideo ? videoInputRef : audioInputRef
                              if (ref.current) {
                                ref.current.onchange = (ev: any) =>
                                  handleFileUpload(ev, group.type, group.schedule?.id)
                                ref.current.click()
                              }
                            }}
                            disabled={!!uploading}
                          >
                            {isUploading ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 업로드 중...
                              </>
                            ) : (
                              <>
                                <Upload className="h-3.5 w-3.5 mr-1" /> 파일 업로드
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Google Drive 검색 결과 */}
                      {driveFiles[key]?.length > 0 && (
                        <div className="p-3 bg-blue-50 rounded-lg space-y-2">
                          <p className="text-xs font-medium text-blue-700">
                            Google Drive 녹화 파일 ({driveFiles[key].length}개)
                          </p>
                          <p className="text-[10px] text-blue-500">
                            녹화 파일은 회의 종료 후 2~5분 뒤에 Google Drive에 저장됩니다.
                          </p>
                          {driveFiles[key].map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center justify-between p-2 bg-white rounded border border-blue-100"
                            >
                              <div className="flex items-center gap-2 text-sm min-w-0">
                                <FileVideo className="h-4 w-4 text-blue-500 shrink-0" />
                                <span className="truncate">{file.name}</span>
                                <span className="text-xs text-gray-400 shrink-0">
                                  ({Math.round(parseInt(file.size) / 1024 / 1024)}MB)
                                </span>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleFetchFromDrive(group, file)}
                                disabled={!!driveDownloading}
                              >
                                {driveDownloading === key ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 가져오는 중...
                                  </>
                                ) : (
                                  <>
                                    <Download className="h-3.5 w-3.5 mr-1" /> 가져오기
                                  </>
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 업로드된 파일 정보 */}
                  {step === 'uploaded' && group.recording && (
                    <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        {isVideo ? (
                          <FileVideo className="h-4 w-4 text-blue-500" />
                        ) : (
                          <FileAudio className="h-4 w-4 text-amber-500" />
                        )}
                        <span>{isVideo ? '녹화' : '녹음'} 파일 업로드됨</span>
                        {group.recording.file_size_bytes && (
                          <span className="text-xs text-gray-400">
                            ({Math.round((group.recording.file_size_bytes / 1024 / 1024) * 10) / 10}
                            MB)
                          </span>
                        )}
                      </div>
                      <Badge variant="default" className="bg-amber-100 text-amber-700 text-[10px]">
                        분석 대기
                      </Badge>
                    </div>
                  )}

                  {/* 확인 완료 후 파일 삭제됨 표시 */}
                  {step === 'confirmed' && (
                    <div className="flex items-center gap-2 p-2.5 bg-green-50 rounded-lg text-sm text-green-700">
                      <Trash2 className="h-4 w-4 text-green-500" />
                      <span>원본 파일이 삭제되었습니다. 분석 텍스트만 보관됩니다.</span>
                    </div>
                  )}

                  {/* ── Step 2: AI 분석 버튼 ──── */}
                  {step === 'uploaded' && (
                    <Button size="sm" onClick={() => handleAnalyze(group)} disabled={isAnalyzing}>
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" /> AI 분석 중... (1~3분
                          소요)
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-1" /> AI 내용 분석
                        </>
                      )}
                    </Button>
                  )}

                  {step === 'error' && analysis && (
                    <div className="flex items-center gap-2 p-2.5 bg-red-50 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="text-sm text-red-600 flex-1">
                        분석 오류: {analysis.error_message || '알 수 없는 오류'}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAnalyze(group)}
                        disabled={isAnalyzing}
                      >
                        재시도
                      </Button>
                    </div>
                  )}

                  {/* ── Step 3: 분석 결과 ─────── */}
                  {(step === 'analyzed' || step === 'confirmed') && analysis?.status === 'completed' && (
                    <div className="space-y-3">
                      {/* 점수 */}
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: '종합', score: analysis.overall_score, bg: 'bg-brand-50', text: 'text-brand' },
                          { label: '의사소통', score: analysis.communication_score, bg: 'bg-blue-50', text: 'text-blue' },
                          { label: '전문성', score: analysis.expertise_score, bg: 'bg-green-50', text: 'text-green' },
                          { label: '태도', score: analysis.attitude_score, bg: 'bg-amber-50', text: 'text-amber' },
                        ].map((item) => (
                          <div key={item.label} className={`text-center p-2 ${item.bg} rounded-lg`}>
                            <p className={`text-[10px] ${item.text}-600`}>{item.label}</p>
                            <p className={`text-lg font-bold ${item.text}-700`}>
                              {item.score ?? '-'}
                            </p>
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
                              <li
                                key={i}
                                className="text-xs text-gray-700 flex items-start gap-1"
                              >
                                <span className="text-green-500 mt-0.5 shrink-0">+</span> {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-red-600 mb-1">우려사항</p>
                          <ul className="space-y-0.5">
                            {(analysis.concerns || []).map((c, i) => (
                              <li
                                key={i}
                                className="text-xs text-gray-700 flex items-start gap-1"
                              >
                                <span className="text-red-500 mt-0.5 shrink-0">-</span> {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* 주요 Q&A */}
                      {analysis.key_answers && analysis.key_answers.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-1.5">
                            주요 질문 & 답변
                          </p>
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

                      {/* Step 3: 확인 완료 버튼 (분석 완료 + 아직 미확인) */}
                      {step === 'analyzed' && (
                        <div className="pt-2 border-t border-gray-100">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-500">
                              분석 내용을 확인 후 &quot;확인 완료&quot;를 누르면 원본 파일이
                              삭제됩니다.
                            </p>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => openConfirmDialog(group)}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" /> 확인 완료
                            </Button>
                          </div>
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

      {/* ── 확인 완료 확인 다이얼로그 ───────────────── */}
      <Dialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        title="분석 결과 확인 완료"
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">원본 파일이 삭제됩니다</p>
              <p className="text-xs">
                확인 완료 시 Storage의 원본 녹화/녹음 파일이 영구 삭제되며,
                AI 분석 결과(텍스트)만 보관됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              취소
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleConfirmAndDelete}
              disabled={confirming}
            >
              {confirming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> 처리 중...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-1" /> 확인 완료 및 파일 삭제
                </>
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
