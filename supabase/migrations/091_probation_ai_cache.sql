-- 091: 수습평가 AI 분석 결과 영속화
-- 용도: 종합 분석(강점/약점/조언) + 회차별 통합 요약 + 추이 분석 결과를 DB에 저장
--       페이지 새로고침/재방문 시 매번 재생성 안 하고 캐시 활용

CREATE TABLE IF NOT EXISTS public.probation_ai_cache (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  cache_type  text        NOT NULL CHECK (cache_type IN ('overall','trend','round1','round2','round3')),
  content     jsonb       NOT NULL,
  created_by  uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, cache_type)
);

CREATE INDEX IF NOT EXISTS idx_probation_ai_cache_emp ON public.probation_ai_cache(employee_id);

-- updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS trg_probation_ai_cache_updated_at ON public.probation_ai_cache;
CREATE TRIGGER trg_probation_ai_cache_updated_at
  BEFORE UPDATE ON public.probation_ai_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.probation_ai_cache ENABLE ROW LEVEL SECURITY;

-- 관리자/임원/대표/리더(평가 메뉴 권한 보유)/평가 참여자만 조회/저장
DROP POLICY IF EXISTS probation_ai_cache_select ON public.probation_ai_cache;
CREATE POLICY probation_ai_cache_select ON public.probation_ai_cache
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive')
    )
    OR EXISTS (
      SELECT 1 FROM public.probation_evaluations pe
      WHERE pe.employee_id = probation_ai_cache.employee_id
        AND pe.evaluator_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.menu_permissions mp
      JOIN public.employees e ON e.id = auth.uid()
      WHERE mp.employee_id = auth.uid()
        AND e.role = 'leader'
        AND mp.allowed_menus ? '/admin/probation'
    )
  );

DROP POLICY IF EXISTS probation_ai_cache_write ON public.probation_ai_cache;
CREATE POLICY probation_ai_cache_write ON public.probation_ai_cache
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive')
    )
    OR EXISTS (
      SELECT 1 FROM public.probation_evaluations pe
      WHERE pe.employee_id = probation_ai_cache.employee_id
        AND pe.evaluator_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive')
    )
    OR EXISTS (
      SELECT 1 FROM public.probation_evaluations pe
      WHERE pe.employee_id = probation_ai_cache.employee_id
        AND pe.evaluator_id = auth.uid()
    )
  );

COMMENT ON TABLE public.probation_ai_cache IS '수습평가 AI 분석 결과 캐시 — 종합/추이/회차별. 페이지 재방문 시 재사용';
