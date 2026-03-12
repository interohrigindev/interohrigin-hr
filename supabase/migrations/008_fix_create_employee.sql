-- =====================================================================
-- InterOhrigin HR — create_employee_with_auth 함수 수정
-- auth.users 직접 INSERT 시 Supabase 버전 호환성 문제 해결
-- Supabase SQL Editor에서 실행하세요.
-- =====================================================================

-- pgcrypto 확장 확인 (비밀번호 해싱에 필요)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- create_employee_with_auth: 더 안전한 버전
-- auth.users 스키마 변경에 대응하기 위해 최소한의 필수 컬럼만 INSERT
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
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_now     timestamptz := now();
  v_password_hash text;
  v_has_is_sso_user boolean;
BEGIN
  -- 권한 체크: director 또는 ceo만 가능
  IF NOT is_admin() THEN
    RAISE EXCEPTION '직원을 생성할 권한이 없습니다.';
  END IF;

  -- 역할 유효성 검증
  IF p_role NOT IN ('employee', 'leader', 'director', 'ceo') THEN
    RAISE EXCEPTION '유효하지 않은 역할입니다: %. 허용: employee, leader, director, ceo', p_role;
  END IF;

  -- 이메일 중복 확인
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION '이미 등록된 이메일입니다: %', p_email;
  END IF;

  -- 비밀번호 해시
  v_password_hash := crypt(p_password, gen_salt('bf'));
  v_user_id := gen_random_uuid();

  -- auth.users 스키마 확인 (is_sso_user 컬럼 존재 여부)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'users'
      AND column_name = 'is_sso_user'
  ) INTO v_has_is_sso_user;

  -- auth.users 삽입 (스키마 호환)
  IF v_has_is_sso_user THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token,
      is_sso_user
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      p_email, v_password_hash, v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', p_name),
      v_now, v_now,
      '', '',
      false
    );
  ELSE
    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      p_email, v_password_hash, v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', p_name),
      v_now, v_now,
      '', ''
    );
  END IF;

  -- auth.identities 삽입
  INSERT INTO auth.identities (
    id, user_id, provider_id, provider,
    identity_data, last_sign_in_at,
    created_at, updated_at
  ) VALUES (
    v_user_id, v_user_id,
    p_email, 'email',
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', p_email,
      'email_verified', true
    ),
    v_now, v_now, v_now
  );

  -- employees 삽입
  INSERT INTO public.employees (id, email, name, role, department_id, is_active)
  VALUES (v_user_id, p_email, p_name, p_role, p_department_id, true);

  RETURN v_user_id;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION '이미 등록된 이메일이거나 중복된 데이터입니다: %', p_email;
  WHEN others THEN
    RAISE EXCEPTION '직원 생성 중 오류 발생: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

-- =====================================================================
-- 관리자가 직원 삭제할 수 있는 함수 추가
-- =====================================================================
CREATE OR REPLACE FUNCTION public.delete_employee(p_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '직원을 삭제할 권한이 없습니다.';
  END IF;

  -- 관련 평가 데이터 삭제 (FK 순서)
  DELETE FROM public.evaluator_comments WHERE target_id IN (
    SELECT id FROM public.evaluation_targets WHERE employee_id = p_employee_id
  );
  DELETE FROM public.evaluator_scores WHERE target_id IN (
    SELECT id FROM public.evaluation_targets WHERE employee_id = p_employee_id
  );
  DELETE FROM public.self_evaluations WHERE target_id IN (
    SELECT id FROM public.evaluation_targets WHERE employee_id = p_employee_id
  );
  DELETE FROM public.evaluation_targets WHERE employee_id = p_employee_id;

  -- employees 삭제 (auth.users는 CASCADE로 자동 삭제되지 않으므로)
  DELETE FROM public.employees WHERE id = p_employee_id;

  -- auth 데이터 삭제
  DELETE FROM auth.identities WHERE user_id = p_employee_id;
  DELETE FROM auth.users WHERE id = p_employee_id;
END;
$$;
