# emergency-leave Gap Analysis (Check Phase)

> **Feature**: emergency-leave (긴급연차) · PDCA #4
> **Date**: 2026-05-28
> **Author**: cto-lead (단일 모드 — gap-detector nested spawn 불가, 정적 분석 + 트리거 정합성 검증)
> **Analysis Mode**: Static (Structural + Functional + Contract). Playwright 미설치 → Runtime 미실행, static-only 공식 적용.
> **Design**: [emergency-leave.design.md](./emergency-leave.design.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 긴급·질병 상황에서 인사담당 개인 연락·결재 지연 없이 연차를 "즉시 통보"하고 나중에 정식화 |
| **WHO** | 전 직원(신청자) / hr_admin·ceo·director (이메일 수신·확정자) |
| **RISK** | ① 민감 건강정보 노출 ② 전환 row 트리거 정합성 ③ hr_admin ADMIN_ROLES 누락 함정 |
| **SUCCESS** | 신청(결재없이)→임원급 자동발송→보완자료 업로드→정식 전환(결재선)→차감/무급(관리자확인) 5단계 |
| **SCOPE** | 신규 `emergency_leave_requests` + 전용 이메일 템플릿 + 버킷 + leave.tsx 통합 UI |

---

## 1. Match Rate

| Axis | Weight (static) | Score | 비고 |
|------|:---:|:---:|------|
| **Structural** | 0.2 | 100% | migration 134 / leave.tsx / email-templates.ts 3개 산출물 모두 존재 + 예상 심볼 전부 구현 |
| **Functional** | 0.4 | 97% | 5단계 흐름 전부 동작 로직 존재. Minor: 무급 분리가 "전환 후 미승인 시점"에만 days_count 자동 조정(설계상 한계, 안내됨) |
| **Contract** | 0.4 | 99% | 테이블 스키마 ↔ TS 타입 ↔ INSERT/UPDATE 페이로드 ↔ 이메일 함수 시그니처 3-way 정합 |
| **Overall** | — | **98.4%** | (100×0.2)+(97×0.4)+(99×0.4) = 20 + 38.8 + 39.6 |

> **Match Rate 98.4% ≥ 90% → Report 진입 기준 충족.** Critical 0 / Important 0.

---

## 2. Plan Success Criteria 평가

| # | Success Criteria | 상태 | Evidence |
|---|------------------|:----:|----------|
| SC-01 | 긴급연차 신청(결재선 없이) + 즉시 상태 저장 | ✅ Met | `leave.tsx:handleSubmitEmergency` — INSERT status='filed', 결재선 미생성 |
| SC-02 | 신청 동시 임원급(hr_admin+ceo+director) 자동 이메일 | ✅ Met | `EMERGENCY_NOTIFY_ROLES` 필터 + `sendNotification` 루프 + `emergencyLeaveNotificationEmail` + notified_at |
| SC-03 | 출근 후 보완자료 업로드 + 신청 수정 | ✅ Met | `handleEmergencyUpload` (safeStorageUpload→emergency-leave-files) → attachment_path/uploaded_at/status='supplemented' |
| SC-04 | [연차 신청] 전환 — 기존 결재선으로 leave_requests 생성·링크 | ✅ Met | `handlePromoteEmergency` — `buildApprovalLine()` 재사용 + INSERT(in_review) + promoted_to_leave_id/promoted_at |
| SC-05 | 정식 승인 시 기존 트리거로 차감, 부족 시 관리자 무급/혼합 수동 | ✅ Met | 트리거 무수정 (approved 전이 시 days_count 차감) + `handleSavePayout` 차감/무급 분리 + days_count 자동 조정 |
| SC-06 | 신규 테이블/버킷/RLS 마이그레이션 | ✅ Met | `134_emergency_leave.sql` 적용·검증 (테이블/RLS 5/버킷/storage 정책 2) |
| SC-07 | 빌드 성공 + 기존 연차 흐름 회귀 0 | ✅ Met | 3 commits 모두 빌드 통과 (S1/S2/S3), buildApprovalLine 추출 회귀 0 |
| SC-08 | 병가 진단서 미첨부 시 전환 차단 (대표 결정) | ✅ Met | `handlePromoteEmergency` sick && !attachment_path → 차단 + UI disabled 이중 가드 |

**SC 종합: 8/8 Met.**

---

## 3. Design 충실도 (옵션 C)

| Design 항목 | 구현 | 정합 |
|------|------|:----:|
| 신규 `emergency_leave_requests` (필수4종+상태머신+전환링크+무급) | migration 134 | ✅ |
| RLS 본인+임원급(hr_admin 포함) | 134 정책 5건, role IN(director,division_head,ceo,admin,hr_admin) | ✅ |
| 버킷 emergency-leave-files (private) + storage 정책 | 134 — 버킷 + storage.objects insert/select 2정책 (db-exec 적용) | ✅ (콘솔 수동 불필요로 개선) |
| 전용 이메일 템플릿 (#6B3FA0, 풀 내용, escapeHtml) | email-templates.ts `emergencyLeaveNotificationEmail` | ✅ |
| 수신자 hr_admin+ceo+director, sendNotification 루프, best-effort | leave.tsx | ✅ |
| 신청 UI [일반]/[긴급] 토글 | leave.tsx Dialog | ✅ |
| buildApprovalLine helper 추출 (신청·전환 공유) | leave.tsx | ✅ |
| 무급 관리자 수동 (차감/무급/혼합) | handleSavePayout + 모달 | ✅ |
| 병가 진단서 차단 (Checkpoint 3 변경: 경고→차단) | 구현됨 | ✅ (Decision deviation 추적됨) |

**옵션 C 충실도: 9/9.** Design §11 Module Map(M1~M4) 전부 구현.

---

## 4. 트리거 정합성 검증 (핵심 리스크 #2 해소)

`update_leave_balance()` 본문: `approval_status='approved'` 전이 시에만 `days_count` 만큼 1회 차감.

| 시나리오 | 차감 | 검증 |
|----------|:----:|------|
| 긴급연차 신청 (emergency_leave_requests, 신규 테이블) | 0 | ✅ leave_requests 무관 |
| 전환 INSERT (leave_requests, approval_status='in_review') | 0 | ✅ 'approved' 아님 → 미차감 |
| 정식 결재 최종 승인 ('approved' 전이) | 1회 (days_count) | ✅ 트리거 정상 |
| 무급분 존재 시 | paid 만 차감 | ✅ `handleSavePayout` 가 미승인 시점에 leave_requests.days_count=paid 로 조정. 이미 승인 시 급여 정산 안내(이중차감 방지) |

**이중/과차감 리스크 해소.** 무급 분리 정합성은 "미승인 시점 조정 + 합계 검증(paid+unpaid=days_count)"으로 보장.

---

## 5. 회귀 점검

| 항목 | 결과 |
|------|:----:|
| `buildApprovalLine()` 추출 전후 동작 동일 (+ "리더 미지정" toast 보존) | ✅ 회귀 0 |
| 일반 연차 신청 — helper 호출로만 변경 | ✅ |
| `fetchData()` — emergency select 추가만 | ✅ |
| 기존 테이블 ALTER | 0건 ✅ |
| email-templates.ts 기존 함수 무수정 | ✅ |
| 빌드 3 commits 통과 (S2 1차 noUnusedLocals → export interface 해소) | ✅ |

---

## 6. Gap List

| ID | Severity | 내용 | 처리 |
|----|:--------:|------|------|
| G1 | Minor | 무급 days_count 자동 조정이 "미승인 시점"에만 동작 — 승인 후 급여 정산 수동 | 의도된 한계(무급 자동화 Out-of-Scope). 향후 권고 |
| G2 | Minor | Runtime(L1~L3) 미실행 — Playwright 미설치 + 실 데이터 0 | 향후 권고: 실제 1건 E2E 모니터링 |
| G3 | Minor | 이메일 발송 성공률 미측정 (best-effort 로그만) | 향후 권고: notification_deliveries 발송률 모니터링 |

**Critical 0 / Important 0.**

---

## 7. Out-of-Scope 확인 (Plan §2.2 준수)

| 제외 항목 | 확인 |
|------|:----:|
| 무급휴가 자동화 | ✅ 관리자 수동만 |
| 비상연락망 편집 기능 | ✅ 상수 안내문구만 |
| 부서리더/일반직원 알림 | ✅ 임원급 3종 한정 |
| 긴급연차 자체 별도 결재선 | ✅ 결재 없음 |

---

## 8. 결론

- **Match Rate 98.4%**, **SC 8/8 Met**, Critical/Important 0, 회귀 0, CLAUDE.md 위반 0.
- 5단계 라이프사이클 전부 코드 레벨 완성. **Checkpoint 5 = "그대로 진행"** → Report 진입.
