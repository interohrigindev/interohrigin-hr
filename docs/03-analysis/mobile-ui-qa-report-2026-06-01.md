# 모바일 UI/UX 페이지별 점검 보고서 (2026-06-01)

> 사용자 요청: "웹과 모바일 각 페이지별로 점검하고 보고를 먼저"
>
> 이미 수정 완료(커밋 36b968e): 일일 업무보고서 카드 + 날짜 selector

## 점검 방식

각 페이지를 다음 4축으로 평가:
- **🖥️ 웹 (≥1024px)** — 데스크탑 레이아웃
- **📱 태블릿 (640~1023px)** — sm/md 브레이크포인트
- **📱 모바일 (<640px)** — 안드/아이폰 폭(320~430px)
- **⚠️ 회귀 위험** — 수정 시 영향 범위

표시: ✅ 양호 / ⚠️ 잠재 / ❌ 문제 / 🔧 수정 권장

---

## 1. 핵심 직원 페이지 (사용 빈도 ★★★)

### 1-A. `/work/daily-report` 일일 업무보고서 ✅ 수정 완료
| 영역 | 웹 | 모바일 | 비고 |
|---|---|---|---|
| 헤더 | ✅ | ✅ | flex-wrap 적용 |
| 날짜 selector | ✅ | ✅ 수정 | 화살표/캘린더/input flex-wrap (커밋 36b968e) |
| 작업 현황 카드 | ✅ | ✅ 수정 | 3행 stack 으로 재구성 |
| 결재 전송 다이얼로그 | ✅ | ⚠️ | 결재선 미리보기 영역 좁은 폭에서 검증 필요 |
| AI 요약 영역 | ✅ | ⚠️ | 긴 텍스트 wrap 확인 필요 |

**잠재 추가 작업**: 결재 전송 다이얼로그(line ~1500+) 모바일에서 미리보기가 잘리는지 직접 확인 필요.

---

### 1-B. `/hr-ops/leave` 연차/휴가 신청·관리 ⚠️ 점검 필요
| 영역 | 웹 | 모바일 | 권장 수정 |
|---|---|---|---|
| 헤더 (제목·검색) | ✅ flex-wrap | ✅ | - |
| 통계 카드 4개 (line 950) | ✅ `grid-cols-2 md:grid-cols-4` | ✅ | - |
| 신청 폼 (라인 1085+) | ✅ `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` | ✅ | - |
| **결재 흐름 미리보기** | ✅ | ⚠️ | ApprovalLineViewer 길이 점검 (이번 PR 에서 변경됨) |
| 신청 다이얼로그 | ✅ | ✅ | sticky 헤더 잘 동작 |
| 긴급연차 폼 | ✅ | ⚠️ | line 1430+ `grid-cols-2` 좁은 화면에서 한 줄 라벨 wrap 확인 |
| 관리자 처리 다이얼로그 | ✅ | ⚠️ | 단축키/결재 액션 버튼 정렬 확인 |

**구체 수정안 (필요 시)**:
- 결재 흐름 미리보기: ApprovalLineViewer 의 step 라벨이 한국어 wrap 안 되도록 `break-keep` 적용 확인
- 긴급연차 사유 유형 4개 버튼: 모바일에서 2x2 또는 1열로 자동 wrap 적용 확인

---

### 1-C. `/hr-ops/approval` 전자결재 ⚠️ 점검 필요
| 영역 | 웹 | 모바일 | 권장 수정 |
|---|---|---|---|
| 본문 헤더 | ✅ flex-wrap | ✅ | - |
| 결재 양식 그리드 (line 1394) | ✅ `grid-cols-2 md:grid-cols-3` | ✅ | - |
| 결재선 관리 그리드 (line 1490) | ✅ `grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8` | ⚠️ | **모바일에서 컬럼 3개 = 한 카드 너비 좁음** |
| 결재선 카드 그리드 (line 1633) | ✅ `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` | ✅ | - |
| 결재 항목 그리드 (line 1994) | ✅ `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` | ✅ | - |
| 다이얼로그 sticky 헤더 | ✅ | ✅ | - |

