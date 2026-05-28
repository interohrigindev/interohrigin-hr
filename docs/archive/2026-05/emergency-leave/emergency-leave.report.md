# emergency-leave 완료 보고서 (Report Phase)

> **Feature**: emergency-leave (긴급연차) · PDCA #4 (feature-development)
> **Date**: 2026-05-28
> **Author**: cto-lead
> **Match Rate**: 98.4% ✅ · **Success Criteria**: 8/8 Met · **Critical/Important Gap**: 0/0

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 출근 전날 밤/새벽 긴급·질병 시 인사담당 개인 연락 의존 + 정식 결재선의 즉시 처리 불가로 "선 신청 / 후 정식화"가 불가능했다. |
| **Solution** | 연차 메뉴에 [일반]/[긴급] 토글 신설 — 긴급은 결재선 없이 즉시 통보형 상신 + 임원급(hr_admin·ceo·director) 풀 내용 이메일 자동발송. 출근 후 보완자료 첨부 → [연차 신청] 전환 시 기존 결재선·트리거로 정식화·차감(부족 시 관리자 무급 확인). |
| **Function/UX Effect** | 새벽에도 시스템만으로 긴급연차 통보 완료. 임원진 즉시 인지. 신규 테이블 분리 + buildApprovalLine 추출 재사용으로 기존 연차/결재/차감에 회귀 0. |
| **Core Value** | "통보 즉시성"과 "결재 정합성"을 2단계로 분리해 둘 다 충족. 민감 건강정보는 수신자 임원급 한정 + RLS로 비공개 원칙 준수. |

### 1.3 Value Delivered (실제 결과)

| 관점 | 지표 | 결과 |
|------|------|------|
| 구현 완성도 | Match Rate / SC | 98.4% / 8-8 Met |
| 품질 | Critical·Important Gap / 회귀 / DB ALTER / 빌드 | 0·0 / 0 / 0 / 3-3 통과 |
| 범위 | Module / 세션 / 코드 커밋 | M1~M4 / Do 3세션 / 3 commits (1412c75, 463ad97, 9499b7e) |
| 안전성 | 트리거 정합성 / 민감정보 노출 | 이중차감 방지 검증 / 임원급 한정 + RLS |

---

## 2. PDCA 여정

- **Plan (5/28)**: Q1~Q6 결정 (신규 테이블 B / 이메일 임원급 한정 / 무급 관리자 확인 / 전환 기존 결재선 / 신규 버킷 / 비상연락망 상수). DB 조사로 Q1 안전성 확정.
- **Design (5/28)**: 옵션 C(Pragmatic) — 상태머신 단일 테이블 + best-effort 이메일 + helper 추출 + 무급 수동. Module Map M1~M4.
- **Do 3세션**: S1(마이그레이션+이메일템플릿) → S2(신청 UI 토글+이메일 루프+buildApprovalLine 추출) → S3(목록/보완/전환/무급).
- **Check (5/28)**: 정적 분석 98.4%, SC 8/8, 트리거 정합성 검증, 회귀 0.

---

## 3. Key Decisions & Outcomes

| 결정 | 근거 | 결과 |
|------|------|------|
| **데이터 모델: 신규 `emergency_leave_requests`** (옵션 B) | 고유 필수항목 + 트리거 무간섭 + leave_waivers 선례 | 회귀 0, DB ALTER 0 |
| **아키텍처 옵션 C (Pragmatic)** | 통보 즉시성+전환 정합성 핵심, 트래픽 적음 | YAGNI 회피, 2파일 신규/2 수정 |
| **신청 UI = leave.tsx [일반]/[긴급] 토글** | 신규 라우트 대신 통합 | 기존 신청 회귀 0 |
| **병가 진단서: 경고 → 차단** (Checkpoint 3 변경) | 대표 결정 (증빙 강제) | sick && !attachment 차단 (이중 가드) |
| **이메일 수신자 임원급 한정** | 민감 건강정보 비공개 | 풀 템플릿 허용, 부서리더 제외 |
| **무급 관리자 수동 (혼합 가능)** | 급여 영향 + 자동전환 금지 정신 | paid/unpaid 분리 + days_count 자동 조정 |
| **buildApprovalLine 추출** | 신청·전환 결재선 공유 (DRY) | 동작·toast 보존 |
| **storage 정책 db-exec 적용** | Design "콘솔 수동" → db-exec 성공 | 콘솔 수동 불필요 (학습) |
| **트리거 무급 days_count 분리** | trigger 가 days_count 전체 차감 | 미승인 시 days_count=paid 조정, 이중차감 방지 |

**전 결정 구현 반영. Deviation: Design "경고 후 허용" → 구현 "차단" (대표 결정대로).**

---

## 4. Success Criteria Final Status — 8/8 (100%)

SC-01 결재선 없이 즉시 신청 ✅ / SC-02 임원급 자동 이메일 ✅ / SC-03 보완자료 업로드 ✅ / SC-04 전환 링크 ✅ / SC-05 차감·무급 수동 ✅ / SC-06 마이그레이션 ✅ / SC-07 빌드·회귀 0 ✅ / SC-08 병가 진단서 차단 ✅

---

## 5. 향후 권고

1. **실제 긴급연차 1건 E2E 모니터링** — 신청→이메일(임원 3명)→보완→전환→승인→차감 실데이터 1회 확인.
2. **이메일 발송 성공률 모니터링** — notification_deliveries emergency_leave sent/failed 비율.
3. **무급 승인 후 케이스 급여 연동** — 현재 수동 안내, 급여 모듈 연동 시 자동화 후보.
4. (선택) 긴급연차 신청 빈도/유형 통계 운영 관찰.

---

## 6. CLAUDE.md 절대 규칙 준수

기존 테이블 ALTER 0 / 민감정보 임원급 한정 + RLS / 한국어 UI·YYYY.MM.DD·모바일 / Phase 자동전환 금지(결재없는 신청 ≠ 자동승인) / Edit 부분수정+빌드 — 전부 ✅.

---

## 7. 산출물

- 코드: `134_emergency_leave.sql` (신규) / `leave.tsx` (수정) / `email-templates.ts` (수정)
- 커밋: 1412c75 (S1), 463ad97 (S2), 9499b7e (S3) + archive
