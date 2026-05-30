---
template: plan
version: 1.3
feature: approval-unified-notification
date: 2026-05-30
author: cto-lead (PDCA)
project: INTEROHRIGIN HR Platform
---

# 결재 통합 알림 시스템 Planning Document

> **Summary**: 일일업무보고서·모든 결재(전자결재) 흐름에서 단계별 결재자/작성자에게 헤더 종(in_app) + 웹·모바일 푸시(push) + 이메일(email) 3채널 동시 발송하고, 미결재 건은 매일 오전 푸시로 리마인드하는 통합 알림 인프라.
>
> **Project**: INTEROHRIGIN HR Platform
> **Author**: cto-lead (PDCA)
> **Date**: 2026-05-30
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 결재 진행 사실이 결재자/작성자에게 자동 통지되지 않아 결재 지연 발생. 헤더 종은 일부 이벤트(연차승급/익명제보 등)만, 이메일은 결재 통지용 템플릿 부재, 푸시는 인프라만 있고 실제 발송 안 됨. |
| **Solution** | (1) `src/lib/approval-notification.ts` 디스패처 신설로 in_app + push + email 3채널 동시 발송, (2) `approval.tsx` 4개 분기(반려/같은단계대기/다음단계전환/최종승인) + `daily-report.tsx` 송신 시점에 hook 연결, (3) `NotificationBell`에 `approval_*` 라우팅 추가, (4) `web-push` 호환 RFC8030 보강, (5) 매일 09:00 KST 미결재 리마인드 cron. |
| **Function/UX Effect** | 결재자는 헤더 종/푸시/메일 어디서든 결재 도착 즉시 인지 → 평균 결재 소요시간 단축. 메일/종 클릭 한 번에 `/admin/approval/:docId`로 직행, 비로그인 시 자동 returnTo 복귀로 세션 끊김 0. 미결재 24h+ 건은 다음날 09시 자동 재푸시. |
| **Core Value** | "결재 도착 → 즉시 인지 → 한 클릭 처리"의 마찰 없는 결재 동선. 채널 3종 중복 발송으로 단일 채널 누락에도 신뢰성 보장(in_app·email = 100% 보장, push = best-effort 단계적 강화). |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 결재 도착 통지 부재로 결재 지연 → 일일보고/연차/지출결의 등 모든 워크플로 병목. |
| **WHO** | 결재 작성자(전 직원) + 단계별 결재자(팀장/리더/임원) + 작성자(최종승인·반려 통보 수신). |
| **RISK** | (R1) Web Push aes128gcm 미구현 — 실제 브라우저 푸시 미동작. (R2) 병렬결재 같은 step N명 처리 시점 알림 중복/누락. (R3) 매일 cron 중복 발송. (R4) 이메일 발송 실패가 결재 흐름 차단. |
| **SUCCESS** | (1) 결재 송신/단계전환/최종승인/반려 4시점 모두 in_app+email 100% 발송, (2) 미결재 건 익일 09:00 1회만 푸시(중복 0), (3) 메일 CTA→`/admin/approval/:id`→ProtectedRoute returnTo 복귀 동작, (4) 알림 발송 실패가 결재 액션 자체를 차단하지 않음. |
| **SCOPE** | Phase 1: 디스패처 모듈 / Phase 2: 트리거 연결(daily-report·approval) / Phase 3: 종 라우팅 / Phase 4: 이메일 템플릿 3종 / Phase 5: 푸시 RFC8030 보강 / Phase 6: 일일 리마인더 cron. |

---

## 1. Overview

### 1.1 Purpose

전자결재·일일업무보고 워크플로에서 발생하는 모든 결재 이벤트(송신·단계전환·최종승인·반려·미결재 리마인드)를 in_app(헤더 종) + push(웹/모바일) + email 3채널로 통합 발송하여, 결재자/작성자가 어느 채널에서든 즉시 인지하고 한 클릭으로 결재 페이지에 진입할 수 있게 한다.

### 1.2 Background

