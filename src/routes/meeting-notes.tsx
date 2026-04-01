import { useState, useEffect } from 'react'
import { Mic, Play, Download, Clock, Users, FileText, ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import DOMPurify from 'dompurify'

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

interface Employee {
  id: string
  name: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  recording: { label: '녹음 중', color: 'bg-red-100 text-red-700' },
  uploaded: { label: '업로드됨', color: 'bg-blue-100 text-blue-700' },
  transcribing: { label: '전사 중', color: 'bg-amber-100 text-amber-700' },
  summarizing: { label: '요약 중', color: 'bg-purple-100 text-purple-700' },
  completed: { label: '완료', color: 'bg-green-100 text-green-700' },
  error: { label: '오류', color: 'bg-red-100 text-red-700' },
}

export default function MeetingNotes() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [records, setRecords] = useState<MeetingRecord[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null })
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [recRes, empRes] = await Promise.all([
      supabase
        .from('meeting_records')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('employees')
        .select('id, name')
        .eq('is_active', true),
    ])

    const recs = (recRes.data || []) as MeetingRecord[]
    setRecords(recs)
    setEmployees((empRes.data || []) as Employee[])

    // Signed URL 생성 (녹음 파일)
    const urls: Record<string, string> = {}
    for (const r of recs) {
      if (r.recording_url && r.status !== 'error') {
        const path = r.recording_url.split('/meeting-recordings/').pop()
        if (path) {
          const { data } = await supabase.storage
            .from('meeting-recordings')
            .createSignedUrl(decodeURIComponent(path), 3600)
          if (data?.signedUrl) urls[r.id] = data.signedUrl
        }
      }
    }
    setSignedUrls(urls)
    setLoading(false)
  }

  function getEmpName(id: string) {
    return employees.find((e) => e.id === id)?.name || '알 수 없음'
  }

  function formatDuration(seconds: number | null) {
    if (!seconds) return '-'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}분 ${s}초`
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    const record = records.find((r) => r.id === id)

    // Storage 파일 삭제
    if (record?.recording_url) {
      const path = record.recording_url.split('/meeting-recordings/').pop()
      if (path) {
        await supabase.storage.from('meeting-recordings').remove([decodeURIComponent(path)])
      }
    }

    // DB 삭제
    const { error } = await supabase.from('meeting_records').delete().eq('id', id)
    if (error) {
      toast('삭제 실패: ' + error.message, 'error')
    } else {
      toast('회의록이 삭제되었습니다.', 'success')
      setRecords((prev) => prev.filter((r) => r.id !== id))
    }
    setDeleting(false)
    setDeleteDialog({ open: false, id: null })
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
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>총 {records.length}건</span>
          <span>완료 {completedCount}건</span>
          <span>총 {Math.round(totalDuration / 60)}분</span>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">전체 회의록</p>
            <p className="text-2xl font-bold text-gray-900">{records.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">완료</p>
            <p className="text-2xl font-bold text-green-600">{completedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">총 녹음 시간</p>
            <p className="text-2xl font-bold text-blue-600">{Math.round(totalDuration / 60)}분</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">예상 STT 비용</p>
            <p className="text-2xl font-bold text-amber-600">${(totalDuration / 60 * 0.006).toFixed(2)}</p>
            <p className="text-[10px] text-gray-400">Whisper $0.006/분</p>
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

            return (
              <Card key={r.id} className="overflow-hidden">
                {/* 헤더 */}
                <button
                  className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => toggleExpand(r.id)}
                >
                  <Mic className={`h-5 w-5 shrink-0 ${r.status === 'completed' ? 'text-green-500' : 'text-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">{r.title || '제목 없음'}</p>
                      <Badge variant="default" className={status.color + ' text-[10px]'}>{status.label}</Badge>
                      {r.is_sent && <Badge variant="default" className="bg-blue-50 text-blue-600 text-[10px]">발송됨</Badge>}
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
                  <div className="border-t px-4 pb-4 space-y-4">
                    {/* 참석자 */}
                    {participants.length > 0 && (
                      <div className="pt-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1">참석자</p>
                        <div className="flex flex-wrap gap-1">
                          {participants.map((name, i) => (
                            <Badge key={i} variant="default" className="bg-gray-100 text-gray-700 text-xs">{name}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 녹음 파일 */}
                    {signedUrls[r.id] && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">녹음 파일</p>
                        <div className="flex items-center gap-2">
                          <audio controls src={signedUrls[r.id]} className="h-8 flex-1" />
                          <a
                            href={signedUrls[r.id]}
                            download={`회의록_${r.title || r.id}.webm`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-md"
                          >
                            <Download className="h-3.5 w-3.5" /> 다운로드
                          </a>
                        </div>
                        {r.file_size_bytes && (
                          <p className="text-[10px] text-gray-400 mt-1">{(r.file_size_bytes / 1024 / 1024).toFixed(1)} MB</p>
                        )}
                      </div>
                    )}

                    {/* AI 요약 */}
                    {r.summary && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">AI 요약</p>
                        <div
                          className="prose prose-sm max-w-none text-gray-700 bg-gray-50 rounded-lg p-4"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(r.summary.replace(/\n/g, '<br>')) }}
                        />
                      </div>
                    )}

                    {/* 전사 텍스트 */}
                    {r.transcription && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">전사 텍스트</p>
                        <div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
                          <p className="text-sm text-gray-600 whitespace-pre-wrap">{r.transcription}</p>
                        </div>
                      </div>
                    )}

                    {/* 액션 아이템 */}
                    {r.action_items && Array.isArray(r.action_items) && r.action_items.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">액션 아이템</p>
                        <ul className="space-y-1">
                          {r.action_items.map((item: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                              <span className="text-brand-500 mt-0.5">•</span>
                              <span>{typeof item === 'string' ? item : item.task || JSON.stringify(item)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 에러 */}
                    {r.status === 'error' && r.error_message && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">{r.error_message}</p>
                      </div>
                    )}

                    {/* 삭제 버튼 */}
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
            <Button
              variant="danger"
              onClick={() => deleteDialog.id && handleDelete(deleteDialog.id)}
              disabled={deleting}
            >
              {deleting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 삭제 중...</> : '삭제'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
