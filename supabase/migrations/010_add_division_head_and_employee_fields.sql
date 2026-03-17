-- 010: division_head(본부장) 역할 추가 + employees 추가 필드
-- division_head는 director와 동일 레벨 (평가 시 director로 취급)

BEGIN;

-- =====================================================================
-- PHASE 1: employees.role CHECK 제약조건에 division_head 추가
-- =====================================================================
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee', 'leader', 'director', 'division_head', 'ceo', 'admin'));

-- =====================================================================
-- PHASE 2: employees 테이블에 추가 필드
-- =====================================================================
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- =====================================================================
-- PHASE 3: is_admin() 함수에 division_head 포함
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT role IN ('director', 'division_head', 'ceo', 'admin') FROM public.employees WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =====================================================================
-- PHASE 4: RLS 정책에 division_head 포함
-- =====================================================================

-- evaluation_targets: director_up 정책에 division_head 추가
DROP POLICY IF EXISTS "target_select_director_up" ON public.evaluation_targets;
CREATE POLICY "target_select_director_up"
  ON public.evaluation_targets FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('director', 'division_head', 'ceo', 'admin')
  );

-- self_evaluations: evaluator 정책에 division_head 추가
DROP POLICY IF EXISTS "self_eval_select_evaluator" ON public.self_evaluations;
CREATE POLICY "self_eval_select_evaluator"
  ON public.self_evaluations FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('leader', 'director', 'division_head', 'ceo', 'admin')
    AND EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = self_evaluations.target_id
        AND (
          public.get_my_role() NOT IN ('leader')
          OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = t.employee_id
              AND e.department_id = public.get_my_department_id()
          )
        )
    )
  );

-- =====================================================================
-- PHASE 5: 관리자 evaluation_targets/self_evaluations INSERT/DELETE 권한
-- =====================================================================
CREATE POLICY "target_insert_admin"
  ON public.evaluation_targets FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "target_delete_admin"
  ON public.evaluation_targets FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "self_eval_insert_admin"
  ON public.self_evaluations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "self_eval_delete_admin"
  ON public.self_evaluations FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- PHASE 6: create_employee_with_auth 함수에 division_head 허용
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_employee_with_auth(
  p_email       text,
  p_password    text,
  p_name        text,
  p_role        text DEFAULT 'employee',
  p_department_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_now     timestamptz := now();
  v_password_hash text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '직원을 생성할 권한이 없습니다.';
  END IF;

  IF p_role NOT IN ('employee', 'leader', 'director', 'division_head', 'ceo', 'admin') THEN
    RAISE EXCEPTION '유효하지 않은 역할입니다: %', p_role;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION '이미 등록된 이메일입니다: %', p_email;
  END IF;

  v_password_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token
  ) VALUES (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, v_password_hash, v_now,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_name),
    v_now, v_now, '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id, v_user_id, p_email, 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
    v_now, v_now, v_now
  );

  INSERT INTO public.employees (id, email, name, role, department_id, is_active)
  VALUES (v_user_id, p_email, p_name, p_role, p_department_id, true);

  RETURN v_user_id;
END;
$$;

COMMIT;
