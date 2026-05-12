-- 0512 미팅: 평가 워크플로우 재정의 — 임원 단계 병렬 처리
--   팀 리더 있음: 자기평가 → 팀 리더 → 부서 임원 + 타부서 임원 (병렬) → 대표
--   팀 리더 없음: 자기평가 → 부서 임원 + 타부서 임원 (병렬) → 대표
--   임원 단계: 활성 director/division_head 전원 평가 후 director_done 진행
--
-- 변경 사항:
--   1) evaluator_scores / evaluator_comments UNIQUE 에 evaluator_id 추가 (다수 임원 평가 허용)
--   2) advance_evaluation_stage RPC — per-evaluator 진행 + director 단계는 전원 완료 후 통과
--   3) calculate_final_score RPC — director per-item 평균 사용

-- ─── 1. UNIQUE 제약 변경 ─────────────────────────────────────────
ALTER TABLE public.evaluator_scores
  DROP CONSTRAINT IF EXISTS evaluator_scores_target_id_item_id_evaluator_role_key;
ALTER TABLE public.evaluator_scores
  ADD CONSTRAINT evaluator_scores_unique_eval
  UNIQUE (target_id, item_id, evaluator_role, evaluator_id);

ALTER TABLE public.evaluator_comments
  DROP CONSTRAINT IF EXISTS evaluator_comments_target_id_evaluator_role_key;
ALTER TABLE public.evaluator_comments
  ADD CONSTRAINT evaluator_comments_unique_eval
  UNIQUE (target_id, evaluator_role, evaluator_id);

-- ─── 2. advance_evaluation_stage 재정의 ─────────────────────────
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
    -- 본인(현재 호출자) 의 평가만 검사·확정. 다른 임원의 row 는 건드리지 않음.
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

  -- director 단계: 활성 임원 전원이 평가 완료해야 director_done 으로 진행
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
      -- 일부 임원만 완료 — status 변경 안 함, 다른 임원 평가 대기
      RETURN v_current_status;
    END IF;
  END IF;

  UPDATE evaluation_targets SET status = v_next_status WHERE id = p_target_id;

  -- 자기평가 제출 후 leader_done 자동 스킵: 본인이 리더이거나 부서에 리더 부재
  IF p_role = 'self' AND v_next_status = 'self_done' THEN
    SELECT e.role, e.department_id
      INTO v_employee_role, v_employee_dept_id
    FROM evaluation_targets t
    JOIN employees e ON e.id = t.employee_id
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

-- ─── 3. calculate_final_score 재정의 ────────────────────────────
-- director 점수는 임원 다수가 동일 item 에 평가 → per-item 평균 후 합산
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
  IF v_period_id IS NULL THEN RAISE EXCEPTION '평가 대상을 찾을 수 없습니다: %', p_target_id; END IF;

  SELECT SUM(score) INTO v_self_total FROM self_evaluations
    WHERE target_id = p_target_id AND score IS NOT NULL AND is_draft = false;

  -- leader/ceo 는 평가자 1명 → 합계 그대로
  SELECT SUM(score) INTO v_leader_total FROM evaluator_scores
    WHERE target_id = p_target_id AND evaluator_role = 'leader' AND score IS NOT NULL AND is_draft = false;
  SELECT SUM(score) INTO v_ceo_total FROM evaluator_scores
    WHERE target_id = p_target_id AND evaluator_role = 'ceo' AND score IS NOT NULL AND is_draft = false;

  -- director 는 다수 임원 평가 → per-item 평균 후 합산
  SELECT SUM(item_avg) INTO v_director_total FROM (
    SELECT AVG(score) AS item_avg
    FROM evaluator_scores
    WHERE target_id = p_target_id AND evaluator_role = 'director' AND score IS NOT NULL AND is_draft = false
    GROUP BY item_id
  ) per_item;

  -- self
  IF v_self_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'self';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_self_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;
  IF v_leader_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'leader';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_leader_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;
  IF v_director_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'director';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_director_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;
  IF v_ceo_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'ceo';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_ceo_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;

  IF v_weight_sum > 0 THEN v_score := ROUND(v_weighted_sum / v_weight_sum, 2); ELSE v_score := NULL; END IF;

  v_grade := CASE WHEN v_score IS NULL THEN NULL WHEN v_score >= 90 THEN 'S' WHEN v_score >= 80 THEN 'A' WHEN v_score >= 70 THEN 'B' WHEN v_score >= 60 THEN 'C' ELSE 'D' END;

  UPDATE evaluation_targets SET final_score = v_score, grade = v_grade WHERE id = p_target_id;
  RETURN jsonb_build_object('score', v_score, 'grade', v_grade);
END;
$$;
GRANT EXECUTE ON FUNCTION public.calculate_final_score(uuid) TO authenticated;
