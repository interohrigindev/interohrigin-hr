# 인사노무 시스템 아키텍처 — 국내외 솔루션 분석 기반

> **대상**: INTEROHRIGIN (약 40명, 뷰티 커머스)
> **분석 솔루션**: 플렉스(flex), 시프티(Shiftee), 레몬베이스, Workday, BambooHR
> **기술 스택**: React + Supabase (기존 HR 플랫폼 확장)
> **작성일**: 2026.03.19

---

## 1. 국내외 솔루션 분석

### 1-1. 솔루션별 핵심 기능 비교

```
                  플렉스       시프티      레몬베이스   Workday    BambooHR
                  (국내)       (국내)      (국내)      (글로벌)    (글로벌)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
인사정보 관리      ✅ 올인원    ✅ 기본     ❌          ✅ 최강     ✅ 강력
근태 관리         ✅ 강력      ✅ 최강     ❌          ✅          ✅
연차/휴가         ✅ 자동계산   ✅ 자동계산  ❌          ✅          ✅
급여 정산         ✅ 자동      ❌          ❌          ✅          ✅
전자결재          ✅ 워크플로우  ✅ 근태결재  ❌          ✅          ⚠ 약함
전자계약          ✅           ✅          ❌          ✅          ❌
성과 관리         ✅ 리뷰/목표  ⚠ 약함     ✅ 최강     ✅          ⚠ 기본
채용 관리         ✅ 기본      ❌          ❌          ✅          ✅
연말정산          ✅ 자동      ❌          ❌          ✅          ❌
조직도            ✅           ✅          ✅          ✅          ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
월 비용 (40명)    ~40만원      ~20만원     ~30만원     ~200만원    ~60만원
한국법 준수       ✅ 자동반영   ✅ 자동반영  ❌          ❌          ❌
```

### 1-2. 인터오리진에 필요한 기능 추출

```
필수 (즉시 구현):
  ① 근태 관리 — 출퇴근, 연장/야간/휴일 근무, 주 52시간 추적
  ② 연차/휴가 관리 — 근로기준법 자동 계산, 촉진 제도
  ③ 전자결재 — 휴가/경비/업무 승인 결재선
  ④ 직원 인사정보 — 인적사항, 발령 이력, 계약 이력

중요 (단계적 구현):
  ⑤ 급여 정산 — 기본급 + 수당 + 공제 자동 계산
  ⑥ 전자계약 — 근로계약서, 연봉계약서 전자서명
  ⑦ 조직도 — 실시간 조직 구조 시각화

참고 (장기):
  ⑧ 연말정산 — 국세청 연동 (복잡, 장기 과제)
  ⑨ 4대보험 — EDI 연동 (외부 서비스 활용 가능)
```

---

## 2. 전체 시스템 아키텍처

### 2-1. 인사노무 시스템 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    INTEROHRIGIN HR Platform                  │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  기존 모듈    │  │ 인사노무 모듈 │  │  기존 모듈           │ │
│  │             │  │  (이 문서)    │  │                     │ │
│  │ · 채용관리   │  │             │  │ · 업무 마일스톤      │ │
│  │ · AI 분석    │  │ · 근태 관리  │  │ · 프로젝트 보드      │ │
│  │ · OJT/수습   │  │ · 연차/휴가  │  │ · 사내 메신저        │ │
│  │ · 인사평가   │  │ · 전자결재   │  │ · AI ToDo            │ │
│  │ · 사주/MBTI  │  │ · 급여 정산  │  │                     │ │
│  │             │  │ · 전자계약   │  │                     │ │
│  │             │  │ · 조직도     │  │                     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │               │                     │             │
│         └───────────────┼─────────────────────┘             │
│                         │                                   │
│              ┌──────────┴──────────┐                        │
│              │  Supabase (통합 DB)  │                        │
│              │  employees 테이블    │                        │
│              │  (모든 모듈이 공유)   │                        │
│              └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### 2-2. 권한 체계 (Role-Based Access Control)

