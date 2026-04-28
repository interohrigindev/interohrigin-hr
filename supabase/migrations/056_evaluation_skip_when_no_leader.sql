-- 056_evaluation_skip_when_no_leader.sql
-- 목적: 평가 대상 직원의 부서에 '리더'가 없으면 self_done → leader_done 으로 자동 스킵
--       (미팅노트 결재흐름: 리더 있으면 리더 → 임원 → 대표 / 리더 없으면 임원 → 대표)

DROP FUNCTION IF EXISTS public.advance_evaluation_stage(uuid, text);
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

  -- D-FIX: 자기평가 제출 후 leader_done 자동 스킵 조건 확장
  --   1) 본인이 'leader' 역할 (자기 자신을 리더가 평가할 수 없음)
  --   2) 부서에 활성 'leader' 가 1명도 없음 (리더 부재 부서)
  IF p_role = 'self' AND v_next_status = 'self_done' THEN
    SELECT e.role, e.department_id
      INTO v_employee_role, v_employee_dept_id
    FROM evaluation_targets t
    JOIN employees e ON e.id = t.employee_id
    WHERE t.id = p_target_id;

    -- 본인이 리더면 스킵
    IF v_employee_role = 'leader' THEN
      UPDATE evaluation_targets SET status = 'leader_done' WHERE id = p_target_id;
      RETURN 'leader_done';
    END IF;

    -- 부서에 리더가 없으면 스킵 → 임원이 바로 평가
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
