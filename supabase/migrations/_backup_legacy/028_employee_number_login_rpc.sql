-- =====================================================================
-- 028: 사원번호로 이메일 조회 RPC (로그인용)
-- login.tsx에서 사원번호 입력 시 이메일을 찾아 Supabase Auth로 로그인
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_email_by_employee_number(p_employee_number text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email
  FROM public.employees
  WHERE employee_number = p_employee_number
    AND is_active = true
  LIMIT 1;

  IF v_email IS NULL THEN
    RAISE EXCEPTION '해당 사원번호를 찾을 수 없습니다: %', p_employee_number;
  END IF;

  RETURN v_email;
END;
$$;
