-- =====================================================================
-- InterOhrigin HR — 통합 DB 수정 스크립트
-- Supabase SQL Editor에서 실행하세요
--
-- 이 스크립트는 다음을 수행합니다:
-- 1. employees 테이블 추가 컬럼 확인
-- 2. CHECK 제약조건 최신화
-- 3. 헬퍼/비즈니스 함수 재생성
-- 4. RLS 정책 정리 및 재생성
-- 5. 시드 데이터 복원
-- 6. 관리자 계정 확인
-- =====================================================================

-- pgcrypto 확장
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. employees 테이블 추가 컬럼 (없으면 추가)
-- =====================================================================
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- =====================================================================
-- 2. CHECK 제약조건 최신화
-- =====================================================================

-- employees.role: 6가지 역할
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee', 'leader', 'director', 'division_head', 'ceo', 'admin'));

-- evaluation_targets.status: 6단계
ALTER TABLE public.evaluation_targets DROP CONSTRAINT IF EXISTS evaluation_targets_status_check;
ALTER TABLE public.evaluation_targets
  ADD CONSTRAINT evaluation_targets_status_check
  CHECK (status IN ('pending', 'self_done', 'leader_done', 'director_done', 'ceo_done', 'completed'));

-- evaluator_scores.evaluator_role
ALTER TABLE public.evaluator_scores DROP CONSTRAINT IF EXISTS evaluator_scores_evaluator_role_check;
ALTER TABLE public.evaluator_scores
  ADD CONSTRAINT evaluator_scores_evaluator_role_check
  CHECK (evaluator_role IN ('leader', 'director', 'ceo'));

-- evaluation_weights.evaluator_role
ALTER TABLE public.evaluation_weights DROP CONSTRAINT IF EXISTS evaluation_weights_evaluator_role_check;
ALTER TABLE public.evaluation_weights
  ADD CONSTRAINT evaluation_weights_evaluator_role_check
  CHECK (evaluator_role IN ('self', 'leader', 'director', 'ceo'));

-- =====================================================================
-- 3. 헬퍼 함수
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text AS $$
  SELECT role FROM public.employees WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_department_id()
RETURNS uuid AS $$
  SELECT department_id FROM public.employees WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT role IN ('director', 'division_head', 'ceo', 'admin') FROM public.employees WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =====================================================================
-- 4. 비즈니스 함수
-- =====================================================================

-- generate_evaluation_sheets
CREATE OR REPLACE FUNCTION public.generate_evaluation_sheets(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target_id   uuid;
  v_employee_id uuid;
  v_count       integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM evaluation_periods WHERE id = p_period_id) THEN
    RAISE EXCEPTION '평가 기간을 찾을 수 없습니다: %', p_period_id;
  END IF;

  FOR v_employee_id IN
    SELECT id FROM employees
    WHERE is_active = true AND role IN ('employee', 'leader')
  LOOP
    INSERT INTO evaluation_targets (period_id, employee_id, status)
    VALUES (p_period_id, v_employee_id, 'pending')
    ON CONFLICT (period_id, employee_id) DO NOTHING
    RETURNING id INTO v_target_id;

    IF v_target_id IS NOT NULL THEN
      INSERT INTO self_evaluations (target_id, item_id)
      SELECT v_target_id, i.id
      FROM evaluation_items i WHERE i.is_active = true
      ON CONFLICT (target_id, item_id) DO NOTHING;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- advance_evaluation_stage
