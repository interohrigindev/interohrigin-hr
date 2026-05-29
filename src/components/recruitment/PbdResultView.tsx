// 사전질의서 v2.0 (PBD) 결과 상세 뷰 — 공통 컴포넌트
// 사용처:
//   - /admin/survey-test-results (DetailDrawer 내부)
//   - /admin/candidates/:id (지원자 상세 페이지 인라인)

import { useState } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import {
  PBD_QUESTIONS, scorePbd, AXIS_DETAILS, DOMAIN_PROFILES,
  type PbdScores, type PbdAxis,
} from '@/lib/pbd-questions'
import { COMMON_QUESTION_LABELS } from '@/lib/pbd-common-questions'

export interface PbdResultRow {
  id?: string
  tester_name?: string
  tester_email?: string | null
  tester_role?: string | null
  meta?: Record<string, unknown> | null
  consent?: Record<string, unknown> | null
  pbd_answers?: Record<string, number> | null
  feedback?: string | null
  created_at?: string
}

interface Props {
  row: PbdResultRow
  showHeader?: boolean // false 면 응답자 프로필 카드 생략 (지원자 상세에서는 이미 표시되므로)
  showQuestionBreakdown?: boolean // false 면 P1~P20 문항별 응답 섹션 생략 (외부 공유 페이지에서는 비공개)
}

