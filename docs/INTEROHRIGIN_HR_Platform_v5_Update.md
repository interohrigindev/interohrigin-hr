# INTEROHRIGIN HR Platform — v5 업데이트 (3/17 미팅 반영)

> **기준 미팅**: 2026.03.17 (강제묵 이사 / 오영근 대표 / 차주용 대표)
> **이전 버전**: v4 (3/16 미팅 기반)
> **최종 업데이트**: 2026.03.18

---

## 3/17 미팅 신규 요구사항 요약

| # | 요구사항 | 우선순위 | 반영 위치 |
|---|---------|---------|----------|
| 1 | CEO 긴급 대시보드 (Top 10 업무) | ★최우선 | P-NEW-01 |
| 2 | AI 리마인드 시스템 (완료까지 집요하게 알림) | ★최우선 | P-NEW-02 |
| 3 | 감정 케어 AI (재촉 시 적절한 멘트 제안) | 중간 | P-NEW-02 |
| 4 | 리마인드 경고 횟수 → 인사평가 감점 연동 | 높음 | P-NEW-03 |
| 5 | 인사평가 UI 간소화 (최소 클릭으로 완료) | ★긴급 | P-NEW-04 |
| 6 | 사번 자동 생성 (입사년도+월일+순번) | 높음 | P-02 수정 |
| 7 | 사내 메신저 일원화 (자체 메신저 + AI 챗봇) | 장기 | Phase 3 |
| 8 | 슬랙/노션/네이버웍스 데이터 마이그레이션 | 높음 | P-NEW-05 |
| 9 | 1분기 인사평가 기준 시스템 세팅 | ★긴급 | P-NEW-04 |

---

## v4 대비 변경점

### 프롬프트 추가: 5개 신규 (P-NEW-01 ~ P-NEW-05)

v4의 30단계에 5개 추가 → **총 35단계**

```
기존 Phase 1 (P-01~P-21): 유지

신규 삽입 (Phase 1.5 — 긴급 업무 관리):
  P-22★ CEO 긴급 대시보드 + AI 리마인드 시스템 ← 최우선
  P-23★ 인사평가 UI 간소화 + 1분기 평가 세팅 ← 긴급
  P-24  리마인드 경고 → 인사평가 감점 연동
  P-25  외부 데이터 마이그레이션 (슬랙/노션/네이버웍스)

기존 Phase 2 (업무 연동): P-26~P-35로 넘버 변경
  P-26 [WM] work-milestone 구조 파악
  P-27 [WM] AI ToDo 자동 생성
  P-28 [WM] 일일 업무 보고서 고도화
  P-29 [WM] AI 업무 챗봇 + 감정 케어 AI ← 3/17 추가
  P-30 [HR] 업무 데이터 동기화 + 자기평가 객관화
  P-31 [HR] AI 평가 리포트 통합
  P-32 [HR] 채용 AI 예측 검증
  P-33 [HR] 퇴사 관리
  P-34 [HR+WM] 전체 통합 테스트
  P-35  사내 메신저 일원화 (Phase 3 — 장기)
```

### DB 테이블 추가: 3개 신규

```
v4의 26개 + 3개 = 총 29개 신규 테이블

추가:
  urgent_tasks          — CEO 긴급 업무 (Top 10)
  task_reminders        — AI 리마인드 이력 (발송/응답/완료 추적)
  reminder_penalties    — 리마인드 경고 누적 → 인사평가 감점 기록
```

### 기존 테이블 수정

```
employees 테이블에 사번 자동 생성 로직:
  employee_number TEXT UNIQUE
  → 포맷: YYMMDDRR (26031701)
  → 트리거로 자동 생성
```

---

## 신규 프롬프트 상세

---

### P-22 [HR] — CEO 긴급 대시보드 + AI 리마인드 시스템 ★최우선★

