-- =====================================================================
-- 027: 사원번호 자동 생성 트리거
-- 형식: YYMMDDRR (예: 26031901 = 2026년 3월 19일 첫 번째 입사자)
-- hire_date가 설정/변경될 때 employee_number가 비어있으면 자동 생성
-- =====================================================================

CREATE OR REPLACE FUNCTION public.generate_employee_number()
RETURNS TRIGGER AS $$
DECLARE
  v_date_part text;
  v_seq integer;
  v_emp_number text;
BEGIN
  -- hire_date가 있고 employee_number가 비어있을 때만 생성
  IF NEW.hire_date IS NOT NULL AND (NEW.employee_number IS NULL OR NEW.employee_number = '') THEN
    -- YYMMDD 형식
    v_date_part := to_char(NEW.hire_date, 'YYMMDD');

    -- 같은 입사일에 이미 있는 사원번호 중 최대 순번 조회
    SELECT COALESCE(MAX(
      CASE
        WHEN employee_number ~ ('^' || v_date_part || '\d{2}$')
        THEN substring(employee_number FROM 7 FOR 2)::integer
        ELSE 0
      END
    ), 0) + 1
    INTO v_seq
    FROM public.employees
    WHERE employee_number LIKE v_date_part || '%'
      AND id != NEW.id;

    -- YYMMDDRR 생성
    v_emp_number := v_date_part || lpad(v_seq::text, 2, '0');

    NEW.employee_number := v_emp_number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 기존 트리거 제거 후 재생성
DROP TRIGGER IF EXISTS trg_auto_employee_number ON public.employees;

CREATE TRIGGER trg_auto_employee_number
  BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.generate_employee_number();
