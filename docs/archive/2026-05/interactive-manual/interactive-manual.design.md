# interactive-manual Design Document

> **Summary**: 3-Tier 도움말 시스템 — (1) 검색형 Help Center 페이지, (2) 우하단 컨텍스트 호출형 Floating Help, (3) 선택형 체험 투어(Tour) — 의 역공학(reverse-engineered) Design 문서.
>
> **Project**: io-hr-platform
> **Version**: 0.1 (post-hoc — 코드 후행 사후 정리)
> **Author**: 대표 + CTO Lead
> **Date**: 2026-05-27
> **Status**: Archived
> **Planning Doc**: [interactive-manual.plan.md](./interactive-manual.plan.md) (2026-05-26 — historical record로 보존, 일부 superseded)

---

## Deviation from Plan

> **이번 PDCA는 "코드 후행 사후 정리" 사이클**이다. Plan(2026-05-26)은 작성 시점의 의사결정 스냅샷으로 보존하되, 5/26~5/27 구현 도중에 발생한 architecture-level pivot 을 본 Design 에 명시한다.

### 의사결정 흐름

| 시점 | 커밋 | 상태 |
|---|---|---|
| 2026-05-26 | (Plan 작성) | 강제 투어(static product tour) only 모델 결정 |
| 2026-05-26 | `ec366eb` | Phase 1 — 6 챕터 + TourOverlay 구현 (Plan 충실 이행) |
| 2026-05-26 | `0ff0f4d` | TourContext 글로벌화 (회귀 수정) |
| 2026-05-27 | `7eaac4c` | 실제 메뉴 spotlight + 프로젝트&업무 챕터 신규 추가 (챕터 7개로 확대) |
| 2026-05-27 | `1da92db` | tooltip clamp + 사이드바 그룹 자동 펼침 + 챕터 라우트 보정 |
| 2026-05-27 | **`a684b05`** | **Help Center 모델 전환 (외부 리서치 반영)** ← architecture pivot |
| 2026-05-27 | `3f27130` | (본 PDCA 사이클) articles.ts 깨진 article 참조 제거 — Phase 3 Gap G3 |

### Pivot 근거 (커밋 `a684b05` 인용)

> 2026년 외부 SaaS 리서치 (Arcade, UXCam, Userpilot, ServiceNow 등) 베스트 프랙티스:
>
> - **Static "Click Next" tour 는 비효율** — 사용자 이탈 / 학습 효과 낮음
> - **Contextual tooltips**: 사용자 행동 기반 호출 → 이탈 -28%
> - **Interactive walkthrough**: 직접 조작 기반 → Time-to-Value -40%
> - **Help Center (Knowledge Base) 통합**: 검색·셀프서비스 → 인사담당 티켓 -25%
>
> 결론: "강제 투어 only" 는 안티패턴. **Help Center + Contextual Help + Optional Tour** 의 3-Tier 가 표준.

### Plan↔Code 핵심 차이

| 항목 | Plan §3.1~3.3 (5/26) | 현재 코드 (5/27) | 처리 |
|---|---|---|---|
| 모델 | 강제 투어 only | 3-Tier (Help Center / Floating Help / Tour) | **Superseded** — 본 Design 가 정합성 |
| 진입점 | `/manual` 허브 → 챕터 카드 → Tour | `/manual` Help Center + 어디서든 `?` 버튼 + (옵션) Tour | **Superseded** |
| 데이터 구조 | `ManualChapter` + `TourStep` 만 | + **`HelpArticle`** (14건, 7 카테고리, 검색·컨텍스트 매칭 메타) | **Extended** — Plan §3.3 에 누락된 새 도메인 |
| 챕터 수 | 6개 (Plan §4) | **7개** (프로젝트&업무 추가 / 메신저 제거) | **Changed** — Plan §4 ≠ 현 코드 |
| Tour 위치 | `routes/manual/tour.tsx` 내부 Overlay | **`TourContext` 글로벌화** + DashboardLayout 내 `GlobalTourOverlay` 1회 마운트 | **Changed** — 회귀 수정 (Tour 라우트 unmount 회피) |
| 신규 UI 진입점 | (없음) | **Floating `?` button** + 슬라이드 패널 + Article 상세 라우트 | **Added** — Plan 전혀 미언급 |

