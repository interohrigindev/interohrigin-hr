-- =====================================================================
-- 038: 관리자/임원 비밀번호 초기화 RPC
-- is_admin() 권한(director/division_head/ceo/admin)으로 직원 비밀번호 변경
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.reset_employee_password(
  p_employee_id uuid,
  p_new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '비밀번호를 변경할 권한이 없습니다.';
  END IF;

  IF length(p_new_password) < 6 THEN
    RAISE EXCEPTION '비밀번호는 6자 이상이어야 합니다.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees WHERE id = p_employee_id
  ) THEN
    RAISE EXCEPTION '해당 직원을 찾을 수 없습니다.';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = crypt(p_new_password, gen_salt('bf')),
    updated_at = now()
  WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '해당 사용자의 인증 정보를 찾을 수 없습니다.';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
