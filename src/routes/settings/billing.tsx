import { useState, useEffect, useMemo } from 'react'
import { Database, Bot, Mail, Mic, TrendingUp, AlertTriangle, RefreshCw, Cpu, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'
// unified-ai-cost-dashboard: 실사용 AI 비용 데이터 레이어 (Design Ref §3.3, §5)
import { getUnifiedAiCosts, type AiCostAggregates, type SourceSystem } from '@/lib/ai-cost'
import { usdToKrw, USD_TO_KRW } from '@/lib/ai-cost-pricing'

interface UsageStats {
  // DB에서 집계
  totalCandidates: number
  totalAnalyses: number
  totalInterviewAnalyses: number
  totalMeetings: number
  meetingMinutes: number
  totalEmails: number
  storageUsedMB: number
}

// 서비스별 과금 정보
const SERVICES = [
  {
    id: 'supabase',
    name: 'Supabase Pro',
    icon: Database,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    type: 'fixed' as const,
    monthlyCost: 25,
    unit: '월',
    description: 'PostgreSQL DB + Auth + Storage',
    includes: ['DB 8GB', 'Storage 100GB', 'Auth 무제한', 'Edge Functions'],
  },
  {
    id: 'claude_max',
    name: 'Claude Max Plan',
    icon: Bot,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    type: 'fixed' as const,
    monthlyCost: 100,
    unit: '월',
    description: '개발용 AI 구독 (HR + 전체 사이트)',
    includes: ['무제한 대화', 'Claude Code CLI', '전 프로젝트 공용'],
  },
  {
    id: 'gemini',
    name: 'Google Gemini API',
    icon: Bot,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    type: 'usage' as const,
    monthlyCost: 0,
    unit: '요청당',
    pricePerUnit: 0,
    description: 'AI 분석 (이력서, 면접, 종합 분석)',
    includes: ['무료 플랜 사용 중', '분당 15건 제한', '한도 초과 시 과금'],
    note: '현재 무료 한도 내 사용',
  },
  {
    id: 'whisper',
    name: 'OpenAI Whisper API',
    icon: Mic,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    type: 'usage' as const,
    monthlyCost: 0,
    unit: '분당',
    pricePerUnit: 0.006,
    description: '회의 녹음 음성→텍스트 변환 (STT)',
    includes: ['$0.006/분', '선결제 $50 차감 중', '전 사이트 공용'],
  },
  {
    id: 'openai',
    name: 'OpenAI API (GPT)',
    icon: Bot,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    type: 'usage' as const,
    monthlyCost: 0,
    unit: '토큰',
    pricePerUnit: 0,
    description: 'AI 에이전트, 챗봇 (선택적)',
    includes: ['선결제 $50 차감 중', '전 사이트 공용'],
    note: 'HR 외 다른 사이트도 공용 사용',
  },
  {
    id: 'claude_api',
    name: 'Claude API',
    icon: Bot,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    type: 'usage' as const,
    monthlyCost: 0,
    unit: '토큰',
    pricePerUnit: 0,
    description: 'AI 에이전트, 메신저 AI',
    includes: ['선결제 $55 차감 중', '전 사이트 공용'],
  },
  {
    id: 'workspace',
    name: 'Google Workspace',
    icon: Mail,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    type: 'fixed' as const,
    monthlyCost: 8.4,
    unit: '사용자/월',
    description: 'Gmail + Calendar + Meet + Drive',
    includes: ['이메일 발송', 'Meet 화상면접', 'Calendar 일정', 'Drive 녹화'],
    note: 'Business Starter 기준 $8.40/user/month (1계정)',
  },
]

export default function BillingDashboard() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    setLoading(true)
    const [candRes, analysisRes, ivAnalysisRes, meetingRes, emailRes] = await Promise.all([
      supabase.from('candidates').select('id', { count: 'exact', head: true }),
      supabase.from('resume_analysis').select('id', { count: 'exact', head: true }),
      supabase.from('interview_analyses').select('id', { count: 'exact', head: true }),
      supabase.from('meeting_records').select('id, duration_seconds', { count: 'exact' }),
      // 이메일 발송 카운트 (hiring_decisions + candidates survey_sent 기준 추정)
      supabase.from('candidates').select('id', { count: 'exact', head: true }).neq('status', 'applied'),
    ])

    const meetings = meetingRes.data || []
    const meetingMinutes = meetings.reduce((sum: number, m: any) => sum + (m.duration_seconds || 0), 0) / 60

    setStats({
      totalCandidates: candRes.count || 0,
      totalAnalyses: (analysisRes.count || 0),
      totalInterviewAnalyses: ivAnalysisRes.count || 0,
      totalMeetings: meetingRes.count || 0,
      meetingMinutes: Math.round(meetingMinutes),
      totalEmails: emailRes.count || 0,
      storageUsedMB: 0, // Supabase Storage API로 조회 가능하지만 별도 구현 필요
    })
    setLoading(false)
  }

  if (loading) return <PageSpinner />

  const fixedCosts = SERVICES.filter((s) => s.type === 'fixed')
  const usageCosts = SERVICES.filter((s) => s.type === 'usage')
  const totalFixed = fixedCosts.reduce((sum, s) => sum + s.monthlyCost, 0)

  // 예상 종량제 비용
  const whisperCost = (stats?.meetingMinutes || 0) * 0.006
  const estimatedUsage = whisperCost // Gemini 무료, OpenAI/Claude는 선결제

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">비용 관리</h1>
          <p className="text-sm text-gray-500 mt-1">HR 플랫폼 운영에 필요한 서비스별 비용을 확인합니다.</p>
        </div>
        <Button variant="outline" onClick={fetchStats}>
          <RefreshCw className="h-4 w-4 mr-1" /> 새로고침
        </Button>
      </div>

      {/* 총 비용 요약 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-4 px-5">
            <p className="text-xs text-gray-500">월 고정 비용</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">${totalFixed.toFixed(0)}</p>
            <p className="text-[11px] text-gray-400 mt-1">Supabase + Claude Max + Workspace</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-4 px-5">
            <p className="text-xs text-gray-500">이번 달 종량제 (예상)</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">${estimatedUsage.toFixed(2)}</p>
            <p className="text-[11px] text-gray-400 mt-1">Whisper STT {stats?.meetingMinutes || 0}분</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-4 px-5">
            <p className="text-xs text-gray-500">월 총 예상 비용</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">${(totalFixed + estimatedUsage).toFixed(0)}</p>
            <p className="text-[11px] text-gray-400 mt-1">≈ ₩{Math.round((totalFixed + estimatedUsage) * 1380).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* 실사용 AI 비용 (unified-ai-cost-dashboard) — 신규 섹션 */}
      <AiUsageCostSection />

      {/* 사용량 통계 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-brand-600" /> 이번 달 사용량
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{stats?.totalCandidates || 0}</p>
              <p className="text-xs text-gray-500 mt-1">총 지원자</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{(stats?.totalAnalyses || 0) + (stats?.totalInterviewAnalyses || 0)}</p>
              <p className="text-xs text-gray-500 mt-1">AI 분석 횟수</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{stats?.totalMeetings || 0}</p>
              <p className="text-xs text-gray-500 mt-1">회의 녹음</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{stats?.totalEmails || 0}</p>
              <p className="text-xs text-gray-500 mt-1">이메일 발송 (추정)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 고정 비용 서비스 */}
      <Card>
        <CardHeader>
          <CardTitle>고정 비용 서비스</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fixedCosts.map((s) => (
            <div key={s.id} className={`flex items-start gap-4 p-4 rounded-lg ${s.bgColor}`}>
              <div className={`p-2 rounded-lg bg-white shadow-sm`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-900">{s.name}</p>
                  <p className="text-lg font-bold text-gray-900">${s.monthlyCost}/{s.unit}</p>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{s.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {s.includes.map((item, i) => (
                    <Badge key={i} variant="default" className="bg-white/80 text-gray-600 text-[10px]">{item}</Badge>
                  ))}
                </div>
                {s.note && (
                  <p className="text-[11px] text-gray-500 mt-1.5">{s.note}</p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 종량제 서비스 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            종량제 서비스
            <Badge variant="default" className="bg-amber-100 text-amber-700 text-[10px]">사용량 기반</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {usageCosts.map((s) => (
            <div key={s.id} className={`flex items-start gap-4 p-4 rounded-lg ${s.bgColor}`}>
              <div className={`p-2 rounded-lg bg-white shadow-sm`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-900">{s.name}</p>
                  {s.id === 'whisper' && stats ? (
                    <p className="text-lg font-bold text-amber-600">${(stats.meetingMinutes * 0.006).toFixed(2)}</p>
                  ) : (
                    <p className="text-sm font-medium text-gray-500">선결제 차감 중</p>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{s.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {s.includes.map((item, i) => (
                    <Badge key={i} variant="default" className="bg-white/80 text-gray-600 text-[10px]">{item}</Badge>
                  ))}
                </div>
                {s.note && (
                  <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {s.note}
                  </p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 비용 절감 팁 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">비용 절감 팁</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p>• Gemini API 무료 플랜 한도(분당 15건)를 초과하지 않도록 대량 분석은 분산 실행</p>
          <p>• 회의 녹음은 1시간 단위로 분할하면 STT 비용 추적이 용이</p>
          <p>• 면접 녹화 파일은 14일 보관 후 자동 삭제 (Storage 용량 절감)</p>
          <p>• OpenAI/Claude API 선결제 잔액 소진 시 추가 충전 필요</p>
        </CardContent>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 실사용 AI 비용 섹션 (unified-ai-cost-dashboard)
// Design Ref §5 — get_unified_ai_costs RPC → estimateCost → 시스템/모델/월별 집계
// Plan SC-1~5: finance 토큰 환산 + HR STT/구독비 통합 + 월/모델/시스템별 + RPC 캡슐화 + cs/mall 정직 표시
// ─────────────────────────────────────────────────────────────────

// 시스템 라벨 + 데이터 합류 여부 (cs/mall 은 현재 AI 기록 없음 = '기록 대기')
const SYSTEM_META: Record<SourceSystem, { label: string; expected: boolean }> = {
  hr: { label: 'HR (인사)', expected: true },
  finance: { label: 'Finance (재무)', expected: true },
  cs: { label: 'CS (고객지원)', expected: false },
  mall: { label: 'Mall (몰)', expected: false },
}

// 'YYYY-MM' → 'YYYY.MM' (CLAUDE.md 날짜 규칙)
function toMonthLabel(ym: string): string {
  return ym.replace('-', '.')
}

// 당월 / 전월의 [start, end] (date 문자열 YYYY-MM-DD)
function monthRange(offset: number): { start: string; end: string; ym: string } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const y = d.getFullYear()
  const m = d.getMonth() // 0-based
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const lastDay = new Date(y, m + 1, 0).getDate()
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end, ym: `${y}-${String(m + 1).padStart(2, '0')}` }
}

function AiUsageCostSection() {
  const [loading, setLoading] = useState(true)
  const [agg, setAgg] = useState<AiCostAggregates | null>(null)
  const [prevTotal, setPrevTotal] = useState<number | null>(null)
  // 0 = 당월, -1 = 전월 ... (기간 선택)
  const [monthOffset, setMonthOffset] = useState(0)

  const cur = useMemo(() => monthRange(monthOffset), [monthOffset])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const prev = monthRange(monthOffset - 1)
    // 선택 월 + 직전 월(전월 대비)을 함께 조회
    Promise.all([
      getUnifiedAiCosts(cur.start, cur.end),
      getUnifiedAiCosts(prev.start, prev.end),
    ]).then(([curAgg, prevAgg]) => {
      if (cancelled) return
      setAgg(curAgg)
      setPrevTotal(prevAgg.totalUsd)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [cur.start, cur.end, monthOffset])

  // 전월 대비 증감률
  const deltaPct = useMemo(() => {
    if (prevTotal == null || prevTotal === 0) return null
    if (!agg) return null
    return ((agg.totalUsd - prevTotal) / prevTotal) * 100
  }, [agg, prevTotal])

  const monthLabel = toMonthLabel(cur.ym)
  const hasData = !!agg && agg.rows.length > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-brand-600" /> 실사용 AI 비용
            <Badge variant="default" className="bg-purple-100 text-purple-700 text-[10px]">토큰 과금</Badge>
          </CardTitle>
          {/* 기간 선택 (월 단위) */}
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setMonthOffset((v) => v - 1)}>이전 달</Button>
            <span className="text-sm font-medium text-gray-700 min-w-[72px] text-center">{monthLabel}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMonthOffset((v) => Math.min(0, v + 1))}
              disabled={monthOffset >= 0}
            >
              다음 달
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : (
          <>
            {/* 요약: 토큰비(변동) 합계 + 전월 대비 */}
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <p className="text-xs text-gray-500">{monthLabel} 토큰 과금 (추정)</p>
                <p className="text-3xl font-bold text-gray-900 mt-0.5">
                  ${(agg?.totalUsd ?? 0).toFixed(2)}
                  <span className="text-sm font-normal text-gray-400 ml-2">≈ ₩{usdToKrw(agg?.totalUsd ?? 0).toLocaleString()}</span>
                </p>
              </div>
              {deltaPct != null && (
                <div className="text-sm">
                  <span className="text-gray-500">전월 대비 </span>
                  <span className={deltaPct >= 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                    {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>

            {/* 추정치 disclaimer */}
            <div className="flex items-start gap-1.5 rounded-md bg-gray-50 p-2.5 text-[11px] text-gray-500">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                토큰 단가 기반 <strong>추정치</strong>입니다 (환율 ₩{USD_TO_KRW.toLocaleString()}/USD, 단가 기준 2026.05).
                구독비(고정)는 아래 "고정 비용 서비스"에서 별도로 확인하세요.
                {agg && agg.unpricedCount > 0 && (
                  <> 단가 미등록 모델 {agg.unpricedCount}건은 비용 0으로 표시됩니다.</>
                )}
              </span>
            </div>

            {/* 시스템별 (HR/finance/cs/mall) */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">시스템별</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(Object.keys(SYSTEM_META) as SourceSystem[]).map((sys) => {
                  const meta = SYSTEM_META[sys]
                  const usd = agg?.bySystem[sys] ?? 0
                  const recorded = usd > 0 || (agg?.rows.some((r) => r.source_system === sys) ?? false)
                  return (
                    <div key={sys} className="p-3 rounded-lg bg-gray-50 text-center">
                      <p className="text-[11px] text-gray-500">{meta.label}</p>
                      {recorded ? (
                        <p className="text-lg font-bold text-gray-900 mt-0.5">${usd.toFixed(2)}</p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1.5">
                          {meta.expected ? '데이터 없음' : '기록 대기'}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 모델별 + 월별 추이 */}
            {hasData ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 모델별 */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">모델별</p>
                  <div className="space-y-1.5">
                    {Object.entries(agg!.byModel)
                      .sort((a, b) => b[1] - a[1])
                      .map(([model, usd]) => (
                        <div key={model} className="flex items-center justify-between text-sm px-3 py-1.5 rounded bg-gray-50">
                          <span className="text-gray-700 truncate mr-2">{model}</span>
                          <span className="font-medium text-gray-900 shrink-0">${usd.toFixed(2)}</span>
                        </div>
                      ))}
                  </div>
                </div>
                {/* 월별 추이 */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">월별 추이</p>
                  <div className="space-y-1.5">
                    {Object.entries(agg!.byMonth)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([ym, usd]) => (
                        <div key={ym} className="flex items-center justify-between text-sm px-3 py-1.5 rounded bg-gray-50">
                          <span className="text-gray-700">{toMonthLabel(ym)}</span>
                          <span className="font-medium text-gray-900">${usd.toFixed(2)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              // 빈 상태 — 정직하게 표시 (FR-09)
              <div className="py-6 text-center">
                <p className="text-sm text-gray-500">{monthLabel}에 기록된 AI 사용 내역이 없습니다.</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  AI 분석/회의록 STT 등을 사용하면 자동으로 집계됩니다. finance AI 리포트는 생성 시점 기준으로 합산됩니다.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
