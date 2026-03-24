import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle, Users, GripVertical,
  Target, Clock, Activity, Layers, ChevronDown,
  ChevronRight, Star, Plus, Calendar, X,
  FileText, MessageSquare, BarChart3,
  Upload, Paperclip, LayoutGrid, Table2,
  GanttChart, Image, Mail,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { RichEditor } from '@/components/ui/RichEditor'
import { useProjectBoard } from '@/hooks/useProjectBoard'
import { supabase } from '@/lib/supabase'
import type { Task } from '@/types/work'
import type { StageStatus, ProjectUpdate } from '@/types/project-board'
import {
  STAGE_STATUS_COLORS,
} from '@/types/project-board'

// ─── Constants ─────────────────────────────────────────────────────

const GROUP_COLORS = [
  { bar: 'bg-blue-500', header: 'bg-blue-50', text: 'text-blue-700', light: 'bg-blue-100' },
  { bar: 'bg-violet-500', header: 'bg-violet-50', text: 'text-violet-700', light: 'bg-violet-100' },
  { bar: 'bg-emerald-500', header: 'bg-emerald-50', text: 'text-emerald-700', light: 'bg-emerald-100' },
  { bar: 'bg-amber-500', header: 'bg-amber-50', text: 'text-amber-700', light: 'bg-amber-100' },
  { bar: 'bg-rose-500', header: 'bg-rose-50', text: 'text-rose-700', light: 'bg-rose-100' },
  { bar: 'bg-cyan-500', header: 'bg-cyan-50', text: 'text-cyan-700', light: 'bg-cyan-100' },
]

const PRIORITY_OPTIONS = [
  { value: 1, label: '긴급 (1)', group: '긴급' },
  { value: 2, label: '긴급 (2)', group: '긴급' },
  { value: 3, label: '긴급 (3)', group: '긴급' },
  { value: 4, label: '상 (4)', group: '상' },
  { value: 5, label: '상 (5)', group: '상' },
  { value: 6, label: '중 (6)', group: '중' },
  { value: 7, label: '중 (7)', group: '중' },
  { value: 8, label: '하 (8)', group: '하' },
  { value: 9, label: '하 (9)', group: '하' },
  { value: 10, label: '하 (10)', group: '하' },
]