```
역할 정의 (5단계):

  CEO (대표이사)
  ├── 모든 데이터 열람/수정/삭제
  ├── 전자결재 최종 승인
  ├── 급여 확정
  ├── 인사 발령 승인
  └── 전 직원 근태 조회

  EXECUTIVE (임원/이사)
  ├── 산하 부서 전체 데이터 열람
  ├── 결재 중간 승인
  ├── 인사평가 확정
  ├── 직원 인적사항 열람
  └── 급여 열람 (본인 + 산하)

  LEADER (팀장)
  ├── 팀원 근태/연차 승인 (1차 결재)
  ├── 팀원 근태 현황 조회
  ├── 팀원 인사평가 작성
  ├── 경비 결재 (한도 내)
  └── 팀원 급여 열람 불가 ❌

  EMPLOYEE (일반 직원)
  ├── 본인 근태 기록/조회
  ├── 본인 연차 신청
  ├── 결재 신청 (상신)
  ├── 본인 급여명세서 열람
  └── 타인 급여/인적사항 열람 불가 ❌

  HR_ADMIN (인사담당자)
  ├── 전 직원 근태 관리
  ├── 연차 수동 조정
  ├── 급여 정산 실행
  ├── 인사 발령 처리
  ├── 전자계약 관리
  └── 조직도 관리
```

### 2-3. 전자결재 흐름

```
결재 유형별 기본 결재선:

  ① 연차/반차/조퇴 신청:
     신청자 → 팀장(1차승인) → 인사담당(확인) → 자동완료
     
  ② 연장/휴일근무 신청:
     신청자 → 팀장(1차승인) → 이사(2차승인) → 자동완료
     
  ③ 경비 청구 (50만원 미만):
     신청자 → 팀장(1차승인) → 경영지원(처리) → 자동완료
     
  ④ 경비 청구 (50만원 이상):
     신청자 → 팀장(1차승인) → 이사(2차승인) → 대표(최종) → 경영지원(처리)
     
  ⑤ 인사 발령 (승진/이동/직급변경):
     인사담당(기안) → 이사(검토) → 대표(최종승인) → 자동완료
     
  ⑥ 퇴직 처리:
     직원(사직서) → 팀장(확인) → 이사(확인) → 대표(최종) → 인사담당(처리)

결재 상태:
  draft(임시저장) → submitted(상신) → in_review(검토중) 
  → approved(승인) / rejected(반려) / cancelled(취소)

반려 시:
  반려 사유 필수 입력 → 신청자에게 알림 → 수정 후 재상신 가능

위임 결재:
  결재자 부재 시 → 위임자 지정 가능 (설정에서 관리)
  위임 기간 설정 + 위임 이력 기록
```

---

## 3. 근태 관리 상세 설계

### 3-1. 근로기준법 기반 로직

```
주 52시간 관리:
━━━━━━━━━━━━━
  법정 근로: 주 40시간 (1일 8시간 × 5일)
  연장 한도: 주 12시간 (합의 시)
  합계 상한: 주 52시간
  
  시스템 자동 추적:
    매주 월~일 근로시간 합산
    48시간 도달 시 → 본인 + 팀장에게 경고 알림
    50시간 도달 시 → 본인 + 팀장 + 인사담당에게 경고
    52시간 도달 시 → 추가 근무 신청 차단 + 임원 알림

연장/야간/휴일 수당 자동 계산:
━━━━━━━━━━━━━━━━━━━━━━━━━━
  연장근무 (주 40시간 초과): 통상시급 × 1.5배
  야간근무 (22시~06시):     통상시급 × 1.5배
  휴일근무 (법정 휴일/주휴): 통상시급 × 1.5배
  
  연장+야간 중복: 통상시급 × 2.0배
  휴일+연장 중복: 통상시급 × 2.0배
  휴일+야간 중복: 통상시급 × 2.0배
  
  통상시급 계산:
    월 통상임금 ÷ 209시간 (주 40시간 기준)
```

