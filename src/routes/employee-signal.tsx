import { useState, useEffect } from 'react'
import {
  Users, ChevronDown, ChevronUp,
  Search, RefreshCw, Sparkles, Loader2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature } from '@/lib/ai-client'

// ─── 신호등 설정 ────────────────────────────────────────────────
type SignalGrade = 'green' | 'yellow' | 'red' | 'black'

const SIGNAL_CONFIG: Record<SignalGrade, { label: string; icon: string; color: string; bg: string; text: string; border: string }> = {
  green: { label: '우수', icon: '🟢', color: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  yellow: { label: '보통', icon: '🟡', color: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  red: { label: '주의', icon: '🔴', color: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  black: { label: '위험', icon: '⚫', color: 'bg-gray-800', bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
}

interface EmployeeSignal {
  id: string
  name: string
  role: string
  position: string | null
  department_id: string | null
  department_name: string | null
  signal: SignalGrade
  avgEvalScore: number | null
  avgPeerScore: number | null
  evalCount: number
  peerCount: number
  recommendation: string | null
}

export default function EmployeeSignalDashboard() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [signals, setSignals] = useState<EmployeeSignal[]>([])
  const [filterSignal, setFilterSignal] = useState<string>('')
  const [filterDept, setFilterDept] = useState('')
  const [searchName, setSearchName] = useState('')
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, string>>({})
  const [analyzing, setAnalyzing] = useState<string | null>(null)

  const canAccess = hasRole('director') || hasRole('division_head') || hasRole('ceo') || hasRole('admin')

  useEffect(() => {
    if (canAccess) fetchData()
  }, [canAccess])

  async function fetchData() {
    setLoading(true)
    const [empRes, deptRes, probRes, peerRes] = await Promise.all([
      supabase.from('employees').select('id, name, role, position, department_id, employment_type').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name'),
      supabase.from('probation_evaluations').select('*'),
      supabase.from('peer_reviews').select('*').eq('is_submitted', true),
    ])

    const employees = empRes.data || []
    const depts = deptRes.data || []
    setDepartments(depts)

    const sigs: EmployeeSignal[] = employees.map((emp) => {
      const dept = depts.find((d) => d.id === emp.department_id)

      // 수습평가 점수
      const evals = (probRes.data || []).filter((e: any) => e.employee_id === emp.id)
      const evalScores = evals.map((e: any) => {
        const s = e.scores || {}
        return Object.values(s).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
      })
      const avgEval = evalScores.length > 0 ? evalScores.reduce((a, b) => a + b, 0) / evalScores.length : null

      // 동료평가 점수
      const peers = (peerRes.data || []).filter((r: any) => r.reviewee_id === emp.id)
      const avgPeer = peers.length > 0
        ? peers.reduce((sum: number, r: any) => sum + (r.overall_score || 0), 0) / peers.length
        : null

      // 최근 권고
      const lastRec = evals.length > 0 ? evals[evals.length - 1]?.continuation_recommendation : null

      // 신호등 계산
      let signal: SignalGrade = 'yellow'
      if (avgEval !== null) {
        if (avgEval >= 80) signal = 'green'
        else if (avgEval >= 60) signal = 'yellow'
        else if (avgEval >= 40) signal = 'red'
        else signal = 'black'
      }
      // 동료평가가 있으면 보정
      if (avgPeer !== null && avgPeer < 3) {
        if (signal === 'green') signal = 'yellow'
        else if (signal === 'yellow') signal = 'red'
      }

      return {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        position: emp.position,
        department_id: emp.department_id,
        department_name: dept?.name || null,
        signal,
        avgEvalScore: avgEval ? Math.round(avgEval) : null,
        avgPeerScore: avgPeer ? Math.round(avgPeer * 10) / 10 : null,
        evalCount: evals.length,
        peerCount: peers.length,
        recommendation: lastRec,
      }
    })

    setSignals(sigs)
    setLoading(false)
  }

  async function analyzeEmployee(emp: EmployeeSignal) {
    setAnalyzing(emp.id)
    try {
      const config = await getAIConfigForFeature('probation_eval')
      if (!config) { toast('AI 설정이 필요합니다.', 'error'); setAnalyzing(null); return }

      const prompt = `직원 "${emp.name}" (직급: ${emp.position || emp.role})에 대한 종합 분석을 해주세요.

평가 데이터:
- 수습/정기 평가 평균: ${emp.avgEvalScore !== null ? `${emp.avgEvalScore}/100` : '데이터 없음'}
- 동료 평가 평균: ${emp.avgPeerScore !== null ? `${emp.avgPeerScore}/5` : '데이터 없음'}
- 평가 횟수: ${emp.evalCount}건
- 동료 평가 횟수: ${emp.peerCount}건
- 현재 신호등: ${SIGNAL_CONFIG[emp.signal].label}
- 최근 권고: ${emp.recommendation || '없음'}

3~4문장으로 이 직원의 강점, 주의 사항, 관리 방향을 제안해주세요. 마크다운 없이 일반 텍스트로.`

      const result = await generateAIContent(config, prompt)
      setAiAnalysis((prev) => ({ ...prev, [emp.id]: result.content.trim() }))
    } catch (err: any) {
      toast('AI 분석 실패: ' + err.message, 'error')
    }
    setAnalyzing(null)
  }

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-gray-500">이사 이상만 접근할 수 있습니다.</p>
      </div>
    )
  }

  if (loading) return <PageSpinner />

  // 필터링
  const filtered = signals.filter((s) => {
    if (filterSignal && s.signal !== filterSignal) return false
    if (filterDept && s.department_id !== filterDept) return false
    if (searchName && !s.name.includes(searchName)) return false
    return true
  })

  const counts: Record<SignalGrade, number> = { green: 0, yellow: 0, red: 0, black: 0 }
  for (const s of signals) counts[s.signal]++

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">직원 신호등</h1>
          <p className="text-sm text-gray-500 mt-1">전 직원 평가 데이터 기반 종합 등급</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> 새로고침
        </Button>
      </div>

      {/* 신호등 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['green', 'yellow', 'red', 'black'] as SignalGrade[]).map((grade) => {
          const cfg = SIGNAL_CONFIG[grade]
          const isActive = filterSignal === grade
          return (
            <button
              key={grade}
              onClick={() => setFilterSignal(isActive ? '' : grade)}
              className={`rounded-xl p-4 text-center transition-all border-2 ${
                isActive ? `${cfg.bg} ${cfg.border}` : 'bg-white border-transparent hover:bg-gray-50'
              }`}
            >
              <span className="text-2xl">{cfg.icon}</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{counts[grade]}</p>
              <p className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</p>
            </button>
          )
        })}
      </div>

      {/* 필터 */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="이름 검색..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
          />
        </div>
        <Select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          options={[{ value: '', label: '전체 부서' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
        />
      </div>

      {/* 직원 목록 */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">해당 조건의 직원이 없습니다.</p>
            </CardContent>
          </Card>
        ) : (
          filtered
            .sort((a, b) => {
              const order: Record<SignalGrade, number> = { black: 0, red: 1, yellow: 2, green: 3 }
              return order[a.signal] - order[b.signal]
            })
            .map((emp) => {
              const cfg = SIGNAL_CONFIG[emp.signal]
              const isExpanded = expandedId === emp.id

              return (
                <Card key={emp.id} className={`border-l-4 ${cfg.border}`}>
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : emp.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full ${cfg.color}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{emp.name}</span>
                          <Badge variant="default" className={`${cfg.bg} ${cfg.text} text-[10px]`}>{cfg.label}</Badge>
                          {emp.recommendation === 'warning' && <Badge variant="warning">경고</Badge>}
                          {emp.recommendation === 'terminate' && <Badge variant="danger">종료 권고</Badge>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {emp.department_name || '-'} · {emp.position || emp.role}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {emp.avgEvalScore !== null && (
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-800">{emp.avgEvalScore}점</p>
                          <p className="text-[10px] text-gray-400">평가 {emp.evalCount}건</p>
                        </div>
                      )}
                      {emp.avgPeerScore !== null && (
                        <div className="text-right">
                          <p className="text-sm font-bold text-blue-600">{emp.avgPeerScore}</p>
                          <p className="text-[10px] text-gray-400">동료 {emp.peerCount}건</p>
                        </div>
                      )}
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <CardContent className="border-t pt-4 space-y-3">
                      {/* 점수 바 */}
                      {emp.avgEvalScore !== null && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500">평가 점수</span>
                            <span className="text-xs font-medium text-gray-700">{emp.avgEvalScore}/100</span>
                          </div>
                          <ProgressBar
                            value={emp.avgEvalScore}
                            max={100}
                            color={emp.avgEvalScore >= 80 ? 'emerald' : emp.avgEvalScore >= 60 ? 'amber' : 'red'}
                          />
                        </div>
                      )}

                      {/* AI 분석 */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600">AI 종합 분석</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => analyzeEmployee(emp)}
                            disabled={analyzing === emp.id}
                          >
                            {analyzing === emp.id ? (
                              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 분석 중...</>
                            ) : (
                              <><Sparkles className="h-3 w-3 mr-1" /> AI 분석</>
                            )}
                          </Button>
                        </div>
                        {aiAnalysis[emp.id] && (
                          <div className="p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-800 whitespace-pre-wrap">{aiAnalysis[emp.id]}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })
        )}
      </div>
    </div>
  )
}
