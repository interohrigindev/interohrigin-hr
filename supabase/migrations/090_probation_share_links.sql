-- 090: 수습평가 외부 공유 링크
-- 용도: 대표/임원 등 로그인 없이 수습평가 결과(다회차·다평가자·AI 분석 포함)를 열람할 수 있는 링크 발급
-- 참고: 064_candidate_share_links 와 동일한 패턴 + 수습평가 데이터 구조 통합

CREATE TABLE IF NOT EXISTS public.probation_share_links (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  token         text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at    timestamptz,                 -- NULL = 만료 없음
  is_active     boolean     NOT NULL DEFAULT true,
  note          text,                        -- 메모 (예: "대표님 검토용")
  created_by    uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz,
  view_count    integer     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_probation_share_links_employee ON public.probation_share_links(employee_id);
CREATE INDEX IF NOT EXISTS idx_probation_share_links_token ON public.probation_share_links(token);

ALTER TABLE public.probation_share_links ENABLE ROW LEVEL SECURITY;

-- 관리자/임원/대표만 생성/조회/수정
DROP POLICY IF EXISTS probation_share_links_admin_all ON public.probation_share_links;
CREATE POLICY probation_share_links_admin_all ON public.probation_share_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive')
    )
  );

-- 공유 링크로 수습평가 정보 조회 RPC
-- 권한 정책: 로그인 필수 + (admin/hr_admin/ceo/director/division_head/executive)
--   OR (리더 + 수습평가 메뉴 권한 보유)
--   OR (이 직원의 평가 참여자)
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

  -- 권한 체크
  SELECT role INTO v_viewer_role FROM public.employees WHERE id = v_viewer_id;

  -- 1) 관리자/임원급
  IF v_viewer_role IN ('admin','hr_admin','ceo','director','division_head','executive') THEN
    v_authorized := true;
  END IF;

  -- 2) 평가 참여자
  IF NOT v_authorized THEN
    IF EXISTS (
      SELECT 1 FROM public.probation_evaluations
      WHERE employee_id = v_emp.id AND evaluator_id = v_viewer_id
    ) THEN v_authorized := true; END IF;
  END IF;

  -- 3) 리더 + 수습평가 메뉴 권한 보유자
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

  -- 평가 데이터 + 평가자 이름 조인
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

  -- 회차 마감 정보
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'stage', stage,
      'reason', reason,
      'closed_at', closed_at
    )
  ), '[]'::jsonb)
    INTO v_closures
    FROM public.probation_round_closures
   WHERE employee_id = v_emp.id;

  -- 전체 평가자 목록 (각 회차당 누가 평가했는지 추적용)
  SELECT COALESCE(jsonb_agg(DISTINCT
    jsonb_build_object('id', ev.id, 'name', ev.name, 'role', ev.role)
  ), '[]'::jsonb)
    INTO v_evaluators
    FROM public.probation_evaluations pe
    LEFT JOIN public.employees ev ON ev.id = pe.evaluator_id
   WHERE pe.employee_id = v_emp.id AND ev.id IS NOT NULL;

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
    'evaluators', v_evaluators
  );

  RETURN v_result;
END;
$$;

-- 인증된 사용자만 실행 가능 (RPC 내부에서 추가 권한 체크)
GRANT EXECUTE ON FUNCTION public.get_shared_probation(text) TO authenticated;

COMMENT ON TABLE public.probation_share_links IS '수습평가 공유 링크 — 인증 + 권한자만 열람';
COMMENT ON FUNCTION public.get_shared_probation(text) IS '공유 토큰으로 수습평가 결과 조회. 권한: 관리자급 OR 리더(수습평가 메뉴 권한 보유) OR 평가 참여자.';
