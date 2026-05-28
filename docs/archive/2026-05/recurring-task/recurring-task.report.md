# recurring-task Completion Report (Archived — PDCA #5)

> Archive 압축본. 전체 원본은 git history 에 보존. 정책: PDCA #2~#4 동일.

## Executive Summary
| 관점 | 내용 |
|------|------|
| Problem | 정기 반복업무를 프로젝트로 처리 → 끝없는 프로젝트 + 일일보고 자동수집 불일치 + 발생일 개념 부재. |
| Solution | 신규 2테이블 + 3 RPC + CF Function 2 + 전용 화면 2 + 일일보고 국소 반영. |
| Function/UX Effect | 한 번 등록 → 매 주기 자동 인스턴스 + 전날 메일 + 빠른 체크 + 당일 일일보고 자동 반영 + 미진행 본인/관리자 알림. |
| Core Value | 정기 업무 누락 방지 + 프로젝트/업무보고 정합성 회복 + 반복업무 1급 객체 승격. |

### Value Delivered
- 품질: Match 98.4% / SC 7/7 / Critical 0 / 회귀 0(구조적) / 빌드 3회 통과
- 준법: ALTER 0 / RLS 본인+관리자(hr_admin 포함)
- 효율: 단일일 6세션 / 코드 commit 3건
- 기능: 등록→자동인스턴스(멱등)→전날알림→전용체크→일일보고반영→미진행알림

## Key Decisions
B 데이터모델 / 옵션 C / materialize 자정 / reminder 30분매칭(기본09:00) / 외부cron→CF Function 발송(app.* null 폴백) / 전용 체크화면(Q4) / FR-08 자동반영 / 미진행 본인+관리자(Q3) — 전부 준수.

## SC Final: 7/7 Met (SC-3/5 런타임은 운영 cron 등록 후)

## 산출물
- commits: `f59f892`(S1 DB+RPC+cron) / `d4f4283`(S2 CF Function+이메일+타입/훅/관리화면) / `2beb880`(S3 체크화면+일일보고반영)
- DB: `135_recurring_task.sql`
- 서버: `functions/api/cron-recurring-reminder.ts`, `cron-recurring-missed.ts`
- 클라: `types/recurring-task.ts`, `hooks/useRecurringTasks.ts`, `routes/projects/recurring-manage.tsx`, `routes/projects/recurring-check.tsx`
- 수정(추가만): `email-templates.ts`, `work/daily-report.tsx`, `App.tsx`, `layout/Sidebar.tsx`

## 향후 권고
1. **⚠️ 운영 cron 등록 (필수)** — 배포만으론 알림 자동작동 안 함. 외부 cron에 `/api/cron-recurring-reminder`(30분/매시간) + `/api/cron-recurring-missed`(1일1회) + `X-Cron-Secret` 헤더. CF env(CRON_SECRET/SUPABASE_SERVICE_ROLE_KEY/GMAIL_*) 확인. materialize는 pg_cron 등록 완료(S1).
2. 실 반복업무 1건 e2e (등록→materialize→전날알림→체크→일일보고반영→미진행알림)
3. autoMerge race(I-2) 실측 — 저장 보고서 + 같은날 done 체크 후 재진입 시 완료 섹션 유지 확인
4. (선택) 체크화면 과거일 조회 / 관리자 전체 occurrence 모니터링 뷰

> 전체 원본은 git history 참조.