**현재 상태**:
- `src/lib/notification-sender.ts` 디스패처는 존재하나 결재 흐름에서 호출되지 않음
- `approval.tsx` 의 4가지 분기(반려/같은단계대기/다음단계전환/최종승인)에 알림 hook 0개
- `daily-report.tsx` 의 결재 송신 시점에 알림 hook 없음
- `src/components/layout/NotificationBell.tsx` `RELATED_ROUTE` 매핑에 `approval_*` 키 누락 → 종 클릭해도 결재 페이지로 못 감
- `src/lib/email-templates.ts` 에 결재 통지용 템플릿 0개 (지원자/평가/연차 템플릿만 있음)
- `functions/api/send-push.ts` 는 VAPID JWT 서명조차 throw — 실제 푸시 미동작 (RFC8030 aes128gcm 미구현)
- 미결재 건 리마인드 cron 없음

**비즈니스 임팩트**:
- 결재 도착 사실을 결재자가 모르고 며칠 방치 → 일일보고·연차·지출결의 워크플로 전체 병목
- 모바일에서 메일 클릭 → 로그인 → 세션 풀려 HR홈으로 가버림 → 결재 못 함

### 1.3 Related Documents

- 사전 조사: 본 PDCA 사용자 원문 요구사항
- 기존 디스패처: `src/lib/notification-sender.ts`
- 결재 화면: `src/routes/hr-ops/approval.tsx` (line 706~850 `handleApprovalAction`)
- 일일보고: `src/routes/work/daily-report.tsx`
- 종 컴포넌트: `src/components/layout/NotificationBell.tsx`
- 푸시 구독: `src/hooks/usePushSubscription.ts`, 마이그 109
- 결재 라우트 가드: `src/components/auth/ProtectedRoute.tsx`, `src/routes/login.tsx`

---

## 2. Scope

### 2.1 In Scope

- [ ] `src/lib/approval-notification.ts` 신규 디스패처 모듈 (4함수: Submitted/StepAdvanced/FinalApproved/Rejected)
- [ ] `daily-report.tsx` 결재 송신 시 `notifyApprovalSubmitted` hook
- [ ] `approval.tsx` `handleApprovalAction` 4분기 hook (반려/같은단계대기/다음단계전환/최종승인)
- [ ] `NotificationBell.tsx` `RELATED_ROUTE` 에 `approval_pending`/`approval_completed`/`approval_rejected` 추가 + `:id` 치환 navigate
- [ ] `email-templates.ts` 신규 3종: `approvalRequestEmail`, `approvalCompletedEmail`, `approvalRejectedEmail`
- [ ] 이메일 CTA 링크 `${APP_URL}/admin/approval/${docId}` 형식 (returnTo 자동 활용)
- [ ] `functions/api/send-push.ts` web-push 호환 RFC8030 aes128gcm 보강 (또는 명확한 best-effort 운영 가이드)
- [ ] `functions/api/cron-pending-approval-reminder.ts` 신규 (매일 09:00 KST = UTC 00:00, `X-Cron-Secret` 인증)
- [ ] 일일 리마인드 중복 방지: `notification_deliveries` 당일 발송 이력 조회로 dedupe
- [ ] cron 등록 가이드 docs/DEPLOY.md 부록 (Cloudflare Pages cron triggers 또는 외부 cron)

### 2.2 Out of Scope

