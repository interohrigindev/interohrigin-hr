# interactive-manual Completion Report

> **Status**: **Complete** ✅ (Phase 1 — 직원 기본 7 챕터 + 14 article + 3-Tier Help Center)
>
> **Project**: io-hr-platform
> **Version**: post-`3f27130`
> **Author**: 대표 + CTO Lead
> **Completion Date**: 2026-05-27
> **PDCA Cycle**: #1 (코드 후행 사후 정리 사이클 — 옵션 A "Historical Record 보존")
> **Status**: Archived

---

## Executive Summary

### 1.1 Project Overview

| Item | Content |
|------|---------|
| Feature | interactive-manual (HR 플랫폼 3-Tier 도움말 시스템) |
| Start Date | 2026-05-26 (Plan 작성) |
| Code Complete | 2026-05-27 (커밋 `a684b05`) |
| PDCA 정리 완료 | 2026-05-27 (본 Report) |
| Archive 완료 | 2026-05-27 |
| Duration | 2일 (코드) + 0.5일 (사후 PDCA 정리) |

### 1.2 Results Summary

```
┌─────────────────────────────────────────────────────────┐
│  Match Rate (Phase 3 Gap Analysis):   97.4%             │
├─────────────────────────────────────────────────────────┤
│  Plan Success Criteria:  6 / 6 Met (SC-01 초과달성)      │
│  Design SUCCESS Criteria (S1~S6): 6 / 6 Met             │
│  Critical Gap:  0건                                     │
│  Important Gap: 0건                                     │
│  Minor Gap:     초기 4건 → G3 본 사이클 픽스 → 잔여 3건      │
│  Deviation from Plan: 10건 (8 Positive/Neutral, 2 Drift) │
│  CLAUDE.md 절대 규칙 위반: 0건                            │
│  데이터 무결성 픽스: 1건 (G3, 커밋 3f27130, 빌드 통과·푸시 완료) │
└─────────────────────────────────────────────────────────┘
```

### 1.3 Value Delivered

| Perspective | Content |
|-------------|---------|
| **Problem** | 신규/기존 임직원이 HR 플랫폼 메뉴 사용법을 몰라 인사담당에게 반복 문의 → 별도 교육 시간 부담 + 셀프서비스 불가 |
| **Solution** | **3-Tier 도움말 시스템** — ① 검색형 Help Center 페이지(`/manual`, 14 article + 7 카테고리) ② 우하단 컨텍스트 호출형 Floating `?` 버튼 ③ 선택형 체험 투어(7 챕터). 의존성 0 자체 구축. **+ 본 PDCA 사이클에서 데이터 무결성 픽스 1건 포함** (`articles.ts` 깨진 참조 제거, 커밋 `3f27130`) |
| **Function/UX Effect** | • Help Center 진입로 3개(검색·컨텍스트·시연)로 학습 경로 사용자 선택권 부여 (강제 X) <br>• `data-tour="..."` 11개 anchor + 라우트 14건 cross-reference 100% 정합 <br>• Plan 6 챕터 → 7 챕터 (프로젝트&업무 추가, 메신저 정책 제외) <br>• 외부 SaaS 의존성 0 — 사내 HR 데이터 제3자 노출 없음 <br>• 글로벌 키보드 (Esc/←→) + 모바일 반응형 + Tour 라우트 전환 회귀 해결 |
| **Core Value** | **자기주도 학습 + 인사담당 응대 부담 경감 + 셀프서비스 셀프오너십**. 강제 투어(Plan 5/26 모델) → 사용자 선택형 3-Tier(코드 5/27 모델) 로의 architecture-level pivot 을 외부 리서치(Arcade/UXCam/Userpilot/ServiceNow — "static tour 안티패턴, contextual -28% 이탈, Help Center -25% 티켓") 근거와 함께 의사결정 traceability 보존하며 검증 완료 |

---

## 1.4 Success Criteria Final Status

### Plan Success Criteria (SC-01 ~ SC-06)

