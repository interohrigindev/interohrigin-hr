/**
 * 외부 사전질의서 PDF → AI 파싱 (PDCA #2 external-pre-survey-import)
 *
 * Design Ref: §4 AI Parsing Pipeline.
 * Plan SC: SC-01 (5초 내 파싱) / SC-02 (미리보기 진입) — 본 모듈은 파싱만, UI 는 Dialog 가 담당.
 * R2 (AI 파싱 부정확) 해결: confidence 정직 반환 + ok=true 여도 UI 가 < 0.7 시 ⚠️ 경고 + raw text 보존.
 *
 * 사용처:
 *   - src/components/recruitment/ExternalSurveyImportDialog.tsx (Step 3 → Step 4 전환 시 호출)
 *
 * 외부 의존:
 *   - ai-client.ts 의 generateAIContent + AIFileAttachment + getAIConfigForFeature
 *   - PDF 는 Gemini native 지원 (functions/api/ai.ts 의 GEMINI_MIME_PREFIXES 에 'application/pdf' 포함됨)
 */

import {
  generateAIContent,
  getAIConfigForFeature,
  type AIFileAttachment,
} from './ai-client'
import type { PreSurveyEntryQuestion } from '@/types/recruitment'

// ─── Public types ────────────────────────────────────────────────────

/** Parser 결과 — discriminated union (호출자가 ok 분기) */
export type ParseResult =
  | {
      ok: true
      /** 자동 생성된 id 가 부여된 질문 목록 (order 오름차순) */
      questions: PreSurveyEntryQuestion[]
      /** key 는 questions[i].id, value 는 답변. 빈 답변(미응답) 도 빈 문자열로 포함. */
      answers: Record<string, string>
      /** Gemini 자체 신고 추출 신뢰도 (0.0~1.0). UI 가 < 0.7 시 ⚠️ 경고 표시. */
      confidence: number
      /** Gemini 가 검수에 도움이 된다고 판단한 메모 (선택, "주민번호 부분은 제외했습니다" 등) */
      notes?: string
      /** Gemini 응답 원문 (디버그/사용자가 추가 검수 시 참고용. UI 는 노출 안 해도 됨) */
      rawText?: string
    }
  | {
      ok: false
      error: string
      reason: ParseFailReason
      /** AI 응답 원문 (graceful degradation — 사용자가 수동 입력 시 복사 활용) */
      rawText?: string
    }

/** 실패 사유 분류 — UI 가 사용자 안내 문구 분기에 활용 */
export type ParseFailReason =
  | 'invalid_pdf'        // 파일이 PDF 가 아님 / 손상
  | 'no_ai_config'       // ai_settings 에 활성 provider 없음
  | 'ai_call_failed'     // 네트워크/리전/할당량 — generateAIContent throw
  | 'ai_timeout'         // 사용자 abort 또는 자체 타임아웃
  | 'parse_failed'       // AI 응답을 JSON 으로 해석 불가
  | 'empty_result'       // AI 가 질문을 0개 추출 (수동 입력 권장)

// ─── Internal constants ──────────────────────────────────────────────

/** ai_feature_settings 에 매핑할 feature key. 매핑 없으면 기본 활성 provider 사용. */
const AI_FEATURE_KEY = 'external_survey_parse'

/** 자체 타임아웃 (Gemini 자체 timeout 보호 + 사용자 인내 한계) */
const PARSER_TIMEOUT_MS = 30 * 1000  // 30s

