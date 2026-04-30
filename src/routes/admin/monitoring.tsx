/**
 * 시스템 모니터링 대시보드 (admin/ceo 전용)
 *  - error_logs / health_checks / maintenance_tasks 통합 뷰
 */
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, AlertCircle, Activity, ListChecks, RefreshCw, CheckCircle, Sparkles, Brain } from 'lucide-react'
import { generateAIContentSafe } from '@/lib/ai-client'

interface ErrorLog {
  id: string
  error_hash: string
  error_type: string
  message: string | null
  stack: string | null
  route: string | null
  severity: 'info' | 'warning' | 'error' | 'critical'
  occurrence_count: number
  first_seen_at: string
  last_seen_at: string
  resolved_at: string | null
  user_role: string | null
  ai_analysis: { root_cause?: string; fix_proposal?: string; affected_modules?: string[] } | null
}

interface HealthCheck {
  id: string
  check_name: string
  status: 'pass' | 'fail' | 'warning'
  duration_ms: number | null
  details: Record<string, unknown> | null
  error_message: string | null
  ran_at: string
}

interface MaintenanceTask {
  id: string
  task_type: string
  title: string
  description: string | null
  related_table: string | null
  related_ids: unknown
  proposed_action: string | null
  proposed_sql: string | null
  detected_by: string | null
  severity: 'low' | 'normal' | 'high' | 'critical'
  status: 'pending' | 'approved' | 'rejected' | 'resolved' | 'dismissed'
  detected_at: string
}

const SEVERITY_COLORS: Record<string, string> = {
  info:     'bg-blue-50 text-blue-700 border-blue-200',
  warning:  'bg-amber-50 text-amber-700 border-amber-200',
  error:    'bg-red-50 text-red-700 border-red-200',
  critical: 'bg-red-100 text-red-900 border-red-400',
}

const HEALTH_COLORS: Record<string, 'success' | 'warning' | 'danger'> = {
  pass: 'success', warning: 'warning', fail: 'danger',
}