> **Plan 의 모든 Success Criteria(SC-01 ~ SC-06)는 여전히 유효**하다. SC-01 ("6 챕터") 은 7 챕터로 초과달성, SC-02~06 은 Help Center 도입으로 "달성 + 강화" 된 상태. Phase 3 Gap Analysis 에서 6/6 Met 확인됨 — `./interactive-manual.analysis.md` §6 참조.

---

## Context Anchor

> Plan 의 WHY/WHO 는 그대로 보존, RISK/SUCCESS/SCOPE 는 Help Center 전환 후 시점으로 갱신.

| Key | Value |
|-----|-------|
| **WHY** | (Plan 유지) 신규/기존 직원 모두 HR 플랫폼 메뉴를 모름 → 인사담당 1:1 응대 비효율. **+ Pivot 이후**: 강제 투어로는 학습 효과 부족 → 컨텍스트 호출 가능한 셀프서비스 필요 |
| **WHO** | (Plan 유지) 1) 전 직원 (Phase 1, 완료) → 2) 인사담당 (Phase 2, 미실시) → 3) 임원 (Phase 3, 미실시) |
| **RISK** | (갱신) ① Article·Chapter `relatedRoutes`/`startRoute` 가 실제 라우트 변경 시 stale ② `[data-tour="..."]` selector 가 컴포넌트 리팩토링 시 깨짐 ③ Article 검색은 client-side full-scan — 50건 초과 시 가벼운 인덱싱 필요 ④ Article 본문이 코드 상수(`articles.ts`)에 있어 비개발자가 수정 불가 |
| **SUCCESS** | (갱신) (S1) Help Center `/manual` 진입 가능 (S2) 우하단 `?` 버튼 전 화면(매뉴얼/로그인 제외) 노출 (S3) Article 검색 + 카테고리 필터 동작 (S4) `/manual/article/:id` 라우트 동작 + 관련 투어 추천 (S5) 7 챕터 Tour 정상 동작 + Esc/←→ 글로벌 키 (S6) 모바일 반응형 |
| **SCOPE** | (갱신) **완료**: Phase 1 (직원 7 챕터 + 14 article + Floating Help). **미실시**: Phase 2/3 챕터 확대, Article 추가 작성, 통계 대시보드, AI 챗봇, 영상 콘텐츠, Article CMS화 |

---

## 1. Overview

### 1.1 Design Goals

1. **셀프서비스 우선** — 사용자가 인사담당에 묻기 전 스스로 해결 가능
2. **컨텍스트 인지** — "지금 이 화면에서 막혔어요" 에 즉시 응답
3. **선택형 학습 경로** — 글 읽기 / 시연 받기 / 검색 중 사용자가 고름 (강제 X)
4. **개발 운영 부담 최소** — 외부 라이브러리 0, Tailwind + 자체 컴포넌트 만으로 구축

### 1.2 Design Principles

- **No External Tour Lib** (Plan §3.1 유지) — 의존성 0, 코드 패턴 통제권 확보
- **Data-Driven** — Chapter / Article 은 상수 모듈 (`chapters.ts` / `articles.ts`) 단일 진입점
- **Global Overlay** — Tour 는 `Provider + Single Mount` 패턴으로 라우트 전환에 강건
- **Selector Stability** — `[data-tour="..."]` 명시적 anchor (class/id 의존 회피)
- **Tier 분리** — Help Center(KB) / Floating Help(컨텍스트) / Tour(시연) 세 진입로가 독립적으로 동작하면서 서로를 cross-link

---

## 2. Architecture Options (Retrospective Comparison)

> 코드는 이미 작성됨. 본 섹션은 회고적 비교 — 왜 현 구조가 채택됐는가를 기록.

### 2.0 Architecture Comparison

| Criteria | Option A: Tour-only (Plan 5/26) | Option B: 3-Tier (현재 채택) | Option C: External SaaS 도입 |
|----------|:-:|:-:|:-:|
| **Approach** | TourOverlay + 챕터 강제 흐름 | Help Center + Floating Help + Optional Tour | Arcade/Pendo 등 SaaS 임베드 |
| **New Files** | ~7 (Plan 명시) | **14 + (FloatingHelp/Article 라우트/Article 데이터/ArticleContent renderer 추가)** | ~2 (스크립트 임베드) |
| **Modified Files** | App.tsx / Sidebar.tsx | App.tsx / Sidebar.tsx / dashboard.tsx | App.tsx |
| **Complexity** | Low | Medium | Low |
| **Maintainability** | Low (콘텐츠 변경 = 코드 변경) | Medium (Article 추가 = 상수 파일 수정) | Low — 외부 도구 종속 |
| **Effort** | Low | Medium | Low |
| **Risk** | High (UX 안티패턴) | Low | High (보안/개인정보 + 종속) |
| **외부 리서치 정합성** | Anti-pattern | **Best Practice** | 제3자 의존 (HR 데이터 외부 노출 우려) |
| **Recommendation** | Quick wins 한정 | **선택됨 — 장기 표준** | 본 프로젝트엔 부적합 |