function getPriorityInfo(priority: number) {
  if (priority <= 3) return { label: '긴급', color: 'bg-rose-500 text-white' }
  if (priority <= 5) return { label: '상', color: 'bg-violet-500 text-white' }
  if (priority <= 7) return { label: '중', color: 'bg-indigo-500 text-white' }
  return { label: '하', color: 'bg-emerald-500 text-white' }
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

function getDday(dateStr: string | null): { label: string; className: string } | null {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff < 0) return { label: `D+${Math.abs(diff)}`, className: 'text-red-600 bg-red-50' }
  if (diff === 0) return { label: 'D-Day', className: 'text-amber-700 bg-amber-50' }
  if (diff <= 3) return { label: `D-${diff}`, className: 'text-amber-600 bg-amber-50' }
  return { label: `D-${diff}`, className: 'text-gray-500 bg-gray-50' }
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return formatDateShort(dateStr)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

const STAGE_PILL_COLORS: Record<StageStatus, string> = {
  '시작전': 'bg-gray-200 text-gray-600',
  '진행중': 'bg-blue-500 text-white',
  '완료': 'bg-emerald-500 text-white',
  '홀딩': 'bg-amber-500 text-white',
}

// ─── Slide Panel Component ─────────────────────────────────────────

interface SlidePanelState {
  projectId: string
  projectName: string
  stageId: string
  stageName: string
}

type PanelTab = 'updates' | 'files' | 'activity'

interface UpdateWithAuthor extends ProjectUpdate {
  author_name: string
}

function SlidePanel({
  panel,
  onClose,
  addUpdate,
  fetchUpdates,
}: {
  panel: SlidePanelState
  onClose: () => void
  addUpdate: (data: {
    project_id: string
    stage_id?: string
    content: string
    attachments?: { url: string; name: string; size: number; type: string }[]
  }) => Promise<{ error: string | null }>
  fetchUpdates: (projectId: string) => Promise<UpdateWithAuthor[]>
}) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<PanelTab>('updates')
  const [updates, setUpdates] = useState<UpdateWithAuthor[]>([])
  const [loadingUpdates, setLoadingUpdates] = useState(true)
  const [editorContent, setEditorContent] = useState('')
  const [attachments, setAttachments] = useState<{ url: string; name: string; size: number; type: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)

  // Fetch updates for this project (filtered by stageId in display)
  const loadUpdates = useCallback(async () => {
    setLoadingUpdates(true)
    const data = await fetchUpdates(panel.projectId)
    setUpdates(data)
    setLoadingUpdates(false)
  }, [fetchUpdates, panel.projectId])

  useEffect(() => {
    loadUpdates()
  }, [loadUpdates])

  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Close plus menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false)
      }
    }
    if (showPlusMenu) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [showPlusMenu])

  // Filter updates for current stage
  const stageUpdates = useMemo(() =>
    updates.filter((u) => u.stage_id === panel.stageId),
    [updates, panel.stageId]
  )

  // All files from stage updates' attachments
  const allFiles = useMemo(() =>
    stageUpdates.flatMap((u) =>
      (u.attachments || []).map((a) => ({ ...a, uploadedAt: u.created_at, authorName: u.author_name }))
    ),
    [stageUpdates]
  )

  // Activity log: all updates including status changes
  const activityLog = useMemo(() =>
    stageUpdates.map((u) => {
      let actionDescription = u.content
      let actionType: 'status' | 'comment' | 'file' = 'comment'
      if (u.status_changed_from && u.status_changed_to) {
        actionDescription = `${panel.stageName}: ${u.status_changed_from} → ${u.status_changed_to}`
        actionType = 'status'
      } else if ((u.attachments || []).length > 0) {
        actionType = 'file'
      }
      return { ...u, actionDescription, actionType }
    }),
    [stageUpdates, panel.stageName]
  )

  const handleSubmitUpdate = async () => {
    const trimmed = editorContent.replace(/<[^>]*>/g, '').trim()
    if (!trimmed && attachments.length === 0) {
      toast('내용을 입력해주세요', 'error')
      return
    }
    setSubmitting(true)
    const result = await addUpdate({
      project_id: panel.projectId,
      stage_id: panel.stageId,
      content: editorContent,
      attachments: attachments.length > 0 ? attachments : undefined,
    })
    setSubmitting(false)
    if (result.error) {
      toast(result.error, 'error')
    } else {
      toast('업데이트가 등록되었습니다')
      setEditorContent('')
      setAttachments([])
      await loadUpdates()
    }
  }

  const handleFileUploadTab = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `project-files/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('chat-attachments').upload(path, file)
      if (error) {
        toast('파일 업로드 실패', 'error')
        continue
      }
      const { data } = supabase.storage.from('chat-attachments').getPublicUrl(path)
      const uploaded = { url: data.publicUrl, name: file.name, size: file.size, type: file.type }
      // Post as an update with attachment
      await addUpdate({
        project_id: panel.projectId,
        stage_id: panel.stageId,
        content: `파일 업로드: ${file.name}`,
        attachments: [uploaded],
      })
    }
    e.target.value = ''
    toast('파일이 업로드되었습니다')
    await loadUpdates()
  }

  const plusMenuItems = [
    { icon: LayoutGrid, label: '아이템 카드' },
    { icon: Table2, label: '테이블' },
    { icon: BarChart3, label: '차트' },
    { icon: GanttChart, label: '간트' },
    { icon: Image, label: '파일 갤러리' },
    { icon: Mail, label: '이메일 및 액티비티' },
  ]

  const tabClass = (tab: PanelTab) =>
    `px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
      activeTab === tab
        ? 'border-blue-500 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] max-w-full bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 translate-x-0">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-gray-900 truncate">{panel.projectName}</span>
            <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-sm font-medium text-blue-600 truncate">{panel.stageName}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors shrink-0"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center border-b border-gray-200 px-2">
          <button className={tabClass('updates')} onClick={() => setActiveTab('updates')}>
            <span className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> 업데이트
            </span>
          </button>
          <button className={tabClass('files')} onClick={() => setActiveTab('files')}>
            <span className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> 파일
            </span>
          </button>
          <button className={tabClass('activity')} onClick={() => setActiveTab('activity')}>
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> 활동 로그
            </span>
          </button>

          {/* Plus menu */}
          <div className="relative ml-auto" ref={plusMenuRef}>
            <button
              onClick={() => setShowPlusMenu(!showPlusMenu)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
            {showPlusMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                {plusMenuItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setShowPlusMenu(false)
                      toast(`${item.label} 기능은 준비 중입니다`)
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <item.icon className="h-4 w-4 text-gray-400" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Updates Tab ── */}
          {activeTab === 'updates' && (
            <div className="p-4 space-y-4">
              {/* New update editor */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  업데이트를 작성하고 @(으)로 다른 사람을 태그하세요
                </p>
                <RichEditor
                  value={editorContent}
                  onChange={setEditorContent}
                  placeholder="업데이트를 입력하세요..."
                  minHeight="100px"
                  onFileUpload={(files) => setAttachments((prev) => [...prev, ...files])}
                />
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {attachments.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        <Paperclip className="h-3 w-3" />
                        {a.name}
                        <button
                          onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={handleSubmitUpdate} disabled={submitting}>
                    {submitting ? '등록 중...' : '등록'}
                  </Button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200" />

              {/* Previous updates */}
              {loadingUpdates ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : stageUpdates.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  아직 업데이트가 없습니다
                </div>
              ) : (
                <div className="space-y-4">
                  {stageUpdates.map((update) => (
                    <div key={update.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {update.author_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">{update.author_name}</span>
                          <span className="text-xs text-gray-400">{formatTimeAgo(update.created_at)}</span>
                        </div>
                        {update.status_changed_from && update.status_changed_to ? (
                          <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                            <span className="font-medium">{panel.stageName}</span>:{' '}
                            <span className="text-gray-500">{update.status_changed_from}</span>
                            {' → '}
                            <span className="text-blue-600 font-medium">{update.status_changed_to}</span>
                          </div>
                        ) : (
                          <div
                            className="text-sm text-gray-700 prose prose-sm max-w-none [&_img]:rounded-lg [&_img]:max-w-full [&_a]:text-blue-600 [&_a]:underline"
                            dangerouslySetInnerHTML={{ __html: update.content }}
                          />
                        )}
                        {(update.attachments || []).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {update.attachments.map((att, i) => (
                              <a
                                key={i}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                              >
                                <Paperclip className="h-3 w-3" />
                                {att.name}
                                <span className="text-blue-400">({formatFileSize(att.size)})</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Files Tab ── */}
          {activeTab === 'files' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-medium text-gray-700">
                  첨부 파일 ({allFiles.length})
                </p>
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" /> 파일 업로드
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={handleFileUploadTab}
                />
              </div>

              {allFiles.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  첨부된 파일이 없습니다
                </div>
              ) : (
                <div className="space-y-2">
                  {allFiles.map((file, i) => (
                    <a
                      key={i}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        {file.type.startsWith('image/') ? (
                          <Image className="h-5 w-5 text-blue-500" />
                        ) : (
                          <FileText className="h-5 w-5 text-blue-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                        <p className="text-xs text-gray-400">
                          {formatFileSize(file.size)} · {formatTimeAgo(file.uploadedAt)} · {file.authorName}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Activity Log Tab ── */}
          {activeTab === 'activity' && (
            <div className="p-4">
              {loadingUpdates ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : activityLog.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  <Activity className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  활동 기록이 없습니다
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />

                  <div className="space-y-4">
                    {activityLog.map((item) => (
                      <div key={item.id} className="flex gap-3 relative pl-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 z-10 ${
                          item.actionType === 'status' ? 'bg-violet-500' :
                          item.actionType === 'file' ? 'bg-teal-500' :
                          'bg-blue-500'
                        }`}>
                          {item.actionType === 'status' ? (
                            <Activity className="h-3.5 w-3.5" />
                          ) : item.actionType === 'file' ? (
                            <FileText className="h-3.5 w-3.5" />
                          ) : (
                            <MessageSquare className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pb-2">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-gray-900">{item.author_name}</span>
                            <span className="text-xs text-gray-400">{formatTimeAgo(item.created_at)}</span>
                          </div>
                          <p className={`text-sm ${
                            item.actionType === 'status' ? 'text-violet-700 font-medium' : 'text-gray-600'
                          }`}>
                            {item.actionType === 'status' ? (
                              item.actionDescription
                            ) : (
                              <span dangerouslySetInnerHTML={{ __html: item.actionDescription }} />
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Main Component ────────────────────────────────────────────────

interface EditingField {
  projectId: string
  field: 'assignee' | 'priority' | 'launch_date'
  stageId?: string       // 스테이지 인라인 편집용
  stageField?: 'stage_assignee' | 'stage_deadline'
}

export default function UnifiedDashboard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    projects, loading: boardLoading, employees: boardEmployees,
    updateProject, updateStageStatus, updateStageDeadline, addUpdate, fetchUpdates, refresh,
  } = useProjectBoard()

  const [tasks, setTasks] = useState<Task[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [filterBrand, setFilterBrand] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  // Inline editing state
  const [editingField, setEditingField] = useState<EditingField | null>(null)
  const editRef = useRef<HTMLDivElement>(null)

  // Slide panel state
  const [slidePanel, setSlidePanel] = useState<SlidePanelState | null>(null)

  // Drag & Drop
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragCounter = useRef(0)

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedId(null)
    setDragOverId(null)
    dragCounter.current = 0
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    dragCounter.current++
    setDragOverId(id)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDragOverId(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  // Close inline editing on outside click
  useEffect(() => {
    if (!editingField) return
    const handleClickOutside = (e: MouseEvent) => {
      if (editRef.current && !editRef.current.contains(e.target as Node)) {
        setEditingField(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editingField])

  // ─── Data fetch ──────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      supabase.from('tasks').select('*').order('due_date'),
      supabase.from('employees').select('id, name').eq('is_active', true),
    ]).then(([taskRes, empRes]) => {
      setTasks((taskRes.data || []) as Task[])
      setEmployees((empRes.data || []) as { id: string; name: string }[])
      setTasksLoading(false)
    })
  }, [])

  // Merge employees from both sources
  const allEmployees = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const e of employees) map.set(e.id, e)
    for (const e of boardEmployees) map.set(e.id, { id: e.id, name: e.name })
    return [...map.values()]
  }, [employees, boardEmployees])

  const getEmpName = useCallback(
    (id: string | null) => allEmployees.find((e) => e.id === id)?.name || '-',
    [allEmployees]
  )

  // ─── Inline edit handlers ──────────────────────────────────────

  const handleInlineAssigneeChange = useCallback(async (projectId: string, managerId: string) => {
    const result = await updateProject(projectId, { manager_id: managerId || null } as Parameters<typeof updateProject>[1])
    if (result.error) {
      toast(result.error, 'error')
    } else {
      toast('담당자가 변경되었습니다')
    }
    setEditingField(null)
  }, [updateProject, toast])

  const handleInlinePriorityChange = useCallback(async (projectId: string, priority: number) => {
    const result = await updateProject(projectId, { priority } as Parameters<typeof updateProject>[1])
    if (result.error) {
      toast(result.error, 'error')
    } else {
      toast('우선순위가 변경되었습니다')
    }
    setEditingField(null)
  }, [updateProject, toast])

  const handleInlineLaunchDateChange = useCallback(async (projectId: string, date: string) => {
    const result = await updateProject(projectId, { launch_date: date || null } as Parameters<typeof updateProject>[1])
    if (result.error) {
      toast(result.error, 'error')
    } else {
      toast('마감일이 변경되었습니다')
    }
    setEditingField(null)
  }, [updateProject, toast])

  // ─── Filtered & grouped data ─────────────────────────────────────

  const filteredProjects = useMemo(() => {
    if (!filterBrand) return projects
    return projects.filter((p) => p.brand === filterBrand)
  }, [projects, filterBrand])

  const brands = useMemo(() => [...new Set(projects.map((p) => p.brand))], [projects])

  // Stats
  const activeProjects = filteredProjects.filter((p) => p.status === 'active')
  const completedProjects = filteredProjects.filter((p) => p.status === 'completed')
  const holdingProjects = filteredProjects.filter((p) => p.status === 'holding')
  const allStages = filteredProjects.flatMap((p) => p.stages)
  const completedStages = allStages.filter((s) => s.status === '완료').length
  const totalStages = allStages.length
  const overallProgress = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0
  const delayedStages = allStages.filter((s) => {
    if (s.status === '완료' || !s.deadline) return false
    return new Date(s.deadline) < new Date()
  })

  const activeTasks = tasks.filter((t) => t.status !== 'cancelled')
  const doneTasks = activeTasks.filter((t) => t.status === 'done')
  const overdueTasks = activeTasks.filter((t) => {
    if (t.status === 'done' || !t.due_date) return false
    return new Date(t.due_date) < new Date()
  })
  const taskCompletionRate = activeTasks.length > 0 ? Math.round((doneTasks.length / activeTasks.length) * 100) : 0

  // Projects with computed progress
  const projectsWithProgress = useMemo(() => filteredProjects.map((p) => {
    const total = p.stages.length
    const completed = p.stages.filter((s) => s.status === '완료').length
    const delayed = p.stages.filter((s) => s.status !== '완료' && s.deadline && new Date(s.deadline) < new Date()).length
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0
    const currentStage = p.stages.find((s) => s.status === '진행중') || p.stages.find((s) => s.status === '시작전')
    const linkedTasks = tasks.filter((t) => t.linked_board_id === p.id)
    return { ...p, progress, completed, delayed, currentStage, linkedTasks, total }
  }), [filteredProjects, tasks])

  // Group by brand
  const groupedByBrand = useMemo(() => {
    const map = new Map<string, typeof projectsWithProgress>()
    for (const p of projectsWithProgress) {
      const list = map.get(p.brand) || []
      list.push(p)
      map.set(p.brand, list)
    }
    return [...map.entries()].map(([brand, items], idx) => ({
      brand,
      items: items.sort((a, b) => a.priority - b.priority),
      color: GROUP_COLORS[idx % GROUP_COLORS.length],
    }))
  }, [projectsWithProgress])

  // Drag & Drop handler
  const handleDrop = useCallback(async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDragOverId(null)
    dragCounter.current = 0

    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      return
    }

    const allActive = projectsWithProgress
      .filter((p) => p.status === 'active' || p.status === 'holding')

    const ids = allActive.map((p) => p.id)
    const fromIdx = ids.indexOf(draggedId)
    const toIdx = ids.indexOf(targetId)

    if (fromIdx === -1 || toIdx === -1) {
      setDraggedId(null)
      return
    }

    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, draggedId)

    setDraggedId(null)
    for (let i = 0; i < ids.length; i++) {
      const proj = allActive.find((p) => p.id === ids[i])
      if (proj && proj.priority !== i + 1) {
        await updateProject(ids[i], { priority: i + 1 } as Parameters<typeof updateProject>[1])
      }
    }
  }, [draggedId, projectsWithProgress, updateProject])

  // Stage status change handler
  const handleStageStatusChange = useCallback(async (stageId: string, projectId: string, newStatus: StageStatus) => {
    const result = await updateStageStatus(stageId, newStatus, projectId)
    if (result.error) {
      toast(result.error, 'error')
    } else {
      toast('단계 상태가 변경되었습니다')
    }
  }, [updateStageStatus, toast])

  // Toggle expand
  const toggleExpand = useCallback((projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  // Toggle favorite
  const toggleFavorite = useCallback((projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  // Assignee workload
  const assigneeWorkload = useMemo(() => {
    const map = new Map<string, { name: string; projects: number; tasks: number; overdue: number }>()
    for (const p of filteredProjects) {
      for (const aid of p.assignee_ids || []) {
        if (!map.has(aid)) map.set(aid, { name: getEmpName(aid), projects: 0, tasks: 0, overdue: 0 })
        map.get(aid)!.projects++
      }
    }
    for (const t of activeTasks) {
      if (!t.assignee_id) continue
      if (!map.has(t.assignee_id)) map.set(t.assignee_id, { name: getEmpName(t.assignee_id), projects: 0, tasks: 0, overdue: 0 })
      map.get(t.assignee_id)!.tasks++
      if (t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()) {
        map.get(t.assignee_id)!.overdue++
      }
    }
    return [...map.entries()].sort((a, b) => b[1].tasks - a[1].tasks).slice(0, 8)
  }, [filteredProjects, activeTasks, getEmpName])

  // Open slide panel
  const openSlidePanel = useCallback((projectId: string, projectName: string, stageId: string, stageName: string) => {
    setSlidePanel({ projectId, projectName, stageId, stageName })
  }, [])

  if (boardLoading || tasksLoading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">프로젝트 & 업무 대시보드</h1>
          <p className="text-sm text-gray-500 mt-0.5">전체 프로젝트 현황을 한눈에 파악합니다</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
            options={[{ value: '', label: '전체 브랜드' }, ...brands.map((b) => ({ value: b, label: b }))]}
          />
          <Button onClick={() => navigate('/admin/projects/new')}>
            <Plus className="h-4 w-4" /> 새 프로젝트
          </Button>
        </div>
      </div>

      {/* ─── Summary Stats Row ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-gray-500">진행중</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{activeProjects.length}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-[11px] text-gray-500">홀딩</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{holdingProjects.length}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] text-gray-500">완료</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{completedProjects.length}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-violet-500" />
              <span className="text-[11px] text-gray-500">파이프라인 진행률</span>
            </div>
            <p className="text-2xl font-bold text-violet-600">{overallProgress}%</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-cyan-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-cyan-500" />
              <span className="text-[11px] text-gray-500">작업 완료율</span>
            </div>
            <p className="text-2xl font-bold text-cyan-600">{taskCompletionRate}%</p>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${(delayedStages.length + overdueTasks.length) > 0 ? 'border-l-red-500' : 'border-l-emerald-500'}`}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className={`h-4 w-4 ${(delayedStages.length + overdueTasks.length) > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
              <span className="text-[11px] text-gray-500">지연 항목</span>
            </div>
            <p className={`text-2xl font-bold ${(delayedStages.length + overdueTasks.length) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {delayedStages.length + overdueTasks.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Monday.com Style Main Table ─────────────────────────── */}
      <div className="space-y-4">
        {groupedByBrand.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              프로젝트가 없습니다
            </CardContent>
          </Card>
        ) : (
          groupedByBrand.map((group) => {
            // Group summary calculations
            const avgProgress = group.items.length > 0
              ? Math.round(group.items.reduce((s, p) => s + p.progress, 0) / group.items.length)
              : 0
            const totalTasks = group.items.reduce((s, p) => s + p.linkedTasks.length, 0)
            const priorityDist = { urgent: 0, high: 0, mid: 0, low: 0 }
            for (const p of group.items) {
              if (p.priority <= 3) priorityDist.urgent++
              else if (p.priority <= 5) priorityDist.high++
              else if (p.priority <= 7) priorityDist.mid++
              else priorityDist.low++
            }

            return (
              <div key={group.brand} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                {/* ── Group Header ─────────────────────────────── */}
                <div className={`flex items-center gap-3 px-4 py-3 ${group.color.header}`}>
                  <div className={`w-1.5 h-8 rounded-full ${group.color.bar}`} />
                  <h2 className={`text-sm font-bold ${group.color.text}`}>
                    {group.brand}
                  </h2>
                  <Badge className={`${group.color.light} ${group.color.text} text-[10px]`}>
                    {group.items.length}개 프로젝트
                  </Badge>
                  <span className="text-[10px] text-gray-400 ml-auto flex items-center gap-1">
                    <GripVertical className="h-3 w-3" /> 드래그로 우선순위 변경
                  </span>
                </div>

                {/* ── Table Headers ────────────────────────────── */}
                <div className="overflow-x-auto">
                <div className="grid grid-cols-[32px_minmax(0,2.5fr)_120px_minmax(0,1.2fr)_80px_90px_100px_60px] gap-0 items-center px-4 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide min-w-[700px]">
                  <div />
                  <div>프로젝트명</div>
                  <div>담당자</div>
                  <div>진행상황</div>
                  <div className="text-center">우선순위</div>
                  <div className="text-center">마감일</div>
                  <div>현재단계</div>
                  <div className="text-center">작업</div>
                </div>

                {/* ── Project Rows ─────────────────────────────── */}
                <div className="divide-y divide-gray-100">
                  {group.items.map((p) => {
                    const isExpanded = expandedProjects.has(p.id)
                    const isFav = favorites.has(p.id)
                    const priorityInfo = getPriorityInfo(p.priority)
                    const sortedStages = [...p.stages].sort((a, b) => a.stage_order - b.stage_order)
                    const isEditingAssignee = editingField?.projectId === p.id && editingField.field === 'assignee'
                    const isEditingPriority = editingField?.projectId === p.id && editingField.field === 'priority'
                    const isEditingDate = editingField?.projectId === p.id && editingField.field === 'launch_date'

                    return (
                      <div key={p.id}>
                        {/* Main project row */}
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, p.id)}
                          onDragEnd={handleDragEnd}
                          onDragEnter={(e) => handleDragEnter(e, p.id)}
                          onDragLeave={handleDragLeave}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, p.id)}
                          className={`grid grid-cols-[32px_minmax(0,2.5fr)_120px_minmax(0,1.2fr)_80px_90px_100px_60px] gap-0 items-center px-4 py-2.5 transition-all cursor-pointer group min-w-[700px] ${
                            dragOverId === p.id && draggedId !== p.id
                              ? 'bg-blue-50 shadow-inner'
                              : draggedId === p.id
                              ? 'bg-gray-100 opacity-50'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          {/* Expand chevron + drag handle */}
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleExpand(p.id) }}
                              className="p-0.5 rounded hover:bg-gray-200 transition-colors"
                            >
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                                : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                              }
                            </button>
                            <div className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
                              <GripVertical className="h-3.5 w-3.5 text-gray-300" />
                            </div>
                          </div>

                          {/* Project name */}
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              onClick={(e) => toggleFavorite(p.id, e)}
                              className="shrink-0"
                            >
                              <Star
                                className={`h-3.5 w-3.5 transition-colors ${
                                  isFav ? 'text-amber-400 fill-amber-400' : 'text-gray-300 hover:text-amber-300'
                                }`}
                              />
                            </button>
                            <span
                              onClick={() => navigate(`/admin/projects/${p.id}`)}
                              className="text-sm font-medium text-gray-900 truncate hover:text-blue-600 hover:underline transition-colors cursor-pointer"
                            >
                              {p.project_name}
                            </span>
                            {p.linkedTasks.length > 0 && (
                              <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
                                {p.linkedTasks.length}
                              </span>
                            )}
                            {p.delayed > 0 && (
                              <span className="shrink-0 text-red-500">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>

                          {/* Assignees — inline editable */}
                          <div className="relative" ref={isEditingAssignee ? editRef : undefined}>
                            {isEditingAssignee ? (
                              <select
                                autoFocus
                                className="w-full text-xs border border-blue-400 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                defaultValue={p.manager_id || ''}
                                onChange={(e) => handleInlineAssigneeChange(p.id, e.target.value)}
                                onBlur={() => setEditingField(null)}
                              >
                                <option value="">미지정</option>
                                {allEmployees.map((emp) => (
                                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                              </select>
                            ) : (
                              <span
                                onClick={(e) => { e.stopPropagation(); setEditingField({ projectId: p.id, field: 'assignee' }) }}
                                className="text-xs text-gray-700 truncate cursor-pointer hover:text-blue-600 transition-colors"
                              >
                                {p.manager_name || <span className="text-gray-400">+ 담당자</span>}
                              </span>
                            )}
                          </div>

                          {/* Progress bar */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                                style={{ width: `${p.progress}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-600 w-9 text-right tabular-nums">
                              {p.progress}%
                            </span>
                          </div>

                          {/* Priority — inline editable */}
                          <div className="flex justify-center relative" ref={isEditingPriority ? editRef : undefined}>
                            {isEditingPriority ? (
                              <select
                                autoFocus
                                className="text-xs border border-blue-400 rounded px-1 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                                defaultValue={p.priority}
                                onChange={(e) => handleInlinePriorityChange(p.id, Number(e.target.value))}
                                onBlur={() => setEditingField(null)}
                              >
                                {PRIORITY_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            ) : (
                              <span
                                onClick={(e) => { e.stopPropagation(); setEditingField({ projectId: p.id, field: 'priority' }) }}
                                className={`inline-flex items-center justify-center px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer hover:ring-2 hover:ring-blue-300 transition-all ${priorityInfo.color}`}
                                title="클릭하여 우선순위 변경"
                              >
                                {priorityInfo.label}
                              </span>
                            )}
                          </div>

                          {/* Launch date — inline editable */}
                          <div className="text-center relative" ref={isEditingDate ? editRef : undefined}>
                            {isEditingDate ? (
                              <input
                                type="date"
                                autoFocus
                                className="text-xs border border-blue-400 rounded px-1 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                                defaultValue={p.launch_date || ''}
                                onChange={(e) => handleInlineLaunchDateChange(p.id, e.target.value)}
                                onBlur={() => setEditingField(null)}
                              />
                            ) : (
                              <span
                                onClick={(e) => { e.stopPropagation(); setEditingField({ projectId: p.id, field: 'launch_date' }) }}
                                className="text-xs text-gray-600 cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                                title="클릭하여 마감일 변경"
                              >
                                {formatDateShort(p.launch_date)}
                              </span>
                            )}
                          </div>

                          {/* Current stage */}
                          <div>
                            {p.currentStage ? (
                              <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full truncate block text-center">
                                {p.currentStage.stage_name}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-400 block text-center">-</span>
                            )}
                          </div>

                          {/* Task count */}
                          <div className="text-center text-xs text-gray-500 font-medium">
                            {p.linkedTasks.length}
                          </div>
                        </div>

                        {/* ── Expanded sub-rows (pipeline stages) ── */}
                        {isExpanded && (
                          <div className={`border-l-4 ${group.color.bar} bg-gray-50/70`}>
                            <div className="grid grid-cols-[32px_minmax(0,2.5fr)_120px_minmax(0,1.2fr)_80px_90px_100px_60px] gap-0 items-center px-4 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200 min-w-[700px]">
                              <div />
                              <div className="pl-6">파이프라인 단계</div>
                              <div>담당자</div>
                              <div>상태</div>
                              <div className="text-center">순서</div>
                              <div className="text-center">마감일</div>
                              <div className="text-center">D-Day</div>
                              <div />
                            </div>
                            {sortedStages.map((stage) => {
                              const dday = getDday(stage.deadline)
                              // 스테이지에 직접 지정된 담당자만 표시
                              const stageAssigneeIds = stage.stage_assignee_ids || []
                              const stageAssigneeNames = stageAssigneeIds
                                .map((id) => getEmpName(id))
                                .filter((n) => n !== '-')

                              return (
                                <div
                                  key={stage.id}
                                  className="grid grid-cols-[32px_minmax(0,2.5fr)_120px_minmax(0,1.2fr)_80px_90px_100px_60px] gap-0 items-center px-4 py-2 border-b border-gray-100 last:border-b-0 hover:bg-white/80 transition-colors min-w-[700px]"
                                >
                                  <div />
                                  {/* Stage name — clickable to open slide panel */}
                                  <div className="pl-6 flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      stage.status === '완료' ? 'bg-emerald-500' :
                                      stage.status === '진행중' ? 'bg-blue-500' :
                                      stage.status === '홀딩' ? 'bg-amber-500' : 'bg-gray-300'
                                    }`} />
                                    <span
                                      onClick={() => openSlidePanel(p.id, p.project_name, stage.id, stage.stage_name)}
                                      className="text-[12px] text-gray-700 font-medium truncate cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                                      title="클릭하여 상세 패널 열기"
                                    >
                                      {stage.stage_name}
                                    </span>
                                  </div>

                                  {/* Stage assignees — inline editable */}
                                  <div className="relative">
                                    {editingField?.stageId === stage.id && editingField.stageField === 'stage_assignee' ? (
                                      <div ref={editRef} className="absolute z-30 top-0 left-0 bg-white border border-gray-200 rounded-lg shadow-xl p-2 w-48 max-h-48 overflow-y-auto">
                                        {allEmployees.map((emp) => (
                                          <button
                                            key={emp.id}
                                            onClick={async () => {
                                              const currentIds = stage.stage_assignee_ids || []
                                              const newIds = currentIds.includes(emp.id)
                                                ? currentIds.filter((id) => id !== emp.id)
                                                : [...currentIds, emp.id]
                                              await supabase.from('pipeline_stages').update({ stage_assignee_ids: newIds }).eq('id', stage.id)
                                              toast('담당자가 변경되었습니다')
                                              setEditingField(null)
                                              refresh()
                                            }}
                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs hover:bg-gray-100 ${
                                              (stage.stage_assignee_ids || []).includes(emp.id) ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                                            }`}
                                          >
                                            <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold shrink-0">
                                              {emp.name[0]}
                                            </div>
                                            {emp.name}
                                            {(stage.stage_assignee_ids || []).includes(emp.id) && (
                                              <span className="ml-auto text-blue-500 text-[10px]">✓</span>
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1 group/assignee relative">
                                        <span
                                          onClick={(e) => { e.stopPropagation(); setEditingField({ projectId: p.id, field: 'assignee', stageId: stage.id, stageField: 'stage_assignee' }) }}
                                          className="text-[11px] text-gray-700 truncate cursor-pointer hover:text-blue-600 transition-colors"
                                        >
                                          {stageAssigneeNames.length > 0 ? stageAssigneeNames[0] : ''}
                                        </span>
                                        {stageAssigneeNames.length > 1 && (
                                          <span className="text-[10px] text-blue-600 bg-blue-50 px-1 rounded font-medium cursor-default">
                                            +{stageAssigneeNames.length - 1}
                                          </span>
                                        )}
                                        {stageAssigneeNames.length === 0 && (
                                          <span
                                            onClick={(e) => { e.stopPropagation(); setEditingField({ projectId: p.id, field: 'assignee', stageId: stage.id, stageField: 'stage_assignee' }) }}
                                            className="text-[11px] text-gray-400 cursor-pointer hover:text-blue-500"
                                          >+ 담당자</span>
                                        )}
                                        {/* 호버 시 전체 담당자 목록 툴팁 */}
                                        {stageAssigneeNames.length > 1 && (
                                          <div className="absolute left-0 top-full mt-1 hidden group-hover/assignee:block z-40">
                                            <div className="bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                                              <p className="font-semibold mb-1 text-gray-300">담당자 ({stageAssigneeNames.length}명)</p>
                                              {stageAssigneeNames.map((name, i) => (
                                                <p key={i} className="py-0.5">{name}</p>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Status selector pill */}
                                  <div>
                                    <select
                                      value={stage.status}
                                      onChange={(e) => handleStageStatusChange(stage.id, p.id, e.target.value as StageStatus)}
                                      className={`text-[11px] font-bold rounded-full px-3 py-1 border-0 cursor-pointer appearance-none text-center ${STAGE_PILL_COLORS[stage.status] || STAGE_STATUS_COLORS[stage.status]}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="시작전">시작전</option>
                                      <option value="진행중">진행중</option>
                                      <option value="완료">완료</option>
                                      <option value="홀딩">홀딩</option>
                                    </select>
                                  </div>

                                  {/* Order */}
                                  <div className="text-center text-[11px] text-gray-400">
                                    {stage.stage_order}
                                  </div>

                                  {/* Deadline — inline editable */}
                                  <div className="text-center relative">
                                    {editingField?.stageId === stage.id && editingField.stageField === 'stage_deadline' ? (
                                      <div ref={editRef}>
                                        <input
                                          type="date"
                                          defaultValue={stage.deadline || ''}
                                          autoFocus
                                          onChange={async (e) => {
                                            if (e.target.value) {
                                              await updateStageDeadline(stage.id, e.target.value)
                                              toast('마감일이 변경되었습니다')
                                            }
                                            setEditingField(null)
                                          }}
                                          onBlur={() => setEditingField(null)}
                                          className="text-[11px] border border-blue-300 rounded px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        />
                                      </div>
                                    ) : (
                                      <span
                                        onClick={(e) => { e.stopPropagation(); setEditingField({ projectId: p.id, field: 'launch_date', stageId: stage.id, stageField: 'stage_deadline' }) }}
                                        className="text-[11px] text-gray-600 cursor-pointer hover:text-blue-600 hover:underline"
                                        title="클릭하여 마감일 변경"
                                      >
                                        {stage.deadline ? formatDateShort(stage.deadline) : <span className="text-gray-400">+ 설정</span>}
                                      </span>
                                    )}
                                  </div>

                                  {/* D-day */}
                                  <div className="flex justify-center">
                                    {dday ? (
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dday.className}`}>
                                        {dday.label}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-gray-300">-</span>
                                    )}
                                  </div>

                                  <div />
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                </div>

                {/* ── Add item button ──────────────────────────── */}
                <button
                  onClick={() => navigate('/admin/projects/new')}
                  className={`w-full flex items-center gap-2 px-6 py-2.5 text-sm ${group.color.text} hover:${group.color.header} transition-colors border-t border-gray-100`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="font-medium">아이템 추가</span>
                </button>

                {/* ── Group Summary Row ────────────────────────── */}
                <div className={`px-4 py-2.5 ${group.color.header} border-t border-gray-200 flex items-center gap-6 text-[11px]`}>
                  <span className={`font-semibold ${group.color.text}`}>요약</span>

                  {/* Average progress */}
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">평균 진행률</span>
                    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                        style={{ width: `${avgProgress}%` }}
                      />
                    </div>
                    <span className="font-bold text-gray-700">{avgProgress}%</span>
                  </div>

                  {/* Priority distribution mini-blocks */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">우선순위</span>
                    <div className="flex gap-0.5">
                      {priorityDist.urgent > 0 && (
                        <div className="flex items-center gap-0.5">
                          <div className="w-3 h-3 rounded-sm bg-rose-500" />
                          <span className="text-rose-600 font-bold">{priorityDist.urgent}</span>
                        </div>
                      )}
                      {priorityDist.high > 0 && (
                        <div className="flex items-center gap-0.5 ml-1">
                          <div className="w-3 h-3 rounded-sm bg-violet-500" />
                          <span className="text-violet-600 font-bold">{priorityDist.high}</span>
                        </div>
                      )}
                      {priorityDist.mid > 0 && (
                        <div className="flex items-center gap-0.5 ml-1">
                          <div className="w-3 h-3 rounded-sm bg-indigo-500" />
                          <span className="text-indigo-600 font-bold">{priorityDist.mid}</span>
                        </div>
                      )}
                      {priorityDist.low > 0 && (
                        <div className="flex items-center gap-0.5 ml-1">
                          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                          <span className="text-emerald-600 font-bold">{priorityDist.low}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Total tasks */}
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-gray-500">작업</span>
                    <span className="font-bold text-gray-700">{totalTasks}개</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ─── Bottom Widgets ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 주의 필요 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" /> 주의 필요
              <Badge variant="danger" className="text-[10px]">{delayedStages.length + overdueTasks.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {delayedStages.length === 0 && overdueTasks.length === 0 ? (
              <div className="text-center py-6 text-emerald-600 flex flex-col items-center gap-1">
                <CheckCircle className="h-8 w-8" />
                <p className="text-sm font-medium">지연 항목 없음</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {delayedStages.map((s) => {
                  const project = filteredProjects.find((pr) => pr.stages.some((st) => st.id === s.id))
                  const days = Math.abs(Math.ceil((new Date(s.deadline!).getTime() - Date.now()) / 86400000))
                  return (
                    <div key={s.id} className="flex items-center justify-between p-2.5 bg-red-50 rounded-lg text-sm border border-red-100">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        <div>
                          <span className="font-medium text-red-800 text-xs">{project?.project_name}</span>
                          <span className="text-red-500 text-[11px] ml-1">{s.stage_name}</span>
                        </div>
                      </div>
                      <Badge variant="danger" className="text-[10px]">D+{days}</Badge>
                    </div>
                  )
                })}
                {overdueTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2.5 bg-amber-50 rounded-lg text-sm border border-amber-100">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      <div>
                        <span className="font-medium text-amber-800 text-xs">{t.title}</span>
                        <span className="text-amber-500 text-[11px] ml-1">{getEmpName(t.assignee_id)}</span>
                      </div>
                    </div>
                    <Badge variant="warning" className="text-[10px]">
                      <Calendar className="h-3 w-3 mr-0.5" />
                      {t.due_date?.slice(5)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 담당자별 업무량 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-500" /> 담당자별 업무량
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assigneeWorkload.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">데이터 없음</p>
            ) : (
              <div className="space-y-2.5">
                {assigneeWorkload.map(([id, data]) => {
                  const totalLoad = data.projects + data.tasks
                  const maxLoad = Math.max(...assigneeWorkload.map(([, d]) => d.projects + d.tasks), 1)
                  const loadPercent = Math.round((totalLoad / maxLoad) * 100)
                  const isOverloaded = totalLoad >= 8 || data.overdue > 2

                  return (
                    <div key={id} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        isOverloaded ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {data.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-gray-800 truncate">{data.name}</span>
                          <div className="flex items-center gap-2 text-[10px] shrink-0">
                            <span className="text-blue-600">{data.projects}P</span>
                            <span className="text-gray-500">{data.tasks}T</span>
                            {data.overdue > 0 && <span className="text-red-600 font-bold">{data.overdue}지연</span>}
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOverloaded ? 'bg-red-500' : loadPercent >= 70 ? 'bg-amber-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${loadPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Slide Panel ─────────────────────────────────────────── */}
      {slidePanel && (
        <SlidePanel
          panel={slidePanel}
          onClose={() => setSlidePanel(null)}
          addUpdate={addUpdate}
          fetchUpdates={fetchUpdates}
        />
      )}
    </div>
  )
}
