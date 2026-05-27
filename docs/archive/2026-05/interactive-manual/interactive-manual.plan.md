# Plan — 인터랙티브 온라인 매뉴얼 (HR Platform Tour System)

> **요청자**: 대표 (2026-05-26)
> **목적**: 모든 임직원에게 HR 플랫폼 사용법을 체험형으로 학습시키는 온라인 매뉴얼

## Executive Summary

| 관점 | 내용 |
|---|---|
| 문제 | 신규/기존 임직원이 HR 플랫폼의 메뉴 사용법을 몰라 인사담당에게 매번 문의. 별도 교육 시간 부담. |
| 솔루션 | 실제 화면 위에 단계별 spotlight + tooltip 으로 시연하는 체험형 가이드 투어. 권한별 챕터 구성. |
| 기능/UX 효과 | "혼자 따라하면 이해되는" 가이드. 모르는 기능 즉시 자기 해결. 인사담당 문의량 감소. |
| 핵심 가치 | 자기주도 학습 + 인사담당 부담 경감 + 신규 입사자 온보딩 자동화. |

## Context Anchor

| 항목 | 내용 |
|---|---|
| WHY | 신규 입사자 + 기존 직원 모두 HR 플랫폼 메뉴를 모름 → 인사담당 1:1 응대 비효율 |
| WHO | 1) 전 직원 (Phase 1) → 2) 인사담당 (Phase 2) → 3) 임원 (Phase 3) |
| RISK | 매뉴얼이 코드 변경에 안 따라가면 stale. step 데이터 → 코드 결합 관리 필요 |
| SUCCESS | (S1) 6개 챕터 완성 (S2) Tour 시작 → 완료율 측정 (S3) "혼자 해결" 케이스 증가 |
| SCOPE | Phase 1 (직원 기본 메뉴 6 챕터) → Phase 2 (경영지원) → Phase 3 (임원) |

## 1. 요구사항 (대표 의도 정리)

### 1.1 핵심 요구사항
- ✅ 모든 임직원 교육 가능한 **전용 링크** (`/manual`)
- ✅ 실제 시연 + 단계별 설명
- ✅ **권한 단계별 챕터** (직원/경영지원/임원)
- ✅ **인터랙티브** (이벤트, 클릭, hover, 직접 조작)
- ✅ **자기 해결 가능** (모르는 기능 → 매뉴얼로 즉시 확인)

### 1.2 제외 (Out of Scope, 다음 사이클)
- 영상 매뉴얼 (정적 콘텐츠 우선)
- 사용 이력 분석 / 완료 통계 대시보드 (Phase 4)
- AI 챗봇 도움말 (Phase 5)

## 2. Success Criteria

| ID | 기준 | 측정 |
|---|---|---|
| SC-01 | Phase 1 직원 기본 6 챕터 완성 | 챕터 페이지 6개 존재 |
| SC-02 | 사이드바에 "매뉴얼" 메뉴 노출 | 전 직원 노출 확인 |
| SC-03 | Tour 시작 → 단계 진행 → 완료 동작 | Tour 실행 시 spotlight + tooltip 동작 |
| SC-04 | Tour 데이터 → 코드 변경 영향 최소 | step 정의는 `lib/manual/chapters.ts` 단일 진입 |
| SC-05 | 모바일 반응형 | iPhone 14 Pro 사이즈에서 tooltip 정상 |
| SC-06 | "혼자 따라하면 이해되는" 톤 | 한국어 + 친근한 문구 + 다음/이전 명확 |

## 3. 아키텍처 결정

### 3.1 라이브러리 vs 자체 구축 → **자체 구축**
- 이유: 의존성 0, Tailwind 만으로 충분, 기존 컴포넌트 패턴 일치
- 외부 라이브러리(react-joyride/shepherd.js) 의 커스터마이징 한계 회피

### 3.2 핵심 컴포넌트
| 컴포넌트 | 역할 |
|---|---|
| `TourOverlay` | 화면 어둡게 + 특정 요소만 spotlight + tooltip 카드 표시 |
| `TourStep` 타입 | step 정의 (target selector / title / description / placement / action) |
| `useTour` 훅 | current step / next / prev / complete / 스크롤·하이라이트 |
| `ManualChapter` | 챕터 메타 + step 배열 |

### 3.3 데이터 구조
```ts
// src/types/manual.ts
type TourStep = {
  id: string
  title: string
  description: string
  target?: string            // CSS selector (없으면 중앙 모달)
  route?: string             // 시작 시 navigate
  placement?: 'top'|'bottom'|'left'|'right'|'center'
  action?: 'click'|'observe'|'fill'
}
type ManualChapter = {
  id: string
  category: 'employee'|'hr-admin'|'executive'
  title: string
  description: string
  icon: string
  estimatedMinutes: number
  steps: TourStep[]
}
```

