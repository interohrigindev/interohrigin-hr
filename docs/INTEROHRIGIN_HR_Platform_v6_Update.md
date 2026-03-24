# INTEROHRIGIN HR Platform — v6 업데이트 (3/24 미팅 반영)

> **기준 미팅**: 2026.03.24 (참석자: 경영지원팀 담당자 / 차주용 대표 / 강제묵 이사 / 다희)
> **이전 버전**: v5 (3/17 미팅 기반)
> **최종 업데이트**: 2026.03.24

---

## 3/24 미팅 회의록 분석

### 회의 개요
- 일시: 2026.03.24 (화) 오전 11:11, 약 31분
- 참석: 경영지원팀 담당자(참석자1), 차주용 대표(참석자2), 강제묵 이사(참석자3), 다희(참석자4)
- 주제: HR 플랫폼 현재 상태 리뷰 + 인사노무 기능 추가 요청 + 시스템 안정성 논의

### 핵심 논의 사항 정리

#### 1. 대시보드/프로젝트 관리 UI 개선 (★긴급)
- **현재 문제**: 통합 대시보드가 한눈에 보이지 않음
- **요청**: Monday.com 스타일로 개선
  - 프로젝트별 진척률(원형 그래프) 표시
  - 담당자별 업무 현황 (진행/막힘/대기 상태)
  - 담당자 업무 과중 여부 파악 가능
  - CEO/관리자/리더가 한눈에 볼 수 있는 뷰
- **참고자료**: Monday.com 매뉴얼/가이드 PDF 전달 예정 (강제묵 이사 → 차주용)

#### 2. 근태 관리 (출퇴근 기록)
- **현재**: 네이버웍스에 근태 관리 기능 없음
- **요청**: 출퇴근 기록 기능 (PC 온/오프 기반 희망)
- **우선순위**: 필수는 아니지만 있으면 좋겠음 (참고/활용 목적)
- **판단**: 초기 개발 시 구조만 잡아두고, 우선순위 낮게 처리

#### 3. 연차 관리 (★최우선)
- **현재**: 엑셀 수기 관리, 네이버웍스에 연차 관리 기능 없음
- **요청 기능**:
  - 직원별 연차 총 개수, 소진 현황, 잔여 연차
  - 자녀 연차 별도 관리
  - 입사 연도 기준 연차 부여 (1년 이내 소진 규칙)
  - CEO/관리자용 연차 현황 대시보드
  - 연차 미사용 시 **연차 촉진 메일/알림** 자동 발송
- **기존 데이터**: 엑셀 파일로 보유 → 업로드/마이그레이션 필요

#### 4. 전자 결재/품의서 (★높음)
- **현재**: 네이버웍스에서 전자 결재 사용 중 (지출결의서, 품의서 등)
- **요청**: HR 플랫폼 내에서 전자 결재 기능 구현
  - 기존 네이버웍스 양식(서식) 그대로 이전
  - 결재 승인 흐름 유지
  - 전 직원 사용 중
- **데이터 이전**: 네이버웍스에서 PDF 또는 양식 파일 다운로드하여 전달
- **참고**: 회계 시스템(위하고)과는 직접 연동 불가 → 결재 완료 후 회계팀이 별도 전표 처리

#### 5. 증명서 발급
- **요청**: 재직증명서 등 각종 증명서를 직원이 직접 발급/출력
- **구현**: 양식 업로드 → 직원이 본인 PC에서 바로 출력 가능

#### 6. 조직도
- **요청**: 조직도 기능 추가
- **우선순위**: 중간

#### 7. 급여 관리
- **현재**: 회계팀(기장)에서 급여 정산 → 엑셀 파일 전달 → 인사팀이 메일로 급여명세서 개별 발송
- **요청**:
  - 급여 데이터 업로드 (엑셀 또는 구글시트 연동)
  - 직원 본인이 계정으로 급여명세서 조회/출력
  - 급여대장 관리
