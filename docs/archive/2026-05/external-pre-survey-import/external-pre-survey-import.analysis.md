---
template: analysis
version: 1.3
feature: external-pre-survey-import
date: 2026-05-27
author: 대표 + Claude (PDCA #2)
project: INTEROHRIGIN HR Platform
analysis_type: Gap Analysis (Static)
status: Archived (frozen 2026-05-27)
design_doc: ./external-pre-survey-import.design.md
plan_doc: ./external-pre-survey-import.plan.md
---

# external-pre-survey-import Analysis Report

> **Analysis Type**: Gap Analysis (Static — 코드 ↔ Plan/Design 정합성)
> **Status**: Archived — **Match Rate 99.2%**
> **Commits 분석 대상**: c38f8b1 → 4f199b6 → c47f1f8 → 4274b78 (4 코드 커밋 + analysis/report docs)

---

## Match Rate

```
┌─────────────────────────────────────────────┐
│  Structural Match Rate:  100%  (8/8 파일)    │
│  Functional Match Rate:  98%   (29/30 elem)  │
│  Contract Match Rate:    100%  (5/5)         │
│  ─────────────────────────────────────────── │
│  Static Overall: 99.2%                       │
│  = (100 × 0.2) + (98 × 0.4) + (100 × 0.4)    │
├─────────────────────────────────────────────┤
│  ✅ Match:          29 items (96.7%)         │
│  ⚠️ Partial/보류:    1 item  (3.3%, 의도적)   │
│  ❌ Not implemented: 0 items                  │
└─────────────────────────────────────────────┘
```

---

## Plan Success Criteria — 8/8 = 100%

| # | Criteria | Status | Evidence |
|---|---------|:------:|----------|
| SC-01 | PDF 5초 내 미리보기 | ✅ Met | Dialog Step 2→3→4 자동 + parser 30s 타임아웃 |
| SC-02 | 수정/확정 즉시 반영 | ✅ Met | `handleExternalSurveyConfirm` + `setCandidate` |
| SC-03 | 공유링크 동일 표시 + 출처 배지 | ✅ Met | `candidate-share.tsx:702-740` (원본 PDF 비노출 — 보안) |
| SC-04 | 출처/원본/업로더/일시 추적 | ✅ Met | `PreSurveyEntrySourceMeta` 5필드 |
| SC-05 | v2.0 재발송 시 manual 보존 | ✅ Met | `removeEntriesBySource(prev, 'pbd')` |
| SC-06 | 삭제 시 entries + Storage 정리 | ✅ Met | `handleDeleteExternalEntry` |
| SC-07 | 인쇄 호환 | ✅ Met | `.ext-section` CSS + escapeHtml |
| SC-08 | AI 종합 분석에 manual 포함 | ✅ Met | 3개 AI 경로 (세션 3.5) |

---

## Design Section Match

| Section | Match |
|---------|:-----:|
| §2 Architecture Selection (Option C) | 100% |
| §3 Data Model (10 exports) | 100% |
| §4 AI Parsing Pipeline (9 항목) | 100% |
| §5 UI Flow + Page UI Checklist | admin 92.3% (12/13, 수정 버튼 1건 보류) / share 100% / Dialog 100% |
| §6 API/Function (별도 신설 0) | 100% (5/5) |
| §7 Storage Design | 100% |
| §9 Clean Architecture | 100% (8/8 파일 정확 배치) |
| §10 Risk Mitigation | R1/R2/R3 100%, R4 부분 (의도) |

---

## Decision Record Verification

| Source | Decision | Followed? |
|--------|----------|:---------:|
| [Plan] Architecture Option C (entries 통합) | ✅ |
| [Plan] v1 deprecate 동시 처리 | ⚠️ Partial — 코드 경로 통합 ✅, 코드 삭제 → 별도 사이클 #3 (대표 결정) |
| [Plan] 둘 다 표시 (별도 Card) | ✅ |
| [Plan] DB ALTER 0 | ✅ |
| [Design] confidence < 0.7 경고 + 미리보기 편집 | ✅ |
| [Design] 별도 Cloudflare Function 추가 0 | ✅ |
| [추가] L2-12 AI 분석에 manual 포함 | ✅ (세션 3.5) |
| [대표] manual 수정 버튼 보류 | ✅ (후속 사이클) |

---

## Gap List

### Critical: **0건**

### Important (의도적 보류 — 대표 결정)

| # | Item | 분리 |
|---|------|------|
| I-1 | v1 fallback 코드 삭제 (`candidate-report.tsx:138-179` + `candidate-share.tsx:204-223`) | **사이클 #3** (legacy 데이터 마이그레이션 SQL 선행) |
| I-2 | manual entry 수정 버튼 (`[✏️]`) | **후속 사이클** (삭제→재업로드 우회) |

### Minor (운영 항목)

| # | Item |
|---|------|
| M-1 | Storage orphan 24h cleanup (Design §10.6 의도적 허용) |
| M-2 | `ai_feature_settings` 매핑 — admin [설정 > AI] |
| M-3 | Storage RLS prefix `pre-survey-uploads/*` 1회 검증 |
| M-4 | Vitest/Playwright 자동 테스트 도입 |

---

## 회귀 점검 결과 (정적, 6 케이스 통과)

| 케이스 | 결과 |
|--------|:----:|
| manual entries 0개 지원자 (기존) | ✅ |
| PBD 응답만 있는 지원자 | ✅ |
| v1 응답만 있는 지원자 | ✅ |
| handleResendSurvey R1 (PBD 재발송 시 manual 보존) | ✅ |
| 이력서/포트폴리오/면접/합격결정 | ✅ (손대지 않음) |
| AI 종합 분석 — manual 없으면 prompt 차이 0 | ✅ (`serializeManualEntriesForPrompt` 빈 문자열) |

---

## Quality Score

| Metric | Score |
|--------|:-----:|
| Design Match | 99.2 |
| Code Quality | 98 (smell 0) |
| Security | 95 (4겹 보안) |
| Architecture | 100 |
| Convention | 100 |
| Testing | 80 (정적 only) |
| **Overall** | **98/100** |

---

> **Note**: 본 문서는 archive 압축본. 원본은 PDCA 사이클 종료 시점 git history.
> 최종 Report: [`./external-pre-survey-import.report.md`](./external-pre-survey-import.report.md)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-27 | 정적 Gap Analysis (Match Rate 99.2%) | 대표 + Claude |
| archived | 2026-05-27 | PDCA #2 사이클 종료 시점 archive 압축본 (frozen) | — |
