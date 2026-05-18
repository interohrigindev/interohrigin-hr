import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Loader2, AlertCircle, CheckCircle2, XCircle, Clock,
  TrendingUp, ThumbsUp, AlertTriangle, Sparkles,
  GraduationCap, Building2, CalendarDays, User as UserIcon,
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