- Slack 채널 (사용자 명시 제외)
- webhook 채널 (현재 운영 사용처 없음)
- 결재자 본인 액션에 본인에게도 알림 발송 (결재한 사람은 본인 화면에서 toast 로 충분)
- `chat_room_members` 기반 시스템 메시지 (`src/lib/system-notification.ts`) — 별개 채널로 현재 유지
- 일일보고 작성 자체에 대한 알림 (결재 송신 시점부터만 알림)
- 마이그레이션 신설 (기존 `notification_deliveries`, `push_subscriptions` 컬럼 그대로 활용. 인덱스 한두 개 추가 정도만 허용)
- 결재 회수(withdraw) 통보 알림 — 후속 작업으로 분리

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 결재 작성자가 결재를 송신하면(daily-report 송신 + approval.tsx 신규 결재 생성), 1단계 결재자 N명 전원에게 in_app+push+email 3채널 동시 발송 | High | Pending |
| FR-02 | 결재자가 승인하여 다음 단계로 진행되면, 다음 단계 결재자 N명 전원에게 in_app+push+email 발송 | High | Pending |
| FR-03 | 같은 step 의 병렬결재 N명 중 일부만 승인하고 같은 단계 대기 중인 경우, **다음 단계 결재자에게는 알림 발송 안 함** (모두 승인된 후에만 다음 단계 알림) | High | Pending |
| FR-04 | 최종 단계 결재 완료 시 작성자에게 in_app+push+email "결재 완료" 통보 | High | Pending |
| FR-05 | 누군가 반려 시 작성자에게 in_app+push+email "반려" 통보 (반려 사유 포함) | High | Pending |
| FR-06 | 헤더 종 클릭 시 `approval_*` 타입은 `/admin/approval/:related_entity_id` 로 navigate | High | Pending |
| FR-07 | 이메일 CTA 버튼은 `${APP_URL}/admin/approval/${docId}` 절대링크. 비로그인 사용자도 ProtectedRoute returnTo 로 자동 복귀 | High | Pending |
| FR-08 | 매일 09:00 KST cron: status ∈ {'submitted','in_review'} 인 approval_documents 중 각 단계 pending approver 에게 push + in_app 1건 발송 | High | Pending |
| FR-09 | 일일 리마인드는 당일 동일 (recipient_uid, doc_id) 조합으로 이미 발송된 경우 스킵 (notification_deliveries 조회) | High | Pending |
| FR-10 | 알림 발송 실패가 결재 액션 자체(approval_steps update)를 차단하지 않음 — try/catch silent fail | High | Pending |
| FR-11 | recipientUid + recipientEmail 둘 다 명시 (in_app 만 uid, email 은 email, push 는 uid). 이메일 lookup 은 디스패처가 한 번에 조회 후 3채널 호출 | High | Pending |
| FR-12 | Push 채널은 best-effort — RFC8030 보강 완료까지 push 실패해도 in_app+email 은 성공 보장 | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 결재 액션 응답 시간 증가 < 300ms (3채널 발송이 결재 액션을 막지 않음) | 발송은 fire-and-forget (await Promise.allSettled, 단 await 자체는 진행해서 로그 기록) |
| Reliability | in_app + email 발송 성공률 ≥ 99% (notification_deliveries.status='sent' 비율) | `notification_deliveries` 조회 쿼리 |
| Idempotency | 일일 리마인더는 같은 (uid, doc_id, date) 중복 발송 0건 | dedupe 쿼리: `sent_at >= today_00:00 AND related_entity_id = doc_id AND recipient_uid = uid` |
| Security | cron 엔드포인트는 `X-Cron-Secret` 헤더 인증, Service Role Key 는 환경변수만 | 기존 `cron-*.ts` 패턴 따름 |
| Accessibility | 메일 본문 한국어, 모바일 가독성(max-width:600), CTA 버튼 44x44 이상 | 기존 email-templates 패턴 따름 |
| Compatibility | 기존 4개 ALTER 금지 테이블(employees/evaluations/evaluation_items/users) 변경 0 | 마이그 diff 확인 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] **SC-01** Phase 1~6 전체 빌드 통과 (`npm run build` 성공)
- [ ] **SC-02** 일일보고 결재 송신 → 1단계 결재자에게 in_app+email 도달 확인 (수동 검증)
- [ ] **SC-03** 결재 승인 → 다음 단계 결재자에게 in_app+email 도달 확인
- [ ] **SC-04** 최종 승인 → 작성자에게 in_app+email "완료" 도달 확인
- [ ] **SC-05** 반려 → 작성자에게 in_app+email "반려" + 사유 도달 확인
- [ ] **SC-06** 헤더 종에서 결재 알림 클릭 → `/admin/approval/:docId` 진입 확인
- [ ] **SC-07** 비로그인 상태에서 이메일 CTA 클릭 → login → 결재 페이지 자동 복귀 확인 (returnTo)
- [ ] **SC-08** 같은 step 병렬결재 1명 승인 후 같은 단계 대기 → 다음 단계 결재자에게 알림 발송 **안 됨** 확인
- [ ] **SC-09** cron 수동 호출(curl) → pending approver 에게 push+in_app 발송 + 중복 호출 시 스킵 확인
- [ ] **SC-10** 발송 실패 시뮬레이션(잘못된 이메일) → 결재 액션은 정상 완료, notification_deliveries 에 'failed' 기록

### 4.2 Quality Criteria

