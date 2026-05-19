-- 095: probation_evaluations RLS — 단일 boolean 함수로 단순화
-- 문제: 094 의 (SELECT col FROM table_fn()) 패턴이 RLS WITH CHECK 컨텍스트에서
--       정책 평가는 true 인데 실제 INSERT 가 차단되는 미스매치 발생.
-- 해결: SECURITY DEFINER 단일 boolean 함수 can_evaluate_probation(emp_id) 로 통합

BEGIN;

-- 단일 권한 체크 함수: 현재 사용자가 target 직원의 수습평가를 진행 가능한지
CREATE OR REPLACE FUNCTION public.can_evaluate_probation(target_emp_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees me
    WHERE me.id = auth.uid()
      AND (
        -- 관리자급/임원/대표 — 모든 직원
        me.role IN ('admin','hr_admin','ceo','director','division_head','executive')
        OR
        -- 리더 — 본인 부서 직원
        (
          me.role = 'leader'
          AND me.department_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.employees emp
            WHERE emp.id = target_emp_id
              AND emp.department_id = me.department_id
          )
        )
      )
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.can_evaluate_probation(uuid) TO authenticated;

-- 기존 정책 제거 (094 정책 포함)
DROP POLICY IF EXISTS "probation_evaluations_insert_scoped" ON public.probation_evaluations;
DROP POLICY IF EXISTS "probation_evaluations_update_scoped" ON public.probation_evaluations;

-- 신규 INSERT 정책 — 단일 함수 호출
CREATE POLICY "probation_evaluations_insert_scoped"
ON public.probation_evaluations
FOR INSERT
TO authenticated
WITH CHECK (
  (evaluator_id IS NULL OR evaluator_id = auth.uid())
  AND public.can_evaluate_probation(employee_id)
);

-- 신규 UPDATE 정책 — 단일 함수 호출 OR 본인 작성
CREATE POLICY "probation_evaluations_update_scoped"
ON public.probation_evaluations
FOR UPDATE
TO authenticated
USING (
  public.can_evaluate_probation(employee_id)
  OR evaluator_id = auth.uid()
)
WITH CHECK (
  public.can_evaluate_probation(employee_id)
  OR evaluator_id = auth.uid()
);

COMMIT;

-- 검증:
-- SELECT public.can_evaluate_probation('<김민관의 employee_id>');
