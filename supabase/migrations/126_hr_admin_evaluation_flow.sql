-- 126: hr_admin 직원 자기평가 워크플로우 통합
--
-- 배경:
--   TabEmployees.tsx 의 SELF_EVAL_ELIGIBLE_ROLES 에 'hr_admin' 추가 후, 평가
--   워크플로우에 잠재 회귀 다수 발견:
--     A) generate_evaluation_sheets RPC 가 자동 등록 대상에 'hr_admin' 제외
--        → 인사담당 직원이 평가 기간 생성 시 evaluation_targets 자동 생성 안 됨
--     B) advance_evaluation_stage RPC 의 leader_done 자동 스킵 로직이 'leader' 만
--        감지 → hr_admin 직원이 자기평가 제출 후 leader 평가 대기 영구 멈춤
--
-- 정책 결정 (ROLE_HIERARCHY 일관):
--   hr_admin = leader 동급 (ROLE_HIERARCHY 둘 다 2)
--   · 자기평가 대상: ✅ 자동 등록
--   · 자기평가 제출 후 leader_done 자동 스킵: hr_admin 자체가 leader 역할 겸직
--     이므로 leader 평가 단계 건너뛰고 바로 director 평가로 진입
--   · 평가 진행자로 참여 시: evaluator_role='leader' 로 매핑 (DB CHECK 변경 불필요)
--
-- evaluator_scores.evaluator_role CHECK 는 그대로 유지 ('leader','director','ceo').
-- 가중치(evaluation_weights) 와 calculate_final_score 변경 불필요 — 영향 최소화.

BEGIN;

-- ─── 1) generate_evaluation_sheets — 자동 등록 대상에 hr_admin 포함 ─────
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

  -- hr_admin 도 자기평가 대상 (126 fix) — leader 동급
  FOR v_employee_id IN
    SELECT id FROM employees
    WHERE is_active = true AND role IN ('employee', 'leader', 'hr_admin')
  LOOP
    SELECT job_type_id INTO v_job_type_id
    FROM employee_job_assignments
    WHERE employee_id = v_employee_id
    ORDER BY assigned_at DESC
    LIMIT 1;

    INSERT INTO evaluation_targets (period_id, employee_id, job_type_id, status)
    VALUES (p_period_id, v_employee_id, v_job_type_id, 'pending')
    ON CONFLICT (period_id, employee_id) DO NOTHING
    RETURNING id INTO v_target_id;

    IF v_target_id IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_evaluation_sheets(uuid) TO authenticated;

COMMENT ON FUNCTION public.generate_evaluation_sheets(uuid) IS
  '평가 기간 생성 시 활성 직원(employee/leader/hr_admin)에 대해 evaluation_targets 자동 등록 (126: hr_admin 포함).';

-- ─── 2) advance_evaluation_stage — hr_admin 자동 스킵 ────────────────────
-- 074 정의 base + leader_done 자동 스킵에 hr_admin 추가
CREATE OR REPLACE FUNCTION public.advance_evaluation_stage(p_target_id uuid, p_role text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_status   text;
  v_expected_status  text;
  v_next_status      text;
  v_total_items      integer;
  v_scored_items     integer;
  v_missing          integer;
  v_employee_role    text;
  v_employee_dept_id uuid;
  v_has_leader       boolean;
  v_evaluator_id     uuid;
  v_total_execs      integer;
  v_evaluated_execs  integer;
BEGIN
  v_evaluator_id := auth.uid();

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
    WHERE target_id = p_target_id
      AND evaluator_role = p_role
      AND evaluator_id = v_evaluator_id
      AND score IS NOT NULL;
    v_missing := v_total_items - v_scored_items;
    IF v_missing > 0 THEN
      RAISE EXCEPTION '% 평가 미입력 항목이 %개 있습니다.', p_role, v_missing;
    END IF;
    UPDATE evaluator_scores SET is_draft = false
    WHERE target_id = p_target_id
      AND evaluator_role = p_role
      AND evaluator_id = v_evaluator_id;
  END IF;

  IF p_role = 'director' THEN
    SELECT COUNT(*) INTO v_total_execs
    FROM employees
    WHERE role IN ('director','division_head') AND is_active = true;

    SELECT COUNT(DISTINCT evaluator_id) INTO v_evaluated_execs
    FROM evaluator_scores
    WHERE target_id = p_target_id
      AND evaluator_role = 'director'
      AND score IS NOT NULL
      AND is_draft = false;

    IF v_evaluated_execs < v_total_execs THEN
      RETURN v_current_status;
    END IF;
  END IF;

  UPDATE evaluation_targets SET status = v_next_status WHERE id = p_target_id;

  -- 자기평가 제출 후 leader_done 자동 스킵
  -- 126 fix: hr_admin 도 leader 역할 겸직으로 간주 → 자동 leader_done 스킵
  -- (인사담당 본인은 본인을 leader 로서 평가하지 않으므로 다음 단계인 director 로 직진)
  IF p_role = 'self' AND v_next_status = 'self_done' THEN
    SELECT e.role, e.department_id
      INTO v_employee_role, v_employee_dept_id
    FROM evaluation_targets t
    JOIN employees e ON e.id = t.employee_id
    WHERE t.id = p_target_id;

    IF v_employee_role IN ('leader', 'hr_admin') THEN
      UPDATE evaluation_targets SET status = 'leader_done' WHERE id = p_target_id;
      RETURN 'leader_done';
    END IF;

    IF v_employee_dept_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM employees
        WHERE department_id = v_employee_dept_id
          AND role = 'leader'
          AND is_active = true
      ) INTO v_has_leader;
      IF NOT v_has_leader THEN
        UPDATE evaluation_targets SET status = 'leader_done' WHERE id = p_target_id;
        RETURN 'leader_done';
      END IF;
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
GRANT EXECUTE ON FUNCTION public.advance_evaluation_stage(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.advance_evaluation_stage(uuid, text) IS
  '평가 단계 전이 RPC (126: hr_admin 자기평가 제출 시 leader_done 자동 스킵 추가).';

COMMIT;