| # | Criteria | Status | Evidence |
|---|---|:---:|---|
| **SC-01** | Phase 1 직원 기본 6 챕터 완성 | ✅ **Met (초과달성)** | `chapters.ts` `EMPLOYEE_CHAPTERS` 7건 (Plan §4 의 메신저 챕터는 메뉴 정책상 제외, 프로젝트&업무 1건 추가 — `chapters.ts:331` 코멘트). Analysis §6 |
| **SC-02** | 사이드바에 "매뉴얼" 메뉴 노출 (전 직원) | ✅ **Met** | `Sidebar.tsx:125 to: '/manual'`, 권한 조건 없음. Analysis §6 |
| **SC-03** | Tour 시작 → 단계 진행 → 완료 동작 (spotlight + tooltip) | ✅ **Met (강화)** | `TourContext.tsx:62-78` (start/next), `GlobalTourOverlay` 글로벌 마운트로 라우트 전환 회귀 해결. Analysis §3.5 (7/7 체크) |
| **SC-04** | Tour 데이터 코드 변경 영향 최소 — `lib/manual/chapters.ts` 단일 진입 | ✅ **Met** | chapters.ts 단일 데이터 모듈, `[data-tour="..."]` selector anchor 패턴. Analysis §4.1 (11/11 selector 유효) |
| **SC-05** | 모바일 반응형 (iPhone 14 Pro tooltip 정상) | ✅ **Met** | TourOverlay placement 자동 보정(커밋 `1da92db`), FloatingHelpButton 모바일 위치(`bottom-24 right-6`), Help Center responsive grid. Analysis §6 |
| **SC-06** | "혼자 따라하면 이해되는" 한국어 톤 + 다음/이전 명확 | ✅ **Met** | 모든 챕터·article 한국어 100%, `dashboard-overview` 첫 step "환영합니다 👋" + 키보드 안내 명시. Analysis §6 |

### Design SUCCESS (Help Center 모델 갱신 — S1 ~ S6)

| # | Criteria | Status | Evidence |
|---|---|:---:|---|
| S1 | Help Center `/manual` 진입 가능 | ✅ Met | `App.tsx:251` 라우트, `ManualHub` 273 LOC. Analysis §3.1 (7/7 체크) |
| S2 | 우하단 ? 전 화면 노출 (매뉴얼/로그인 제외) | ✅ Met | `FloatingHelpButton` + `dashboard.tsx:33` 마운트, hideOnPaths 처리. Analysis §3.4 (10/10 체크) |
| S3 | Article 검색 + 카테고리 필터 동작 | ✅ Met | `searchArticles()`, `getAllCategories()`, ManualHub `line 23-30`. Analysis §3.1 |
| S4 | `/manual/article/:id` + 관련 투어 추천 | ✅ Met | `article.tsx:29` (`getChapterById(relatedTourId)`), `line 58-77` 추천 카드. Analysis §3.2 (6/6 체크) |
| S5 | 7 챕터 Tour + Esc/←→ 글로벌 키 | ✅ Met | `EMPLOYEE_CHAPTERS` 7건, `TourContext.tsx:86-101` 키 핸들러 (input 보호 포함). Analysis §3.5 |
| S6 | 모바일 반응형 | ✅ Met | Tailwind responsive 전체 적용 |

**Success Rate**: **12/12 Met (100%)** — Plan 6/6 + Design 6/6

---

## 1.5 Decision Record Summary

> **PRD 없음** (본 기능은 Plan 부터 시작). 의사결정 체인 = Plan → Design → Code.

