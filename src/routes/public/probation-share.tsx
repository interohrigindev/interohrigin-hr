import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Loader2, AlertCircle, CheckCircle2, XCircle, Clock,
  TrendingUp, ThumbsUp, AlertTriangle, Sparkles,
  GraduationCap, Building2, CalendarDays, User as UserIcon,
  Lightbulb, Target, LineChart, Award,
  ArrowUp, ArrowDown, Minus, Activity, Users as UsersIcon, Flag, Compass,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { PROBATION_CRITERIA } from '@/types/employee-lifecycle'

/* ─── Types ─────────────────────────────────────────── */
type Recommendation = 'continue' | 'warning' | 'terminate' | null

interface SharedEvaluation {
  id: string
  stage: 'round1' | 'round2' | 'round3' | string
  evaluator_id: string | null
  evaluator_role: 'leader' | 'executive' | 'ceo' | string | null
  evaluator_name: string | null
  evaluator_position: string | null
  scores: Record<string, number> | null
  ai_assessment: string | null
  continuation_recommendation: Recommendation
  comments: string | null
  praise: string | null
  improvement: string | null
  leader_summary: string | null
  exec_one_liner: string | null
  strengths: string | null
  created_at: string
  updated_at: string
}

interface OverallAnalysis {
  strengths: string[]
  weaknesses: string[]
  advice: string[]
  actionPlan: string
}

interface RoundSummaryCached {
  consensus: string
  strengths: string[]
  cautions: string[]
  recommendation: 'continue' | 'warning' | 'terminate'
  recommendationReason: string
}

interface AICacheBundle {
  overall?: OverallAnalysis
  trend?: { text: string }
  round1?: RoundSummaryCached
  round2?: RoundSummaryCached
  round3?: RoundSummaryCached
}

interface ShareData {
  link: { note: string | null; expires_at: string | null; view_count: number }
  employee: {
    id: string
    name: string
    department_name: string | null
    position: string | null
    role: string | null
    hire_date: string | null
    employment_type: string | null
    is_active: boolean
    probation_completed_at: string | null
    probation_result: 'passed' | 'failed' | 'pending' | null
    converted_to_regular_at: string | null
  }
  evaluations: SharedEvaluation[]
  closures: Array<{ stage: string; reason: string | null; closed_at: string }>
  evaluators: Array<{ id: string; name: string; role: string }>
  ai_cache?: AICacheBundle
}

/* ─── Helpers ───────────────────────────────────────── */
const STAGE_LABEL: Record<string, string> = {
  round1: '1회차 (2주)',
  round2: '2회차 (6주)',
  round3: '3회차 (10주)',
}
const STAGE_ORDER: Record<string, number> = { round1: 1, round2: 2, round3: 3 }

const ROLE_LABEL: Record<string, string> = {
  leader: '리더',
  executive: '임원',
  ceo: '대표',
}

const ROLE_BADGE: Record<string, string> = {
  leader: 'bg-blue-100 text-blue-800 border-blue-200',
  executive: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ceo: 'bg-amber-100 text-amber-800 border-amber-200',
}

