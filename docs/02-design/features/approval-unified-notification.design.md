---
template: design
version: 1.3
feature: approval-unified-notification
date: 2026-05-30
author: cto-lead (PDCA)
project: INTEROHRIGIN HR Platform
---

# 결재 통합 알림 시스템 Design Document

> **Summary**: 결재 4시점(송신/단계전환/최종승인/반려) 및 미결재 일일 리마인드를 in_app+push+email+**kakao_work** 4채널로 통합 발송. Web Push 는 `@block65/webcrypto-web-push` 라이브러리로 Cloudflare Pages Functions 환경에서 RFC8030 aes128gcm 완전 동작 보장. **카카오워크 채널은 코드 선 구축, 도입 시점에 관리자 화면에서 토큰 입력만으로 plug-and-play 활성화 (Phase 7)**.
>
> **Project**: INTEROHRIGIN HR Platform
> **Author**: cto-lead (PDCA)
> **Date**: 2026-05-30
> **Status**: Draft
> **Planning Doc**: [approval-unified-notification.plan.md](../01-plan/features/approval-unified-notification.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 결재 도착 통지 부재로 결재 지연 → 일일보고/연차/지출결의 등 모든 워크플로 병목. |
| **WHO** | 결재 작성자(전 직원) + 단계별 결재자(팀장/리더/임원) + 작성자(최종승인·반려 통보 수신). |
| **RISK** | (R1) Web Push aes128gcm 미구현 — 실제 브라우저 푸시 미동작. (R2) 병렬결재 같은 step N명 처리 시점 알림 중복/누락. (R3) 매일 cron 중복 발송. (R4) 이메일 발송 실패가 결재 흐름 차단. |
| **SUCCESS** | (1) 결재 4시점 in_app+email 100% 발송, (2) 매일 08:30 KST 푸시 dedupe 0건 중복, (3) 메일 CTA → `/admin/approval/:id` → returnTo 자동 복귀 동작, (4) 알림 실패가 결재 액션 차단 X. |
| **SCOPE** | Phase 1: 디스패처 / Phase 2: 트리거 연결 / Phase 3: 종 라우팅 / Phase 4: 이메일 템플릿 3종 / Phase 5: Push RFC8030 보강 / Phase 6: 일일 리마인더 cron. |

---

## 1. Overview

### 1.1 Design Goals

1. **단일 디스패처**: UI 4개 시점 × 채널 3종을 1개 모듈에서 통합 발송 (DRY).
2. **결재 흐름 무차단**: 알림 발송 실패가 결재 액션을 절대 막지 않음.
3. **세션 끊김 0**: 이메일 CTA 클릭 → 비로그인 → `/login?returnTo=...` → 결재 페이지 자동 복귀.
4. **Push 100% 동작 보장**: 사용자 확정 — A 우선, 불가 시 B로 반드시 동작. `@block65/webcrypto-web-push` 채택으로 두 요구 동시 충족.
5. **중복 0 dedupe**: 매일 08:30 cron 은 같은 (uid, doc_id, date) 1회만.

### 1.2 Design Principles

- **SRP**: 각 함수 1 시점 = 1 책임 (4 함수 분리)
- **Existing-First**: `notification-sender.ts` 위에 얹기, 새 채널 dispatcher 신설 X
- **Fail-Silent**: 결재 액션 무차단 → 모든 hook 호출 `try/catch + Promise.allSettled`
- **Convention-Follow**: 기존 `cron-leave-promotion.ts` 의 `X-Cron-Secret` 인증/Service Role 패턴 그대로 재사용
- **No Schema Bloat**: 신규 컬럼 0, 인덱스 1개만 추가

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | 디스패처 함수 1개 (`notifyApprovalEvent`) + 인라인 매핑 | 5 layer 분리: dispatcher / strategy / channel / template / repository | 4 함수 (시점별) + 1 helper (메타 lookup) — 기존 `notification-sender` 위에 얹기 |
| **New Files** | 2 (`approval-notification.ts`, `cron-pending-approval-reminder.ts`) | 7 (위 + `approval-notification.types.ts` + `approval-notification.strategy.ts` + repository + 2 channel adapter 분리) | 3 (`approval-notification.ts`, `webcrypto-web-push` 적용된 `send-push.ts`, `cron-pending-approval-reminder.ts`) |
| **Modified Files** | 4 (`daily-report.tsx`, `approval.tsx`, `NotificationBell.tsx`, `email-templates.ts`) | 4 + types 분리 = 5+ | 5 (위 + `package.json` 의존성 추가) |
| **Phase 5 (Push)** | 기존 broken send-push.ts 일부 patch — RFC8030 부분 구현 | 완전 자체 RFC8030 implementation (~250 LOC Web Crypto) | **`@block65/webcrypto-web-push` 라이브러리 채택** — Workers 네이티브, 검증된 RFC8030 |
| **Cron 등록 가이드** | docs/DEPLOY.md 부록 한 줄 | wrangler.toml 신설 + Cloudflare Cron Triggers 설정 | 외부 cron (cron-job.org) 가이드 + Cloudflare Cron Triggers 둘 다 안내 |
| **Complexity** | Low | High | Medium |
| **Maintainability** | Low (인라인 분기 많음) | High | High |
| **Effort** | Medium (Phase 5 자체구현 부담) | High | **Low~Medium** (라이브러리 채택) |
| **Push 동작 확실성** | 중간 (직접 patch 위험) | 중간 (250 LOC 자체구현 버그 위험) | **높음** (block65 라이브러리 = Workers 공식 호환 명시) |
| **wrangler.toml 필요 여부** | 불요 | nodejs_compat 필요 시 신설 | **불요** (Web Crypto API 만 사용) |
| **Risk** | Push 동작 보장 X | 신뢰성 OK 하나 일정·코드량 부담 | **Low** — 검증된 라이브러리 + 기존 패턴 준수 |
| **Recommendation** | Quick wins only | Long-term, 대규모 | **Default — 본 프로젝트 권장** |

### 2.1 Push 채널 사전 호환 검증 결과 (사용자 Q1 충족)

| 후보 | 검증 결과 | 결정 |
|------|----------|------|
| `web-push` (web-push-libs) | `require('https')` 의존 → Cloudflare Pages Functions 에 `nodejs_compat` flag + `compatibility_date >= 2024-09-23` + **wrangler.toml 신설 필요**. GitHub Issue #718 에 Workers 비호환 명시. 잠재 위험: https/crypto 폴리필 한계로 endpoint POST 실패 가능. | ❌ 채택 안 함 — 인프라 변경 부담 + 동작 불확실 |
| `@block65/webcrypto-web-push` | **Web Crypto API 사용 (Workers 네이티브)**, ESM, README 에 "compatible with Node, Cloudflare Workers, Bun and Deno" 명시. tsconfig moduleResolution: bundler 필요 (이미 `tsconfig` Node next 사용 중). wrangler.toml 불요. | ✅ **채택** — A 우선 의도 + B 동작 보장 의도 동시 충족 |
| RFC8030 자체구현 | Web Crypto API ECDH P-256 + HKDF-SHA-256 + AES-128-GCM 직접. ~200~300 LOC. 검증된 라이브러리 대비 버그 위험. | ❌ 채택 안 함 (Option C 의 `@block65/webcrypto-web-push` 가 같은 원리로 검증됨) — **fallback 으로 유지**: 만약 @block65 라이브러리에 호환 이슈 발견 시 B 로 즉시 전환 |

**최종 결정**: Option C 채택. Phase 5 는 `@block65/webcrypto-web-push` 도입.

### 2.2 Selected Option

**Option C: Pragmatic Balance** — 사용자 Checkpoint 3 결정 대기

---

## 3. Data Model

### 3.1 신규 테이블 — 없음

### 3.2 신규 인덱스 (마이그 143)

```sql
-- supabase/migrations/143_notification_dedupe_index.sql
-- 매일 cron dedupe + 결재 알림 조회 성능 보강

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_dedupe
  ON notification_deliveries (recipient_uid, related_entity_id, sent_at DESC)
  WHERE related_entity_type IN ('approval_pending', 'approval_completed', 'approval_rejected');

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_approval
  ON notification_deliveries (related_entity_type, sent_at DESC)
  WHERE related_entity_type LIKE 'approval_%';
```

### 3.3 카카오워크 — 마이그 144 (Phase 7)

```sql
-- supabase/migrations/144_kakaowork_channel.sql

-- (1) 채널 설정 컬럼 추가 (notification_channel_configs 는 ALTER 금지 4테이블 아님 — 허용)
ALTER TABLE public.notification_channel_configs
  ADD COLUMN IF NOT EXISTS kakaowork_app_key text,           -- Bot Access Token (Bearer)
  ADD COLUMN IF NOT EXISTS kakaowork_bot_name text,          -- 표시용 (e.g. 'HR결재봇')
  ADD COLUMN IF NOT EXISTS kakaowork_enabled boolean NOT NULL DEFAULT false;

-- (2) employees ↔ kakaowork user 매핑 (employees ALTER 금지 → 별도 테이블)
CREATE TABLE IF NOT EXISTS public.employee_kakaowork_map (
  employee_id        uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  kakaowork_user_id  text NOT NULL,                    -- KakaoWork users.id
  email_used         text NOT NULL,                    -- 매핑 기준 이메일 (감사용)
  display_name       text,                             -- KakaoWork 표시명 (참고용)
  synced_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kakaowork_user_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_kakaowork_map_user
  ON public.employee_kakaowork_map (kakaowork_user_id);

ALTER TABLE public.employee_kakaowork_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kakaowork_map_admin_modify" ON public.employee_kakaowork_map;
CREATE POLICY "kakaowork_map_admin_modify"
ON public.employee_kakaowork_map FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('admin','hr_admin','ceo'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('admin','hr_admin','ceo'))
);

-- 본인 매핑은 본인이 select 가능 (디스패처에서 자기 매핑 확인용)
DROP POLICY IF EXISTS "kakaowork_map_self_select" ON public.employee_kakaowork_map;
CREATE POLICY "kakaowork_map_self_select"
ON public.employee_kakaowork_map FOR SELECT TO authenticated
USING (employee_id = auth.uid());
```

**기존 4 ALTER 금지 테이블(`employees`, `evaluations`, `evaluation_items`, `users`) 변경 0** — `employees.kakaowork_user_id` 컬럼 추가 대신 별도 매핑 테이블로 우회.

### 3.4 활용 기존 테이블 / 컬럼

| Table | 사용 컬럼 | 용도 |
|-------|----------|------|
| `approval_documents` | `id`, `title`, `doc_type`, `requester_id`, `current_step`, `total_steps`, `status`, `completed_at` | 디스패처 메타 조회 + cron 미결재 조회 |
| `approval_steps` | `document_id`, `step_order`, `approver_id`, `action` | 단계별 결재자 수신처 lookup + cron pending 그룹핑 |
| `users` (또는 `employees`) | `id`, `email`, `name` | 결재자/작성자 이메일 lookup |
| `push_subscriptions` | `user_id`, `endpoint`, `p256dh`, `auth_secret` | Web Push 전송 |
| `notification_deliveries` | 전체 | sendNotification 결과 로그 + dedupe 조회 |
| `notification_channel_configs` | `vapid_public_key`, `enabled_channels` | VAPID 키 + push 활성화 여부 |

**검증 필요 (Phase 1 첫 작업)**: `approval_documents.requester_id` 와 `approval_steps.approver_id` 가 `auth.users.id` 인지 `employees.id` 인지 — code inspection 으로 확정. (R6)

---

## 4. API Contracts

### 4.1 클라이언트 모듈 — `src/lib/approval-notification.ts`

```typescript
// Design Ref: §4.1 — 4개 시점 1:1 매핑 + 메타 lookup 공통 helper

interface ApprovalDocMeta {
  id: string
  title: string
  doc_type: string
  requester_id: string
  requester_email: string | null
  requester_name: string | null
}

interface ApproverInfo {
  uid: string
  email: string | null
  name: string | null
}

/**
 * 결재 송신 (1단계 결재자 N명에게)
 * 호출처: daily-report.tsx, approval.tsx (신규 결재 생성)
 */
export async function notifyApprovalSubmitted(documentId: string): Promise<void>

/**
 * 단계 전환 (지정 step 결재자 N명에게)
 * 호출처: approval.tsx handleApprovalAction — 같은 step 모두 완료 후 다음 step 으로 이동 시
 */
export async function notifyApprovalStepAdvanced(
  documentId: string,
  toStepOrder: number,
): Promise<void>

/**
 * 최종 승인 (작성자에게)
 * 호출처: approval.tsx — nextStepToProcess > total_steps
 */
export async function notifyApprovalFinalApproved(documentId: string): Promise<void>

/**
 * 반려 (작성자에게, 반려자 정보 + 사유 포함)
 * 호출처: approval.tsx — action === 'rejected'
 */
export async function notifyApprovalRejected(
  documentId: string,
  rejectedBy: { uid: string; name: string },
  reason: string | null,
): Promise<void>
```

**공통 내부 helper (export 안 함)**:

```typescript
async function loadApprovalMeta(documentId: string): Promise<ApprovalDocMeta | null>
async function loadApprovers(documentId: string, stepOrder: number): Promise<ApproverInfo[]>
async function sendThreeChannels(
  recipient: ApproverInfo,
  subject: string,
  htmlBody: string,
  relatedEntity: { type: string; id: string },
): Promise<void>  // Promise.allSettled — silent fail
```

**Failure Policy**:
- 모든 export 함수는 throw X — 내부 try/catch + `console.warn`.
- `Promise.allSettled` 로 3채널 발송 후 실패는 `notification_deliveries.status='failed'` 로만 기록.

### 4.2 Cron 엔드포인트 — `functions/api/cron-pending-approval-reminder.ts`

| Property | Value |
|----------|-------|
| Method | POST |
| Path | `/api/cron-pending-approval-reminder` |
| Auth | Header `X-Cron-Secret: ${CRON_SECRET}` (기존 패턴 동일) |
| Body | (옵션) `{ dryRun?: boolean }` |
| Response 200 | `{ scanned: N, recipientsNotified: N, skippedDuplicates: N, channelResults: [...] }` |
| Response 401 | `{ error: 'unauthorized' }` |
| Trigger | 매일 KST 08:30 = UTC 23:30 → cron expr `30 23 * * *` |

**처리 흐름**:
```
1. 인증 (X-Cron-Secret)
2. service role 로 approval_documents 조회 (status IN ('submitted','in_review'))
3. 각 doc 의 approval_steps 중 step_order = current_step AND action = 'pending' 인 row 수집
4. approver_id 별 그룹핑 → { uid → [{docId, title, docType}, ...] }
5. 각 approver 별 dedupe 조회: notification_deliveries 에서 sent_at >= 오늘 UTC 00:00 AND related_entity_id IN (docIds) AND recipient_uid = uid AND related_entity_type='approval_pending'
6. 신규 건만 in_app + push 발송 (이메일 제외 — Q3 확정)
7. 결과 집계 응답
```

### 4.3 Push 엔드포인트 — `functions/api/send-push.ts` (보강)

| Property | Before | After |
|----------|--------|-------|
| 동작 | throw('VAPID signing requires PKCS8') — 실패 | `@block65/webcrypto-web-push` 로 RFC8030 aes128gcm 완전 동작 |
| 의존성 | 없음 | `@block65/webcrypto-web-push` (production) |
| 환경변수 | VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (그대로) | 동일 |
| TypeScript 호환 | OK | OK (ESM, moduleResolution: bundler) |
| Response shape | 동일 | 동일 — `{ sent, results: [{endpoint, status}] }` |

### 4.4 Notification relatedEntity Type 명명

| Type | 의미 | 라우팅 |
|------|------|--------|
| `approval_pending` | 결재 도착 (결재자 → 본인) | `/admin/approval/:related_entity_id` |
| `approval_completed` | 최종 승인 완료 (작성자 → 본인) | `/admin/approval/:related_entity_id` |
| `approval_rejected` | 반려 (작성자 → 본인) | `/admin/approval/:related_entity_id` |

---

## 5. UI Design

### 5.1 NotificationBell.tsx 수정 사항

```typescript
// 현재
const RELATED_ROUTE: Record<string, string> = {
  leave_promotion: '/my/leave-promotion',
  overtime_request: '/my/overtime',
  anonymous_report: '/admin/system/anonymous-reports',
}

// 변경 후 — 3개 entry 추가 + :id 치환 path 표기
const RELATED_ROUTE: Record<string, string> = {
  leave_promotion: '/my/leave-promotion',
  overtime_request: '/my/overtime',
  anonymous_report: '/admin/system/anonymous-reports',
  approval_pending: '/admin/approval/:id',
  approval_completed: '/admin/approval/:id',
  approval_rejected: '/admin/approval/:id',
}

// openItem 핸들러: :id 치환 로직 추가
function openItem(item: InboxItem) {
  if (!item.read_at) markRead(item.id)
  const template = item.related_entity_type ? RELATED_ROUTE[item.related_entity_type] : null
  if (!template) return
  const route = template.includes(':id') && item.related_entity_id
    ? template.replace(':id', item.related_entity_id)
    : template
  navigate(route)
  setOpen(false)
}
```

### 5.2 이메일 템플릿 3종 (`src/lib/email-templates.ts` 추가)

기존 `surveyInviteEmail` / `hiringAcceptEmail` 패턴 동일 (Apple SD Gothic Neo + 보라 그라데이션 + max-width:600 + CTA 버튼).

| 함수 | 받는 사람 | 제목 | CTA |
|------|----------|------|-----|
| `approvalRequestEmail({docTitle, requesterName, docType, link})` | 결재자 | `[인터오리진] {docType} 결재 요청 — {docTitle}` | "결재 페이지로 이동" → `${APP_URL}/admin/approval/${docId}` |
| `approvalCompletedEmail({docTitle, link})` | 작성자 | `[인터오리진] 결재 완료 — {docTitle}` | "결재 내역 보기" → 동일 |
| `approvalRejectedEmail({docTitle, by, reason, link})` | 작성자 | `[인터오리진] 결재 반려 — {docTitle}` | "결재 페이지로 이동" → 동일. 본문에 by 이름 + 사유 강조 표시 |

**비로그인 안내 한 줄** (사용자 요구): `메일에서 이동 시 로그인 화면이 뜨면 로그인 후 자동으로 결재 페이지로 돌아갑니다.`

### 5.3 헤더 종 UX 변경

| Item | Before | After |
|------|--------|-------|
| 알림 종류 표시 | 미구분 | 변경 없음 (기존 subject prefix `[인터오리진]` 그대로) |
| 클릭 라우팅 | `approval_*` 미지원 → 종 클릭 후 stuck | `/admin/approval/:docId` 직진입 |
| 외부링크 아이콘 | hasRoute 일 때 표시 | 동일 |

---

## 6. State Management

기존 상태관리 영향 없음. 모듈은 stateless 함수 export 만.

---

## 7. Implementation Order (Phase 1~6)

각 Phase 완료마다: 빌드 검증 → commit → push origin main (Cloudflare auto-deploy).

| Phase | 산출물 | 파일 | 예상 LOC | 검증 |
|-------|--------|------|---------|------|
| **Phase 1** | 디스패처 모듈 신규 | `src/lib/approval-notification.ts` | ~280 | tsc 통과 + import 가능 |
| **Phase 2** | 트리거 4지점 연결 | `src/routes/work/daily-report.tsx`, `src/routes/hr-ops/approval.tsx` | ~40 (수정만) | 빌드 + manual test (1 결재 흐름) |
| **Phase 3** | 종 라우팅 + :id 치환 | `src/components/layout/NotificationBell.tsx` | ~10 (수정만) | 빌드 + manual click test |
| **Phase 4** | 이메일 템플릿 3종 | `src/lib/email-templates.ts` (append) | ~250 | 빌드 + 디스패처에서 호출 가능 |
| **Phase 5** | Web Push RFC8030 완전 동작 | `functions/api/send-push.ts` (rewrite), `package.json` 의존성 추가 | ~120 | 빌드 + dev wrangler 로컬 테스트 시도 |
| **Phase 6** | 일일 리마인더 cron + 인덱스 마이그 | `functions/api/cron-pending-approval-reminder.ts`, `supabase/migrations/143_*.sql` | ~200 + 10 | 빌드 + 마이그 적용 + curl 수동 호출 |
| **Phase 7** | 카카오워크 채널 (plug-and-play) | `supabase/migrations/144_kakaowork_channel.sql`, `functions/api/send-kakaowork.ts`, `functions/api/kakaowork-sync.ts`, `src/types/compliance.ts` (확장), `src/lib/notification-sender.ts` (분기 추가), `src/lib/approval-notification.ts` (4채널화), `src/routes/admin/notifications-settings.tsx` (신규 UI), `docs/카카오워크-연동-매뉴얼.md` (사용자 매뉴얼) | ~600 + 10 | 마이그 적용 + 빌드 + 모의 토큰으로 dry-run + 매뉴얼 검토 |

### 7.1 Phase 5 상세 — Web Push 동작 보장 (사용자 최우선 요구)

**Step A (Primary Path — @block65/webcrypto-web-push)**:
1. `npm install @block65/webcrypto-web-push`
2. `package.json` dependencies 추가
3. `functions/api/send-push.ts` 전면 재작성:
   ```typescript
   import { buildPushPayload, ApplicationServer } from '@block65/webcrypto-web-push'
   // VAPID 키는 base64url → JWK 변환 후 ApplicationServer 인스턴스화
   // 각 push_subscription 마다 buildPushPayload + fetch 전송
   ```
4. 로컬 `wrangler pages dev` 로 실 endpoint 호출 시도 → 200/201/410 응답 확인
5. 실제 브라우저 구독으로 production 1회 검증

**Step B (Fallback — 만약 A 가 호환 문제로 실패)**:
1. 자체 RFC8030 구현 (`functions/api/_web-push-rfc8030.ts` 신규)
   - ECDH P-256 키 페어 생성 (Web Crypto)
   - 구독자 p256dh + 자체 ECDH 로 shared secret 도출
   - HKDF-SHA-256 으로 IKM/PRK 도출
   - AES-128-GCM 으로 payload 암호화
   - VAPID JWT (ES256) 헤더 + Crypto-Key/Encryption 헤더 부착
   - endpoint POST
2. `webcrypto-web-push` 코드를 참조 구현으로 활용

**판정 기준**: Step A 빌드/실행 후 1개라도 endpoint 가 200/201/410 응답하면 A 채택. 모든 endpoint 가 400/500 으로 실패하면 즉시 Step B 진행.

**C(베타 유지)는 채택하지 않음** — 사용자 명시.

### 7.2 Phase 7 상세 — 카카오워크 plug-and-play (사용자 신규 요구)

**의사결정 — API 선택**:

| 후보 | 가능 동작 | 결정 |
|------|----------|------|
| Bot API (Bearer App Key) | `users.find_by_email` → `conversations.open` → `messages.send_by` 로 **특정 직원 1:1 DM** | ✅ 채택 — 결재 알림은 본인에게 직접 DM 필요 |
| Incoming Webhook URL | 채널 단일 webhook 으로 일괄 전송. 특정 유저 멘션 불가 | ❌ 보조 (옵션). 결재 알림 용도 부적합 |

→ **Bot API 채택**. Bearer Token 1개로 모든 endpoint 호출.

**API 호출 흐름** (서버 = `functions/api/send-kakaowork.ts`):

```
POST /api/send-kakaowork
  body: { recipient_uid, title, body, link? }
  ↓
[1] notification_channel_configs 조회 → kakaowork_enabled && kakaowork_app_key 존재 확인
    없으면 200 { skipped:true, reason:'kakaowork-disabled' } 응답 (다른 채널 영향 0)
  ↓
[2] employee_kakaowork_map 에서 employee_id=recipient_uid 로 kakaowork_user_id lookup
    없으면 200 { skipped:true, reason:'no-mapping' } 응답
  ↓
[3] POST https://api.kakaowork.com/v1/conversations.open
    Authorization: Bearer ${kakaowork_app_key}
    body: { user_id: kakaowork_user_id }
    → response.conversation.id
  ↓
[4] POST https://api.kakaowork.com/v1/messages.send_by
    Authorization: Bearer ${kakaowork_app_key}
    body: {
      conversation_id,
      text: title,
      blocks: [
        { type: 'text', text: body, markdown: true },
        link ? { type: 'button', text: '결재 페이지로 이동', action_type: 'open_system_browser', value: link } : null
      ].filter(Boolean)
    }
  ↓
[5] 200 OK 응답
```

**매핑 동기화** (`functions/api/kakaowork-sync.ts`):
- 관리자 화면 "매핑 동기화" 버튼이 호출
- 전 직원 employees.email 목록 → 각 이메일에 대해 `users.find_by_email` 호출
- 매칭된 user.id 를 `employee_kakaowork_map` 에 upsert
- 매칭 실패 직원은 응답에 목록으로 반환 → 관리자 수동 처리 가이드

**비활성화 시 동작 (plug-and-play 보장)**:
- `kakaowork_enabled = false` 또는 토큰 미설정 → `notification-sender.ts` 의 push/email 처럼 silent skip
- 매핑 없는 직원 → 해당 채널만 skip, 다른 3채널은 정상 발송
- → 도입 전: 4채널 중 kakao_work 자동 skip → in_app+push+email 만 발송 (현행 동작과 동일)
- → 도입 후 토큰 입력 + 매핑 동기화 1회 실행 → 즉시 4채널 발송

**관리자 UI** (`src/routes/admin/notifications-settings.tsx`):
- 카카오워크 토글 (ON/OFF)
- Bot Access Token 입력 (마스킹 표시)
- Bot 이름 (참고용)
- "매핑 동기화" 버튼 → kakaowork-sync 호출 + 결과 표시 (매칭/실패 카운트, 실패 직원 목록)
- "테스트 발송" 버튼 → 본인에게 send-kakaowork 호출 (subject: "[연결 테스트]")
- 기존 routes/settings 패턴 따름 (관리자 role 가드)

---

## 8. Test Plan

### 8.1 Manual Test Scenarios

| ID | 시나리오 | 검증 채널 | 기대 결과 |
|----|---------|----------|----------|
| T-01 | 일일보고 송신 → 1단계 결재자 1명 | in_app, email, push | 3채널 모두 도착, deliveries 3건 'sent' |
| T-02 | 결재 신규(병렬결재 2명) 송신 | in_app, email, push | 결재자 2명 각각 3채널 도착 |
| T-03 | 병렬결재 중 1명만 승인 → 같은 단계 대기 | (없어야 함) | 다음 단계 결재자에게 발송 0 |
| T-04 | 병렬결재 2명 모두 승인 → 다음 단계 | in_app, email, push | 다음 단계 결재자에게 3채널 도착 |
| T-05 | 최종 단계 승인 → 작성자 | in_app, email, push | 작성자에게 "결재 완료" 3채널 도착 |
| T-06 | 반려 → 작성자 | in_app, email, push | 작성자에게 "반려 + 사유" 3채널 |
| T-07 | 종 클릭 (approval_pending) | UI | `/admin/approval/{docId}` 이동 + 상세 페이지 렌더 |
| T-08 | 비로그인 상태 이메일 CTA 클릭 | UI flow | login → 로그인 → `/admin/approval/{docId}` 자동 복귀 |
| T-09 | 잘못된 email 로 발송 (R4) | Server | 결재 액션은 정상, deliveries status='failed' 기록만 |
| T-10 | cron 수동 curl 호출 — 미결재 2건 | in_app, push | approver 별 2건 (per doc) 또는 묶음 1건 발송 |
| T-11 | cron 같은 날 2번째 호출 | (dedupe) | 발송 0, skippedDuplicates = N |
| T-12 | 인증 누락 cron | Server | 401 응답 |

### 8.2 Runtime Verification Plan (Check 단계용)

**L1 — API Endpoint Tests**:
```bash
# cron 인증 정상
curl -X POST https://hr.interohrigin.com/api/cron-pending-approval-reminder \
  -H "X-Cron-Secret: $CRON_SECRET" -d '{"dryRun":true}'
# expect: 200, JSON with scanned/recipientsNotified

# 인증 실패
curl -X POST https://hr.interohrigin.com/api/cron-pending-approval-reminder
# expect: 401
```

**L2 — UI Action Tests** (Playwright 가능 시):
- 로그인 → 일일보고 작성 → 결재 송신 → 결재자 계정으로 전환 → 종 알림 카운트 +1 확인 → 클릭 → `/admin/approval/{docId}` URL 일치 검증

**L3 — E2E**: T-01 ~ T-06 의 시퀀스 전체 수행.

---

## 9. Security

- ✅ cron 엔드포인트: `X-Cron-Secret` 매칭 (기존 패턴)
- ✅ Service Role Key 는 Cloudflare 환경변수에만 (클라이언트 노출 X)
- ✅ VAPID Private Key 동일 (환경변수)
- ✅ 이메일 본문 CTA URL 은 `${APP_URL}` 환경변수 기반 — 외부 redirect XSS 위험 없음
- ✅ 헤더 종 `navigate(route)` 는 RELATED_ROUTE 화이트리스트 검증 후 호출
- ✅ `:id` 치환은 `item.related_entity_id` (DB 에서 온 값) — 사용자 입력 아님

---

## 10. Rollout Plan

| Step | Action | Rollback |
|------|--------|----------|
| 1 | 마이그 143 적용 | `DROP INDEX idx_notification_deliveries_dedupe; DROP INDEX idx_notification_deliveries_approval;` |
| 2 | Phase 1~4 push (in_app + email 동작 시작) | revert commits — 알림 미발송 상태로 복귀, 결재 흐름 영향 0 |
| 3 | Phase 5 push (Web Push 동작 시작) | `send-push.ts` 만 이전 throw 버전으로 revert |
| 4 | Phase 6 push + cron 등록 | cron expr 비활성화 |

배포는 `git push origin main` → Cloudflare Pages auto-deploy. wrangler 별도 실행 X.

---

## 11. Implementation Guide

### 11.1 Pre-flight Checks (Phase 1 첫 작업으로 수행)

1. `approval_documents.requester_id` 와 `approval_steps.approver_id` 가 `users.id` 인지 `employees.id` 인지 — `supabase/migrations/_backup_legacy/` 또는 schema 확인
2. `users` 테이블에 `email` 컬럼 존재 여부 확인 (없으면 `employees.email` 사용 + join 패턴 결정)
3. `notification_channel_configs.enabled_channels` 에 `'push'` 가 포함되어 있는지 확인 (필요시 운영 화면에서 활성화)

### 11.2 Convention Reminders

- 한국어 UI/메일 본문, 날짜 YYYY.MM.DD
- 코드 수정은 Edit (전체 덮어쓰기 금지)
- 각 Phase 빌드 통과 후 commit + push (Cloudflare auto-deploy)
- Design Ref 주석: 모듈 상단 `// Design Ref: §X.Y — {decision}`
- Plan SC 주석: 핵심 로직 옆 `// Plan SC: SC-NN`

### 11.3 Session Guide (Module Map)

| Module | Scope Key | Files | 의존성 | 1세션 가능? |
|--------|-----------|-------|--------|------------|
| M1 — Dispatcher Core | `phase-1` | `src/lib/approval-notification.ts` | — | ✅ |
| M2 — Triggers | `phase-2` | `daily-report.tsx`, `approval.tsx` | M1 | ✅ |
| M3 — Bell Routing | `phase-3` | `NotificationBell.tsx` | — (독립) | ✅ |
| M4 — Email Templates | `phase-4` | `email-templates.ts` (append) | — (독립) | ✅ |
| M5 — Web Push RFC8030 | `phase-5` | `package.json`, `functions/api/send-push.ts` | — (독립) | ✅ (Step A 우선, 실패시 Step B) |
| M6 — Reminder Cron + Migration | `phase-6` | `functions/api/cron-pending-approval-reminder.ts`, `supabase/migrations/143_*.sql` | M1 의 helper 일부 재활용 가능 | ✅ |
| M7 — KakaoWork plug-and-play | `phase-7` | 마이그 144 + `send-kakaowork.ts` + `kakaowork-sync.ts` + UI + 매뉴얼 + types/sender/dispatcher 4채널 확장 | M1 (dispatcher 확장) | ⚠️ 2 세션 권장 (서버 + UI) |

**권장 세션 분할** (sequential, 각 세션 = 빌드 → commit → push):

1. **세션 1**: M4 (이메일 템플릿) + M5 (Web Push) — 가장 독립적, 의존성 X
2. **세션 2**: M1 (디스패처) — M4 호출 + send-push 호출
3. **세션 3**: M2 (트리거 연결) + M3 (종 라우팅) — M1 의존
4. **세션 4**: M6 (cron + 마이그) — 운영 등록 가이드 포함

**또는 사용자가 sequential phase 1→6 순으로 진행하라고 지정했으므로 그 순서 그대로 수행** (Plan §"진행 방식" 3번): Phase 1 → 2 → 3 → 4 → 5 → 6.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-30 | 초기 작성. Push = `@block65/webcrypto-web-push` 채택 결정 (사용자 Q1 충족) | cto-lead |