**Selected**: **Option B (3-Tier)** — **Rationale**: 5/27 외부 리서치 결과 강제 투어가 anti-pattern으로 분류됐고, HR 플랫폼 특성상 사내 데이터를 외부 SaaS에 노출할 수 없음. 자체 구축 비용 증가는 14 article 만 작성하면 되는 수준으로 수용 가능.

### 2.1 Component Diagram (3-Tier)

```
┌─────────────────────────────────────────────────────────────────────┐
│  DashboardLayout (모든 인증 페이지의 컨테이너)                          │
│                                                                     │
│   ┌────────────────┐  ┌────────────────────┐  ┌──────────────────┐ │
│   │  Sidebar       │  │  Page Content      │  │  FloatingHelp ?  │ │
│   │  · /manual link│  │  (각 라우트)        │  │  (fixed 우하단)   │ │
│   └────────────────┘  └────────────────────┘  └──────────────────┘ │
│                                                                     │
│   ┌────────────────────── GlobalTourOverlay ───────────────────┐    │
│   │  (TourContext.active === true 일 때만 렌더)                  │    │
│   │   ─ spotlight + tooltip                                    │    │
│   └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
        ▲                       ▲                       ▲
        │ Tier 1                │ Tier 2                │ Tier 3
        │ /manual               │ ?  Floating          │ /manual/tour/:id
        │ Help Center           │ Slide panel           │ TourContext.start()
        │ (검색 + 카테고리)        │ (컨텍스트 추천)         │ (선택형 시연)
```

### 2.2 Data Flow

```
[User on any page]
   │
   ├─ "검색·체계적으로 찾기" → /manual Help Center
   │                          → searchArticles(query) / getAllCategories()
   │                          → ArticleRow 클릭 → /manual/article/:id
   │
   ├─ "지금 이 화면 도움 필요" → 우하단 ? 클릭
   │                            → FloatingHelpButton slide panel
   │                            → getArticlesForRoute(pathname) — 컨텍스트 추천
   │                            → searchArticles(query) — 검색
   │
   └─ "직접 시연 받고 싶음" → /manual/tour/:chapterId
                              → ManualTour 컴포넌트가 TourContext.start(chapter) 호출
                              → GlobalTourOverlay 렌더 (DashboardLayout 내 글로벌 마운트)
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `routes/manual/index.tsx` (Help Center) | `articles.ts`, `chapters.ts`, `ui/Card`, `ui/Badge` | 검색·카테고리 필터·체험투어 섹션 |
| `routes/manual/article.tsx` | `articles.ts`, `chapters.ts`, `ArticleContent` | Article 상세 + 관련 투어 cross-link |
| `routes/manual/tour.tsx` | `TourContext`, `chapters.ts` | Tour 진입 트리거 (redirect) |
| `components/manual/FloatingHelpButton.tsx` | `articles.ts`, `ui/Badge`, `ui/Button`, `useLocation` | 어디서든 컨텍스트 호출 |
| `components/manual/GlobalTourOverlay.tsx` | `TourContext`, `TourOverlay`, `ui/Toast` | DashboardLayout 내 1회 마운트 |
| `components/manual/TourOverlay.tsx` | `ui/Button`, `lucide-react` | spotlight + tooltip 렌더 |
| `components/manual/ArticleContent.tsx` | (없음 — 자체 마크다운 파서) | Article 본문 렌더 |
| `contexts/TourContext.tsx` | `react-router-dom (useNavigate)`, `types/manual` | 활성 챕터/step 글로벌 상태 |
| `hooks/useTour.ts` (legacy) | `react-router-dom` | (deprecated — Context 글로벌화로 대체. 코드는 남아있으나 라우트에서 미사용) |

---

## 3. Data Model

### 3.1 Entity Definition

#### 3.1.1 `TourStep` / `ManualChapter` (Plan §3.3 + 일부 확장)

```ts
// src/types/manual.ts
export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'
export type TourStepAction = 'observe' | 'click' | 'fill' | 'navigate'

