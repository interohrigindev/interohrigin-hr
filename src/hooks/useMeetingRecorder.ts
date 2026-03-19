import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { transcribeAudio } from '@/lib/ai-client'
import { generateAIChat } from '@/lib/ai-client'
import type { AIConfig } from '@/lib/ai-client'
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

  // ─── OpenAI 키 가져오기 (Whisper 용) ────────────────────
  async function getOpenAIKey(): Promise<string | null> {
    const { data } = await supabase
      .from('ai_settings')
      .select('api_key')
      .eq('provider', 'openai')
      .limit(1)
      .single()
    return data?.api_key || null
  }

  // ─── 활성 AI 설정 (요약용) ──────────────────────────────
  async function getAIConfig(): Promise<AIConfig | null> {
    const { data } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single()
    if (!data) return null
    return { provider: data.provider, apiKey: data.api_key, model: data.model }
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

    // 3. Whisper STT
    setStatus('transcribing')
    await supabase.from('meeting_records').update({ status: 'transcribing' }).eq('id', meeting.id)

    const openaiKey = await getOpenAIKey()
    if (!openaiKey) {
      setError('OpenAI API 키가 필요합니다. 관리자 설정에서 등록하세요.')
      await supabase.from('meeting_records').update({ status: 'error', error_message: 'OpenAI API 키 없음' }).eq('id', meeting.id)
      setStatus('error')
      return
    }

    let transcription: string
    let segments: { start: number; end: number; text: string }[]
    try {
      const sttResult = await transcribeAudio(openaiKey, audioBlob, 'ko')
      transcription = sttResult.text
      segments = sttResult.segments
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
      status: 'summarizing',
    }).eq('id', meeting.id)

    // 4. AI 요약
    setStatus('summarizing')
    const aiConfig = await getAIConfig()
    if (!aiConfig) {
      // STT까지는 성공, 요약만 스킵
      await supabase.from('meeting_records').update({ status: 'completed' }).eq('id', meeting.id)
      setResult({ id: meeting.id, transcription, summary: '', actionItems: [], decisions: [] })
      setStatus('completed')
      return
    }

    try {
      const summaryPrompt = `다음은 "${title}" 회의의 녹취록입니다. 아래 형식으로 회의록을 정리해주세요.

## 회의 요약
(3-5문장)

## 주요 결정사항
- 항목1
- 항목2

## 액션 아이템
- [ ] 담당자: 내용 (기한)
- [ ] 담당자: 내용 (기한)

## 주요 논의 내용
(핵심 논의를 구조화)

---
녹취록:
${transcription}`

      const resp = await generateAIChat(aiConfig, '당신은 전문 회의록 작성자입니다. 한국어로 작성하세요.', [
        { role: 'user', content: summaryPrompt },
      ])

      // 액션아이템/결정사항 추출
      const actionItems = (resp.content.match(/- \[[ x]\] .+/g) || []).map((s) => s.replace(/^- \[[ x]\] /, ''))
      const decisions = (resp.content.match(/^- (?!\[).+/gm) || []).slice(0, 10).map((s) => s.replace(/^- /, ''))

      await supabase.from('meeting_records').update({
        summary: resp.content,
        action_items: actionItems,
        decisions,
        status: 'completed',
      }).eq('id', meeting.id)

      setResult({
        id: meeting.id,
        transcription,
        summary: resp.content,
        actionItems,
        decisions,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '요약 실패'
      // STT는 성공했으므로 completed 처리
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
