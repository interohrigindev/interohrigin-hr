-- =====================================================================
-- InterOhrigin HR — 시스템 초기화 & 관리자 부트스트랩
-- 기존 모든 데이터를 삭제하고 대표이사(CEO) 관리자 계정만 생성합니다.
-- Supabase SQL Editor에서 실행하세요.
-- =====================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. 기존 평가 데이터 삭제 (FK 순서)
-- ─────────────────────────────────────────────────────────────────────
DELETE FROM public.evaluator_comments;
DELETE FROM public.evaluator_scores;
DELETE FROM public.self_evaluations;
DELETE FROM public.evaluation_targets;
DELETE FROM public.evaluation_weights;

-- ─────────────────────────────────────────────────────────────────────
-- 2. 기존 직원/사용자 삭제
-- ─────────────────────────────────────────────────────────────────────
DELETE FROM public.employees;
DELETE FROM auth.identities;
DELETE FROM auth.users;

-- ─────────────────────────────────────────────────────────────────────
-- 3. 관리자(CEO) 계정 생성
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_now     timestamptz := now();
  -- bcrypt hash of 'AdminPassword123!' (pre-computed via bcryptjs)
  v_password text := '$2b$10$1TAZCOhC3rAz5Nb3tscFpuy/Thv8H03WGZb0f62q65wRt9p2QlX.a';
BEGIN
  -- auth.users에 삽입
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
    'admin@interohrigin.com',
    v_password,
    v_now,  -- 즉시 이메일 인증 완료
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"시스템관리자"}'::jsonb,
    v_now,
    v_now,
    '',
    ''
  );

  -- auth.identities에 삽입
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
    'admin@interohrigin.com',
    'email',
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', 'admin@interohrigin.com',
      'email_verified', true
    ),
    v_now,
    v_now,
    v_now
  );

  -- employees 테이블에 삽입
  INSERT INTO public.employees (id, email, name, role, is_active)
  VALUES (v_user_id, 'admin@interohrigin.com', '시스템관리자', 'ceo', true);

  RAISE NOTICE '관리자 계정 생성 완료: admin@interohrigin.com / AdminPassword123!';
END $$;

COMMIT;