| Source | Decision | Followed? | Outcome |
|--------|---------|:---------:|---|
| [Plan §3.1] | 외부 Tour 라이브러리(react-joyride/shepherd.js) 미사용, 자체 구축 | ✅ | package.json 신규 의존성 0건. 의존성 그래프 그대로 유지, 커스터마이징 자유도 확보 |
| [Plan §3.3] | `TourStep` + `ManualChapter` 단일 데이터 모듈(`chapters.ts`) | ✅ | chapters.ts 가 단일 진입점으로 유지, 7 챕터 모두 `getChapterById` 경유 |
| [Plan §8] | `data-tour="..."` 명시 anchor (class/id 의존 회피) | ✅ | 11개 selector 모두 `data-tour` 형식 (Sidebar 4 + Header 4 + 동적 `nav:<path>`) |
| [Plan §1.2] | 영상/통계/AI 챗봇 out-of-scope | ✅ | 코드에 미포함, 본 Report §8.2 "향후 사이클" 등재 |
| **[Design Pivot, a684b05]** | **Help Center 3-Tier 모델로 supersede** (Plan 강제투어 only → Help Center + Floating + Tour) | ✅ | 외부 리서치 근거 명시 (Arcade/UXCam/Userpilot/ServiceNow — static tour 안티패턴, contextual -28% 이탈, Help Center -25% 티켓). Design "Deviation from Plan" 섹션 + 본 Report §1.5 에 등재. 신규 도메인 `HelpArticle` 14건 + Floating 218 LOC + Article 라우트 추가 |
| [Design §1.2] | Tour Overlay 글로벌화 (`GlobalTourOverlay` DashboardLayout 1회 마운트) | ✅ | 라우트 전환 시 unmount 회귀 해결 (커밋 `0ff0f4d`, `1da92db`). 본 사이클 채택 결정의 정당성 검증됨 |
| [Design §3.3] | DB 변경 0 (client-side 정적 상수만 사용) — CLAUDE.md 절대 규칙 준수 | ✅ | Supabase 호출 0건, employees/evaluations 등 기존 테이블 ALTER 0건 |
| [Design §7] | XSS 안전 마크다운 (자체 파서, `dangerouslySetInnerHTML` 미사용) | ✅ | `ArticleContent.tsx` 가 React 노드 직접 생성, DOMPurify 불필요 |
| [Phase 3 Gap §G3 → Phase 4] | **`articles.ts` 깨진 참조 `approval-resubmit` 제거** (옵션 B 픽스) | ✅ | 커밋 `3f27130 fix(manual): articles.ts 깨진 article 참조 제거`. `tsc -b && vite build` 9.36s 통과, push 완료, grep 사후검증 0건 |

**Decision Record 위반: 0건** (모든 의사결정이 코드에 반영됨)

---

## 2. Related Documents (Archive)

| Phase | Document | Status |
|-------|---------|--------|
| Plan (5/26) | [interactive-manual.plan.md](./interactive-manual.plan.md) | ✅ Archived (historical — 옵션 A 보존) |
| Design (5/27, reverse-engineered) | [interactive-manual.design.md](./interactive-manual.design.md) | ✅ Archived (Deviation from Plan 명시) |
| Analysis (5/27, Phase 3) | [interactive-manual.analysis.md](./interactive-manual.analysis.md) | ✅ Archived (Match Rate 97.4%) |
| Report (5/27, Phase 4) | 현재 문서 | ✅ Archived |

---

## 3. Completed Items

### 3.1 Functional Requirements

| ID | Requirement | Status | Notes |
|----|---|---|---|
| FR-01 | 전 직원 접근 `/manual` 전용 링크 | ✅ Complete | App.tsx:251, Sidebar 메뉴 노출 |
| FR-02 | 실제 시연 + 단계별 spotlight + tooltip | ✅ Complete | TourOverlay + GlobalTourOverlay 글로벌 마운트 |
| FR-03 | 권한 단계별 챕터 구조 (employee/hr-admin/executive) | ✅ Complete (Phase 1 employee 만 데이터 존재) | `ManualCategory` 타입 정의, hr-admin/executive 카테고리는 챕터 데이터만 추가하면 됨 |
| FR-04 | 인터랙티브 — 이벤트/클릭/hover/조작 | ✅ Complete | TourStep `action` 필드 정의, navigate route, target spotlight |
| FR-05 | 자기 해결 가능 (모르는 기능 즉시 매뉴얼 확인) | ✅ Complete (강화) | **Plan 명시 1개 진입로 → 코드 3개 진입로 (Help Center 검색 + Floating ? 컨텍스트 + 체험투어)** |
| FR-06 | (Plan 외 Added) Help Center Knowledge Base | ✅ Complete | `articles.ts` 14건, 7 카테고리, 검색·컨텍스트 매칭 |
| FR-07 | (Plan 외 Added) Floating Help Button | ✅ Complete | 218 LOC, hideOnPaths 처리, 컨텍스트+검색 |
| FR-08 | (Plan 외 Added) Article 상세 라우트 + cross-link 투어 추천 | ✅ Complete | `/manual/article/:articleId`, `ArticleContent` 자체 마크다운 |

