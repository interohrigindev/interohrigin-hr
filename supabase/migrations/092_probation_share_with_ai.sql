-- 092: 수습평가 공유 RPC 에 AI 분석 결과 포함
-- get_shared_probation 함수 재정의 — 종합/회차별/추이 분석 결과를 함께 반환

CREATE OR REPLACE FUNCTION public.get_shared_probation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link        public.probation_share_links%ROWTYPE;
  v_emp         public.employees%ROWTYPE;
  v_dept_name   text;
  v_evals       jsonb;
  v_closures    jsonb;
  v_evaluators  jsonb;
  v_ai_cache    jsonb;
  v_result      jsonb;
  v_viewer_id   uuid := auth.uid();
  v_viewer_role text;
  v_authorized  boolean := false;
BEGIN
  -- 로그인 필수
  IF v_viewer_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT * INTO v_link FROM public.probation_share_links WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION '링크를 찾을 수 없습니다'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION '비활성화된 링크입니다'; END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION '만료된 링크입니다';
  END IF;

  SELECT * INTO v_emp FROM public.employees WHERE id = v_link.employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION '직원 정보가 없습니다'; END IF;

  SELECT role INTO v_viewer_role FROM public.employees WHERE id = v_viewer_id;

  IF v_viewer_role IN ('admin','hr_admin','ceo','director','division_head','executive') THEN
    v_authorized := true;
  END IF;
  IF NOT v_authorized THEN
    IF EXISTS (
      SELECT 1 FROM public.probation_evaluations
      WHERE employee_id = v_emp.id AND evaluator_id = v_viewer_id
    ) THEN v_authorized := true; END IF;
  END IF;
  IF NOT v_authorized AND v_viewer_role = 'leader' THEN
    IF EXISTS (
      SELECT 1 FROM public.menu_permissions
      WHERE employee_id = v_viewer_id
        AND allowed_menus ? '/admin/probation'
    ) THEN v_authorized := true; END IF;
  END IF;
  IF NOT v_authorized THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT name INTO v_dept_name FROM public.departments WHERE id = v_emp.department_id;

  -- 평가 데이터
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pe.id,
      'stage', pe.stage,
      'evaluator_id', pe.evaluator_id,
      'evaluator_role', pe.evaluator_role,
      'evaluator_name', ev.name,
      'evaluator_position', ev.position,
      'scores', pe.scores,
      'ai_assessment', pe.ai_assessment,
      'continuation_recommendation', pe.continuation_recommendation,
      'comments', pe.comments,
      'praise', pe.praise,
      'improvement', pe.improvement,
      'leader_summary', pe.leader_summary,
      'exec_one_liner', pe.exec_one_liner,
      'strengths', pe.strengths,
      'created_at', pe.created_at,
      'updated_at', pe.updated_at
    ) ORDER BY pe.stage, pe.evaluator_role
  ), '[]'::jsonb)
    INTO v_evals
    FROM public.probation_evaluations pe
    LEFT JOIN public.employees ev ON ev.id = pe.evaluator_id
   WHERE pe.employee_id = v_emp.id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('stage', stage, 'reason', reason, 'closed_at', closed_at)
  ), '[]'::jsonb)
    INTO v_closures
    FROM public.probation_round_closures
   WHERE employee_id = v_emp.id;

  SELECT COALESCE(jsonb_agg(DISTINCT
    jsonb_build_object('id', ev.id, 'name', ev.name, 'role', ev.role)
  ), '[]'::jsonb)
    INTO v_evaluators
    FROM public.probation_evaluations pe
    LEFT JOIN public.employees ev ON ev.id = pe.evaluator_id
   WHERE pe.employee_id = v_emp.id AND ev.id IS NOT NULL;

  -- ⭐ NEW: AI 분석 캐시 (종합/추이/회차별)
  -- cache_type 별로 키 분리해 객체로 반환
  SELECT COALESCE(jsonb_object_agg(cache_type, content), '{}'::jsonb)
    INTO v_ai_cache
    FROM public.probation_ai_cache
   WHERE employee_id = v_emp.id;

  -- 조회 카운트 갱신
  UPDATE public.probation_share_links
     SET last_viewed_at = now(), view_count = view_count + 1
   WHERE id = v_link.id;

  v_result := jsonb_build_object(
    'link', jsonb_build_object(
      'note', v_link.note,
      'expires_at', v_link.expires_at,
      'view_count', v_link.view_count + 1
    ),
    'employee', jsonb_build_object(
      'id', v_emp.id,
      'name', v_emp.name,
      'department_name', v_dept_name,
      'position', v_emp.position,
      'role', v_emp.role,
      'hire_date', v_emp.hire_date,
      'employment_type', v_emp.employment_type,
      'is_active', v_emp.is_active,
      'probation_completed_at', v_emp.probation_completed_at,
      'probation_result', v_emp.probation_result,
      'converted_to_regular_at', v_emp.converted_to_regular_at
    ),
    'evaluations', v_evals,
    'closures', v_closures,
    'evaluators', v_evaluators,
    'ai_cache', v_ai_cache
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_probation(text) TO authenticated;

COMMENT ON FUNCTION public.get_shared_probation(text) IS '수습평가 공유 (v2) — 평가 + AI 종합/회차/추이 분석 결과 통합 반환';