### 3-2. 연차 자동 계산 로직

```typescript
// 근로기준법 제60조 기반 연차 자동 계산

function calculateAnnualLeave(hireDate: Date, currentDate: Date): number {
  const yearsWorked = getYearsBetween(hireDate, currentDate);
  
  if (yearsWorked < 1) {
    // 1년 미만: 월 개근 시 1일씩, 최대 11일
    const monthsWorked = getMonthsBetween(hireDate, currentDate);
    return Math.min(monthsWorked, 11);
  }
  
  // 1년 이상: 기본 15일
  let baseDays = 15;
  
  // 3년 이상: 매 2년마다 1일 가산
  if (yearsWorked >= 3) {
    const additionalDays = Math.floor((yearsWorked - 1) / 2);
    baseDays += additionalDays;
  }
  
  // 최대 25일 한도
  return Math.min(baseDays, 25);
}

// 연차 발생 기준 (입사일 / 회계연도)
// 회사 설정에서 선택 가능
// 회계연도 기준 시: 중도입사자 비례 계산
//   연차일수 = 15 × (입사일~연말 일수 / 365)
```

### 3-3. 출퇴근 기록 방식

```
인터오리진 40명 기준 최적 방식:

  방법 1: 웹/모바일 버튼 (가장 간단)
    HR 플랫폼 대시보드에 [출근] [퇴근] 버튼
    모바일에서도 가능
    IP 제한 옵션 (사무실 IP에서만 가능)
    GPS 위치 기록 옵션 (외근 직원용)

  방법 2: 자동 기록 (로그인 기반)
    HR 플랫폼 첫 로그인 = 출근
    마지막 활동 = 퇴근 (또는 수동 퇴근)
    
  인터오리진 추천: 방법 1 (명시적 + 간단)
  외근이 많은 영업팀: GPS 옵션 추가
```

---

## 4. Supabase 테이블 설계 (인사노무)

