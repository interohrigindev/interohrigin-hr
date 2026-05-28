# emergency-leave Design Document (Archive 압축본)

> PDCA #4 · 2026-05-28 · Option C (Pragmatic) 선정
> 원본 전체(3옵션 비교표, 마이그레이션 SQL, Page UI Checklist, L1~L3 테스트 시나리오)는 git history (archive 커밋 직전 `docs/02-design/features/emergency-leave.design.md`) 에 보존. 본 사본은 핵심 요약.

## Context Anchor
WHY 긴급·질병 즉시 통보+사후 정식화 / WHO 전직원·hr_admin·ceo·director / RISK 민감정보·트리거정합성·hr_admin누락 / SUCCESS 5단계 / SCOPE 신규 테이블+이메일+버킷+leave.tsx 통합

## Architecture Option 선정 = C (Pragmatic)
3옵션 비교 축 = 안전장치/상태머신/감사로그 깊이.
- A Minimal: 최소 컬럼, 이메일 1회 무시 → 이메일 유실·결재라인 복붙 리스크
- B Clean: 전이로그 테이블+재시도큐+각서연동 → 과설계
- **C 선정**: 단일 테이블 상태머신(filed/supplemented/promoted/cancelled) + best-effort 이메일+notification_deliveries 로그 + buildApprovalLine helper 추출 + 무급 관리자 수동

## 데이터 모델 — emergency_leave_requests (신규, migration 134)
employee_id / leave_kind('emergency'|'sick') / start·end_date / days_count / reason(필수) / handover_notes / delegate_employee_id+delegate_name_text / hospital_plan / same_day_filing+filing_note / attachment_path+uploaded_at / status / promoted_to_leave_id(leave_requests FK)+promoted_at / paid_deduct_days+unpaid_days+payout_decided_by/at / notified_at / created_by.
RLS: 본인 INSERT/SELECT/UPDATE + 임원급(director,division_head,ceo,admin,**hr_admin**) SELECT/UPDATE, DELETE 차단. 버킷 emergency-leave-files (private) + storage 정책 2.

## 전환 흐름
filed → [연차 신청] → buildApprovalLine() 재사용 → leave_requests INSERT(approval_status='in_review', leave_type=sick면 'sick' 아니면 'annual', days_count=전체) → emergency.status='promoted'+promoted_to_leave_id 링크. 차감은 결재 최종 승인('approved' 전이) 시 트리거가 1회. 무급분은 days_count 제외(미승인 시 days_count=paid 조정).

## 이메일
email-templates.ts `emergencyLeaveNotificationEmail` (#6B3FA0, escapeHtml/nl2br, 풀 내용). 수신자 hr_admin+ceo+director active → sendNotification 루프(best-effort).

## 병가 진단서 차단 (Checkpoint 3: 경고 → 차단)
sick && !attachment_path → 전환 차단 (로직 + UI disabled 이중 가드). emergency(개인사정)는 사유서 권장(차단 X).

## Module Map (Do 세션)
M1 마이그레이션+RLS+버킷 / M2 이메일 템플릿+발송 / M3 신청 UI 토글+buildApprovalLine 추출 / M4 목록·보완·전환·무급. → Do 3세션(S1=M1+M2, S2=M3, S3=M4).
