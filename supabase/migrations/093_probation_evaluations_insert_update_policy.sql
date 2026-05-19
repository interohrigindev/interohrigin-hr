-- 093: probation_evaluations INSERT/UPDATE RLS 정책 복구
-- 문제: 리더(김푸른/최성주)가 평가 저장 시 'new row violates row-level security policy'
-- 원인: INSERT/UPDATE 정책이 누락되었거나 잘못 정의됨
-- 해결: 명시적으로 정책 재정의 (DROP IF EXISTS 후 CREATE)

BEGIN;

-- 기존 INSERT/UPDATE 정책 제거
DROP POLICY IF EXISTS "probation_evaluations_insert_auth" ON public.probation_evaluations;
DROP POLICY IF EXISTS "probation_evaluations_update_auth" ON public.probation_evaluations;
DROP POLICY IF EXISTS "probation_evaluations_insert_scoped" ON public.probation_evaluations;
DROP POLICY IF EXISTS "probation_evaluations_update_scoped" ON public.probation_evaluations;

-- INSERT 정책: 평가 권한 보유자
-- - admin/hr_admin/ceo/director/division_head/executive: 모든 직원
-- - leader: 본인 부서 직원 + 수습평가 메뉴 권한 보유
-- - evaluator_id 는 auth.uid() 와 일치해야 함 (다른 사람 사칭 방지)
CREATE POLICY "probation_evaluations_insert_scoped"
ON public.probation_evaluations
FOR INSERT
TO authenticated
WITH CHECK (
  -- evaluator_id 는 본인이어야 함 (NULL 허용 — 시스템 자동 생성용)
  (evaluator_id IS NULL OR evaluator_id = auth.uid())
  AND (
    -- 관리자급 / 임원 / 대표 전체
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive')
    )
    OR
    -- 리더: 본인 부서 직원
    EXISTS (
      SELECT 1
      FROM public.employees me
      JOIN public.employees emp ON emp.department_id = me.department_id
      WHERE me.id = auth.uid()
        AND me.role = 'leader'
        AND emp.id = probation_evaluations.employee_id
        AND me.department_id IS NOT NULL
    )
  )
);

-- UPDATE 정책: 본인이 작성한 평가 수정 또는 관리자
CREATE POLICY "probation_evaluations_update_scoped"
ON public.probation_evaluations
FOR UPDATE
TO authenticated
USING (
  -- 관리자급/임원/대표
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive')
  )
  OR
  -- 본인이 작성한 평가
  evaluator_id = auth.uid()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive')
  )
  OR
  evaluator_id = auth.uid()
);

COMMIT;

-- 검증:
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'probation_evaluations'
-- ORDER BY cmd, policyname;
