-- =====================================================================
-- InterOhrigin HR — 집계 뷰 & 비즈니스 함수
-- 002 스키마 + 003 시드 실행 후 Supabase SQL Editor에서 실행하세요
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- VIEW 1: v_evaluation_summary
-- 용도: 대시보드 직원별 종합 점수 비교
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_evaluation_summary AS
WITH
  -- 자기평가 항목 합산
  self_totals AS (
    SELECT
      se.target_id,
      SUM(se.score) AS self_total
    FROM public.self_evaluations se
    WHERE se.score IS NOT NULL
      AND se.is_draft = false
    GROUP BY se.target_id
  ),

  -- 평가자별 항목 합산 (피벗)
  evaluator_totals AS (
    SELECT
      es.target_id,
      SUM(CASE WHEN es.evaluator_role = 'leader'        THEN es.score END) AS leader_total,
      SUM(CASE WHEN es.evaluator_role = 'director_kim'   THEN es.score END) AS director_kim_total,
      SUM(CASE WHEN es.evaluator_role = 'director_kang'  THEN es.score END) AS director_kang_total,
      SUM(CASE WHEN es.evaluator_role = 'executive'      THEN es.score END) AS executive_total,
      SUM(CASE WHEN es.evaluator_role = 'ceo'            THEN es.score END) AS ceo_total
    FROM public.evaluator_scores es
    WHERE es.score IS NOT NULL
      AND es.is_draft = false
    GROUP BY es.target_id
  ),

  -- 가중 평균 계산
  weighted AS (
    SELECT
      t.id AS target_id,
      -- 각 평가자 합산 × 해당 가중치, NULL 평가자는 제외
      CASE
        WHEN (
          -- 가중치 분모: 실제 점수가 있는 평가자 가중치 합
          COALESCE(
            CASE WHEN st.self_total          IS NOT NULL THEN w_self.weight END, 0
          ) +
          COALESCE(
            CASE WHEN et.leader_total        IS NOT NULL THEN w_leader.weight END, 0
          ) +
          COALESCE(
            CASE WHEN et.director_kim_total  IS NOT NULL THEN w_dkim.weight END, 0
          ) +
          COALESCE(
            CASE WHEN et.director_kang_total IS NOT NULL THEN w_dkang.weight END, 0
          ) +
          COALESCE(
            CASE WHEN et.executive_total     IS NOT NULL THEN w_exec.weight END, 0
          ) +
          COALESCE(
            CASE WHEN et.ceo_total           IS NOT NULL THEN w_ceo.weight END, 0
          )
        ) = 0 THEN NULL
        ELSE
          ROUND(
            (
              COALESCE(st.self_total          * w_self.weight,   0) +
              COALESCE(et.leader_total        * w_leader.weight, 0) +
              COALESCE(et.director_kim_total  * w_dkim.weight,   0) +
              COALESCE(et.director_kang_total * w_dkang.weight,  0) +
              COALESCE(et.executive_total     * w_exec.weight,   0) +
              COALESCE(et.ceo_total           * w_ceo.weight,    0)
            ) / (
              COALESCE(
                CASE WHEN st.self_total          IS NOT NULL THEN w_self.weight END, 0
              ) +
              COALESCE(
                CASE WHEN et.leader_total        IS NOT NULL THEN w_leader.weight END, 0
              ) +
              COALESCE(
                CASE WHEN et.director_kim_total  IS NOT NULL THEN w_dkim.weight END, 0
              ) +
              COALESCE(
                CASE WHEN et.director_kang_total IS NOT NULL THEN w_dkang.weight END, 0
              ) +
              COALESCE(
                CASE WHEN et.executive_total     IS NOT NULL THEN w_exec.weight END, 0
              ) +
              COALESCE(
                CASE WHEN et.ceo_total           IS NOT NULL THEN w_ceo.weight END, 0
              )
            )
          , 2)
      END AS weighted_score
    FROM public.evaluation_targets t
    LEFT JOIN self_totals     st ON st.target_id = t.id
    LEFT JOIN evaluator_totals et ON et.target_id = t.id
    -- 가중치 조인
    LEFT JOIN public.evaluation_weights w_self
      ON w_self.period_id   = t.period_id AND w_self.evaluator_role   = 'self'
    LEFT JOIN public.evaluation_weights w_leader
      ON w_leader.period_id = t.period_id AND w_leader.evaluator_role = 'leader'
    LEFT JOIN public.evaluation_weights w_dkim
      ON w_dkim.period_id   = t.period_id AND w_dkim.evaluator_role   = 'director_kim'
    LEFT JOIN public.evaluation_weights w_dkang
      ON w_dkang.period_id  = t.period_id AND w_dkang.evaluator_role  = 'director_kang'
    LEFT JOIN public.evaluation_weights w_exec
      ON w_exec.period_id   = t.period_id AND w_exec.evaluator_role   = 'executive'
    LEFT JOIN public.evaluation_weights w_ceo
      ON w_ceo.period_id    = t.period_id AND w_ceo.evaluator_role    = 'ceo'
  )

