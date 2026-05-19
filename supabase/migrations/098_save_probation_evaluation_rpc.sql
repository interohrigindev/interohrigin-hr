-- 098: probation_evaluations 저장을 SECURITY DEFINER RPC 로 우회
-- 배경:
--   093/094/095 마이그레이션 모두 RLS 정책 표현식 변형으로 시도했으나
--   리더 계정에서 간헐적/반복적 42501 RLS 차단 발생.
--   원인: PostgreSQL RLS 정책 평가 시 employees 테이블 RLS 의존, 다중 정책 OR 상호작용,
--         set-returning function 평가 quirks 등 변수 다수.
-- 해결:
--   INSERT/UPDATE 자체를 SECURITY DEFINER RPC 로 통일하여 RLS 우회.
--   권한 검증은 RPC 내부에서 명시적으로 수행 (단일 진입점, 명확한 에러).

BEGIN;

CREATE OR REPLACE FUNCTION public.save_probation_evaluation(
  p_employee_id uuid,
  p_stage text,
  p_evaluator_role text,
  p_scores jsonb,
  p_continuation_recommendation text,
  p_comments text DEFAULT NULL,
  p_praise text DEFAULT NULL,
  p_improvement text DEFAULT NULL,
  p_mentor_summary text DEFAULT NULL,
  p_leader_summary text DEFAULT NULL,
  p_exec_one_liner text DEFAULT NULL,
  p_strengths text DEFAULT NULL,
  p_ai_assessment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_my_role text;
  v_my_dept uuid;
  v_emp_dept uuid;
  v_emp_exists boolean;
  v_can boolean;
  v_existed boolean;
  v_row_id uuid;
BEGIN
  -- 1) 로그인 확인
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다' USING ERRCODE = '42501';
  END IF;

  -- 2) 평가자(나) 정보 조회
  SELECT role, department_id INTO v_my_role, v_my_dept
    FROM public.employees WHERE id = v_uid LIMIT 1;
  IF v_my_role IS NULL THEN
    RAISE EXCEPTION '직원 정보를 찾을 수 없습니다 (auth.uid=%)', v_uid USING ERRCODE = '42501';
  END IF;

  -- 3) 대상 직원 정보 조회
  SELECT department_id, true INTO v_emp_dept, v_emp_exists
    FROM public.employees WHERE id = p_employee_id LIMIT 1;
  IF NOT COALESCE(v_emp_exists, false) THEN
    RAISE EXCEPTION '대상 직원을 찾을 수 없습니다' USING ERRCODE = '22023';
  END IF;

  -- 4) 권한 검증
  --    - 관리자급/임원/대표: 모든 직원
  --    - 리더: 본인 부서 직원만
  --    - 그 외: 차단
  v_can := false;
  IF v_my_role IN ('admin','hr_admin','ceo','director','division_head','executive') THEN
    v_can := true;
  ELSIF v_my_role = 'leader' THEN
    IF v_my_dept IS NULL THEN
      RAISE EXCEPTION '리더의 부서가 지정되어 있지 않습니다. 관리자에게 문의해주세요.' USING ERRCODE = '42501';
    END IF;
    IF v_emp_dept IS NULL THEN
      RAISE EXCEPTION '대상 직원의 부서가 지정되어 있지 않습니다. 관리자에게 문의해주세요.' USING ERRCODE = '42501';
    END IF;
    IF v_my_dept = v_emp_dept THEN
      v_can := true;
    ELSE
      RAISE EXCEPTION '본인 부서 직원만 평가할 수 있습니다 (대상 직원은 다른 부서 소속).' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION '평가 권한이 없는 역할(%)입니다.', v_my_role USING ERRCODE = '42501';
  END IF;

  -- 5) UPSERT 실행 (SECURITY DEFINER 라 RLS 우회 — 권한 검증은 위에서 완료)
  SELECT id INTO v_row_id
    FROM public.probation_evaluations
   WHERE employee_id = p_employee_id
     AND stage = p_stage
     AND evaluator_id = v_uid
     AND evaluator_role = p_evaluator_role
   LIMIT 1;
  v_existed := v_row_id IS NOT NULL;

  IF v_existed THEN
    UPDATE public.probation_evaluations
       SET scores = p_scores,
           continuation_recommendation = p_continuation_recommendation,
           comments = p_comments,
           praise = p_praise,
           improvement = p_improvement,
           mentor_summary = p_mentor_summary,
           leader_summary = CASE WHEN p_evaluator_role = 'leader' THEN p_leader_summary ELSE NULL END,
           exec_one_liner = CASE WHEN p_evaluator_role IN ('executive','ceo') THEN p_exec_one_liner ELSE NULL END,
           strengths = CASE WHEN p_evaluator_role IN ('executive','ceo') THEN p_strengths ELSE NULL END,
           ai_assessment = p_ai_assessment,
           updated_at = now()
     WHERE id = v_row_id;
  ELSE
    INSERT INTO public.probation_evaluations (
      employee_id, stage, evaluator_id, evaluator_role,
      scores, continuation_recommendation,
      comments, praise, improvement, mentor_summary,
      leader_summary, exec_one_liner, strengths, ai_assessment
    ) VALUES (
      p_employee_id, p_stage, v_uid, p_evaluator_role,
      p_scores, p_continuation_recommendation,
      p_comments, p_praise, p_improvement, p_mentor_summary,
      CASE WHEN p_evaluator_role = 'leader' THEN p_leader_summary ELSE NULL END,
      CASE WHEN p_evaluator_role IN ('executive','ceo') THEN p_exec_one_liner ELSE NULL END,
      CASE WHEN p_evaluator_role IN ('executive','ceo') THEN p_strengths ELSE NULL END,
      p_ai_assessment
    )
    RETURNING id INTO v_row_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row_id,
    'existed', v_existed,
    'evaluator_role', p_evaluator_role,
    'stage', p_stage
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_probation_evaluation(
  uuid, text, text, jsonb, text, text, text, text, text, text, text, text, text
) TO authenticated;

COMMIT;

-- 검증:
-- SELECT public.save_probation_evaluation(
--   '<오준 id>'::uuid, 'round1', 'leader',
--   '{"work":15,"attitude":15,"collab":15,"growth":15,"culture":15}'::jsonb,
--   'continue'
-- );