```sql
-- ═══════════════════════════════════
-- 인사노무 테이블 (12개)
-- ═══════════════════════════════════

-- 1. 직원 인사정보 확장 (employee_hr_details)
-- 기존 employees 테이블 ALTER 금지 원칙에 따라 별도 테이블
CREATE TABLE employee_hr_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE,     -- employees FK
  
  -- 인적사항
  resident_number_masked text,          -- 주민번호 뒤 6자리 마스킹 (*****)
  address text,
  emergency_contact jsonb,              -- {name, relation, phone}
  bank_account jsonb,                   -- {bank, account_number, holder}
  
  -- 고용 정보
  employment_type text DEFAULT 'regular', -- 'regular'(정규직) | 'contract'(계약직) | 'part_time' | 'intern'
  contract_start_date date,
  contract_end_date date,               -- 계약직만
  probation_end_date date,              -- 수습 종료일
  
  -- 직급/직위
  position_level text,                  -- 사원/대리/과장/차장/부장/이사/대표
  job_title text,                       -- 실제 직함 (BM, 리더, PD 등)
  
  -- 급여
  base_salary integer,                  -- 기본급 (월)
  annual_salary integer,                -- 연봉
  salary_type text DEFAULT 'monthly',   -- 'monthly' | 'annual'
  
  -- 연차
  annual_leave_basis text DEFAULT 'hire_date', -- 'hire_date'(입사일) | 'fiscal_year'(회계연도)
  annual_leave_total integer,           -- 올해 총 연차일수 (자동 계산)
  annual_leave_used integer DEFAULT 0,  -- 사용한 연차
  annual_leave_remaining integer,       -- 남은 연차 (자동 계산)
  
  -- 근무 설정
  work_schedule text DEFAULT 'standard', -- 'standard'(9-6) | 'flexible' | 'shift'
  weekly_hours integer DEFAULT 40,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. 출퇴근 기록
CREATE TABLE attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  date date NOT NULL,
  
  -- 출퇴근
  clock_in timestamptz,                 -- 출근 시각
  clock_out timestamptz,                -- 퇴근 시각
  clock_in_method text,                 -- 'web' | 'mobile' | 'auto' | 'manual'
  clock_in_ip text,                     -- IP 주소
  clock_in_location jsonb,              -- {lat, lng} GPS
  
  -- 근무 시간 (자동 계산)
  regular_hours float DEFAULT 0,        -- 정규 근로시간
  overtime_hours float DEFAULT 0,       -- 연장 근로시간
  night_hours float DEFAULT 0,          -- 야간 근로시간
  holiday_hours float DEFAULT 0,        -- 휴일 근로시간
  total_hours float DEFAULT 0,          -- 총 근로시간
  
  -- 상태
  status text DEFAULT 'normal',         -- 'normal' | 'late' | 'early_leave' | 'absent' | 'holiday' | 'leave'
  late_minutes integer DEFAULT 0,       -- 지각 분
  note text,                            -- 비고
  
  -- 수정 이력
  is_modified boolean DEFAULT false,
  modified_by uuid,
  modified_reason text,
  
  UNIQUE(employee_id, date),
  created_at timestamptz DEFAULT now()
);

-- 3. 휴가/연차 신청
CREATE TABLE leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  
  -- 휴가 정보
  leave_type text NOT NULL,             -- 'annual'(연차) | 'half_am'(오전반차) | 'half_pm'(오후반차) 
                                        -- | 'sick'(병가) | 'special'(경조사) | 'maternity'(출산)
                                        -- | 'paternity'(육아) | 'official'(공가) | 'unpaid'(무급)
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_count float NOT NULL,            -- 0.5(반차), 1, 2, ... 
  reason text,
  
  -- 결재
  approval_status text DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'cancelled'
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  
  -- 연차 사용 촉진 관련
  is_promoted boolean DEFAULT false,    -- 사용 촉진으로 지정된 연차인지
  
  created_at timestamptz DEFAULT now()
);

-- 4. 전자결재 문서
CREATE TABLE approval_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 문서 정보
  doc_type text NOT NULL,               -- 'leave'(휴가) | 'overtime'(연장근무) | 'expense'(경비)
                                        -- | 'personnel'(인사발령) | 'contract'(계약) | 'resign'(퇴직)
                                        -- | 'general'(일반결재) | 'purchase'(구매) | 'business_trip'(출장)
  doc_number text UNIQUE,               -- 결재 문서번호 (자동 생성: AP-2026-001)
  title text NOT NULL,
  content jsonb NOT NULL,               -- 문서 내용 (유형별 다른 구조)
  attachments jsonb DEFAULT '[]',       -- [{url, name, size}]
  
  -- 신청자
  requester_id uuid NOT NULL,
  department text,
  
  -- 결재 상태
  status text DEFAULT 'draft',          -- 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'cancelled'
  current_step integer DEFAULT 0,       -- 현재 결재 단계
  total_steps integer,                  -- 총 결재 단계
  
  -- 금액 (경비/구매 등)
  amount integer,                       -- 금액 (원)
  
  -- 연관
  linked_leave_id uuid,                 -- 휴가 신청과 연결
  linked_employee_id uuid,              -- 인사 발령 대상
  
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 5. 결재선 (결재 단계별 승인자)
CREATE TABLE approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES approval_documents(id) ON DELETE CASCADE,
  
  step_order integer NOT NULL,          -- 1, 2, 3...
  approver_id uuid NOT NULL,            -- 결재자
  approver_role text,                   -- 'leader' | 'executive' | 'ceo' | 'hr_admin'
  
  -- 결재 결과
  action text DEFAULT 'pending',        -- 'pending' | 'approved' | 'rejected' | 'skipped'
  comment text,                         -- 의견
  acted_at timestamptz,
  
  -- 위임
  is_delegated boolean DEFAULT false,
  original_approver_id uuid,            -- 원래 결재자 (위임 시)
  
  created_at timestamptz DEFAULT now()
);

-- 6. 결재선 템플릿 (유형별 기본 결재선)
CREATE TABLE approval_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL,               -- 문서 유형
  name text NOT NULL,                   -- "연차 신청 결재선"
  
  -- 결재 단계 정의
  steps jsonb NOT NULL,                 -- [{order: 1, role: 'leader', label: '팀장승인'},
                                        --  {order: 2, role: 'hr_admin', label: '인사확인'}]
  
  -- 조건
  condition_field text,                 -- 조건 필드 (예: 'amount')
  condition_operator text,              -- '>' | '<' | '>=' 등
  condition_value text,                 -- '500000' (50만원)
  
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 7. 급여 정산
CREATE TABLE payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  pay_year integer NOT NULL,
  pay_month integer NOT NULL,           -- 1~12
  
  -- 지급 항목
  base_pay integer,                     -- 기본급
  overtime_pay integer DEFAULT 0,       -- 연장근로수당
  night_pay integer DEFAULT 0,          -- 야간근로수당
  holiday_pay integer DEFAULT 0,        -- 휴일근로수당
  bonus integer DEFAULT 0,             -- 상여금
  allowances jsonb DEFAULT '{}',        -- {식대: 100000, 교통비: 50000, ...}
  total_gross integer,                  -- 총 지급액
  
  -- 공제 항목
  income_tax integer DEFAULT 0,         -- 소득세
  local_tax integer DEFAULT 0,          -- 지방소득세
  national_pension integer DEFAULT 0,   -- 국민연금
  health_insurance integer DEFAULT 0,   -- 건강보험
  long_care integer DEFAULT 0,          -- 장기요양
  employment_insurance integer DEFAULT 0, -- 고용보험
  other_deductions jsonb DEFAULT '{}',  -- 기타 공제
  total_deductions integer,             -- 총 공제액
  
  -- 실지급액
  net_pay integer,                      -- 실수령액
  
  -- 근태 연동 데이터
  work_days integer,                    -- 근무일수
  overtime_hours_total float,           -- 연장근무 시간 합계
  leave_days_used float,                -- 사용 연차
  late_count integer,                   -- 지각 횟수
  absent_count integer,                 -- 결근 횟수
  
  -- 상태
  status text DEFAULT 'draft',          -- 'draft' | 'calculated' | 'confirmed' | 'paid'
  confirmed_by uuid,                    -- 급여 확정자 (CEO/인사)
  confirmed_at timestamptz,
  paid_at timestamptz,
  
  UNIQUE(employee_id, pay_year, pay_month),
  created_at timestamptz DEFAULT now()
);

-- 8. 급여 설정 (회사 전체 설정)
CREATE TABLE payroll_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 수당 설정
  meal_allowance integer DEFAULT 200000,       -- 식대 (비과세 한도)
  transportation_allowance integer DEFAULT 0,  -- 교통비
  
  -- 4대보험 요율 (연도별 업데이트)
  national_pension_rate float DEFAULT 0.045,    -- 국민연금 4.5%
  health_insurance_rate float DEFAULT 0.03545,  -- 건강보험 3.545%
  long_care_rate float DEFAULT 0.1295,          -- 장기요양 12.95% (건보의)
  employment_insurance_rate float DEFAULT 0.009, -- 고용보험 0.9%
  
  -- 소득세 (간이세액표 기반 — 별도 로직)
  tax_year integer,
  
  -- 지급일
  pay_day integer DEFAULT 25,           -- 매월 급여 지급일
  
  updated_at timestamptz DEFAULT now()
);

-- 9. 전자계약서
CREATE TABLE electronic_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  
  contract_type text NOT NULL,          -- 'employment'(근로계약) | 'salary'(연봉계약) 
                                        -- | 'nda'(비밀유지) | 'renewal'(갱신)
  title text NOT NULL,
  content text NOT NULL,                -- HTML 또는 Markdown
  
  -- 서명
  company_signed boolean DEFAULT false,
  company_signed_at timestamptz,
  employee_signed boolean DEFAULT false,
  employee_signed_at timestamptz,
  employee_signature_url text,          -- 서명 이미지 URL
  
  -- 계약 기간
  contract_start date,
  contract_end date,                    -- null이면 정규직
  
  -- PDF
  pdf_url text,                         -- 생성된 PDF URL
  
  status text DEFAULT 'draft',          -- 'draft' | 'sent' | 'signed' | 'completed' | 'expired'
  
  created_at timestamptz DEFAULT now()
);

-- 10. 인사 발령 이력
CREATE TABLE personnel_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  
  order_type text NOT NULL,             -- 'hire'(입사) | 'promotion'(승진) | 'transfer'(이동)
                                        -- | 'title_change'(직급변경) | 'salary_change'(연봉변경)
                                        -- | 'leave_of_absence'(휴직) | 'return'(복직) | 'resign'(퇴직)
  effective_date date NOT NULL,
  
  -- 변경 내역
  from_department text,
  to_department text,
  from_position text,
  to_position text,
  from_salary integer,
  to_salary integer,
  
  reason text,
  approval_document_id uuid,            -- 관련 결재 문서
  
  created_at timestamptz DEFAULT now()
);

-- 11. 결재 위임 설정
CREATE TABLE approval_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id uuid NOT NULL,           -- 위임자 (원래 결재자)
  delegate_id uuid NOT NULL,            -- 대리 결재자
  
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,                          -- "출장", "휴가" 등
  
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 12. 주 52시간 추적
CREATE TABLE weekly_hours_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  week_start date NOT NULL,             -- 해당 주 월요일
  week_end date NOT NULL,               -- 해당 주 일요일
  
  regular_hours float DEFAULT 0,
  overtime_hours float DEFAULT 0,
  total_hours float DEFAULT 0,
  
  is_over_48 boolean DEFAULT false,     -- 48시간 초과 경고
  is_over_52 boolean DEFAULT false,     -- 52시간 초과 위반
  
  alert_sent boolean DEFAULT false,     -- 경고 알림 발송 여부
  
  UNIQUE(employee_id, week_start),
  created_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════
-- 트리거 + 자동화
-- ═══════════════════════════════════

-- 출퇴근 기록 시 근무시간 자동 계산
CREATE OR REPLACE FUNCTION calculate_work_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_in IS NOT NULL AND NEW.clock_out IS NOT NULL THEN
    -- 총 근무시간 계산 (점심 1시간 제외)
    NEW.total_hours := EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600 - 1;
    
    -- 정규 8시간 초과분 = 연장
    IF NEW.total_hours > 8 THEN
      NEW.regular_hours := 8;
      NEW.overtime_hours := NEW.total_hours - 8;
    ELSE
      NEW.regular_hours := NEW.total_hours;
      NEW.overtime_hours := 0;
    END IF;
    
    -- 야간 (22시~06시) 계산
    -- (상세 로직은 애플리케이션 레벨에서 처리)
    
    -- 지각 판정 (09:00 기준)
    IF EXTRACT(HOUR FROM NEW.clock_in) >= 9 AND EXTRACT(MINUTE FROM NEW.clock_in) > 0 THEN
      NEW.status := 'late';
      NEW.late_minutes := EXTRACT(EPOCH FROM (NEW.clock_in - (NEW.date + TIME '09:00:00'))) / 60;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_hours
BEFORE INSERT OR UPDATE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION calculate_work_hours();

-- 결재 문서번호 자동 생성
CREATE OR REPLACE FUNCTION generate_doc_number()
RETURNS TRIGGER AS $$
DECLARE
  year_str text;
  seq_num integer;
BEGIN
  year_str := to_char(now(), 'YYYY');
  SELECT COUNT(*) + 1 INTO seq_num
  FROM approval_documents
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now());
  
  NEW.doc_number := 'AP-' || year_str || '-' || lpad(seq_num::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_doc_number
BEFORE INSERT ON approval_documents
FOR EACH ROW WHEN (NEW.doc_number IS NULL)
EXECUTE FUNCTION generate_doc_number();

-- 연차 잔여일수 자동 갱신
CREATE OR REPLACE FUNCTION update_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
    UPDATE employee_hr_details
    SET annual_leave_used = annual_leave_used + NEW.days_count,
        annual_leave_remaining = annual_leave_total - (annual_leave_used + NEW.days_count)
    WHERE employee_id = NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leave_balance
AFTER UPDATE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION update_leave_balance();

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE approval_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE approval_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE leave_requests;
```

