---
name: two-stage-notify-then-formalize
description: 긴급/즉시성이 필요한 신청을 "결재 없는 통보형 신청 → 사후 정식 결재 전환"의 2단계 라이프사이클로 분리하는 패턴 (긴급연차 PDCA #4 실증). 기존 결재/차감 트리거 무수정 재사용.
metadata:
  type: feedback
---

긴급 상황(즉시성)과 정식 절차(정합성)가 충돌할 때, 둘을 2단계로 분리해 모두 충족하는 패턴.

**Rule**: "즉시 통보가 필요하지만 정식 결재는 사후에 해도 되는" 요구는 → ① 신규 테이블에 결재 없는 통보형 레코드(status='filed')를 만들고 즉시 알림 발송, ② 사후에 사용자가 정식 결재 엔티티(기존 leave_requests 등)로 "전환(promote)"하며 기존 결재선·트리거를 그대로 태운다. 두 레코드는 FK(promoted_to_xxx_id)로 양방향 링크.

**Why**: 긴급연차(PDCA #4)에서 "결재 없이 즉시 신청 + 임원 통보" vs "정식 연차 차감"을 한 테이블/한 흐름에 욱여넣으면 기존 `trigger_leave_balance`(approved 전이 시 days_count 차감)와 충돌하거나 leave_requests 를 ALTER 해야 함(CLAUDE.md 금지). 신규 테이블 분리 + 전환 시 정식 row INSERT 로 기존 트리거·결재선 100% 무수정 재사용 → 회귀 0, Match 98.4%.

**How to apply**:
- 통보형 테이블은 신규로(기존 ALTER 0). 상태머신 `filed → (supplemented) → promoted | cancelled` 를 단일 text 컬럼 CHECK 로(전이 로그 테이블은 YAGNI — 트래픽 적으면 over-engineering).
- 즉시 알림은 best-effort: 발송 실패가 신청 INSERT 를 막지 않게(try/catch, 부분 성공 toast). 발송 완료 시각만 기록(notified_at).
- 전환 시 결재선 생성 로직은 **기존 신청 경로에서 helper 로 추출해 공유**(buildApprovalLine). 추출 시 기존 분기의 특정 에러 toast 까지 보존해 회귀 0.
- **차감 트리거가 "전체 수량"을 차감하면, 부분 면제(무급 등)는 정식 row 의 수량 컬럼을 조정**해서 트리거가 면제분을 빼고 차감하게(미승인 시점에만 조정 가능, 승인 후엔 정산 수동). 합계 검증(차감+면제 = 신청수량)으로 정합성 강제.
- 증빙 강제(병가 진단서 등)는 전환 버튼에서 로직+UI disabled 이중 가드.

**측정**: PDCA #4 Match 98.4%, SC 8/8, Critical/Important 0, 회귀 0, DB ALTER 0, 3 commits 빌드 통과. [[leave-email-storage-infra]] (구체 진입점) + [[session-split-pattern-pdca-do]] (Do 3세션) + [[static-check-external-build-pattern]] 함께 적용.