SELECT
  t.id              AS target_id,
  t.period_id,
  p.year,
  p.quarter,
  t.employee_id,
  e.name            AS employee_name,
  d.name            AS department_name,
  st.self_total,
  et.leader_total,
  et.director_kim_total,
  et.director_kang_total,
  et.executive_total,
  et.ceo_total,
  w.weighted_score,
  CASE
    WHEN w.weighted_score IS NULL THEN NULL
    WHEN w.weighted_score >= 90   THEN 'S'
    WHEN w.weighted_score >= 80   THEN 'A'
    WHEN w.weighted_score >= 70   THEN 'B'
    WHEN w.weighted_score >= 60   THEN 'C'
    ELSE 'D'
  END               AS grade,
  t.status
FROM public.evaluation_targets t
JOIN public.evaluation_periods p ON p.id = t.period_id
JOIN public.employees          e ON e.id = t.employee_id
LEFT JOIN public.departments   d ON d.id = e.department_id
LEFT JOIN self_totals         st ON st.target_id = t.id
LEFT JOIN evaluator_totals    et ON et.target_id = t.id
LEFT JOIN weighted             w ON w.target_id  = t.id;

-- ─────────────────────────────────────────────────────────────────────
-- VIEW 2: v_item_scores_comparison
-- 용도: 항목별 평가자 간 점수 비교 + 편차 감지
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_item_scores_comparison AS
SELECT
  t.id              AS target_id,
  emp.name          AS employee_name,
  i.name            AS item_name,
  c.name            AS category_name,

  -- 자기평가 점수
  se.score          AS self_score,

  -- 평가자별 점수 (피벗)
  MAX(CASE WHEN es.evaluator_role = 'leader'        THEN es.score END) AS leader_score,
  MAX(CASE WHEN es.evaluator_role = 'director_kim'   THEN es.score END) AS director_kim_score,
  MAX(CASE WHEN es.evaluator_role = 'director_kang'  THEN es.score END) AS director_kang_score,
  MAX(CASE WHEN es.evaluator_role = 'executive'      THEN es.score END) AS executive_score,
  MAX(CASE WHEN es.evaluator_role = 'ceo'            THEN es.score END) AS ceo_score,

  -- 편차 계산: 모든 점수(자기평가 포함) 중 MAX - MIN (NULL 제외)
  (
    GREATEST(
      COALESCE(se.score, -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'leader'        THEN es.score END), -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'director_kim'   THEN es.score END), -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'director_kang'  THEN es.score END), -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'executive'      THEN es.score END), -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'ceo'            THEN es.score END), -1)
    )
    -
    LEAST(
      COALESCE(se.score, 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'leader'        THEN es.score END), 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'director_kim'   THEN es.score END), 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'director_kang'  THEN es.score END), 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'executive'      THEN es.score END), 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'ceo'            THEN es.score END), 11)
    )
  ) AS max_deviation,

  -- 편차 플래그: 3점 이상 차이 시 true
  (
    GREATEST(
      COALESCE(se.score, -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'leader'        THEN es.score END), -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'director_kim'   THEN es.score END), -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'director_kang'  THEN es.score END), -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'executive'      THEN es.score END), -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'ceo'            THEN es.score END), -1)
    )
    -
    LEAST(
      COALESCE(se.score, 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'leader'        THEN es.score END), 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'director_kim'   THEN es.score END), 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'director_kang'  THEN es.score END), 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'executive'      THEN es.score END), 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'ceo'            THEN es.score END), 11)
    )
  ) >= 3 AS has_deviation_flag