---

## 5. 전자결재 UI 흐름

```
결재 신청 (신청자):
━━━━━━━━━━━━━━━━

  [+ 새 결재] 클릭 → 문서 유형 선택:
  ┌──────────────────────────────────────┐
  │  결재 유형 선택                       │
  │                                      │
  │  🏖 연차/반차/조퇴 신청               │
  │  ⏰ 연장/야간/휴일 근무 신청           │
  │  💰 경비 청구                         │
  │  🚗 출장 신청                         │
  │  📋 일반 결재                         │
  │  📝 구매 요청                         │
  └──────────────────────────────────────┘

  → 유형 선택 → 자동 결재선 로드 (수정 가능)
  → 내용 입력 → 첨부파일 → [상신]

결재 처리 (결재자):
━━━━━━━━━━━━━━━━

  알림 (메신저/이메일) → 결재 목록 → 문서 열기
  ┌──────────────────────────────────────┐
  │  📋 연차 신청 (AP-2026-0042)          │
  │                                      │
  │  신청자: 김영석 (마케팅팀 대리)        │
  │  유형: 연차 1일                       │
  │  기간: 2026.03.21 (금)               │
  │  사유: 개인 사유                      │
  │                                      │
  │  현재 연차: 15일 중 3일 사용, 12일 남음 │
  │                                      │
  │  결재선:                              │
  │  ① 김민서 리더 — ⏳ 대기중 (현재)      │
  │  ② 인사담당 — ⏳ 대기중               │
  │                                      │
  │  의견: [                       ]      │
  │                                      │
  │  [✅ 승인]  [❌ 반려]                 │
  └──────────────────────────────────────┘

결재 현황 대시보드:
━━━━━━━━━━━━━━━━

  내가 신청한 결재: 3건 (승인 1, 대기 2)
  내가 결재할 문서: 5건 (긴급 1)
  최근 완료: 최근 10건

  필터: 유형별 / 상태별 / 기간별
```