CREATE OR REPLACE FUNCTION public.advance_evaluation_stage(
  p_target_id uuid, p_current_role text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_status  text;
  v_expected_status text;
  v_next_status     text;
  v_total_items     integer;
  v_scored_items    integer;
  v_missing         integer;
  v_employee_role   text;
BEGIN
  SELECT status INTO v_current_status FROM evaluation_targets WHERE id = p_target_id;
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION '평가 대상을 찾을 수 없습니다: %', p_target_id;
  END IF;

  CASE p_current_role
    WHEN 'self'     THEN v_expected_status := 'pending';      v_next_status := 'self_done';
    WHEN 'leader'   THEN v_expected_status := 'self_done';    v_next_status := 'leader_done';
    WHEN 'director' THEN v_expected_status := 'leader_done';  v_next_status := 'director_done';
    WHEN 'ceo'      THEN v_expected_status := 'director_done'; v_next_status := 'ceo_done';
    ELSE RAISE EXCEPTION '잘못된 평가자 역할입니다: %', p_current_role;
  END CASE;

  IF v_current_status <> v_expected_status THEN
    RAISE EXCEPTION '현재 단계(%)에서 % 역할이 평가를 진행할 수 없습니다.', v_current_status, p_current_role;
  END IF;

  SELECT COUNT(*) INTO v_total_items FROM evaluation_items WHERE is_active = true;

  IF p_current_role = 'self' THEN
    SELECT COUNT(*) INTO v_scored_items
    FROM self_evaluations WHERE target_id = p_target_id AND score IS NOT NULL;
    v_missing := v_total_items - v_scored_items;
    IF v_missing > 0 THEN
      RAISE EXCEPTION '자기평가 미입력 항목이 %개 있습니다.', v_missing;
    END IF;
    UPDATE self_evaluations SET is_draft = false WHERE target_id = p_target_id;
  ELSE
    SELECT COUNT(*) INTO v_scored_items
    FROM evaluator_scores
    WHERE target_id = p_target_id AND evaluator_role = p_current_role AND score IS NOT NULL;
    v_missing := v_total_items - v_scored_items;
    IF v_missing > 0 THEN
      RAISE EXCEPTION '% 평가 미입력 항목이 %개 있습니다.', p_current_role, v_missing;
    END IF;
    UPDATE evaluator_scores SET is_draft = false
    WHERE target_id = p_target_id AND evaluator_role = p_current_role;
  END IF;

  UPDATE evaluation_targets SET status = v_next_status WHERE id = p_target_id;

  -- 리더 자기평가 완료 시 leader_done 자동 스킵
  IF p_current_role = 'self' AND v_next_status = 'self_done' THEN
    SELECT e.role INTO v_employee_role
    FROM evaluation_targets t JOIN employees e ON e.id = t.employee_id
    WHERE t.id = p_target_id;
    IF v_employee_role = 'leader' THEN
      UPDATE evaluation_targets SET status = 'leader_done' WHERE id = p_target_id;
      RETURN 'leader_done';
    END IF;
  END IF;

  -- CEO 평가 완료 시 최종 점수 계산
  IF v_next_status = 'ceo_done' THEN
    PERFORM calculate_final_score(p_target_id);
    UPDATE evaluation_targets SET status = 'completed' WHERE id = p_target_id;
    RETURN 'completed';
  END IF;

  RETURN v_next_status;
END;
$$;

-- calculate_final_score
CREATE OR REPLACE FUNCTION public.calculate_final_score(p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period_id      uuid;
  v_self_total     decimal;
  v_leader_total   decimal;
  v_director_total decimal;
  v_ceo_total      decimal;
  v_weighted_sum   decimal := 0;
  v_weight_sum     decimal := 0;
  v_score          decimal;
  v_grade          text;
  v_w              decimal;
BEGIN
  SELECT period_id INTO v_period_id FROM evaluation_targets WHERE id = p_target_id;
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION '평가 대상을 찾을 수 없습니다: %', p_target_id;
  END IF;

  SELECT SUM(score) INTO v_self_total
  FROM self_evaluations WHERE target_id = p_target_id AND score IS NOT NULL AND is_draft = false;

  SELECT
    SUM(CASE WHEN evaluator_role = 'leader'   THEN score END),
    SUM(CASE WHEN evaluator_role = 'director' THEN score END),
    SUM(CASE WHEN evaluator_role = 'ceo'      THEN score END)
  INTO v_leader_total, v_director_total, v_ceo_total
  FROM evaluator_scores WHERE target_id = p_target_id AND score IS NOT NULL AND is_draft = false;

  -- self
  IF v_self_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'self';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_self_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;
  -- leader
  IF v_leader_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'leader';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_leader_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;
  -- director
  IF v_director_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'director';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_director_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;
  -- ceo
  IF v_ceo_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'ceo';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_ceo_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;

  IF v_weight_sum > 0 THEN v_score := ROUND(v_weighted_sum / v_weight_sum, 2);
  ELSE v_score := NULL; END IF;

  v_grade := CASE
    WHEN v_score IS NULL THEN NULL
    WHEN v_score >= 90 THEN 'S' WHEN v_score >= 80 THEN 'A'
    WHEN v_score >= 70 THEN 'B' WHEN v_score >= 60 THEN 'C' ELSE 'D'
  END;

  UPDATE evaluation_targets SET final_score = v_score, grade = v_grade WHERE id = p_target_id;
  RETURN jsonb_build_object('score', v_score, 'grade', v_grade);
END;
$$;

-- create_employee_with_auth
CREATE OR REPLACE FUNCTION public.create_employee_with_auth(
  p_email       text,
  p_password    text,
  p_name        text,
  p_role        text DEFAULT 'employee',
  p_department_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

  v_password_hash := crypt(p_password, gen_salt('bf'));

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

-- delete_employee
CREATE OR REPLACE FUNCTION public.delete_employee(p_employee_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '직원을 삭제할 권한이 없습니다.';
  END IF;

  DELETE FROM public.evaluator_comments WHERE target_id IN (
    SELECT id FROM public.evaluation_targets WHERE employee_id = p_employee_id);
  DELETE FROM public.evaluator_scores WHERE target_id IN (
    SELECT id FROM public.evaluation_targets WHERE employee_id = p_employee_id);
  DELETE FROM public.self_evaluations WHERE target_id IN (
    SELECT id FROM public.evaluation_targets WHERE employee_id = p_employee_id);
  DELETE FROM public.evaluation_targets WHERE employee_id = p_employee_id;
  DELETE FROM public.employees WHERE id = p_employee_id;
  DELETE FROM auth.identities WHERE user_id = p_employee_id;
  DELETE FROM auth.users WHERE id = p_employee_id;
END;
$$;

-- =====================================================================
-- 5. 뷰 재생성
-- =====================================================================

CREATE OR REPLACE VIEW public.v_evaluation_summary AS
WITH
  self_totals AS (
    SELECT se.target_id, SUM(se.score) AS self_total
    FROM public.self_evaluations se WHERE se.score IS NOT NULL AND se.is_draft = false
    GROUP BY se.target_id
  ),
  evaluator_totals AS (
    SELECT es.target_id,
      SUM(CASE WHEN es.evaluator_role = 'leader'   THEN es.score END) AS leader_total,
      SUM(CASE WHEN es.evaluator_role = 'director'  THEN es.score END) AS director_total,
      SUM(CASE WHEN es.evaluator_role = 'ceo'       THEN es.score END) AS ceo_total
    FROM public.evaluator_scores es WHERE es.score IS NOT NULL AND es.is_draft = false
    GROUP BY es.target_id
  ),
  weighted AS (
    SELECT t.id AS target_id,
      CASE WHEN (
        COALESCE(CASE WHEN st.self_total     IS NOT NULL THEN w_self.weight END, 0) +
        COALESCE(CASE WHEN et.leader_total   IS NOT NULL THEN w_leader.weight END, 0) +
        COALESCE(CASE WHEN et.director_total IS NOT NULL THEN w_dir.weight END, 0) +
        COALESCE(CASE WHEN et.ceo_total      IS NOT NULL THEN w_ceo.weight END, 0)
      ) = 0 THEN NULL
      ELSE ROUND((
        COALESCE(st.self_total * w_self.weight, 0) +
        COALESCE(et.leader_total * w_leader.weight, 0) +
        COALESCE(et.director_total * w_dir.weight, 0) +
        COALESCE(et.ceo_total * w_ceo.weight, 0)
      ) / (
        COALESCE(CASE WHEN st.self_total     IS NOT NULL THEN w_self.weight END, 0) +
        COALESCE(CASE WHEN et.leader_total   IS NOT NULL THEN w_leader.weight END, 0) +
        COALESCE(CASE WHEN et.director_total IS NOT NULL THEN w_dir.weight END, 0) +
        COALESCE(CASE WHEN et.ceo_total      IS NOT NULL THEN w_ceo.weight END, 0)
      ), 2) END AS weighted_score
    FROM public.evaluation_targets t
    LEFT JOIN self_totals st ON st.target_id = t.id
    LEFT JOIN evaluator_totals et ON et.target_id = t.id
    LEFT JOIN public.evaluation_weights w_self   ON w_self.period_id = t.period_id AND w_self.evaluator_role = 'self'
    LEFT JOIN public.evaluation_weights w_leader ON w_leader.period_id = t.period_id AND w_leader.evaluator_role = 'leader'
    LEFT JOIN public.evaluation_weights w_dir    ON w_dir.period_id = t.period_id AND w_dir.evaluator_role = 'director'
    LEFT JOIN public.evaluation_weights w_ceo    ON w_ceo.period_id = t.period_id AND w_ceo.evaluator_role = 'ceo'
  )
SELECT
  t.id AS target_id, t.period_id, p.year, p.quarter,
  t.employee_id, e.name AS employee_name, d.name AS department_name,
  st.self_total, et.leader_total, et.director_total, et.ceo_total,
  w.weighted_score,
  CASE
    WHEN w.weighted_score IS NULL THEN NULL
    WHEN w.weighted_score >= 90 THEN 'S' WHEN w.weighted_score >= 80 THEN 'A'
    WHEN w.weighted_score >= 70 THEN 'B' WHEN w.weighted_score >= 60 THEN 'C' ELSE 'D'
  END AS grade,
  t.status
FROM public.evaluation_targets t
JOIN public.evaluation_periods p ON p.id = t.period_id
JOIN public.employees e ON e.id = t.employee_id
LEFT JOIN public.departments d ON d.id = e.department_id
LEFT JOIN self_totals st ON st.target_id = t.id
LEFT JOIN evaluator_totals et ON et.target_id = t.id
LEFT JOIN weighted w ON w.target_id = t.id;

CREATE OR REPLACE VIEW public.v_item_scores_comparison AS
SELECT
  t.id AS target_id, emp.name AS employee_name,
  i.name AS item_name, c.name AS category_name,
  se.score AS self_score,
  MAX(CASE WHEN es.evaluator_role = 'leader'   THEN es.score END) AS leader_score,
  MAX(CASE WHEN es.evaluator_role = 'director'  THEN es.score END) AS director_score,
  MAX(CASE WHEN es.evaluator_role = 'ceo'       THEN es.score END) AS ceo_score,
  (GREATEST(
    COALESCE(se.score, -1),
    COALESCE(MAX(CASE WHEN es.evaluator_role = 'leader'   THEN es.score END), -1),
    COALESCE(MAX(CASE WHEN es.evaluator_role = 'director'  THEN es.score END), -1),
    COALESCE(MAX(CASE WHEN es.evaluator_role = 'ceo'       THEN es.score END), -1)
  ) - LEAST(
    COALESCE(se.score, 11),
    COALESCE(MAX(CASE WHEN es.evaluator_role = 'leader'   THEN es.score END), 11),
    COALESCE(MAX(CASE WHEN es.evaluator_role = 'director'  THEN es.score END), 11),
    COALESCE(MAX(CASE WHEN es.evaluator_role = 'ceo'       THEN es.score END), 11)
  )) AS max_deviation,
  (GREATEST(
    COALESCE(se.score, -1),
    COALESCE(MAX(CASE WHEN es.evaluator_role = 'leader'   THEN es.score END), -1),
    COALESCE(MAX(CASE WHEN es.evaluator_role = 'director'  THEN es.score END), -1),
    COALESCE(MAX(CASE WHEN es.evaluator_role = 'ceo'       THEN es.score END), -1)
  ) - LEAST(
    COALESCE(se.score, 11),
    COALESCE(MAX(CASE WHEN es.evaluator_role = 'leader'   THEN es.score END), 11),
    COALESCE(MAX(CASE WHEN es.evaluator_role = 'director'  THEN es.score END), 11),
    COALESCE(MAX(CASE WHEN es.evaluator_role = 'ceo'       THEN es.score END), 11)
  )) >= 3 AS has_deviation_flag
FROM public.evaluation_targets t
JOIN public.employees emp ON emp.id = t.employee_id
CROSS JOIN public.evaluation_items i
JOIN public.evaluation_categories c ON c.id = i.category_id
LEFT JOIN public.self_evaluations se ON se.target_id = t.id AND se.item_id = i.id
LEFT JOIN public.evaluator_scores es ON es.target_id = t.id AND es.item_id = i.id
WHERE i.is_active = true
GROUP BY t.id, emp.name, i.id, i.name, c.name, se.score;

CREATE OR REPLACE VIEW public.v_evaluation_progress AS
WITH status_order(status_name, status_rank) AS (
  VALUES
    ('pending', 0), ('self_done', 1), ('leader_done', 2),
    ('director_done', 3), ('ceo_done', 4), ('completed', 5)
)
SELECT
  p.id AS period_id, p.year, p.quarter,
  COUNT(t.id) AS total_employees,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 1) AS self_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 2) AS leader_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 3) AS director_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 4) AS ceo_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 5) AS completed_count