- **우선순위**: 중간 (급여 정산 자체는 외부 회계 시스템 유지)

#### 8. 교육 관리
- **현재**: 법정 의무 교육 수료증을 노션에서 수기 체크/관리
- **요청**:
  - 법정 의무 교육 이수 현황 관리
  - 수료증 업로드 기능 (모바일에서도 가능)
  - 직원별 교육 이수 여부 한눈에 확인
  - 외부 교육 관리
- **우선순위**: 중간

#### 9. 전자 계약
- **현재**: 글로사인(GloSign) 사용
- **요청**: HR 플랫폼 내 전자 계약 기능 (고용계약 등)
- **우선순위**: 낮음 (장기)

#### 10. 기존 엑셀 데이터 마이그레이션
- **대상**: 연장근로 관리대장, 연차 관리 등 기존 엑셀 파일
- **요청**: 기존 데이터를 시스템에 업로드/전산화
- **참고**: 과거 기록 전부 입력 가능 여부 확인 필요 (최소 2026년 1월부터라도)

#### 11. 데이터 보관 기간
- **현재**: 데이터베이스 1년 설정 추정
- **요청**: 최소 2년 이상 보관 (퇴사자 데이터도 열람 가능)

#### 12. 모바일 최적화 (★높음)
- **현재**: 모바일 접속 가능하나 최적화 안 됨 (2~3% 부족)
- **요청**: 모바일 반응형 개선 (임원진 외근 빈번 → 모바일 사용 필수)

#### 13. 시스템 안정성 + 유료 전환 (★긴급)
- **현재 문제**:
  - Supabase 무료 플랜 → 백업 없음, 장애 시 데이터 전체 소실 위험
  - 기능 증가로 시스템 과부하 우려
- **결정 사항**:
  - Supabase Pro 유료 전환 필요 (~$25/월)
  - 무거운 기능(메신저, 채용관리) **모듈 분리** → 별도 앱/링크로 운영
  - 데이터베이스는 공유하되 애플리케이션 분리

#### 14. 모듈화 전략 (★중요 구조 변경)
- **분리 대상**:
  - 메신저 → 분리 (실시간 통신이 시스템 전체에 영향) → 당분간 슬랙 유지
  - 채용 관리 → 별도 모듈로 분리 (기능이 무거움)
- **유지**: 인사관리, 근태, 연차, 결재, 평가 등 → 메인 HR 플랫폼
- **원칙**: 데이터베이스는 하나, 앱(프론트엔드)만 분리

#### 15. 프로젝트 관리 소통 방식
- **결정**: HR 플랫폼 내 프로젝트 관리 기능을 소통 채널로 활용
  - 파일 업로드 기능 추가 (이미지/문서)
  - 작업(Task) 추가 → 완료 처리 흐름
  - 블로그 에디터 스타일로 자유롭게 작성 가능하도록 개선

#### 16. 비밀번호/계정 관리
- **해결 완료**: 직원 본인이 비밀번호 변경 가능하도록 구현됨
- **운영**: 초기 임시 비밀번호 안내 → 본인 변경

### 다음 단계 (Action Items)

| 담당 | 업무 | 기한 |
|------|------|------|
| 경영지원팀 | 채용 공고 테스트 등록 | 3/26(목) 전 |
| 경영지원팀 | 사전 질의서 작성 테스트 | 3/26(목) 전 |
| 경영지원팀 | 인재상 설정 테스트 | 3/26(목) 전 |
| 경영지원팀 | 네이버웍스 전자결재 양식 PDF 다운로드 전달 | 금주 내 |
| 경영지원팀 | 연차/연장근로 엑셀 파일 전달 | 금주 내 |
| 강제묵 이사 | Monday.com 매뉴얼/가이드 전달 | 금주 내 |
| 차주용 | 프로젝트 관리 UI 업데이트 (Monday.com 스타일) | 3/26(목) 전 |
| 차주용 | 프로젝트 관리에 파일 업로드 기능 추가 | 3/26(목) 전 |
| 차주용 | 인사노무 기능(근태/연차/결재) 개발 계획 수립 | 이번 주 |
| 차주용 | 모듈 분리 작업 (메신저/채용 분리) | 이번 주 |
| 전원 | 3/26(목) 모의 테스트 (채용/면접 프로세스) | 3/26(목) |
| 전원 | 4시 채널 미팅 후 4층 회의실 (약 50분) | 3/24 오후 |