---

## 6. 인터오리진 맞춤 설정

### 6-1. 조직 구조

```
인터오리진 조직도:
  
  오영근 (CEO/대표이사)
  ├── 강제묵 (이사) — 경영지원
  │   ├── 경영지원팀
  │   │   ├── 인사/총무
  │   │   └── 재무/회계
  │   └── 영업팀
  │       └── 영업 담당
  ├── 김형석 (이사) — 브랜드사업
  │   ├── 브랜드사업본부
  │   │   ├── BM팀 (백지영, 정유리, 이진희, 김푸른, 김윤정)
  │   │   └── 기획팀
  │   └── 디자인팀
  │       └── 디자이너
  └── (기타 부서)

결재선 매핑:
  브랜드팀 직원 → 김민서 리더(1차) → 김형석 이사(2차) → 오영근 대표(최종)
  경영지원 직원 → 팀장(1차) → 강제묵 이사(2차) → 오영근 대표(최종)
```

### 6-2. 근무 설정

```
기본 근무:
  근무시간: 09:00 ~ 18:00 (8시간)
  점심시간: 12:00 ~ 13:00 (1시간)
  주 5일 (월~금)
  
  지각 기준: 09:00 이후 출근
  조퇴 기준: 18:00 이전 퇴근
  
  외근: GPS 기록 + 사유 입력
  재택: 사전 승인 필요 (전자결재)
```