export default function MonitoringDashboard() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<ErrorLog[]>([])
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([])
  const [tasks, setTasks] = useState<MaintenanceTask[]>([])
  const [selected, setSelected] = useState<ErrorLog | null>(null)
  // Phase 3 AI 분석 — 조건부 return 위에 선언 (hooks 규칙)
  const [aiRunning, setAiRunning] = useState(false)

  // 시스템 모니터링은 시스템 관리자(admin) 전용 — CEO 도 접근 불가
  const canAccess = hasRole('admin')

  async function fetchAll() {
    setLoading(true)
    const [errRes, hcRes, mtRes] = await Promise.all([
      supabase.from('error_logs').select('*').order('last_seen_at', { ascending: false }).limit(100),
      supabase.from('health_checks').select('*').order('ran_at', { ascending: false }).limit(50),
      supabase.from('maintenance_tasks').select('*').eq('status', 'pending').order('severity').order('detected_at', { ascending: false }),
    ])
    setErrors((errRes.data || []) as ErrorLog[])
    setHealthChecks((hcRes.data || []) as HealthCheck[])
    setTasks((mtRes.data || []) as MaintenanceTask[])
    setLoading(false)
  }

  useEffect(() => {
    if (canAccess) fetchAll()
  }, [canAccess])

  if (!canAccess) {
    return <div className="p-8 text-center text-gray-400">접근 권한이 없습니다.</div>
  }
  if (loading) return <PageSpinner />

  const unresolved = errors.filter((e) => !e.resolved_at)
  const criticalCount = unresolved.filter((e) => e.severity === 'critical').length
  const errorCount = unresolved.filter((e) => e.severity === 'error').length
  const warningCount = unresolved.filter((e) => e.severity === 'warning').length

  const hcLatestPerCheck = new Map<string, HealthCheck>()
  for (const hc of healthChecks) {
    if (!hcLatestPerCheck.has(hc.check_name)) hcLatestPerCheck.set(hc.check_name, hc)
  }
  const hcLatest = Array.from(hcLatestPerCheck.values())
  const hcFailing = hcLatest.filter((h) => h.status !== 'pass').length

  // Phase 3 — AI 자동 진단 (선택된 에러에 대해)
  async function runAiAnalysis(err: ErrorLog) {
    setAiRunning(true)
    try {
      const prompt = `당신은 React + TypeScript + Supabase 기반 HR 플랫폼의 시니어 엔지니어입니다.
다음 에러의 원인과 해결 방안을 JSON 으로 답변하세요. 다른 텍스트 없이 JSON 만 출력하세요.

[에러 정보]
유형: ${err.error_type}
메시지: ${err.message}
경로: ${err.route}
사용자 역할: ${err.user_role || 'anon'}
발생 횟수: ${err.occurrence_count}
스택:
${err.stack || '(없음)'}

응답 형식:
{
  "root_cause": "원인 한 줄 설명",
  "fix_proposal": "구체적 해결안 (코드 위치 추정 포함)",
  "severity_recommendation": "info|warning|error|critical",
  "affected_modules": ["추정 모듈 경로 배열"]
}`

      const result = await generateAIContentSafe('error_analysis', prompt, { maxAttempts: 2 })
      if (!result.success) { toast('AI 분석 실패: ' + result.error, 'error'); return }

      const jsonMatch = result.content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) { toast('AI 응답 파싱 실패', 'error'); return }

      let parsed: Record<string, unknown>
      try { parsed = JSON.parse(jsonMatch[0]) }
      catch { toast('AI JSON 파싱 실패', 'error'); return }

      await supabase.from('error_logs').update({
        ai_analysis: parsed,
        ai_analyzed_at: new Date().toISOString(),
      }).eq('id', err.id)

      toast('AI 분석이 저장되었습니다.', 'success')
      fetchAll()
      setSelected({ ...err, ai_analysis: parsed as ErrorLog['ai_analysis'] })
    } finally {
      setAiRunning(false)
    }
  }

  async function markResolved(id: string) {
    const { error } = await supabase
      .from('error_logs')
      .update({ resolved_at: new Date().toISOString(), resolution_note: '관리자 검토 후 해결 처리' })
      .eq('id', id)
    if (error) { toast('처리 실패: ' + error.message, 'error'); return }
    toast('해결 처리되었습니다.', 'success')
    fetchAll()
  }

  async function reviewTask(taskId: string, action: 'approved' | 'rejected' | 'dismissed') {
    const { error } = await supabase
      .from('maintenance_tasks')
      .update({ status: action, reviewed_at: new Date().toISOString() })
      .eq('id', taskId)
    if (error) { toast('처리 실패: ' + error.message, 'error'); return }
    toast('처리되었습니다.', 'success')
    fetchAll()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">시스템 모니터링</h1>
          <p className="text-sm text-gray-500 mt-0.5">자동 수집된 에러 / 헬스체크 결과 / 관리자 검토 큐</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={async () => {
            const { error } = await supabase.rpc('run_all_health_checks')
            if (error) toast('헬스체크 실패: ' + error.message, 'error')
            else { toast('헬스체크 완료', 'success'); fetchAll() }
          }}>
            <Activity className="h-4 w-4 mr-1" /> 헬스체크 실행
          </Button>
          <Button variant="outline" onClick={fetchAll}>
            <RefreshCw className="h-4 w-4 mr-1" /> 새로고침
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">미해결 Critical</p>
            <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">미해결 Error</p>
            <p className="text-2xl font-bold text-orange-600">{errorCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">Warning</p>
            <p className="text-2xl font-bold text-amber-600">{warningCount}</p>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${hcFailing > 0 ? 'border-l-red-500' : 'border-l-emerald-500'}`}>
          <CardContent className="py-3 px-4">
            <p className="text-[11px] text-gray-500">헬스체크 실패</p>
            <p className={`text-2xl font-bold ${hcFailing > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {hcFailing}/{hcLatest.length || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 미해결 에러 목록 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" /> 미해결 에러 ({unresolved.length}건)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {unresolved.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">미해결 에러가 없습니다 🎉</p>
          ) : (
            <div className="space-y-2">
              {unresolved.slice(0, 20).map((e) => (
                <div
                  key={e.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${SEVERITY_COLORS[e.severity]} cursor-pointer hover:shadow-sm transition-shadow`}
                  onClick={() => setSelected(e)}
                >
                  <Badge variant={e.severity === 'critical' ? 'danger' : e.severity === 'error' ? 'danger' : 'warning'} className="text-[10px] shrink-0">
                    {e.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{e.message || '(no message)'}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {e.error_type} · {e.route || '/'} · {e.user_role || 'anon'} · {e.occurrence_count}회 발생
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0 mt-1">
                    {new Date(e.last_seen_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 헬스체크 결과 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" /> 헬스체크 ({hcLatest.length}건)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hcLatest.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">아직 실행된 헬스체크가 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {hcLatest.map((h) => (
                <div key={h.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md">
                  <Badge variant={HEALTH_COLORS[h.status]} className="text-[10px] shrink-0">
                    {h.status}
                  </Badge>
                  <span className="text-sm font-medium text-gray-800 flex-1">{h.check_name}</span>
                  {h.error_message && <span className="text-[11px] text-red-600 truncate max-w-md">{h.error_message}</span>}
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {new Date(h.ran_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 관리자 검토 큐 (Phase 4 변형) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-violet-500" /> 관리자 검토 대기 ({tasks.length}건)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">검토 대기 항목이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={t.severity === 'critical' || t.severity === 'high' ? 'danger' : 'warning'} className="text-[10px]">
                          {t.severity}
                        </Badge>
                        <span className="text-sm font-bold text-gray-900">{t.title}</span>
                        {t.detected_by && <span className="text-[10px] text-gray-400">({t.detected_by})</span>}
                      </div>
                      {t.description && <p className="text-xs text-gray-600 mt-1">{t.description}</p>}
                      {t.proposed_action && (
                        <p className="text-xs text-violet-700 mt-1.5 bg-violet-50 px-2 py-1 rounded">
                          💡 추천 조치: {t.proposed_action}
                        </p>
                      )}
                      {t.proposed_sql && (
                        <pre className="text-[11px] text-gray-700 mt-1.5 bg-gray-50 px-2 py-1.5 rounded overflow-x-auto">
                          {t.proposed_sql}
                        </pre>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => reviewTask(t.id, 'dismissed')}>
                      해당없음
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reviewTask(t.id, 'rejected')}>
                      반려
                    </Button>
                    <Button size="sm" onClick={() => reviewTask(t.id, 'approved')}>
                      승인 (수동 적용)
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 에러 상세 모달 (간단 inline) */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <h3 className="text-lg font-bold">에러 상세</h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">메시지</p>
                <p className="text-sm font-medium text-gray-900 break-all">{selected.message}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-gray-500">Route:</span> <span className="font-mono">{selected.route || '-'}</span></div>
                <div><span className="text-xs text-gray-500">Type:</span> {selected.error_type}</div>
                <div><span className="text-xs text-gray-500">발생 횟수:</span> {selected.occurrence_count}</div>
                <div><span className="text-xs text-gray-500">User Role:</span> {selected.user_role || '-'}</div>
                <div><span className="text-xs text-gray-500">최초:</span> {new Date(selected.first_seen_at).toLocaleString('ko-KR')}</div>
                <div><span className="text-xs text-gray-500">최근:</span> {new Date(selected.last_seen_at).toLocaleString('ko-KR')}</div>
              </div>
              {selected.ai_analysis && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
                  <p className="text-xs font-bold text-violet-700 mb-1.5 flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> AI 진단</p>
                  {selected.ai_analysis.root_cause && (
                    <p className="text-xs text-violet-900 mb-1"><strong>원인:</strong> {selected.ai_analysis.root_cause}</p>
                  )}
                  {selected.ai_analysis.fix_proposal && (
                    <p className="text-xs text-violet-900"><strong>해결안:</strong> {selected.ai_analysis.fix_proposal}</p>
                  )}
                </div>
              )}
              {selected.stack && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Stack</p>
                  <pre className="text-[10px] text-gray-700 bg-gray-50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                    {selected.stack}
                  </pre>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                {!selected.ai_analysis && (
                  <Button variant="outline" onClick={() => runAiAnalysis(selected)} disabled={aiRunning}>
                    <Brain className="h-4 w-4 mr-1" />
                    {aiRunning ? 'AI 분석 중...' : 'AI 분석'}
                  </Button>
                )}
                <Button onClick={() => markResolved(selected.id)}>
                  <CheckCircle className="h-4 w-4 mr-1" /> 해결 처리
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
