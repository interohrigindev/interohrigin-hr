---
name: leave-email-storage-infra
description: 연차/이메일/첨부 인프라 진입점 맵 — 긴급연차(PDCA #4) 및 이후 leave/notification 작업 시 재사용할 검증된 함수/테이블 위치
metadata:
  type: project
---

PDCA #4 (emergency-leave) Phase 1 조사에서 코드로 검증한 인프라 진입점.

**이메일 발송**: `src/lib/notification-sender.ts` 의 `sendNotification({channel:'email', recipientEmail, subject, body})` 가 정식 진입점. 내부에서 `/api/send-email` (Cloudflare Function `functions/api/send-email.ts`, Gmail API) 호출 + `notification_deliveries` 에 성공/실패 자동 로그. **단일 수신자 only** (to 1개) → 다수 발송은 수신자 루프. HTML 템플릿은 `src/lib/email-templates.ts` 의 `{subject, html}` 반환 함수들(브랜드 보라 #6B3FA0 그라데이션 헤더 패턴). leave.tsx 는 `annualLeavePromotionEmail` 사용.

**첨부 업로드**: `src/lib/storage-upload.ts` 의 `safeStorageUpload(bucket, path, file, opts)` (AbortController 타임아웃+재시도, RLS/auth 에러 분류) + `describeUploadError`. private 버킷 + `createSignedUrl`. 기존 leave 계열 버킷: `leave-waivers` (migration 120), 증명서는 `certificates`.

**연차 데이터 모델** (전부 신규 테이블, 기존 ALTER 0):
- `leave_requests`: employee_id, leave_type, start_date, end_date, days_count, reason, approval_status(pending/in_review/approved/rejected), current_step, approval_line(jsonb ApprovalStep[]), is_promoted, approved_by/at. 최종 승인 시 **DB 트리거 `update_leave_balance` 가 연차 자동 차감** (leave.tsx:442 주석).
- `employee_hr_details`: annual_leave_total/used/remaining.
- `annual_leave_promotions`, `leave_balance_snapshots`, `leave_promotion_responses` (migration 103), `leave_waivers`(120, 전자서명 각서 패턴 — 긴급연차 무급/포기 시 참고).
- `approval_documents`(doc_type='leave', linked_leave_id), `approval_templates`/`approval_steps`.

**Why**: 메인이 알려준 추정 경로(notification-sender 발송함수 / leave.tsx 위치)는 일부 정확하나 send 진입점은 notification-sender, 발송 자체는 send-email Function 임을 명확화. 추정 `leave-calculator` 는 부여일수 계산만, 차감은 DB 트리거.

**How to apply**: 긴급연차는 신규 테이블/컬럼 추가 시 leave_requests 를 ALTER 하지 말고(기존 트리거 영향 우려) 신규 `emergency_leave_requests` 또는 leave_requests 내 leave_type='emergency' + 별도 상태 jsonb 중 택1 — Design 3옵션 비교 대상. 이메일 다수 발송은 sendNotification 루프. 첨부는 safeStorageUpload + certificates 또는 신규 버킷.

**PDCA #4 (emergency-leave) 완결 (2026-05-28, Match 98.4%, SC 8/8) — 검증된 사실**:
- 채택: 신규 테이블 `emergency_leave_requests` (migration 134) + leave.tsx [일반]/[긴급] 토글 통합. 결재라인 빌더는 leave.tsx 인라인 → `buildApprovalLine()` 추출(신청·전환 공유, "리더 미지정" 특정 toast 보존으로 회귀 0).
- **트리거 정합성**: `update_leave_balance`(트리거명 trigger_leave_balance) = `approval_status='approved'` 전이 시에만 `days_count` 1회 차감. 전환 row 는 'in_review' INSERT(즉시 차감 X). **무급분은 leave_requests.days_count 에 넣지 말 것** — 무급 입력 시 미승인이면 days_count=paid 로 조정, 이미 승인이면 급여 정산 수동(이중차감 방지).
- **storage.objects 정책은 db-exec(postgres 권한)로 생성 가능** — Design "콘솔 수동" 가정했으나 메인이 db-exec 로 적용 성공. migration 119/120 주석의 "권한 부족"은 일반 러너 기준; db-exec 경유는 가능 → 마이그레이션 파일에 멱등 storage 정책 SQL 포함해 파일=DB 일치 권장.
- 이메일 수신자 = role IN ('hr_admin','ceo','director') active (실 5명). [[cross-schema-rpc-and-central-adapter]] hr_admin 누락 함정을 RLS·수신자 양쪽 인라인 명시로 회피.
