---
name: append-only-large-file-regression-zero
description: 대형 단일 파일(~1700 LOC)에 신규 기능 데이터를 끼울 때 기존 코드 0 수정 + 별도 effect/헬퍼 append 로 회귀 0 달성
metadata:
  type: feedback
---

대형 단일 파일에 신규 데이터 source 를 통합할 때 "기존 코드 한 줄도 수정 안 함 + append-only" 로 회귀 0 을 보장하는 패턴.

**Why**: PDCA #5 (recurring-task) FR-08 에서 반복업무 진행분을 일일보고(`src/routes/work/daily-report.tsx`, ~1730 LOC, 4개 자동수집 source + autoMergeTodayActivity full-replace + 결재 흐름)에 반영해야 했음. 기존 fetchData/머지 로직을 건드리면 일반 연차/업무보고 전체 회귀 위험이 본 사이클 최대 리스크였음. 대표가 "기존 source 코드 한 줄도 변경 금지"를 명시.

**How to apply**:
1. 신규 데이터 조회는 **컴포넌트 밖 순수 모듈 헬퍼**로 분리 (예: `fetchRecurringForDaily(employeeId, date)`), try/catch로 실패 시 빈 배열 반환 → 기존 흐름 무영향.
2. 기존 setter(예: setCompleted(autoCompleted)) 를 수정하지 말고, **별도 useEffect**에서 functional append: `setX(prev => [...prev, ...dedup된 add])`. 추가분 없으면 `prev` 그대로 반환(불필요 렌더 0).
3. 그 effect는 기존 로드 완료 신호(예: `loading=false`) 이후 실행되게 의존성 설정 → 기존 비동기 머지(fire-and-forget setState 포함)가 정착한 뒤 동작.
4. 신규 항목 id 를 기존 dedupe 키와 호환되게 설정(예: occurrence.id = DailyReportTask.id) → 기존 dedupe/편집보존 로직과 자연 호환, 별도 처리 불필요.
5. `cancelled` 가드로 의존성(날짜 등) 전환 race 처리.

**잔존 한계(반드시 인지)**: 기존 머지가 **full-replace setState**(append 아님)이고 fire-and-forget(비await)이면, 그 setState가 신규 effect보다 늦게 land 할 때 신규 항목이 일시 덮어써질 수 있음. 영속화(저장)된 데이터는 다음 로드에서 기존 머지의 "userAdded" 분기로 보존되므로 실사용 경로는 안전하나, **실측 검증을 deferred item 으로 남길 것**. 완전 차단이 필요하면 기존 머지 함수가 신규 항목 prefix(예: '[반복]')를 보존하도록 최소 수정(이건 "기존 코드 수정"이라 trade-off).

**측정**: PDCA #5 회귀 0(구조적), Match 98.4%, 반복업무 0건 사용자는 일일보고 기존 동작 완전 동일. [[session-split-pattern-pdca-do]] 의 "기존 함수 시그니처 변경 0" 정신과 동일, 파일 단위로 구체화. [[dailyreport-projects-cron-infra]] 에 daily-report 구체 적용 기록.
