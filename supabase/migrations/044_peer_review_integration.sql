-- 044_peer_review_integration.sql
-- 동료 평가 최종 점수 반영
-- PRO DB (ckzbzumycmgkcpyhlclb) 적용 완료 (2026-04-06)

-- ============================================================
-- 1. evaluation_weights CHECK 제약조건에 'peer' 추가
-- ============================================================
ALTER TABLE evaluation_weights
  DROP CONSTRAINT IF EXISTS evaluation_weights_evaluator_role_check;
ALTER TABLE evaluation_weights
  ADD CONSTRAINT evaluation_weights_evaluator_role_check
  CHECK (evaluator_role = ANY (ARRAY['self', 'peer', 'leader', 'director', 'ceo']));

-- ============================================================
-- 2. peer 가중치 추가 + 기존 가중치 재조정 (합계 100%)
-- ============================================================
-- self 10% + peer 15% + leader 30% + director 25% + ceo 20% = 100%
INSERT INTO evaluation_weights (period_id, evaluator_role, weight)
VALUES ('e0000000-0000-0000-0000-000000000001', 'peer', 0.15)
ON CONFLICT DO NOTHING;

UPDATE evaluation_weights SET weight = 0.10 WHERE evaluator_role = 'self'     AND period_id = 'e0000000-0000-0000-0000-000000000001';
UPDATE evaluation_weights SET weight = 0.30 WHERE evaluator_role = 'leader'   AND period_id = 'e0000000-0000-0000-0000-000000000001';
UPDATE evaluation_weights SET weight = 0.25 WHERE evaluator_role = 'director' AND period_id = 'e0000000-0000-0000-0000-000000000001';
UPDATE evaluation_weights SET weight = 0.20 WHERE evaluator_role = 'ceo'      AND period_id = 'e0000000-0000-0000-0000-000000000001';

-- ============================================================
-- 3. calculate_final_score 함수 업데이트 (peer_reviews 평균 반영)
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_final_score(p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period_id      uuid;
  v_employee_id    uuid;
  v_self_total     decimal;
  v_peer_total     decimal;
  v_leader_total   decimal;
  v_director_total decimal;
  v_ceo_total      decimal;
  v_weighted_sum   decimal := 0;
  v_weight_sum     decimal := 0;
  v_score          decimal;
  v_grade          text;
  v_w              decimal;
BEGIN
  SELECT period_id, employee_id INTO v_period_id, v_employee_id
  FROM evaluation_targets WHERE id = p_target_id;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION '평가 대상을 찾을 수 없습니다: %', p_target_id;
  END IF;

  -- 자기평가 합산
  SELECT SUM(score) INTO v_self_total
  FROM self_evaluations
  WHERE target_id = p_target_id AND score IS NOT NULL AND is_draft = false;

  -- 평가자별 합산
  SELECT
    SUM(CASE WHEN evaluator_role = 'leader'   THEN score END),
    SUM(CASE WHEN evaluator_role = 'director' THEN score END),
    SUM(CASE WHEN evaluator_role = 'ceo'      THEN score END)
  INTO v_leader_total, v_director_total, v_ceo_total
  FROM evaluator_scores
  WHERE target_id = p_target_id AND score IS NOT NULL AND is_draft = false;

  -- 동료 평가 평균 (peer_reviews 테이블)
  SELECT AVG(overall_score) INTO v_peer_total
  FROM peer_reviews
  WHERE reviewee_id = v_employee_id
    AND period_id = v_period_id
    AND is_submitted = true;

  -- 가중 평균 계산
  IF v_self_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'self';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_self_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;

  IF v_peer_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'peer';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_peer_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
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

  -- 최종 점수
  IF v_weight_sum > 0 THEN
    v_score := ROUND(v_weighted_sum / v_weight_sum, 2);
  ELSE
    v_score := NULL;
  END IF;

  -- 등급 산출
  v_grade := CASE
    WHEN v_score IS NULL THEN NULL
    WHEN v_score >= 90   THEN 'S'
    WHEN v_score >= 80   THEN 'A'
    WHEN v_score >= 70   THEN 'B'
    WHEN v_score >= 60   THEN 'C'
    ELSE 'D'
  END;

  UPDATE evaluation_targets
  SET final_score = v_score, grade = v_grade
  WHERE id = p_target_id;

  RETURN jsonb_build_object('score', v_score, 'grade', v_grade);
END;
$$;