FROM public.evaluation_periods p
LEFT JOIN public.evaluation_targets t ON t.period_id = p.id
LEFT JOIN status_order so ON so.status_name = t.status
GROUP BY p.id, p.year, p.quarter;

-- =====================================================================
-- 6. RLS 정책 정리 및 재생성
-- =====================================================================

-- RLS 활성화
ALTER TABLE public.departments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_periods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_targets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_evaluations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluator_scores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluator_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_weights    ENABLE ROW LEVEL SECURITY;

-- departments
DROP POLICY IF EXISTS "departments_select_all"       ON public.departments;
DROP POLICY IF EXISTS "departments_manage_management" ON public.departments;
DROP POLICY IF EXISTS "dept_select_authenticated" ON public.departments;
DROP POLICY IF EXISTS "dept_insert_admin" ON public.departments;
DROP POLICY IF EXISTS "dept_update_admin" ON public.departments;
DROP POLICY IF EXISTS "dept_delete_admin" ON public.departments;

CREATE POLICY "dept_select_authenticated" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept_insert_admin" ON public.departments FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "dept_update_admin" ON public.departments FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "dept_delete_admin" ON public.departments FOR DELETE TO authenticated USING (public.is_admin());

-- employees
DROP POLICY IF EXISTS "employees_select_self"         ON public.employees;
DROP POLICY IF EXISTS "employees_select_management"   ON public.employees;
DROP POLICY IF EXISTS "employees_select_leader"       ON public.employees;
DROP POLICY IF EXISTS "employees_manage_management"   ON public.employees;
DROP POLICY IF EXISTS "emp_select_authenticated" ON public.employees;
DROP POLICY IF EXISTS "emp_update_self_or_admin" ON public.employees;
DROP POLICY IF EXISTS "emp_insert_admin" ON public.employees;
DROP POLICY IF EXISTS "emp_delete_admin" ON public.employees;