### 3.2 Non-Functional Requirements

| Item | Target | Achieved | Status |
|------|---|---|:---:|
| 빌드 통과 | `tsc -b && vite build` | 9.36s 통과 (G3 픽스 post) | ✅ |
| 한국어 UI | 100% | 100% | ✅ |
| 모바일 반응형 | iPhone 14 Pro tooltip 정상 | placement 자동 보정 + clamp 적용 | ✅ |
| DB 변경 | 0 (CLAUDE.md 절대 규칙) | 0 (Supabase 호출 0건) | ✅ |
| 외부 의존성 | 0 신규 | 0 (package.json 무변경) | ✅ |
| XSS 안전 | 0 `dangerouslySetInnerHTML` | 0 (React 노드 직접 생성) | ✅ |
| 사내 데이터 외부 노출 | 0 (HR 특성) | 0 (외부 SaaS 미연동) | ✅ |
| 데이터 무결성 (cross-ref) | route/selector/tour-id 100% | 100% (selector 11/11, route 14/14, tour-id 5/5). G3 픽스 후 article-id 10/10 → 8/8 | ✅ |

### 3.3 Deliverables (코드 + 문서)

| Deliverable | Location | Status |
|-------------|---|---|
| 타입 정의 | `src/types/manual.ts` | ✅ |
| Article 데이터 + 검색 유틸 | `src/lib/manual/articles.ts` (465 LOC, 14건) | ✅ (G3 픽스 적용) |
| Chapter 데이터 + 유틸 | `src/lib/manual/chapters.ts` (7 챕터) | ✅ |
| Tour Provider | `src/contexts/TourContext.tsx` | ✅ |
| Tour Overlay (글로벌) | `src/components/manual/GlobalTourOverlay.tsx` | ✅ |
| Tour Overlay (spotlight/tooltip) | `src/components/manual/TourOverlay.tsx` | ✅ |
| Floating Help | `src/components/manual/FloatingHelpButton.tsx` (218 LOC) | ✅ |
| Article 마크다운 렌더 | `src/components/manual/ArticleContent.tsx` (151 LOC) | ✅ |
| Help Center 라우트 | `src/routes/manual/index.tsx` (273 LOC) | ✅ |
| Article 상세 라우트 | `src/routes/manual/article.tsx` | ✅ |
| Tour 진입 트리거 | `src/routes/manual/tour.tsx` | ✅ |
| App.tsx 라우트 등록 + TourProvider wrap | `src/App.tsx:155, 251-253` | ✅ |
| DashboardLayout 마운트 | `src/routes/dashboard.tsx:30, 33` | ✅ |
| Sidebar 메뉴 + data-tour | `src/components/layout/Sidebar.tsx:125, 514, 705` | ✅ |
| Plan 문서 (archived) | `docs/archive/2026-05/interactive-manual/interactive-manual.plan.md` | ✅ |
| Design 문서 (Deviation 명시, archived) | `docs/archive/2026-05/interactive-manual/interactive-manual.design.md` | ✅ |
| Analysis 문서 (97.4%, archived) | `docs/archive/2026-05/interactive-manual/interactive-manual.analysis.md` | ✅ |
| Report 문서 (현재, archived) | `docs/archive/2026-05/interactive-manual/interactive-manual.report.md` | ✅ |

---

## 4. Incomplete Items

### 4.1 Carried Over to Next Cycle