---

## v5 대비 변경점

### 우선순위 재조정

v5까지의 개발 우선순위에서 인사노무 기능이 **실무 긴급 요청**으로 추가됨.

```
★긴급(즉시): 
  - 대시보드 UI 개선 (Monday.com 스타일)
  - Supabase 유료 전환 + 백업
  - 모듈 분리 (메신저/채용관리)

★최우선(이번 주):
  - 연차 관리 시스템
  - 프로젝트 관리 파일 업로드

★높음(1~2주 내):
  - 전자 결재/품의서
  - 모바일 반응형 최적화
  
중간(2~3주 내):
  - 근태 관리 (출퇴근)
  - 증명서 발급
  - 조직도
  - 급여 관리 (명세서 조회)
  - 교육 관리

낮음(장기):
  - 전자 계약 (글로사인 대체)
  - 급여 정산 자동화
```

### 신규 프롬프트 추가: 6개 (P-NEW-06 ~ P-NEW-11)

v5의 35단계에 6개 추가 → **총 41단계**

```
기존 Phase 1 (P-01~P-21): 유지
기존 Phase 1.5 (P-22~P-25): 유지

신규 삽입 (Phase 1.7 — 인사노무 기능):
  P-26★  연차 관리 시스템 ← 최우선
  P-27   근태 관리 (출퇴근 기록) 
  P-28★  전자 결재/품의서 시스템 ← 높음
  P-29   증명서 발급 + 조직도
  P-30   급여 관리 (명세서 조회)
  P-31   교육 관리 (법정 의무 교육 + 외부 교육)

기존 Phase 2 (업무 연동): P-32~P-41로 넘버 변경
  P-32 [SYS] 모듈 분리 (메신저/채용 → 별도 앱)
  P-33 [UI]  대시보드 UI 개선 (Monday.com 스타일) ← 별도 수행
  P-34 [WM]  work-milestone 구조 파악
  P-35 [WM]  AI ToDo 자동 생성
  P-36 [WM]  일일 업무 보고서 고도화
  P-37 [WM]  AI 업무 챗봇 + 감정 케어 AI
  P-38 [HR]  업무 데이터 동기화 + 자기평가 객관화
  P-39 [HR]  AI 평가 리포트 통합
  P-40 [HR]  퇴사 관리
  P-41 [HR+WM] 전체 통합 테스트 + 배포
```

### DB 테이블 추가: 8개 신규

```
v5의 29개 + 8개 = 총 37개 신규 테이블

추가:
  attendance_records    — 출퇴근 기록 (체크인/체크아웃)
  leave_management      — 연차 관리 (부여/소진/잔여)
  leave_requests        — 연차 신청/승인
  leave_promotions      — 연차 촉진 발송 이력
  approval_templates    — 전자 결재 양식 템플릿
  approval_requests     — 전자 결재 신청/승인
  certificates          — 증명서 발급 이력
  training_records      — 교육 이수 현황 + 수료증
```

---

## 신규 프롬프트 상세

---

### P-26 [HR] — 연차 관리 시스템 ★최우선★

