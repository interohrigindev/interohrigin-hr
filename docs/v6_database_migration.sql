-- =====================================================================
-- INTEROHRIGIN HR Platform v6 — 인사노무 기능 DB 마이그레이션
-- Supabase SQL Editor에서 실행하세요
-- 실행일: 2026.03.24
-- =====================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  1. 연차 관리 (Leave Management)                                │
-- └─────────────────────────────────────────────────────────────────┘

-- 1-1. 연차 관리 마스터 테이블
CREATE TABLE IF NOT EXISTS leave_management (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year integer NOT NULL,

  -- 연차 부여
  total_annual_leave float DEFAULT 0,       -- 총 연차 개수
  child_leave float DEFAULT 0,             -- 자녀 연차
  special_leave float DEFAULT 0,           -- 특별 휴가

  -- 사용 현황
  used_annual float DEFAULT 0,
  used_child float DEFAULT 0,
  used_special float DEFAULT 0,

  -- 입사일 기준 (회계연도 아님)
  hire_date date,                           -- 연차 기산일
  expiry_date date,                         -- 소진 마감일

  -- 연차 촉진
  promotion_sent boolean DEFAULT false,
  promotion_sent_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(employee_id, year)
);

COMMENT ON TABLE leave_management IS '직원별 연도별 연차 관리 (입사일 기준)';

-- 1-2. 연차 신청 테이블
CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type text NOT NULL,                 -- 'annual' | 'child' | 'special' | 'sick' | 'half_am' | 'half_pm'
  start_date date NOT NULL,
  end_date date NOT NULL,
  days float NOT NULL,                      -- 0.5 가능 (반차)
  reason text,
  status text DEFAULT 'pending',            -- 'pending' | 'approved' | 'rejected'
  approved_by uuid REFERENCES employees(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE leave_requests IS '연차/휴가 신청 및 승인 이력';

-- 1-3. 연차 촉진 발송 이력
CREATE TABLE IF NOT EXISTS leave_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sent_via text,                            -- 'email' | 'notification' | 'both'
  sent_at timestamptz DEFAULT now(),
  remaining_days float,                     -- 발송 시점 잔여 연차
  expiry_date date,                         -- 소진 마감일
  acknowledged boolean DEFAULT false
);

COMMENT ON TABLE leave_promotions IS '연차 촉진 알림 발송 이력';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │  2. 근태 관리 (Attendance)                                      │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
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

COMMENT ON TABLE attendance_records IS '일별 출퇴근 기록';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │  3. 전자 결재 (Approval)                                        │
-- └─────────────────────────────────────────────────────────────────┘

-- 3-1. 결재 양식 템플릿
CREATE TABLE IF NOT EXISTS approval_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                       -- '지출결의서', '품의서', '출장신청서' 등
  description text,
  fields jsonb NOT NULL DEFAULT '[]',       -- 양식 필드 정의
  -- fields 예시: [
  --   { "key": "amount", "label": "금액", "type": "number", "required": true },
  --   { "key": "reason", "label": "사유", "type": "text", "required": true },
  --   { "key": "attachment", "label": "첨부파일", "type": "file", "required": false }
  -- ]
  approval_flow jsonb DEFAULT '[]',         -- 결재 라인
  -- approval_flow 예시: [
  --   { "step": 0, "role": "팀장" },
  --   { "step": 1, "role": "이사" },
  --   { "step": 2, "role": "대표" }
  -- ]
  category text,                            -- '지출' | '인사' | '업무' | '기타'
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES employees(id),
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE approval_templates IS '전자 결재 양식 템플릿 (지출결의서, 품의서 등)';

-- 3-2. 결재 신청
CREATE TABLE IF NOT EXISTS approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES approval_templates(id),
  requester_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',         -- 양식 입력 데이터
  attachments jsonb DEFAULT '[]',           -- 첨부파일 URL 목록

  -- 결재 상태
  status text DEFAULT 'pending',            -- 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled'
  current_step integer DEFAULT 0,           -- 현재 결재 단계
  approval_history jsonb DEFAULT '[]',      -- 결재 이력
  -- approval_history 예시: [
  --   { "step": 0, "approver_id": "uuid", "action": "approved", "comment": "...", "at": "..." }
  -- ]

  final_approved_at timestamptz,
  final_approved_by uuid REFERENCES employees(id),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE approval_requests IS '전자 결재 신청 및 승인 이력';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │  4. 증명서 발급 (Certificates)                                  │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  certificate_type text NOT NULL,           -- '재직증명서' | '경력증명서' | '퇴직증명서'
  issued_at timestamptz DEFAULT now(),
  issued_data jsonb,                        -- 증명서에 포함된 데이터 스냅샷
  pdf_url text,                             -- 생성된 PDF URL
  purpose text,                             -- 사용 용도
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE certificates IS '증명서 발급 이력 (재직/경력/퇴직)';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │  5. 교육 관리 (Training)                                        │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
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

