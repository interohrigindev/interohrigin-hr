-- =====================================================================
-- 013: pgcrypto 의존성 제거 — 비밀번호 해싱을 클라이언트(bcryptjs)에서 처리
-- DB 함수는 이미 해싱된 비밀번호를 그대로 저장
-- =====================================================================

DROP FUNCTION IF EXISTS public.create_employee_with_auth(text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.create_employee_with_auth(
  p_email text,
  p_password text,
  p_name text,
  p_role text DEFAULT 'employee',
  p_department_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_now timestamptz := now();
  v_has_is_sso_user boolean;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '직원을 생성할 권한이 없습니다.';
  END IF;

  IF p_role NOT IN (
    'employee','leader','director',
    'division_head','ceo','admin'
  ) THEN
    RAISE EXCEPTION '유효하지 않은 역할입니다: %', p_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users WHERE email = p_email
  ) THEN
    RAISE EXCEPTION '이미 등록된 이메일입니다: %', p_email;
  END IF;

  -- p_password는 클라이언트에서 bcrypt 해싱된 값
  v_user_id := gen_random_uuid();

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'users'
      AND column_name = 'is_sso_user'
  ) INTO v_has_is_sso_user;

  IF v_has_is_sso_user THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      is_sso_user
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      p_email,
      p_password,
      v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', p_name),
      v_now,
      v_now,
      '',
      '',
      false
    );
  ELSE
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      p_email,
      p_password,
      v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', p_name),
      v_now,
      v_now,
      '',
      ''
    );
  END IF;

  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    provider,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    p_email,
    'email',
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', p_email,
      'email_verified', true
    ),
    v_now,
    v_now,
    v_now
  );

  INSERT INTO public.employees (
    id, email, name, role,
    department_id, is_active
  ) VALUES (
    v_user_id, p_email, p_name,
    p_role, p_department_id, true
  );

  RETURN v_user_id;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION '이미 등록된 이메일이거나 중복된 데이터입니다: %', p_email;
  WHEN others THEN
    RAISE EXCEPTION '직원 생성 중 오류: % (SQLSTATE: %)',
      SQLERRM, SQLSTATE;
END;
$$;

NOTIFY pgrst, 'reload schema';
