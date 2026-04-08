import { useState, useEffect, useRef } from 'react'
import {
  Mic, Download, Clock, Users, ChevronDown, ChevronUp, Loader2, Trash2,
  FileText, AlertTriangle, CheckCircle, ListChecks, MessageSquare, Upload, RefreshCw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { transcribeAudio, DEEPGRAM_COST_PER_MIN } from '@/lib/ai-client'
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
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-200">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold text-gray-900 mt-4 mb-2">$1</h2>')
    // 볼드/이탤릭
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-900">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 리스트
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
      if (geminiKey && sttResult.text) {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `다음 회의 녹취록을 한국어로 요약하세요. 핵심 논의사항, 결정사항, 액션아이템을 구분하여 정리하세요.\n\n${sttResult.text}` }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
            }),
          }
        )
        if (geminiRes.ok) {
          const d = await geminiRes.json()
          summary = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
        }
      }

      // 4. 완료
      await supabase.from('meeting_records').update({
        summary,
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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile?.id) return
    e.target.value = ''

    setUploading(true)
    let meetingId: string | null = null
    try {
      // 1. DB 레코드 생성
      const title = file.name.replace(/\.[^.]+$/, '') || '외부 녹음 파일'
      const { data: meeting, error: dbErr } = await supabase
        .from('meeting_records')
        .insert({
          title,
          recorded_by: profile.id,
          participant_ids: [],
          file_size_bytes: file.size,
          status: 'uploaded',
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
      if (geminiKey && sttResult.text) {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `다음 회의 녹취록을 한국어로 요약하세요. 핵심 논의사항, 결정사항, 액션아이템을 구분하여 정리하세요.\n\n${sttResult.text}` }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
            }),
          }
        )
        if (geminiRes.ok) {
          const d = await geminiRes.json()
          summary = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
        }
      }

      // 5. 완료
      await supabase.from('meeting_records').update({
        summary,
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

  if (loading) return <PageSpinner />

  const completedCount = records.filter((r) => r.status === 'completed').length
  const totalDuration = records.reduce((sum, r) => sum + (r.duration_seconds || 0), 0)

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
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => uploadInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 분석 중...</>
            ) : (
              <><Upload className="h-3.5 w-3.5 mr-1" /> 녹음 파일 업로드</>
            )}
          </Button>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>총 {records.length}건</span>
            <span>완료 {completedCount}건</span>
            <span>총 {Math.round(totalDuration / 60)}분</span>
          </div>
        </div>
      </div>

      {/* 14일 보관 안내 */}
      <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <AlertTriangle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-medium">녹음 파일은 {RETENTION_DAYS}일간 보관 후 자동 삭제됩니다.</p>
          <p className="text-xs text-blue-600 mt-0.5">필요한 녹음은 다운로드하여 보관하세요. AI 요약/전사 텍스트는 영구 보관됩니다.</p>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="py-3 px-4"><p className="text-[11px] text-gray-500">전체 회의록</p><p className="text-2xl font-bold text-gray-900">{records.length}</p></CardContent></Card>
        <Card><CardContent className="py-3 px-4"><p className="text-[11px] text-gray-500">완료</p><p className="text-2xl font-bold text-green-600">{completedCount}</p></CardContent></Card>
        <Card><CardContent className="py-3 px-4"><p className="text-[11px] text-gray-500">총 녹음 시간</p><p className="text-2xl font-bold text-blue-600">{Math.round(totalDuration / 60)}분</p></CardContent></Card>
        <Card><CardContent className="py-3 px-4"><p className="text-[11px] text-gray-500">예상 STT 비용</p><p className="text-2xl font-bold text-amber-600">${(totalDuration / 60 * DEEPGRAM_COST_PER_MIN).toFixed(2)}</p><p className="text-[10px] text-gray-400">Deepgram $0.0043/분</p></CardContent></Card>
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
                        {/* TXT 다운로드 */}
                        {(r.summary || r.transcription) && (
                          <button
                            onClick={() => downloadAsTextFile(`회의록_${r.title || r.id}.txt`, buildTranscriptText(r))}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-white border rounded text-xs text-gray-600 hover:bg-gray-50"
                          >
                            <FileText className="h-3 w-3" /> TXT 저장
                          </button>
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

                      {/* 에러 + 재분석 */}
                      {r.status === 'error' && (
                        <div className="space-y-2">
                          {r.error_message && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                              <p className="text-sm text-red-700">{r.error_message}</p>
                            </div>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleRetry(r.id)}
                            disabled={retryingId === r.id}
                          >
                            {retryingId === r.id ? (
                              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 재분석 중...</>
                            ) : (
                              <><RefreshCw className="h-3.5 w-3.5 mr-1" /> 재분석</>
                            )}
                          </Button>
                        </div>
                      )}

                      {/* 하단 버튼 */}
                      <div className="flex justify-end pt-2 border-t">
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
    </div>
  )
}