CREATE POLICY "emp_select_authenticated" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "emp_update_self_or_admin" ON public.employees FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "emp_insert_admin" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "emp_delete_admin" ON public.employees FOR DELETE TO authenticated USING (public.is_admin());

-- evaluation_periods
DROP POLICY IF EXISTS "periods_select_all"            ON public.evaluation_periods;
DROP POLICY IF EXISTS "periods_manage_management"     ON public.evaluation_periods;
DROP POLICY IF EXISTS "period_select_authenticated" ON public.evaluation_periods;
DROP POLICY IF EXISTS "period_insert_admin" ON public.evaluation_periods;
DROP POLICY IF EXISTS "period_update_admin" ON public.evaluation_periods;
DROP POLICY IF EXISTS "period_delete_admin" ON public.evaluation_periods;

CREATE POLICY "period_select_authenticated" ON public.evaluation_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "period_insert_admin" ON public.evaluation_periods FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "period_update_admin" ON public.evaluation_periods FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "period_delete_admin" ON public.evaluation_periods FOR DELETE TO authenticated USING (public.is_admin());

-- evaluation_categories
DROP POLICY IF EXISTS "categories_select_all"         ON public.evaluation_categories;
DROP POLICY IF EXISTS "categories_manage_management"  ON public.evaluation_categories;
DROP POLICY IF EXISTS "cat_select_authenticated" ON public.evaluation_categories;
DROP POLICY IF EXISTS "cat_insert_admin" ON public.evaluation_categories;
DROP POLICY IF EXISTS "cat_update_admin" ON public.evaluation_categories;
DROP POLICY IF EXISTS "cat_delete_admin" ON public.evaluation_categories;