```
네이버웍스에 없던 연차 관리 기능을 HR 플랫폼에 구현합니다.

## STEP 1: 테이블 생성

CREATE TABLE leave_management (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  year integer NOT NULL,                    -- 적용 연도
  
  -- 연차 부여
  total_annual_leave float DEFAULT 0,       -- 총 연차 개수
  child_leave float DEFAULT 0,              -- 자녀 연차
  special_leave float DEFAULT 0,            -- 특별 휴가
  
  -- 사용 현황
  used_annual float DEFAULT 0,
  used_child float DEFAULT 0,
  used_special float DEFAULT 0,
  
  -- 계산
  remaining_annual float GENERATED ALWAYS AS (total_annual_leave - used_annual) STORED,
  remaining_child float GENERATED ALWAYS AS (child_leave - used_child) STORED,
  
  -- 입사일 기준
  hire_date date,                           -- 연차 기산일
  expiry_date date,                         -- 소진 마감일 (입사일 + 1년)
  
  -- 연차 촉진
  promotion_sent boolean DEFAULT false,     -- 촉진 메일 발송 여부
  promotion_sent_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, year)
);

CREATE TABLE leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  leave_type text NOT NULL,                 -- 'annual' | 'child' | 'special' | 'sick'
  start_date date NOT NULL,
  end_date date NOT NULL,
  days float NOT NULL,                      -- 0.5 가능 (반차)
  reason text,
  status text DEFAULT 'pending',            -- 'pending' | 'approved' | 'rejected'
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE leave_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  sent_via text,                            -- 'email' | 'notification' | 'both'
  sent_at timestamptz DEFAULT now(),
  remaining_days float,                     -- 발송 시점 잔여 연차
  expiry_date date,                         -- 소진 마감일
  acknowledged boolean DEFAULT false
);

## STEP 2: 연차 관리 UI

### 관리자용 대시보드
URL: /admin/leave

┌─────────────────────────────────────────────────────┐
│  📅 연차 현황 대시보드                    2026년      │
│                                                     │
│  전체 직원: 40명 | 평균 소진율: 62% | 미사용 경고: 8명 │
│                                                     │
│  이름      | 총연차 | 사용 | 잔여 | 소진율 | 마감일    │
│  ─────────────────────────────────────────────────  │
│  김영석    | 15    | 10  | 5   | 67%  | 26.06.01   │
│  박지현    | 11    | 3   | 8   | 27%  ⚠ | 26.09.15 │
│  이수진    | 15    | 14  | 1   | 93%  ✅ | 26.03.20 │
│  ...                                                │
│                                                     │
│  [연차 촉진 메일 일괄 발송]  [엑셀 다운로드]           │
└─────────────────────────────────────────────────────┘

### 직원용 내 연차
URL: /my/leave

  내 연차 현황:
    총 연차: 15일 | 사용: 10일 | 잔여: 5일
    자녀 연차: 3일 | 사용: 1일 | 잔여: 2일
    소진 마감: 2026.06.01 (D-68)
  
  [연차 신청]
    유형: 연차/반차/자녀연차/특별휴가
    기간: 시작일 ~ 종료일
    사유: (선택)
    [신청]

## STEP 3: 연차 촉진 알림

자동 로직:
  1. 소진 마감일 3개월 전: 잔여 연차 50% 이상 → 1차 안내
  2. 소진 마감일 1개월 전: 잔여 연차 30% 이상 → 2차 촉진
  3. 소진 마감일 2주 전: 잔여 연차 있으면 → 3차 강력 촉진

발송 방식: 이메일 + 플랫폼 내 알림
발송 이력: leave_promotions 테이블에 기록

## STEP 4: 기존 엑셀 데이터 마이그레이션

경영지원팀에서 제공하는 연차 관리 엑셀 파일:
  - 파일 업로드 → 파싱 → leave_management 테이블에 INSERT
  - 최소 2026년 1월 데이터부터 (가능하면 이전 연도도)

## 주의사항
- 입사 연도 기준 연차 부여 (회계연도 기준 아님)
- 반차(0.5일) 지원
- 연차 소진율은 CEO 대시보드에도 표시
```

---

