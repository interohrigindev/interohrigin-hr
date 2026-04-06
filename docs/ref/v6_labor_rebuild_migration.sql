-- =====================================================================
-- INTEROHRIGIN HR Platform — 인사노무 리빌딩 마이그레이션
-- 기반: INTEROHRIGIN_HR_Labor_Architecture.md (12개 테이블 + 트리거)
-- Supabase SQL Editor에서 실행
-- =====================================================================

-- ★ 주의: 기존 v6 테이블이 있으면 DROP 후 재생성합니다
-- 기존 데이터가 있다면 백업 후 실행하세요

-- ═══════════════════════════════════
-- 1. 기존 테이블 정리 (안전하게)
-- ═══════════════════════════════════

DROP TABLE IF EXISTS weekly_hours_tracking CASCADE;
DROP TABLE IF EXISTS approval_delegations CASCADE;
DROP TABLE IF EXISTS personnel_orders CASCADE;
DROP TABLE IF EXISTS electronic_contracts CASCADE;
DROP TABLE IF EXISTS payroll CASCADE;
DROP TABLE IF EXISTS payroll_settings CASCADE;
DROP TABLE IF EXISTS approval_steps CASCADE;
DROP TABLE IF EXISTS approval_documents CASCADE;
DROP TABLE IF EXISTS leave_promotions CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS leave_management CASCADE;
DROP TABLE IF EXISTS attendance_records CASCADE;
DROP TABLE IF EXISTS approval_requests CASCADE;
DROP TABLE IF EXISTS approval_templates CASCADE;
DROP TABLE IF EXISTS certificates CASCADE;
DROP TABLE IF EXISTS training_records CASCADE;
DROP TABLE IF EXISTS employee_hr_details CASCADE;

-- ═══════════════════════════════════
-- 2. 인사노무 테이블 12개 생성
-- ═══════════════════════════════════

-- ─── 1) 직원 인사정보 확장 ─────────────────────────────
CREATE TABLE employee_hr_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,

  -- 인적사항
  resident_number_masked text,
  address text,
  emergency_contact jsonb,
  bank_account jsonb,

  -- 고용 정보
  employment_type text DEFAULT 'regular',
  contract_start_date date,
  contract_end_date date,
  probation_end_date date,

  -- 직급/직위
  position_level text,
  job_title text,

  -- 급여
  base_salary integer,
  annual_salary integer,
  salary_type text DEFAULT 'monthly',

  -- 연차 설정
  annual_leave_basis text DEFAULT 'hire_date',
  annual_leave_total float DEFAULT 0,
  annual_leave_used float DEFAULT 0,
  annual_leave_remaining float DEFAULT 0,

  -- 근무 설정
  work_schedule text DEFAULT 'standard',
  weekly_hours integer DEFAULT 40,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── 2) 출퇴근 기록 ──────────────────────────────────
CREATE TABLE attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,

  -- 출퇴근
  clock_in timestamptz,
  clock_out timestamptz,
  clock_in_method text DEFAULT 'web',
  clock_in_ip text,
  clock_in_location jsonb,

  -- 근무 시간 (자동 계산)
  regular_hours float DEFAULT 0,
  overtime_hours float DEFAULT 0,
  night_hours float DEFAULT 0,
  holiday_hours float DEFAULT 0,
  total_hours float DEFAULT 0,

  -- 상태
  status text DEFAULT 'normal',
  late_minutes integer DEFAULT 0,
  note text,

  -- 수정 이력
  is_modified boolean DEFAULT false,
  modified_by uuid,
  modified_reason text,

  UNIQUE(employee_id, date),
  created_at timestamptz DEFAULT now()
);

-- ─── 3) 휴가/연차 신청 ───────────────────────────────
CREATE TABLE leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  leave_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_count float NOT NULL,
  reason text,

  -- 결재
  approval_status text DEFAULT 'pending',
  current_step integer DEFAULT 0,
  approval_line jsonb DEFAULT '[]',
  approved_by uuid REFERENCES employees(id),
  approved_at timestamptz,
  rejection_reason text,

  -- 촉진 관련
  is_promoted boolean DEFAULT false,

  created_at timestamptz DEFAULT now()
);

-- ─── 4) 전자결재 문서 ────────────────────────────────
CREATE TABLE approval_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  doc_type text NOT NULL,
  doc_number text UNIQUE,
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',
  attachments jsonb DEFAULT '[]',

  requester_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  department text,

  status text DEFAULT 'draft',
  current_step integer DEFAULT 0,
  total_steps integer DEFAULT 0,

  amount integer,
  linked_leave_id uuid,
  linked_employee_id uuid,

  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ─── 5) 결재선 (단계별 승인자) ───────────────────────
