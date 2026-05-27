/**
 * 사전질의서 응답 entries 헬퍼 (PDCA #2 external-pre-survey-import)
 *
 * Design Ref: §3.2 — Backward Compatibility Shim
 * Plan SC: R1 (덮어쓰기) / R3 (id 매칭) 해결의 단일 진실 원천.
 *
 * 핵심 원칙:
 *   1. 순수 함수 — DB/네트워크/사이드 이펙트 없음. 입력 → 출력만.
 *   2. 모든 함수는 입력을 mutate 하지 않고 새 객체 반환 (불변성).
 *   3. 읽기 (readPreSurveyEntries): 기존 top-level answers/meta/completed_at 을
 *      entry 1개로 자동 변환 → 신규 코드는 entries 만 다루면 됨.
 *   4. 쓰기 (addManualEntry / addPbdEntry / updateEntryById / removeEntriesBySource):
 *      DB 에는 그대로 jsonb 저장. legacy top-level 필드는 source='pbd' 제거 시 함께 정리.
 *
 * 사용처:
 *   - src/routes/recruitment/candidate-report.tsx (admin)
 *   - src/routes/public/candidate-share.tsx (공유링크)
 *   - src/components/recruitment/ExternalSurveyImportDialog.tsx (저장 시)
 *   - src/lib/recruitment-ai.ts (AI 재분석 surveyText 생성 시)
 */

import {
  PRE_SURVEY_SOURCE_LABEL,
  type PreSurveyData,
  type PreSurveyEntry,
  type PreSurveyEntryQuestion,
  type PreSurveyEntrySourceMeta,
  type PreSurveySource,
} from '@/types/recruitment'

// ─── 읽기 ────────────────────────────────────────────────────────────

/**
 * pre_survey_data jsonb 에서 entries 배열을 추출.
 *
 * 변환 규칙:
 *   - raw 가 null/undefined → []
 *   - raw.entries 가 있으면 그대로 사용
 *   - raw.answers (legacy v2.0 top-level) 가 있고 entries 에 pbd 가 없으면
 *     자동으로 entry 1개로 변환해서 합침
 *   - 시간순 정렬 (오래된 → 최신)
 *
 * @param raw `candidates.pre_survey_data` jsonb 값 (Record<string, unknown> 도 허용)
 * @returns 정렬된 entries 배열 (mutate 없음)
 */
export function readPreSurveyEntries(
  raw: PreSurveyData | Record<string, unknown> | null | undefined,
): PreSurveyEntry[] {
  if (!raw || typeof raw !== 'object') return []

  const data = raw as PreSurveyData
  const entries: PreSurveyEntry[] = Array.isArray(data.entries) ? [...data.entries] : []

  // Legacy v2.0 top-level → entry 1개로 변환 (DB 변경 없이 메모리 상 변환)
  // 단 entries 에 이미 source='pbd' 가 있으면 중복 생성 방지
  const hasPbdEntry = entries.some((e) => e?.source === 'pbd')
  const legacyAnswers = data.answers
  if (!hasPbdEntry && legacyAnswers && typeof legacyAnswers === 'object' && Object.keys(legacyAnswers).length > 0) {
    entries.push({
      id: 'pbd_legacy',
      source: 'pbd',
      source_label: PRE_SURVEY_SOURCE_LABEL.pbd,
      answers: legacyAnswers,
      // legacy entry 는 questions 미저장 — 렌더 시 surveyQuestions (pre_survey_templates) fallback
      source_meta: {},
      // legacy entry 의 시각 — completed_at 우선, 없으면 epoch 0 (가장 오래된 entry 로 취급)
      created_at: typeof data.completed_at === 'string' ? data.completed_at : new Date(0).toISOString(),
    })
  }

  // 시간순 정렬 (오래된 → 최신). 같은 ms 면 안정 정렬을 위해 id 차순
  return entries
    .filter((e): e is PreSurveyEntry => e != null && typeof e === 'object' && typeof e.source === 'string')
    .sort((a, b) => {
      const c = a.created_at.localeCompare(b.created_at)
      if (c !== 0) return c
      return a.id.localeCompare(b.id)
    })
}

/** entries 중 source 가 일치하는 첫 entry 반환 (없으면 undefined) */
export function findEntryBySource(
  raw: PreSurveyData | Record<string, unknown> | null | undefined,
  source: PreSurveySource,
): PreSurveyEntry | undefined {
  return readPreSurveyEntries(raw).find((e) => e.source === source)
}

/** entries 중 id 가 일치하는 entry 반환 (없으면 undefined) */
export function findEntryById(
  raw: PreSurveyData | Record<string, unknown> | null | undefined,
  id: string,
): PreSurveyEntry | undefined {
  return readPreSurveyEntries(raw).find((e) => e.id === id)
}