### P-27 [HR] — 근태 관리 (출퇴근 기록)

```
출퇴근 기록을 관리합니다. 필수는 아니지만 구조를 잡아둡니다.

## 테이블

CREATE TABLE attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  date date NOT NULL,
  check_in timestamptz,
  check_out timestamptz,
  work_hours float,                         -- 자동 계산
  overtime_hours float DEFAULT 0,
  status text DEFAULT 'normal',             -- 'normal' | 'late' | 'early_leave' | 'absent' | 'holiday'
  note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, date)
);

## 기능
- 출근/퇴근 버튼 (웹 + 모바일)
- PC 접속 기반은 장기 목표, 우선 수동 체크
- 관리자: 전 직원 출근 현황 한눈에 확인
- 연장근로 자동 계산
- 기존 엑셀(연장근로 관리대장) 데이터 업로드

## 우선순위: 중간 (구조만 먼저 생성, UI는 후순위)
```

---

### P-28 [HR] — 전자 결재/품의서 시스템 ★높음★

```
네이버웍스의 전자 결재 기능을 HR 플랫폼으로 이전합니다.

## STEP 1: 테이블 생성

CREATE TABLE approval_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                       -- '지출결의서', '품의서', '출장신청서' 등
  description text,
  fields jsonb NOT NULL,                    -- 양식 필드 정의
  -- fields 예시: [
  --   { "name": "금액", "type": "number", "required": true },
  --   { "name": "사유", "type": "text", "required": true },
  --   { "name": "첨부파일", "type": "file", "required": false }
  -- ]
  approval_flow jsonb,                      -- 결재 라인
  -- approval_flow 예시: ["팀장", "이사", "대표"]
  category text,                            -- '지출' | '인사' | '업무' | '기타'
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES approval_templates(id),
  requester_id uuid NOT NULL,               -- 신청자
  title text NOT NULL,
  data jsonb NOT NULL,                      -- 양식 데이터
  attachments jsonb,                        -- 첨부파일 URL 목록
  
  -- 결재 상태
  status text DEFAULT 'pending',            -- 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled'
  current_step integer DEFAULT 0,           -- 현재 결재 단계
  approval_history jsonb DEFAULT '[]',      -- 결재 이력
  -- approval_history 예시: [
  --   { "step": 0, "approver_id": "...", "action": "approved", "comment": "...", "at": "..." }
  -- ]
  
  final_approved_at timestamptz,
  final_approved_by uuid,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

## STEP 2: 양식 관리 UI

관리자:
  /admin/approval/templates → 양식 목록 + 신규 생성
  
  양식 생성:
    이름, 카테고리, 필드 구성 (드래그&드롭 빌더 또는 JSON)
    결재 라인 설정 (팀장 → 이사 → 대표)
  
  네이버웍스 양식 이전:
    PDF 참고하여 동일한 필드 구성으로 템플릿 생성

## STEP 3: 결재 신청 + 승인 흐름

직원:
  /approval/new → 양식 선택 → 작성 → 제출
  /approval/my → 내 신청 목록 + 상태 확인

결재자:
  /approval/pending → 결재 대기 목록
  각 건 클릭 → 내용 확인 → 승인/반려 + 코멘트
  승인 시 다음 결재자에게 알림

## STEP 4: PDF 출력

결재 완료된 건 → PDF 출력/다운로드 가능
인쇄 기능 포함

## 주의사항
- 네이버웍스 기존 양식과 최대한 동일하게
- 결재 서식 설명 포함 (직원 혼선 방지)
- 모바일에서도 결재 가능
- 회계 시스템(위하고)과는 직접 연동 불가 → 결재 완료 후 회계팀 별도 처리
```

---

### P-29 [HR] — 증명서 발급 + 조직도

