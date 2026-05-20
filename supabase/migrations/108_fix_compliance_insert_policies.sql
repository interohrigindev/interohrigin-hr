-- 108: 컴플라이언스 모듈 전반 INSERT/UPDATE RLS 정책 누락 일괄 보강
--   - 마이그레이션 101~105 에서 SELECT 정책만 작성된 테이블들에 admin 계열 모디파이 정책 추가
--   - 대상:
--     * annual_leave_promotions (촉진 통지 이력)
--     * leave_promotion_responses (직원 회신)
--     * hours_warnings_sent (52h 경고)
--     * weekly_hours_snapshots (주간 시간 스냅샷)
--     * probation_alert_logs (수습 평가 알림 이력)
--   - 모디파이 권한: admin/hr_admin/ceo/director/division_head (필요 시 executive/leader 까지)

-- ============================================================
-- annual_leave_promotions
-- ============================================================
DROP POLICY IF EXISTS "leave_promo_modify" ON public.annual_leave_promotions;
CREATE POLICY "leave_promo_modify"
ON public.annual_leave_promotions FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
);

-- ============================================================
-- leave_promotion_responses — 직원 본인은 자기 응답 INSERT 허용,
-- 관리자는 전체 모디파이
-- ============================================================
DROP POLICY IF EXISTS "leave_promo_resp_modify_self" ON public.leave_promotion_responses;
CREATE POLICY "leave_promo_resp_modify_self"
ON public.leave_promotion_responses FOR ALL TO authenticated
USING (
  employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
)
WITH CHECK (
  employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
);

-- ============================================================
-- hours_warnings_sent
-- ============================================================
DROP POLICY IF EXISTS "hours_warnings_modify" ON public.hours_warnings_sent;
CREATE POLICY "hours_warnings_modify"
ON public.hours_warnings_sent FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive','leader')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive','leader')
  )
);

-- ============================================================
-- weekly_hours_snapshots
-- ============================================================
DROP POLICY IF EXISTS "weekly_hours_snap_modify" ON public.weekly_hours_snapshots;
CREATE POLICY "weekly_hours_snap_modify"
ON public.weekly_hours_snapshots FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive','leader')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive','leader')
  )
);

-- ============================================================
-- probation_alert_logs
-- ============================================================
DROP POLICY IF EXISTS "prob_alert_modify" ON public.probation_alert_logs;
CREATE POLICY "prob_alert_modify"
ON public.probation_alert_logs FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
);

-- ============================================================
-- legal_param_fetch_logs — admin 만 INSERT (자동 동기화 로그용)
-- ============================================================
DROP POLICY IF EXISTS "legal_fetch_logs_modify" ON public.legal_param_fetch_logs;
CREATE POLICY "legal_fetch_logs_modify"
ON public.legal_param_fetch_logs FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo')
  )
);
