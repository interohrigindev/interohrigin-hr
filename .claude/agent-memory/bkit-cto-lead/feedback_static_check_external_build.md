---
name: static-check-external-build-pattern
description: cto-lead 가 Bash 권한 없는 환경에서 코드 작성 시 — 정적 사전 검증 (strict/verbatimModuleSyntax/noUnusedLocals 수동 점검) + 외부 빌드 위임 패턴으로 빌드 한 번에 통과
metadata:
  type: feedback
---

정적 사전 검증 + 외부 빌드 위임 — 코드 작성 시 LLM 이 직접 빌드를 못 돌리는 환경에서 매 세션 빌드 한 번에 통과하는 패턴.

**Why**: PDCA #2 (external-pre-survey-import) 진행 중 cto-lead 환경에 Bash 권한 0 + gap-detector subagent nested spawn 차단. 그럼에도 4 코드 commits (`c38f8b1` / `4f199b6` / `c47f1f8` / `4274b78`) 모두 대표가 외부에서 `npm run build` 1회 실행 후 통과 (수정 0회). 5.33s~5.48s 일정한 빌드 시간 + 신규 경고 0.

**How to apply**:
1. 코드 작성 직후 보고 전에 LLM 이 다음을 수동 점검:
   - tsconfig.app.json 의 모든 옵션 (특히 `verbatimModuleSyntax: true`) → 타입 import 인라인 `type` 한정자 / 별도 `import type` 일관 적용
   - `noUnusedLocals` / `noUnusedParameters` → import 사용처 grep count 확인 (예: `Grep "ImportName"` 결과 ≥ 2)
   - `strict` → `any` 0, type guard / narrowing 적절, `as` assertion 은 명확한 union 좁히기에만
   - `react-hooks/exhaustive-deps` → `useCallback` 의 deps 에 호출 대상 함수 포함 (선언 순서 조정)
   - JSX 닫힘 — 추가한 IIFE/Card 닫힘 line 확인
   - 회귀 0 검증 — 신규 함수가 0번 호출되는 케이스의 prompt/render 결과가 기존과 동일한가
2. 작성 끝 보고에 "정적 사전 검증 결과" 표로 명시 — 항목별 ✅/⚠️
3. 빌드는 대표에게 위임 (외부 commit·push 도 대표). cto-lead 는 commit 실행 안 함, 결과 보고만.
4. 빌드 실패 시 대표가 정확한 에러 메시지 전달 → 1회 수정 → 재빌드.

**효과** (PDCA #2 측정):
- 4 코드 commits / 4 빌드 모두 한 번에 통과
- 수정 iteration 0회
- 정적 점검에 추가되는 LLM 시간 < 30초/세션
- 빌드 실패 후 수정 cost (300-500 tokens + rebuild 시간) 회피

**보완 권고**: 향후 Bash 권한이 있는 환경이라도 매 코드 변경 후 빌드 전에 본 정적 점검을 1회 끼우면 builds-per-iteration 비율을 1.0 으로 유지 가능. [[feedback_workflow_no_residual_risks]] 와 시너지.