COMMENT ON TABLE training_records IS '법정 의무 교육 및 외부 교육 이수 현황';


-- =====================================================================
-- 인덱스 (성능 최적화)
-- =====================================================================

-- 연차 관리
CREATE INDEX IF NOT EXISTS idx_leave_management_employee_year ON leave_management(employee_id, year);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_promotions_employee ON leave_promotions(employee_id);

-- 근태 관리
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);

-- 전자 결재
CREATE INDEX IF NOT EXISTS idx_approval_requests_requester ON approval_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_templates_active ON approval_templates(is_active);

-- 증명서
CREATE INDEX IF NOT EXISTS idx_certificates_employee ON certificates(employee_id);

-- 교육
CREATE INDEX IF NOT EXISTS idx_training_employee_year ON training_records(employee_id, year);
CREATE INDEX IF NOT EXISTS idx_training_name_year ON training_records(training_name, year);


-- =====================================================================
-- RLS (Row Level Security) 활성화
-- =====================================================================

ALTER TABLE leave_management ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- RLS 정책 (Policy)
-- 인증된 사용자는 읽기 가능, 쓰기는 인증된 사용자 허용
-- (실제 권한 제어는 프론트엔드 role 체크로 수행)
-- =====================================================================

-- ─── 연차 관리 ─────────────────────────────────────────────────────

CREATE POLICY "leave_management_select" ON leave_management
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "leave_management_insert" ON leave_management
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "leave_management_update" ON leave_management
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "leave_management_delete" ON leave_management
  FOR DELETE TO authenticated USING (true);

-- ─── 연차 신청 ─────────────────────────────────────────────────────

CREATE POLICY "leave_requests_select" ON leave_requests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "leave_requests_insert" ON leave_requests
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "leave_requests_update" ON leave_requests
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "leave_requests_delete" ON leave_requests
  FOR DELETE TO authenticated USING (true);

-- ─── 연차 촉진 ─────────────────────────────────────────────────────

CREATE POLICY "leave_promotions_select" ON leave_promotions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "leave_promotions_insert" ON leave_promotions
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─── 근태 관리 ─────────────────────────────────────────────────────

CREATE POLICY "attendance_select" ON attendance_records
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "attendance_insert" ON attendance_records
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "attendance_update" ON attendance_records
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "attendance_delete" ON attendance_records
  FOR DELETE TO authenticated USING (true);

-- ─── 결재 양식 ─────────────────────────────────────────────────────

CREATE POLICY "approval_templates_select" ON approval_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "approval_templates_insert" ON approval_templates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "approval_templates_update" ON approval_templates
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "approval_templates_delete" ON approval_templates
  FOR DELETE TO authenticated USING (true);

-- ─── 결재 신청 ─────────────────────────────────────────────────────

CREATE POLICY "approval_requests_select" ON approval_requests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "approval_requests_insert" ON approval_requests
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "approval_requests_update" ON approval_requests
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "approval_requests_delete" ON approval_requests
  FOR DELETE TO authenticated USING (true);

-- ─── 증명서 ────────────────────────────────────────────────────────

CREATE POLICY "certificates_select" ON certificates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "certificates_insert" ON certificates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "certificates_delete" ON certificates
  FOR DELETE TO authenticated USING (true);

-- ─── 교육 관리 ─────────────────────────────────────────────────────

CREATE POLICY "training_select" ON training_records
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "training_insert" ON training_records
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "training_update" ON training_records
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "training_delete" ON training_records
  FOR DELETE TO authenticated USING (true);


-- =====================================================================
-- 기본 결재 양식 템플릿 (샘플 데이터)
-- =====================================================================

