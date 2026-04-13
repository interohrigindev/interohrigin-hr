import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Mic, Download, Clock, Users, ChevronDown, ChevronUp, Loader2, Trash2,
  FileText, AlertTriangle, CheckCircle, ListChecks, MessageSquare, Upload, RefreshCw,
  Share2, UserPlus, X, Square, Video, Search,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { transcribeAudio, summarizeMeeting, DEEPGRAM_COST_PER_MIN } from '@/lib/ai-client'
import { generateMeetingPdf } from '@/lib/pdf-meeting'
import { useAuth } from '@/hooks/useAuth'

interface MeetingRecord {
  id: string
  title: string
  recorded_by: string
  participant_ids: string[] | null
  department_id: string | null
  project_id: string | null
  recording_url: string | null
  duration_seconds: number | null
  file_size_bytes: number | null
  transcription: string | null
  transcription_segments: any | null
  summary: string | null
  action_items: any | null
  decisions: any | null
  status: string
  error_message: string | null
  is_sent: boolean
  sent_at: string | null
  created_at: string
}

interface Employee { id: string; name: string }

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  recording: { label: '녹음 중', color: 'bg-red-100 text-red-700' },
  uploaded: { label: '업로드됨', color: 'bg-blue-100 text-blue-700' },
  transcribing: { label: '전사 중', color: 'bg-amber-100 text-amber-700' },
  summarizing: { label: '요약 중', color: 'bg-purple-100 text-purple-700' },
  completed: { label: '완료', color: 'bg-green-100 text-green-700' },
  error: { label: '오류', color: 'bg-red-100 text-red-700' },
}

const RETENTION_DAYS = 14

function getDaysRemaining(createdAt: string): number {
  const created = new Date(createdAt)
  const expiry = new Date(created.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000)
  return Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
}