### 6-3. 휴가 종류

```
유급 휴가:
  연차:       근로기준법 자동 계산
  반차:       오전(09~13)/오후(14~18) 0.5일 차감
  생일 반차:  생일 당일 오후 반차 (1년 이상 근속)
  경조사:     결혼 5일, 부모상 5일, 형제상 3일 등
  
무급 휴가:
  무급 휴가:  연차 소진 후 사용 가능
  
특별 휴가:
  출산 휴가:  90일 (법정)
  육아 휴직:  최대 1년 (법정)
  병가:       유급/무급 회사 규정에 따라
```

---

## 7. 기존 HR 플랫폼과의 연동

```
인사노무 데이터가 기존 모듈에 미치는 영향:

  채용관리 → 인사노무:
    합격→입사 시 employee_hr_details 자동 생성
    근로계약서 전자계약 자동 생성
    첫 연차 자동 계산

  인사노무 → 인사평가:
    근태 데이터 (지각/결근/연장근무) → 평가 참고 지표
    연차 사용률 → 워라밸 지표
    주 52시간 초과 여부 → 관리자 리더십 평가

  인사노무 → CEO 긴급 업무:
    긴급 업무 지연 → 근태 기록에 "업무 미이행" 특이사항
    리마인드 횟수 → 인사평가 감점 연동

  인사노무 → 업무 마일스톤:
    출퇴근 기록 → 업무 보고서 자동 연결
    연차/출장 → 프로젝트 일정에 자동 반영 (담당자 부재 표시)

  인사노무 → 메신저:
    결재 알림 → 메신저로 발송
    연차 승인 → 팀 채팅방에 "김영석님 3/21(금) 연차" 자동 공지
```

