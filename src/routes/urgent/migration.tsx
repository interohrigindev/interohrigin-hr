import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { Dialog } from '@/components/ui/Dialog'
import { useIntegrationSettings } from '@/hooks/useIntegrationSettings'
import {
  verifySlackToken,
  fetchSlackChannels,
  fetchSlackMessages,
  verifyNotionToken,
  fetchNotionDatabases,
  fetchNotionPages,
  type SlackChannel,
  type SlackMessage,
  type NotionDatabase,
  type NotionPage,
} from '@/lib/integration-client'
import {
  Database,
  Upload,
  FileJson,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  FileText,
  Briefcase,
  Sparkles,
  Settings,
  RefreshCw,
  Key,
  CheckCircle,
  XCircle,
  Trash2,
  Link2,
  Loader2,
} from 'lucide-react'

// 데이터 소스 타입
interface DataSource {
  id: string
  name: string
  icon: React.ReactNode
  status: 'pending' | 'in_progress' | 'completed' | 'error'
  importedCount: number
  totalEstimate: number | null
}

interface SyncProgress {
  current: number
  total: number
  status: string
  importedCount: number
}

export default function DataMigration() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [sources, setSources] = useState<DataSource[]>([
    {
      id: 'slack',
      name: 'Slack (슬랙)',
      icon: <MessageSquare className="h-5 w-5 text-purple-500" />,
      status: 'pending',
      importedCount: 0,
      totalEstimate: null,
    },
    {
      id: 'notion',
      name: 'Notion (노션)',
      icon: <FileText className="h-5 w-5 text-gray-700" />,
      status: 'pending',
      importedCount: 0,
      totalEstimate: null,
    },
    {
      id: 'naver_works',
      name: 'Naver Works (네이버 웍스)',
      icon: <Briefcase className="h-5 w-5 text-green-600" />,
      status: 'pending',
      importedCount: 0,
      totalEstimate: null,
    },
  ])

  const [showImportDialog, setShowImportDialog] = useState<string | null>(null)
  const [importData, setImportData] = useState('')
  const [importing, setImporting] = useState(false)

  // 연동 설정
  const { settings: integrationSettings, saveSettings, deleteSettings, updateLastSynced } = useIntegrationSettings()

  // 다이얼로그 제어
  const [showSettingsDialog, setShowSettingsDialog] = useState<string | null>(null)
  const [showSyncDialog, setShowSyncDialog] = useState<string | null>(null)

  // API 설정 폼
  const [tokenInput, setTokenInput] = useState('')
  const [tokenValidating, setTokenValidating] = useState(false)
  const [tokenValidation, setTokenValidation] = useState<{ ok: boolean; info?: string; error?: string } | null>(null)
  const [tokenSaving, setTokenSaving] = useState(false)

  // Slack 동기화
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([])
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set())
  const [slackDateFrom, setSlackDateFrom] = useState('')
  const [slackDateTo, setSlackDateTo] = useState('')
  const [channelsLoading, setChannelsLoading] = useState(false)

  // Notion 동기화
  const [notionDatabases, setNotionDatabases] = useState<NotionDatabase[]>([])
  const [selectedDatabases, setSelectedDatabases] = useState<Set<string>>(new Set())
  const [databasesLoading, setDatabasesLoading] = useState(false)

  // 동기화 상태
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({ current: 0, total: 0, status: '', importedCount: 0 })

  // AI 분석 현황
  const [aiAnalysisStats, setAiAnalysisStats] = useState({
    total: 0,
    completed: 0,
  })

  useEffect(() => {
    fetchStatus()
  }, [])

  async function fetchStatus() {
    setLoading(true)

    const { data } = await supabase
      .from('imported_work_data')
      .select('source')

    if (data) {
      const counts: Record<string, number> = {}
      data.forEach((d: { source: string }) => {
        counts[d.source] = (counts[d.source] || 0) + 1
      })

      setSources((prev) =>
        prev.map((s) => ({
          ...s,
          importedCount: counts[s.id] || 0,
          status: counts[s.id] ? 'completed' : s.status,
        }))
      )
    }

    const { count: empCount } = await supabase
      .from('employees')
      .select('id', { count: 'exact' })
      .eq('is_active', true)

    setAiAnalysisStats({
      total: empCount ?? 0,
      completed: 0,
    })

    setLoading(false)
  }

  // JSON 데이터 수동 임포트
  async function handleImport(source: string) {
    setImporting(true)
    try {
      const records = JSON.parse(importData)
      if (!Array.isArray(records)) throw new Error('배열 형식의 JSON이 필요합니다')

      const insertData = records.map((r: {
        employee_name?: string
        date?: string
        content_type?: string
        content?: string
        metadata?: Record<string, unknown>
      }) => ({
        employee_name: r.employee_name || '',
        source,
        content_type: r.content_type || 'daily_report',
        content: r.content || '',
        original_date: r.date || new Date().toISOString(),
        metadata: r.metadata || {},
        imported_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('imported_work_data')
        .insert(insertData)

      if (error) throw error

      toast(`${insertData.length}건이 임포트되었습니다`)
      setShowImportDialog(null)
      setImportData('')
      fetchStatus()
    } catch (err) {
      toast(`임포트 실패: ${err instanceof Error ? err.message : '형식 오류'}`, 'error')
    }
    setImporting(false)
  }

  // ─── API 토큰 검증 ────────────────────────────────────

  async function handleTokenVerify() {
    if (!tokenInput.trim() || !showSettingsDialog) return
    setTokenValidating(true)
    setTokenValidation(null)

    try {
      if (showSettingsDialog === 'slack') {
        const result = await verifySlackToken(tokenInput.trim())
        setTokenValidation({ ok: true, info: `워크스페이스: ${result.team}` })
      } else if (showSettingsDialog === 'notion') {
        const result = await verifyNotionToken(tokenInput.trim())
        setTokenValidation({ ok: true, info: `워크스페이스: ${result.workspace_name}` })
      }
    } catch (err: any) {
      setTokenValidation({ ok: false, error: err.message })
    }
    setTokenValidating(false)
  }

  async function handleTokenSave() {
    if (!tokenInput.trim() || !showSettingsDialog || !tokenValidation?.ok) return
    setTokenSaving(true)

    try {
      const provider = showSettingsDialog as 'slack' | 'notion' | 'naver_works'
      let workspaceName: string | undefined
      let workspaceId: string | undefined

      if (provider === 'slack') {
        const result = await verifySlackToken(tokenInput.trim())
        workspaceName = result.team
        workspaceId = result.team_id
      } else if (provider === 'notion') {
        const result = await verifyNotionToken(tokenInput.trim())
        workspaceName = result.workspace_name
      }

      await saveSettings(provider, tokenInput.trim(), workspaceName, workspaceId)
      toast('연동 설정이 저장되었습니다')
      setShowSettingsDialog(null)
      setTokenInput('')
      setTokenValidation(null)
    } catch (err: any) {
      toast('저장 실패: ' + err.message, 'error')
    }
    setTokenSaving(false)
  }

  async function handleTokenDelete(provider: string) {
    const setting = integrationSettings[provider]
    if (!setting) return
    if (!confirm('연동 설정을 삭제하시겠습니까?')) return

    try {
      await deleteSettings(setting.id, provider)
      toast('연동 설정이 삭제되었습니다')
    } catch (err: any) {
      toast('삭제 실패: ' + err.message, 'error')
    }
  }

  // ─── Slack 동기화 ─────────────────────────────────────

  async function openSlackSync() {
    const setting = integrationSettings.slack
    if (!setting) return

    setShowSyncDialog('slack')
    setChannelsLoading(true)
    setSelectedChannels(new Set())
    setSyncProgress({ current: 0, total: 0, status: '', importedCount: 0 })

    try {
      const channels = await fetchSlackChannels(setting.access_token)
      setSlackChannels(channels)
    } catch (err: any) {
      toast('채널 목록 조회 실패: ' + err.message, 'error')
      setSlackChannels([])
    }
    setChannelsLoading(false)
  }

  async function handleSlackSync() {
    const setting = integrationSettings.slack
    if (!setting || selectedChannels.size === 0) return

    setSyncing(true)
    const channelIds = Array.from(selectedChannels)
    let totalImported = 0

    for (let i = 0; i < channelIds.length; i++) {
      const chId = channelIds[i]
      const chName = slackChannels.find((c) => c.id === chId)?.name || chId
      setSyncProgress({ current: i + 1, total: channelIds.length, status: `#${chName} 동기화 중...`, importedCount: totalImported })

      try {
        const oldest = slackDateFrom ? (new Date(slackDateFrom).getTime() / 1000).toString() : undefined
        const latest = slackDateTo ? (new Date(slackDateTo + 'T23:59:59').getTime() / 1000).toString() : undefined

        const messages = await fetchSlackMessages(setting.access_token, chId, oldest, latest)

        if (messages.length > 0) {
          const insertData = messages.map((msg: SlackMessage) => ({
            employee_name: msg.user_name,
            source: 'slack',
            content_type: 'message',
            content: msg.text,
            original_date: msg.date,
            metadata: {
              channel_id: chId,
              channel_name: chName,
              user_id: msg.user,
              ts: msg.ts,
              thread_ts: msg.thread_ts,
            },
            imported_at: new Date().toISOString(),
          }))

          const { error } = await supabase
            .from('imported_work_data')
            .insert(insertData)

          if (error) throw error
          totalImported += messages.length
        }
      } catch (err: any) {
        toast(`#${chName} 동기화 실패: ${err.message}`, 'error')
      }
    }

    setSyncProgress({ current: channelIds.length, total: channelIds.length, status: '완료', importedCount: totalImported })
    await updateLastSynced(setting.id, 'slack')
    toast(`Slack 동기화 완료: ${totalImported}건 임포트`)
    setSyncing(false)
    fetchStatus()
  }

  // ─── Notion 동기화 ────────────────────────────────────

  async function openNotionSync() {
    const setting = integrationSettings.notion
    if (!setting) return

    setShowSyncDialog('notion')
    setDatabasesLoading(true)
    setSelectedDatabases(new Set())
    setSyncProgress({ current: 0, total: 0, status: '', importedCount: 0 })

    try {
      const dbs = await fetchNotionDatabases(setting.access_token)
      setNotionDatabases(dbs)
    } catch (err: any) {
      toast('DB 목록 조회 실패: ' + err.message, 'error')
      setNotionDatabases([])
    }
    setDatabasesLoading(false)
  }

  async function handleNotionSync() {
    const setting = integrationSettings.notion
    if (!setting || selectedDatabases.size === 0) return

    setSyncing(true)
    const dbIds = Array.from(selectedDatabases)
    let totalImported = 0

    for (let i = 0; i < dbIds.length; i++) {
      const dbId = dbIds[i]
      const dbTitle = notionDatabases.find((d) => d.id === dbId)?.title || dbId
      setSyncProgress({ current: i + 1, total: dbIds.length, status: `"${dbTitle}" 동기화 중...`, importedCount: totalImported })

      try {
        const pages = await fetchNotionPages(setting.access_token, dbId)

        if (pages.length > 0) {
          const insertData = pages.map((pg: NotionPage) => {
            // 제목에서 이름 추출 시도 (이름 패턴 매칭)
            const title = pg.title || ''
            const nameMatch = title.match(/^[가-힣]{2,4}/)
            const employeeName = nameMatch?.[0] || title

            // properties에서 내용 생성
            const contentParts: string[] = []
            for (const [key, value] of Object.entries(pg.properties)) {
              if (key.startsWith('_') || value === null || value === undefined) continue
              if (typeof value === 'string' && value) contentParts.push(`${key}: ${value}`)
              else if (Array.isArray(value) && value.length > 0) contentParts.push(`${key}: ${value.join(', ')}`)
            }

            // date property 찾기
            const dateValue = pg.properties.date || pg.properties.Date || pg.properties['날짜'] || pg.created_time

            return {
              employee_name: employeeName,
              source: 'notion',
              content_type: 'document',
              content: contentParts.join('\n') || title,
              original_date: typeof dateValue === 'string' ? dateValue : pg.created_time,
              metadata: {
                database_id: dbId,
                database_title: dbTitle,
                page_id: pg.id,
                page_url: pg.url,
                properties: pg.properties,
              },
              imported_at: new Date().toISOString(),
            }
          })

          const { error } = await supabase
            .from('imported_work_data')
            .insert(insertData)

          if (error) throw error
          totalImported += pages.length
        }
      } catch (err: any) {
        toast(`"${dbTitle}" 동기화 실패: ${err.message}`, 'error')
      }
    }

    setSyncProgress({ current: dbIds.length, total: dbIds.length, status: '완료', importedCount: totalImported })
    await updateLastSynced(setting.id, 'notion')
    toast(`Notion 동기화 완료: ${totalImported}건 임포트`)
    setSyncing(false)
    fetchStatus()
  }

  // ─── 유틸 ─────────────────────────────────────────────

  function maskToken(token: string): string {
    if (token.length <= 8) return '••••••••'
    return token.slice(0, 4) + '••••' + token.slice(-4)
  }

  function toggleSelection(set: Set<string>, id: string): Set<string> {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  if (loading) return <PageSpinner />

  const totalImported = sources.reduce((sum, s) => sum + s.importedCount, 0)

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-7 w-7 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">데이터 마이그레이션</h1>
            <p className="text-sm text-gray-500">슬랙/노션/네이버웍스 데이터 가져오기</p>
          </div>
        </div>
      </div>

      {/* 전체 현황 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <Database className="h-5 w-5 text-brand-500" />
            <div>
              <p className="text-xs text-gray-500">총 임포트</p>
              <p className="text-xl font-bold text-gray-900">{totalImported}건</p>
            </div>
          </CardContent>
        </Card>
        {sources.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-center gap-3 py-3">
              {s.icon}
              <div>
                <p className="text-xs text-gray-500">{s.name}</p>
                <p className="text-xl font-bold text-gray-900">{s.importedCount}건</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 소스별 카드 */}
      <div className="grid gap-4 lg:grid-cols-3">
        {sources.map((source) => {
          const statusConfig = {
            pending: { label: '대기', variant: 'default' as const, icon: <Clock className="h-4 w-4" /> },
            in_progress: { label: '진행중', variant: 'warning' as const, icon: <Upload className="h-4 w-4 animate-pulse" /> },
            completed: { label: '완료', variant: 'success' as const, icon: <CheckCircle2 className="h-4 w-4" /> },
            error: { label: '오류', variant: 'danger' as const, icon: <AlertCircle className="h-4 w-4" /> },
          }[source.status]

          const isConnected = !!integrationSettings[source.id]
          const isNaverWorks = source.id === 'naver_works'

          return (
            <Card key={source.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {source.icon}
                    <CardTitle className="text-base">{source.name}</CardTitle>
                    {!isNaverWorks && (
                      <Badge variant={isConnected ? 'success' : 'default'}>
                        <Link2 className="h-3 w-3" />
                        <span className="ml-1">{isConnected ? '연결됨' : '미연결'}</span>
                      </Badge>
                    )}
                  </div>
                  <Badge variant={statusConfig.variant}>
                    {statusConfig.icon}
                    <span className="ml-1">{statusConfig.label}</span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>임포트 건수</span>
                    <span className="font-medium text-gray-900">{source.importedCount}건</span>
                  </div>
                  {isConnected && integrationSettings[source.id]?.last_synced_at && (
                    <div className="flex justify-between">
                      <span>마지막 동기화</span>
                      <span className="text-xs text-gray-500">
                        {new Date(integrationSettings[source.id]!.last_synced_at!).toLocaleString('ko-KR')}
                      </span>
                    </div>
                  )}
                  {source.totalEstimate && (
                    <div className="flex justify-between">
                      <span>예상 총건수</span>
                      <span>{source.totalEstimate}건</span>
                    </div>
                  )}
                  {source.importedCount > 0 && source.totalEstimate && (
                    <div className="h-2 rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full bg-brand-500 transition-all"
                        style={{ width: `${Math.min((source.importedCount / source.totalEstimate) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <div className="flex w-full gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowSettingsDialog(source.id)
                      setTokenInput('')
                      setTokenValidation(null)
                    }}
                    disabled={isNaverWorks}
                    title={isNaverWorks ? '준비 중' : 'API 설정'}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (source.id === 'slack') openSlackSync()
                      else if (source.id === 'notion') openNotionSync()
                    }}
                    disabled={isNaverWorks || !isConnected}
                    title={isNaverWorks ? '준비 중' : !isConnected ? 'API 설정 필요' : '자동 동기화'}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowImportDialog(source.id)}
                    className="flex-1"
                  >
                    <FileJson className="h-4 w-4" />
                    JSON 임포트
                  </Button>
                </div>
                {isNaverWorks && (
                  <p className="mt-2 text-center text-xs text-gray-400">API 연동 준비 중</p>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>

      {/* AI 분석 현황 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <CardTitle>AI 업무 분석 현황</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-gray-600">분석 진행률</span>
                <span className="font-medium">
                  {aiAnalysisStats.completed} / {aiAnalysisStats.total}명
                </span>
              </div>
              <div className="h-3 rounded-full bg-gray-200">
                <div
                  className="h-3 rounded-full bg-amber-500 transition-all"
                  style={{
                    width: aiAnalysisStats.total > 0
                      ? `${(aiAnalysisStats.completed / aiAnalysisStats.total) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
            <Button variant="outline" size="sm" disabled>
              <Sparkles className="h-4 w-4" />
              AI 분석 시작
            </Button>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            데이터 임포트 완료 후 AI가 직원별 업무 성향, 성장 추이, 주요 업무 분야를 자동 분석합니다.
          </p>
        </CardContent>
      </Card>

      {/* ─── JSON 임포트 다이얼로그 ──────────────────────── */}
      <Dialog
        open={!!showImportDialog}
        onClose={() => { setShowImportDialog(null); setImportData('') }}
        title={`${sources.find((s) => s.id === showImportDialog)?.name ?? ''} 데이터 임포트`}
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <p className="font-medium mb-1">JSON 형식 예시:</p>
            <pre className="overflow-x-auto whitespace-pre text-xs">
{`[
  {
    "employee_name": "김영석",
    "date": "2025-03-15",
    "content_type": "daily_report",
    "content": "오늘 S/S 컬렉션 기획안 작성 완료..."
  }
]`}
            </pre>
          </div>

          <Textarea
            label="JSON 데이터"
            value={importData}
            onChange={(e) => setImportData(e.target.value)}
            placeholder="JSON 배열을 붙여넣으세요..."
            rows={10}
          />

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setShowImportDialog(null); setImportData('') }}>
              취소
            </Button>
            <Button
              onClick={() => showImportDialog && handleImport(showImportDialog)}
              disabled={importing || !importData.trim()}
            >
              <Upload className="h-4 w-4" />
              {importing ? '임포트 중...' : '임포트'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ─── API 설정 다이얼로그 ─────────────────────────── */}
      <Dialog
        open={!!showSettingsDialog}
        onClose={() => { setShowSettingsDialog(null); setTokenInput(''); setTokenValidation(null) }}
        title={`${sources.find((s) => s.id === showSettingsDialog)?.name ?? ''} API 설정`}
        className="max-w-lg"
      >
        <div className="space-y-4">
          {/* 안내 */}
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1.5">
            {showSettingsDialog === 'slack' ? (
              <>
                <p className="font-medium">Slack Bot Token 발급 방법:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>api.slack.com/apps 에서 App 생성</li>
                  <li>OAuth & Permissions에서 Bot Token Scopes 추가</li>
                  <li>필요 권한: <code className="bg-gray-200 px-1 rounded">channels:read</code>, <code className="bg-gray-200 px-1 rounded">channels:history</code>, <code className="bg-gray-200 px-1 rounded">users:read</code></li>
                  <li>Install to Workspace 후 Bot User OAuth Token 복사</li>
                </ol>
              </>
            ) : showSettingsDialog === 'notion' ? (
              <>
                <p className="font-medium">Notion Integration Token 발급 방법:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>notion.so/my-integrations 에서 Integration 생성</li>
                  <li>Internal Integration Token 복사</li>
                  <li>연동할 페이지/DB에서 "연결" → 생성한 Integration 추가</li>
                </ol>
              </>
            ) : null}
          </div>

          {/* 기존 설정 표시 */}
          {showSettingsDialog && integrationSettings[showSettingsDialog] && (
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-800">연결됨</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-emerald-700">
                  <span>{integrationSettings[showSettingsDialog]!.workspace_name}</span>
                  <span className="text-emerald-400">|</span>
                  <span>{maskToken(integrationSettings[showSettingsDialog]!.access_token)}</span>
                </div>
              </div>
              <button
                onClick={() => handleTokenDelete(showSettingsDialog)}
                className="rounded p-1.5 text-emerald-400 hover:bg-red-50 hover:text-red-600"
                title="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* 새 토큰 입력 */}
          <div>
            <Input
              id="integration-token"
              label={showSettingsDialog === 'slack' ? 'Bot User OAuth Token' : 'Internal Integration Token'}
              type="password"
              value={tokenInput}
              onChange={(e) => { setTokenInput(e.target.value); setTokenValidation(null) }}
              placeholder={showSettingsDialog === 'slack' ? 'xoxb-...' : 'ntn_...'}
            />
            {tokenValidation && (
              <div className={`mt-1.5 flex items-center gap-1.5 text-xs ${tokenValidation.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                {tokenValidation.ok ? (
                  <><CheckCircle className="h-3.5 w-3.5" /> {tokenValidation.info}</>
                ) : (
                  <><XCircle className="h-3.5 w-3.5" /> {tokenValidation.error}</>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleTokenVerify} disabled={tokenValidating || !tokenInput.trim()}>
              <Key className="h-3.5 w-3.5 mr-1" />
              {tokenValidating ? '검증 중...' : '토큰 검증'}
            </Button>
            <Button onClick={handleTokenSave} disabled={tokenSaving || !tokenValidation?.ok}>
              {tokenSaving ? '저장 중...' : '저장 및 활성화'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ─── Slack 동기화 다이얼로그 ─────────────────────── */}
      <Dialog
        open={showSyncDialog === 'slack'}
        onClose={() => { if (!syncing) { setShowSyncDialog(null); setSlackChannels([]); setSelectedChannels(new Set()) } }}
        title="Slack 데이터 동기화"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          {channelsLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              채널 목록 조회 중...
            </div>
          ) : slackChannels.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-sm">
              조회된 채널이 없습니다. Bot이 채널에 초대되어 있는지 확인하세요.
            </div>
          ) : (
            <>
              {/* 채널 선택 */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">채널 선택</label>
                  <button
                    className="text-xs text-brand-600 hover:underline"
                    onClick={() => {
                      if (selectedChannels.size === slackChannels.length) setSelectedChannels(new Set())
                      else setSelectedChannels(new Set(slackChannels.map((c) => c.id)))
                    }}
                  >
                    {selectedChannels.size === slackChannels.length ? '전체 해제' : '전체 선택'}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {slackChannels.map((ch) => (
                    <label key={ch.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedChannels.has(ch.id)}
                        onChange={() => setSelectedChannels(toggleSelection(selectedChannels, ch.id))}
                        className="rounded border-gray-300"
                        disabled={syncing}
                      />
                      <span className="text-sm text-gray-900">#{ch.name}</span>
                      {ch.is_private && <Badge variant="default">비공개</Badge>}
                      <span className="ml-auto text-xs text-gray-400">{ch.num_members}명</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 날짜 범위 */}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="slack-date-from"
                  label="시작일 (선택)"
                  type="date"
                  value={slackDateFrom}
                  onChange={(e) => setSlackDateFrom(e.target.value)}
                  disabled={syncing}
                />
                <Input
                  id="slack-date-to"
                  label="종료일 (선택)"
                  type="date"
                  value={slackDateTo}
                  onChange={(e) => setSlackDateTo(e.target.value)}
                  disabled={syncing}
                />
              </div>
            </>
          )}

          {/* 진행률 */}
          {syncing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{syncProgress.status}</span>
                <span className="font-medium">{syncProgress.current} / {syncProgress.total}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-purple-500 transition-all"
                  style={{ width: syncProgress.total > 0 ? `${(syncProgress.current / syncProgress.total) * 100}%` : '0%' }}
                />
              </div>
              {syncProgress.importedCount > 0 && (
                <p className="text-xs text-gray-500">{syncProgress.importedCount}건 임포트됨</p>
              )}
            </div>
          )}

          {/* 완료 결과 */}
          {!syncing && syncProgress.status === '완료' && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="inline h-4 w-4 mr-1" />
              동기화 완료: {syncProgress.importedCount}건 임포트
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setShowSyncDialog(null); setSlackChannels([]); setSelectedChannels(new Set()) }} disabled={syncing}>
              {syncProgress.status === '완료' ? '닫기' : '취소'}
            </Button>
            {syncProgress.status !== '완료' && (
              <Button onClick={handleSlackSync} disabled={syncing || selectedChannels.size === 0}>
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? '동기화 중...' : `동기화 시작 (${selectedChannels.size}개 채널)`}
              </Button>
            )}
          </div>
        </div>
      </Dialog>

      {/* ─── Notion 동기화 다이얼로그 ────────────────────── */}
      <Dialog
        open={showSyncDialog === 'notion'}
        onClose={() => { if (!syncing) { setShowSyncDialog(null); setNotionDatabases([]); setSelectedDatabases(new Set()) } }}
        title="Notion 데이터 동기화"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          {databasesLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              데이터베이스 목록 조회 중...
            </div>
          ) : notionDatabases.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-sm">
              조회된 데이터베이스가 없습니다. Integration에 페이지 접근 권한을 추가하세요.
            </div>
          ) : (
            <>
              {/* DB 선택 */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">데이터베이스 선택</label>
                  <button
                    className="text-xs text-brand-600 hover:underline"
                    onClick={() => {
                      if (selectedDatabases.size === notionDatabases.length) setSelectedDatabases(new Set())
                      else setSelectedDatabases(new Set(notionDatabases.map((d) => d.id)))
                    }}
                  >
                    {selectedDatabases.size === notionDatabases.length ? '전체 해제' : '전체 선택'}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {notionDatabases.map((db) => (
                    <label key={db.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDatabases.has(db.id)}
                        onChange={() => setSelectedDatabases(toggleSelection(selectedDatabases, db.id))}
                        className="rounded border-gray-300"
                        disabled={syncing}
                      />
                      <span className="text-sm text-gray-900">
                        {db.icon && <span className="mr-1">{db.icon}</span>}
                        {db.title || '(제목 없음)'}
                      </span>
                      <span className="ml-auto text-xs text-gray-400">
                        {new Date(db.last_edited).toLocaleDateString('ko-KR')}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 진행률 */}
          {syncing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{syncProgress.status}</span>
                <span className="font-medium">{syncProgress.current} / {syncProgress.total}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-gray-700 transition-all"
                  style={{ width: syncProgress.total > 0 ? `${(syncProgress.current / syncProgress.total) * 100}%` : '0%' }}
                />
              </div>
              {syncProgress.importedCount > 0 && (
                <p className="text-xs text-gray-500">{syncProgress.importedCount}건 임포트됨</p>
              )}
            </div>
          )}

          {/* 완료 결과 */}
          {!syncing && syncProgress.status === '완료' && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="inline h-4 w-4 mr-1" />
              동기화 완료: {syncProgress.importedCount}건 임포트
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setShowSyncDialog(null); setNotionDatabases([]); setSelectedDatabases(new Set()) }} disabled={syncing}>
              {syncProgress.status === '완료' ? '닫기' : '취소'}
            </Button>
            {syncProgress.status !== '완료' && (
              <Button onClick={handleNotionSync} disabled={syncing || selectedDatabases.size === 0}>
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? '동기화 중...' : `동기화 시작 (${selectedDatabases.size}개 DB)`}
              </Button>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  )
}