CREATE TABLE approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES approval_documents(id) ON DELETE CASCADE,

  step_order integer NOT NULL,
  approver_id uuid NOT NULL REFERENCES employees(id),
  approver_role text,

  action text DEFAULT 'pending',
  comment text,
  acted_at timestamptz,

  is_delegated boolean DEFAULT false,
  original_approver_id uuid,

  created_at timestamptz DEFAULT now()
);

-- ─── 6) 결재선 템플릿 ────────────────────────────────
CREATE TABLE approval_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL,
  name text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]',

  condition_field text,
  condition_operator text,
  condition_value text,

  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ─── 7) 급여 정산 ────────────────────────────────────
CREATE TABLE payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pay_year integer NOT NULL,
  pay_month integer NOT NULL,

  base_pay integer DEFAULT 0,
  overtime_pay integer DEFAULT 0,
  night_pay integer DEFAULT 0,
  holiday_pay integer DEFAULT 0,
  bonus integer DEFAULT 0,
  allowances jsonb DEFAULT '{}',
  total_gross integer DEFAULT 0,

  income_tax integer DEFAULT 0,
  local_tax integer DEFAULT 0,
  national_pension integer DEFAULT 0,
  health_insurance integer DEFAULT 0,
  long_care integer DEFAULT 0,
  employment_insurance integer DEFAULT 0,
  other_deductions jsonb DEFAULT '{}',
  total_deductions integer DEFAULT 0,

  net_pay integer DEFAULT 0,

  work_days integer DEFAULT 0,
  overtime_hours_total float DEFAULT 0,
  leave_days_used float DEFAULT 0,
  late_count integer DEFAULT 0,
  absent_count integer DEFAULT 0,

  status text DEFAULT 'draft',
  confirmed_by uuid,
  confirmed_at timestamptz,
  paid_at timestamptz,

  UNIQUE(employee_id, pay_year, pay_month),
  created_at timestamptz DEFAULT now()
);

-- ─── 8) 급여 설정 ────────────────────────────────────
CREATE TABLE payroll_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_allowance integer DEFAULT 200000,
  transportation_allowance integer DEFAULT 0,
  national_pension_rate float DEFAULT 0.045,
  health_insurance_rate float DEFAULT 0.03545,
  long_care_rate float DEFAULT 0.1295,
  employment_insurance_rate float DEFAULT 0.009,
  tax_year integer DEFAULT 2026,
  pay_day integer DEFAULT 25,
  updated_at timestamptz DEFAULT now()
);

-- ─── 9) 전자계약서 ───────────────────────────────────
CREATE TABLE electronic_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,

  company_signed boolean DEFAULT false,
  company_signed_at timestamptz,
  employee_signed boolean DEFAULT false,
  employee_signed_at timestamptz,
  employee_signature_url text,

  contract_start date,
  contract_end date,
  pdf_url text,
  status text DEFAULT 'draft',

  created_at timestamptz DEFAULT now()
);

-- ─── 10) 인사 발령 이력 ──────────────────────────────
CREATE TABLE personnel_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  order_type text NOT NULL,
  effective_date date NOT NULL,

  from_department text,
  to_department text,
  from_position text,
  to_position text,
  from_salary integer,
  to_salary integer,

  reason text,
  approval_document_id uuid,
  created_at timestamptz DEFAULT now()
);

-- ─── 11) 결재 위임 설정 ──────────────────────────────
CREATE TABLE approval_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id uuid NOT NULL REFERENCES employees(id),
  delegate_id uuid NOT NULL REFERENCES employees(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ─── 12) 주 52시간 추적 ──────────────────────────────
CREATE TABLE weekly_hours_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,

  regular_hours float DEFAULT 0,
  overtime_hours float DEFAULT 0,
  total_hours float DEFAULT 0,

  is_over_48 boolean DEFAULT false,
  is_over_52 boolean DEFAULT false,
  alert_sent boolean DEFAULT false,

  UNIQUE(employee_id, week_start),
  created_at timestamptz DEFAULT now()
);

-- 증명서 (유지)
CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  certificate_type text NOT NULL,
  issued_at timestamptz DEFAULT now(),
  issued_data jsonb,
  pdf_url text,
  purpose text,
  created_at timestamptz DEFAULT now()
);

-- 교육 관리 (유지)
CREATE TABLE IF NOT EXISTS training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  training_type text NOT NULL,
  training_name text NOT NULL,
  year integer NOT NULL,
  completed boolean DEFAULT false,
  completed_at date,
  certificate_url text,
  uploaded_at timestamptz,
  note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, training_name, year)
);

