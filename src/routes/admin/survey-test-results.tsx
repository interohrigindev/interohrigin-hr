// 0513: 사전질의서 v2.0 — 1차 테스트 응답 결과 조회 (관리자 전용)
// 채점 결과(PBD 스코어 + 도메인 매핑 + ICI)는 여기서만 노출됨

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Loader2, RefreshCw, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PBD_QUESTIONS, scorePbd, type PbdScores } from '@/lib/pbd-questions'

interface ResponseRow {
  id: string
  tester_name: string
  tester_email: string | null
  tester_role: string | null
  meta: Record<string, string>
  consent: Record<string, string>
  pbd_answers: Record<string, number>
  feedback: string | null
  duration_seconds: number | null
  created_at: string
}

export default function SurveyTestResults() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<ResponseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const canView = useMemo(() => {
    if (!profile) return false
    return ['admin', 'hr_admin', 'director', 'division_head', 'ceo'].includes(profile.role || '')
  }, [profile])

  const testUrl = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/survey-test`
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('survey_test_responses')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setRows(data as ResponseRow[])
    setLoading(false)
  }

  useEffect(() => {
    if (canView) load()
    else setLoading(false)
  }, [canView])

  async function handleDelete(id: string) {
    if (!confirm('이 응답을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('survey_test_responses').delete().eq('id', id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    setRows(prev => prev.filter(r => r.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function copyLink() {
    navigator.clipboard.writeText(testUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const selected = rows.find(r => r.id === selectedId) || null

  if (!canView) {
    return (
      <div className="p-8">
        <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">접근 권한이 없습니다</h2>
          <p className="text-sm text-slate-500">사전질의서 테스트 결과는 관리자 · 인사담당 · 임원 · 대표만 조회할 수 있습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">사전질의서 v2.0 — 1차 테스트 결과</h1>
            <p className="text-sm text-slate-500 mt-1">관리자/임원이 시범 응답한 내용과 PBD 채점 결과를 확인합니다.</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" />새로고침
          </button>
        </div>

        {/* 테스트 링크 공유 */}
        <div className="bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-200 rounded-xl p-5 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-brand-900 mb-1">테스트 응답 링크</h3>
              <p className="text-xs text-brand-700/80 mb-3">아래 링크를 관리자·임원에게 공유하여 시범 응답을 받아주세요. 로그인 없이 접근 가능합니다.</p>
              <div className="flex items-center gap-2">
                <code className="px-3 py-1.5 bg-white border border-brand-200 rounded text-xs text-slate-700 break-all">{testUrl}</code>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-brand-700 bg-white border border-brand-300 rounded hover:bg-brand-50 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? '복사됨' : '복사'}
                </button>
                <Link
                  to="/survey-test"
                  target="_blank"
                  className="px-2.5 py-1.5 text-xs font-medium text-white bg-brand-600 rounded hover:bg-brand-700 shrink-0"
                >
                  새 창에서 열기
                </Link>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500 shrink-0">
              <div className="text-2xl font-bold text-brand-700">{rows.length}</div>
              <div>건 수집</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
            <p className="text-slate-500">아직 수집된 응답이 없습니다.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">응답자</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">사고/추론/통제/역할</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">도메인</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">ICI</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">소요</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">응답일</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => {
                  const s = scorePbd(r.pbd_answers || {})
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50 cursor-pointer transition"
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{r.tester_name}</div>
                        <div className="text-xs text-slate-500">{r.tester_role || r.tester_email || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        {s ? (
                          <div className="flex flex-wrap gap-1 text-[11px]">
                            <Badge axis="C1" value={s.C1} label={s.c1_label} />
                            <Badge axis="C3" value={s.C3} label={s.c3_label} />
                            <Badge axis="S1" value={s.S1} label={s.s1_label} />
                            <Badge axis="S3" value={s.S3} label={s.s3_label} />
                          </div>
                        ) : <span className="text-xs text-slate-400">미완성</span>}
                      </td>
                      <td className="px-4 py-3">
                        {s ? (
                          <div>
                            <div className="font-medium text-slate-900">{s.domain}</div>
                            <div className="text-xs text-slate-500">{s.domain_strength.split(' — ')[0]}</div>
                          </div>
                        ) : <span className="text-xs text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s ? <IciBadge ici={s.ici} /> : <span className="text-xs text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500">
                        {r.duration_seconds ? `${Math.round(r.duration_seconds / 60)}분` : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(r.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(r.id) }}
                          className="text-rose-500 hover:text-rose-700 p-1"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {selected && (
        <DetailDrawer
          row={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

function Badge({ axis, value, label }: { axis: string; value: number; label: string }) {
  const color =
    label.includes('우세') ? 'bg-brand-100 text-brand-700' :
    label.includes('균형') ? 'bg-slate-100 text-slate-600' :
    'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${color} whitespace-nowrap`}>
      <span className="font-mono opacity-70">{axis}</span>
      <span className="font-semibold">{value}</span>
      <span className="opacity-70">· {label.replace(' 우세', '')}</span>
    </span>
  )
}

