import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { PageSpinner } from '@/components/ui/Spinner'
import { Dialog } from '@/components/ui/Dialog'
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

    // imported_work_data 테이블에서 소스별 카운트
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

    // 직원 수 (AI 분석 기준)
    const { count: empCount } = await supabase
      .from('employees')
      .select('id', { count: 'exact' })
      .eq('is_active', true)

    setAiAnalysisStats({
      total: empCount ?? 0,
      completed: 0, // AI 분석 완료 수는 별도 테이블에서 추적
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

          return (
            <Card key={source.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {source.icon}
                    <CardTitle className="text-base">{source.name}</CardTitle>
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowImportDialog(source.id)}
                  className="w-full"
                >
                  <FileJson className="h-4 w-4" />
                  JSON 데이터 임포트
                </Button>
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

      {/* 임포트 다이얼로그 */}
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
    </div>
  )
}