```
회사 전체에서 가장 중요한 긴급 업무 Top 10을 전 직원이 볼 수 있는
전용 대시보드와, 미완료 업무에 대해 완료될 때까지 집요하게 알림하는 시스템입니다.

## STEP 1: urgent_tasks 테이블 생성

CREATE TABLE urgent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  priority integer DEFAULT 1,          -- 1(최긴급)~10
  assigned_to uuid[],                  -- 담당자 (복수 가능)
  created_by uuid,                     -- 지시자 (CEO/임원)
  
  -- 기한
  deadline timestamptz NOT NULL,
  is_overdue boolean DEFAULT false,    -- 자동 계산
  
  -- 상태
  status text DEFAULT 'pending',       -- 'pending' | 'in_progress' | 'completed' | 'overdue'
  completed_at timestamptz,
  completed_by uuid,
  completion_note text,                -- 완료 보고
  
  -- 리마인드
  reminder_count integer DEFAULT 0,    -- 발송된 리마인드 횟수
  last_reminder_at timestamptz,
  reminder_interval_hours integer DEFAULT 4, -- 리마인드 간격 (기본 4시간)
  
  -- 연결
  project_id text,                     -- work-milestone 프로젝트 ID (있으면)
  related_employee_id uuid,            -- 관련 직원 (있으면)
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE task_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  urgent_task_id uuid REFERENCES urgent_tasks(id),
  sent_to uuid NOT NULL,               -- 수신자
  sent_via text,                       -- 'push' | 'sms' | 'email' | 'popup'
  sent_at timestamptz DEFAULT now(),
  acknowledged boolean DEFAULT false,   -- 확인했는지
  acknowledged_at timestamptz,
  response_note text                   -- "진행중입니다" 등 응답
);

## STEP 2: CEO 긴급 대시보드 UI

URL: /admin/urgent (또는 메인 대시보드 최상단 고정 섹션)

★ 전 직원에게 보이는 탭/배너:

┌─────────────────────────────────────────────────────────┐
│  🔴 CEO 긴급 업무 (Top 10)                    [전체 보기] │
│                                                         │
│  1. 2026 S/S 컬렉션 샘플 확정 ⏰ D-2                    │
│     담당: 김영석, 박지현 | 지시: 오영근 대표              │
│     상태: 🔄 진행중 | 리마인드: 3회                      │
│                                                         │
│  2. 두바이 전시 부스 디자인 확정 ⏰ D-1 ⚠ 위험           │
│     담당: 이수진 | 지시: 강제묵 이사                     │
│     상태: ⏳ 대기 | 리마인드: 5회 ← 빨간색 경고          │
│                                                         │
│  3. 신규 브랜드 계약서 검토 ⏰ D+1 🔴 초과               │
│     담당: 강제묵 이사 | 지시: 오영근 대표                │
│     상태: 🔴 기한 초과 | 리마인드: 8회                   │
│     [완료 보고] [기한 연장 요청]                         │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘

관리자(CEO/임원)만 긴급 업무 추가/수정/삭제 가능.
전 직원은 읽기 + 자기 업무 완료 보고만 가능.

긴급 업무 추가 폼:
  제목, 설명, 담당자(복수 선택), 기한, 우선순위(1~10)

## STEP 3: AI 리마인드 시스템

미완료 긴급 업무에 대해 자동으로 알림을 보냅니다.
완료 버튼이 눌릴 때까지 멈추지 않습니다.

리마인드 로직:
  1. 매 N시간마다 (기본 4시간, 업무별 설정 가능) 체크
  2. status가 'pending' 또는 'in_progress'이면서 deadline이 임박/초과인 업무 조회
  3. 담당자에게 알림 발송:
     - 앱 내 팝업 (항상)
     - 이메일 (기한 D-1부터)
     - SMS (기한 초과 시, 선택적)
  
  알림 메시지 (AI가 상황별로 생성):
    D-3: "'{업무명}' 마감이 3일 남았습니다. 현재 진행 상황을 업데이트해주세요."
    D-1: "'{업무명}' 마감이 내일입니다. 완료 예정인가요?"
    D-0: "'{업무명}' 오늘이 마감일입니다. 완료 후 보고 버튼을 눌러주세요."
    D+1: "⚠ '{업무명}' 기한이 1일 초과되었습니다. 즉시 완료하거나 기한 연장을 요청하세요."
    D+3: "🔴 '{업무명}' 기한이 3일 초과되었습니다. 이 업무는 인사평가에 반영됩니다."
  
  리마인드 횟수가 task_reminders에 누적 기록.

## STEP 4: 완료 보고 + 기한 연장

담당자가 "완료 보고" 클릭:
  - 완료 내용 간단히 작성 (1~2줄)
  - urgent_tasks.status → 'completed'
  - 리마인드 자동 중지
  - 지시자(CEO)에게 "완료되었습니다" 알림

"기한 연장 요청" 클릭:
  - 연장 사유 + 새 기한 입력
  - 지시자에게 승인 요청 알림
  - 승인/반려

## STEP 5: 감정 케어 AI (미팅 3/17 요청)

업무 재촉으로 인한 감정 상함을 방지하기 위해,
AI가 상황에 맞는 적절한 멘트를 제안합니다.

예시:
  담당자가 기한 초과 업무에 "진행중입니다" 응답 시:
  → 지시자에게 AI 제안: "감사합니다라고 표현해보는 건 어떨까요?
     예: '확인했습니다. 바쁜 중에 진행해줘서 고마워요. 내일까지 가능할까요?'"

  리마인드가 5회 이상 쌓인 업무:
  → AI가 중간 조율: "이 업무는 리마인드가 5회 발송되었습니다.
     담당자가 과부하 상태일 수 있습니다.
     다른 담당자 추가 또는 기한 조정을 검토해보세요."

구현: AI 멘트는 optional 팝업으로, 지시자가 참고만 하면 됨 (강제 아님).

## 주의사항
- 긴급 업무는 CEO/임원만 생성 가능
- 리마인드는 끌 수 없음 (완료 또는 기한 연장만 가능)
- 리마인드 횟수는 인사평가에 연동 (P-24)
- 모바일에서도 팝업 알림 + 완료 보고 가능
```