const REC_STYLE: Record<string, { label: string; cls: string; icon: any }> = {
  continue: { label: '계속 근무', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  warning: { label: '경고/주의', cls: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  terminate: { label: '수습 종료', cls: 'bg-red-100 text-red-700', icon: XCircle },
}

function totalScore(scores: Record<string, number> | null): number {
  if (!scores) return 0
  return PROBATION_CRITERIA.reduce((sum, c) => sum + (scores[c.key] || 0), 0)
}

function avgOfArray(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function gradeColor(score: number): string {
  if (score >= 85) return 'text-emerald-600'
  if (score >= 70) return 'text-brand-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function gradeBg(score: number): string {
  if (score >= 85) return 'bg-emerald-500'
  if (score >= 70) return 'bg-brand-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

// AI 추이 분석 텍스트를 6개 섹션(번호별)으로 파싱
function parseTrendSections(text: string): Array<{ num: number; title: string; body: string }> {
  if (!text) return []
  const sections: Array<{ num: number; title: string; body: string }> = []
  // "1. ", "\n1." 등으로 시작하는 블록 분리
  const blocks = text.split(/(?=^\s*\d+\.\s)|(?=\n\d+\.\s)/m).map((b) => b.trim()).filter(Boolean)
  for (const block of blocks) {
    const m = block.match(/^(\d+)\.\s*(.*?)(?:\n|$)([\s\S]*)/)
    if (!m) continue
    const num = parseInt(m[1], 10)
    const titleLine = m[2].trim()
    let title = titleLine
    let body = (m[3] || '').trim()
    // 제목과 본문이 한 줄에 콜론으로 구분된 경우
    if (titleLine.includes(':')) {
      const [t, ...rest] = titleLine.split(':')
      title = t.trim()
      const inline = rest.join(':').trim()
      body = inline + (body ? '\n' + body : '')
    }
    if (title) sections.push({ num, title, body })
  }
  return sections
}

const TREND_SECTION_META: Record<number, { color: string; icon: any; titleFallback: string }> = {
  1: { color: 'blue',    icon: Activity,  titleFallback: '전체 성장 추이' },
  2: { color: 'emerald', icon: TrendingUp, titleFallback: '성장한 영역 / 정체된 영역' },
  3: { color: 'amber',   icon: Flag,      titleFallback: '단계별 변화 포인트' },
  4: { color: 'purple',  icon: UsersIcon, titleFallback: '평가자 간 차이 분석' },
  5: { color: 'indigo',  icon: Award,     titleFallback: '종합 의견 및 권고' },
  6: { color: 'cyan',    icon: Compass,   titleFallback: '향후 성장 제안' },
}

function colorClasses(color: string): { bg: string; border: string; iconBg: string; iconText: string; title: string } {
  const map: Record<string, { bg: string; border: string; iconBg: string; iconText: string; title: string }> = {
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    iconBg: 'bg-blue-100',    iconText: 'text-blue-600',    title: 'text-blue-900' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', title: 'text-emerald-900' },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   iconBg: 'bg-amber-100',   iconText: 'text-amber-600',   title: 'text-amber-900' },
    purple:  { bg: 'bg-purple-50',  border: 'border-purple-200',  iconBg: 'bg-purple-100',  iconText: 'text-purple-600',  title: 'text-purple-900' },
    indigo:  { bg: 'bg-indigo-50',  border: 'border-indigo-200',  iconBg: 'bg-indigo-100',  iconText: 'text-indigo-600',  title: 'text-indigo-900' },
    cyan:    { bg: 'bg-cyan-50',    border: 'border-cyan-200',    iconBg: 'bg-cyan-100',    iconText: 'text-cyan-600',    title: 'text-cyan-900' },
  }
  return map[color] || map.blue
}

function getRecommendationMajority(evals: SharedEvaluation[]): Recommendation {
  const counts: Record<string, number> = {}
  for (const e of evals) {
    if (e.continuation_recommendation) {
      counts[e.continuation_recommendation] = (counts[e.continuation_recommendation] || 0) + 1
    }
  }
  let best: Recommendation = null
  let max = 0
  for (const [k, v] of Object.entries(counts)) {
    if (v > max) { best = k as Recommendation; max = v }
  }
  return best
}

/* ─── Component ─────────────────────────────────────── */
export default function ProbationSharePage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ShareData | null>(null)

  useEffect(() => {
    if (!token) { setError('잘못된 링크입니다'); setLoading(false); return }
    ;(async () => {
      const { data: rpc, error: err } = await supabase.rpc('get_shared_probation', { p_token: token })
      if (err) {
        const msg = err.message || ''
        if (msg.includes('AUTH_REQUIRED')) setError('로그인이 필요합니다.')
        else if (msg.includes('FORBIDDEN')) setError('이 수습평가 결과를 볼 권한이 없습니다.\n관리자(임원/대표), 평가 참여자, 또는 수습평가 메뉴 권한을 받은 리더만 열람할 수 있습니다.')
        else setError(msg || '링크를 열 수 없습니다')
        setLoading(false); return
      }
      setData(rpc as ShareData)
      setLoading(false)
    })()
  }, [token])

  const byStage = useMemo(() => {
    const map = new Map<string, SharedEvaluation[]>()
    if (!data) return map
    for (const ev of data.evaluations) {
      if (!map.has(ev.stage)) map.set(ev.stage, [])
      map.get(ev.stage)!.push(ev)
    }
    return map
  }, [data])

  const overallAvg = useMemo(() => {
    if (!data || data.evaluations.length === 0) return 0
    return avgOfArray(data.evaluations.map((e) => totalScore(e.scores)))
  }, [data])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>수습평가 결과를 불러오는 중...</span>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">링크를 열 수 없습니다</h1>
          <p className="text-sm text-gray-600">{error || '데이터가 없습니다'}</p>
          <p className="text-xs text-gray-400 mt-4">링크가 만료되었거나 비활성화되었을 수 있습니다.</p>
        </div>
      </div>
    )
  }

  const emp = data.employee
  const stagesPresent = Array.from(byStage.keys()).sort((a, b) => (STAGE_ORDER[a] || 99) - (STAGE_ORDER[b] || 99))

  // 라이프사이클 뱃지
  const lifecycleBadge = (() => {
    if (emp.probation_result === 'passed') return { label: '정규직 전환', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 }
    if (emp.probation_result === 'failed') return { label: '계약 종료', cls: 'bg-red-100 text-red-700', icon: XCircle }
    if (emp.is_active === false) return { label: '퇴사자', cls: 'bg-gray-200 text-gray-600', icon: XCircle }
    if (emp.employment_type === 'probation') return { label: '수습 중', cls: 'bg-amber-100 text-amber-700', icon: Clock }
    if (emp.employment_type === 'full_time') return { label: '정규직', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 }
    return null
  })()

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <header className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shrink-0">
                {emp.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-2xl font-bold text-gray-900">{emp.name}</h1>
                  {lifecycleBadge && (
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${lifecycleBadge.cls}`}>
                      <lifecycleBadge.icon className="h-3 w-3" />{lifecycleBadge.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
                  {emp.department_name && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" /> {emp.department_name}
                    </span>
                  )}
                  {emp.position && (
                    <span className="inline-flex items-center gap-1">
                      <UserIcon className="h-3.5 w-3.5" /> {emp.position}
                    </span>
                  )}
                  {emp.hire_date && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" /> 입사 {formatDate(emp.hire_date, 'yyyy.MM.dd')}
                    </span>
                  )}
                </div>
                {emp.converted_to_regular_at && (
                  <p className="text-xs text-emerald-600 mt-1">정규직 전환: {formatDate(emp.converted_to_regular_at, 'yyyy.MM.dd')}</p>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">평균 점수</div>
              <div className={`text-4xl font-bold ${gradeColor(overallAvg)}`}>
                {overallAvg.toFixed(1)}
                <span className="text-base text-gray-400 font-normal"> /100</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">{data.evaluations.length}건 평가</div>
            </div>
          </div>

          {data.link.note && (
            <p className="mt-4 pt-4 border-t border-gray-100 text-sm text-purple-700 bg-purple-50 -mx-6 -mb-6 px-6 py-3 rounded-b-2xl">
              <Sparkles className="h-3.5 w-3.5 inline mr-1" /> {data.link.note}
            </p>
          )}
        </header>

        {/* 회차별 점수 추이 */}
        {stagesPresent.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-brand-500" /> 회차별 평균 점수 추이
            </h2>
            <div className="flex items-end gap-4" style={{ height: '160px' }}>
              {stagesPresent.map((stage) => {
                const list = byStage.get(stage) || []
                const avg = avgOfArray(list.map((e) => totalScore(e.scores)))
                return (
                  <div key={stage} className="flex-1 flex flex-col items-center gap-2">
                    <span className={`text-sm font-bold ${gradeColor(avg)}`}>{avg.toFixed(1)}</span>
                    <div className="w-full bg-gray-100 rounded-t-md relative" style={{ height: '110px' }}>
                      <div
                        className={`absolute bottom-0 left-0 right-0 rounded-t-md transition-all ${gradeBg(avg)}`}
                        style={{ height: `${Math.min(avg, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 font-medium">{STAGE_LABEL[stage] || stage}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* AI 종합 분석 (강점·약점·조언·실행계획) */}
        {data.ai_cache?.overall && (
          <section className="bg-white rounded-2xl shadow-sm border border-purple-200 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-100 via-purple-50 to-indigo-50 px-6 py-4 border-b border-purple-200">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" /> AI 종합 분석
                <span className="text-xs font-normal text-gray-500">강점·약점·조언·실행계획</span>
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 강점 */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-1.5">
                    <ThumbsUp className="h-4 w-4" /> 강점
                  </h3>
                  <ul className="space-y-2">
                    {data.ai_cache.overall.strengths?.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-emerald-900">
                        <span className="text-emerald-500 mt-0.5 shrink-0">●</span>
                        <span className="leading-relaxed">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 약점 */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" /> 보완점
                  </h3>
                  <ul className="space-y-2">
                    {data.ai_cache.overall.weaknesses?.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                        <span className="text-amber-500 mt-0.5 shrink-0">●</span>
                        <span className="leading-relaxed">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* 조언 */}
              {data.ai_cache.overall.advice && data.ai_cache.overall.advice.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-1.5">
                    <Lightbulb className="h-4 w-4" /> 조언
                  </h3>
                  <ul className="space-y-2">
                    {data.ai_cache.overall.advice.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-blue-900">
                        <span className="text-blue-500 mt-0.5 shrink-0">●</span>
                        <span className="leading-relaxed">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 실행 계획 */}
              {data.ai_cache.overall.actionPlan && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-purple-800 mb-2 flex items-center gap-1.5">
                    <Target className="h-4 w-4" /> 실행 계획
                  </h3>
                  <p className="text-sm text-purple-900 leading-relaxed whitespace-pre-wrap">
                    {data.ai_cache.overall.actionPlan}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 회차별 종합 요약 (round summaries) */}
        {stagesPresent.some((s) => data.ai_cache?.[s as 'round1' | 'round2' | 'round3']) && (
          <section className="bg-white rounded-2xl shadow-sm border border-indigo-200 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-6 py-4 border-b border-indigo-200">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Award className="h-5 w-5 text-indigo-600" /> 회차별 종합 요약
                <span className="text-xs font-normal text-gray-500">전체 평가자 통합 AI 분석</span>
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {stagesPresent.map((stage) => {
                const summary = data.ai_cache?.[stage as 'round1' | 'round2' | 'round3']
                if (!summary) return null
                const rec = REC_STYLE[summary.recommendation]
                return (
                  <div key={stage} className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                      <h3 className="text-sm font-bold text-gray-900">{STAGE_LABEL[stage] || stage}</h3>
                      {rec && (
                        <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${rec.cls}`}>
                          {(() => { const I = rec.icon; return <I className="h-3.5 w-3.5" /> })()} {rec.label}
                        </span>
                      )}
                    </div>

                    {summary.consensus && (
                      <p className="text-sm text-gray-800 leading-relaxed mb-3 whitespace-pre-wrap">
                        {summary.consensus}
                      </p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {summary.strengths && summary.strengths.length > 0 && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                          <p className="text-[11px] font-semibold text-emerald-700 mb-1.5">공통 강점</p>
                          <ul className="space-y-1 text-xs text-emerald-900">
                            {summary.strengths.map((s, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="text-emerald-500 shrink-0">●</span><span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {summary.cautions && summary.cautions.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <p className="text-[11px] font-semibold text-amber-700 mb-1.5">주의 사항</p>
                          <ul className="space-y-1 text-xs text-amber-900">
                            {summary.cautions.map((s, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="text-amber-500 shrink-0">●</span><span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {summary.recommendationReason && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-[11px] font-semibold text-gray-600 mb-1">권고 사유</p>
                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {summary.recommendationReason}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* AI 추이 분석 — 시각화된 카드 */}
        {(data.ai_cache?.trend?.text || stagesPresent.length >= 2) && (() => {
          const sections = parseTrendSections(data.ai_cache?.trend?.text || '')
          // 항목별 회차 변화 (5개 평가 항목 × 회차)
          const itemTrends = PROBATION_CRITERIA.map((c) => {
            const perStage = stagesPresent.map((stage) => {
              const list = byStage.get(stage) || []
              const vals = list.map((e) => e.scores?.[c.key] ?? 0)
              return { stage, avg: avgOfArray(vals) }
            })
            const first = perStage[0]?.avg ?? 0
            const last = perStage[perStage.length - 1]?.avg ?? 0
            const delta = last - first
            return { key: c.key, label: c.label, perStage, delta }
          })
          // 평가자 역할별 회차 평균
          const roleKeys: Array<'leader' | 'executive' | 'ceo'> = ['leader', 'executive', 'ceo']
          const roleTrends = roleKeys.map((role) => {
            const perStage = stagesPresent.map((stage) => {
              const list = (byStage.get(stage) || []).filter((e) => e.evaluator_role === role)
              const vals = list.map((e) => totalScore(e.scores))
              return { stage, avg: avgOfArray(vals), count: list.length }
            })
            const hasData = perStage.some((p) => p.count > 0)
            return { role, perStage, hasData }
          }).filter((r) => r.hasData)
          // 회차별 권고 다수결
          const recPerStage = stagesPresent.map((stage) => ({
            stage,
            rec: getRecommendationMajority(byStage.get(stage) || []),
          }))

          return (
            <section className="bg-white rounded-2xl shadow-sm border border-blue-200 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50 via-cyan-50 to-sky-50 px-6 py-4 border-b border-blue-200">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <LineChart className="h-5 w-5 text-blue-600" /> AI 추이 분석
                  <span className="text-xs font-normal text-gray-500">회차 간 변화 종합 + 데이터 시각화</span>
                </h2>
              </div>

              <div className="p-6 space-y-5">
                {/* ① 항목별 변화 */}
                {stagesPresent.length >= 2 && (
                  <div className="border border-gray-200 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-blue-500" /> 평가 항목별 변화
                    </h3>
                    <div className="space-y-2">
                      {itemTrends.map((it) => {
                        const trendCls = it.delta > 0.5 ? 'text-emerald-600' : it.delta < -0.5 ? 'text-red-600' : 'text-gray-500'
                        const TrendIcon = it.delta > 0.5 ? ArrowUp : it.delta < -0.5 ? ArrowDown : Minus
                        return (
                          <div key={it.key} className="grid grid-cols-12 items-center gap-2 text-sm">
                            <div className="col-span-3 text-gray-700 font-medium truncate" title={it.label}>{it.label}</div>
                            {/* 회차별 점수 막대 */}
                            <div className="col-span-7 flex items-center gap-1.5">
                              {it.perStage.map((ps, idx) => (
                                <div key={ps.stage} className="flex-1 flex items-center gap-1.5">
                                  <div className="flex-1 bg-gray-100 rounded h-5 relative overflow-hidden">
                                    <div className={`absolute left-0 top-0 bottom-0 ${gradeBg(ps.avg * 5)} rounded`}
                                         style={{ width: `${Math.min(ps.avg * 5, 100)}%` }} />
                                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white drop-shadow">
                                      {ps.avg.toFixed(1)}
                                    </span>
                                  </div>
                                  {idx < it.perStage.length - 1 && <span className="text-gray-300 text-xs">→</span>}
                                </div>
                              ))}
                            </div>
                            {/* 변화량 */}
                            <div className={`col-span-2 flex items-center justify-end gap-1 text-sm font-bold ${trendCls}`}>
                              <TrendIcon className="h-3.5 w-3.5" />
                              <span>{it.delta > 0 ? '+' : ''}{it.delta.toFixed(1)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <p className="mt-3 text-[11px] text-gray-400">
                      ※ 색상은 점수에 따라 변경됩니다 (초록 ≥17, 보라 ≥14, 주황 ≥10, 빨강 &lt;10). 변화량은 첫 회차 대비 마지막 회차.
                    </p>
                  </div>
                )}

                {/* ② 평가자 역할별 추이 (멀티 라인 차트) */}
                {roleTrends.length > 0 && stagesPresent.length >= 2 && (
                  <div className="border border-gray-200 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                      <UsersIcon className="h-4 w-4 text-purple-500" /> 평가자 역할별 점수 추이
                    </h3>
                    <div className="space-y-3">
                      {roleTrends.map((rt) => (
                        <div key={rt.role}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-semibold ${ROLE_BADGE[rt.role]}`}>
                              {ROLE_LABEL[rt.role]}
                            </span>
                            <span className="text-gray-500">
                              {rt.perStage.map((p) => `${(STAGE_LABEL[p.stage] || p.stage).split(' ')[0]}: ${p.avg.toFixed(0)}점`).join(' → ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5" style={{ height: '40px' }}>
                            {rt.perStage.map((ps, idx) => (
                              <div key={ps.stage} className="flex-1 flex items-center gap-1.5 h-full">
                                <div className="flex-1 bg-gray-100 rounded h-full relative overflow-hidden">
                                  <div className={`absolute bottom-0 left-0 right-0 ${gradeBg(ps.avg)} rounded transition-all`}
                                       style={{ height: `${Math.min(ps.avg, 100)}%`, opacity: ps.count > 0 ? 1 : 0.2 }} />
                                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow">
                                    {ps.count > 0 ? ps.avg.toFixed(0) : '-'}
                                  </span>
                                </div>
                                {idx < rt.perStage.length - 1 && <span className="text-gray-300 text-sm">→</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ③ 권고 변화 타임라인 */}
                {recPerStage.some((r) => r.rec) && (
                  <div className="border border-gray-200 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                      <Flag className="h-4 w-4 text-amber-500" /> 권고 변화 타임라인
                    </h3>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {recPerStage.map((r, idx) => {
                        const rec = r.rec ? REC_STYLE[r.rec] : null
                        return (
                          <div key={r.stage} className="flex items-center gap-2">
                            <div className="flex flex-col items-center gap-1.5 min-w-[88px]">
                              <span className="text-[11px] text-gray-500 font-medium">{STAGE_LABEL[r.stage] || r.stage}</span>
                              {rec ? (
                                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${rec.cls}`}>
                                  {(() => { const I = rec.icon; return <I className="h-3.5 w-3.5" /> })()} {rec.label}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200">미정</span>
                              )}
                            </div>
                            {idx < recPerStage.length - 1 && <span className="text-gray-300">→</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ④ AI 텍스트를 6개 섹션 카드로 분리 */}
                {sections.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sections.map((s) => {
                      const meta = TREND_SECTION_META[s.num] || TREND_SECTION_META[1]
                      const c = colorClasses(meta.color)
                      const Icon = meta.icon
                      return (
                        <div key={s.num} className={`${c.bg} border ${c.border} rounded-xl p-4`}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`h-7 w-7 rounded-full ${c.iconBg} ${c.iconText} flex items-center justify-center shrink-0`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Section {s.num}</div>
                              <h4 className={`text-sm font-bold ${c.title} truncate`}>{s.title}</h4>
                            </div>
                          </div>
                          {s.body && (
                            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{s.body}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : data.ai_cache?.trend?.text ? (
                  // 파싱 실패한 경우 fallback (전체 텍스트 그대로)
                  <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {data.ai_cache.trend.text}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          )
        })()}

        {/* 회차별 상세 */}
        {stagesPresent.map((stage) => {
          const list = byStage.get(stage) || []
          const closure = data.closures.find((c) => c.stage === stage)
          const stageAvg = avgOfArray(list.map((e) => totalScore(e.scores)))
          const stageRec = getRecommendationMajority(list)

          // 항목별 평균 (5개 항목)
          const itemAverages = PROBATION_CRITERIA.map((c) => {
            const vals = list.map((e) => (e.scores?.[c.key] ?? 0))
            return { key: c.key, label: c.label, avg: avgOfArray(vals) }
          })

          return (
            <section key={stage} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Stage header */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-6 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-lg font-bold text-gray-900">
                    {STAGE_LABEL[stage] || stage}
                  </h2>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs text-gray-500">평균</div>
                      <div className={`text-2xl font-bold ${gradeColor(stageAvg)}`}>{stageAvg.toFixed(1)}</div>
                    </div>
                    {stageRec && REC_STYLE[stageRec] && (
                      <span className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full font-semibold ${REC_STYLE[stageRec].cls}`}>
                        {(() => { const I = REC_STYLE[stageRec].icon; return <I className="h-3.5 w-3.5" /> })()}
                        {REC_STYLE[stageRec].label}
                      </span>
                    )}
                  </div>
                </div>
                {closure && (
                  <p className="text-xs text-gray-500 mt-2">
                    ⓘ 관리자 마감: {formatDate(closure.closed_at, 'yyyy.MM.dd')} {closure.reason && `· ${closure.reason}`}
                  </p>
                )}
              </div>

              {/* 항목별 평균 바 */}
              {list.length > 0 && (
                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-700 mb-3">평가 항목별 평균 점수</p>
                  <div className="space-y-2">
                    {itemAverages.map((it) => (
                      <div key={it.key} className="flex items-center gap-3 text-sm">
                        <div className="w-44 text-gray-700 shrink-0">{it.label}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 relative overflow-hidden">
                          <div className={`absolute left-0 top-0 bottom-0 ${gradeBg(it.avg * 5)} rounded-full`}
                               style={{ width: `${Math.min(it.avg * 5, 100)}%` }} />
                        </div>
                        <div className="w-12 text-right font-semibold text-gray-700">{it.avg.toFixed(1)}<span className="text-gray-400 text-xs">/20</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 평가자별 카드 */}
              <div className="divide-y divide-gray-100">
                {list.map((ev) => {
                  const tot = totalScore(ev.scores)
                  const rec = ev.continuation_recommendation ? REC_STYLE[ev.continuation_recommendation] : null
                  const RoleBadgeCls = ROLE_BADGE[ev.evaluator_role || ''] || 'bg-gray-100 text-gray-700 border-gray-200'
                  return (
                    <article key={ev.id} className="px-6 py-5">
                      <header className="flex items-center justify-between flex-wrap gap-2 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${RoleBadgeCls}`}>
                            {ROLE_LABEL[ev.evaluator_role || ''] || ev.evaluator_role}
                          </span>
                          <span className="font-semibold text-gray-900">{ev.evaluator_name || '익명'}</span>
                          {ev.evaluator_position && <span className="text-xs text-gray-500">{ev.evaluator_position}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xl font-bold ${gradeColor(tot)}`}>{tot}<span className="text-sm text-gray-400 font-normal">/100</span></span>
                          {rec && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${rec.cls}`}>{rec.label}</span>
                          )}
                        </div>
                      </header>

                      {/* 항목별 점수 작은 표 */}
                      {ev.scores && (
                        <div className="grid grid-cols-5 gap-2 mb-3 text-center">
                          {PROBATION_CRITERIA.map((c) => {
                            const s = ev.scores?.[c.key] ?? 0
                            return (
                              <div key={c.key} className="bg-gray-50 rounded-md py-2">
                                <div className="text-[10px] text-gray-500 leading-tight px-1">{c.label.split(' ')[0]}</div>
                                <div className={`text-sm font-bold ${gradeColor(s * 5)}`}>{s}<span className="text-[10px] text-gray-400">/20</span></div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* 텍스트 코멘트들 */}
                      <div className="space-y-2 text-sm">
                        {ev.comments && (
                          <CommentBlock label="총평" content={ev.comments} color="gray" />
                        )}
                        {ev.praise && (
                          <CommentBlock label="칭찬" content={ev.praise} color="emerald" icon={ThumbsUp} />
                        )}
                        {ev.improvement && (
                          <CommentBlock label="보완 사항" content={ev.improvement} color="amber" icon={AlertTriangle} />
                        )}
                        {ev.leader_summary && (
                          <CommentBlock label="리더 총평" content={ev.leader_summary} color="blue" />
                        )}
                        {ev.exec_one_liner && (
                          <CommentBlock label="임원 한줄 코멘트" content={ev.exec_one_liner} color="emerald" />
                        )}
                        {ev.strengths && (
                          <CommentBlock label="강점" content={ev.strengths} color="purple" />
                        )}
                        {ev.ai_assessment && (
                          <CommentBlock label="AI 분석" content={ev.ai_assessment} color="purple" icon={Sparkles} />
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}

        {stagesPresent.length === 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <GraduationCap className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">아직 등록된 수습평가가 없습니다.</p>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-gray-400 py-4">
          <p>이 페이지는 외부 공유용 읽기 전용 링크입니다. · 조회 {data.link.view_count}회</p>
          {data.link.expires_at && (
            <p className="mt-1">유효 기간: {formatDate(data.link.expires_at, 'yyyy.MM.dd')} 까지</p>
          )}
          <p className="mt-2 text-gray-300">© INTEROHRIGIN HR Platform</p>
        </footer>
      </div>
    </div>
  )
}

/* ─── Sub-components ────────────────────────────────── */
function CommentBlock({
  label, content, color, icon: Icon,
}: {
  label: string
  content: string
  color: 'gray' | 'emerald' | 'amber' | 'blue' | 'purple'
  icon?: any
}) {
  const colorCls: Record<string, { bg: string; border: string; text: string; label: string }> = {
    gray:    { bg: 'bg-gray-50',     border: 'border-gray-200',     text: 'text-gray-800',    label: 'text-gray-600' },
    emerald: { bg: 'bg-emerald-50',  border: 'border-emerald-200',  text: 'text-emerald-900', label: 'text-emerald-700' },
    amber:   { bg: 'bg-amber-50',    border: 'border-amber-200',    text: 'text-amber-900',   label: 'text-amber-700' },
    blue:    { bg: 'bg-blue-50',     border: 'border-blue-200',     text: 'text-blue-900',    label: 'text-blue-700' },
    purple:  { bg: 'bg-purple-50',   border: 'border-purple-200',   text: 'text-purple-900',  label: 'text-purple-700' },
  }
  const c = colorCls[color]
  return (
    <div className={`${c.bg} border ${c.border} rounded-lg px-3 py-2`}>
      <div className={`text-[11px] font-semibold ${c.label} mb-0.5 flex items-center gap-1`}>
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <p className={`text-sm whitespace-pre-wrap leading-relaxed ${c.text}`}>{content}</p>
    </div>
  )
}