function IciBadge({ ici }: { ici: number }) {
  let color = 'bg-slate-100 text-slate-600'
  if (ici >= 90) color = 'bg-emerald-100 text-emerald-700'
  else if (ici >= 70) color = 'bg-blue-100 text-blue-700'
  else if (ici >= 55) color = 'bg-amber-100 text-amber-700'
  else color = 'bg-rose-100 text-rose-700'
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{ici}</span>
}

function DetailDrawer({ row, onClose }: { row: ResponseRow; onClose: () => void }) {
  const scores: PbdScores | null = scorePbd(row.pbd_answers || {})

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch justify-end" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-white shadow-xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{row.tester_name}</h2>
            <p className="text-xs text-slate-500">
              {row.tester_role || '-'} · {row.tester_email || '-'} · {new Date(row.created_at).toLocaleString('ko-KR')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* PBD 스코어 카드 */}
          {scores && (
            <section>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">PBD 성향 진단 결과</h3>
              <div className="grid grid-cols-2 gap-3">
                <ScoreCard title="사고방식 C1" range="직관적 ↔ 숙고적" total={scores.C1} label={scores.c1_label} />
                <ScoreCard title="추론방식 C3" range="귀납적 ↔ 연역적" total={scores.C3} label={scores.c3_label} />
                <ScoreCard title="통제방식 S1" range="내적통제 ↔ 외적통제" total={scores.S1} label={scores.s1_label} />
                <ScoreCard title="역할방식 S3" range="개인적 ↔ 집단적" total={scores.S3} label={scores.s3_label} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-200 rounded-lg p-4">
                  <div className="text-xs text-brand-700 font-medium mb-1">도메인 매핑</div>
                  <div className="text-base font-bold text-brand-900 mb-1">{scores.domain}</div>
                  <div className="text-xs text-slate-600">{scores.domain_strength}</div>
                  <div className="mt-2 text-xs">
                    <div className="text-slate-700 mb-1"><strong>적합 직무:</strong> {scores.fit_jobs.join(', ') || '-'}</div>
                    <div className="text-slate-500"><strong>검토 가능:</strong> {scores.check_jobs.join(', ') || '-'}</div>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500 font-medium mb-1">내적 일관성 지수 (ICI)</div>
                  <div className="text-3xl font-bold text-slate-900">{scores.ici}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {scores.ici >= 90 ? '매우 높음 · 결과 신뢰' :
                     scores.ici >= 70 ? '높음 · 결과 신뢰' :
                     scores.ici >= 55 ? '보통 · 면접 이중 확인 권고' :
                     '낮음 · 재진단 권고'}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 공통 응답 */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">기본정보 응답 (Q1~Q9)</h3>
            <dl className="space-y-2 text-sm">
              {Object.entries({ ...row.meta, ...row.consent }).map(([k, v]) => (
                <div key={k} className="flex gap-3 py-1.5 border-b border-slate-100">
                  <dt className="w-12 shrink-0 text-xs font-mono text-slate-400">{k}</dt>
                  <dd className="text-slate-700 whitespace-pre-wrap break-keep">{v || '-'}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* PBD 문항별 응답 */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">문항별 응답 (P1~P20)</h3>
            <div className="space-y-1.5 text-xs">
              {PBD_QUESTIONS.map(q => {
                const raw = row.pbd_answers?.[q.id]
                const adjusted = q.reversed && typeof raw === 'number' ? 6 - raw : raw
                return (
                  <div key={q.id} className="flex items-center gap-2 py-1 border-b border-slate-100">
                    <span className="w-10 font-mono text-slate-400">{q.id}{q.reversed && '✦'}</span>
                    <span className="text-slate-600 truncate flex-1">{q.a_label} ↔ {q.b_label}</span>
                    <span className="font-mono font-bold text-slate-900 w-6 text-center">{raw ?? '-'}</span>
                    {q.reversed && (
                      <span className="text-[10px] text-slate-400 w-12 text-right">(역산 {adjusted})</span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* 피드백 */}
          {row.feedback && (
            <section>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">응답자 의견</h3>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap break-keep">
                {row.feedback}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function ScoreCard({ title, range, total, label }: { title: string; range: string; total: number; label: string }) {
  // 5(좌측) ~ 25(우측), 15가 정중앙
  const percent = ((total - 5) / 20) * 100
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        <span className="text-base font-bold text-slate-900">{total}</span>
      </div>
      <div className="text-[11px] text-slate-500 mb-2">{range}</div>
      <div className="relative h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="absolute top-0 h-full w-1.5 bg-brand-600 rounded-full -translate-x-1/2"
          style={{ left: `${percent}%` }}
        />
      </div>
      <div className="text-[11px] font-medium text-brand-700 mt-1.5">{label}</div>
    </div>
  )
}
