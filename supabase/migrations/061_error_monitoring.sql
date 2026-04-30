-- 061_error_monitoring.sql
-- 목적: 자가 진단·모니터링 시스템 Phase 1~3 인프라
--   error_logs (에러 자동 수집), health_checks (능동 점검), maintenance_tasks (관리자 보완 큐)

-- ─── 1) error_logs ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_hash text NOT NULL,                            -- 중복 식별 (메시지+route 기반 해시)
  error_type text NOT NULL,                            -- react_error, network, supabase, unhandled_rejection, manual
  message text,
  stack text,
  component_stack text,
  user_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  user_role text,
  route text,
  user_agent text,
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('info','warning','error','critical')),
  occurrence_count int NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  resolution_note text,
  ai_analysis jsonb,                                    -- { root_cause, fix_proposal, severity_recommendation, affected_modules }
  ai_analyzed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 동일 해시는 1행만 (중복 카운트로 처리)
CREATE UNIQUE INDEX IF NOT EXISTS uq_error_logs_hash ON public.error_logs(error_hash);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON public.error_logs(severity, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved ON public.error_logs(severity, last_seen_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_error_logs_route ON public.error_logs(route);

-- ─── 2) health_checks ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text NOT NULL,                             -- 'data_consistency', 'migration_status', 'rls_check' 등
  status text NOT NULL CHECK (status IN ('pass','fail','warning')),
  duration_ms int,
  details jsonb,                                        -- 실패한 항목·세부 데이터
  error_message text,
  ran_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_checks_recent ON public.health_checks(ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_failures ON public.health_checks(check_name, status, ran_at DESC) WHERE status <> 'pass';

-- ─── 3) maintenance_tasks (Phase 4 대체 — 자동보완 대신 관리자 검토 큐) ──
CREATE TABLE IF NOT EXISTS public.maintenance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL,                              -- 'data_inconsistency', 'orphan_record', 'stale_subscription' 등
  title text NOT NULL,
  description text,
  related_table text,
  related_ids jsonb,                                    -- 영향받는 레코드 ID 배열
  proposed_action text,                                 -- 추천 조치 (실행하지 않음)
  proposed_sql text,                                    -- 관리자 승인 후 실행할 SQL (참고용)
  detected_by text,                                     -- 'ai', 'health_check', 'manual' 등
  severity text DEFAULT 'normal' CHECK (severity IN ('low','normal','high','critical')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','resolved','dismissed')),
  reviewed_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_pending ON public.maintenance_tasks(severity, detected_at DESC) WHERE status = 'pending';

-- ─── 4) RLS — 관리자 전용 ───────────────────────────────
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;

-- error_logs: 누구나 INSERT (수집), admin/ceo 만 SELECT/UPDATE
DROP POLICY IF EXISTS error_logs_insert ON public.error_logs;
CREATE POLICY error_logs_insert ON public.error_logs FOR INSERT TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS error_logs_select_admin ON public.error_logs;
CREATE POLICY error_logs_select_admin ON public.error_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('ceo','admin')
  ));

DROP POLICY IF EXISTS error_logs_update_admin ON public.error_logs;
CREATE POLICY error_logs_update_admin ON public.error_logs FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('ceo','admin')
  ));

-- health_checks: admin/ceo 전용
DROP POLICY IF EXISTS health_checks_admin ON public.health_checks;
CREATE POLICY health_checks_admin ON public.health_checks FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('ceo','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('ceo','admin')
  ));

-- maintenance_tasks: admin/ceo 전용
DROP POLICY IF EXISTS maintenance_admin ON public.maintenance_tasks;
CREATE POLICY maintenance_admin ON public.maintenance_tasks FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('ceo','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('ceo','admin')
  ));

-- ─── 5) RPC: 에러 로그 upsert (해시 기반 중복 카운트) ──
CREATE OR REPLACE FUNCTION public.log_error(
  p_error_hash text,
  p_error_type text,
  p_message text DEFAULT NULL,
  p_stack text DEFAULT NULL,
  p_component_stack text DEFAULT NULL,
  p_route text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_severity text DEFAULT 'error',
  p_user_role text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO error_logs (
    error_hash, error_type, message, stack, component_stack,
    user_id, user_role, route, user_agent, severity
  )
  VALUES (
    p_error_hash, p_error_type, p_message, p_stack, p_component_stack,
    auth.uid(), p_user_role, p_route, p_user_agent, p_severity
  )
  ON CONFLICT (error_hash) DO UPDATE SET
    occurrence_count = error_logs.occurrence_count + 1,
    last_seen_at = now(),
    -- 가장 최근 사용자/스택으로 갱신 (역추적 용이)
    user_id = COALESCE(EXCLUDED.user_id, error_logs.user_id),
    user_role = COALESCE(EXCLUDED.user_role, error_logs.user_role),
    route = COALESCE(EXCLUDED.route, error_logs.route),
    -- resolved 상태였더라도 재발 시 reopen
    resolved_at = NULL,
    resolved_by = NULL
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_error TO authenticated, anon;
