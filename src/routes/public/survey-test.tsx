// 0513: 사전질의서 v2.0 — 관리자/임원 1차 테스트 페이지 (비로그인 접근)
// 근거: docs/HR플랫폼_기능업데이트_개발계획_0507.md Phase 1 FR-101~105 + IO_사전질의서_공통문항_v2.0.pdf
// 클라이언트 의견 반영: "성향 진단/직무 적합도/배치 검토" 라벨은 모두 숨김. 일반 설문처럼 자연스럽게.

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PBD_QUESTIONS, SCALE_LABELS } from '@/lib/pbd-questions'
import { COMMON_QUESTIONS, type CommonQ } from '@/lib/pbd-common-questions'

const DRAFT_KEY_BASE = 'iohr-survey-test-draft-v1'

type Step =
  | { kind: 'intro' }
  | { kind: 'common'; id: string; index: number }
  | { kind: 'pbd'; pbdIndex: number }
  | { kind: 'feedback' }
  | { kind: 'done' }

// Q1~Q9 정의는 단일 소스 lib/pbd-common-questions 에서 관리 (결과 화면과 공유)

interface PersonalMeta {
  birth_date: string
  mbti: string
  blood_type: string
  hanja_name: string
}

interface DraftState {
  tester_name: string
  tester_email: string
  tester_role: string
  personal: PersonalMeta
  common: Record<string, string>
  common_etc: Record<string, string>
  pbd: Record<string, number>
  feedback: string
  started_at: number
}

const INITIAL_DRAFT: DraftState = {
  tester_name: '',
  tester_email: '',
  tester_role: '',
  personal: { birth_date: '', mbti: '', blood_type: '', hanja_name: '' },
  common: {},
  common_etc: {},
  pbd: {},
  feedback: '',
  started_at: Date.now(),
}

const MBTI_OPTIONS = [
  'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
  'ISTP', 'ISFP', 'INFP', 'INTP',
  'ESTP', 'ESFP', 'ENFP', 'ENTP',
  'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
  '모르겠음',
]
const BLOOD_OPTIONS = ['A', 'B', 'O', 'AB', 'Rh-', '모르겠음']

