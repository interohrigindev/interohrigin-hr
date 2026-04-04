-- 042_evaluation_system_upgrade.sql
-- 인사평가 시스템 업그레이드: 직무별 평가, 2회 제출, HR 공개, 편집 잠금
-- PRO DB (ckzbzumycmgkcpyhlclb) 에서 실행할 것!

-- ============================================================
-- 1. advance_evaluation_stage 버그 수정 (p_current_role → p_role)
--    + 직무별 아이템 수 대응 (self_evaluations 행 기준 카운트)
-- ============================================================

DROP FUNCTION IF EXISTS public.advance_evaluation_stage(uuid, text);
CREATE OR REPLACE FUNCTION public.advance_evaluation_stage(p_target_id uuid, p_role text)
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

  CASE p_role
    WHEN 'self'     THEN v_expected_status := 'pending';       v_next_status := 'self_done';
    WHEN 'leader'   THEN v_expected_status := 'self_done';     v_next_status := 'leader_done';
    WHEN 'director' THEN v_expected_status := 'leader_done';   v_next_status := 'director_done';
    WHEN 'ceo'      THEN v_expected_status := 'director_done'; v_next_status := 'ceo_done';
    ELSE RAISE EXCEPTION '잘못된 평가자 역할입니다: %', p_role;
  END CASE;

  IF v_current_status <> v_expected_status THEN
    RAISE EXCEPTION '현재 단계(%)에서 % 역할이 평가를 진행할 수 없습니다.', v_current_status, p_role;
  END IF;

  -- 해당 target에 배정된 self_evaluations 행 수 기준 (직무별 필터링 대응)
  SELECT COUNT(*) INTO v_total_items FROM self_evaluations WHERE target_id = p_target_id;

  IF p_role = 'self' THEN
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
    WHERE target_id = p_target_id AND evaluator_role = p_role AND score IS NOT NULL;
    v_missing := v_total_items - v_scored_items;
    IF v_missing > 0 THEN
      RAISE EXCEPTION '% 평가 미입력 항목이 %개 있습니다.', p_role, v_missing;
    END IF;
    UPDATE evaluator_scores SET is_draft = false
    WHERE target_id = p_target_id AND evaluator_role = p_role;
  END IF;

  UPDATE evaluation_targets SET status = v_next_status WHERE id = p_target_id;

  -- 리더 자기평가 완료 시 leader_done 자동 스킵
  IF p_role = 'self' AND v_next_status = 'self_done' THEN
    SELECT e.role INTO v_employee_role
    FROM evaluation_targets t JOIN employees e ON e.id = t.employee_id
    WHERE t.id = p_target_id;
    IF v_employee_role = 'leader' THEN
      UPDATE evaluation_targets SET status = 'leader_done' WHERE id = p_target_id;
      RETURN 'leader_done';
    END IF;
  END IF;

  IF v_next_status = 'ceo_done' THEN
    PERFORM calculate_final_score(p_target_id);
    UPDATE evaluation_targets SET status = 'completed' WHERE id = p_target_id;
    RETURN 'completed';
  END IF;

  RETURN v_next_status;
END;
$$;


-- ============================================================
-- 2. 직무 유형 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS public.job_types (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text    NOT NULL UNIQUE,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.job_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_types_select_authenticated" ON public.job_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "job_types_manage_admin" ON public.job_types
  FOR ALL TO authenticated USING (public.is_admin());

-- 기본 직무 유형 시드
INSERT INTO public.job_types (name, sort_order) VALUES
  ('BM', 1),
  ('마케팅', 2),
  ('디자인', 3),
  ('개발', 4),
  ('경영지원', 5)
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- 3. 직원-직무 매핑 테이블 (employees ALTER 금지 대응)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employee_job_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  job_type_id uuid NOT NULL REFERENCES public.job_types(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (employee_id)
);

ALTER TABLE public.employee_job_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eja_select_authenticated" ON public.employee_job_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "eja_manage_admin" ON public.employee_job_assignments
  FOR ALL TO authenticated USING (public.is_admin());


-- ============================================================
-- 4. 평가항목-직무 매핑 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS public.evaluation_item_job_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.evaluation_items(id) ON DELETE CASCADE,
  job_type_id uuid NOT NULL REFERENCES public.job_types(id) ON DELETE CASCADE,
  UNIQUE (item_id, job_type_id)
);

ALTER TABLE public.evaluation_item_job_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eijt_select_authenticated" ON public.evaluation_item_job_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "eijt_manage_admin" ON public.evaluation_item_job_types
  FOR ALL TO authenticated USING (public.is_admin());


-- ============================================================
-- 5. evaluation_targets 확장 (2회 제출 + 직원별 공개)
-- ============================================================

ALTER TABLE public.evaluation_targets
  ADD COLUMN IF NOT EXISTS goals_submitted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS goals_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES public.employees(id);


-- ============================================================
-- 6. evaluation_periods 확장 (편집 잠금)
-- ============================================================

ALTER TABLE public.evaluation_periods
  ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;


-- ============================================================
-- 7. generate_evaluation_sheets 함수 업데이트 (직무별 항목 필터링)
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_evaluation_sheets(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target_id   uuid;
  v_employee_id uuid;
  v_job_type_id uuid;
  v_count       integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM evaluation_periods WHERE id = p_period_id) THEN
    RAISE EXCEPTION '평가 기간을 찾을 수 없습니다: %', p_period_id;
  END IF;

  FOR v_employee_id IN
    SELECT id FROM employees
    WHERE is_active = true AND role IN ('employee', 'leader')
  LOOP
    -- 직원의 직무 유형 조회
    SELECT job_type_id INTO v_job_type_id
    FROM employee_job_assignments
    WHERE employee_id = v_employee_id;

    INSERT INTO evaluation_targets (period_id, employee_id, status)
    VALUES (p_period_id, v_employee_id, 'pending')
    ON CONFLICT (period_id, employee_id) DO NOTHING
    RETURNING id INTO v_target_id;

    IF v_target_id IS NOT NULL THEN
      -- 직무에 맞는 항목 + 범용 항목(매핑 없는 항목) 삽입
      INSERT INTO self_evaluations (target_id, item_id)
      SELECT v_target_id, i.id
      FROM evaluation_items i
      WHERE i.is_active = true
        AND (
          -- 매핑이 없는 항목 = 모든 직무에 적용 (범용)
          NOT EXISTS (
            SELECT 1 FROM evaluation_item_job_types eijt WHERE eijt.item_id = i.id
          )
          OR
          -- 직원의 직무에 매핑된 항목
          (v_job_type_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM evaluation_item_job_types eijt
            WHERE eijt.item_id = i.id AND eijt.job_type_id = v_job_type_id
          ))
          OR
          -- 직무 미배정 직원 → 모든 항목
          v_job_type_id IS NULL
        )
      ON CONFLICT (target_id, item_id) DO NOTHING;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