---

## 8. 바이브코딩 프롬프트 (5단계)

```
기존 DEVPLAN에 추가 (Phase 3 또는 별도 스프린트):

P-HR-01: 인사노무 DB 12개 테이블 + 트리거 + 라우팅 + 메뉴
P-HR-02: 근태 관리 (출퇴근 버튼 + 근무시간 자동 계산 + 주 52시간 추적)
P-HR-03: 연차/휴가 (자동 계산 + 신청 + 캘린더 뷰 + 촉진 제도)
P-HR-04: 전자결재 (결재선 설정 + 문서 유형별 폼 + 승인/반려 + 알림)
P-HR-05: 급여 정산 (근태 연동 자동 계산 + 명세서 + 조직도)

개발 기간: 7~10일
추가 비용: $0 (기존 Supabase)
```

---

## 9. 비용 비교

```
자체 구축 (이 설계) vs 외부 SaaS:

  자체 구축:
    개발비: 1회성 (개발 기간에 포함)
    월 운영: $0 (기존 Supabase 포함)
    커스텀: 100% 자유 (인사평가/채용/메신저와 완전 통합)
    데이터: 자체 보유 (외부 유출 없음)

  플렉스 도입:
    월 비용: ~40만원 (40명 × 1만원)
    커스텀: 제한적 (API 연동은 가능하나 완전 통합 어려움)
    데이터: 플렉스 서버에 저장
    장점: 즉시 사용 가능, 법령 자동 업데이트

  시프티 도입:
    월 비용: ~20만원 (40명 × 5천원)
    커스텀: 근태 특화, 급여/평가는 약함
    장점: 근태 관리 최강, 출입기록 연동

  ★ 인터오리진 추천: 자체 구축
    이유: 이미 HR 플랫폼이 있고, 채용→업무→평가까지
    연결된 데이터 구조에 인사노무를 "추가"하는 것이므로
    외부 SaaS를 별도로 쓰면 데이터가 분리되어 통합 가치가 떨어짐.
    
    급여의 법령 업데이트는 연 1~2회 수동으로 payroll_settings 조정.
    (또는 AI가 법령 변경 시 자동 알림)
```
