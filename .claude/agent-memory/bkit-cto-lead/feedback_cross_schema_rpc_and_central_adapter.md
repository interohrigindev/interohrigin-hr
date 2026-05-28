---
name: cross-schema-rpc-and-central-adapter
description: Supabase 멀티 스키마(public/finance/cs/mall) 통합 시 — public SECURITY DEFINER RPC + guard CTE 캡슐화 패턴, 그리고 중앙 클라이언트(ai-client)에 자동 부수효과를 심어 N개 호출처를 무수정으로 확장하는 패턴
metadata:
  type: feedback
---

PDCA #3 (unified-ai-cost-dashboard) 에서 검증된 두 가지 회귀-0 확장 패턴.

## 패턴 1 — cross-schema 통합은 public SECURITY DEFINER RPC + guard CTE 로 캡슐화

**Rule**: 같은 Supabase 프로젝트의 다른 스키마(finance/cs/mall) 데이터를 HR 앱에서 읽어야 할 때, 클라이언트가 직접 접근하지 말고 `public.{name}()` SECURITY DEFINER RPC 한 곳에 캡슐화한다.

**Why**: PostgREST 는 기본적으로 public 스키마만 노출 → cross-schema 직접 접근 불가. 또한 권한 통제를 RPC 1곳에 모아야 우회 통로가 안 생긴다.

**How to apply**:
- `LANGUAGE sql SECURITY DEFINER SET search_path = public, finance` (스키마 명시 고정)
- 관리자 권한은 `WITH guard AS (SELECT 1 WHERE EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.role IN (...)))` + 각 UNION 절에 `CROSS JOIN guard` → 비관리자는 0행 (throw 아님, graceful)
- `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated`
- RPC 는 raw 데이터만 반환, 가공(단가 환산 등 변동 잦은 로직)은 클라이언트로 분리 (SRP)
- ⚠️ **기존 헬퍼 함수 재사용 전 role 범위 검증**: `public.is_admin()` 은 `role IN (director,division_head,ceo,admin)` 로 **hr_admin 누락**. 화면 가드(AdminRoute)가 hr_admin 포함이면 모순 발생 → 화면 권한과 동일한 role 목록을 인라인 명시할 것. (grep 으로 기존 정책 패턴 `e.id = auth.uid()` 확인 후 결정 — No Guessing)

## 패턴 2 — 중앙 클라이언트에 자동 부수효과 → N개 호출처 무수정 확장

**Rule**: 모든 호출이 단일 진입점(예: `ai-client.ts` 의 generateAIContent/Chat)을 거치면, 그 진입점 **내부에 부수효과(로깅/적재)를 자동 호출**로 심어 49개 호출처를 한 줄도 수정하지 않고 기능을 전사 활성화한다.

**Why**: PDCA #3 에서 AI 토큰 적재(logAiUsage)를 49개 호출처마다 부르는 대신, ai-client 내부 `recordUsage()` 1곳에서 자동 호출 → 호출처 수정 0, 회귀 0.

**How to apply**:
- 반환 타입 확장은 **옵셔널 필드 추가**로 (예: `AIResponse.usage?`) → 기존 소비자 영향 0
- 비공개 헬퍼(callAIProxy)의 반환 타입을 바꿔도 내부 caller 만 갱신하면 외부 격리
- 부수효과는 **best-effort** (try/catch + void, 실패가 본 흐름을 막지 않게). 토큰 0이면 skip(노이즈 방지)
- feature 라벨 등 분류 정보는 진입점에 옵셔널 인자(default)로 추가 → 점진 세분화 가능

**측정** (PDCA #3): Match 98%, 3 commits 전부 1회 빌드 통과, 회귀 0, DB ALTER 0. [[static-check-external-build-pattern]] + [[session-split-pattern-pdca-do]] 와 함께 적용됨. 방향 정정(운영비→AI 과금)이 Plan 단계에서 일어나 폐기 코드 0 — 인터뷰를 코드보다 앞세운 효과.
