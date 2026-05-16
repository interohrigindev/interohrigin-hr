-- ════════════════════════════════════════════════════════════════════
-- 085. probation_evaluations 리더 부서 권한 분리 RLS
-- ════════════════════════════════════════════════════════════════════
-- 목적: 리더(role='leader')가 본인 부서 외 직원의 수습평가를 못 보도록 제한
-- 영향 범위: probation_evaluations SELECT 정책만 변경 (다른 테이블 무관)
-- 롤백: 마지막 DROP/CREATE 블록 역순 실행 (파일 하단 주석 참조)
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 기존 제한 없는 SELECT 정책 제거 (USING (true))
DROP POLICY IF EXISTS "probation_evaluations_select_auth" ON public.probation_evaluations;

-- 신규: 역할별 범위 제한 SELECT 정책
-- - admin/ceo/director/division_head: 전체 (is_admin())
-- - executive: 전체 (모든 임원이 모든 수습 평가 조회 가능)
-- - leader: 본인 부서(employees.department_id 일치)의 수습직원 평가만
-- - 일반 직원: 본인이 평가 대상일 때 + is_visible_to_employee=true 일 경우만
CREATE POLICY "probation_evaluations_select_scoped"
ON public.probation_evaluations
FOR SELECT
TO authenticated
USING (
  -- 관리자급 (director/division_head/ceo/admin) 전체 조회
  public.is_admin()
  OR
  -- 임원 전체 조회
  EXISTS (
    SELECT 1 FROM public.employees me
    WHERE me.id = auth.uid()
      AND me.role = 'executive'
  )
  OR
  -- 리더: 본인 부서 직원의 평가만
  EXISTS (
    SELECT 1
    FROM public.employees me
    JOIN public.employees emp ON emp.department_id = me.department_id
    WHERE me.id = auth.uid()
      AND me.role = 'leader'
      AND emp.id = probation_evaluations.employee_id
      AND me.department_id IS NOT NULL
  )
  OR
  -- 본인이 평가 대상이며 공개 처리된 경우
  (
    employee_id = auth.uid()
    AND COALESCE(is_visible_to_employee, false) = true
  )
);

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 검증 쿼리 (마이그레이션 적용 후 실행 권장)
-- ════════════════════════════════════════════════════════════════════
-- 1) 정책 적용 확인
--    SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'probation_evaluations' AND cmd = 'SELECT';
--
-- 2) 김푸른(leader, BM 부서) 시점에서 김보미(경영관리본부) 평가가 안 보이는지 확인
--    (Supabase SQL Editor 는 service_role 로 실행되므로 RLS 우회됨 → 실제 검증은
--     김푸른 계정으로 로그인 후 앱에서 확인하거나 별도 테스트 사용자로 수행)

-- ════════════════════════════════════════════════════════════════════
-- 롤백 SQL (필요 시 별도 실행)
-- ════════════════════════════════════════════════════════════════════
-- BEGIN;
--   DROP POLICY IF EXISTS "probation_evaluations_select_scoped" ON public.probation_evaluations;
--   CREATE POLICY "probation_evaluations_select_auth"
--     ON public.probation_evaluations FOR SELECT TO authenticated USING (true);
-- COMMIT;
