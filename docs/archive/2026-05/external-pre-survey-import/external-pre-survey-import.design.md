---
template: design
version: 1.3
feature: external-pre-survey-import
date: 2026-05-27
author: 대표 + Claude (PDCA #2)
project: INTEROHRIGIN HR Platform
status: Archived (frozen 2026-05-27 — PDCA #2 사이클 종료)
plan_doc: ./external-pre-survey-import.plan.md
---

# external-pre-survey-import Design Document

> **Summary**: admin 이 외부 Google Form 응답 PDF 를 업로드 → Gemini AI 로 질문-답변 추출 → 미리보기에서 수정/확정 → `pre_survey_data` 의 entries 배열에 출처와 함께 저장. v2.0(PBD) 와 외부 업로드본을 모두 시간순 카드로 노출 (정보 손실 0).
>
> **Status**: Archived — Architecture Option C 선택 (entries 배열 통합 + v1 deprecate 분리)
> **Planning Doc**: [`external-pre-survey-import.plan.md`](./external-pre-survey-import.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 외부 Google Form 사전질의서가 시스템 표시/AI 분석에 흡수되지 못해 채용 의사결정 데이터 누락. v1 deprecate 결정 후에도 외부 응답 흡수 경로는 별도 필요. |
| **WHO** | admin/대표/인사담당자 |
| **RISK** | R1 슬롯 충돌 / R2 AI 파싱 부정확 / R3 id 매칭 부호환 |
| **SUCCESS** | SC-01~08 (Plan §4.1 + 세션 3.5 확장) |
| **SCOPE** | (a~e) admin 업로드 → 파싱 → 편집 → entries 저장 → admin/공유 표시 |

---

## 2.0 Architecture Selection (3옵션 비교 — 핵심 의사결정)

| Criteria | Option A: 최소 변경 (jsonb 안 분기) | Option B: 별도 컬럼 (부적격) | **Option C: entries 배열 통합 + v1 deprecate (선택)** |
|----------|:-:|:-:|:-:|
| 데이터 구조 | `{ answers, meta, manual?: {...} }` | `pre_survey_data_external jsonb` 별도 컬럼 (ALTER) | **`{ entries: [{source, answers, questions?, source_meta, created_at}, ...] }`** |
| ALTER 금지 준수 | ✅ | ❌ **위반 → 자동 부적격** | ✅ |
| R1 해결 | 분기별 선택 초기화 | 분리 컬럼 자동 | `entries.filter(s!=='pbd')` 한 줄 |
| R3 해결 | manual self-contained | 별도 컬럼 self-contained | 모든 entry self-contained (통일) |
| #5 둘 다 표시 | 두 분기 각 렌더 | 두 컬럼 각 렌더 | entries 순회 1개 코드 경로 |
| 확장성 (Naver/Notion 추가) | 분기 키 또 추가 | 컬럼 또 추가 (ALTER) | **source enum 만 추가 (0 코드 변경)** |
| v1 deprecate 처리 | 별도 사이클 | 별도 사이클 | **본 사이클 코드 경로 통합 동시 처리** |

**Selected**: **Option C** (entries 배열 통합) — Rationale: 대표가 v1 deprecate + 둘 다 표시 둘 다 명시, R1 가장 깨끗 해결, 확장성 최상, DB 마이그레이션 불필요.

---

## 3. Data Model (선택된 옵션 기준)

```typescript
// src/types/recruitment.ts 확장
export type PreSurveySource = 'pbd' | 'manual_upload'
export const PRE_SURVEY_SOURCE_LABEL: Record<PreSurveySource, string> = {
  pbd: 'v2.0 PBD',
  manual_upload: 'Google Form (수동 업로드)',
}
export interface PreSurveyEntry {
  id: string
  source: PreSurveySource
  source_label: string
  answers: Record<string, string>
  questions?: PreSurveyEntryQuestion[]   // self-contained
  source_meta?: PreSurveyEntrySourceMeta // original_pdf_path/uploaded_by/extraction_confidence/edited 등
  created_at: string
}
export interface PreSurveyData {
  entries?: PreSurveyEntry[]
  // legacy v2.0 top-level (backward-compat)
  answers?: Record<string, string>
  meta?: { birth_date?, mbti?, hanja_name?, blood_type? }
  completed_at?: string
}
```

**Backward Compatibility Shim**: `readPreSurveyEntries(raw)` 가 읽기 시점에 legacy `answers/meta/completed_at` 을 entry 1개 (`id: 'pbd_legacy'`) 로 자동 변환 → DB 마이그레이션 0.

---

## 4. AI Parsing Pipeline (요약)

- `parseExternalSurveyPdf(pdfFile, { signal? }): Promise<ParseResult>`
- `ParseResult` discriminated union — `{ ok: true, questions, answers, confidence, notes?, rawText? }` 또는 `{ ok: false, error, reason, rawText? }`
- 6개 실패 분류: `invalid_pdf` / `no_ai_config` / `ai_call_failed` / `ai_timeout` / `parse_failed` / `empty_result`
- Gemini 프롬프트 8개 규칙 (객관식 콤마 직렬화 / 빈 답변 보존 / 머리말 제거 / 메타데이터 분리 / order 0부터 / confidence 정직 보고 / 민감정보 마스킹)
- 30s 타임아웃 + AbortSignal + graceful degradation (JSON 파싱 실패 시 rawText 보존)

---

## 5. UI Flow (5-step Dialog)

```
admin 클릭 "PDF 업로드"
  → Step 1 select (drop/click + 20MB 가드)
  → Step 2 uploading (Storage)
  → Step 3 parsing (30s 타임아웃 + abort 가능)
  → Step 4 review (편집/추가/삭제 + confidence<0.7 경고 + rawText 펼쳐보기)
  → Step 5 saving → onConfirm 콜백 (호출자가 DB update + 토스트)
```

**둘 다 표시 정책**: PBD 카드 (기존 PbdResultView) + Manual 카드 (entries 순회) — 별도 Card 구조로 동시 노출. 공유링크도 동일 (단 원본 PDF 다운로드 비노출 — 보안).

---

## 6/7. API + Storage (요약)

- **별도 Cloudflare Function 추가 0** — 클라이언트-only 처리 (Storage 직접 + `/api/ai` 프록시 기존 그대로 + Supabase update 직접)
- Storage path: `pre-survey-uploads/{candidate_id}/{timestamp}_{sanitized}.pdf` — `resumes` 버킷 재사용
- `candidate-storage.ts` 진입점에 `uploadExternalSurveyPdf` + `deleteExternalSurveyPdf` 추가
- 공유링크는 PDF kind enum 미추가로 다운로드 자동 차단

---

## 10. Risk Mitigation (요약)

| Risk | 해결 |
|------|------|
| R1 슬롯 충돌 | `removeEntriesBySource(data, 'pbd')` 헬퍼 → `handleResendSurvey` 한 줄 교체 |
| R2 AI 파싱 | Parser 정직 confidence + Dialog 편집 + graceful degradation (rawText) |
| R3 id 매칭 | entries self-contained questions[] |
| R4 v1 deprecate | 본 사이클 코드 경로 통합만, 코드 삭제는 별도 사이클 #3 |
| Storage orphan | 의도적 허용, 후속 cleanup cron 검토 |
| edited 정합성 | `edited: true` 메타 + UI "수정됨" 라벨 |

---

## 11. Implementation Module Map (4세션 → 실제 5세션)

| Module | Scope Key | Status |
|--------|-----------|:------:|
| Domain + Helpers | module-1 | ✅ 세션 1 (`c38f8b1`) |
| Storage + Parser | module-2 | ✅ 세션 2 (`4f199b6`) |
| Import Dialog | module-3 | ✅ 세션 3 (`c47f1f8`) |
| admin 통합 | module-4 | ✅ 세션 3 |
| 공유 통합 | module-5 | ✅ 세션 3 |
| v1 cleanup | module-6 | ⚠️ **별도 사이클 #3** |
| AI 분석 entries 포함 | module-3.5 (추가) | ✅ 세션 3.5 (`4274b78`) |
| 정적 검증 | module-7 | ✅ 세션 4 (analysis 99.2%) |

---

> **Note**: 본 문서는 archive 압축본입니다. 원본 (Plan + Design + 30+ tables/codeblocks 전체) 은 PDCA 사이클 종료 시점 (2026-05-27) 의 git history 에 보존됨.
> 최종 결과: [`./external-pre-survey-import.report.md`](./external-pre-survey-import.report.md).
> 정적 분석 결과: [`./external-pre-survey-import.analysis.md`](./external-pre-survey-import.analysis.md).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-27 | Initial draft after Checkpoint 3 (Option C 선택) | 대표 + Claude |
| archived | 2026-05-27 | PDCA #2 사이클 종료 시점 archive 압축본 (frozen) | — |