FROM public.evaluation_targets t
JOIN public.employees           emp ON emp.id = t.employee_id
-- 전체 활성 항목을 기준으로 (빠짐 없이 표시)
CROSS JOIN public.evaluation_items i
JOIN public.evaluation_categories c ON c.id = i.category_id
LEFT JOIN public.self_evaluations se
  ON se.target_id = t.id AND se.item_id = i.id
LEFT JOIN public.evaluator_scores es
  ON es.target_id = t.id AND es.item_id = i.id
WHERE i.is_active = true
GROUP BY t.id, emp.name, i.id, i.name, c.name, se.score;

-- ─────────────────────────────────────────────────────────────────────
-- VIEW 3: v_evaluation_progress
-- 용도: 평가 진행률 현황
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_evaluation_progress AS
WITH status_order(status_name, status_rank) AS (
  VALUES
    ('pending',            0),
    ('self_done',          1),
    ('leader_done',        2),
    ('director_kim_done',  3),
    ('director_kang_done', 4),
    ('executive_done',     5),
    ('ceo_done',           6),
    ('completed',          7)
)
SELECT
  p.id               AS period_id,
  p.year,
  p.quarter,
  COUNT(t.id)        AS total_employees,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 1) AS self_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 2) AS leader_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 3) AS director_kim_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 4) AS director_kang_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 5) AS executive_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 6) AS ceo_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 7) AS completed_count
FROM public.evaluation_periods p
LEFT JOIN public.evaluation_targets t ON t.period_id = p.id
LEFT JOIN status_order so ON so.status_name = t.status
GROUP BY p.id, p.year, p.quarter;

