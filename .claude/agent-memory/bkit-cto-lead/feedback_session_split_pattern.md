---
name: session-split-pattern-pdca-do
description: PDCA Do phase 를 4~5세션으로 분할 + 매 세션 빌드 검증 + 잔여 리스크 점검 → 회귀 누적 0 으로 큰 기능 안전 구현
metadata:
  type: feedback
---

PDCA Do phase 의 세션 분할 (4-5세션) + 매 세션 빌드 검증 + 잔여 리스크 점검 — 큰 기능을 회귀 누적 없이 구현하는 패턴.

**Why**: PDCA #2 (external-pre-survey-import, 약 +1,254 LOC, 8 파일) 진행 시 단일 세션으로 묶었으면 약 80-110 turns 예상되었고 중간 빌드 실패 시 디버깅 비용이 누적될 위험 컸음. 4세션 분할 후 추가 결정으로 3.5 세션이 끼어들었고, 모든 세션이 독립적으로 빌드 통과 + 다음 세션 베이스가 정합 상태로 시작.

**How to apply**:
1. Design phase 의 Module Map 을 그대로 세션 단위로 매핑 (보통 Module 1-2 합쳐서 세션 1, Module 3 단독 세션 2, Module 4-5-6 합쳐서 세션 3)
2. 각 세션 종료 조건:
   - 빌드 통과 (대표 검증)
   - 회귀 0 — 기존 함수 시그니처 변경 0, 사용처 검증
   - Critical/Important 잔여 리스크 0
   - 다음 세션 진입 조건 명시
3. 세션 사이에 짧은 "검증 → 커밋 → 푸시" 외부 사이클을 끼움 — 매 세션 commit 메시지에 "(PDCA #N 세션 M)" 표기
4. **유연 확장**: Phase 4 (Check) 직전 추가 결정 발생 시 짧은 단일 모듈 세션 (예: 3.5) 으로 흡수 — 사이클 안의 작은 iteration 패턴. PDCA #2 의 L2-12 (AI 분석에 manual entries 포함) 가 이 패턴으로 처리됨.

**측정** (PDCA #2):
- 4 코드 commits / 4 빌드 통과
- 5세션 (Plan / Design / Do×3 + Do 3.5 / Check) — 단일일 완료
- LOC 추정 vs 실제: 작업량 약 1.5~2x 과소평가 (Module 3 Dialog 만 332 LOC) → 다음 사이클은 컴포넌트 복잡도 (state 수, hook 수) 도 반영
- Match Rate 99.2%, SC 8/8 Met, 회귀 0

**보완 권고**: cycleType 분류 (`feature-development` / `post-hoc-cleanup` / `maintenance`) 정착. PDCA #3 부터 cycleType 별로 평균 세션 수 / 평균 commits / 평균 Match Rate 통계 보존 가치 있음. [[feedback_workflow_no_residual_risks]] 와 동일 정신.
