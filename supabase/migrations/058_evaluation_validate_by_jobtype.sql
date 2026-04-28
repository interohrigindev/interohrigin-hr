-- 058_evaluation_validate_by_jobtype.sql
-- 목적: advance_evaluation_stage 의 항목 검증을 직무별 필터링과 일치시킴
--   현 상태: self_evaluations 행 수 전체로 카운트 → 직무 미매핑 항목(stale)이 score=NULL 로 남으면 제출 차단
--   수정 후: 직원 직무에 매핑된 항목 또는 매핑 없는 범용 항목만 카운트
--           is_active=false 인 항목도 검증에서 제외

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
  v_employee_id      uuid;
  v_employee_role    text;
  v_employee_dept_id uuid;
  v_job_type_id      uuid;
  v_has_leader       boolean;
BEGIN
  SELECT status, employee_id INTO v_current_status, v_employee_id
  FROM evaluation_targets WHERE id = p_target_id;
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

  -- 직원 직무 조회 (없으면 모든 항목 대상)
  SELECT job_type_id INTO v_job_type_id
  FROM employee_job_assignments WHERE employee_id = v_employee_id
  ORDER BY assigned_at DESC NULLS LAST LIMIT 1;

  -- 직무 + 활성 + 매핑 조건에 맞는 항목만 카운트
  WITH eligible_items AS (
    SELECT i.id FROM evaluation_items i
    WHERE i.is_active = true
      AND (
        v_job_type_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM evaluation_item_job_types m WHERE m.item_id = i.id)
        OR EXISTS (SELECT 1 FROM evaluation_item_job_types m
                   WHERE m.item_id = i.id AND m.job_type_id = v_job_type_id)
      )
  )
  SELECT COUNT(*) INTO v_total_items
  FROM self_evaluations se
  WHERE se.target_id = p_target_id
    AND se.item_id IN (SELECT id FROM eligible_items);

  IF p_role = 'self' THEN
    WITH eligible_items AS (
      SELECT i.id FROM evaluation_items i
      WHERE i.is_active = true
        AND (
          v_job_type_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM evaluation_item_job_types m WHERE m.item_id = i.id)
          OR EXISTS (SELECT 1 FROM evaluation_item_job_types m
                     WHERE m.item_id = i.id AND m.job_type_id = v_job_type_id)
        )
    )
    SELECT COUNT(*) INTO v_scored_items
    FROM self_evaluations se
    WHERE se.target_id = p_target_id
      AND se.score IS NOT NULL
      AND se.item_id IN (SELECT id FROM eligible_items);

    v_missing := v_total_items - v_scored_items;
    IF v_missing > 0 THEN
      RAISE EXCEPTION '자기평가 미입력 항목이 %개 있습니다.', v_missing;
    END IF;
    UPDATE self_evaluations SET is_draft = false WHERE target_id = p_target_id;
  ELSE
    WITH eligible_items AS (
      SELECT i.id FROM evaluation_items i
      WHERE i.is_active = true
        AND (
          v_job_type_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM evaluation_item_job_types m WHERE m.item_id = i.id)
          OR EXISTS (SELECT 1 FROM evaluation_item_job_types m
                     WHERE m.item_id = i.id AND m.job_type_id = v_job_type_id)
        )
    )
    SELECT COUNT(*) INTO v_scored_items
    FROM evaluator_scores es
    WHERE es.target_id = p_target_id
      AND es.evaluator_role = p_role
      AND es.score IS NOT NULL
      AND es.item_id IN (SELECT id FROM eligible_items);

    v_missing := v_total_items - v_scored_items;
    IF v_missing > 0 THEN
      RAISE EXCEPTION '% 평가 미입력 항목이 %개 있습니다.', p_role, v_missing;
    END IF;
    UPDATE evaluator_scores SET is_draft = false
    WHERE target_id = p_target_id AND evaluator_role = p_role;
  END IF;

  UPDATE evaluation_targets SET status = v_next_status WHERE id = p_target_id;

  -- 자기평가 제출 후 leader_done 자동 스킵 (056 로직 유지)
  IF p_role = 'self' AND v_next_status = 'self_done' THEN
    SELECT e.role, e.department_id INTO v_employee_role, v_employee_dept_id
    FROM evaluation_targets t JOIN employees e ON e.id = t.employee_id
    WHERE t.id = p_target_id;

    IF v_employee_role = 'leader' THEN
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