-- =====================================================================
-- FUNCTION 1: calculate_final_score
-- 용도: 가중치 적용 최종 점수 계산 → evaluation_targets UPDATE
-- =====================================================================
CREATE OR REPLACE FUNCTION public.calculate_final_score(p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id      uuid;
  v_self_total     decimal;
  v_leader_total   decimal;
  v_dkim_total     decimal;
  v_dkang_total    decimal;
  v_exec_total     decimal;
  v_ceo_total      decimal;
  v_weighted_sum   decimal := 0;
  v_weight_sum     decimal := 0;
  v_score          decimal;
  v_grade          text;
  v_w              decimal;
BEGIN
  -- 평가 기간 조회
  SELECT period_id INTO v_period_id
  FROM evaluation_targets WHERE id = p_target_id;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION '평가 대상을 찾을 수 없습니다: %', p_target_id;
  END IF;

  -- 자기평가 합산 (is_draft = false 만)
  SELECT SUM(score) INTO v_self_total
  FROM self_evaluations
  WHERE target_id = p_target_id AND score IS NOT NULL AND is_draft = false;

  -- 평가자별 합산 (is_draft = false 만)
  SELECT
    SUM(CASE WHEN evaluator_role = 'leader'        THEN score END),
    SUM(CASE WHEN evaluator_role = 'director_kim'   THEN score END),
    SUM(CASE WHEN evaluator_role = 'director_kang'  THEN score END),
    SUM(CASE WHEN evaluator_role = 'executive'      THEN score END),
    SUM(CASE WHEN evaluator_role = 'ceo'            THEN score END)
  INTO v_leader_total, v_dkim_total, v_dkang_total, v_exec_total, v_ceo_total
  FROM evaluator_scores
  WHERE target_id = p_target_id AND score IS NOT NULL AND is_draft = false;

  -- 가중 평균 계산 (NULL 평가자는 제외, 나머지 가중치 재배분)
  -- self
  IF v_self_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights
    WHERE period_id = v_period_id AND evaluator_role = 'self';
    IF v_w IS NOT NULL THEN
      v_weighted_sum := v_weighted_sum + v_self_total * v_w;
      v_weight_sum   := v_weight_sum   + v_w;
    END IF;
  END IF;

  -- leader
  IF v_leader_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights
    WHERE period_id = v_period_id AND evaluator_role = 'leader';
    IF v_w IS NOT NULL THEN
      v_weighted_sum := v_weighted_sum + v_leader_total * v_w;
      v_weight_sum   := v_weight_sum   + v_w;
    END IF;
  END IF;

  -- director_kim
  IF v_dkim_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights
    WHERE period_id = v_period_id AND evaluator_role = 'director_kim';
    IF v_w IS NOT NULL THEN
      v_weighted_sum := v_weighted_sum + v_dkim_total * v_w;
      v_weight_sum   := v_weight_sum   + v_w;
    END IF;
  END IF;

  -- director_kang
  IF v_dkang_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights
    WHERE period_id = v_period_id AND evaluator_role = 'director_kang';
    IF v_w IS NOT NULL THEN
      v_weighted_sum := v_weighted_sum + v_dkang_total * v_w;
      v_weight_sum   := v_weight_sum   + v_w;
    END IF;
  END IF;

  -- executive
  IF v_exec_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights
    WHERE period_id = v_period_id AND evaluator_role = 'executive';
    IF v_w IS NOT NULL THEN
      v_weighted_sum := v_weighted_sum + v_exec_total * v_w;
      v_weight_sum   := v_weight_sum   + v_w;
    END IF;
  END IF;

  -- ceo
  IF v_ceo_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights
    WHERE period_id = v_period_id AND evaluator_role = 'ceo';
    IF v_w IS NOT NULL THEN
      v_weighted_sum := v_weighted_sum + v_ceo_total * v_w;
      v_weight_sum   := v_weight_sum   + v_w;
    END IF;
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

  -- evaluation_targets 업데이트
  UPDATE evaluation_targets
  SET final_score = v_score,
      grade       = v_grade
  WHERE id = p_target_id;

  RETURN jsonb_build_object('score', v_score, 'grade', v_grade);
END;
$$;

-- =====================================================================
-- FUNCTION 2: generate_evaluation_sheets
-- 용도: is_active 직원 전원 평가 시트 + 빈 자기평가 행 일괄 생성
-- =====================================================================
CREATE OR REPLACE FUNCTION public.generate_evaluation_sheets(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id   uuid;
  v_employee_id uuid;
  v_count       integer := 0;
BEGIN
  -- 기간 존재 확인
  IF NOT EXISTS (SELECT 1 FROM evaluation_periods WHERE id = p_period_id) THEN
    RAISE EXCEPTION '평가 기간을 찾을 수 없습니다: %', p_period_id;
  END IF;

  -- 활성 직원별 evaluation_targets 생성 (중복 무시)
  FOR v_employee_id IN
    SELECT id FROM employees WHERE is_active = true
  LOOP
    INSERT INTO evaluation_targets (period_id, employee_id, status)
    VALUES (p_period_id, v_employee_id, 'pending')
    ON CONFLICT (period_id, employee_id) DO NOTHING
    RETURNING id INTO v_target_id;

    -- 새로 생성된 경우에만 자기평가 빈 행 생성
    IF v_target_id IS NOT NULL THEN
      INSERT INTO self_evaluations (target_id, item_id)
      SELECT v_target_id, i.id
      FROM evaluation_items i
      WHERE i.is_active = true
      ON CONFLICT (target_id, item_id) DO NOTHING;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =====================================================================
-- FUNCTION 3: advance_evaluation_stage
-- 용도: 점수 입력 검증 → 다음 평가 단계로 status 전진
-- =====================================================================
CREATE OR REPLACE FUNCTION public.advance_evaluation_stage(
  p_target_id    uuid,
  p_current_role text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status  text;
  v_expected_status text;
  v_next_status     text;
  v_total_items     integer;
  v_scored_items    integer;
  v_missing         integer;
BEGIN
  -- 현재 상태 조회
  SELECT status INTO v_current_status
  FROM evaluation_targets WHERE id = p_target_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION '평가 대상을 찾을 수 없습니다: %', p_target_id;
  END IF;

  -- 역할별 예상 현재 상태 및 다음 상태 매핑
  CASE p_current_role
    WHEN 'self'          THEN v_expected_status := 'pending';         v_next_status := 'self_done';
    WHEN 'leader'        THEN v_expected_status := 'self_done';       v_next_status := 'leader_done';
    WHEN 'director_kim'  THEN v_expected_status := 'leader_done';     v_next_status := 'director_kim_done';
    WHEN 'director_kang' THEN v_expected_status := 'director_kim_done'; v_next_status := 'director_kang_done';
    WHEN 'executive'     THEN v_expected_status := 'director_kang_done'; v_next_status := 'executive_done';
    WHEN 'ceo'           THEN v_expected_status := 'executive_done';  v_next_status := 'ceo_done';
    ELSE RAISE EXCEPTION '잘못된 평가자 역할입니다: %', p_current_role;
  END CASE;

  -- 현재 상태 검증
  IF v_current_status <> v_expected_status THEN
    RAISE EXCEPTION '현재 단계(%)에서 % 역할이 평가를 진행할 수 없습니다. 예상 단계: %',
      v_current_status, p_current_role, v_expected_status;
  END IF;

  -- 활성 항목 수
  SELECT COUNT(*) INTO v_total_items
  FROM evaluation_items WHERE is_active = true;

  -- 점수 입력 검증
  IF p_current_role = 'self' THEN
    -- 자기평가: self_evaluations에서 점수 입력 확인
    SELECT COUNT(*) INTO v_scored_items
    FROM self_evaluations
    WHERE target_id = p_target_id
      AND score IS NOT NULL;

    v_missing := v_total_items - v_scored_items;

    IF v_missing > 0 THEN
      RAISE EXCEPTION '자기평가 미입력 항목이 %개 있습니다. 모든 항목의 점수를 입력해주세요.', v_missing;
    END IF;

    -- 자기평가 is_draft → false 일괄 처리
    UPDATE self_evaluations
    SET is_draft = false
    WHERE target_id = p_target_id;

  ELSE
    -- 상위 평가자: evaluator_scores에서 해당 역할 점수 입력 확인
    SELECT COUNT(*) INTO v_scored_items
    FROM evaluator_scores
    WHERE target_id = p_target_id
      AND evaluator_role = p_current_role
      AND score IS NOT NULL;

    v_missing := v_total_items - v_scored_items;

    IF v_missing > 0 THEN
      RAISE EXCEPTION '% 평가 미입력 항목이 %개 있습니다. 모든 항목의 점수를 입력해주세요.',
        p_current_role, v_missing;
    END IF;

    -- 해당 역할 is_draft → false 일괄 처리
    UPDATE evaluator_scores
    SET is_draft = false
    WHERE target_id = p_target_id
      AND evaluator_role = p_current_role;
  END IF;

  -- 상태 전진
  UPDATE evaluation_targets
  SET status = v_next_status
  WHERE id = p_target_id;

  -- CEO 평가 완료 시 최종 점수 계산 + completed 전환
  IF v_next_status = 'ceo_done' THEN
    PERFORM calculate_final_score(p_target_id);

    UPDATE evaluation_targets
    SET status = 'completed'
    WHERE id = p_target_id;

    RETURN 'completed';
  END IF;

  RETURN v_next_status;
END;
$$;

-- =====================================================================
-- 완료!
-- =====================================================================
