-- =====================================================================
-- InterOhrigin HR — 직원 확장 필드 추가
-- employees 테이블에 사원번호, 입사일, 직급 등 추가
-- =====================================================================

-- 사원번호
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employee_number text;

-- 입사일
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS hire_date date;

-- 직급/직책
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS position text;

-- 입사구분
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employment_type text
  DEFAULT 'full_time' CHECK (employment_type IS NULL OR employment_type IN ('full_time','contract','intern','part_time'));

-- 비상연락처
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS emergency_contact text;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_employees_employee_number ON public.employees(employee_number);
CREATE INDEX IF NOT EXISTS idx_employees_hire_date ON public.employees(hire_date);