/** entries 가 1개 이상 존재하는지 (UI "응답 없음" 분기용) */
export function hasAnyEntry(
  raw: PreSurveyData | Record<string, unknown> | null | undefined,
): boolean {
  return readPreSurveyEntries(raw).length > 0
}

// ─── 쓰기 ────────────────────────────────────────────────────────────

/**
 * Manual upload entry 1개 생성용 헬퍼.
 * id 는 자동 부여 (`manual_upload_${timestamp}`).
 *
 * @param params.questions Gemini 파싱 결과 (admin 미리보기 편집 후)
 * @param params.sourceMeta original_pdf_path/uploaded_by 등
 */
export function createManualEntry(params: {
  questions: PreSurveyEntryQuestion[]
  /** key=question.id, value=답변. 빈 답변도 포함 (UI 가 미응답 처리) */
  answers: Record<string, string>
  sourceMeta: PreSurveyEntrySourceMeta
  /** 생성 시각 (테스트용 주입 가능). 기본 now */
  now?: string
}): PreSurveyEntry {
  const ts = params.now || new Date().toISOString()
  return {
    id: `manual_upload_${Date.now()}`,
    source: 'manual_upload',
    source_label: PRE_SURVEY_SOURCE_LABEL.manual_upload,
    answers: { ...params.answers },
    questions: [...params.questions].sort((a, b) => a.order - b.order),
    source_meta: { ...params.sourceMeta },
    created_at: ts,
  }
}

/**
 * pre_survey_data 의 entries 배열에 새 entry 추가.
 * 기존 데이터 보존. legacy top-level 도 그대로 유지.
 */
export function addEntry(
  raw: PreSurveyData | Record<string, unknown> | null | undefined,
  newEntry: PreSurveyEntry,
): PreSurveyData {
  const base: PreSurveyData = raw && typeof raw === 'object' ? { ...(raw as PreSurveyData) } : {}
  const existing = Array.isArray(base.entries) ? base.entries : []
  return { ...base, entries: [...existing, newEntry] }
}

/**
 * 특정 id 의 entry 를 patch 로 갱신.
 * 매칭 entry 가 없으면 변경 없이 그대로 반환.
 *
 * patch 의 source/source_label/id 는 무시 (불변).
 * questions/answers/source_meta 등 데이터는 교체 (deep merge 아님 — 호출자가 새 객체 전달).
 */
export function updateEntryById(
  raw: PreSurveyData | Record<string, unknown> | null | undefined,
  id: string,
  patch: Partial<Omit<PreSurveyEntry, 'id' | 'source' | 'source_label'>>,
): PreSurveyData {
  const base: PreSurveyData = raw && typeof raw === 'object' ? { ...(raw as PreSurveyData) } : {}
  const existing = Array.isArray(base.entries) ? base.entries : []
  let found = false
  const next = existing.map((e) => {
    if (e.id !== id) return e
    found = true
    return {
      ...e,
      ...(patch.answers !== undefined ? { answers: patch.answers } : {}),
      ...(patch.questions !== undefined ? { questions: patch.questions } : {}),
      ...(patch.source_meta !== undefined ? { source_meta: { ...e.source_meta, ...patch.source_meta } } : {}),
      ...(patch.created_at !== undefined ? { created_at: patch.created_at } : {}),
    }
  })
  if (!found) return base
  return { ...base, entries: next }
}

/**
 * 특정 source 의 entries 를 모두 제거 (예: PBD 재발송 시 'pbd' 만 정리).
 *
 * 중요 (R1 해결):
 *   - source='pbd' 제거 시 legacy top-level answers/meta/completed_at 도 함께 정리
 *     → handleResendSurvey 가 `pre_survey_data: null` 대신 본 함수를 호출하면
 *       manual_upload entries 는 자동 보존됨.
 */
export function removeEntriesBySource(
  raw: PreSurveyData | Record<string, unknown> | null | undefined,
  source: PreSurveySource,
): PreSurveyData {
  const base: PreSurveyData = raw && typeof raw === 'object' ? { ...(raw as PreSurveyData) } : {}
  const existing = Array.isArray(base.entries) ? base.entries : []
  const filtered = existing.filter((e) => e?.source !== source)

  if (source === 'pbd') {
    // legacy top-level 도 함께 정리 (pbd 의 일부로 취급)
    // entries 만 남기고 answers/meta/completed_at 제거
    return { entries: filtered }
  }
  return { ...base, entries: filtered }
}