CREATE POLICY "cat_select_authenticated" ON public.evaluation_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "cat_insert_admin" ON public.evaluation_categories FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "cat_update_admin" ON public.evaluation_categories FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "cat_delete_admin" ON public.evaluation_categories FOR DELETE TO authenticated USING (public.is_admin());

-- evaluation_items
DROP POLICY IF EXISTS "items_select_all"              ON public.evaluation_items;
DROP POLICY IF EXISTS "items_manage_management"       ON public.evaluation_items;
DROP POLICY IF EXISTS "item_select_authenticated" ON public.evaluation_items;
DROP POLICY IF EXISTS "item_insert_admin" ON public.evaluation_items;
DROP POLICY IF EXISTS "item_update_admin" ON public.evaluation_items;
DROP POLICY IF EXISTS "item_delete_admin" ON public.evaluation_items;

CREATE POLICY "item_select_authenticated" ON public.evaluation_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_insert_admin" ON public.evaluation_items FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "item_update_admin" ON public.evaluation_items FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "item_delete_admin" ON public.evaluation_items FOR DELETE TO authenticated USING (public.is_admin());

-- evaluation_targets
DROP POLICY IF EXISTS "targets_select_self"           ON public.evaluation_targets;
DROP POLICY IF EXISTS "targets_select_leader"         ON public.evaluation_targets;
DROP POLICY IF EXISTS "targets_select_management"     ON public.evaluation_targets;
DROP POLICY IF EXISTS "targets_manage_management"     ON public.evaluation_targets;
DROP POLICY IF EXISTS "target_select_own" ON public.evaluation_targets;
DROP POLICY IF EXISTS "target_select_leader_dept" ON public.evaluation_targets;
DROP POLICY IF EXISTS "target_select_director_up" ON public.evaluation_targets;
DROP POLICY IF EXISTS "target_update_admin" ON public.evaluation_targets;
DROP POLICY IF EXISTS "target_insert_admin" ON public.evaluation_targets;
DROP POLICY IF EXISTS "target_delete_admin" ON public.evaluation_targets;

CREATE POLICY "target_select_own" ON public.evaluation_targets FOR SELECT TO authenticated
  USING (employee_id = auth.uid());
CREATE POLICY "target_select_leader_dept" ON public.evaluation_targets FOR SELECT TO authenticated
  USING (public.get_my_role() = 'leader' AND EXISTS (
    SELECT 1 FROM public.employees e WHERE e.id = evaluation_targets.employee_id
    AND e.department_id = public.get_my_department_id()));
CREATE POLICY "target_select_director_up" ON public.evaluation_targets FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('director', 'division_head', 'ceo', 'admin'));
CREATE POLICY "target_update_admin" ON public.evaluation_targets FOR UPDATE TO authenticated
  USING (public.is_admin());
CREATE POLICY "target_insert_admin" ON public.evaluation_targets FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "target_delete_admin" ON public.evaluation_targets FOR DELETE TO authenticated
  USING (public.is_admin());

-- self_evaluations
DROP POLICY IF EXISTS "self_eval_select_own"        ON public.self_evaluations;
DROP POLICY IF EXISTS "self_eval_select_evaluator"  ON public.self_evaluations;
DROP POLICY IF EXISTS "self_eval_insert_own"        ON public.self_evaluations;
DROP POLICY IF EXISTS "self_eval_update_own"        ON public.self_evaluations;
DROP POLICY IF EXISTS "self_eval_manage_management" ON public.self_evaluations;
DROP POLICY IF EXISTS "self_eval_select_leader"     ON public.self_evaluations;
DROP POLICY IF EXISTS "self_eval_insert_admin" ON public.self_evaluations;
DROP POLICY IF EXISTS "self_eval_delete_admin" ON public.self_evaluations;

CREATE POLICY "self_eval_select_own" ON public.self_evaluations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evaluation_targets t
    WHERE t.id = self_evaluations.target_id AND t.employee_id = auth.uid()));
