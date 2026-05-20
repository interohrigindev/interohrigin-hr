-- 106: leave_balance_snapshots INSERT/UPDATE RLS 정책 누락 보강
--      + legal_params 정부 발표값 시드 (최저임금/4대보험)
--      + 안전한 SECURITY DEFINER 스냅샷 RPC (RLS 우회 옵션)

-- ============================================================
-- 1. leave_balance_snapshots RLS 정책 추가
-- ============================================================
DROP POLICY IF EXISTS "leave_balance_modify" ON public.leave_balance_snapshots;
CREATE POLICY "leave_balance_modify"
ON public.leave_balance_snapshots FOR ALL TO authenticated
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
-- 2. 안전한 일괄 스냅샷 RPC (RLS 신뢰성 우회용)
--    클라이언트에서 호출 시 admin/hr_admin/ceo 만 통과
-- ============================================================
CREATE OR REPLACE FUNCTION public.snapshot_all_leave_balances()
RETURNS TABLE(employee_count integer, snapshot_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_today date := CURRENT_DATE;
  v_count integer := 0;
BEGIN
  SELECT role INTO v_role FROM public.employees WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin','hr_admin','ceo','director','division_head') THEN
    RAISE EXCEPTION 'forbidden: admin/hr_admin/ceo/director/division_head only';
  END IF;

  INSERT INTO public.leave_balance_snapshots
    (employee_id, snapshot_date, total_days, used_days, remaining_days, estimated_liability_krw)
  SELECT
    d.employee_id,
    v_today,
    COALESCE(d.annual_leave_total, 0),
    COALESCE(d.annual_leave_used, 0),
    COALESCE(d.annual_leave_remaining, 0),
    ROUND((COALESCE(d.base_salary, 0) / 209.0 * 8) * COALESCE(d.annual_leave_remaining, 0))::integer
  FROM public.employee_hr_details d
  WHERE d.employee_id IS NOT NULL
  ON CONFLICT (employee_id, snapshot_date) DO UPDATE SET
    total_days = EXCLUDED.total_days,
    used_days = EXCLUDED.used_days,
    remaining_days = EXCLUDED.remaining_days,
    estimated_liability_krw = EXCLUDED.estimated_liability_krw;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count, v_today;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snapshot_all_leave_balances() TO authenticated;

-- ============================================================
-- 3. legal_params 정부 발표값 시드 (2024~2026 최저임금 + 4대보험)
--    이미 존재하면 skip (param_key + effective_from UNIQUE 가정 아님 → ON CONFLICT 불가)
--    중복 방지 위해 NOT EXISTS 가드
-- ============================================================
INSERT INTO public.legal_params (param_key, param_value, effective_from, source, status, notes)
SELECT 'min_wage_hourly', '{"amount": 9860, "currency": "KRW", "unit": "hour"}'::jsonb,
       '2024-01-01', '고용노동부 고시 제2023-43호', 'active',
       '2024년 시간당 최저임금 (전년 대비 2.5% 인상)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.legal_params WHERE param_key='min_wage_hourly' AND effective_from='2024-01-01'
);

INSERT INTO public.legal_params (param_key, param_value, effective_from, source, status, notes)
SELECT 'min_wage_hourly', '{"amount": 10030, "currency": "KRW", "unit": "hour"}'::jsonb,
       '2025-01-01', '고용노동부 고시 제2024-45호', 'active',
       '2025년 시간당 최저임금 (전년 대비 1.7% 인상)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.legal_params WHERE param_key='min_wage_hourly' AND effective_from='2025-01-01'
);

INSERT INTO public.legal_params (param_key, param_value, effective_from, source, status, notes)
SELECT 'min_wage_hourly', '{"amount": 10320, "currency": "KRW", "unit": "hour"}'::jsonb,
       '2026-01-01', '고용노동부 고시 (2025-07 발표)', 'active',
       '2026년 시간당 최저임금 (전년 대비 2.9% 인상)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.legal_params WHERE param_key='min_wage_hourly' AND effective_from='2026-01-01'
);

-- 4대보험 요율 (2026 기준, 근로자/사업주 각각)
INSERT INTO public.legal_params (param_key, param_value, effective_from, source, status, notes)
SELECT 'national_pension_rate',
       '{"employee_rate": 0.045, "employer_rate": 0.045, "total": 0.09}'::jsonb,
       '2026-01-01', '국민연금공단', 'active',
       '국민연금 기여율 (근로자 4.5% + 사업주 4.5%)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.legal_params WHERE param_key='national_pension_rate' AND effective_from='2026-01-01'
);

