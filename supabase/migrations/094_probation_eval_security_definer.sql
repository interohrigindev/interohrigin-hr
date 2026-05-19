-- 094: probation_evaluations RLS 를 SECURITY DEFINER 헬퍼로 단순화
-- 문제: 정책 내부 EXISTS(employees) 가 employees 테이블 RLS 영향을 받아
--       리더가 본인/대상자 row 를 SELECT 못하면 INSERT 정책 EXISTS 가 false 가 되어 차단됨
-- 해결: SECURITY DEFINER 함수로 RLS 우회하여 role/department 조회

BEGIN;

-- 1) 헬퍼 함수: 현재 사용자의 role + department_id 조회 (RLS 우회)
CREATE OR REPLACE FUNCTION public.current_employee_meta()
RETURNS TABLE(role text, department_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT e.role, e.department_id
  FROM public.employees e
  WHERE e.id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_employee_meta() TO authenticated;

-- 2) 헬퍼 함수: 대상 직원이 현재 사용자의 부서에 속하는지 (RLS 우회)
CREATE OR REPLACE FUNCTION public.is_same_dept_as_me(target_emp_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees me
    JOIN public.employees emp ON emp.department_id = me.department_id
    WHERE me.id = auth.uid()
      AND emp.id = target_emp_id
      AND me.department_id IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_same_dept_as_me(uuid) TO authenticated;

-- 3) 기존 정책 재정의 — 헬퍼 함수 사용
DROP POLICY IF EXISTS "probation_evaluations_insert_scoped" ON public.probation_evaluations;
DROP POLICY IF EXISTS "probation_evaluations_update_scoped" ON public.probation_evaluations;

CREATE POLICY "probation_evaluations_insert_scoped"
ON public.probation_evaluations
FOR INSERT
TO authenticated
WITH CHECK (
  (evaluator_id IS NULL OR evaluator_id = auth.uid())
  AND (
    -- 관리자급/임원/대표
    (SELECT role FROM public.current_employee_meta())
      IN ('admin','hr_admin','ceo','director','division_head','executive')
    OR
    -- 리더: 본인 부서 직원
    (
      (SELECT role FROM public.current_employee_meta()) = 'leader'
      AND public.is_same_dept_as_me(probation_evaluations.employee_id)
    )
  )
);

CREATE POLICY "probation_evaluations_update_scoped"
ON public.probation_evaluations
FOR UPDATE
TO authenticated
USING (
  (SELECT role FROM public.current_employee_meta())
    IN ('admin','hr_admin','ceo','director','division_head','executive')
  OR evaluator_id = auth.uid()
)
WITH CHECK (
  (SELECT role FROM public.current_employee_meta())
    IN ('admin','hr_admin','ceo','director','division_head','executive')
  OR evaluator_id = auth.uid()
);

COMMIT;

-- 검증:
-- SELECT public.current_employee_meta();
-- SELECT public.is_same_dept_as_me('<조영은의 employee_id>');