| Item | Reason | Priority | Estimated Effort |
|------|---|---|---|
| Phase 2 — 경영지원 6 챕터 + hr-admin article 작성 | Plan §1.2 out-of-scope | High | 2-3일 |
| Phase 3 — 임원 5 챕터 + executive article + 권한 가드 | Plan §1.2 out-of-scope | Medium | 2일 |
| Phase 4 — 사용 통계 대시보드 (`manual_view_log`, `tour_complete_log`) | Plan §1.2 out-of-scope | Medium | 3-4일 |
| G1 — `src/hooks/useTour.ts` dead code 제거 | Phase 3 분석에서만 분류, 별도 청소 PR 합의 | Low | 5분 |
| G2 — `src/components/manual/ChapterCard.tsx` dead code 제거 | 동상 | Low | 5분 |
| G4 — `TourOverlay.tsx:59` `setInterval` 500ms polling → `MutationObserver`/`ResizeObserver` 개선 | 회귀 위험 0, 성능 best practice | Low | 1-2시간 |
| O1 — Article 본문 CMS 화 (비개발자 편집 가능) | Design RISK + 합의 사항으로 향후 권고 등재 | Medium | 5-7일 |
| O3 — hr-admin / executive 카테고리 article 별도 작성 | 현재 14건 모두 employee 권한 콘텐츠 | (Phase 2/3 와 함께) | Phase 2/3 effort에 포함 |
| AI 챗봇 도움말 (Plan §1.2 Phase 5) | 향후 사이클 | Low | 1-2주 |
| 영상 매뉴얼 | 향후 사이클 | Low | (별도 의사결정 필요) |

### 4.2 Cancelled/On Hold Items

