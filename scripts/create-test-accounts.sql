-- =====================================================================
-- 인터오리진 HR 테스트 계정 생성
-- Supabase Dashboard > SQL Editor 에서 실행하세요
--
-- 4역할 구조: employee / leader / director / ceo
-- 공통 비밀번호: Test1234!
-- =====================================================================

-- 기존 테스트 계정 정리 (재실행 시)
DELETE FROM public.evaluator_comments WHERE target_id IN (
  SELECT t.id FROM public.evaluation_targets t
  JOIN auth.users u ON u.id = t.employee_id
  WHERE u.email LIKE 'test-%@interohrigin.com'
);
DELETE FROM public.evaluator_scores WHERE target_id IN (
  SELECT t.id FROM public.evaluation_targets t
  JOIN auth.users u ON u.id = t.employee_id
  WHERE u.email LIKE 'test-%@interohrigin.com'
);
DELETE FROM public.self_evaluations WHERE target_id IN (
  SELECT t.id FROM public.evaluation_targets t
  JOIN auth.users u ON u.id = t.employee_id
  WHERE u.email LIKE 'test-%@interohrigin.com'
);
DELETE FROM public.evaluation_targets WHERE employee_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'test-%@interohrigin.com'
);
DELETE FROM public.employees WHERE email LIKE 'test-%@interohrigin.com';
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'test-%@interohrigin.com'
);
DELETE FROM auth.users WHERE email LIKE 'test-%@interohrigin.com';

DO $$
DECLARE
  v_user_id      uuid;
  v_dept_id      uuid;
  v_period_id    uuid;
  v_now          timestamptz := now();
  v_password     text := crypt('Test1234!', gen_salt('bf'));
BEGIN

  -- 부서 ID 조회 (첫 번째 부서 사용)
  SELECT id INTO v_dept_id FROM public.departments ORDER BY name LIMIT 1;

  -- 진행 중인 평가 기간 ID 조회
  SELECT id INTO v_period_id
  FROM public.evaluation_periods
  WHERE status = 'in_progress'
  ORDER BY year DESC, quarter DESC
  LIMIT 1;

  RAISE NOTICE '부서 ID: %', v_dept_id;
  RAISE NOTICE '평가 기간 ID: %', v_period_id;

  -- ═══════════════════════════════════════════════════════════════
  -- 1. 테스트 직원 (employee) - 자기평가 테스트용
  -- ═══════════════════════════════════════════════════════════════
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at, confirmation_token, recovery_token,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'test-employee@interohrigin.com',
    v_password, v_now,
    v_now, v_now, '', '',
    '{"provider":"email","providers":["email"]}',
    '{"name":"테스트 직원"}'
  );

  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (v_user_id, v_user_id, 'test-employee@interohrigin.com', 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', 'test-employee@interohrigin.com', 'email_verified', true),
    v_now, v_now, v_now);

  INSERT INTO public.employees (id, name, email, department_id, role)
  VALUES (v_user_id, '테스트 직원', 'test-employee@interohrigin.com', v_dept_id, 'employee');

  RAISE NOTICE '직원 생성: test-employee@interohrigin.com (id=%)', v_user_id;

  -- ═══════════════════════════════════════════════════════════════
  -- 2. 테스트 리더 (leader)
  -- ═══════════════════════════════════════════════════════════════
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at, confirmation_token, recovery_token,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'test-leader@interohrigin.com',
    v_password, v_now,
    v_now, v_now, '', '',
    '{"provider":"email","providers":["email"]}',
    '{"name":"테스트 리더"}'
  );

  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (v_user_id, v_user_id, 'test-leader@interohrigin.com', 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', 'test-leader@interohrigin.com', 'email_verified', true),
    v_now, v_now, v_now);

  INSERT INTO public.employees (id, name, email, department_id, role)
  VALUES (v_user_id, '테스트 리더', 'test-leader@interohrigin.com', v_dept_id, 'leader');

  RAISE NOTICE '리더 생성: test-leader@interohrigin.com (id=%)', v_user_id;

  -- ═══════════════════════════════════════════════════════════════
  -- 3. 테스트 이사 (director)
  -- ═══════════════════════════════════════════════════════════════
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at, confirmation_token, recovery_token,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'test-director@interohrigin.com',
    v_password, v_now,
    v_now, v_now, '', '',
    '{"provider":"email","providers":["email"]}',
    '{"name":"테스트 이사"}'
  );

  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (v_user_id, v_user_id, 'test-director@interohrigin.com', 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', 'test-director@interohrigin.com', 'email_verified', true),
    v_now, v_now, v_now);

  INSERT INTO public.employees (id, name, email, department_id, role)
  VALUES (v_user_id, '테스트 이사', 'test-director@interohrigin.com', v_dept_id, 'director');

  RAISE NOTICE '이사 생성: test-director@interohrigin.com (id=%)', v_user_id;

  -- ═══════════════════════════════════════════════════════════════
  -- 4. 테스트 대표이사 (ceo)
  -- ═══════════════════════════════════════════════════════════════
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at, confirmation_token, recovery_token,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'test-ceo@interohrigin.com',
    v_password, v_now,
    v_now, v_now, '', '',
    '{"provider":"email","providers":["email"]}',
    '{"name":"테스트 대표"}'
  );

  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (v_user_id, v_user_id, 'test-ceo@interohrigin.com', 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', 'test-ceo@interohrigin.com', 'email_verified', true),
    v_now, v_now, v_now);

  INSERT INTO public.employees (id, name, email, department_id, role)
  VALUES (v_user_id, '테스트 대표', 'test-ceo@interohrigin.com', v_dept_id, 'ceo');

  RAISE NOTICE '대표 생성: test-ceo@interohrigin.com (id=%)', v_user_id;

  -- ═══════════════════════════════════════════════════════════════
  -- 평가 대상 등록 (employee/leader만 - director/ceo는 평가 대상 아님)
  -- ═══════════════════════════════════════════════════════════════
  IF v_period_id IS NOT NULL THEN
    INSERT INTO public.evaluation_targets (period_id, employee_id, status)
    SELECT v_period_id, e.id, 'pending'
    FROM public.employees e
    WHERE e.email LIKE 'test-%@interohrigin.com'
      AND e.role IN ('employee', 'leader')
    ON CONFLICT (period_id, employee_id) DO NOTHING;

    RAISE NOTICE '평가 대상 등록 완료 (employee, leader)';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '====================================';
  RAISE NOTICE '테스트 계정 생성 완료!';
  RAISE NOTICE '비밀번호: Test1234!';
  RAISE NOTICE '====================================';
  RAISE NOTICE '직원:     test-employee@interohrigin.com';
  RAISE NOTICE '리더:     test-leader@interohrigin.com';
  RAISE NOTICE '이사:     test-director@interohrigin.com';
  RAISE NOTICE '대표이사: test-ceo@interohrigin.com';
  RAISE NOTICE '====================================';

END $$;