export default function PublicSurveyTest() {
  const [searchParams] = useSearchParams()
  const candidateToken = searchParams.get('candidate') || ''
  const [candidateInfo, setCandidateInfo] = useState<{
    id: string; name: string; email: string; completed_at: string | null
  } | null>(null)
  const [tokenChecking, setTokenChecking] = useState(!!candidateToken)
  const [tokenError, setTokenError] = useState<string | null>(null)

  const [draft, setDraft] = useState<DraftState>(INITIAL_DRAFT)
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // 토큰 기반 candidate 정보 로드 (지원자 발송 모드)
  useEffect(() => {
    if (!candidateToken) return
    ;(async () => {
      const { data, error } = await supabase
        .rpc('get_candidate_by_pbd_token', { p_token: candidateToken })
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setTokenError('유효하지 않거나 만료된 링크입니다. 채용 담당자에게 문의해주세요.')
      } else {
        const row = Array.isArray(data) ? data[0] : data
        setCandidateInfo({
          id: row.id, name: row.name, email: row.email,
          completed_at: row.completed_at,
        })
        // 후보자 이름/이메일 자동 채움
        setDraft((d) => ({ ...d, tester_name: row.name || '', tester_email: row.email || '' }))
      }
      setTokenChecking(false)
    })()
  }, [candidateToken])

  // localStorage draft key — 후보자별 분리 (다른 후보자 응답이 섞이지 않도록)
  const DRAFT_KEY = candidateToken ? `${DRAFT_KEY_BASE}-${candidateToken}` : DRAFT_KEY_BASE

  // 단계 구성 — intro(0) + 공통 9 + PBD 20 + feedback(31) = 31 step + done
  const steps: Step[] = useMemo(() => {
    const list: Step[] = [{ kind: 'intro' }]
    COMMON_QUESTIONS.forEach((q, i) => list.push({ kind: 'common', id: q.id, index: i }))
    PBD_QUESTIONS.forEach((_, i) => list.push({ kind: 'pbd', pbdIndex: i }))
    list.push({ kind: 'feedback' })
    return list
  }, [])
  const totalSteps = steps.length
  const current = steps[step]
  const progress = Math.round((step / (totalSteps - 1)) * 100)

  // 자동 저장: localStorage 복원 (토큰 체크 완료 후)
  useEffect(() => {
    if (tokenChecking) return
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const restored = JSON.parse(raw)
        // 후보자 모드일 때는 tester_name/email 은 candidate 값 유지
        if (candidateInfo) {
          setDraft({ ...INITIAL_DRAFT, ...restored, tester_name: candidateInfo.name, tester_email: candidateInfo.email })
        } else {
          setDraft({ ...INITIAL_DRAFT, ...restored })
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenChecking])

  // 자동 저장: 응답 변화마다 localStorage 갱신
  useEffect(() => {
    if (submitted) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {}
  }, [draft, submitted, DRAFT_KEY])

  function updateCommon(id: string, value: string) {
    setDraft(d => ({ ...d, common: { ...d.common, [id]: value } }))
  }
  function updateCommonEtc(id: string, value: string) {
    setDraft(d => ({ ...d, common_etc: { ...d.common_etc, [id]: value } }))
  }
  function updatePbd(pid: string, value: number) {
    setDraft(d => ({ ...d, pbd: { ...d.pbd, [pid]: value } }))
  }

  function canProceed(): boolean {
    if (current.kind === 'intro') {
      return draft.tester_name.trim().length >= 2
    }
    if (current.kind === 'common') {
      const q = COMMON_QUESTIONS[current.index]
      const v = draft.common[q.id] || ''
      if (!q.required) return true
      if (q.type === 'choice' && q.etc_when && q.etc_when.includes(v)) {
        return (draft.common_etc[q.id] || '').trim().length > 0
      }
      return v.trim().length > 0
    }
    if (current.kind === 'pbd') {
      const pq = PBD_QUESTIONS[current.pbdIndex]
      return typeof draft.pbd[pq.id] === 'number'
    }
    return true
  }

  function goNext() {
    if (!canProceed()) return
    if (step < totalSteps - 1) setStep(step + 1)
  }
  function goPrev() {
    if (step > 0) setStep(step - 1)
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const duration = Math.round((Date.now() - draft.started_at) / 1000)
      // 공통 응답에서 etc 입력 옵션 선택 시 자유 입력값 병합
      const mergedCommon: Record<string, string> = {}
      for (const q of COMMON_QUESTIONS) {
        const v = draft.common[q.id] || ''
        const etc = draft.common_etc[q.id]
        if (q.type === 'choice' && q.etc_when?.includes(v) && etc) {
          mergedCommon[q.id] = `${v} — ${etc}`
        } else if (v) {
          mergedCommon[q.id] = v
        }
      }
      const meta = {
        // 인적 메타 (인트로 입력)
        birth_date: draft.personal.birth_date || null,
        mbti: draft.personal.mbti || null,
        blood_type: draft.personal.blood_type || null,
        hanja_name: draft.personal.hanja_name || null,
        // PDF Part 1 Q1~Q5
        Q1: mergedCommon.Q1, Q2: mergedCommon.Q2, Q3: mergedCommon.Q3,
        Q4: mergedCommon.Q4, Q5: mergedCommon.Q5,
      }
      const consent = {
        Q6: mergedCommon.Q6, Q7: mergedCommon.Q7, Q8: mergedCommon.Q8, Q9: mergedCommon.Q9,
      }
      const { error } = await supabase.from('survey_test_responses').insert({
        tester_name: draft.tester_name.trim(),
        tester_email: draft.tester_email.trim() || null,
        tester_role: draft.tester_role.trim() || null,
        meta,
        consent,
        pbd_answers: draft.pbd,
        feedback: draft.feedback.trim() || null,
        duration_seconds: duration,
        candidate_id: candidateInfo?.id || null,
      })
      if (error) throw error

      // 후보자 모드: 토큰 기반 RPC 로 candidates 업데이트 (anon RLS 우회 — SECURITY DEFINER)
      if (candidateToken) {
        await supabase.rpc('complete_pbd_survey', { p_token: candidateToken })
      }

      localStorage.removeItem(DRAFT_KEY)
      setSubmitted(true)
      setStep(totalSteps - 1)
    } catch (e: any) {
      alert('제출 중 오류가 발생했습니다: ' + (e?.message || '알 수 없는 오류'))
    } finally {
      setSubmitting(false)
    }
  }

  // 단계별 본문 렌더
  function renderBody() {
    if (tokenChecking) {
      return (
        <div className="text-center py-16">
          <Loader2 className="w-10 h-10 text-brand-500 mx-auto mb-4 animate-spin" />
          <p className="text-slate-600">링크를 확인하는 중...</p>
        </div>
      )
    }
    if (tokenError) {
      return (
        <div className="text-center py-16">
          <h2 className="text-xl font-bold text-rose-600 mb-3">링크 오류</h2>
          <p className="text-slate-600 leading-relaxed text-sm">{tokenError}</p>
        </div>
      )
    }
    // 후보자 모드에서 이미 응답 완료된 경우
    if (candidateInfo?.completed_at && !submitted) {
      return (
        <div className="text-center py-16">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-5" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">이미 응답이 완료되었습니다</h2>
          <p className="text-slate-600 text-sm">
            {new Date(candidateInfo.completed_at).toLocaleString('ko-KR')} 에 제출 완료.<br />
            추가 문의는 채용 담당자에게 부탁드립니다.
          </p>
        </div>
      )
    }
    if (submitted) {
      return (
        <div className="text-center py-16">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-slate-900 mb-3">응답해 주셔서 감사합니다</h2>
          <p className="text-slate-600 leading-relaxed">
            응답 내용이 저장되었습니다.<br />
            {candidateInfo
              ? '채용 담당자에게 자동 전달되었습니다. 빠른 시일 내에 다음 단계 안내드리겠습니다.'
              : '테스트 진행 중 불편하셨던 부분이나 개선 의견이 있으시면 채용 담당자에게 별도로 전달 부탁드립니다.'}
          </p>
        </div>
      )
    }
    if (current.kind === 'intro') {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">INTEROHRIGIN 사전질의서</h1>
            <p className="text-slate-600 leading-relaxed text-sm">
              본 질의서는 약 10~15분 정도 소요됩니다. 응답하신 내용은 면접 참고 자료로만 활용되며 외부로 공유되지 않습니다.<br />
              <span className="text-slate-500">정답은 없습니다. 평소 본인의 모습에 가장 가까운 응답을 자유롭게 선택해 주세요.</span>
            </p>
          </div>
          <div className="space-y-4">
            {candidateInfo && (
              <div className="bg-brand-50 border border-brand-200 rounded-lg p-4">
                <p className="text-sm text-brand-800">
                  <strong>{candidateInfo.name}</strong> 님, 안녕하세요. 채용 담당자가 보낸 사전질의서 링크로 접속하셨습니다.
                </p>
                <p className="text-xs text-brand-600 mt-1">{candidateInfo.email}</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">이름 <span className="text-rose-500">*</span></label>
              <input
                value={draft.tester_name}
                onChange={e => setDraft(d => ({ ...d, tester_name: e.target.value }))}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="홍길동"
                autoFocus={!candidateInfo}
                disabled={!!candidateInfo}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">한자 이름 (선택)</label>
                <input
                  value={draft.personal.hanja_name}
                  onChange={e => setDraft(d => ({ ...d, personal: { ...d.personal, hanja_name: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="洪吉童"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">생년월일 (선택)</label>
                <input
                  type="date"
                  value={draft.personal.birth_date}
                  onChange={e => setDraft(d => ({ ...d, personal: { ...d.personal, birth_date: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">MBTI (선택)</label>
                <select
                  value={draft.personal.mbti}
                  onChange={e => setDraft(d => ({ ...d, personal: { ...d.personal, mbti: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                >
                  <option value="">선택하세요</option>
                  {MBTI_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">혈액형 (선택)</label>
                <select
                  value={draft.personal.blood_type}
                  onChange={e => setDraft(d => ({ ...d, personal: { ...d.personal, blood_type: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                >
                  <option value="">선택하세요</option>
                  {BLOOD_OPTIONS.map(b => <option key={b} value={b}>{b}형</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      )
    }
    if (current.kind === 'common') {
      const q = COMMON_QUESTIONS[current.index]
      const v = draft.common[q.id] || ''
      return (
        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-brand-600 mb-2">{q.id}</div>
            <h2 className="text-lg font-semibold text-slate-900">
              {q.label}{q.required && <span className="text-rose-500 ml-1">*</span>}
            </h2>
            {q.help && <p className="text-xs text-slate-500 mt-1.5">※ {q.help}</p>}
          </div>
          {q.type === 'choice' ? (
            <div className="space-y-2">
              {q.options.map(opt => (
                <label
                  key={opt}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition ${
                    v === opt
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={opt}
                    checked={v === opt}
                    onChange={() => updateCommon(q.id, opt)}
                    className="w-4 h-4 accent-brand-600"
                  />
                  <span className="text-sm text-slate-800">{opt}</span>
                </label>
              ))}
              {q.etc_when?.includes(v) && (
                <input
                  value={draft.common_etc[q.id] || ''}
                  onChange={e => updateCommonEtc(q.id, e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg mt-2 focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder={q.etc_placeholder || '직접 입력해주세요'}
                  autoFocus
                />
              )}
            </div>
          ) : q.multiline ? (
            <textarea
              value={v}
              onChange={e => updateCommon(q.id, e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none resize-none"
              rows={4}
              placeholder={q.placeholder}
              autoFocus
            />
          ) : (
            <input
              value={v}
              onChange={e => updateCommon(q.id, e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder={q.placeholder}
              autoFocus
            />
          )}
        </div>
      )
    }
    if (current.kind === 'pbd') {
      const pq = PBD_QUESTIONS[current.pbdIndex]
      const v = draft.pbd[pq.id]
      // 응답 척도 안내는 첫 PBD 문항 (pbdIndex === 0) 에서만 자세히 안내
      const showIntro = current.pbdIndex === 0
      return (
        <div className="space-y-5">
          {showIntro && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700 leading-relaxed">
              <p className="font-medium text-slate-900 mb-1.5">이어지는 응답 방식 안내</p>
              <p>각 문항을 읽고 <strong>평소 본인의 모습에 얼마나 가까운지</strong>를 <strong>매우 그렇다 ~ 매우 아니다</strong> 중에서 선택해 주세요.</p>
              <p className="mt-1.5 text-slate-500">정답은 없습니다. 평소의 본인을 솔직하게 선택하는 것이 가장 정확합니다.</p>
            </div>
          )}
          <div>
            <div className="text-xs font-medium text-brand-600 mb-2">{pq.id}</div>
            <div className="bg-violet-50/60 border border-violet-200 rounded-lg p-5">
              <p className="text-base text-slate-900 leading-relaxed">{pq.a_text}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            {SCALE_LABELS.map(s => {
              const selected = v === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => updatePbd(pq.id, s.value)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 px-1 rounded-lg border-2 transition ${
                    selected
                      ? 'border-brand-500 bg-brand-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className={`text-lg font-bold ${selected ? 'text-brand-700' : 'text-slate-700'}`}>
                    {['①','②','③','④','⑤'][s.value - 1]}
                  </span>
                  <span className={`text-[11px] font-medium ${selected ? 'text-brand-700' : 'text-slate-600'}`}>
                    {s.short}
                  </span>
                  <span className="text-[10px] text-slate-400 leading-tight text-center hidden sm:block">{s.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      )
    }
    if (current.kind === 'feedback') {
      return (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-1.5">마지막으로, 응답 경험에 대한 의견을 들려주세요</h2>
            <p className="text-xs text-slate-500">※ 본 항목은 1차 테스트 단계에서만 사용되며, 실제 채용 시에는 표시되지 않습니다.</p>
          </div>
          <textarea
            value={draft.feedback}
            onChange={e => setDraft(d => ({ ...d, feedback: e.target.value }))}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none resize-none"
            rows={6}
            placeholder="어렵게 느낀 문항, 응답 시 부담스러웠던 표현, UI/UX 개선 의견 등을 자유롭게 작성해 주세요."
          />
        </div>
      )
    }
    return null
  }

  const isLast = step === totalSteps - 1
  const isFirst = step === 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-brand-50/40 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* 진행률 바 */}
        {!submitted && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>{step} / {totalSteps - 1}</span>
              <span>{progress}% 완료</span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* 본문 카드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          {renderBody()}
        </div>

        {/* 하단 네비 */}
        {!submitted && (
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={isFirst}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
              이전
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition shadow-sm"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                제출하기
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={!canProceed()}
                className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
              >
                다음
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        <div className="mt-8 text-center text-xs text-slate-400">
          ⓒ INTEROHRIGIN I&C · 응답 내용은 자동으로 저장됩니다
        </div>
      </div>
    </div>
  )
}