export interface TourStep {
  id: string
  title: string
  description: string
  target?: string         // CSS selector — '[data-tour="..."]' 권장
  route?: string          // step 시작 시 navigate
  placement?: TourPlacement
  action?: TourStepAction
  hint?: string           // ← Plan 에 없던 보조 힌트 필드
}

export type ManualCategory = 'employee' | 'hr-admin' | 'executive'

export interface ManualChapter {
  id: string
  category: ManualCategory
  title: string
  description: string
  icon: string            // lucide-react icon name
  estimatedMinutes: number
  startRoute: string      // ← Plan에서는 '챕터 진입 시 navigate' 만 언급, 명시 필드는 신설
  steps: TourStep[]
}
```

#### 3.1.2 `HelpArticle` (Plan에 없던 신규 도메인 — Help Center 모델의 핵심)

```ts
// src/lib/manual/articles.ts
export type ArticleCategory =
  | '시작하기' | '근태/연차' | '결재' | '평가' | '프로젝트' | '메뉴 안내' | 'FAQ'

export interface HelpArticle {
  id: string                       // 슬러그
  category: ArticleCategory
  title: string                    // 짧고 명확한 질문형 권장
  keywords: string[]               // 검색용 (소문자/공백 무관 매칭)
  relatedRoutes: string[]          // 컨텍스트 매칭 — 이 article 이 유용한 라우트 prefix
  content: string                  // 자체 마크다운 (## h, **bold**, · list, > quote, `code`)
  relatedTourId?: string           // chapters.ts 의 챕터 ID — cross-link
  relatedArticleIds?: string[]
  featured?: boolean               // Help Center 상단 추천 노출
}
```

### 3.2 Entity Relationships

```
[ArticleCategory] 1 ── N [HelpArticle]
                            │
                            ├── N [relatedRoute (string)]   // 컨텍스트 매칭
                            ├── 0..1 [ManualChapter]        // relatedTourId
                            └── N [HelpArticle]              // relatedArticleIds (self-ref)

[ManualCategory] 1 ── N [ManualChapter] 1 ── N [TourStep]
                                              │
                                              └── 0..1 [target selector → DOM]