/**
 * 특정 id 의 entry 1개만 제거.
 * 매칭이 없으면 변경 없이 반환.
 *
 * 주의: manual_upload entry 를 삭제할 때 호출자는 original_pdf_path 의 Storage 파일도
 * 함께 정리해야 함 (deleteExternalSurveyPdf 호출). 본 함수는 메모리 상의 entries 만 다룸.
 */
export function removeEntryById(
  raw: PreSurveyData | Record<string, unknown> | null | undefined,
  id: string,
): PreSurveyData {
  const base: PreSurveyData = raw && typeof raw === 'object' ? { ...(raw as PreSurveyData) } : {}
  const existing = Array.isArray(base.entries) ? base.entries : []
  return { ...base, entries: existing.filter((e) => e.id !== id) }
}

// ─── 표시 보조 ───────────────────────────────────────────────────────

/**
 * AI 재분석 surveyText 생성용 — 모든 entries 의 Q/A 를 평문으로 직렬화.
 *
 * 출력 예:
 *   [출처: v2.0 PBD]
 *   Q1. 자기소개
 *   A1. 안녕하세요...
 *
 *   [출처: Google Form (수동 업로드)]
 *   Q1. 지원 동기
 *   A1. ...
 *
 * @param raw pre_survey_data
 * @param fallbackQuestions legacy v2.0 entry (questions 없음) 를 렌더할 때 사용할 질문 템플릿
 */
export function serializeEntriesForAI(
  raw: PreSurveyData | Record<string, unknown> | null | undefined,
  fallbackQuestions?: Array<{ id: string; question: string }>,
): string {
  const entries = readPreSurveyEntries(raw)
  if (entries.length === 0) return ''

  const fallbackMap = new Map<string, string>()
  for (const q of fallbackQuestions || []) fallbackMap.set(q.id, q.question)

  return entries
    .map((entry) => {
      const header = `[출처: ${entry.source_label}]`
      const qsList: { text: string; answer: string }[] = []

      if (entry.questions && entry.questions.length > 0) {
        // self-contained
        for (const q of [...entry.questions].sort((a, b) => a.order - b.order)) {
          qsList.push({ text: q.text, answer: entry.answers[q.id] ?? '' })
        }
      } else {
        // legacy v2.0 — fallbackQuestions 매칭
        for (const [qid, ans] of Object.entries(entry.answers)) {
          const text = fallbackMap.get(qid) || `질문 ${qid}`
          qsList.push({ text, answer: ans })
        }
      }

      const body = qsList
        .map((qa, i) => `Q${i + 1}. ${qa.text}\nA${i + 1}. ${qa.answer || '(미응답)'}`)
        .join('\n\n')
      return `${header}\n${body}`
    })
    .join('\n\n---\n\n')
}

// ─── 단위 검증 케이스 (Design §8.2 L1 시나리오) ──────────────────────
//
// Vitest 미설치 환경 — 검증 케이스는 주석으로 명시 (module-7 수동 검증 시 참고).
// 향후 Vitest 도입 시 본 케이스를 그대로 test() 로 옮길 수 있도록 설계.
//
// L1-1: readPreSurveyEntries(null) === []
// L1-2: readPreSurveyEntries({ answers:{q1:'a'}, meta:{mbti:'INTJ'}, completed_at:'2026-05-20T10:00:00Z' })
//        → length===1, [0].source==='pbd', [0].id==='pbd_legacy', [0].answers===입력.answers
// L1-3: readPreSurveyEntries({ entries:[manualEntry], answers:{q1:'a'} })
//        → length===2, 시간순 (legacy pbd entry created_at=completed_at 없으면 epoch 0 → 먼저)
// L1-4: readPreSurveyEntries({ entries:[pbdEntry@'2026-05-20', manualEntry@'2026-05-27'] })
//        → length===2, [0]=pbd, [1]=manual
// L1-5: addEntry(null, manualEntry) === { entries:[manualEntry] }
// L1-6: addEntry({ entries:[pbdEntry] }, manualEntry) === { entries:[pbdEntry, manualEntry] }
// L1-7: removeEntriesBySource({ entries:[pbd, manual], answers:{q1:'a'}, completed_at:'...' }, 'pbd')
//        === { entries:[manual] }  ← legacy top-level 도 제거됨 (R1 해결의 핵심)
// L1-8: removeEntriesBySource({ entries:[pbd, manual] }, 'manual_upload')
//        === { entries:[pbd] }
// L1-9: updateEntryById({ entries:[manual{id:'X', answers:{q1:'old'}}] }, 'X', { answers:{q1:'new'} })
//        → entries[0].answers === { q1:'new' } (다른 필드는 보존)
// L1-10: createManualEntry({ questions:[...], answers:{...}, sourceMeta:{...} })
//        → id 가 `manual_upload_` 로 시작, source==='manual_upload', source_label 정확