/** Gemini 추출 프롬프트 — Design §4.2 그대로 (검증된 스키마) */
const EXTRACT_PROMPT = `당신은 채용 사전질의서 PDF에서 질문-답변 쌍을 정확히 추출하는 전문가입니다.

입력: Google Form 응답을 PDF로 내려받은 문서.
출력: 반드시 아래 JSON 스키마 한 가지만. 다른 설명/마크다운/code fence 금지.

JSON 스키마:
{
  "questions": [
    { "text": "질문 원문 그대로", "answer": "답변 원문 그대로", "order": 0 }
  ],
  "extraction_confidence": 0.0,
  "notes": "사람 검수에 도움이 될 짧은 메모 (선택)"
}

추출 규칙:
1. 질문과 답변의 경계가 모호하면 보수적으로 분리 (확실하지 않은 경계는 questions 에 넣지 말고 notes 에 기록).
2. 객관식/체크박스 응답은 선택된 항목들을 콤마(", ") 로 이어 answer 로.
3. 빈 답변(미응답) 은 answer="" 로 유지 (drop 하지 말 것).
4. 질문 번호/머리말("Q1.", "1.", "①" 등) 은 text 에서 제거.
5. 응답자 이름/이메일/타임스탬프 같은 메타데이터는 questions 에 넣지 말 것 (notes 에 기록).
6. order 는 문서에 등장한 순서대로 0부터.
7. extraction_confidence: 모든 질문-답변 경계가 명확하면 0.9 이상, 경계가 모호한 항목이 있으면 0.5~0.8, 절반 이상 추측이면 0.3 이하.
8. 주민등록번호/계좌번호 같은 민감 정보가 답변에 있으면 그대로 두지 말고 마스킹(예: "******") 처리 후 notes 에 마스킹 사실 기록.

응답은 반드시 위 JSON 한 객체만, 다른 텍스트 없이 출력하세요.`

// ─── Public API ──────────────────────────────────────────────────────

/**
 * PDF Blob → 질문/답변 추출.
 *
 * Graceful degradation:
 *   - AI 미설정 / 호출 실패 / JSON 파싱 실패 → ok:false 반환. UI 는 빈 양식 + rawText 노출로 수동 입력 진입 가능.
 *   - confidence < 0.7 → ok:true 로 반환 (UI 가 경고 표시). Parser 자체는 정직하게 신뢰도 전달.
 *
 * @param pdfFile 업로드된 PDF (File 또는 Blob — Blob 의 경우 name 미상으로 'document.pdf' 가정)
 * @param options.signal 사용자 abort 용 AbortSignal (Dialog 가 [취소] 클릭 시 전달)
 */