CREATE POLICY "self_eval_select_evaluator" ON public.self_evaluations FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('leader', 'director', 'division_head', 'ceo', 'admin') AND EXISTS (
    SELECT 1 FROM public.evaluation_targets t WHERE t.id = self_evaluations.target_id AND (
      public.get_my_role() NOT IN ('leader') OR EXISTS (
        SELECT 1 FROM public.employees e WHERE e.id = t.employee_id
        AND e.department_id = public.get_my_department_id()))));
CREATE POLICY "self_eval_insert_own" ON public.self_evaluations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.evaluation_targets t
    WHERE t.id = self_evaluations.target_id AND t.employee_id = auth.uid() AND t.status = 'pending'));
CREATE POLICY "self_eval_update_own" ON public.self_evaluations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evaluation_targets t
    WHERE t.id = self_evaluations.target_id AND t.employee_id = auth.uid() AND t.status = 'pending'));
CREATE POLICY "self_eval_insert_admin" ON public.self_evaluations FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "self_eval_delete_admin" ON public.self_evaluations FOR DELETE TO authenticated
  USING (public.is_admin());

-- evaluator_scores
DROP POLICY IF EXISTS "eval_scores_own"               ON public.evaluator_scores;
DROP POLICY IF EXISTS "eval_scores_select_employee"   ON public.evaluator_scores;
DROP POLICY IF EXISTS "eval_scores_select_management" ON public.evaluator_scores;
DROP POLICY IF EXISTS "eval_score_select_own_target" ON public.evaluator_scores;
DROP POLICY IF EXISTS "eval_score_select_my_scores" ON public.evaluator_scores;
DROP POLICY IF EXISTS "eval_score_select_admin" ON public.evaluator_scores;
DROP POLICY IF EXISTS "eval_score_insert_my_turn" ON public.evaluator_scores;
DROP POLICY IF EXISTS "eval_score_update_my_turn" ON public.evaluator_scores;

CREATE POLICY "eval_score_select_own_target" ON public.evaluator_scores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evaluation_targets t
    WHERE t.id = evaluator_scores.target_id AND t.employee_id = auth.uid()));
CREATE POLICY "eval_score_select_my_scores" ON public.evaluator_scores FOR SELECT TO authenticated
  USING (evaluator_id = auth.uid());
CREATE POLICY "eval_score_select_admin" ON public.evaluator_scores FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY "eval_score_insert_my_turn" ON public.evaluator_scores FOR INSERT TO authenticated
  WITH CHECK (evaluator_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.evaluation_targets t WHERE t.id = evaluator_scores.target_id AND (
      (evaluator_scores.evaluator_role = 'leader'   AND t.status = 'self_done') OR
      (evaluator_scores.evaluator_role = 'director' AND t.status = 'leader_done') OR
      (evaluator_scores.evaluator_role = 'ceo'      AND t.status = 'director_done'))));
CREATE POLICY "eval_score_update_my_turn" ON public.evaluator_scores FOR UPDATE TO authenticated
  USING (evaluator_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.evaluation_targets t WHERE t.id = evaluator_scores.target_id AND (
      (evaluator_scores.evaluator_role = 'leader'   AND t.status = 'self_done') OR
      (evaluator_scores.evaluator_role = 'director' AND t.status = 'leader_done') OR
      (evaluator_scores.evaluator_role = 'ceo'      AND t.status = 'director_done'))));

-- evaluator_comments
DROP POLICY IF EXISTS "eval_comments_own"               ON public.evaluator_comments;
DROP POLICY IF EXISTS "eval_comments_select_employee"   ON public.evaluator_comments;
DROP POLICY IF EXISTS "eval_comments_select_management" ON public.evaluator_comments;
DROP POLICY IF EXISTS "eval_comment_select_own_target" ON public.evaluator_comments;
DROP POLICY IF EXISTS "eval_comment_select_my_comments" ON public.evaluator_comments;
DROP POLICY IF EXISTS "eval_comment_select_admin" ON public.evaluator_comments;
DROP POLICY IF EXISTS "eval_comment_insert_my_turn" ON public.evaluator_comments;
DROP POLICY IF EXISTS "eval_comment_update_my_turn" ON public.evaluator_comments;

CREATE POLICY "eval_comment_select_own_target" ON public.evaluator_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evaluation_targets t
    WHERE t.id = evaluator_comments.target_id AND t.employee_id = auth.uid()));
CREATE POLICY "eval_comment_select_my_comments" ON public.evaluator_comments FOR SELECT TO authenticated
  USING (evaluator_id = auth.uid());
CREATE POLICY "eval_comment_select_admin" ON public.evaluator_comments FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY "eval_comment_insert_my_turn" ON public.evaluator_comments FOR INSERT TO authenticated
  WITH CHECK (evaluator_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.evaluation_targets t WHERE t.id = evaluator_comments.target_id AND (
      (evaluator_comments.evaluator_role = 'leader'   AND t.status = 'self_done') OR
      (evaluator_comments.evaluator_role = 'director' AND t.status = 'leader_done') OR
      (evaluator_comments.evaluator_role = 'ceo'      AND t.status = 'director_done'))));