-- ═══════════════════════════════════
-- 3. 인덱스
-- ═══════════════════════════════════

CREATE INDEX idx_hr_details_employee ON employee_hr_details(employee_id);
CREATE INDEX idx_attendance_emp_date ON attendance_records(employee_id, date);
CREATE INDEX idx_attendance_date ON attendance_records(date);
CREATE INDEX idx_leave_req_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_req_status ON leave_requests(approval_status);
CREATE INDEX idx_approval_doc_requester ON approval_documents(requester_id);
CREATE INDEX idx_approval_doc_status ON approval_documents(status);
CREATE INDEX idx_approval_doc_type ON approval_documents(doc_type);
CREATE INDEX idx_approval_steps_doc ON approval_steps(document_id);
CREATE INDEX idx_approval_steps_approver ON approval_steps(approver_id);
CREATE INDEX idx_payroll_emp_period ON payroll(employee_id, pay_year, pay_month);
CREATE INDEX idx_contracts_employee ON electronic_contracts(employee_id);
CREATE INDEX idx_personnel_employee ON personnel_orders(employee_id);
CREATE INDEX idx_weekly_hours_emp ON weekly_hours_tracking(employee_id, week_start);
CREATE INDEX idx_certificates_employee ON certificates(employee_id);
CREATE INDEX idx_training_emp_year ON training_records(employee_id, year);

-- ═══════════════════════════════════
-- 4. 트리거 + 자동화
-- ═══════════════════════════════════

-- 출퇴근 시 근무시간 자동 계산
CREATE OR REPLACE FUNCTION calculate_work_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_in IS NOT NULL AND NEW.clock_out IS NOT NULL THEN
    NEW.total_hours := ROUND((EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600 - 1)::numeric, 1);
    IF NEW.total_hours < 0 THEN NEW.total_hours := 0; END IF;

    IF NEW.total_hours > 8 THEN
      NEW.regular_hours := 8;
      NEW.overtime_hours := ROUND((NEW.total_hours - 8)::numeric, 1);
    ELSE
      NEW.regular_hours := NEW.total_hours;
      NEW.overtime_hours := 0;
    END IF;

    -- 지각 판정 (09:00 기준)
    IF EXTRACT(HOUR FROM NEW.clock_in AT TIME ZONE 'Asia/Seoul') > 9
       OR (EXTRACT(HOUR FROM NEW.clock_in AT TIME ZONE 'Asia/Seoul') = 9
           AND EXTRACT(MINUTE FROM NEW.clock_in AT TIME ZONE 'Asia/Seoul') > 0) THEN
      NEW.status := 'late';
      NEW.late_minutes := ROUND(EXTRACT(EPOCH FROM (
        NEW.clock_in AT TIME ZONE 'Asia/Seoul' - (NEW.date + TIME '09:00:00')
      )) / 60);
      IF NEW.late_minutes < 0 THEN NEW.late_minutes := 0; END IF;
    END IF;

    -- 조퇴 판정 (6시간 미만 근무)
    IF NEW.total_hours < 6 AND NEW.status = 'normal' THEN
      NEW.status := 'early_leave';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_hours ON attendance_records;
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

DROP TRIGGER IF EXISTS trigger_doc_number ON approval_documents;
CREATE TRIGGER trigger_doc_number
BEFORE INSERT ON approval_documents
FOR EACH ROW WHEN (NEW.doc_number IS NULL)
EXECUTE FUNCTION generate_doc_number();

-- 연차 승인 시 잔여일수 자동 갱신
CREATE OR REPLACE FUNCTION update_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.approval_status = 'approved' AND (OLD.approval_status IS NULL OR OLD.approval_status != 'approved') THEN
    UPDATE employee_hr_details
    SET annual_leave_used = annual_leave_used + NEW.days_count,
        annual_leave_remaining = annual_leave_total - (annual_leave_used + NEW.days_count),
        updated_at = now()
    WHERE employee_id = NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_leave_balance ON leave_requests;
CREATE TRIGGER trigger_leave_balance
AFTER INSERT OR UPDATE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION update_leave_balance();

-- ═══════════════════════════════════
-- 5. RLS
-- ═══════════════════════════════════

ALTER TABLE employee_hr_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE electronic_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_hours_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;