export async function parseExternalSurveyPdf(
  pdfFile: File | Blob,
  options?: { signal?: AbortSignal },
): Promise<ParseResult> {
  // 1) 입력 가드
  const mime = pdfFile.type || 'application/pdf'
  if (mime !== 'application/pdf') {
    return { ok: false, error: 'PDF 파일만 처리할 수 있습니다.', reason: 'invalid_pdf' }
  }
  if (pdfFile.size === 0) {
    return { ok: false, error: '빈 파일은 처리할 수 없습니다.', reason: 'invalid_pdf' }
  }

  // 2) AI config 조회 — 신규 feature key. 매핑 없으면 기본 활성 provider 사용 (getAIConfigForFeature 정책)
  const config = await getAIConfigForFeature(AI_FEATURE_KEY)
  if (!config) {
    return {
      ok: false,
      error: 'AI 가 설정되지 않았습니다. 관리자에게 [설정 > AI] 에서 활성 provider 추가를 요청해주세요.',
      reason: 'no_ai_config',
    }
  }

  // 3) PDF → base64
  let base64: string
  try {
    base64 = await blobToBase64(pdfFile)
  } catch {
    return { ok: false, error: 'PDF 파일을 읽지 못했습니다. 다시 시도해주세요.', reason: 'invalid_pdf' }
  }

  const attachment: AIFileAttachment = {
    mimeType: 'application/pdf',
    base64,
    name: pdfFile instanceof File ? pdfFile.name : 'document.pdf',
  }

  // 4) Gemini 호출 (자체 타임아웃 + 사용자 abort 모두 지원)
  let rawText = ''
  try {
    rawText = await callWithTimeoutAndAbort(
      () => generateAIContent(config, EXTRACT_PROMPT, [attachment]).then((r) => r.content),
      PARSER_TIMEOUT_MS,
      options?.signal,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === '__TIMEOUT__' || msg === '__ABORTED__') {
      return {
        ok: false,
        error: msg === '__ABORTED__' ? '사용자가 중단했습니다.' : 'AI 응답이 30초 안에 도착하지 않았습니다. 다시 시도하거나 수동 입력으로 진행해주세요.',
        reason: 'ai_timeout',
      }
    }
    return {
      ok: false,
      error: `AI 호출에 실패했습니다: ${msg.slice(0, 200)}`,
      reason: 'ai_call_failed',
    }
  }

  // 5) JSON 파싱 — code fence 제거 + 첫 { ... } 블록만 추출
  const parsed = tryParseJson(rawText)
  if (!parsed) {
    return {
      ok: false,
      error: 'AI 응답을 JSON 으로 해석하지 못했습니다. 수동 입력으로 진행해주세요.',
      reason: 'parse_failed',
      rawText,
    }
  }

  // 6) 정규화
  const ts = Date.now()
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : []
  const questions: PreSurveyEntryQuestion[] = []
  const answers: Record<string, string> = {}

  rawQuestions.forEach((q, i) => {
    if (!q || typeof q !== 'object') return
    const text = String((q as { text?: unknown }).text ?? '').trim()
    if (!text) return  // 빈 질문은 skip (notes 에 들어갔어야 할 메타)
    const answer = String((q as { answer?: unknown }).answer ?? '')
    const orderRaw = (q as { order?: unknown }).order
    const order = typeof orderRaw === 'number' && Number.isFinite(orderRaw) ? orderRaw : i
    const id = `manual_${ts}_${questions.length}`
    questions.push({ id, text, order, required: false })
    answers[id] = answer
  })

  if (questions.length === 0) {
    return {
      ok: false,
      error: 'AI 가 질문-답변 쌍을 추출하지 못했습니다. 수동으로 입력해주세요.',
      reason: 'empty_result',
      rawText,
    }
  }

  // order 정렬 + 정수화
  questions.sort((a, b) => a.order - b.order)
  questions.forEach((q, i) => { q.order = i })

  const confidenceRaw = (parsed as { extraction_confidence?: unknown }).extraction_confidence
  const confidence = typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0.5

  const notesRaw = (parsed as { notes?: unknown }).notes
  const notes = typeof notesRaw === 'string' && notesRaw.trim() ? notesRaw.trim() : undefined

  return { ok: true, questions, answers, confidence, notes, rawText }
}

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Blob → base64 (브라우저 호환).
 *
 * arrayBuffer 를 받아 청크 단위로 String.fromCharCode 적용 → btoa.
 * (FileReader.readAsDataURL 보다 빠르고 동기적으로 청크 처리 가능)
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, i + CHUNK)
    binary += String.fromCharCode(...sub)
  }
  return btoa(binary)
}

/**
 * code fence (```json ... ```) / 양끝 공백 제거 후 첫 { ... } 블록 JSON.parse.
 * 실패 시 null.
 */
function tryParseJson(text: string): Record<string, unknown> | null {
  if (!text) return null
  let cleaned = text.trim()
  // code fence 제거
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  // 첫 { 부터 마지막 } 까지 슬라이스 (앞뒤 설명 텍스트 제거 방어)
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return null
  const jsonSlice = cleaned.slice(first, last + 1)
  try {
    const parsed: unknown = JSON.parse(jsonSlice)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

/**
 * 타임아웃 + AbortSignal 동시 지원 wrapper.
 * - 타임아웃 시 Error('__TIMEOUT__') reject
 * - signal abort 시 Error('__ABORTED__') reject
 * - fn 자체 throw 는 그대로 전파
 *
 * 주의: generateAIContent 자체는 abort 를 지원하지 않으므로 abort 는 "응답 폐기" 의미.
 * 백그라운드에서 응답이 도착해도 Promise 는 이미 reject 됨.
 */
function callWithTimeoutAndAbort<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('__TIMEOUT__'))
    }, timeoutMs)
    const onAbort = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error('__ABORTED__'))
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    fn().then(
      (v) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}