- [ ] TypeScript 타입 에러 0
- [ ] ESLint 에러 0 (warning 허용)
- [ ] 기존 코드 패턴 준수 (Edit 사용, 전체 덮어쓰기 X)
- [ ] 한국어 UI/이메일 본문, 날짜 YYYY.MM.DD
- [ ] 모바일 반응형 (메일 max-width:600, 종 드롭다운 sm:w-96)
- [ ] 기존 4개 ALTER 금지 테이블 변경 0
- [ ] git commit + push origin main (Cloudflare auto-deploy)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **R1: Web Push aes128gcm 미구현으로 실제 푸시 미동작** | High (push 채널 무효화) | High | 사용자 결정 사항. 권장: web-push npm 도입(option A). Cloudflare Pages Functions 의 Node 호환성 점검 필요. 도입 실패 시 push 는 best-effort 로 두고 in_app+email 으로 신뢰성 확보. |
| **R2: 병렬결재 같은 step 중복/누락 알림** | Medium | Medium | `approval.tsx` `handleApprovalAction` 의 분기 그대로 활용: `stillPendingInSameStep` 분기는 알림 발송 X, `nextStepToProcess > total_steps` 만 최종승인 알림, 그 외는 다음 단계 알림. |
| **R3: 일일 cron 중복 발송** | Medium | Medium | `notification_deliveries` 조회로 당일 동일 (recipient_uid, related_entity_id) dedupe. 인덱스 추가 권장: `(recipient_uid, related_entity_id, sent_at)`. |
| **R4: 이메일 발송 실패로 결재 액션 차단** | High | Low | 모든 hook 호출은 try/catch silent fail. `Promise.allSettled` 사용. 실패 로그만 `notification_deliveries.status='failed'` 기록. |
| **R5: 이메일 lookup(uid→email) 추가 쿼리 비용** | Low | Medium | 디스패처에서 결재자 N명을 한 번의 `users` 조회로 일괄 lookup. 일일보고 발송은 N=1~3 이므로 단일 in 쿼리. |
| **R6: `requester_id`/approver_id 가 `auth.uid()` 가 아니라 `employees.id` 일 수 있음** | High | Medium | 사전 검증 필요 — 기존 approval.tsx 코드에서 `approver_id === profile?.id` 비교 확인. 디스패처는 `users.id` 기준으로 통일하되, 실제 컬럼은 코드 inspection 시 재확인. |
| **R7: cron 엔드포인트 인증 우회** | High | Low | 기존 `cron-leave-promotion.ts` 패턴 따라 `X-Cron-Secret` 헤더 검증. Cloudflare 환경변수에 secret 저장. |
| **R8: `/admin/approval/:docId` 라우트가 실제로 존재하지 않을 가능성** | High | Low | Design 단계에서 `src/App.tsx` 또는 router 정의 확인 후 확정. 없으면 라우트 추가까지 Phase 2 에 포함. |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `src/lib/approval-notification.ts` | 신규 모듈 | 4개 함수 신규 추가 |
| `src/lib/email-templates.ts` | 모듈 추가 | 3개 export 함수 신규 (기존 함수 변경 0) |
| `src/components/layout/NotificationBell.tsx` | 컴포넌트 수정 | `RELATED_ROUTE` 3 entry 추가 + `openItem` 의 `:id` 치환 로직 |
| `src/routes/hr-ops/approval.tsx` | 컴포넌트 수정 | `handleApprovalAction` 4 분기 각각에 알림 hook 호출 + 신규 결재 생성 시 송신 hook |
| `src/routes/work/daily-report.tsx` | 컴포넌트 수정 | 결재 송신 onClick 핸들러에 hook |
| `functions/api/send-push.ts` | Function 보강 | aes128gcm 암호화 + VAPID JWT 서명 구현 (or web-push 라이브러리 도입) |
| `functions/api/cron-pending-approval-reminder.ts` | 신규 Function | 매일 09:00 cron, X-Cron-Secret 인증 |
| `supabase/migrations/143_notification_dedupe_index.sql` | 신규 마이그(선택) | `notification_deliveries(recipient_uid, related_entity_id, sent_at)` 인덱스 |
| `docs/DEPLOY.md` | 문서 보강 | cron 등록 가이드 부록 추가 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `sendNotification()` | CALL | 기존: `notification-sender` 호출처 — 디스패처 함수만 새로 추가하므로 기존 호출처 영향 0 | None |
| `RELATED_ROUTE` map | READ | `NotificationBell.tsx` `openItem` / `hasRoute` 표시 | 키 추가만, 기존 라우팅 영향 0 |
| `handleApprovalAction` | CALL | `approval.tsx` UI 버튼 onClick | 알림 hook 추가는 액션 완료 후 fire-and-forget — 실패해도 UI 흐름 유지 |
| `daily-report` 결재 송신 핸들러 | CALL | `daily-report.tsx` onClick | 마찬가지 fire-and-forget 추가 |
| `send-push` endpoint | CALL | `notification-sender.ts` push 분기에서 호출 | aes128gcm 구현 후 push 채널 실효성 회복 (현재는 throw → 변경 없음) |
| `push_subscriptions` table | READ | `cron-pending-approval-reminder.ts` 신규 + `send-push.ts` 기존 | 신규 cron 의 service role read 추가 (insert/delete 없음) |
| `notification_deliveries` table | INSERT | `record_notification_delivery` RPC 기존 — 신규 hook 도 동일 RPC 사용 | 인덱스 1개 추가 외 스키마 영향 0 |
| `approval_documents` table | READ | `cron-pending-approval-reminder.ts` 신규 service role read | RLS 영향 없음 (service role bypass) |
| `approval_steps` table | READ | 동일 cron 신규 read | RLS 영향 없음 |