INSERT INTO public.legal_params (param_key, param_value, effective_from, source, status, notes)
SELECT 'health_insurance_rate',
       '{"employee_rate": 0.03545, "employer_rate": 0.03545, "total": 0.0709, "long_term_care_rate": 0.001281}'::jsonb,
       '2026-01-01', '국민건강보험공단', 'active',
       '건강보험료율 7.09% (반반 부담) + 장기요양보험 0.9182%'
WHERE NOT EXISTS (
  SELECT 1 FROM public.legal_params WHERE param_key='health_insurance_rate' AND effective_from='2026-01-01'
);

INSERT INTO public.legal_params (param_key, param_value, effective_from, source, status, notes)
SELECT 'employment_insurance_rate',
       '{"employee_rate": 0.009, "employer_rate": 0.009, "additional_employer_rate_lt150": 0.0025}'::jsonb,
       '2026-01-01', '고용노동부', 'active',
       '고용보험료 1.8% (반반) + 사업주 추가 (고용안정·직업능력개발사업 0.25%~)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.legal_params WHERE param_key='employment_insurance_rate' AND effective_from='2026-01-01'
);

INSERT INTO public.legal_params (param_key, param_value, effective_from, source, status, notes)
SELECT 'industrial_accident_rate',
       '{"employer_rate_avg": 0.014, "note": "업종별 차등"}'::jsonb,
       '2026-01-01', '근로복지공단', 'active',
       '산재보험료율 (사업주 전액, 업종별 차등 — 평균 1.4%)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.legal_params WHERE param_key='industrial_accident_rate' AND effective_from='2026-01-01'
);

-- 주 52시간 (P1-2 모듈에서 참조)
INSERT INTO public.legal_params (param_key, param_value, effective_from, source, status, notes)
SELECT 'weekly_max_hours',
       '{"regular": 40, "overtime_max": 12, "total_max": 52}'::jsonb,
       '2018-07-01', '근로기준법 §50, §53', 'active',
       '주 최대 근로시간 — 기본 40h + 연장 12h = 52h (5인 이상 사업장)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.legal_params WHERE param_key='weekly_max_hours' AND effective_from='2018-07-01'
);

-- 연차 부여 기준 (P1-3 연차촉진 모듈에서 참조)
INSERT INTO public.legal_params (param_key, param_value, effective_from, source, status, notes)
SELECT 'annual_leave_grant',
       '{"first_year_monthly": 1, "after_year_base": 15, "max_with_long_service": 25, "long_service_add_per_2y": 1}'::jsonb,
       '2018-05-29', '근로기준법 §60', 'active',
       '연차 부여 — 1년 미만 매월 1일 / 1년 이상 15일 / 3년 이상 2년마다 1일 추가 (최대 25일)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.legal_params WHERE param_key='annual_leave_grant' AND effective_from='2018-05-29'
);

-- ============================================================
-- 4. legal_param_fetch_logs 에 시드 출처 기록
-- ============================================================
INSERT INTO public.legal_param_fetch_logs (param_key, source_url, fetched_at, success, response_summary, fetched_by)
VALUES
  ('min_wage_hourly', 'manual_seed_106', now(), true, '정부 공식 발표값 수동 시드 (2024~2026)', NULL),
  ('national_pension_rate', 'manual_seed_106', now(), true, '국민연금공단 공시 요율 수동 시드 (2026)', NULL),
  ('health_insurance_rate', 'manual_seed_106', now(), true, '건강보험공단 공시 요율 수동 시드 (2026)', NULL),
  ('employment_insurance_rate', 'manual_seed_106', now(), true, '고용노동부 공시 요율 수동 시드 (2026)', NULL),
  ('industrial_accident_rate', 'manual_seed_106', now(), true, '근로복지공단 공시 요율 수동 시드 (2026)', NULL),
  ('weekly_max_hours', 'manual_seed_106', now(), true, '근로기준법 §50, §53 수동 시드', NULL),
  ('annual_leave_grant', 'manual_seed_106', now(), true, '근로기준법 §60 수동 시드', NULL);

COMMENT ON FUNCTION public.snapshot_all_leave_balances() IS
  '잔여 연차 일괄 스냅샷 — admin/hr_admin/ceo/director/division_head 만 호출 가능. employee_hr_details 기반.';