```

### 3.3 Database Schema

**해당 없음** — 본 기능은 DB를 사용하지 않는다. CLAUDE.md 절대 규칙 준수: 기존 테이블 ALTER 없음, employees/evaluations/users 등 무영향.

---

## 4. API Specification

**해당 없음 (No backend API).** 본 기능은 100% client-side. 모든 데이터는 번들에 포함된 정적 상수.

### 4.1 클라이언트 사이드 "API 유사" 함수 (articles.ts / chapters.ts)

| 함수 | 위치 | 역할 |
|---|---|---|
| `searchArticles(query)` | `lib/manual/articles.ts` | title / keywords / content 부분 일치 검색 |
| `getArticlesForRoute(pathname)` | 동 | `relatedRoutes` prefix 매칭 → 컨텍스트 추천 |
| `getArticleById(id)` | 동 | 상세 페이지 진입 |
| `getAllCategories()` | 동 | 카테고리 필터 chip 생성 |
| `getChaptersByCategory(cat)` | `lib/manual/chapters.ts` | 권한별 챕터 분류 |
| `getChapterById(id)` | 동 | Tour 진입 시 챕터 lookup |

---

## 5. UI/UX Design

(상세 ASCII layout은 `./interactive-manual.analysis.md` §3 Page UI Checklist 항목별 검증과 함께 참조 — 본 archive 사본에서는 핵심 컴포넌트 표만 보존)

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `ManualHub` | `src/routes/manual/index.tsx` (273 LOC) | Help Center 페이지 — 검색·카테고리·추천·체험투어 섹션 |
| `ManualArticle` | `src/routes/manual/article.tsx` | Article 상세 + 관련 투어 추천 + 관련 글 |
| `ManualTour` | `src/routes/manual/tour.tsx` | Tour 진입 트리거 — `TourContext.start()` 호출 후 즉시 startRoute로 redirect |
| `FloatingHelpButton` | `src/components/manual/FloatingHelpButton.tsx` (218 LOC) | 우하단 ? + 슬라이드 패널 (컨텍스트 + 검색) |
| `GlobalTourOverlay` | `src/components/manual/GlobalTourOverlay.tsx` | DashboardLayout 내 1회 마운트, Context active 일 때만 렌더 |
| `TourOverlay` | `src/components/manual/TourOverlay.tsx` | spotlight + tooltip 렌더 — placement 계산, scrollIntoView, resize/scroll 갱신 |
| `ArticleContent` | `src/components/manual/ArticleContent.tsx` (151 LOC) | 자체 마크다운 파서 (DOMPurify 불필요 — 상수 데이터) |
| `ChapterCard` | `src/components/manual/ChapterCard.tsx` | (legacy — ManualHub가 인라인 카드 사용. Phase 3 Gap G2 — dead code) |
| `TourProvider` | `src/contexts/TourContext.tsx` | `start/next/prev/finish` + 글로벌 Esc/←→ 키 |
| `useTour` | `src/hooks/useTour.ts` | (legacy — Phase 3 Gap G1 — dead code) |

### 5.4 Page UI Checklist

5 화면(Help Center / Article / Tour / FloatingHelp / GlobalTourOverlay) 총 33개 체크리스트 — Phase 3 Analysis §3 에서 **33/33 모두 ✅ 통과** 확인.

---

## 6. Error Handling

| Code/Case | 원인 | 처리 |
|---|---|---|
| `ARTICLE_NOT_FOUND` | `getArticleById(id) === null` | "도움말을 찾을 수 없습니다." + "도움말 센터로" 버튼 |
| `CHAPTER_NOT_FOUND` | `getChapterById(id) === null` | "해당 챕터를 찾을 수 없습니다." + 매뉴얼 허브 링크 |
| `TARGET_SELECTOR_MISS` | Tour step.target 의 `querySelector` 결과 null | `rect = null` → 화면 중앙 모달 fallback (Tour 중단 X) |
| `SPA_ROUTE_RACE` | startRoute / step.route navigate 후 target 요소가 늦게 mount | 500ms interval polling + `requestAnimationFrame` 으로 start 지연 |
| `KEY_EVENT_IN_INPUT` | Tour 중 사용자가 input/textarea 에 타이핑 → ←→ 키로 step 변경되는 사고 | input/textarea/contentEditable 에서 Esc 제외 모든 키 무시 |
| `OVERLAY_ROUTE_UNMOUNT` | Tour 라우트(`tour.tsx`)에 Overlay를 두면 navigate 시 unmount | **Context 글로벌화 + DashboardLayout 1회 마운트** 로 해결 (커밋 `0ff0f4d` / `1da92db`) |

---

## 7. Security Considerations

- [x] **XSS 방지**: `ArticleContent` 마크다운 파서는 React 노드를 직접 생성 — `dangerouslySetInnerHTML` 미사용 → 인젝션 불가
- [x] **외부 데이터 입력 없음**: Article / Chapter 본문은 모두 빌드타임 상수
- [x] **민감 정보 비노출**: 본 기능은 직원 권한 영역의 일반 UI 가이드 — 평가 점수/급여 같은 민감 정보를 다루지 않음
- [x] **외부 SaaS 미연동**: 사내 데이터가 제3자로 전송되지 않음
- [x] **권한 검사**: `/manual/*` 라우트는 DashboardLayout 하위 — 인증된 사용자만 접근

---

## 8. Test Plan

> **본 사이클 한정**: 코드 후행 사후 정리 — Do 단계는 이미 완료. Test 코드 신규 작성 안 함. Phase 3 Gap Analysis 가 정적 확인 수행.

| Type | Target | 본 사이클 처리 |
|------|--------|---------------|
| L1: API Tests | 해당 없음 (No backend API) | N/A |
| L2: UI Action Tests | 페이지 요소 12 시나리오 | **Gap Analysis 정적 확인** (Analysis §3) |
| L3: E2E Scenario Tests | 5 시나리오 | **수동 검증 권고** (또는 후속 사이클에서 작성) |

---

## 9. Clean Architecture

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **Presentation** | Help Center 페이지 / Article 상세 / Tour 라우트 / Floating ? / Overlay | `src/routes/manual/*`, `src/components/manual/*` |
| **Application** | Tour 상태 (활성 챕터·step·전환·키보드) | `src/contexts/TourContext.tsx` |
| **Domain** | Article / Chapter / Step 타입 정의 | `src/types/manual.ts` |
| **Infrastructure** | Article·Chapter 데이터 + 검색·매칭 유틸 | `src/lib/manual/articles.ts`, `src/lib/manual/chapters.ts` |

위반 0건. Domain (`types/manual.ts`) 은 외부 의존성 0.

---

## 10. Coding Convention

| Item | Convention Applied |
|------|-------------------|
| 컴포넌트 명명 | PascalCase (CLAUDE.md 일치) |
| 파일 위치 | 라우트는 `routes/manual/*`, 컴포넌트는 `components/manual/*`, 도메인은 `types/`, 데이터는 `lib/manual/*` |
| 상태 관리 | Tour 는 React Context, Help Center / Floating Help 는 로컬 `useState` + `useMemo` |
| 에러 처리 | 한국어 fallback + 매뉴얼 허브 링크 (CLAUDE.md 절대 규칙 준수) |
| 색상 | brand-600 / emerald-600 / amber-50/600 (tailwind.config 토큰 재사용) |
| 마크다운 | 자체 파서 (의존성 0), `dangerouslySetInnerHTML` 미사용 |
| 모바일 | Tailwind responsive prefix (md:, sm:) (절대 규칙 준수) |
| Anchor selector | `[data-tour="..."]` 명시적 부여 |

---

## 11. Implementation Guide

### 11.1 File Structure (현재)

```
src/
├── types/manual.ts                            # TourStep / ManualChapter / HelpArticle 의 1차 타입
├── lib/manual/
│   ├── articles.ts                            # HELP_ARTICLES (14건) + 검색/매칭 유틸 (G3 픽스 적용)
│   └── chapters.ts                            # EMPLOYEE_CHAPTERS (7건) + getChapter* 유틸
├── contexts/TourContext.tsx                   # TourProvider — 글로벌 활성/step/키보드
├── hooks/useTour.ts                           # (legacy / G1 dead code)
├── components/manual/
│   ├── ArticleContent.tsx                     # 자체 마크다운 렌더
│   ├── ChapterCard.tsx                        # (legacy / G2 dead code)
│   ├── FloatingHelpButton.tsx                 # 우하단 ? + 슬라이드 패널
│   ├── GlobalTourOverlay.tsx                  # DashboardLayout 내 1회 마운트
│   └── TourOverlay.tsx                        # spotlight + tooltip
└── routes/manual/
    ├── index.tsx                              # /manual Help Center
    ├── article.tsx                            # /manual/article/:articleId
    └── tour.tsx                               # /manual/tour/:chapterId (trigger)
```

### 11.2 Implementation Order (회고)

1. [x] 데이터 모델 정의 (`types/manual.ts`)
2. [x] Chapter 데이터 + 6 챕터 (5/26)
3. [x] TourOverlay + useTour (5/26)
4. [x] /manual 허브 + tour 라우트 (5/26)
5. [x] TourContext 글로벌화 (회귀 수정, 5/26)
6. [x] 챕터 spotlight 안정화 + 프로젝트&업무 챕터 추가 (5/27)
7. [x] tooltip clamp + 사이드바 자동 펼침 (5/27)
8. [x] **Help Center 모델 전환** — Article 도메인 + 검색 + FloatingHelp + Article 상세 라우트 (5/27, `a684b05`)
9. [x] **G3 데이터 무결성 픽스** — articles.ts 깨진 참조 제거 (5/27, `3f27130`)

### 11.3 Session Guide (향후 사이클 기준)

| Module | Scope Key | Description | Estimated Turns |
|--------|-----------|-------------|:---------------:|
| Article 확대 | `module-articles` | hr-admin/executive 카테고리 article 추가 + 검색 인덱싱 개선 | 20-30 |
| Phase 2 챕터 | `module-hr-admin-chapters` | 경영지원 6 챕터 + 권한 필터 | 30-40 |
| Phase 3 챕터 | `module-executive-chapters` | 임원 5 챕터 + 권한 가드 | 25-35 |
| 사용 통계 | `module-analytics` | view_log / tour_complete_log DB 추가 + 대시보드 | 40-50 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-27 | 초안 — 코드 후행 사후 역공학 Design. Plan(5/26) deviation 명시 + 3-Tier 아키텍처 + 14 article / 7 chapter 데이터 모델 정리 | 대표 + CTO Lead |
| 0.2 (archived) | 2026-05-27 | Archive 사본 — G3 픽스(`3f27130`) 흐름 표시 및 dead code 표기 추가 | CTO Lead |

---

> **📦 ARCHIVED 2026-05-27** — PDCA 사이클 #1 종료. 본 디렉토리(`docs/archive/2026-05/interactive-manual/`) 의 4개 문서가 사이클 전체의 traceable record. 후속 작업은 `interactive-manual.report.md` §8.2 향후 권고 참조.