CREATE POLICY "eval_comment_update_my_turn" ON public.evaluator_comments FOR UPDATE TO authenticated
  USING (evaluator_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.evaluation_targets t WHERE t.id = evaluator_comments.target_id AND (
      (evaluator_comments.evaluator_role = 'leader'   AND t.status = 'self_done') OR
      (evaluator_comments.evaluator_role = 'director' AND t.status = 'leader_done') OR
      (evaluator_comments.evaluator_role = 'ceo'      AND t.status = 'director_done'))));

-- evaluation_weights
DROP POLICY IF EXISTS "weights_select_all"            ON public.evaluation_weights;
DROP POLICY IF EXISTS "weights_manage_management"     ON public.evaluation_weights;
DROP POLICY IF EXISTS "weight_select_authenticated" ON public.evaluation_weights;
DROP POLICY IF EXISTS "weight_insert_admin" ON public.evaluation_weights;
DROP POLICY IF EXISTS "weight_update_admin" ON public.evaluation_weights;
DROP POLICY IF EXISTS "weight_delete_admin" ON public.evaluation_weights;

CREATE POLICY "weight_select_authenticated" ON public.evaluation_weights FOR SELECT TO authenticated USING (true);
CREATE POLICY "weight_insert_admin" ON public.evaluation_weights FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "weight_update_admin" ON public.evaluation_weights FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "weight_delete_admin" ON public.evaluation_weights FOR DELETE TO authenticated USING (public.is_admin());

-- grade_criteria
DROP POLICY IF EXISTS "grade_criteria_select_all" ON public.grade_criteria;
DROP POLICY IF EXISTS "grade_criteria_manage_admin" ON public.grade_criteria;
DROP POLICY IF EXISTS "grade_criteria_manage_management" ON public.grade_criteria;

CREATE POLICY "grade_criteria_select_all" ON public.grade_criteria FOR SELECT TO authenticated USING (true);
CREATE POLICY "grade_criteria_manage_admin" ON public.grade_criteria FOR ALL TO authenticated USING (public.is_admin());

-- ai_settings
DROP POLICY IF EXISTS "ai_settings_admin_select" ON public.ai_settings;
DROP POLICY IF EXISTS "ai_settings_admin_insert" ON public.ai_settings;
DROP POLICY IF EXISTS "ai_settings_admin_update" ON public.ai_settings;
DROP POLICY IF EXISTS "ai_settings_admin_delete" ON public.ai_settings;

CREATE POLICY "ai_settings_admin_select" ON public.ai_settings FOR SELECT USING (public.is_admin());
CREATE POLICY "ai_settings_admin_insert" ON public.ai_settings FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "ai_settings_admin_update" ON public.ai_settings FOR UPDATE USING (public.is_admin());
CREATE POLICY "ai_settings_admin_delete" ON public.ai_settings FOR DELETE USING (public.is_admin());

-- ai_reports
DROP POLICY IF EXISTS "ai_reports_admin_select" ON public.ai_reports;
DROP POLICY IF EXISTS "ai_reports_admin_insert" ON public.ai_reports;
DROP POLICY IF EXISTS "ai_reports_admin_update" ON public.ai_reports;
DROP POLICY IF EXISTS "ai_reports_admin_delete" ON public.ai_reports;

CREATE POLICY "ai_reports_admin_select" ON public.ai_reports FOR SELECT USING (public.is_admin());
CREATE POLICY "ai_reports_admin_insert" ON public.ai_reports FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "ai_reports_admin_update" ON public.ai_reports FOR UPDATE USING (public.is_admin());
CREATE POLICY "ai_reports_admin_delete" ON public.ai_reports FOR DELETE USING (public.is_admin());

-- storage avatars
DROP POLICY IF EXISTS "avatars_upload" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;
DROP POLICY IF EXISTS "avatars_read" ON storage.objects;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "avatars_read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');

-- =====================================================================
-- 7. 시드 데이터 복원 (비어 있는 경우만)
-- =====================================================================

-- 부서
INSERT INTO public.departments (id, name) VALUES
  ('10000000-0000-0000-0000-000000000001', '브랜드사업본부'),
  ('10000000-0000-0000-0000-000000000002', '경영지원본부'),
  ('10000000-0000-0000-0000-000000000003', '뉴미디어사업본부'),
  ('10000000-0000-0000-0000-000000000004', 'IT사업본부')
ON CONFLICT (id) DO NOTHING;