INSERT INTO approval_templates (name, description, fields, approval_flow, category, is_active) VALUES
(
  '지출결의서',
  '업무 관련 지출에 대한 결재 양식',
  '[
    {"key": "amount", "label": "금액", "type": "number", "required": true},
    {"key": "purpose", "label": "지출 목적", "type": "text", "required": true},
    {"key": "detail", "label": "상세 내역", "type": "textarea", "required": false},
    {"key": "payment_date", "label": "지출 예정일", "type": "date", "required": true}
  ]'::jsonb,
  '[
    {"step": 0, "role": "팀장"},
    {"step": 1, "role": "이사"},
    {"step": 2, "role": "대표"}
  ]'::jsonb,
  '지출',
  true
),
(
  '품의서',
  '업무 수행을 위한 사전 승인 요청',
  '[
    {"key": "subject", "label": "품의 제목", "type": "text", "required": true},
    {"key": "content", "label": "품의 내용", "type": "textarea", "required": true},
    {"key": "budget", "label": "예상 비용", "type": "number", "required": false},
    {"key": "deadline", "label": "완료 희망일", "type": "date", "required": false}
  ]'::jsonb,
  '[
    {"step": 0, "role": "팀장"},
    {"step": 1, "role": "이사"}
  ]'::jsonb,
  '업무',
  true
),
(
  '출장신청서',
  '국내/해외 출장 사전 승인 신청',
  '[
    {"key": "destination", "label": "출장지", "type": "text", "required": true},
    {"key": "start_date", "label": "출발일", "type": "date", "required": true},
    {"key": "end_date", "label": "복귀일", "type": "date", "required": true},
    {"key": "purpose", "label": "출장 목적", "type": "textarea", "required": true},
    {"key": "estimated_cost", "label": "예상 경비", "type": "number", "required": false}
  ]'::jsonb,
  '[
    {"step": 0, "role": "팀장"},
    {"step": 1, "role": "이사"},
    {"step": 2, "role": "대표"}
  ]'::jsonb,
  '업무',
  true
),
(
  '휴가신청서',
  '연차/특별휴가 사전 신청',
  '[
    {"key": "leave_type", "label": "휴가 유형", "type": "text", "required": true},
    {"key": "start_date", "label": "시작일", "type": "date", "required": true},
    {"key": "end_date", "label": "종료일", "type": "date", "required": true},
    {"key": "days", "label": "일수", "type": "number", "required": true},
    {"key": "reason", "label": "사유", "type": "text", "required": false}
  ]'::jsonb,
  '[
    {"step": 0, "role": "팀장"}
  ]'::jsonb,
  '인사',
  true
);


-- =====================================================================
-- 법정 의무 교육 기본 데이터 생성 (2026년 기준)
-- 모든 재직 직원에 대해 교육 이수 레코드를 초기 생성합니다
-- =====================================================================

-- 성희롱 예방교육
INSERT INTO training_records (employee_id, training_type, training_name, year, completed)
SELECT id, 'mandatory', '성희롱 예방교육', 2026, false
FROM employees
WHERE is_active = true
ON CONFLICT (employee_id, training_name, year) DO NOTHING;

-- 개인정보보호교육
INSERT INTO training_records (employee_id, training_type, training_name, year, completed)
SELECT id, 'mandatory', '개인정보보호교육', 2026, false
FROM employees
WHERE is_active = true
ON CONFLICT (employee_id, training_name, year) DO NOTHING;

-- 산업안전보건교육
INSERT INTO training_records (employee_id, training_type, training_name, year, completed)
SELECT id, 'mandatory', '산업안전보건교육', 2026, false
FROM employees
WHERE is_active = true
ON CONFLICT (employee_id, training_name, year) DO NOTHING;

-- 장애인인식개선교육
INSERT INTO training_records (employee_id, training_type, training_name, year, completed)
SELECT id, 'mandatory', '장애인인식개선교육', 2026, false
FROM employees
WHERE is_active = true
ON CONFLICT (employee_id, training_name, year) DO NOTHING;


-- =====================================================================
-- 재직 직원 연차 데이터 초기 생성 (2026년)
-- 입사일 기준 연차를 자동 계산하여 생성합니다
-- =====================================================================

INSERT INTO leave_management (employee_id, year, total_annual_leave, hire_date, expiry_date)
SELECT
  e.id,
  2026,
  -- 근속 연수에 따른 연차 자동 계산 (근로기준법 기준)
  CASE
    WHEN e.hire_date IS NULL THEN 15
    WHEN EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date)) < 1 THEN
      -- 1년 미만: 월 1개씩 (최대 11개)
      LEAST(GREATEST(EXTRACT(MONTH FROM age(CURRENT_DATE, e.hire_date))::int, 0), 11)
    WHEN EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date)) < 3 THEN 15
    WHEN EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date)) < 5 THEN 16
    WHEN EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date)) < 7 THEN 17
    WHEN EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date)) < 9 THEN 18
    WHEN EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date)) < 11 THEN 19
    ELSE LEAST(15 + FLOOR(EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date)) / 2)::int, 25)
  END,
  e.hire_date,
  -- 소진 마감일: 입사일 기준 연도 + 1년
  CASE
    WHEN e.hire_date IS NOT NULL THEN
      (e.hire_date + INTERVAL '1 year' * (EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date))::int + 1))::date
    ELSE
      ('2026-12-31')::date
  END
FROM employees e
WHERE e.is_active = true
ON CONFLICT (employee_id, year) DO NOTHING;


-- =====================================================================
-- 완료! 테이블 확인
-- =====================================================================

SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name)))
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'leave_management', 'leave_requests', 'leave_promotions',
    'attendance_records',
    'approval_templates', 'approval_requests',
    'certificates',
    'training_records'
  )
ORDER BY table_name;