## 4. Phase 1 챕터 목록 (직원 기본)

| # | 챕터 | 핵심 단계 |
|---|---|---|
| 1 | 대시보드 둘러보기 | 홈 카드 / 알림 / 빠른 메뉴 / 최근 결재 |
| 2 | 일일 업무 보고 작성 | 메뉴 진입 / 오늘 작업 입력 / 만족도 / 제출 |
| 3 | 연차 신청하기 | 메뉴 진입 / 기간 선택 / 사유 입력 / 결재선 확인 |
| 4 | 자기평가 작성 | 진입 / 항목별 점수 입력 / 자기 코멘트 / 제출 |
| 5 | 전자결재 사용법 | 신청 종류 / 결재 진행 확인 / 회수 / 재상신 |
| 6 | 메신저 사용법 | 채팅 / 파일 첨부 / 검색 / 알림 설정 |

(Phase 2/3 챕터는 후속 사이클)

## 5. 파일 구조

```
src/
├── types/manual.ts                          # 타입 정의
├── lib/manual/chapters.ts                   # 챕터 데이터 (Phase 1)
├── hooks/useTour.ts                         # Tour 상태 훅
├── components/manual/
│   ├── TourOverlay.tsx                      # spotlight + tooltip
│   └── ChapterCard.tsx                      # 챕터 카드 컴포넌트
└── routes/manual/
    ├── index.tsx                            # 매뉴얼 허브 (권한별)
    ├── employee.tsx                         # 직원 챕터 목록
    └── tour.tsx                             # 실제 시연 화면
```

## 6. 라우트

| 경로 | 화면 | 권한 |
|---|---|---|
| `/manual` | 매뉴얼 허브 (직원/경영지원/임원 카드) | 전 직원 |
| `/manual/employee` | 직원 챕터 6개 목록 | 전 직원 |
| `/manual/tour/:chapterId` | Tour 시연 모드 | 전 직원 |
| `/manual/hr-admin` | 경영지원 챕터 (Phase 2) | hr_admin+ |
| `/manual/executive` | 임원 챕터 (Phase 3) | director+ |

## 7. UX 흐름

```
1. 사이드바 → "📖 매뉴얼" 클릭
2. /manual 허브 → 본인 권한별 카드 노출
3. 카드 클릭 → 챕터 목록
4. "시작하기" 클릭 → 자동으로 해당 라우트 navigate + Tour 시작
5. spotlight + tooltip 으로 step 안내
6. "다음" 버튼으로 진행 → 완료 시 축하 메시지
```

## 8. Risk & Mitigation

| Risk | Mitigation |
|---|---|
| target selector 가 코드 변경 시 깨짐 | data-tour="..." 속성으로 명시 (class/id 의존 회피) |
| 모바일에서 spotlight 위치 어긋남 | placement 자동 계산 + viewport 감지 |
| Tour 중 사용자가 다른 행동 → 상태 깨짐 | Esc / 외부 클릭 시 우아한 종료 |
| Phase 2/3 챕터 정의 부담 | chapters.ts 데이터만 추가하면 됨 (코드 변경 X) |

## 9. 이번 사이클 구현 범위 (Phase 1)

✅ 포함:
- types/manual.ts
- lib/manual/chapters.ts (6 챕터 데이터)
- components/manual/TourOverlay.tsx
- components/manual/ChapterCard.tsx
- hooks/useTour.ts
- routes/manual/index.tsx (허브)
- routes/manual/employee.tsx (목록)
- routes/manual/tour.tsx (시연)
- App.tsx 라우트 등록
- Sidebar.tsx 메뉴 추가 (전 직원 노출)

❌ 제외 (다음 사이클):
- Phase 2 (경영지원 챕터 6개)
- Phase 3 (임원 챕터 5개)
- Tour 완료 통계
- AI 챗봇 도움말
- 영상 매뉴얼

## 10. 검증

- [ ] npm run build 통과
- [ ] /manual 진입 → 허브 정상 노출
- [ ] /manual/employee → 6 챕터 카드
- [ ] 챕터 클릭 → tour 시작
- [ ] 다음/이전 버튼 동작
- [ ] Esc 키로 종료
- [ ] 사이드바 "매뉴얼" 메뉴 노출 (employee role)

---

> **📦 ARCHIVED 2026-05-27** — PDCA 사이클 #1 종료 (사후 정리, 옵션 A "Historical Record 보존").
> 본 Plan은 5/26 시점의 의사결정 스냅샷으로 보존됨. 5/27 코드 작성 도중 "강제 투어 only" → "3-Tier Help Center" 모델로 architecture pivot 됨 — 자세한 내용은 같은 디렉토리의 `interactive-manual.design.md` "Deviation from Plan" 섹션 참조.
