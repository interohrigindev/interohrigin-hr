-- 107: snapshot_all_leave_balances RPC 의 ambiguous snapshot_date 오류 수정
--   - RETURNS TABLE 의 컬럼명을 snapshot_date → as_of_date 로 변경
--   - INSERT 내부의 컬럼 참조와 충돌 제거

-- 함수 시그니처가 바뀌므로 먼저 DROP
DROP FUNCTION IF EXISTS public.snapshot_all_leave_balances();

CREATE OR REPLACE FUNCTION public.snapshot_all_leave_balances()
RETURNS TABLE(employee_count integer, as_of_date date)
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

  INSERT INTO public.leave_balance_snapshots AS lbs
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

COMMENT ON FUNCTION public.snapshot_all_leave_balances() IS
  '잔여 연차 일괄 스냅샷 — admin/hr_admin/ceo/director/division_head 만 호출 가능. employee_hr_details 기반.';