### 6.3 Verification

- [ ] 신규 모듈은 기존 호출 그래프에 추가만, 기존 함수 시그니처 변경 0 — 컴파일 회귀 위험 최소
- [ ] `approval.tsx` `handleApprovalAction` 의 toast/fetchData/navigate 등 기존 부수 효과는 그대로 유지
- [ ] `daily-report.tsx` 결재 송신 핸들러의 기존 검증/저장 로직은 그대로 유지
- [ ] `RELATED_ROUTE` 의 기존 3개 키(leave_promotion/overtime_request/anonymous_report) 그대로 유지
- [ ] `send-push.ts` 변경은 실패→정상화 방향이므로 회귀 X
- [ ] 4개 ALTER 금지 테이블(employees/evaluations/evaluation_items/users) 변경 0

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | 단순 정적 사이트 | — | ☐ |
| **Dynamic** | feature-based + BaaS (Supabase) | 본 프로젝트 | ☑ |
| **Enterprise** | 멀티 서비스, K8s, terraform | — | ☐ |

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 디스패처 위치 | 클라이언트 모듈 / Cloudflare Function / Supabase Edge Function | **클라이언트 모듈** | 기존 `notification-sender.ts` 가 클라이언트 모듈로 운영 중. 일관성 유지. cron 만 server function. |
| 다채널 호출 방식 | 순차(await) / 병렬(allSettled) / fire-and-forget | **`Promise.allSettled` 후 silent fail** | 결재 액션을 막지 않으면서도 발송 결과는 `notification_deliveries` 에 기록되어야 하므로 결과는 기다리되 실패는 throw X. |
| relatedEntity type 명명 | `approval_pending` / `approval_completed` / `approval_rejected` | 동일 | 사용자 요구. NotificationBell `RELATED_ROUTE` 키와 일치. |
| 이메일 lookup 방식 | 결재 시 매번 join / 한 번 일괄 select(in) | **일괄 select(in)** | N=1~수명 수준이므로 단일 쿼리로 처리. |
| Push 라이브러리 도입 | A) `web-push` npm / B) RFC8030 직접 구현 / C) 베타 유지 | **A 우선 → 호환 불가 시 B (C 금지)** | 사용자 확정 — Push 는 반드시 동작해야 함. Design §11 Phase 5 에 web-push 호환 검증 + B fallback 설계 필수. |
| Cron 시간 | KST 09:00 / 08:30 / 다른 시각 | **KST 08:30 (UTC 23:30 전일)** | 사용자 확정. cron expr `30 23 * * *`. |
| Reminder 채널 | push+in_app / +email / push-only | **push+in_app (email 제외)** | 사용자 확정. |
| 병렬결재 동료 승인 본인 알림 | 보냄 / 안 보냄 | **안 보냄** | 사용자 확정. 노이즈 방지. |

### 7.3 Module Layering

