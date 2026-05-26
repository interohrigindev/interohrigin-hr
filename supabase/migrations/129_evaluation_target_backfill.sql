-- 129: 활성 평가 기간에 누락된 직원 자동 보강 + 진단 view
--
-- 배경 (2026-05-26 대표 보고):
--   강제묵 이사 / 김보미 팀장 화면에 유지혜 직원이 평가 대상으로 노출 안 됨.
--   김보미·유지혜 둘 다 경영관리본부 > 재무회계 팀 소속이라 RLS 통과해야 함.
--
-- 가장 가능성 높은 원인:
--   유지혜 입사일: 2025.06.09
--   활성 평가 기간(2026 Q1) 생성 시점에 유지혜가 employees 에 등록되어 있지 않거나
--   generate_evaluation_sheets 가 한 번만 호출되어 후속 입사자 미등록.
--   결과: evaluation_targets 에 유지혜 row 자체가 없음 → 누구에게도 안 보임.
--
-- 해결:
--   1) 진단 view 로 누락 즉시 확인
--   2) backfill_active_period_targets() RPC 로 활성 기간에 누락 직원 자동 추가
--   3) 향후 신규 입사자 자동 등록 보장 (별도 trigger 는 다음 사이클)

BEGIN;

-- ─── 1) 진단 view ──────────────────────────────────────────────────────
-- 활성 평가 기간 기준, 평가 대상이어야 하는데 evaluation_targets 에 없는 직원 식별
CREATE OR REPLACE VIEW public.v_evaluation_missing_targets AS
SELECT
  p.id        AS period_id,
  p.year,
  p.quarter,
  e.id        AS employee_id,
  e.name      AS employee_name,
  e.role      AS employee_role,
  e.hire_date,
  d.name      AS department_name,
  pd.name     AS parent_department_name
FROM public.evaluation_periods p
CROSS JOIN public.employees e
LEFT JOIN public.departments d  ON d.id = e.department_id
LEFT JOIN public.departments pd ON pd.id = d.parent_id
LEFT JOIN public.evaluation_targets t
  ON t.period_id = p.id AND t.employee_id = e.id
WHERE p.status = 'in_progress'
  AND e.is_active = true
  AND e.role IN ('employee', 'leader', 'hr_admin')
  AND t.id IS NULL
ORDER BY p.year DESC, p.quarter DESC, e.name;

COMMENT ON VIEW public.v_evaluation_missing_targets IS
  '활성 평가 기간에 등록되어야 하는데 evaluation_targets 에 없는 직원 (입사 시점 이슈로 누락된 케이스 탐지용)';

-- ─── 2) 일괄 보강 RPC ──────────────────────────────────────────────────
-- 활성 기간에 누락된 모든 대상자를 안전하게 추가
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
  -- 권한 확인: admin / hr_admin / ceo / director / division_head 만
  SELECT role INTO v_caller_role FROM employees WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'hr_admin', 'ceo', 'director', 'division_head') THEN
    RAISE EXCEPTION '권한이 없습니다. (현재 role: %)', v_caller_role;
  END IF;

  -- 활성 기간 찾기 (가장 최근 in_progress)
  SELECT id INTO v_period_id
  FROM evaluation_periods
  WHERE status = 'in_progress'
  ORDER BY year DESC, quarter DESC
  LIMIT 1;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION '활성 평가 기간이 없습니다.';
  END IF;

  -- 누락 직원 순회하며 추가
  FOR v_employee_id IN
    SELECT e.id
    FROM employees e
    LEFT JOIN evaluation_targets t
      ON t.period_id = v_period_id AND t.employee_id = e.id
    WHERE e.is_active = true
      AND e.role IN ('employee', 'leader', 'hr_admin')
      AND t.id IS NULL
  LOOP
    SELECT job_type_id INTO v_job_type_id
    FROM employee_job_assignments
    WHERE employee_id = v_employee_id
    ORDER BY assigned_at DESC
    LIMIT 1;

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
  '활성 평가 기간에 누락된 평가 대상자를 일괄 추가 (admin/hr_admin/ceo/director/division_head 만 호출 가능).';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- 사용 가이드:
-- ═══════════════════════════════════════════════════════════════════════
--
-- 【진단 1】 누락 직원 즉시 확인
--   SELECT * FROM v_evaluation_missing_targets;
--   → 유지혜를 비롯해 누락된 모든 직원이 한 번에 출력됨
--
-- 【진단 2】 유지혜 부서/평가 상태 정밀 확인
--   SELECT e.name, e.role, d.name AS dept, d.parent_id,
--          t.id AS target_id, t.status
--   FROM employees e
--   LEFT JOIN departments d ON d.id = e.department_id
--   LEFT JOIN evaluation_targets t ON t.employee_id = e.id
--   LEFT JOIN evaluation_periods p ON p.id = t.period_id AND p.status = 'in_progress'
--   WHERE e.name IN ('김보미', '유지혜')
--   ORDER BY e.name;
--
--   해석:
--     · 김보미.dept ≠ 유지혜.dept    → UI 재선택 또는 직접 update 필요
--     · 김보미.dept = 유지혜.dept    → RLS 통과 가능
--     · 유지혜 target_id 가 NULL    → row 누락 → backfill RPC 실행
--     · 유지혜 status = 'pending'   → 본인 자기평가 미완 → 안내
--
-- 【보강 실행】 한 번에 누락 직원 모두 추가
--   SELECT backfill_active_period_targets();
--   → {"ok": true, "added": N, "message": "N명의 누락 직원이 ..."}
-- ═══════════════════════════════════════════════════════════════════════
