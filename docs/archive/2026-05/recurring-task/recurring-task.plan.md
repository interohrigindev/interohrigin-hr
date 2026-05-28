# recurring-task Plan (Archived — PDCA #5)

> Archive 압축본. 전체 원본은 git history(`2beb880` 직후 archive 커밋 이전) 에 보존.
> 정책: PDCA #2~#4 동일 (원본 stub + git history 전체).

## Executive Summary

| 관점 | 내용 |
|------|------|
| Problem | 정기 반복업무를 "프로젝트 생성"으로 처리 → 끝없는 프로젝트 양산 + 일일보고 자동수집(오늘 발생 활동 기반)과 불일치. 반복성·발생일 1급 개념 부재. |
| Solution | 프로젝트와 분리된 신규 2테이블(recurring_tasks 템플릿 + recurring_task_occurrences 발생) + 자동 인스턴스 + 전날 알림(pg_cron/외부cron) + 전용 체크 + 미진행 알림. |
| Function/UX Effect | 한 번 등록 → 매 주기 자동 인스턴스 + 전날 메일 + 전용 화면 빠른 체크 + 당일 일일보고 자동 반영. |
| Core Value | 정기 업무 누락 방지 + 프로젝트/업무보고 정합성 회복 + 반복업무 1급 객체 승격. |

## 대표 결정 (Q1~Q5)
- Q1: B (템플릿 + occurrence 신규 2테이블)
- Q2: 표준 주기 — 매주 요일복수 + 매월 일자 (격주/분기/특수 OOS)
- Q3: 미진행 = 본인+관리자 알림
- Q4: 전용 체크 화면 (일일보고 통합 아님)
- Q5: 알림시각 가변 (기본 09:00)

## Success Criteria
SC-1 등록/관리 · SC-2 자동 인스턴스 멱등 · SC-3 전날 알림 · SC-4 체크 화면 진행여부 · SC-5 미진행 알림 · SC-6 일일보고 자동 반영 · SC-7 ALTER 0 + 빌드 + 회귀 0.

## Out-of-Scope
격주/분기/특수규칙, 일일보고 강제 통합, push/slack 채널.

> 전체 9섹션 원본(Impact Analysis, Risks, Architecture Considerations 등)은 git history 참조.