-- 평가 카테고리
INSERT INTO public.evaluation_categories (id, name, weight, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000001', '업적평가', 0.7, 1),
  ('20000000-0000-0000-0000-000000000002', '역량평가', 0.3, 2)
ON CONFLICT (id) DO NOTHING;

-- 평가 항목 (evaluation_type 포함)
INSERT INTO public.evaluation_items (category_id, name, description, max_score, sort_order, evaluation_type)
SELECT * FROM (VALUES
  ('20000000-0000-0000-0000-000000000001'::uuid, '상품 이익률 및 원가 관리',     '상품별 이익률 목표 달성도 및 원가 절감 노력을 평가합니다.', 10, 1, 'quantitative'),
  ('20000000-0000-0000-0000-000000000001'::uuid, '신제품 기획 및 라인업 전략',   '신규 상품 기획력과 브랜드 라인업 확장 전략의 적절성을 평가합니다.', 10, 2, 'qualitative'),
  ('20000000-0000-0000-0000-000000000001'::uuid, '프로모션 기획 및 마케팅 효율', '프로모션 성과(매출, ROI)와 마케팅 기획의 창의성을 종합 평가합니다.', 10, 3, 'mixed'),
  ('20000000-0000-0000-0000-000000000001'::uuid, '수요 예측 및 재고 관리',       '수요 예측 정확도와 적정 재고 수준 유지 능력을 평가합니다.', 10, 4, 'quantitative'),
  ('20000000-0000-0000-0000-000000000001'::uuid, '브랜드 톤앤매너 및 품질 관리', '브랜드 일관성 유지 및 상품 품질 관리 역량을 평가합니다.', 10, 5, 'qualitative'),
  ('20000000-0000-0000-0000-000000000001'::uuid, '트렌드 분석 및 경쟁사 대응',   '시장 트렌드 파악 능력과 경쟁사 동향 대응 전략을 평가합니다.', 10, 6, 'qualitative'),
  ('20000000-0000-0000-0000-000000000001'::uuid, '일정 준수 및 유관 부서 리딩',  '프로젝트 일정 준수율과 유관 부서 간 협업 리더십을 평가합니다.', 10, 7, 'mixed'),
  ('20000000-0000-0000-0000-000000000002'::uuid, '근태 및 사내 규정 준수',     '출결 관리, 근태 기록 및 사내 규정 준수 여부를 평가합니다.', 10, 1, 'quantitative'),
  ('20000000-0000-0000-0000-000000000002'::uuid, '커뮤니케이션 및 보고 태도',  '업무 보고의 적시성, 정확성 및 동료 간 소통 능력을 평가합니다.', 10, 2, 'qualitative'),
  ('20000000-0000-0000-0000-000000000002'::uuid, '업무 적극성 및 조직 적응',   '업무에 대한 적극적인 태도와 조직 문화 적응력을 평가합니다.', 10, 3, 'qualitative')
) AS t(category_id, name, description, max_score, sort_order, evaluation_type)
WHERE NOT EXISTS (SELECT 1 FROM public.evaluation_items LIMIT 1);

-- 평가 기간
INSERT INTO public.evaluation_periods (id, year, quarter, status, start_date, end_date) VALUES
  ('30000000-0000-0000-0000-000000000001', 2026, 1, 'in_progress', '2026-01-01', '2026-03-31')
ON CONFLICT (id) DO NOTHING;

-- 등급 기준
INSERT INTO public.grade_criteria (grade, min_score, max_score, label) VALUES
  ('S', 90, 100, '탁월'),
  ('A', 80, 89,  '우수'),
  ('B', 70, 79,  '보통'),
  ('C', 60, 69,  '미흡'),
  ('D', 0,  59,  '부진')
ON CONFLICT (grade) DO NOTHING;

-- 기본 가중치
INSERT INTO public.evaluation_weights (period_id, evaluator_role, weight) VALUES
  ('30000000-0000-0000-0000-000000000001', 'self',     0.10),
  ('30000000-0000-0000-0000-000000000001', 'leader',   0.40),
  ('30000000-0000-0000-0000-000000000001', 'director', 0.30),
  ('30000000-0000-0000-0000-000000000001', 'ceo',      0.20)
ON CONFLICT (period_id, evaluator_role) DO UPDATE SET weight = EXCLUDED.weight;

-- =====================================================================
-- 8. 관리자 계정 (없으면 생성)
-- =====================================================================
DO $$
DECLARE
  v_user_id uuid;
  v_now     timestamptz := now();
  v_password text;
BEGIN
  -- 이미 관리자가 있는지 확인
  IF EXISTS (SELECT 1 FROM public.employees WHERE email = 'admin@interohrigin.com') THEN
    RAISE NOTICE '관리자 계정이 이미 존재합니다.';
    RETURN;
  END IF;

  v_user_id := gen_random_uuid();
  v_password := crypt('AdminPassword123!', gen_salt('bf'));

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token
  ) VALUES (
    v_user_id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'admin@interohrigin.com', v_password, v_now,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"시스템관리자"}'::jsonb,
    v_now, v_now, '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id, v_user_id, 'admin@interohrigin.com', 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', 'admin@interohrigin.com', 'email_verified', true),
    v_now, v_now, v_now
  );

  INSERT INTO public.employees (id, email, name, role, is_active)
  VALUES (v_user_id, 'admin@interohrigin.com', '시스템관리자', 'ceo', true);

  RAISE NOTICE '관리자 계정 생성 완료: admin@interohrigin.com / AdminPassword123!';
END $$;

-- =====================================================================
-- 완료!
-- =====================================================================