**구체 수정안**:
- line 1490 `결재선 관리` 카테고리 칩 그리드를 모바일에서 2열로 변경: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8`

---

### 1-D. `/projects/unified-dashboard` 프로젝트 대시보드 ✅ 부분 수정 완료
| 영역 | 웹 | 모바일 | 비고 |
|---|---|---|---|
| 그룹 헤더 | ✅ | ✅ | 색상 띠 통일 (커밋 820d8e4) |
| 프로젝트 테이블 | ✅ | ⚠️ | `min-w-[700px]` + `overflow-x-auto` — 모바일에서 가로 스크롤 정상 |
| 담당자별 업무량 | ✅ | ✅ | max-h 균형 (커밋 820d8e4) + 퇴사자 제외 (d2d66f9) |
| 주의 필요 / 홀딩 | ✅ | ✅ | max-h 균형 |
| **담당자 변경 모달** | ✅ | ⚠️ | 신규 추가 (6421c80) — 모바일 폭 검증 필요 |

**구체 수정안 (있다면)**:
- ProjectOwnerTransferModal: 검색 결과 리스트 max-h-44 — 키보드 올라온 상태에서 짧을 수 있음

---

### 1-E. `/hr-ops/attendance` 근태 ⚠️ 부분
| 영역 | 웹 | 모바일 | 권장 수정 |
|---|---|---|---|
| 월 네비게이션 | ✅ flex-wrap | ✅ | - |
| 통계 카드 | ✅ | ✅ | - |
| **직원 카드 그리드 (line 538+)** | ✅ | ⚠️ | `grid-cols-3` 류 무 prefix 발견 — 모바일 압축 가능 |

**구체 수정안**: 해당 grid 에 `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` 추가

---

## 2. 빈번 사용 보조 페이지 (★★)

### 2-A. `/calendar` 캘린더 ⚠️
- `grid-cols-7` (요일) — 정상 (캘린더는 7컬럼 필수)
- 헤더 `text-2xl` + 모바일 — `index.css` 안전망(`h1 → 1.25rem`)으로 차단됨 ✅
- 월 변경 버튼 영역: 별도 점검 필요

### 2-B. `/bulletin` 게시판 ⚠️ 
- 213 lines, 비교적 단순 — 직접 코드 확인 필요
- 게시판 카드 그리드 점검

### 2-C. `/messenger` 메신저 ✅ 좋음
- `hidden md:flex` 패턴으로 모바일/데스크탑 분리 명확
- `md:hidden` 모바일 전용 뷰 별도 존재 → 의도적 분기

### 2-D. `/manual` 사용 매뉴얼 (도움말)
- 직원 일상 사용 메뉴 — 별도 점검 필요

### 2-E. `/admin/probation` 수습 평가 ✅
- 이미 [ProbationMobileList](src/components/probation/ProbationMobileList.tsx) 로 모바일 전용 뷰 적용 (커밋 e81dda3)

---

## 3. 관리자 페이지 (★)

| 파일 | 모바일 노출 | 잠재 위험 |
|---|---|---|
| settings/billing.tsx | 관리자만 | P1×5, text-3xl — 모바일에서 사용 적음, 우선순위 ↓ |
| settings/menu-permissions.tsx | 관리자만 | P1×1 |
| report.tsx | 관리자/CEO | P1×5, text-3xl — 모바일 가능성 ↑, 우선 |
| admin/leave-promotion.tsx | 관리자 | 단순 |
| admin/audit-logs.tsx | 관리자 | 테이블 위주, 모바일 사용 ↓ |
| admin/notification-channels.tsx | 관리자 | 단순 |
| urgent/migration.tsx | 관리자 | P1×5, 일회성 사용 |

→ 관리자 페이지는 데스크탑 사용 가정 (모바일 회귀 위험 ↓ 우선순위 ↓)

---

## 4. 채용 페이지 (★★)

### 4-A. `/recruitment/schedules` 면접 일정
- `grid-cols-3~9` × 4곳 + `min-w-[...]` 사용
- 면접 카드 컴팩트화 점검 필요

### 4-B. `/recruitment/candidate-report` 지원자 분석 (3568 lines!)
- 가장 큰 페이지. 직접 모바일 점검 필요
- AI 분석 결과 본문 wrap, 점수 차트 모바일 폭 등

---

## 5. 권장 수정 우선순위 + 작업 계획

### 즉시 수정 권장 (Sprint 1 — 1~2시간)

| # | 페이지 | 작업 | 예상 |
|---|---|---|---|
| 1 | `hr-ops/leave.tsx` | 결재 흐름 미리보기 wrap + 긴급연차 폼 검증 | 30분 |
| 2 | `hr-ops/approval.tsx` line 1490 | 결재선 관리 카테고리 칩 그리드 모바일 2열 | 5분 |
| 3 | `hr-ops/attendance.tsx` | 직원 카드 그리드 `grid-cols-3` 모바일 fallback | 10분 |
| 4 | `bulletin/index.tsx` | 게시판 카드 모바일 점검 | 20분 |
| 5 | `calendar/index.tsx` | 월 네비/헤더 모바일 점검 | 15분 |

### 다음 라운드 (Sprint 2 — 3~5시간)

| # | 페이지 | 작업 |
|---|---|---|
| 6 | `manual/*` | 사용 매뉴얼 전체 모바일 가독성 |
| 7 | `recruitment/schedules.tsx` | 면접 일정 모바일 카드 |
| 8 | `home.tsx` | EmployeeHome 영역 추가 점검 |
| 9 | `work/tasks.tsx`, `work/projects.tsx`, `work/dashboard.tsx` | 직원 업무 페이지군 wrap 보강 |

### 보류 (Sprint 3 — 필요 시)

| # | 페이지 | 사유 |
|---|---|---|
| 10 | `recruitment/candidate-report.tsx` | 3568 lines — 별도 큰 작업, 사용 빈도 낮음 |
| 11 | `meeting-notes.tsx`, `ojt/probation-results.tsx` | 사용 빈도 ↓ |
| 12 | 관리자 페이지군 | 데스크탑 가정 |

---

## 6. 사용자 결정 필요 사항

1. **수정 진행 범위**:
   - (A) Sprint 1 만 — 1~2시간 빠른 효과
   - (B) Sprint 1 + 2 — 4~7시간, 90% 모바일 사용 커버
   - (C) 전체 — 10시간+

2. **수정 시 회귀 검증 방법**:
   - 코드만 수정 + 사용자가 실 기기 확인
   - 또는 Storybook/스크린샷 회귀 도입 (별도 작업)

---

## 7. 이미 적용된 모바일 안전망 (전역)

`src/index.css`:
- `html, body, #root` `overflow-x: hidden + max-width: 100vw`
- 버튼 내부 텍스트 wrap 허용 (긴 description 한 글자 wrap 차단)
- 다이얼로그 모바일 max-width 자동 조정
- `grid-cols-3/4` → `grid-cols-2` 모바일 fallback (글로벌 안전망)
- h1 모바일 폰트 축소

→ 이 덕분에 가장 심각한 viewport 초과는 차단되어 있음.
→ 남은 작업은 주로 "한 줄 내 요소 간격/그룹화" 미세 조정.