function formatSummaryAsDocument(summary: string): string {
  if (!summary) return ''
  let html = summary
    // 마크다운 헤더 → HTML
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-bold text-gray-800 mt-4 mb-1 flex items-center gap-1"><span class="w-1 h-4 bg-brand-500 rounded-full inline-block mr-1"></span>$1</h4>')
    .replace(/^## \d+\. (.+)$/gm, '<h3 class="text-base font-bold text-gray-900 mt-6 mb-2 pb-1 border-b border-gray-200">$1</h3>')
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-200">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold text-gray-900 mt-4 mb-2">$1</h2>')
    // 볼드/이탤릭
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-900">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 체크박스 아이템
    .replace(/^- \[ \] (.+)$/gm, '<li class="flex items-start gap-2 text-sm text-gray-700 py-0.5"><span class="text-gray-400 mt-0.5 shrink-0">☐</span><span>$1</span></li>')
    .replace(/^- \[x\] (.+)$/gm, '<li class="flex items-start gap-2 text-sm text-gray-700 py-0.5"><span class="text-green-500 mt-0.5 shrink-0">☑</span><span>$1</span></li>')
    // 결정사항 (✅)
    .replace(/^- ✅ (.+)$/gm, '<li class="flex items-start gap-2 text-sm text-green-700 py-0.5 bg-green-50 rounded px-2"><span class="shrink-0">✅</span><span>$1</span></li>')
    // 협의필요 (⚠️)
    .replace(/^- ⚠️ (.+)$/gm, '<li class="flex items-start gap-2 text-sm text-amber-700 py-0.5 bg-amber-50 rounded px-2"><span class="shrink-0">⚠️</span><span>$1</span></li>')
    // 제안/의견 (💡)
    .replace(/^- 💡 (.+)$/gm, '<li class="flex items-start gap-2 text-sm text-blue-700 py-0.5 bg-blue-50 rounded px-2"><span class="shrink-0">💡</span><span>$1</span></li>')
    // 일반 리스트
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-2 text-sm text-gray-700 py-0.5"><span class="text-brand-500 mt-1 shrink-0">•</span><span>$1</span></li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="flex items-start gap-2 text-sm text-gray-700 py-0.5"><span class="text-brand-600 font-semibold mt-0 shrink-0 w-5 text-right">▸</span><span>$1</span></li>')
    // 줄바꿈
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br>')
  return `<div class="space-y-1">${html}</div>`
}

function downloadAsTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function MeetingNotes() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const [records, setRecords] = useState<MeetingRecord[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null })
  const [deleting, setDeleting] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  // 업로드 설정 다이얼로그
  const [uploadDialog, setUploadDialog] = useState<{ open: boolean; file: File | null }>({ open: false, file: null })
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadDate, setUploadDate] = useState('')
  const [uploadTime, setUploadTime] = useState('')
  const [uploadParticipants, setUploadParticipants] = useState<string[]>([])
  const [uploadSearch, setUploadSearch] = useState('')
  // Google Meet 가져오기
  const [meetImportOpen, setMeetImportOpen] = useState(false)
  const [meetSearchQuery, setMeetSearchQuery] = useState('')
  const [meetSearching, setMeetSearching] = useState(false)
  const [meetFiles, setMeetFiles] = useState<{ id: string; name: string; size: string; mimeType: string; createdTime: string }[]>([])
  const [meetImporting, setMeetImporting] = useState(false)

  const [shareDialog, setShareDialog] = useState<{ open: boolean; record: MeetingRecord | null }>({ open: false, record: null })
  const [shareSearch, setShareSearch] = useState('')
  const [selectedShareIds, setSelectedShareIds] = useState<string[]>([])
  const [sharing, setSharing] = useState(false)

  // ─── 내부 녹음 상태 ─────────────────────────────────────────
  const CHUNK_DURATION_MS = 30 * 60 * 1000 // 30분
  const [isRecording, setIsRecording] = useState(false)
  const [recordingElapsed, setRecordingElapsed] = useState(0) // 초
  const [recordingChunks, setRecordingChunks] = useState<{ part: number; blob: Blob; duration: number }[]>([])
  const [recordingTitle, setRecordingTitle] = useState('')
  const [recordingParticipants, setRecordingParticipants] = useState<string[]>([])
  const [showRecordSetup, setShowRecordSetup] = useState(false)
  const [recordingProcessing, setRecordingProcessing] = useState(false)
  const [recordingSearch, setRecordingSearch] = useState('')
  const [sttProgress, setSttProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunkDataRef = useRef<Blob[]>([])
  const chunkStartRef = useRef(0)
  const chunkPartRef = useRef(1)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 백그라운드 STT 결과 저장
  const sttResultsRef = useRef<Map<number, { text: string; segments: any[]; durationSeconds: number }>>(new Map())

  // 청크 완성 시 백그라운드 STT 실행
  const runBackgroundStt = useCallback(async (partNum: number, blob: Blob) => {
    try {
      const { data: cfg } = await supabase
        .from('ai_settings').select('api_key').eq('provider', 'deepgram').limit(1).single()
      if (!cfg?.api_key) return
      const result = await transcribeAudio(cfg.api_key, blob, 'ko')
      sttResultsRef.current.set(partNum, result)
      setSttProgress((prev) => ({ ...prev, done: prev.done + 1 }))
    } catch {
      // STT 실패해도 녹음은 계속 — 나중에 재처리
    }
  }, [])

  // 녹음 시작
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      chunkPartRef.current = 1
      sttResultsRef.current = new Map()
      setRecordingChunks([])
      setRecordingElapsed(0)
      setSttProgress({ done: 0, total: 0 })

      const startChunk = () => {
        chunkDataRef.current = []
        chunkStartRef.current = Date.now()
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
        mediaRecorderRef.current = recorder

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunkDataRef.current.push(e.data)
        }

        recorder.onstop = () => {
          const blob = new Blob(chunkDataRef.current, { type: 'audio/webm' })
          const duration = Math.round((Date.now() - chunkStartRef.current) / 1000)
          if (blob.size > 0 && duration > 1) {
            const partNum = chunkPartRef.current
            setRecordingChunks((prev) => [...prev, { part: partNum, blob, duration }])
            // 즉시 백그라운드 STT 시작
            setSttProgress((prev) => ({ ...prev, total: prev.total + 1 }))
            runBackgroundStt(partNum, blob)
            chunkPartRef.current++
          }
        }

        recorder.start(1000) // 1초마다 ondataavailable

        // 30분 후 자동 분할
        chunkTimerRef.current = setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop()
            // 다음 청크 바로 시작 (끊김 최소화)
            setTimeout(() => {
              if (mediaStreamRef.current && mediaStreamRef.current.active) {
                startChunk()
              }
            }, 50)
          }
        }, CHUNK_DURATION_MS)
      }

      startChunk()
      setIsRecording(true)

      // 경과 시간 타이머
      const startTime = Date.now()
      elapsedTimerRef.current = setInterval(() => {
        setRecordingElapsed(Math.floor((Date.now() - startTime) / 1000))
      }, 1000)

      toast('녹음이 시작되었습니다.', 'success')
    } catch {
      toast('마이크 접근 권한이 필요합니다.', 'error')
    }
  }, [toast, runBackgroundStt])

  // 녹음 중지
  const stopRecording = useCallback(() => {
    if (chunkTimerRef.current) { clearTimeout(chunkTimerRef.current); chunkTimerRef.current = null }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    setIsRecording(false)
  }, [])

  // 녹음 완료 후 업로드 + 분석 처리 (백그라운드 STT 결과 활용)
  const processRecordingChunks = useCallback(async () => {
    if (!profile?.id || recordingChunks.length === 0) return
    setRecordingProcessing(true)
    const title = recordingTitle.trim() || `내부 녹음 ${new Date().toLocaleDateString('ko-KR')}`
    const now = new Date().toISOString()
    let meetingId: string | null = null

    try {
      // 1. DB 레코드 생성
      const totalSize = recordingChunks.reduce((s, c) => s + c.blob.size, 0)
      const totalDuration = recordingChunks.reduce((s, c) => s + c.duration, 0)
      const { data: meeting, error: dbErr } = await supabase
        .from('meeting_records')
        .insert({
          title,
          recorded_by: profile.id,
          participant_ids: recordingParticipants,
          file_size_bytes: totalSize,
          duration_seconds: totalDuration,
          status: 'transcribing',
          created_at: now,
        })
        .select().single()
      if (dbErr || !meeting) throw new Error('회의 생성 실패: ' + (dbErr?.message || ''))
      meetingId = meeting.id

      // 2. Deepgram API 키 확보
      const { data: deepgramCfg } = await supabase
        .from('ai_settings').select('api_key').eq('provider', 'deepgram').limit(1).single()
      const deepgramKey = deepgramCfg?.api_key
      if (!deepgramKey) throw new Error('Deepgram API 키가 없습니다.')

      const allTranscripts: string[] = []
      const allSegments: any[] = []
      let totalSttDuration = 0
      let firstUploadUrl = ''

      for (let i = 0; i < recordingChunks.length; i++) {
        const chunk = recordingChunks[i]
        const suffix = recordingChunks.length > 1 ? `_part${chunk.part}` : ''
        const filePath = `${profile.id}/${meeting.id}${suffix}.webm`

        // Storage 업로드
        await supabase.storage
          .from('meeting-recordings')
          .upload(filePath, chunk.blob, { contentType: 'audio/webm' })
        if (i === 0) {
          const { data: urlData } = supabase.storage.from('meeting-recordings').getPublicUrl(filePath)
          firstUploadUrl = urlData.publicUrl
        }

        // 백그라운드 STT 결과가 이미 있으면 재사용, 없으면 지금 실행
        let sttResult = sttResultsRef.current.get(chunk.part)
        if (!sttResult) {
          sttResult = await transcribeAudio(deepgramKey, chunk.blob, 'ko')
        }

        const timeOffset = i > 0 ? recordingChunks.slice(0, i).reduce((s, c) => s + c.duration, 0) : 0
        allTranscripts.push(sttResult.text)
        allSegments.push(...sttResult.segments.map((seg: any) => ({
          ...seg,
          start: seg.start + timeOffset,
          end: seg.end + timeOffset,
        })))
        totalSttDuration += sttResult.durationSeconds
      }

      const fullText = allTranscripts.join('\n\n--- 파트 구분 ---\n\n')

      // STT 결과 저장
      await supabase.from('meeting_records').update({
        recording_url: firstUploadUrl,
        transcription: fullText,
        transcription_segments: allSegments,
        duration_seconds: totalSttDuration || totalDuration,
        stt_cost: Math.round((totalSttDuration / 60) * DEEPGRAM_COST_PER_MIN * 10000) / 10000,
        status: 'summarizing',
      }).eq('id', meeting.id)

      // 3. AI 요약 (전체 텍스트)
      const { data: geminiCfg } = await supabase
        .from('ai_settings').select('api_key').eq('provider', 'gemini').limit(1).single()
      const geminiKey = geminiCfg?.api_key

      let summary = ''
      let actionItems: string[] = []
      let decisions: string[] = []
      if (geminiKey && fullText) {
        const result = await summarizeMeeting(geminiKey, title, fullText)
        summary = result.summary
        actionItems = result.actionItems
        decisions = result.decisions
      }

      await supabase.from('meeting_records').update({
        summary, action_items: actionItems, decisions,
        status: 'completed', error_message: null,
      }).eq('id', meeting.id)

      toast('녹음 업로드 + 분석 완료!', 'success')
      setRecordingChunks([])
      setRecordingTitle('')
      setRecordingParticipants([])
      setSttProgress({ done: 0, total: 0 })
      sttResultsRef.current = new Map()
      setShowRecordSetup(false)
      fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '처리 실패'
      toast(msg, 'error')
      if (meetingId) {
        await supabase.from('meeting_records').update({ status: 'error', error_message: msg }).eq('id', meetingId)
      }
      fetchData()
    } finally {
      setRecordingProcessing(false)
    }
  }, [profile, recordingChunks, recordingTitle, recordingParticipants, toast])

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current)
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [recRes, empRes] = await Promise.all([
      supabase.from('meeting_records').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name').eq('is_active', true),
    ])
    const recs = (recRes.data || []) as MeetingRecord[]
    setRecords(recs)
    setEmployees((empRes.data || []) as Employee[])

    const urls: Record<string, string> = {}
    for (const r of recs) {
      if (r.recording_url && r.status !== 'error') {
        const path = r.recording_url.split('/meeting-recordings/').pop()
        if (path) {
          const { data } = await supabase.storage.from('meeting-recordings').createSignedUrl(decodeURIComponent(path), 3600)
          if (data?.signedUrl) urls[r.id] = data.signedUrl
        }
      }
    }
    setSignedUrls(urls)
    setLoading(false)
  }

  const getEmpName = (id: string) => employees.find((e) => e.id === id)?.name || '알 수 없음'

  function formatDuration(seconds: number | null) {
    if (!seconds) return '-'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}분 ${s}초`
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleRetry(recordId: string) {
    const record = records.find((r) => r.id === recordId)
    if (!record?.recording_url) {
      toast('녹음 파일이 없습니다.', 'error')
      return
    }

    setRetryingId(recordId)
    try {
      // 1. Storage에서 녹음 파일 다운로드
      await supabase.from('meeting_records').update({ status: 'transcribing', error_message: null }).eq('id', recordId)

      const path = record.recording_url.split('/meeting-recordings/').pop()
      if (!path) throw new Error('녹음 파일 경로를 찾을 수 없습니다.')

      const { data: signedData } = await supabase.storage.from('meeting-recordings').createSignedUrl(decodeURIComponent(path), 3600)
      if (!signedData?.signedUrl) throw new Error('녹음 파일 URL 생성 실패')

      const fileRes = await fetch(signedData.signedUrl)
      if (!fileRes.ok) throw new Error('녹음 파일 다운로드 실패')
      const rawBlob = await fileRes.blob()
      // Storage 응답의 MIME이 비어있을 수 있으므로 확장자로 보정
      const ext = path.split('.').pop()?.toLowerCase() || 'webm'
      const mimeMap: Record<string, string> = { webm: 'audio/webm', m4a: 'audio/mp4', mp3: 'audio/mpeg', mp4: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac' }
      const audioBlob = new Blob([rawBlob], { type: mimeMap[ext] || rawBlob.type || 'audio/webm' })

      // 2. Deepgram STT (화자분리 포함)
      const { data: deepgramCfg } = await supabase
        .from('ai_settings').select('api_key').eq('provider', 'deepgram').limit(1).single()
      const deepgramKey = deepgramCfg?.api_key
      if (!deepgramKey) throw new Error('Deepgram API 키가 없습니다. 관리자 설정에서 등록하세요.')

      const sttResult = await transcribeAudio(deepgramKey, audioBlob, 'ko')

      // STT 완료 즉시 저장 (요약 실패해도 전사 텍스트 보존)
      await supabase.from('meeting_records').update({
        transcription: sttResult.text,
        transcription_segments: sttResult.segments,
        duration_seconds: sttResult.durationSeconds || undefined,
        stt_cost: Math.round((sttResult.durationSeconds / 60) * DEEPGRAM_COST_PER_MIN * 10000) / 10000,
        status: 'summarizing',
      }).eq('id', recordId)

      // 3. AI 요약
      const { data: geminiCfg } = await supabase
        .from('ai_settings').select('api_key').eq('provider', 'gemini').limit(1).single()
      const geminiKey = geminiCfg?.api_key

      let summary = ''
      let actionItems: string[] = []
      let decisions: string[] = []
      if (geminiKey && sttResult.text) {
        const result = await summarizeMeeting(geminiKey, record.title || '회의', sttResult.text)
        summary = result.summary
        actionItems = result.actionItems
        decisions = result.decisions
      }

      // 4. 완료
      await supabase.from('meeting_records').update({
        summary,
        action_items: actionItems,
        decisions,
        status: 'completed',
        error_message: null,
      }).eq('id', recordId)

      toast('재분석 완료', 'success')
      fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '재분석 실패'
      toast(msg, 'error')
      await supabase.from('meeting_records').update({ status: 'error', error_message: msg }).eq('id', recordId)
      fetchData()
    } finally {
      setRetryingId(null)
    }
  }

  // 파일 선택 → 업로드 설정 다이얼로그 열기
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const now = new Date()
    setUploadTitle(file.name.replace(/\.[^.]+$/, '') || '외부 녹음 파일')
    setUploadDate(now.toISOString().slice(0, 10))
    setUploadTime(now.toTimeString().slice(0, 5))
    setUploadParticipants([])
    setUploadSearch('')
    setUploadDialog({ open: true, file })
  }

  // 다이얼로그에서 확인 → 실제 업로드 실행
  async function handleFileUpload() {
    const file = uploadDialog.file
    if (!file || !profile?.id) return

    setUploadDialog({ open: false, file: null })
    setUploading(true)
    let meetingId: string | null = null
    try {
      // 1. DB 레코드 생성
      const title = uploadTitle.trim() || file.name.replace(/\.[^.]+$/, '') || '외부 녹음 파일'
      const meetingDate = uploadDate && uploadTime
        ? `${uploadDate}T${uploadTime}:00`
        : new Date().toISOString()

      const { data: meeting, error: dbErr } = await supabase
        .from('meeting_records')
        .insert({
          title,
          recorded_by: profile.id,
          participant_ids: uploadParticipants,
          file_size_bytes: file.size,
          status: 'uploaded',
          created_at: meetingDate,
        })
        .select().single()
      if (dbErr || !meeting) throw new Error('회의 생성 실패: ' + (dbErr?.message || ''))
      meetingId = meeting.id

      // 2. Storage 업로드
      const ext = file.name.split('.').pop() || 'webm'
      const filePath = `${profile.id}/${meeting.id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('meeting-recordings').upload(filePath, file, { contentType: file.type || 'audio/webm' })
      if (upErr) throw new Error('업로드 실패: ' + upErr.message)

      const { data: urlData } = supabase.storage.from('meeting-recordings').getPublicUrl(filePath)
      await supabase.from('meeting_records').update({
        recording_url: urlData.publicUrl,
        status: 'transcribing',
      }).eq('id', meeting.id)

      // 3. Deepgram STT (화자분리 포함)
      const { data: deepgramCfg2 } = await supabase
        .from('ai_settings').select('api_key').eq('provider', 'deepgram').limit(1).single()
      const deepgramKey2 = deepgramCfg2?.api_key
      if (!deepgramKey2) throw new Error('Deepgram API 키가 없습니다. 관리자 설정에서 등록하세요.')

      const audioBlob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/webm' })
      const sttResult = await transcribeAudio(deepgramKey2, audioBlob, 'ko')

      const durationSeconds = sttResult.durationSeconds

      // STT 완료 즉시 저장 (요약 실패해도 전사 텍스트 보존)
      await supabase.from('meeting_records').update({
        transcription: sttResult.text,
        transcription_segments: sttResult.segments,
        duration_seconds: durationSeconds,
        stt_cost: Math.round((durationSeconds / 60) * DEEPGRAM_COST_PER_MIN * 10000) / 10000,
        status: 'summarizing',
      }).eq('id', meeting.id)

      // 4. AI 요약
      const { data: geminiCfg2 } = await supabase
        .from('ai_settings').select('api_key').eq('provider', 'gemini').limit(1).single()
      const geminiKey = geminiCfg2?.api_key

      let summary = ''
      let actionItems: string[] = []
      let decisions: string[] = []
      if (geminiKey && sttResult.text) {
        const result = await summarizeMeeting(geminiKey, title, sttResult.text)
        summary = result.summary
        actionItems = result.actionItems
        decisions = result.decisions
      }

      // 5. 완료
      await supabase.from('meeting_records').update({
        summary,
        action_items: actionItems,
        decisions,
        status: 'completed',
        error_message: null,
      }).eq('id', meeting.id)

      toast('파일 업로드 + 분석 완료', 'success')
      fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '업로드 실패'
      toast(msg, 'error')
      if (meetingId) {
        await supabase.from('meeting_records').update({ status: 'error', error_message: msg }).eq('id', meetingId)
      }
      fetchData()
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    const record = records.find((r) => r.id === id)
    if (record?.recording_url) {
      const path = record.recording_url.split('/meeting-recordings/').pop()
      if (path) await supabase.storage.from('meeting-recordings').remove([decodeURIComponent(path)])
    }
    const { error } = await supabase.from('meeting_records').delete().eq('id', id)
    if (error) toast('삭제 실패: ' + error.message, 'error')
    else { toast('회의록이 삭제되었습니다.', 'success'); setRecords((prev) => prev.filter((r) => r.id !== id)) }
    setDeleting(false)
    setDeleteDialog({ open: false, id: null })
  }

  function buildTranscriptText(r: MeetingRecord): string {
    const lines: string[] = []
    lines.push(`회의록: ${r.title || '제목 없음'}`)
    lines.push(`일시: ${new Date(r.created_at).toLocaleString('ko-KR')}`)
    lines.push(`녹음 시간: ${formatDuration(r.duration_seconds)}`)
    lines.push(`참석자: ${r.participant_ids?.map((id) => getEmpName(id)).join(', ') || '없음'}`)
    lines.push(`녹음자: ${getEmpName(r.recorded_by)}`)
    lines.push('')
    if (r.summary) { lines.push('=== AI 요약 ==='); lines.push(r.summary); lines.push('') }
    if (r.action_items && Array.isArray(r.action_items) && r.action_items.length > 0) {
      lines.push('=== 액션 아이템 ===')
      r.action_items.forEach((item: any, i: number) => lines.push(`${i + 1}. ${typeof item === 'string' ? item : item.task || JSON.stringify(item)}`))
      lines.push('')
    }
    if (r.decisions && Array.isArray(r.decisions) && r.decisions.length > 0) {
      lines.push('=== 결정 사항 ===')
      r.decisions.forEach((d: any, i: number) => lines.push(`${i + 1}. ${typeof d === 'string' ? d : d.decision || JSON.stringify(d)}`))
      lines.push('')
    }
    if (r.transcription) { lines.push('=== 전사 텍스트 ==='); lines.push(r.transcription) }
    return lines.join('\n')
  }

  // ─── Google Meet 가져오기 ────────────────────────────────────
  async function handleMeetSearch() {
    setMeetSearching(true)
    setMeetFiles([])
    try {
      const params = new URLSearchParams()
      if (meetSearchQuery.trim()) params.set('meetingTitle', meetSearchQuery.trim())
      const res = await fetch(`/api/drive-recordings?${params}`)
      const result = await res.json()
      if (res.ok && result.files?.length > 0) {
        // Google Docs(회의록/스크립트)만 필터링 + 영상도 포함
        setMeetFiles(result.files)
        toast(`${result.files.length}개 파일을 찾았습니다.`, 'success')
      } else {
        toast('Google Drive에서 파일을 찾을 수 없습니다.', 'error')
      }
    } catch {
      toast('Drive 검색 오류', 'error')
    }
    setMeetSearching(false)
  }

  async function handleMeetImport(file: { id: string; name: string; mimeType: string }) {
    if (!profile?.id || meetImporting) return
    setMeetImporting(true)
    setMeetImportOpen(false) // 즉시 다이얼로그 닫아서 중복 클릭 방지
    try {
      // 1. Drive에서 파일 가져오기
      const res = await fetch('/api/drive-recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveFileId: file.id }),
      })

      const contentType = res.headers.get('content-type') || ''
      let transcriptText = ''

      if (contentType.includes('application/json')) {
        const result = await res.json()
        if (result.type === 'document' && result.text) {
          transcriptText = result.text
        } else if (!res.ok) {
          throw new Error(result.error || '가져오기 실패')
        }
      }

      if (!transcriptText) {
        throw new Error('텍스트를 추출할 수 없는 파일입니다. Google Docs(회의록) 파일을 선택하세요.')
      }

      // 2. DB 레코드 생성
      const title = file.name
        .replace(/- Gemini가 작성한 회의록$/i, '')
        .replace(/- Recording$/i, '')
        .replace(/\s*-\s*\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}\s+UTC\s*/g, ' ')
        .trim() || 'Google Meet 회의록'
      const now = new Date().toISOString()

      const { data: meeting, error: dbErr } = await supabase
        .from('meeting_records')
        .insert({
          title,
          recorded_by: profile.id,
          participant_ids: [],
          status: 'summarizing',
          created_at: now,
        })
        .select().single()
      if (dbErr || !meeting) throw new Error('회의 생성 실패: ' + (dbErr?.message || ''))

      // 3. 전사 텍스트 저장 (Deepgram 생략!)
      await supabase.from('meeting_records').update({
        transcription: transcriptText,
        status: 'summarizing',
      }).eq('id', meeting.id)

      // 4. Gemini 요약 (실패해도 전사 텍스트는 보존)
      try {
        const { data: geminiCfg } = await supabase
          .from('ai_settings').select('api_key').eq('provider', 'gemini').limit(1).single()
        const geminiKey = geminiCfg?.api_key

        if (geminiKey && transcriptText) {
          const result = await summarizeMeeting(geminiKey, title, transcriptText)
          await supabase.from('meeting_records').update({
            summary: result.summary,
            action_items: result.actionItems,
            decisions: result.decisions,
            status: 'completed',
            error_message: null,
          }).eq('id', meeting.id)
          toast('Google Meet 회의록 가져오기 + 요약 완료!', 'success')
        } else {
          await supabase.from('meeting_records').update({ status: 'completed' }).eq('id', meeting.id)
          toast('회의록 가져오기 완료 (AI 요약은 나중에 재시도하세요)', 'success')
        }
      } catch {
        // 요약 실패해도 전사 텍스트는 이미 저장됨
        await supabase.from('meeting_records').update({
          status: 'completed',
          error_message: 'AI 요약 실패 — 전사 텍스트는 저장됨. 재분석으로 요약 가능.',
        }).eq('id', meeting.id)
        toast('회의록 텍스트 저장 완료. AI 요약은 잠시 후 재분석하세요.', 'success')
      }
      setMeetImportOpen(false)
      setMeetFiles([])
      setMeetSearchQuery('')
      fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '가져오기 실패'
      toast(msg, 'error')
    }
    setMeetImporting(false)
  }

  // ─── 회의록 공유 ─────────────────────────────────────────
  function openShareDialog(record: MeetingRecord) {
    setShareDialog({ open: true, record })
    setSelectedShareIds(record.participant_ids || [])
    setShareSearch('')
  }

  async function handleShare() {
    if (!shareDialog.record) return
    setSharing(true)
    const { error } = await supabase
      .from('meeting_records')
      .update({ participant_ids: selectedShareIds })
      .eq('id', shareDialog.record.id)

    if (error) {
      toast('공유 실패: ' + error.message, 'error')
    } else {
      toast('회의록이 공유되었습니다.', 'success')
      fetchData()
    }
    setSharing(false)
    setShareDialog({ open: false, record: null })
  }

  if (loading) return <PageSpinner />

  const completedCount = records.filter((r) => r.status === 'completed').length
  // 내부 녹음: recorded_by가 현재 사용자이고 participant_ids가 빈 배열이 아닌 것 (앱에서 녹음)
  // 외부 녹음: recording_url에 확장자가 webm이 아닌 것 또는 title이 파일명 패턴
  const isExternalRecord = (r: MeetingRecord) => {
    const url = r.recording_url || ''
    const ext = url.split('.').pop()?.toLowerCase() || ''
    return ext !== 'webm' && ext !== ''
  }
  const internalRecords = records.filter((r) => !isExternalRecord(r))
  const externalRecords = records.filter((r) => isExternalRecord(r))
  const internalDuration = internalRecords.reduce((sum, r) => sum + (r.duration_seconds || 0), 0)
  const externalDuration = externalRecords.reduce((sum, r) => sum + (r.duration_seconds || 0), 0)
  const totalDuration = internalDuration + externalDuration

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">회의록</h1>
          <p className="text-sm text-gray-500 mt-1">AI 어시스턴트에서 녹음한 회의 기록을 관리합니다.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={uploadInputRef}
            type="file"
            accept="audio/*,video/*,.m4a,.mp3,.wav,.ogg,.webm,.mp4"
            className="hidden"
            onChange={handleFileSelect}
          />
          {!isRecording ? (
            <Button
              size="sm"
              onClick={startRecording}
              disabled={uploading || recordingProcessing}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              <Mic className="h-3.5 w-3.5 mr-1" /> 녹음 시작
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => { stopRecording(); setShowRecordSetup(true) }}
              className="bg-gray-800 hover:bg-gray-900 text-white animate-pulse"
            >
              <Square className="h-3.5 w-3.5 mr-1" /> 녹음 중지
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => uploadInputRef.current?.click()}
            disabled={uploading || isRecording}
          >
            {uploading ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 분석 중...</>
            ) : (
              <><Upload className="h-3.5 w-3.5 mr-1" /> 파일 업로드</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMeetImportOpen(true)}
            disabled={uploading || isRecording || meetImporting}
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            {meetImporting ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 가져오는 중...</>
            ) : (
              <><Video className="h-3.5 w-3.5 mr-1" /> Meet 회의록</>
            )}
          </Button>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>총 {records.length}건</span>
            <span>완료 {completedCount}건</span>
            <span>총 {Math.round(totalDuration / 60)}분</span>
          </div>
        </div>
      </div>

      {/* 녹음 진행 상태 바 */}
      {isRecording && (
        <div className="flex items-center gap-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-sm font-bold text-red-700">녹음 중</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 text-sm text-red-600">
              <span className="font-mono font-bold text-lg">
                {String(Math.floor(recordingElapsed / 3600)).padStart(2, '0')}:
                {String(Math.floor((recordingElapsed % 3600) / 60)).padStart(2, '0')}:
                {String(recordingElapsed % 60).padStart(2, '0')}
              </span>
              <span className="text-xs text-red-500">
                파트 {Math.floor(recordingElapsed / (30 * 60)) + 1} 녹음 중
                {recordingChunks.length > 0 && ` · ${recordingChunks.length}개 파트 저장`}
                {sttProgress.total > 0 && (
                  <span className="ml-1 text-green-600">
                    · STT {sttProgress.done}/{sttProgress.total} 완료
                  </span>
                )}
              </span>
            </div>
            {/* 30분 구간 진행률 */}
            <div className="mt-1.5 h-1.5 bg-red-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all"
                style={{ width: `${((recordingElapsed % (30 * 60)) / (30 * 60)) * 100}%` }}
              />
            </div>
            <p className="text-[10px] text-red-400 mt-0.5">30분마다 자동 분할 저장</p>
          </div>
          <Button
            size="sm"
            onClick={() => { stopRecording(); setShowRecordSetup(true) }}
            className="bg-gray-800 hover:bg-gray-900 text-white shrink-0"
          >
            <Square className="h-3.5 w-3.5 mr-1" /> 녹음 종료
          </Button>
        </div>
      )}

      {/* 14일 보관 안내 */}
      <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <AlertTriangle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-medium">녹음 파일은 {RETENTION_DAYS}일간 보관 후 자동 삭제됩니다.</p>
          <p className="text-xs text-blue-600 mt-0.5">필요한 녹음은 다운로드하여 보관하세요. AI 요약/전사 텍스트는 영구 보관됩니다.</p>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card><CardContent className="py-3 px-4"><p className="text-[11px] text-gray-500">전체 회의록</p><p className="text-2xl font-bold text-gray-900">{records.length}</p></CardContent></Card>
        <Card><CardContent className="py-3 px-4"><p className="text-[11px] text-gray-500">완료</p><p className="text-2xl font-bold text-green-600">{completedCount}</p></CardContent></Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">총 녹음 시간</p>
            <p className="text-2xl font-bold text-blue-600">{Math.round(totalDuration / 60)}분</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-400">내부 {Math.round(internalDuration / 60)}분</span>
              <span className="text-[10px] text-gray-400">외부 {Math.round(externalDuration / 60)}분</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">예상 STT 비용</p>
            <p className="text-2xl font-bold text-amber-600">${(totalDuration / 60 * DEEPGRAM_COST_PER_MIN).toFixed(2)}</p>
            <p className="text-[10px] text-gray-400">Deepgram $0.0043/분</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">녹음 구분</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default" className="bg-blue-100 text-blue-700 text-[10px]">내부 {internalRecords.length}건</Badge>
              <Badge variant="default" className="bg-amber-100 text-amber-700 text-[10px]">외부 {externalRecords.length}건</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 회의록 목록 */}
      {records.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mic className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">녹음된 회의가 없습니다.</p>
            <p className="text-sm text-gray-400 mt-1">AI 어시스턴트 → 🎙 버튼으로 회의를 녹음하세요.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const isOpen = expanded.has(r.id)
            const status = STATUS_CONFIG[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-700' }
            const participants = r.participant_ids?.map((id) => getEmpName(id)).filter(Boolean) || []
            const daysLeft = getDaysRemaining(r.created_at)

            return (
              <Card key={r.id} className="overflow-hidden">
                {/* 헤더 */}
                <button
                  className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => toggleExpand(r.id)}
                >
                  <div className={`p-2 rounded-lg ${r.status === 'completed' ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <Mic className={`h-5 w-5 ${r.status === 'completed' ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">{r.title || '제목 없음'}</p>
                      <Badge variant="default" className={status.color + ' text-[10px]'}>{status.label}</Badge>
                      {r.is_sent && <Badge variant="default" className="bg-blue-50 text-blue-600 text-[10px]">발송됨</Badge>}
                      {daysLeft <= 3 && daysLeft > 0 && (
                        <Badge variant="default" className="bg-red-50 text-red-600 text-[10px]">{daysLeft}일 후 삭제</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span><Clock className="h-3 w-3 inline mr-0.5" />{formatDuration(r.duration_seconds)}</span>
                      <span><Users className="h-3 w-3 inline mr-0.5" />{participants.length}명</span>
                      <span>{new Date(r.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-gray-400">녹음: {getEmpName(r.recorded_by)}</span>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>

                {/* 상세 내용 */}
                {isOpen && (
                  <div className="border-t">
                    {/* 상단 메타 + 보관 안내 */}
                    <div className="px-4 pt-3 pb-2 bg-gray-50/50 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex flex-wrap gap-1">
                        {participants.map((name, i) => (
                          <Badge key={i} variant="default" className="bg-white text-gray-700 text-xs border">{name}</Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400">
                          {daysLeft > 0 ? `파일 보관: ${daysLeft}일 남음` : '보관 기간 만료'}
                        </span>
                        {/* 다운로드 버튼들 */}
                        {(r.summary || r.transcription) && (
                          <div className="flex items-center gap-1.5">
                            {r.summary && (
                              <button
                                onClick={() => generateMeetingPdf({
                                  title: r.title || '제목 없음',
                                  date: new Date(r.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }),
                                  duration: formatDuration(r.duration_seconds),
                                  recorder: getEmpName(r.recorded_by),
                                  participants: r.participant_ids?.map((id) => getEmpName(id)).filter(Boolean) || [],
                                  summary: r.summary,
                                  actionItems: Array.isArray(r.action_items) ? r.action_items.map((a: any) => typeof a === 'string' ? a : a.task || JSON.stringify(a)) : [],
                                  decisions: Array.isArray(r.decisions) ? r.decisions.map((d: any) => typeof d === 'string' ? d : d.decision || JSON.stringify(d)) : [],
                                  transcription: r.transcription,
                                })}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-brand-600 text-white rounded text-xs hover:bg-brand-700"
                              >
                                <Download className="h-3 w-3" /> PDF
                              </button>
                            )}
                            <button
                              onClick={() => downloadAsTextFile(`회의록_${r.title || r.id}.txt`, buildTranscriptText(r))}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-white border rounded text-xs text-gray-600 hover:bg-gray-50"
                            >
                              <FileText className="h-3 w-3" /> TXT
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-4 pb-4 space-y-4">
                      {/* 녹음 파일 재생 */}
                      {signedUrls[r.id] && (
                        <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                              <Mic className="h-3.5 w-3.5" /> 녹음 파일
                            </p>
                            <div className="flex items-center gap-2">
                              {r.file_size_bytes && (
                                <span className="text-[10px] text-gray-400">{(r.file_size_bytes / 1024 / 1024).toFixed(1)} MB</span>
                              )}
                              <a
                                href={signedUrls[r.id]}
                                download={`회의록_${r.title || r.id}.webm`}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-white border rounded text-xs text-gray-600 hover:bg-gray-100"
                              >
                                <Download className="h-3 w-3" /> 다운로드
                              </a>
                            </div>
                          </div>
                          <audio controls src={signedUrls[r.id]} className="w-full h-10" />
                        </div>
                      )}

                      {/* AI 요약 — 문서 서식 */}
                      {r.summary && (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-gradient-to-r from-brand-50 to-purple-50 px-4 py-2 flex items-center gap-2 border-b">
                            <MessageSquare className="h-4 w-4 text-brand-600" />
                            <p className="text-sm font-semibold text-brand-700">AI 회의 요약</p>
                          </div>
                          <div
                            className="px-4 py-3 text-sm text-gray-700 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: formatSummaryAsDocument(r.summary) }}
                          />
                        </div>
                      )}

                      {/* 액션 아이템 */}
                      {r.action_items && Array.isArray(r.action_items) && r.action_items.length > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-amber-50 px-4 py-2 flex items-center gap-2 border-b border-amber-100">
                            <ListChecks className="h-4 w-4 text-amber-600" />
                            <p className="text-sm font-semibold text-amber-700">액션 아이템 ({r.action_items.length}건)</p>
                          </div>
                          <div className="px-4 py-2 divide-y divide-gray-100">
                            {r.action_items.map((item: any, i: number) => (
                              <div key={i} className="flex items-start gap-3 py-2">
                                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                  {i + 1}
                                </span>
                                <p className="text-sm text-gray-700">{typeof item === 'string' ? item : item.task || JSON.stringify(item)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 결정 사항 */}
                      {r.decisions && Array.isArray(r.decisions) && r.decisions.length > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-green-50 px-4 py-2 flex items-center gap-2 border-b border-green-100">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <p className="text-sm font-semibold text-green-700">결정 사항 ({r.decisions.length}건)</p>
                          </div>
                          <div className="px-4 py-2 divide-y divide-gray-100">
                            {r.decisions.map((d: any, i: number) => (
                              <div key={i} className="flex items-start gap-3 py-2">
                                <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-gray-700">{typeof d === 'string' ? d : d.decision || JSON.stringify(d)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 전사 텍스트 */}
                      {r.transcription && (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b">
                            <p className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                              <FileText className="h-3.5 w-3.5" /> 전사 텍스트 (STT)
                            </p>
                            <button
                              onClick={() => downloadAsTextFile(`전사_${r.title || r.id}.txt`, r.transcription || '')}
                              className="text-[10px] text-brand-600 hover:underline"
                            >
                              TXT 다운로드
                            </button>
                          </div>
                          <div className="px-4 py-3 max-h-48 overflow-y-auto">
                            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{r.transcription}</p>
                          </div>
                        </div>
                      )}

                      {/* 에러 메시지 */}
                      {r.error_message && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          <p className="text-sm text-red-700">{r.error_message}</p>
                        </div>
                      )}

                      {/* 하단 버튼 */}
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-2">
                          {/* 재분석 */}
                          {(r.status === 'error' || r.status === 'completed') && r.recording_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRetry(r.id)}
                              disabled={retryingId === r.id}
                            >
                              {retryingId === r.id ? (
                                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 재분석 중...</>
                              ) : (
                                <><RefreshCw className="h-3.5 w-3.5 mr-1" /> 재분석</>
                              )}
                            </Button>
                          )}
                          {/* 공유 */}
                          {r.status === 'completed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openShareDialog(r)}
                            >
                              <Share2 className="h-3.5 w-3.5 mr-1" /> 공유
                            </Button>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteDialog({ open: true, id: r.id })}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> 삭제
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* 삭제 확인 */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, id: null })} title="회의록 삭제">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">이 회의록을 삭제하시겠습니까? 녹음 파일과 전사/요약 내용이 모두 삭제됩니다.</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: null })}>취소</Button>
            <Button variant="danger" onClick={() => deleteDialog.id && handleDelete(deleteDialog.id)} disabled={deleting}>
              {deleting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 삭제 중...</> : '삭제'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 공유 다이얼로그 */}
      <Dialog open={shareDialog.open} onClose={() => setShareDialog({ open: false, record: null })} title="회의록 공유">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            회의록을 공유할 직원을 선택하세요. 선택된 직원은 이 회의록을 조회할 수 있습니다.
          </p>

          {/* 검색 */}
          <div className="relative">
            <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
              placeholder="이름으로 검색..."
              value={shareSearch}
              onChange={(e) => setShareSearch(e.target.value)}
            />
          </div>

          {/* 선택된 직원 태그 */}
          {selectedShareIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedShareIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 text-brand-700 rounded-full text-xs"
                >
                  {getEmpName(id)}
                  <button
                    onClick={() => setSelectedShareIds((prev) => prev.filter((x) => x !== id))}
                    className="hover:text-brand-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 직원 목록 */}
          <div className="max-h-48 overflow-y-auto border rounded-lg divide-y divide-gray-100">
            {employees
              .filter((e) => {
                if (shareDialog.record && e.id === shareDialog.record.recorded_by) return false
                if (!shareSearch) return true
                return e.name.includes(shareSearch)
              })
              .map((e) => {
                const isSelected = selectedShareIds.includes(e.id)
                return (
                  <button
                    key={e.id}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${
                      isSelected ? 'bg-brand-50' : ''
                    }`}
                    onClick={() => {
                      setSelectedShareIds((prev) =>
                        isSelected ? prev.filter((x) => x !== e.id) : [...prev, e.id]
                      )
                    }}
                  >
                    <span className={isSelected ? 'text-brand-700 font-medium' : 'text-gray-700'}>{e.name}</span>
                    {isSelected && <CheckCircle className="h-4 w-4 text-brand-600" />}
                  </button>
                )
              })}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShareDialog({ open: false, record: null })}>취소</Button>
            <Button onClick={handleShare} disabled={sharing}>
              {sharing ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 공유 중...</>
              ) : (
                <><Share2 className="h-4 w-4 mr-1" /> {selectedShareIds.length}명에게 공유</>
              )}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 업로드 설정 다이얼로그 */}
      <Dialog open={uploadDialog.open} onClose={() => setUploadDialog({ open: false, file: null })} title="녹음 파일 업로드">
        <div className="space-y-4">
          {uploadDialog.file && (
            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <FileText className="h-4 w-4 text-gray-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">{uploadDialog.file.name}</p>
                <p className="text-[10px] text-gray-400">{(uploadDialog.file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            </div>
          )}

          <Input
            id="upload-title"
            label="회의명"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder="예: 1분기 경영 전략 회의"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">회의 날짜</label>
              <input
                type="date"
                value={uploadDate}
                onChange={(e) => setUploadDate(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시간</label>
              <input
                type="time"
                value={uploadTime}
                onChange={(e) => setUploadTime(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
              />
            </div>
          </div>

          {/* 참석자 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">참석자</label>
            <div className="relative mb-2">
              <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
                placeholder="이름으로 검색..."
                value={uploadSearch}
                onChange={(e) => setUploadSearch(e.target.value)}
              />
            </div>
            {uploadParticipants.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {uploadParticipants.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 text-brand-700 rounded-full text-xs">
                    {employees.find((e) => e.id === id)?.name || id}
                    <button onClick={() => setUploadParticipants((prev) => prev.filter((x) => x !== id))} className="hover:text-brand-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="max-h-36 overflow-y-auto border rounded-lg divide-y divide-gray-100">
              {employees
                .filter((e) => !uploadSearch || e.name.includes(uploadSearch))
                .map((e) => {
                  const isSelected = uploadParticipants.includes(e.id)
                  return (
                    <button
                      key={e.id}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${isSelected ? 'bg-brand-50' : ''}`}
                      onClick={() => setUploadParticipants((prev) => isSelected ? prev.filter((x) => x !== e.id) : [...prev, e.id])}
                    >
                      <span className={isSelected ? 'text-brand-700 font-medium' : 'text-gray-700'}>{e.name}</span>
                      {isSelected && <CheckCircle className="h-4 w-4 text-brand-600" />}
                    </button>
                  )
                })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setUploadDialog({ open: false, file: null })}>취소</Button>
            <Button onClick={handleFileUpload} disabled={!uploadTitle.trim()}>
              <Upload className="h-4 w-4 mr-1" /> 업로드 및 분석
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 녹음 완료 → 설정 다이얼로그 */}
      <Dialog open={showRecordSetup && !isRecording && recordingChunks.length > 0} onClose={() => setShowRecordSetup(false)} title="녹음 완료 — 저장 설정">
        <div className="space-y-4">
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">
                  {recordingChunks.length}개 파트 · 총 {Math.round(recordingChunks.reduce((s, c) => s + c.duration, 0) / 60)}분 녹음
                </span>
              </div>
              {sttProgress.total > 0 && (
                <span className="text-xs font-medium text-blue-600">
                  STT 사전 처리: {sttProgress.done}/{sttProgress.total} 완료
                  {sttProgress.done === sttProgress.total && ' ✓'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {recordingChunks.map((c) => {
                const hasStt = sttResultsRef.current.has(c.part)
                return (
                  <Badge key={c.part} variant="default" className={`text-[10px] ${hasStt ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                    파트 {c.part}: {Math.round(c.duration / 60)}분 ({(c.blob.size / 1024 / 1024).toFixed(1)}MB)
                    {hasStt && ' · STT ✓'}
                  </Badge>
                )
              })}
            </div>
          </div>

          <Input
            id="record-title"
            label="회의명 *"
            value={recordingTitle}
            onChange={(e) => setRecordingTitle(e.target.value)}
            placeholder="예: 주간 팀 미팅"
          />

          {/* 참석자 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">참석자</label>
            <div className="relative mb-2">
              <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
                placeholder="이름으로 검색..."
                value={recordingSearch}
                onChange={(e) => setRecordingSearch(e.target.value)}
              />
            </div>
            {recordingParticipants.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {recordingParticipants.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 text-brand-700 rounded-full text-xs">
                    {employees.find((e) => e.id === id)?.name || id}
                    <button onClick={() => setRecordingParticipants((prev) => prev.filter((x) => x !== id))} className="hover:text-brand-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="max-h-36 overflow-y-auto border rounded-lg divide-y divide-gray-100">
              {employees
                .filter((e) => !recordingSearch || e.name.includes(recordingSearch))
                .map((e) => {
                  const isSelected = recordingParticipants.includes(e.id)
                  return (
                    <button
                      key={e.id}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${isSelected ? 'bg-brand-50' : ''}`}
                      onClick={() => setRecordingParticipants((prev) => isSelected ? prev.filter((x) => x !== e.id) : [...prev, e.id])}
                    >
                      <span className={isSelected ? 'text-brand-700 font-medium' : 'text-gray-700'}>{e.name}</span>
                      {isSelected && <CheckCircle className="h-4 w-4 text-brand-600" />}
                    </button>
                  )
                })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => { setShowRecordSetup(false); setRecordingChunks([]) }}>취소 (녹음 삭제)</Button>
            <Button onClick={processRecordingChunks} disabled={recordingProcessing || !recordingTitle.trim()}>
              {recordingProcessing ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 분석 중...</>
              ) : (
                <><Upload className="h-4 w-4 mr-1" /> 저장 및 분석</>
              )}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Google Meet 가져오기 다이얼로그 */}
      <Dialog open={meetImportOpen} onClose={() => { setMeetImportOpen(false); setMeetFiles([]) }} title="Google Meet 회의록 가져오기">
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            Google Meet에서 자동 생성된 회의록(Gemini 문서)을 가져와 AI 요약합니다.
            Deepgram STT 과정이 생략되어 <strong>비용 없이 빠르게</strong> 처리됩니다.
          </div>

          {/* 검색 */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
                placeholder="회의 제목으로 검색 (빈 칸이면 전체)"
                value={meetSearchQuery}
                onChange={(e) => setMeetSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMeetSearch()}
              />
            </div>
            <Button onClick={handleMeetSearch} disabled={meetSearching}>
              {meetSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
            </Button>
          </div>

          {/* 검색 결과 */}
          {meetFiles.length > 0 && (
            <div className="max-h-64 overflow-y-auto border rounded-lg divide-y divide-gray-100">
              {meetFiles.map((file) => {
                const isDoc = file.mimeType === 'application/vnd.google-apps.document'
                return (
                  <div key={file.id} className="flex items-center justify-between p-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3 min-w-0">
                      {isDoc ? (
                        <FileText className="h-5 w-5 text-purple-500 shrink-0" />
                      ) : (
                        <Video className="h-5 w-5 text-blue-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(file.createdTime).toLocaleDateString('ko-KR')}
                          {isDoc ? ' · 회의록' : ` · ${Math.round(parseInt(file.size) / 1024 / 1024)}MB`}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleMeetImport(file)}
                      disabled={meetImporting || !isDoc}
                      className={isDoc ? '' : 'opacity-50'}
                    >
                      {meetImporting ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 처리 중...</>
                      ) : isDoc ? (
                        <><FileText className="h-3.5 w-3.5 mr-1" /> 가져오기</>
                      ) : (
                        '영상 (미지원)'
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}

          {meetFiles.length === 0 && !meetSearching && (
            <p className="text-sm text-gray-400 text-center py-4">
              검색 버튼을 눌러 Google Drive에서 회의록을 찾으세요.
            </p>
          )}
        </div>
      </Dialog>
    </div>
  )
}
