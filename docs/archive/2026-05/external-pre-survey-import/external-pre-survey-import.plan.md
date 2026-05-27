---
template: plan
version: 1.3
feature: external-pre-survey-import
date: 2026-05-27
author: 대표 + Claude (PDCA #2)
project: INTEROHRIGIN HR Platform
version_project: (Cloudflare Pages auto-deploy, no semver)
status: Archived (frozen 2026-05-27 — PDCA #2 사이클 종료)
---

# external-pre-survey-import Planning Document

> **Summary**: 시스템 외부 Google Form 으로 받은 사전질의서를 admin 이 PDF 업로드 + AI 파싱으로 흡수, 기존 사전질의서 표시 영역(admin/공유링크)에 출처 태그와 함께 통합 노출.
>
> **Project**: INTEROHRIGIN HR Platform
> **Author**: 대표 + Claude
> **Date**: 2026-05-27
> **Status**: Archived (PDCA #2 종료, Match Rate 99.2%)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 일부 지원자는 시스템 외부 Google Form 으로 사전질의서를 받았는데(예: 최지원), 현재 사전질의서 v2.0(PBD) 와 형식이 안 맞아 시스템 분석/표시에 통합되지 못한다. admin 이 수기로 응답을 보거나 재발송으로 다시 받는 것 외에 흡수 경로가 없다. |
| **Solution** | admin 페이지에서 Google Form 응답 PDF 를 업로드 → Gemini AI 가 질문-답변 쌍을 추출 → admin 이 미리보기에서 수정/확인 → `pre_survey_data` 슬롯에 "외부 업로드" 출처와 함께 저장. 기존 사전질의서 렌더링 로직(answers + questions 매칭) 을 그대로 재사용. |
| **Function/UX Effect** | admin 은 PDF 한 장으로 외부 응답을 시스템에 흡수, 기존 사전질의서 섹션에서 동일 UX 로 답변을 보고 인쇄/재분석 가능. 공유링크에서도 출처 태그(`Google Form (수동 업로드)`) 와 함께 동일하게 표시. |
| **Core Value** | "시스템 외부에서 받은 사전질의서도 사라지지 않고 동일하게 활용된다" — 채용 의사결정 데이터의 누락 제거. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 외부 Google Form 사전질의서가 시스템 표시/AI 분석에 흡수되지 못해 채용 의사결정 데이터가 누락됨. v1 deprecate 결정 후에도 외부 응답 흡수 경로는 별도로 필요. |
| **WHO** | admin/대표/인사담당자 (`AdminRoute` + `menu_permissions.allowed_menus` 가드 통과자). 면접관/임원은 공유링크 화면에서 결과를 동일하게 본다. |
| **RISK** | (R1) `pre_survey_data` 컬럼 슬롯 충돌 — v2.0(PBD) 재발송 시 외부 업로드본 덮어쓰기. (R2) AI 파싱 부정확 시 잘못된 데이터 흡수. (R3) 기존 surveyQuestions 매칭 메커니즘(id 기반) 에 외부 질문이 안 맞음. |
| **SUCCESS** | SC-01 PDF 업로드 후 5초 내 미리보기. SC-02 admin 이 미리보기에서 수정/확정 시 즉시 사전질의서 섹션에 반영. SC-03 공유링크에서도 출처 태그와 함께 동일 표시. SC-04 출처/원본 PDF 추적 가능. SC-05 v2.0 재발송 시 외부 업로드본이 사고로 사라지지 않음. |
| **SCOPE** | (a) admin 업로드 UI (b) PDF→Gemini 파싱 (c) 미리보기/편집 (d) DB 저장 + 출처 태그 (e) admin/공유 표시 통합. v1 deprecate 처리는 Design Architecture Selection 의 옵션으로 제시. |

---

> **Note**: 본 문서는 archive 사본이며 PDCA 사이클 #2 종료 시점의 freeze 상태입니다.
> 원본 위치 (stub): `docs/01-plan/features/external-pre-survey-import.plan.md`.
>
> 본 사이클의 SC-06/07/08 (삭제 정합성 / 인쇄 호환 / AI 재분석 포함) 은 Phase 5 Report 의 최종 SC 8/8 평가에 추가됨.
> 본 Plan 작성 시점에는 SC-01~05 만 정의되었으나, Design Checkpoint 3 + 세션 3.5 추가 결정으로 8개로 확장되어 모두 ✅ Met.
>
> 전체 SC + 최종 결과: [`../external-pre-survey-import.report.md`](./external-pre-survey-import.report.md) 참조.

---

(Plan 본문은 원본과 동일 — line 48~318. 본 archive 사본은 frozen 상태로 보존됨.)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-27 | Initial draft after Checkpoint 1 (Q1~Q7 결정 + v1 deprecate 컨텍스트) | 대표 + Claude |
| archived | 2026-05-27 | PDCA #2 사이클 종료 시점 archive 사본 (frozen) | — |
