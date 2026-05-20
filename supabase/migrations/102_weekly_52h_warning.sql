-- 102: P1-2 — 주 52시간 사전 경고
-- 기준: docs/HR플랫폼_법적리스크대응_보완개발계획_0520.md §4 P1-2
-- 재사용: weekly_hours_tracking (기존), attendance_records (기존)
-- 신규: hours_warnings_sent, weekly_hours_snapshots

BEGIN;

-- 경고 발송 이력
CREATE TABLE IF NOT EXISTS public.hours_warnings_sent (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  week_start      date NOT NULL,
  level           text NOT NULL CHECK (level IN ('warn_45','warn_50','over_52')),
  total_hours     float NOT NULL,
  message         text,
  channel         text NOT NULL DEFAULT 'email',
  delivered       boolean NOT NULL DEFAULT false,
  delivery_id     uuid REFERENCES public.notification_deliveries(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, week_start, level)
);

CREATE INDEX IF NOT EXISTS hours_warnings_emp_idx ON public.hours_warnings_sent (employee_id, week_start DESC);

ALTER TABLE public.hours_warnings_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hours_warnings_select" ON public.hours_warnings_sent;
CREATE POLICY "hours_warnings_select"
ON public.hours_warnings_sent FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive','leader')
  )
);

-- 주간 스냅샷 (계산 결과 캐싱 + 이력)
CREATE TABLE IF NOT EXISTS public.weekly_hours_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  week_start        date NOT NULL,
  week_end          date NOT NULL,
  attendance_hours  float NOT NULL DEFAULT 0,
  overtime_hours    float NOT NULL DEFAULT 0,
  total_hours       float NOT NULL DEFAULT 0,
  current_level     text CHECK (current_level IN ('safe','warn_45','warn_50','over_52')),
  computed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, week_start)
);

CREATE INDEX IF NOT EXISTS weekly_hours_snap_emp_idx ON public.weekly_hours_snapshots (employee_id, week_start DESC);
CREATE INDEX IF NOT EXISTS weekly_hours_snap_level_idx ON public.weekly_hours_snapshots (current_level, week_start DESC);

ALTER TABLE public.weekly_hours_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly_hours_snap_select" ON public.weekly_hours_snapshots;
CREATE POLICY "weekly_hours_snap_select"
ON public.weekly_hours_snapshots FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive','leader')
  )
);

-- RPC: 본인 또는 단일 직원 현재 주차 시간 계산 + 스냅샷
CREATE OR REPLACE FUNCTION public.compute_weekly_hours(
  p_employee_id uuid DEFAULT NULL,         -- NULL = 본인
  p_week_start  date DEFAULT NULL          -- NULL = 이번 주 월요일
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_emp_id uuid;
  v_week_start date;
  v_week_end date;
  v_att_hours float := 0;
  v_ot_hours float := 0;
  v_total float := 0;
  v_level text := 'safe';
  v_snap_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다' USING ERRCODE='42501'; END IF;

  v_emp_id := COALESCE(p_employee_id, v_uid);

  -- 본인 이외 직원 조회는 관리자급만
  IF v_emp_id <> v_uid THEN
    SELECT role INTO v_role FROM public.employees WHERE id = v_uid LIMIT 1;
    IF v_role IS NULL OR v_role NOT IN ('admin','hr_admin','ceo','director','division_head','executive','leader') THEN
      RAISE EXCEPTION '권한이 없습니다' USING ERRCODE='42501';
    END IF;
  END IF;

  -- 주 시작일 (월요일 기준)
  v_week_start := COALESCE(p_week_start, DATE_TRUNC('week', CURRENT_DATE)::date);
  v_week_end := v_week_start + INTERVAL '6 days';

  -- attendance 합산
  SELECT COALESCE(SUM(total_hours), 0)
    INTO v_att_hours
    FROM public.attendance_records
   WHERE employee_id = v_emp_id
     AND date >= v_week_start AND date <= v_week_end;

  -- 승인된 overtime_requests 의 예정 시간 (해당 주차 내, 실제 종료기록 우선)
  SELECT COALESCE(SUM(
    CASE
      WHEN a.actual_minutes IS NOT NULL THEN a.actual_minutes / 60.0
      ELSE r.expected_minutes / 60.0
    END
  ), 0)
    INTO v_ot_hours
    FROM public.overtime_requests r
    LEFT JOIN public.overtime_actuals a ON a.request_id = r.id
   WHERE r.requester_uid = v_emp_id
     AND r.status = 'approved'
     AND r.request_date >= v_week_start AND r.request_date <= v_week_end;

  v_total := v_att_hours + v_ot_hours;

  v_level := CASE
    WHEN v_total >= 52 THEN 'over_52'
    WHEN v_total >= 50 THEN 'warn_50'
    WHEN v_total >= 45 THEN 'warn_45'
    ELSE 'safe'
  END;

  INSERT INTO public.weekly_hours_snapshots
    (employee_id, week_start, week_end, attendance_hours, overtime_hours, total_hours, current_level)
  VALUES
    (v_emp_id, v_week_start, v_week_end, v_att_hours, v_ot_hours, v_total, v_level)
  ON CONFLICT (employee_id, week_start) DO UPDATE
    SET attendance_hours = EXCLUDED.attendance_hours,
        overtime_hours = EXCLUDED.overtime_hours,
        total_hours = EXCLUDED.total_hours,
        current_level = EXCLUDED.current_level,
        computed_at = now()
  RETURNING id INTO v_snap_id;

  RETURN jsonb_build_object(
    'snapshot_id', v_snap_id,
    'employee_id', v_emp_id,
    'week_start', v_week_start,
    'week_end', v_week_end,
    'attendance_hours', v_att_hours,
    'overtime_hours', v_ot_hours,
    'total_hours', v_total,
    'current_level', v_level
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_weekly_hours(uuid, date) TO authenticated;

COMMIT;
