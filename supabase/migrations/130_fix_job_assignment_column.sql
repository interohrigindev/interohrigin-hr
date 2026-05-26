-- 130: employee_job_assignments.assigned_at 컬럼 부재 회귀 — 126 + 129 일괄 fix
--
-- 🚨 보고 (2026-05-26):
--   SELECT backfill_active_period_targets();
--   → ERROR 42703: column "assigned_at" does not exist
--
-- 근본 원인:
--   employee_job_assignments 테이블 실제 컬럼 (042 정의):
--     id, employee_id, job_type_id, created_at, UNIQUE(employee_id)
--   "assigned_at" 컬럼은 존재한 적이 없음.
--
--   126_hr_admin_evaluation_flow.sql:46 — generate_evaluation_sheets RPC
--   129_evaluation_target_backfill.sql:92 — backfill_active_period_targets RPC
--   두 곳 모두 잘못된 `ORDER BY assigned_at DESC` 추가.
--
--   UNIQUE(employee_id) 제약상 한 직원당 1행만 존재하므로 ORDER BY 자체가
--   불필요. 042 원본은 ORDER BY 없이 단순 SELECT.
--
-- 해결: 두 함수 모두 ORDER BY 절 제거 (042 원본 패턴 복구).

BEGIN;

-- ─── 1) generate_evaluation_sheets 재정의 (126 + 130 통합본) ────────────
CREATE OR REPLACE FUNCTION public.generate_evaluation_sheets(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target_id   uuid;
  v_employee_id uuid;
  v_job_type_id uuid;
  v_count       integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM evaluation_periods WHERE id = p_period_id) THEN
    RAISE EXCEPTION '평가 기간을 찾을 수 없습니다: %', p_period_id;
  END IF;

  -- hr_admin 도 자기평가 대상 (126 정책 유지) — leader 동급
  FOR v_employee_id IN
    SELECT id FROM employees
    WHERE is_active = true AND role IN ('employee', 'leader', 'hr_admin')
  LOOP
    -- UNIQUE(employee_id) 보장이므로 ORDER BY 불필요 (130 fix)
    SELECT job_type_id INTO v_job_type_id
    FROM employee_job_assignments
    WHERE employee_id = v_employee_id;

    INSERT INTO evaluation_targets (period_id, employee_id, job_type_id, status)
    VALUES (p_period_id, v_employee_id, v_job_type_id, 'pending')
    ON CONFLICT (period_id, employee_id) DO NOTHING
    RETURNING id INTO v_target_id;

    IF v_target_id IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_evaluation_sheets(uuid) TO authenticated;

COMMENT ON FUNCTION public.generate_evaluation_sheets(uuid) IS
  '평가 기간 생성 시 활성 직원(employee/leader/hr_admin) 자동 등록 (130: assigned_at 컬럼 회귀 fix).';

-- ─── 2) backfill_active_period_targets 재정의 (129 + 130) ──────────────
CREATE OR REPLACE FUNCTION public.backfill_active_period_targets()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_period_id   uuid;
  v_added       integer := 0;
  v_employee_id uuid;
  v_job_type_id uuid;
BEGIN
  SELECT role INTO v_caller_role FROM employees WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'hr_admin', 'ceo', 'director', 'division_head') THEN
    RAISE EXCEPTION '권한이 없습니다. (현재 role: %)', v_caller_role;
  END IF;

  SELECT id INTO v_period_id
  FROM evaluation_periods
  WHERE status = 'in_progress'
  ORDER BY year DESC, quarter DESC
  LIMIT 1;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION '활성 평가 기간이 없습니다.';
  END IF;

  FOR v_employee_id IN
    SELECT e.id
    FROM employees e
    LEFT JOIN evaluation_targets t
      ON t.period_id = v_period_id AND t.employee_id = e.id
    WHERE e.is_active = true
      AND e.role IN ('employee', 'leader', 'hr_admin')
      AND t.id IS NULL
  LOOP
    -- UNIQUE(employee_id) 보장이므로 ORDER BY 불필요 (130 fix)
    SELECT job_type_id INTO v_job_type_id
    FROM employee_job_assignments
    WHERE employee_id = v_employee_id;

    INSERT INTO evaluation_targets (period_id, employee_id, job_type_id, status)
    VALUES (v_period_id, v_employee_id, v_job_type_id, 'pending')
    ON CONFLICT (period_id, employee_id) DO NOTHING;

    v_added := v_added + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',         true,
    'period_id',  v_period_id,
    'added',      v_added,
    'message',    format('%s명의 누락 직원이 평가 대상으로 추가되었습니다.', v_added)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_active_period_targets() FROM anon;
GRANT  EXECUTE ON FUNCTION public.backfill_active_period_targets() TO authenticated;

COMMENT ON FUNCTION public.backfill_active_period_targets() IS
  '활성 평가 기간에 누락된 평가 대상자 일괄 추가 (130: assigned_at 컬럼 회귀 fix).';

COMMIT;