export default function PbdResultView({ row, showHeader = true, showQuestionBreakdown = true }: Props) {
  const scores: PbdScores | null = scorePbd(row.pbd_answers || {})
  const meta = (row.meta as Record<string, unknown>) || {}
  const consent = (row.consent as Record<string, unknown>) || {}

  return (
    <div className="space-y-6">
      {showHeader && (
        <section className="bg-gradient-to-br from-slate-50 to-brand-50/40 border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">응답자 프로필</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {!!meta.hanja_name && <ProfileItem label="한자 이름" value={String(meta.hanja_name)} />}
            {!!meta.birth_date && <ProfileItem label="생년월일" value={String(meta.birth_date)} />}
            {!!meta.mbti && <ProfileItem label="MBTI" value={String(meta.mbti)} />}
            {!!meta.blood_type && <ProfileItem label="혈액형" value={`${meta.blood_type}형`} />}
            {!!row.tester_email && <ProfileItem label="이메일" value={row.tester_email} />}
            {!!row.tester_role && <ProfileItem label="소속/직책" value={row.tester_role} />}
            {!!meta.Q2 && <ProfileItem label="지원 분야" value={String(meta.Q2)} fullWidth />}
          </dl>
        </section>
      )}

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
              <div className="text-xs text-brand-700 font-medium mb-1">도메인 매핑 (직무 연관)</div>
              <div className="text-base font-bold text-brand-900 mb-0.5">{scores.domain}</div>
              <div className="text-xs text-slate-600 mb-2 break-keep">{scores.domain_strength}</div>
              {(() => {
                const applied = String(meta.Q2 || '').trim()
                const renderJobs = (jobs: string[], hitCls: string, baseCls: string) => (
                  jobs.length === 0 ? <span className="text-slate-400">-</span> : (
                    <div className="flex flex-wrap gap-1">
                      {jobs.map((j) => {
                        const hit = applied.length > 0 && applied.includes(j)
                        return (
                          <span key={j} className={`px-1.5 py-0.5 rounded text-[11px] border ${hit ? hitCls : baseCls}`}>
                            {j}{hit && ' ◀ 지원'}
                          </span>
                        )
                      })}
                    </div>
                  )
                )
                return (
                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="text-emerald-700 font-semibold mb-1">적합 직무군 (도메인 강점 부합)</div>
                      {renderJobs(scores.fit_jobs, 'bg-emerald-600 text-white border-emerald-600 font-semibold', 'bg-white text-emerald-700 border-emerald-200')}
                    </div>
                    <div>
                      <div className="text-amber-700 font-semibold mb-1">검토 가능 직무군 (보완 전제)</div>
                      {renderJobs(scores.check_jobs, 'bg-amber-500 text-white border-amber-500 font-semibold', 'bg-white text-amber-700 border-amber-200')}
                    </div>
                    {applied && (
                      <div className="pt-1.5 border-t border-brand-100 text-slate-500 break-keep">
                        지원 분야: <span className="text-slate-700">{applied.length > 50 ? applied.slice(0, 50) + '…' : applied}</span>
                        <span className="block mt-0.5 text-[11px]">
                          {scores.fit_jobs.some((j) => applied.includes(j))
                            ? '→ 지원 분야가 적합 직무군과 부합합니다.'
                            : scores.check_jobs.some((j) => applied.includes(j))
                              ? '→ 지원 분야는 검토 직무군에 해당 — 면접에서 보완 역량 확인 권장.'
                              : '→ 지원 분야와 도메인 직무군의 직접 매칭은 확인되지 않음 (면접 확인 권장).'}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
            <IciCard ici={scores.ici} />
          </div>
        </section>
      )}

      {scores && (
        <section>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">축별 상세 해석</h3>
          <div className="space-y-3">
            <AxisDetailCard axis="C1" total={scores.C1} band={scores.c1_band} />
            <AxisDetailCard axis="C3" total={scores.C3} band={scores.c3_band} />
            <AxisDetailCard axis="S1" total={scores.S1} band={scores.s1_band} />
            <AxisDetailCard axis="S3" total={scores.S3} band={scores.s3_band} />
          </div>
        </section>
      )}

      {scores && DOMAIN_PROFILES[scores.domain] && (
        <DomainProfileSection domain={scores.domain} mbti={meta.mbti as string | undefined} />
      )}

      {scores && (
        <IntegratedGuide
          scores={scores}
          mbti={meta.mbti as string | undefined}
          applyingFor={meta.Q2 as string | undefined}
        />
      )}

      <section>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">기본정보 응답 (Q1~Q9)</h3>
        <dl className="space-y-3 text-sm">
          {Object.entries({ ...meta, ...consent })
            .filter(([k]) => /^Q\d+$/.test(k))
            .sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))
            .map(([k, v]) => (
              <div key={k} className="flex gap-3 py-2 border-b border-slate-100">
                <dt className="w-10 shrink-0 text-xs font-mono text-slate-400 pt-0.5">{k}</dt>
                <dd className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs text-slate-500 leading-snug">{COMMON_QUESTION_LABELS[k] || '질문 정보 없음'}</p>
                  <p className="text-slate-800 whitespace-pre-wrap break-keep">{(v as string) || '-'}</p>
                </dd>
              </div>
            ))}
        </dl>
      </section>

      {showQuestionBreakdown && (
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
      )}

      {row.feedback && (
        <section>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">응답자 의견</h3>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap break-keep">
            {row.feedback}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── 헬퍼 컴포넌트들 ─────────────────────────────

function ProfileItem({ label, value, fullWidth }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'col-span-2' : ''}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 break-keep">{value}</dd>
    </div>
  )
}

function ScoreCard({ title, range, total, label }: { title: string; range: string; total: number; label: string }) {
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

function IciCard({ ici }: { ici: number }) {
  const [expanded, setExpanded] = useState(ici < 70)
  const level =
    ici >= 90 ? { label: '매우 높음', badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700' } :
    ici >= 70 ? { label: '높음', badge: 'bg-blue-100 text-blue-700', text: 'text-blue-700' } :
    ici >= 55 ? { label: '보통', badge: 'bg-amber-100 text-amber-700', text: 'text-amber-700' } :
    { label: '낮음', badge: 'bg-rose-100 text-rose-700', text: 'text-rose-700' }
  const advice =
    ici >= 90 ? '결과 신뢰' :
    ici >= 70 ? '결과 신뢰' :
    ici >= 55 ? '면접 이중 확인 권고' :
    '재진단 권고'
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-xs text-slate-500 font-medium">내적 일관성 지수 (ICI)</div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${level.badge}`}>{level.label}</span>
      </div>
      <div className="text-3xl font-bold text-slate-900">{ici}</div>
      <div className={`text-xs mt-1 font-medium ${level.text}`}>{level.label} · {advice}</div>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="mt-3 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition"
      >
        <Info className="w-3 h-3" />
        ICI 가 뭔가요?
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 leading-relaxed space-y-3">
          <div>
            <div className="font-semibold text-slate-800 mb-1">ICI 란?</div>
            <p className="break-keep">
              응답의 <strong>신뢰도를 측정하는 지표</strong>입니다. 각 축에는 정방향 문항 4개 + 역방향 문항 1개(P4·P9·P14·P19)가 섞여 있어, 본인이 같은 성향이라면 두 응답이 논리적으로 일치해야 합니다. ICI 는 정·역 응답이 얼마나 일치하는지를 0~100점으로 환산합니다.
            </p>
          </div>
          <div>
            <div className="font-semibold text-slate-800 mb-1">구간별 권고 조치</div>
            <div className="space-y-1">
              <div className="flex items-start gap-2"><span className="font-mono text-emerald-700 shrink-0 w-12">90↑</span><span className="break-keep">매우 높음 — 결과를 직무 배치 자료로 활용 가능</span></div>
              <div className="flex items-start gap-2"><span className="font-mono text-blue-700 shrink-0 w-12">70~89</span><span className="break-keep">높음 — 결과 신뢰, 1~2개 항목만 면접에서 확인</span></div>
              <div className="flex items-start gap-2"><span className="font-mono text-amber-700 shrink-0 w-12">55~69</span><span className="break-keep">보통 — 면접에서 시나리오 질문으로 이중 확인</span></div>
              <div className="flex items-start gap-2"><span className="font-mono text-rose-700 shrink-0 w-12">~54</span><span className="break-keep">낮음 — 재진단 권고 또는 면접 비중 확대</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AxisDetailCard({ axis, total, band }: { axis: PbdAxis; total: number; band: 'A' | 'Mid' | 'B' }) {
  const info = AXIS_DETAILS[axis]
  const b = info.bands[band]
  const badgeColor =
    band === 'A' ? 'bg-violet-100 text-violet-700 border-violet-200' :
    band === 'B' ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-slate-100 text-slate-700 border-slate-200'
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div>
          <span className="text-xs font-mono text-slate-400">{axis}</span>
          <span className="text-sm font-semibold text-slate-900 ml-1.5">{info.title}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${badgeColor}`}>
          {b.name} · {total}점
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-2">{info.description}</p>
      <p className="text-sm text-slate-700 leading-relaxed mb-3 break-keep">{b.summary}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <div className="font-medium text-emerald-700 mb-1">예상 강점</div>
          <ul className="space-y-0.5 text-slate-600">
            {b.strengths.map(s => <li key={s} className="flex gap-1 break-keep"><span className="text-emerald-500">·</span>{s}</li>)}
          </ul>
        </div>
        <div>
          <div className="font-medium text-amber-700 mb-1">유의 관찰</div>
          <ul className="space-y-0.5 text-slate-600">
            {b.cautions.map(c => <li key={c} className="flex gap-1 break-keep"><span className="text-amber-500">·</span>{c}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}

function DomainProfileSection({ domain, mbti }: { domain: string; mbti?: string }) {
  const p = DOMAIN_PROFILES[domain]
  if (!p) return null
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-900 mb-3">종합 도메인 프로필</h3>
      <div className="bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-200 rounded-xl p-5 mb-4">
        <div className="flex items-baseline gap-2 mb-2 flex-wrap">
          <span className="text-base font-bold text-brand-900">{p.name}</span>
          <span className="text-xs font-medium text-brand-700">{domain}</span>
          {mbti && mbti !== '모르겠음' && (
            <span className="text-xs px-2 py-0.5 rounded bg-white border border-brand-200 text-brand-700">MBTI {mbti}</span>
          )}
        </div>
        <p className="text-sm text-slate-700 leading-relaxed break-keep">{p.detail}</p>
      </div>
      <div className="space-y-3">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">📋 추천 면접 질문</h4>
          <p className="text-xs text-slate-500 mb-2">진단 결과를 기반으로 본인의 사고/행동 패턴을 확인할 수 있는 질문입니다.</p>
          <ol className="space-y-1.5 text-sm text-slate-700 list-decimal list-inside">
            {p.interview_questions.map((q, i) => (
              <li key={i} className="break-keep leading-relaxed">{q}</li>
            ))}
          </ol>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">🌱 수습 기간 활용 가이드</h4>
          <p className="text-sm text-slate-700 leading-relaxed break-keep">{p.probation_guide}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">🚀 정규직 전환 · 커리어 방향성</h4>
          <p className="text-sm text-slate-700 leading-relaxed break-keep">{p.career_path}</p>
        </div>
      </div>
    </section>
  )
}

function IntegratedGuide({ scores, mbti, applyingFor }: { scores: PbdScores; mbti?: string; applyingFor?: string }) {
  const ctrl = scores.s1_band === 'A' ? '자율형' : scores.s1_band === 'B' ? '규범형' : '균형형'
  const role = scores.s3_band === 'A' ? '개인 기여형' : scores.s3_band === 'B' ? '팀 협업형' : '복합형'
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-900 mb-3">통합 활용 코멘트</h3>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2 text-sm text-slate-700 leading-relaxed">
        <p className="break-keep">
          업무 운영 스타일은 <strong className="text-brand-700">{ctrl}</strong> · <strong className="text-brand-700">{role}</strong> 으로 나타납니다.
          {ctrl === '자율형' && ' 명확한 목표를 주고 방법은 본인에게 맡겼을 때 몰입도가 높아지는 경향이 있습니다.'}
          {ctrl === '규범형' && ' 가이드와 절차가 명확할수록 안정적인 결과를 만들어내는 경향이 있습니다.'}
          {role === '개인 기여형' && ' 개별 책임이 명확한 과업에서 강점이 드러나며,'}
          {role === '팀 협업형' && ' 팀 단위의 공동 목표에서 동기 부여가 높아지며,'}
          {role === '복합형' && ' 독립과 협업 사이의 전환에 무리가 없으며,'}
          {' 평가·코칭 시 이 점을 함께 고려하면 효과적입니다.'}
        </p>
        {scores.ici < 70 && (
          <p className="text-xs text-amber-700 break-keep">
            ⚠ 내적 일관성 지수가 {scores.ici}점으로 다소 낮습니다. 면접에서 응답의 깊이를 추가로 확인해 주세요.
          </p>
        )}
        {mbti && mbti !== '모르겠음' && (
          <p className="text-xs text-slate-500 break-keep">
            * MBTI {mbti} 와 PBD {scores.domain} 도메인을 함께 보면, 자기인지(MBTI)와 실제 행동 패턴(PBD)의 정합성을 파악할 수 있습니다.
          </p>
        )}
        {applyingFor && (
          <p className="text-xs text-slate-500 break-keep">
            * 본인이 기술한 지원 직무: <strong className="text-slate-700">"{applyingFor.length > 60 ? applyingFor.slice(0, 60) + '…' : applyingFor}"</strong>
          </p>
        )}
      </div>
    </section>
  )
}