---

### P-23 [HR] — 인사평가 UI 간소화 + 1분기 평가 세팅 ★긴급★

```
임원진이 바쁜 일정 속에서 최소한의 클릭과 입력만으로
인사평가를 완료할 수 있도록 기존 평가 UI를 개선합니다.

## STEP 1: 기존 인사평가 UI 확인

현재 인사평가 시스템의:
- 평가 항목 수 (지난 미팅에서 "너무 많다"는 피드백)
- 주관식 비중 (지난 미팅에서 "짧은 객관식 + 2줄 요약"으로 변경 요청)
- 평가 소요 시간
- 평가 단계 (자기 → 리더 → 임원 → CEO)

## STEP 2: 평가 폼 간소화

기존: 주관식 20문항 → 시간 오래 걸림, 임원이 기피
변경: 객관식 10문항 + 총평 2줄 → 5분 내 완료

평가 항목 (객관식 5점 척도):
  1. 업무 성과 — 매우우수/우수/보통/미흡/매우미흡
  2. 책임감 — 매우우수/우수/보통/미흡/매우미흡
  3. 소통/협업 — 매우우수/우수/보통/미흡/매우미흡
  4. 전문성 — 매우우수/우수/보통/미흡/매우미흡
  5. 성장 가능성 — 매우우수/우수/보통/미흡/매우미흡
  6. 조직 적합도 — 매우우수/우수/보통/미흡/매우미흡
  7. 근태/태도 — 매우우수/우수/보통/미흡/매우미흡
  8. 리더십 (팀장급) — 매우우수/우수/보통/미흡/매우미흡
  9. 창의성/주도성 — 매우우수/우수/보통/미흡/매우미흡
  10. 종합 추천 — 승진추천/유지/주의관찰/경고

  + 총평 (2줄 이내): [________________]
  + 특이사항 (선택): [________________]

## STEP 3: 원클릭 평가 UX

임원 평가 화면:

┌─────────────────────────────────────────────────┐
│ 📝 1분기 인사평가 — 마케팅팀                      │
│                                                 │
│ 📊 AI 참고 데이터 (자동 표시):                    │
│ 작업 완료율: 87% | 마감 준수: 92% | 긴급업무 리마인드: 2회 │
│ OJT: 90점 | 멘토 평가: 우수 | 특이사항: +5건 -1건 │
│                                                 │
│ 김영석 (대리)     ○○○○○ ○○○○○ ○○○○○ ← 한 줄 클릭 │
│ 박지현 (사원)     ○○○○○ ○○○○○ ○○○○○              │
│ 이수진 (사원)     ○○○○○ ○○○○○ ○○○○○              │
│                                                 │
│ 총평: [                              ]           │
│                                                 │
│ [전체 제출]                                      │
└─────────────────────────────────────────────────┘

한 화면에서 팀 전체를 평가할 수 있는 그리드 뷰.
각 항목을 클릭/탭으로 빠르게 선택.
AI 참고 데이터가 위에 자동 표시되어 근거 기반 평가.

## STEP 4: 1분기 평가 데이터 세팅

강제묵 이사에게 받은 기존 평가 기준을 시스템에 입력:
- 평가 기간 생성 (2026 1분기: 1/1~3/31)
- 평가 대상 직원 자동 설정
- 평가 단계 (자기→리더→임원→CEO) 활성화
- 목표 데이터 세팅 (있으면)

## 주의사항
- 기존 평가 데이터 구조(evaluations/evaluation_items)와 호환
- 기존 AI 리포트 생성 로직이 깨지지 않도록
- 새 간소화 폼은 기존 폼의 "간편 모드"로 추가 (기존 상세 모드도 유지)
```