```
## 증명서 발급

CREATE TABLE certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  certificate_type text NOT NULL,           -- '재직증명서' | '경력증명서' | '퇴직증명서'
  issued_at timestamptz DEFAULT now(),
  issued_data jsonb,                        -- 증명서에 포함된 데이터 스냅샷
  pdf_url text,                             -- 생성된 PDF URL
  created_at timestamptz DEFAULT now()
);

기능:
  직원 본인이 /my/certificates 에서:
    - 증명서 종류 선택 → 즉시 PDF 생성 → 다운로드/인쇄
    - 인사팀 방문 불필요
  
  관리자:
    - 양식(품위) 업로드/관리
    - 발급 이력 조회

## 조직도

/admin/organization → 트리 형태 조직도
  - 부서/팀 구조
  - 직원 사진 + 이름 + 직급
  - 클릭 시 직원 프로필로 이동
  - 데이터: employees 테이블의 department, position 활용
```

---

### P-30 [HR] — 급여 관리 (명세서 조회)

```
## 기능 범위

급여 "정산"은 외부 회계 시스템에서 처리.
HR 플랫폼에서는 급여 데이터 업로드 + 직원 조회만 담당.

## 흐름

1. 회계팀/기장에서 월별 급여 데이터 엑셀 전달
2. 관리자가 엑셀 업로드 (또는 구글시트 연동)
3. 시스템이 파싱하여 직원별 급여 데이터 저장
4. 직원은 본인 계정으로 급여명세서 조회/출력

## UI

관리자: /admin/payroll → 월별 급여 업로드 + 현황
직원: /my/payroll → 내 급여명세서 목록 → 상세 → PDF 출력

## 우선순위: 중간
```

---

### P-31 [HR] — 교육 관리

```
## 테이블

CREATE TABLE training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  training_type text NOT NULL,              -- 'mandatory' | 'external' | 'internal'
  training_name text NOT NULL,              -- '성희롱 예방교육', '개인정보보호교육' 등
  year integer NOT NULL,
  completed boolean DEFAULT false,
  completed_at date,
  certificate_url text,                     -- 수료증 파일 URL
  uploaded_at timestamptz,
  note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, training_name, year)
);

## 기능

관리자:
  /admin/training → 법정 의무 교육 목록 관리
  전 직원 이수 현황 한눈에 확인:
    성희롱 예방교육: 38/40명 완료 (95%) ⚠ 미완료: 김OO, 박OO
    개인정보보호교육: 40/40명 완료 (100%) ✅
  미이수자에게 알림 발송

직원:
  /my/training → 내 교육 현황
  수료증 업로드 (모바일 카메라 촬영 → 바로 업로드)
  교육 링크 바로가기 (외부 사이트)

## 우선순위: 중간
```

---

### P-32 [SYS] — 모듈 분리

```
시스템 안정성을 위해 무거운 기능을 별도 앱으로 분리합니다.

## 분리 대상

1. 메신저 → 분리 (실시간 WebSocket이 메인 앱 안정성 위협)
   - 당분간 슬랙 유지
   - 장기적으로 별도 앱 개발 (Phase 3)

2. 채용 관리 → 별도 앱 (기능이 무겁고 데이터 집약적)
   - URL: recruitment.interohrigin-hr.pages.dev (예시)
   - 데이터베이스 공유 (같은 Supabase)
   - 메인 HR 앱에서는 링크로 연결

## 메인 HR 플랫폼 (경량화)
  - 인사 관리 (직원 정보, 프로필)
  - 근태 관리
  - 연차 관리
  - 전자 결재
  - 급여 관리
  - 교육 관리
  - 인사 평가
  - CEO 긴급 대시보드
  - 프로젝트 관리

## 주의사항
- 기존 코드 최소 변경
- 라우팅 분리만 수행 (DB/API 레이어 공유)
- 사용자 인증은 동일 (SSO 또는 같은 Supabase Auth)
```

---

### P-33 [UI] — 대시보드 UI 개선 (Monday.com 스타일)