-- 모든 테이블에 authenticated 사용자 CRUD 허용
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'employee_hr_details','attendance_records','leave_requests',
    'approval_documents','approval_steps','approval_templates',
    'payroll','payroll_settings','electronic_contracts',
    'personnel_orders','approval_delegations','weekly_hours_tracking',
    'certificates','training_records'
  ]) LOOP
    EXECUTE format('CREATE POLICY "%s_sel" ON %I FOR SELECT TO authenticated USING (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_ins" ON %I FOR INSERT TO authenticated WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_upd" ON %I FOR UPDATE TO authenticated USING (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_del" ON %I FOR DELETE TO authenticated USING (true)', tbl, tbl);
  END LOOP;
END $$;

-- ═══════════════════════════════════
-- 6. 기본 데이터
-- ═══════════════════════════════════

-- 급여 설정 (2026년)
INSERT INTO payroll_settings (meal_allowance, transportation_allowance, national_pension_rate, health_insurance_rate, long_care_rate, employment_insurance_rate, tax_year, pay_day)
VALUES (200000, 0, 0.045, 0.03545, 0.1295, 0.009, 2026, 25);

-- 결재선 템플릿
INSERT INTO approval_templates (doc_type, name, steps) VALUES
('leave', '연차/반차 결재선', '[{"order":1,"role":"leader","label":"팀장 승인"},{"order":2,"role":"hr_admin","label":"인사 확인"}]'),
('overtime', '연장근무 결재선', '[{"order":1,"role":"leader","label":"팀장 승인"},{"order":2,"role":"executive","label":"이사 승인"}]'),
('expense', '경비 청구 (50만원 미만)', '[{"order":1,"role":"leader","label":"팀장 승인"},{"order":2,"role":"hr_admin","label":"경영지원 처리"}]'),
('expense_high', '경비 청구 (50만원 이상)', '[{"order":1,"role":"leader","label":"팀장 승인"},{"order":2,"role":"executive","label":"이사 승인"},{"order":3,"role":"ceo","label":"대표 최종"},{"order":4,"role":"hr_admin","label":"경영지원 처리"}]'),
('business_trip', '출장 신청', '[{"order":1,"role":"leader","label":"팀장 승인"},{"order":2,"role":"executive","label":"이사 승인"}]'),
('general', '일반 결재', '[{"order":1,"role":"leader","label":"팀장 승인"}]'),
('personnel', '인사 발령', '[{"order":1,"role":"executive","label":"이사 검토"},{"order":2,"role":"ceo","label":"대표 최종승인"}]'),
('resign', '퇴직 처리', '[{"order":1,"role":"leader","label":"팀장 확인"},{"order":2,"role":"executive","label":"이사 확인"},{"order":3,"role":"ceo","label":"대표 최종"},{"order":4,"role":"hr_admin","label":"인사 처리"}]');

-- 직원 인사정보 초기 생성
INSERT INTO employee_hr_details (employee_id, employment_type, annual_leave_basis, annual_leave_total, annual_leave_remaining)
SELECT e.id, 'regular', 'hire_date',
  CASE
    WHEN e.hire_date IS NULL THEN 15
    WHEN EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date)) < 1 THEN LEAST(GREATEST(EXTRACT(MONTH FROM age(CURRENT_DATE, e.hire_date))::int, 0), 11)
    WHEN EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date)) < 3 THEN 15
    ELSE LEAST(15 + FLOOR((EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date))::int - 1) / 2), 25)
  END,
  CASE
    WHEN e.hire_date IS NULL THEN 15
    WHEN EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date)) < 1 THEN LEAST(GREATEST(EXTRACT(MONTH FROM age(CURRENT_DATE, e.hire_date))::int, 0), 11)
    WHEN EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date)) < 3 THEN 15
    ELSE LEAST(15 + FLOOR((EXTRACT(YEAR FROM age(CURRENT_DATE, e.hire_date))::int - 1) / 2), 25)
  END
FROM employees e WHERE e.is_active = true
ON CONFLICT (employee_id) DO NOTHING;

-- 교육 이수 초기 데이터 (2026년)
INSERT INTO training_records (employee_id, training_type, training_name, year, completed)
SELECT e.id, 'mandatory', t.name, 2026, false
FROM employees e, (VALUES ('성희롱 예방교육'),('개인정보보호교육'),('산업안전보건교육'),('장애인인식개선교육')) AS t(name)
WHERE e.is_active = true
ON CONFLICT (employee_id, training_name, year) DO NOTHING;

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE approval_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE approval_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE leave_requests;

-- ═══════════════════════════════════
-- 완료 확인
-- ═══════════════════════════════════
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('employee_hr_details','attendance_records','leave_requests','approval_documents','approval_steps','approval_templates','payroll','payroll_settings','electronic_contracts','personnel_orders','approval_delegations','weekly_hours_tracking','certificates','training_records')
ORDER BY table_name;