---

### P-24 [HR] — 리마인드 경고 → 인사평가 감점 연동

```
CEO 긴급 업무의 리마인드 경고 누적 횟수를 인사평가에 자동 반영합니다.

## 테이블

CREATE TABLE reminder_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  period_start date,
  period_end date,
  
  -- 긴급 업무 관련
  total_urgent_assigned integer,       -- 할당된 긴급 업무 수
  total_completed_on_time integer,     -- 기한 내 완료 수
  total_overdue integer,               -- 기한 초과 수
  total_reminders_received integer,    -- 받은 리마인드 총 횟수
  
  -- 감점 계산
  penalty_score float,                 -- 감점 점수 (0~-20)
  -- 계산 로직:
  -- 기한 초과 1건당: -2점
  -- 리마인드 5회 이상 받은 업무 1건당: 추가 -1점
  -- 기한 내 완료 보너스: +0.5점/건 (최대 +5)
  
  -- 인사평가 반영
  evaluation_id uuid,                  -- 해당 분기 평가와 연결
  
  created_at timestamptz DEFAULT now()
);

## 구현

1. 분기 평가 시점에 자동 집계:
   해당 직원에게 할당된 urgent_tasks + task_reminders에서 데이터 수집
   → reminder_penalties에 INSERT

2. 인사평가 AI 리포트에 자동 포함:
   "이 직원은 이번 분기 긴급 업무 5건 중 3건을 기한 내 완료,
    2건은 기한 초과 (평균 2일 초과). 리마인드 총 12회 수신.
    긴급 업무 감점: -3점"

3. 평가 점수에 자동 반영:
   기존 평가 점수 + reminder_penalties.penalty_score = 최종 점수

## 주의사항
- 감점은 "긴급 업무"에만 적용 (일반 업무 미적용)
- 가중치는 관리자가 설정 페이지에서 조정 가능
- 감점 내역은 직원 본인에게도 공개 (투명성)
```

---

### P-25 [HR] — 외부 데이터 마이그레이션 (슬랙/노션/네이버웍스)

```
실제 데이터 기반 테스트를 위해 기존 업무 도구의 데이터를 가져옵니다.

## STEP 1: 데이터 소스 확인

강제묵 이사에게 전달받을 접근 권한:
  - 슬랙 (Slack) — 업무 대화/채널 이력
  - 노션 (Notion) — 프로젝트/문서/위키
  - 네이버 웍스 (Naver Works) — 업무 보고서 5년치

각 소스별 데이터 추출 가능성 확인:
  슬랙: API 연동 가능 (Export 기능)
  노션: API 연동 가능 (Database export)
  네이버 웍스: API 확인 필요 → 불가 시 수작업 또는 로우데이터 요청

## STEP 2: 데이터 정규화

각 소스에서 추출한 데이터를 통일된 포맷으로 변환:
  {
    employee_name: "김영석",
    date: "2025-03-15",
    source: "naver_works",
    content_type: "daily_report",  // 'daily_report' | 'project_update' | 'message'
    content: "오늘 S/S 컬렉션 기획안 작성 완료...",
    metadata: { ... }
  }

## STEP 3: Supabase에 저장

imported_work_data 테이블 (임시):
  id, employee_id, source, content_type, content, original_date, metadata, imported_at

## STEP 4: AI 분석

5년치 업무 보고서를 AI가 직원별로 분석:
  "김영석 — 5년간 업무 보고서 분석:
   주요 업무: 마케팅 기획 (60%), 브랜드 관리 (25%), 이벤트 (15%)
   업무 성향: 기획에 강점, 야근 빈도 높음, 성실한 보고 습관
   성장 추이: 2022년 대비 2025년 업무 범위 200% 확대
   주의 사항: 2024년 하반기 만족도 하락 경향"

결과 → employee_profiles 또는 work_metrics에 저장
→ 직원 통합 프로필(P-19)에 표시
→ 인사평가 AI 리포트에 참고 데이터로 포함

## STEP 5: 마이그레이션 현황 대시보드

관리자 페이지에:
  "데이터 마이그레이션 현황"
  슬랙: 1,200건 가져옴 ✅
  노션: 340건 가져옴 ✅
  네이버 웍스: 5,000건 가져옴 ✅ (또는 "확인 중")
  AI 분석: 28명 / 40명 완료 (70%)

## 주의사항
- 개인정보 포함 데이터 주의 (업무 내용만 추출)
- 네이버 웍스 API 불가 시 수작업 범위 최소화 방안 검토
- 가져온 데이터는 원본 수정 없이 별도 테이블에 저장
```