```
Monday.com을 참고하여 통합 대시보드를 전면 개선합니다.

## 참고자료
강제묵 이사가 전달하는 Monday.com 매뉴얼/가이드 PDF

## 개선 방향

### 프로젝트 관리 대시보드
  - 프로젝트별 진척률 원형 그래프
  - 담당자별 업무 현황 (진행/막힘/대기)
  - 담당자 업무 과중 여부 시각화
  - 칸반/갠트/타임라인 뷰 선택

### CEO/관리자 대시보드
  - 전체 직원 업무 현황 한눈에
  - 긴급 업무 Top 10 (기존 P-22)
  - 연차 소진율 위젯
  - 근태 현황 위젯
  - 결재 대기 건수

### 프로젝트 상세
  - 파일 업로드 기능 (이미지/문서)
  - 블로그 에디터 스타일 작성
  - 작업 추가 → 진행 → 완료 흐름
  - 코멘트/피드백

## 주의사항
- Monday.com의 기능 1:1 복제가 아닌 핵심 UX만 참고
- 기존 데이터 구조 유지하면서 UI 레이어만 개선
```

---

## 업데이트된 개발 일정

```
Phase 1: 채용+인사+OJT (3주) ← 기존과 동일
  Week 1: P-01~P-05
  Week 2: P-06~P-12
  Week 3: P-13~P-21

Phase 1.5: 긴급 업무+평가 간소화 (1주) ← v5
  Day 1-2: P-22 (CEO 긴급 대시보드 + 리마인드)
  Day 3:   P-23 (인사평가 UI 간소화 + 1분기 세팅)
  Day 4:   P-24 (리마인드→평가 감점 연동)
  Day 5:   P-25 (외부 데이터 마이그레이션)

Phase 1.7: 인사노무 기능 (2주) ← 3/24 신규
  Week 5-Day 1~3: P-26 (연차 관리) ★최우선
  Week 5-Day 4~5: P-27 (근태 관리)
  Week 6-Day 1~3: P-28 (전자 결재) ★높음
  Week 6-Day 4:   P-29 (증명서 + 조직도)
  Week 6-Day 5:   P-30~P-31 (급여/교육)

Phase 2: 시스템 + 업무 연동 (2주)
  Week 7: P-32~P-33 (모듈 분리 + 대시보드 개선)
  Week 7: P-34~P-37 (work-milestone)
  Week 8: P-38~P-41 (인사평가 연동 + 테스트)
```

---

## 비용 업데이트

| 항목 | 월 비용 | 비고 |
|------|--------|------|
| Supabase Pro | $25 | ★유료 전환 필수 (백업+안정성) |
| Gemini API | ~$17 | |
| Whisper API (선택) | ~$5 | |
| Cloudflare Pages (메인) | $0 | |
| Cloudflare Pages (채용 모듈) | $0 | 분리 시 추가 |
| **합계** | **~$47 (₩65,000)** | |

---

## 실행 규칙 (v6 추가)

```
✅ v6 추가 규칙:
  - 모듈 분리 시 데이터베이스는 공유, 프론트엔드만 분리
  - 네이버웍스 양식 이전 시 기존 필드 구조 최대한 유지
  - 연차는 입사일 기준 (회계연도 아님)
  - 전자 결재는 PDF 출력 필수
  - 모바일 반응형은 모든 신규 페이지에 기본 적용
  - 기존 엑셀 데이터 업로드 시 검증 로직 포함
  - 데이터 보관 기간 최소 2년 설정

기존 규칙 유지:
  - 기존 테이블 READ ONLY (ALTER 금지)
  - AI는 보조자 역할
  - 민감 정보 임원 외 비공개
```

---

*이 문서는 2026.03.24 미팅 내용을 반영한 INTEROHRIGIN HR Platform v6 업데이트입니다.*
*인사노무 기능(연차/근태/결재/증명서/급여/교육)이 신규 추가되었습니다.*