```
┌─────────────────────────────────────────────────────────────┐
│ UI Layer (React Components)                                  │
│  - daily-report.tsx (송신 onClick)                           │
│  - approval.tsx (handleApprovalAction 4분기)                 │
│  - NotificationBell.tsx (RELATED_ROUTE)                      │
└────────────────────────┬─────────────────────────────────────┘
                         │ calls
┌────────────────────────▼─────────────────────────────────────┐
│ Domain Layer — Approval Notification Dispatcher              │
│  src/lib/approval-notification.ts                            │
│  - notifyApprovalSubmitted(documentId)                       │
│  - notifyApprovalStepAdvanced(documentId, fromStepOrder)     │
│  - notifyApprovalFinalApproved(documentId)                   │
│  - notifyApprovalRejected(documentId, by, reason)            │
└────────────────────────┬─────────────────────────────────────┘
                         │ calls
┌────────────────────────▼─────────────────────────────────────┐
│ Channel Layer — Existing Generic Dispatcher                  │
│  src/lib/notification-sender.ts                              │
│  → 'email'  → /api/send-email                                │
│  → 'in_app' → record_notification_delivery RPC               │
│  → 'push'   → /api/send-push (RFC8030 보강)                  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Server (Cloudflare Pages Functions)                          │
│  - functions/api/send-email.ts (기존)                        │
│  - functions/api/send-push.ts (RFC8030 보강)                 │
│  - functions/api/cron-pending-approval-reminder.ts (신규)    │
│    → 매일 09:00 KST, X-Cron-Secret 인증                      │
│    → service role 로 approval_documents/steps 조회           │
│    → push + in_app 직접 발송 + dedupe                        │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `CLAUDE.md` 절대 규칙 명시 (테이블 ALTER 금지, 한국어 UI, Edit 사용)
- [x] `docs/CONVENTIONS.md` 존재
- [x] TypeScript + Vite + Tailwind 컨벤션 확립
- [x] 이메일 발송 = `/api/send-email` 표준
- [x] cron 엔드포인트 = `X-Cron-Secret` 인증 + Service Role 패턴

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 알림 relatedEntity type 명명 | 기존: leave_promotion/overtime_request/anonymous_report | 신규 3개: approval_pending/approval_completed/approval_rejected | High |
| 알림 트리거 호출 패턴 | 미정의 | UI 핸들러에서 액션 완료 후 `Promise.allSettled([...]).catch(silent)` | High |
| 디스패처 내부 에러 처리 | 미정의 | 모든 채널 실패는 console.warn + 결재 액션은 정상 완료 | High |

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `VAPID_PUBLIC_KEY` | Push VAPID 공개키 | Cloudflare Function | ☐ (이미 존재 가정 — 확인 필요) |
| `VAPID_PRIVATE_KEY` | Push VAPID 비공개키 | Cloudflare Function | ☐ (이미 존재 가정) |
| `VAPID_SUBJECT` | Push 발신자 mailto: | Cloudflare Function | ☐ |
| `CRON_SECRET` 또는 `X_CRON_SECRET` | cron 인증 시크릿 | Cloudflare Function | ☐ (기존 cron 들과 동일 키 재사용) |
| `VITE_APP_URL` | 이메일 절대링크 base | Build-time | ☑ (기존) |

---

## 9. Next Steps

1. [ ] **Checkpoint 1**: 본 Plan 사용자 컨펌
2. [ ] **Checkpoint 2**: 사용자 결정 필요 4문항 답변 받기 (아래)
3. [ ] Design 문서 작성 (3가지 안 비교 — 특히 Push 라이브러리 선택)
4. [ ] **Checkpoint 3**: Design 안 선택
5. [ ] **Checkpoint 4**: Phase 1~6 sequential 구현 승인
6. [ ] Phase 1 → Phase 6 순차 구현 + 각 phase 빌드/커밋/push
7. [ ] **Checkpoint 5**: Check 결과 검토

---

## 10. 사용자 결정 사항 (확정)

| # | 결정 사항 | 확정 답변 | 적용 |
|---|----------|----------|------|
| Q1 | Web Push 구현 방식 | **A 우선 시도 → 호환 불가 시 B(RFC8030 자체구현)로 반드시 동작. C(베타 유지) 금지** | Design §11 Phase 5 에 web-push 사전 호환 검증 + B fallback 설계 필수 |
| Q2 | 일일 리마인더 cron 시간 | **KST 08:30 (UTC 23:30 전일)** | `cron-pending-approval-reminder.ts` cron expr = `30 23 * * *` (UTC) |
| Q3 | 일일 리마인더 채널 | **push + in_app 만 (email 제외)** | cron 핸들러는 2채널만 호출 |
| Q4 | 병렬결재 동료 승인 시 본인 알림 | **보내지 않음** | 같은 step 다른 동료 승인 이벤트는 발신 0 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-30 | 초기 작성 | cto-lead (PDCA) |
