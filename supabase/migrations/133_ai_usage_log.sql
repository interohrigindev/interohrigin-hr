-- =====================================================================
-- 133_ai_usage_log.sql
-- PDCA #3 (unified-ai-cost-dashboard) Do Session 1 — module-1
-- 전사 AI 사용 과금 공통 로그 테이블 + cross-schema 통합 집계 RPC
--
-- Design Ref: §3.1 (ai_usage_log), §3.3 (get_unified_ai_costs)
-- 절대 규칙 준수: 기존 테이블 ALTER 0. 신규 테이블/RPC만 추가.
-- finance/cs/mall 테이블은 RPC가 읽기 전용으로만 접근.
--
-- 권한 주의: public.is_admin() 은 role IN ('director','division_head','ceo','admin')
--   으로 hr_admin 이 빠져 있어 billing 화면(AdminRoute: +hr_admin)과 불일치.
--   따라서 본 RPC/RLS 는 AdminRoute 와 동일한 5개 role 을 인라인으로 명시한다.
-- =====================================================================

-- ─── 1. 공통 로그 테이블 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL CHECK (source_system IN ('hr','cs','finance','mall')),
  feature       text,                          -- 'resume_analysis' | 'interview_analysis' | 'meeting_stt' | 'chat' ...
  provider      text NOT NULL,                 -- 'gemini' | 'openai' | 'anthropic' | 'whisper' | 'deepgram'
  model         text NOT NULL,
  tokens_input  integer NOT NULL DEFAULT 0,
  tokens_output integer NOT NULL DEFAULT 0,
  unit_count    numeric,                        -- 토큰 외 단위 (STT 분 등). NULL 이면 토큰 기반
  unit_type     text,                           -- 'minutes' 등 (unit_count 동반)
  ref_table     text,                           -- 추적용 (예: 'meeting_records')
  ref_id        uuid,                           -- 추적용
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  created_by    uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_occurred ON public.ai_usage_log (occurred_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_system   ON public.ai_usage_log (source_system);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_model    ON public.ai_usage_log (model);

-- ─── 2. RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

-- INSERT: 인증된 사용자(앱)는 자기 호출 기록만 적재 (created_by = 본인)
DROP POLICY IF EXISTS ai_usage_insert_self ON public.ai_usage_log;
CREATE POLICY ai_usage_insert_self ON public.ai_usage_log
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- SELECT: 관리자 role 만 (직접 조회는 거의 안 쓰고 RPC 로 집계. 방어적으로 관리자 한정)
DROP POLICY IF EXISTS ai_usage_select_admin ON public.ai_usage_log;
CREATE POLICY ai_usage_select_admin ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('director','division_head','ceo','admin','hr_admin')
    )
  );

-- ─── 3. 통합 집계 RPC (cross-schema, raw 토큰/단위만 반환 — 단가 환산은 클라) ──
-- Design Ref: §3.3 — SECURITY DEFINER + search_path 고정 + guard CTE 로 비관리자 0행
DROP FUNCTION IF EXISTS public.get_unified_ai_costs(date, date);
CREATE OR REPLACE FUNCTION public.get_unified_ai_costs(p_start date, p_end date)
RETURNS TABLE (
  source_system text,
  feature       text,
  provider      text,
  model         text,
  tokens_input  bigint,
  tokens_output bigint,
  unit_count    numeric,
  unit_type     text,
  occurred_at   timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, finance
AS $$
  -- 관리자 권한 체크 (billing AdminRoute 와 동일 5개 role). 비관리자 = 0행
  WITH guard AS (
    SELECT 1 AS ok WHERE EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('director','division_head','ceo','admin','hr_admin')
    )
  )
  -- (a) 공통 로그 (HR 신규 적재 + 향후 cs/mall 합류)
  SELECT l.source_system, l.feature, l.provider, l.model,
         l.tokens_input::bigint, l.tokens_output::bigint,
         l.unit_count, l.unit_type, l.occurred_at
  FROM public.ai_usage_log l
  CROSS JOIN guard
  WHERE l.occurred_at >= p_start
    AND l.occurred_at < (p_end + 1)        -- p_end 당일 포함 (exclusive upper)

  UNION ALL
  -- (b) finance 기존 AI 리포트 3종 (읽기 전용, model 만 — provider 는 클라가 추론)
  SELECT 'finance'::text, 'ai_report'::text, NULL::text, ar.model,
         ar.tokens_used::bigint, 0::bigint, NULL::numeric, NULL::text, ar.created_at
  FROM finance.ai_reports ar
  CROSS JOIN guard
  WHERE ar.created_at >= p_start AND ar.created_at < (p_end + 1)

  UNION ALL
  SELECT 'finance'::text, 'fixed_cost_ai_report'::text, NULL::text, far.model,
         far.tokens_used::bigint, 0::bigint, NULL::numeric, NULL::text, far.generated_at
  FROM finance.fixed_cost_ai_reports far
  CROSS JOIN guard
  WHERE far.generated_at >= p_start AND far.generated_at < (p_end + 1)

  UNION ALL
  SELECT 'finance'::text, 'pnl_ai_report'::text, NULL::text, par.model,
         par.tokens_input::bigint, par.tokens_output::bigint, NULL::numeric, NULL::text, par.generated_at
  FROM finance.pnl_ai_reports par
  CROSS JOIN guard
  WHERE par.generated_at >= p_start AND par.generated_at < (p_end + 1);
$$;

-- 실행 권한: authenticated 만 (PUBLIC revoke)
REVOKE ALL ON FUNCTION public.get_unified_ai_costs(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unified_ai_costs(date, date) TO authenticated;

-- =====================================================================
-- 검증 쿼리 (메인이 적용 후 실행 — 참고용, 적용 SQL 아님)
--   SELECT * FROM public.get_unified_ai_costs('2025-01-01','2026-12-31');
--     → finance 4건 반환 기대 (관리자 세션). ai_usage_log 는 아직 0행.
--   비관리자 세션: 0행 기대.
-- =====================================================================
