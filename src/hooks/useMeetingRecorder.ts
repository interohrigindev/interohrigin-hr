import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { transcribeAudio, summarizeMeeting, DEEPGRAM_COST_PER_MIN } from '@/lib/ai-client'
import { useAuth } from '@/hooks/useAuth'

export type MeetingStatus = 'idle' | 'recording' | 'uploading' | 'transcribing' | 'summarizing' | 'completed' | 'error'

export interface MeetingResult {
  id: string
  transcription: string
  summary: string
  actionItems: string[]
  decisions: string[]
}

export function useMeetingRecorder() {
  const { profile } = useAuth()
  const [status, setStatus] = useState<MeetingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<MeetingResult | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // ─── Deepgram 키 가져오기 (STT 용) ──────────────────────
  async function getDeepgramKey(): Promise<string | null> {
    const { data } = await supabase
      .from('ai_settings')
      .select('api_key')
      .eq('provider', 'deepgram')
      .limit(1)
      .single()
    return data?.api_key || null
  }

  // ─── Gemini 키 가져오기 (요약용) ─────────────────────────
  async function getGeminiKey(): Promise<string | null> {
    const { data } = await supabase
      .from('ai_settings')
      .select('api_key')
      .eq('provider', 'gemini')
      .limit(1)
      .single()
    return data?.api_key || null
  }

  // ─── 녹음 시작 ──────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      setError(null)
      setResult(null)
      chunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
        audioBitsPerSecond: 128000, // 128kbps — Deepgram 2GB 제한 (약 30시간+)
      })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.start(1000)
      setStatus('recording')
      setElapsed(0)

      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      setError('마이크 접근 권한이 필요합니다.')
      setStatus('error')
    }
  }, [])

  // ─── 녹음 중지 + 처리 파이프라인 ────────────────────────
  const stopRecording = useCallback(async (
    title: string,
    participantIds: string[],
    departmentId?: string,
    projectId?: string,
  ) => {
    if (!mediaRecorderRef.current || !profile?.id) return

    // 녹음 중지
    mediaRecorderRef.current.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (timerRef.current) clearInterval(timerRef.current)

    // 약간 대기 (마지막 chunk 수집)
    await new Promise((r) => setTimeout(r, 500))

    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
    const fileSizeBytes = audioBlob.size
    const durationSeconds = elapsed

    // 1. DB 레코드 생성
    setStatus('uploading')
    const { data: meeting, error: dbErr } = await supabase
      .from('meeting_records')
      .insert({
        title,
        recorded_by: profile.id,
        participant_ids: participantIds,
        department_id: departmentId || null,
        project_id: projectId || null,
        duration_seconds: durationSeconds,
        file_size_bytes: fileSizeBytes,
        status: 'uploaded',
      })
      .select()
      .single()

    if (dbErr || !meeting) {
      setError('회의 저장 실패: ' + (dbErr?.message || ''))
      setStatus('error')
      return
    }

    // 2. 스토리지 업로드
    const filePath = `${profile.id}/${meeting.id}.webm`
    const { error: uploadErr } = await supabase.storage
      .from('meeting-recordings')
      .upload(filePath, audioBlob, { contentType: 'audio/webm' })

    if (uploadErr) {
      setError('파일 업로드 실패: ' + uploadErr.message)
      await supabase.from('meeting_records').update({ status: 'error', error_message: uploadErr.message }).eq('id', meeting.id)
      setStatus('error')
      return
    }

    const { data: urlData } = supabase.storage.from('meeting-recordings').getPublicUrl(filePath)
    await supabase.from('meeting_records').update({ recording_url: urlData.publicUrl }).eq('id', meeting.id)

    // 3. Deepgram STT (화자분리 포함)
    setStatus('transcribing')
    await supabase.from('meeting_records').update({ status: 'transcribing' }).eq('id', meeting.id)

    const deepgramKey = await getDeepgramKey()
    if (!deepgramKey) {
      setError('Deepgram API 키가 필요합니다. 관리자 설정에서 등록하세요.')
      await supabase.from('meeting_records').update({ status: 'error', error_message: 'Deepgram API 키 없음' }).eq('id', meeting.id)
      setStatus('error')
      return
    }

    let transcription: string
    let segments: { start: number; end: number; text: string; speaker?: number }[]
    let sttDuration: number
    try {
      const sttResult = await transcribeAudio(deepgramKey, audioBlob, 'ko')
      transcription = sttResult.text
      segments = sttResult.segments
      sttDuration = sttResult.durationSeconds
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'STT 실패'
      setError('음성 변환 실패: ' + msg)
      await supabase.from('meeting_records').update({ status: 'error', error_message: msg }).eq('id', meeting.id)
      setStatus('error')
      return
    }

    await supabase.from('meeting_records').update({
      transcription,
      transcription_segments: segments,
      duration_seconds: sttDuration || durationSeconds,
      stt_cost: Math.round((( sttDuration || durationSeconds) / 60) * DEEPGRAM_COST_PER_MIN * 10000) / 10000,
      status: 'summarizing',
    }).eq('id', meeting.id)

    // 4. AI 요약
    setStatus('summarizing')
    const geminiKey = await getGeminiKey()
    if (!geminiKey) {
      // STT까지는 성공, 요약만 스킵
      await supabase.from('meeting_records').update({ status: 'completed' }).eq('id', meeting.id)
      setResult({ id: meeting.id, transcription, summary: '', actionItems: [], decisions: [] })
      setStatus('completed')
      return
    }

    try {
      const { summary, actionItems, decisions } = await summarizeMeeting(geminiKey, title, transcription)

      await supabase.from('meeting_records').update({
        summary,
        action_items: actionItems,
        decisions,
        status: 'completed',
      }).eq('id', meeting.id)

      setResult({ id: meeting.id, transcription, summary, actionItems, decisions })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '요약 실패'
      await supabase.from('meeting_records').update({ status: 'completed', error_message: '요약 실패: ' + msg }).eq('id', meeting.id)
      setResult({ id: meeting.id, transcription, summary: '', actionItems: [], decisions: [] })
    }

    setStatus('completed')
  }, [elapsed, profile?.id])

  // ─── 참석자에게 회의록 발송 ──────────────────────────────
  async function sendToParticipants(meetingId: string): Promise<{ error: string | null }> {
    if (!profile?.id) return { error: '로그인 필요' }

    const { data: meeting } = await supabase
      .from('meeting_records')
      .select('*')
      .eq('id', meetingId)
      .single()

    if (!meeting) return { error: '회의 정보 없음' }
    if (!meeting.summary) return { error: '회의록이 없습니다' }

    // agent_conversations에 회의록 아카이브
    const { data: conv } = await supabase
      .from('agent_conversations')
      .insert({
        user_id: profile.id,
        title: `회의록: ${meeting.title}`,
        summary: meeting.summary.slice(0, 200),
        context_type: meeting.project_id ? 'project' : 'general',
        project_id: meeting.project_id,
        department_id: meeting.department_id,
        is_archived: true,
        tags: ['회의록', meeting.title],
      })
      .select()
      .single()

    if (conv) {
      await supabase.from('agent_messages').insert([
        { conversation_id: conv.id, role: 'user', content: `"${meeting.title}" 회의 녹음 (${Math.floor(meeting.duration_seconds / 60)}분)` },
        { conversation_id: conv.id, role: 'assistant', content: meeting.summary },
      ])
    }

    // 발송 완료 표시
    await supabase.from('meeting_records').update({
      is_sent: true,
      sent_at: new Date().toISOString(),
    }).eq('id', meetingId)

    return { error: null }
  }

  // ─── 타이머 포맷 ────────────────────────────────────────
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return {
    status,
    error,
    elapsed,
    formatTime,
    result,
    startRecording,
    stopRecording,
    sendToParticipants,
  }
}