| Item | Reason | Alternative |
|------|---|---|
| `routes/manual/employee.tsx` (Plan §5 명시) | Help Center 단일 페이지가 카테고리·검색·체험투어 섹션 모두 포함 → 통합 | `/manual` 단일 라우트 (코드) |
| 메신저 챕터 (Plan §4 #6) | 메신저 메뉴가 정책상 숨김 처리됨 | chapters.ts:331 코멘트 명시, 향후 메신저 메뉴 활성화 시 재추가 가능 |

---

## 5. Quality Metrics

### 5.1 Final Analysis Results

| Metric | Target | Final | 비고 |
|--------|---|---|---|
| Design Match Rate | ≥ 90% | **97.4%** | Structural 100 + Functional 100 + Contract 95.7 - Drift 0.87 |
| Plan SC 충족 | 100% | **6/6 (100%)** | SC-01 초과달성 |
| Design SUCCESS (S1~S6) 충족 | 100% | **6/6 (100%)** | Help Center 모델 갱신 기준 |
| Critical Gap | 0 | **0** | ✅ |
| Important Gap | 0 | **0** | ✅ |
| Minor Gap (사이클 시작) | — | 4건 (G1~G4) | — |
| Minor Gap (사이클 종료) | — | **3건** (G1, G2, G4 — 향후 권고 등재) | G3 본 사이클 픽스 |
| Decision Record 위반 | 0 | **0** | ✅ |
| CLAUDE.md 절대 규칙 위반 | 0 | **0** | DB ALTER 0, 한국어 100%, 모바일, 민감정보 무관 |
| Route sanity (link 깨짐) | 0 | **0** (14/14 valid) | ✅ |
| Selector cross-ref (data-tour) | 100% | **100%** (11/11) | ✅ |
| Tour cross-link 무결성 | 100% | **100%** (5/5) | ✅ |
| Article cross-link 무결성 (G3 픽스 전) | 100% | 80% (8/10) | `approval-resubmit` x2 깨짐 |
| Article cross-link 무결성 (G3 픽스 후) | 100% | **100%** (8/8) | ✅ 커밋 `3f27130` |

### 5.2 Resolved Issues (본 PDCA 사이클 내)

| Issue | Resolution | Result |
|---|---|---|
| **G3** — `articles.ts` 의 `relatedArticleIds: ['approval-recall', 'approval-resubmit']` 2곳에서 `'approval-resubmit'` 깨진 참조 (line 124 daily-report-write, line 216 approval-overview) | 두 곳에서 `'approval-resubmit'` 제거 → `relatedArticleIds: ['approval-recall']` 로 축소 (재상신 내용은 이미 `approval-recall` 본문에 포함됨) | ✅ 커밋 `3f27130` (`303bb18..3f27130 main -> main`), `tsc -b && vite build` 9.36s 통과, Cloudflare Pages 자동 배포 트리거, grep `approval-resubmit` 0건 확인 |

### 5.3 Pre-existing Resolved Issues (코드 작성 단계 5/26~5/27)

| Issue | Commit | Result |
|---|---|---|
| Tour Overlay 라우트 전환 시 unmount 회귀 | `0ff0f4d` (Context 글로벌화) + `1da92db` | ✅ GlobalTourOverlay 글로벌 마운트로 해결 |
| Tooltip 모바일 viewport 이탈 | `1da92db` | ✅ placement 자동 보정 + clamp |
| Plan 6 챕터 부족 (프로젝트&업무 누락) | `7eaac4c` | ✅ projects-work 챕터 신규 추가 |
| Static product tour 안티패턴 (외부 리서치) | `a684b05` | ✅ 3-Tier 도입, contextual 진입로 추가, 사용자 선택권 부여 |

---

## 6. Lessons Learned & Retrospective

### 6.1 What Went Well (Keep)

- **외부 리서치 기반 architecture pivot** — `a684b05` 커밋 메시지에 Arcade/UXCam/Userpilot/ServiceNow 등 출처와 메트릭(-28% 이탈, -40% TTV, -25% 티켓)을 압축해서 남긴 덕분에 사후 정리 PDCA에서 Deviation 근거를 그대로 인용할 수 있었음. **커밋 메시지가 의사결정 traceability 의 1차 source-of-truth로 작동.**
- **Plan 의 SC-04 ("step 정의는 chapters.ts 단일 진입") 결정 이 architecture pivot 이후에도 유지됨** — 데이터 모델은 add (`HelpArticle` 신규)만 되고, 기존 도메인(`ManualChapter`)은 그대로. 단일 진입 원칙이 pivot 후에도 안정성을 제공.
- **`[data-tour="..."]` selector anchor 패턴** — Sidebar/Header 컴포넌트 리팩토링이 자유로워졌고, Phase 3에서 11개 selector cross-reference 가 100% 일치 확인됨.
- **사후 정리 PDCA의 효과** — 코드만 보면 "왜 Help Center인지" 모를 텍스트들이, Design "Deviation from Plan" + Report "Decision Record Summary" 에 명문화되면서 미래 신입 개발자가 1시간 안에 컨텍스트 파악 가능한 상태가 됨.
- **CLAUDE.md 절대 규칙 ("DB ALTER 금지", "한국어", "모바일")가 자동으로 지켜졌음** — 본 기능이 client-side only로 설계된 결과 DB 위반 0건. 룰 의도에 부합.

### 6.2 What Needs Improvement (Problem)

- **Plan 작성 시 외부 리서치 단계가 없었음** — 5/26 Plan은 "강제 투어 only" 안티패턴으로 시작. 5/27 코드 작성 도중 외부 리서치 후 pivot. **Plan 단계 안에 "유사 SaaS 5개 best practice 1시간 조사" 가 있었다면 pivot 비용 절감 가능했음.**
- **Dead code 2건 (`useTour.ts`, `ChapterCard.tsx`) 누적** — Context 글로벌화 / Help Center 재작성 시 기존 코드를 삭제하지 않고 남겨둠. **회귀 위험은 0이지만 "어느 게 진짜냐" 인지 부담**. 다음 사이클에서 청소 PR 권장.
- **Tour 라우트 unmount 회귀** — 초기 구현(`tour.tsx` 내부 Overlay)이 navigate 시 깨짐 → Context 글로벌화로 수정. **Plan §8 Risk 표에 "라우트 전환 시 Overlay 생명주기" 가 누락됨** — Plan 단계에서 SPA 라우트 + Provider 패턴 검토 부재.
- **Plan ↔ Code naming drift (메신저 챕터, employee.tsx)** — Plan 명시 항목이 코드에 없으면 누군가 5/26 Plan 만 읽고 혼동 가능. **본 사이클에서 옵션 A(Historical Record 보존) + Deviation 섹션으로 해결**했지만 더 큰 deviation 발생 시에는 옵션 B(Plan v2) 고려 필요.

### 6.3 What to Try Next (Try)

- **PM/Plan 단계에 외부 리서치 체크리스트 추가** — "이 도메인의 표준 SaaS 3-5개를 1시간 안에 비교한 베스트 프랙티스 표" 를 Plan 작성 시 의무화. `/pdca pm {feature}` 단계의 pm-research agent 활용도 검토.
- **외부 인증/리서치 이미지 패턴 — 본 사이클에서 발견된 6번째 의사결정 근거 보존 패턴**:
  1. 커밋 메시지에 메트릭 인용 (`a684b05` 패턴)
  2. Design "Deviation from Plan" 섹션 명시
  3. Context Anchor RISK/SUCCESS 갱신
  4. Analysis Deviation Map 정량화
  5. Report Decision Record Summary 등재
  6. **(향후) 외부 리서치 원문 / 인용 출처 / 스크린샷 이미지를 `docs/00-research/{feature}/` 디렉토리에 별도 보존**. 커밋 메시지는 압축적이라 시간이 지나면 인용 출처가 불명해질 수 있음 — 정량 메트릭의 신뢰성 유지 목적.
- **dead code 즉시 삭제 룰** — 리팩토링 시 "old 코드는 따로 PR로 정리" 라는 사후 약속을 만들지 말고, 같은 PR에서 `git rm` 하도록 컨벤션 강화.
- **Plan §8 Risk 표에 "Provider/Context 생명주기" 항목 의무화** — SPA + Provider 패턴 사용 시 반드시 검토.
- **Help Center Knowledge Base 사용 통계 도입 (Phase 4)** — 어느 article 이 가장 많이 조회되는지 측정 → 인사담당 응대 부담 감소 효과 정량화. Plan §1.2 out-of-scope 였지만 우선순위 상향 권장.

---

## 7. Process Improvement Suggestions

### 7.1 PDCA Process

| Phase | Current | Improvement Suggestion |
|-------|---|---|
| (사전) PM | 본 사이클 미실행 | 외부 SaaS 베스트 프랙티스 리서치를 pm-research agent 출력의 한 섹션으로 의무화 |
| Plan | 단독 작성, 외부 리서치 미포함 | Plan §3 "아키텍처 결정" 섹션 작성 전 1시간 외부 리서치 의무화 |
| Design | 본 사이클은 사후 역공학 | 원래 흐름(Plan→Design→Do) 에서는 Provider/Context 생명주기 검토 항목 추가 |
| Do | (코드 후행 사이클이라 N/A) | dead code 즉시 삭제 컨벤션 (별도 PR 금지) |
| Check | 본 사이클은 단일 모드 정적 분석 | Agent Teams 활성화 시 gap-detector 병렬 호출 권장 (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1) |
| Act | G3 본 사이클 픽스, G1/G2/G4 향후 | Minor Gap 도 본 사이클 옵션 B/C 형태로 즉시 픽스 가능하면 push까지 진행 |

### 7.2 Tools/Environment

| Area | Improvement Suggestion | Expected Benefit |
|------|---|---|
| 외부 리서치 보존 | `docs/00-research/{feature}/` 디렉토리 + 출처 URL + 스크린샷 + 인용 메트릭 표 | 커밋 메시지 보다 강한 traceability — 1년 후 검증 가능 |
| Help Center 통계 | `manual_view_log` + `tour_complete_log` 테이블 + 일/주간 집계 대시보드 | 본 기능의 ROI 정량화, 어느 article 추가가 효과적인지 데이터 기반 결정 |
| Article CMS화 | supabase `help_articles` 테이블 + 관리자 편집 UI (RichEditor + DOMPurify) | 비개발자도 article 추가/수정 가능, 운영 속도 향상 |
| dead code 자동 감지 | ESLint `no-unused-imports` + import 그래프 CI 검사 | `useTour.ts`, `ChapterCard.tsx` 같은 누적 방지 |

---

## 8. Next Steps

### 8.1 Immediate (본 PDCA 사이클 종료 시점)

- [x] G3 픽스 커밋 + 푸시 (`3f27130`) — **완료**
- [x] 빌드 검증 (`tsc -b && vite build` 9.36s 통과) — **완료**
- [x] Cloudflare Pages 자동 배포 트리거 — **완료**
- [x] Phase 5 Archive — `docs/archive/2026-05/interactive-manual/` 이동 — **완료**
- [x] Archive Index 갱신 (`docs/archive/2026-05/_INDEX.md`) — **완료**
- [x] `.bkit/state/pdca-status.json` lightweight summary 갱신 — **완료**

### 8.2 Next PDCA Cycle (향후 권고 — 우선순위순)

| # | 권고 | 출처 | 우선순위 | 예상 effort |
|---|---|---|---|---|
| 1 | **G1+G2 dead code 청소 PR** (`useTour.ts`, `ChapterCard.tsx` 삭제) | Phase 3 Gap | High (10분 작업) | 10분 |
| 2 | **Phase 2 — 경영지원 6 챕터 + hr-admin article** | Plan §1.2 SCOPE Phase 2 | High | 2-3일 |
| 3 | **Phase 3 — 임원 5 챕터 + executive article + 권한 가드** | Plan §1.2 SCOPE Phase 3 | Medium | 2일 |
| 4 | **사용 통계 대시보드** (Plan §1.2 Phase 4) — `manual_view_log`/`tour_complete_log` + 일/주 집계 + 인기 article 랭킹 | Plan + Report §6.3 | Medium-High | 3-4일 |
| 5 | **Article CMS 화** (O1) — supabase `help_articles` 테이블 + 관리자 편집 UI | Phase 3 합의 사항, Report §6.3 | Medium | 5-7일 |
| 6 | **외부 리서치 보존 디렉토리 신설** — `docs/00-research/{feature}/` 컨벤션 도입 | Report §6.3 (6번째 의사결정 패턴) | Medium | 0.5일 |
| 7 | **G4 — `MutationObserver`/`ResizeObserver` 개선** | Phase 3 Gap | Low | 1-2시간 |
| 8 | **AI 챗봇 도움말** (Plan §1.2 Phase 5) — article 검색 기반 RAG + Gemini | Plan | Low | 1-2주 |
| 9 | **영상 매뉴얼** | Plan §1.2 | Low | 별도 의사결정 |
| 10 | **PM/Plan 프로세스 개선** — Plan §3 작성 전 외부 리서치 1시간 의무화 (반복적 Help Center pivot 비용 회피) | Report §6.2, §7.1 | Medium (프로세스 변경) | 0.5일 |

---

## 9. Changelog (이번 PDCA 사이클 내 코드 변경)

### v(post-3f27130) (2026-05-27)

**Fixed:**
- `src/lib/manual/articles.ts` line 124, 216 — `relatedArticleIds` 의 깨진 참조 `'approval-resubmit'` 제거 (Phase 3 Gap G3, 커밋 `3f27130`)
  - line 124 (`daily-report-write`): `['approval-recall', 'approval-resubmit']` → `['approval-recall']`
  - line 216 (`approval-overview`): `['approval-recall', 'approval-resubmit']` → `['approval-recall']`
  - 재상신 내용은 이미 `approval-recall` article 본문에 포함되어 있어 UX 영향 없음
  - 빌드 통과: `tsc -b && vite build` 9.36s
  - grep 사후 검증: `approval-resubmit` 0건

**Added (이번 사이클 — 모두 archive로 이동됨):**
- Design 문서 (~600 LOC) — 역공학 Design, "Deviation from Plan" 섹션 명시
- Analysis 문서 (~600 LOC) — Gap Analysis, Match Rate 97.4%
- Report 문서 (본 문서)

**Documented (코드 변경 없음, 5/26~5/27 코드는 별도 커밋):**
- 5/26~5/27 5개 커밋(`ec366eb`, `0ff0f4d`, `7eaac4c`, `1da92db`, `a684b05`) 의 의사결정 traceability 를 본 PDCA 사이클 문서 3종으로 보존

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-05-27 | Completion report 작성 — 코드 후행 사후 정리 PDCA #1 완료. G3 본 사이클 픽스(3f27130) 반영, 12/12 SC Met, Match Rate 97.4%, Critical/Important Gap 0건 | 대표 + CTO Lead |
| 1.1 (archived) | 2026-05-27 | Archive 사본 — 8.1 Immediate 항목 체크 갱신, Related Documents 경로를 archive 내부 상대경로로 조정 | CTO Lead |

---

> **📦 ARCHIVED 2026-05-27** — PDCA 사이클 #1 종료. 본 디렉토리(`docs/archive/2026-05/interactive-manual/`) 의 4개 문서가 사이클 전체의 traceable record. 후속 작업은 본 §8.2 향후 권고 참조.