---

### P-02 수정사항 — 사번 자동 생성

```
v4의 P-02에 추가:

## 사번 자동 생성 로직

규칙: 입사년도(2자리) + 입사월일(4자리) + 당일입사순번(2자리)
예시: 2026년 3월 17일 첫 번째 입사자 → 26031701
     2026년 3월 17일 두 번째 입사자 → 26031702

구현 방법 A: Supabase 트리거

CREATE OR REPLACE FUNCTION generate_employee_number()
RETURNS TRIGGER AS $$
DECLARE
  hire_prefix text;
  seq_num integer;
  new_number text;
BEGIN
  -- 입사일에서 YYMMDD 추출
  hire_prefix := to_char(NEW.hire_date, 'YYMMDD');
  
  -- 같은 날 입사한 직원 수 카운트
  SELECT COUNT(*) + 1 INTO seq_num
  FROM employees
  WHERE to_char(hire_date, 'YYMMDD') = hire_prefix
  AND id != NEW.id;
  
  -- 사번 생성 (YYMMDD + 2자리 순번)
  new_number := hire_prefix || lpad(seq_num::text, 2, '0');
  
  NEW.employee_number := new_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_employee_number
BEFORE INSERT ON employees
FOR EACH ROW
WHEN (NEW.employee_number IS NULL)
EXECUTE FUNCTION generate_employee_number();

구현 방법 B: employee_profiles 테이블에 추가 (기존 employees ALTER 금지 원칙)
  employee_profiles.employee_number TEXT UNIQUE
  → 직원 등록 시 자동 생성

★ 입사일만 입력하면 사번이 자동 부여되도록 합니다.
```

---

### P-29 [WM] 수정 — AI 업무 챗봇 + 감정 케어 AI

```
v4의 P-29에 감정 케어 AI 기능을 추가합니다.

## 추가: 감정 케어 기능

### 업무 재촉 시 적절한 멘트 제안

직원이 다른 직원에게 업무를 재촉할 때:
  AI가 팝업으로 멘트를 제안합니다.

  상황: 김영석이 박지현에게 "디자인 아직이야?" 메시지를 보내려 할 때
  AI 제안: "이런 멘트는 어떨까요?
    '지현님, 디자인 진행 상황이 궁금해서요. 
     혹시 어려운 부분이 있으면 말씀해주세요. 도와드릴게요!'
    또는
    '지현님, 바쁘신 거 알지만 내일까지 가능할까요? 감사합니다 🙏'"

  적용 조건:
    - 같은 업무에 대해 3회 이상 문의 시
    - 기한 초과 업무에 대한 메시지 시
    - 상하 관계 메시지 (임원→직원) 시

### 과부하 감지 + 조율

직원의 할당 업무가 과다할 때:
  AI가 관리자에게 알림:
  "김영석님은 현재 진행중 업무 8건 + 긴급 업무 3건입니다.
   평균 대비 150%의 업무량입니다.
   일부 업무를 다른 담당자에게 재배치하는 것을 권장합니다."
```

---

## 업데이트된 개발 일정

```
Phase 1: 채용+인사+OJT (3주) ← 기존과 동일
  Week 1: P-01~P-05
  Week 2: P-06~P-12
  Week 3: P-13~P-21

Phase 1.5: 긴급 업무+평가 간소화 (1주) ← 신규 삽입
  Day 1-2: P-22 (CEO 긴급 대시보드 + 리마인드) ★최우선
  Day 3:   P-23 (인사평가 UI 간소화 + 1분기 세팅) ★긴급
  Day 4:   P-24 (리마인드→평가 감점 연동)
  Day 5:   P-25 (외부 데이터 마이그레이션 시작)

Phase 2: 업무 연동 (2주)
  Week 5: P-26~P-29
  Week 6: P-30~P-34

Phase 3: 장기 (계획만)
  P-35: 사내 메신저 일원화
```

---

## Action Items (3/17 미팅 기준)

| 담당 | 업무 | 기한 |
|------|------|------|
| 강제묵 이사 | 슬랙/노션/네이버웍스 접근 권한 전달 | 금주 내 |
| 강제묵 이사 | 1분기 인사평가 기준 데이터 전달 | 금주 내 |
| 차주용 | 전달받은 실데이터 마이그레이션 | 출장 전 |
| 차주용 | 사번 부여 로직 수정 | 출장 전 |
| 경영지원팀 | 플랫폼 1차 시범 도입 테스트 | 대표 출장 중 |
| 전원 | 1차 시범 테스트 피드백 | 대표 출장 복귀 후 |
