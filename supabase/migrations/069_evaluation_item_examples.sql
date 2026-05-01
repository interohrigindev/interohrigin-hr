-- 069: 평가 항목별 + 팀별 AI 예시 목표 캐시
-- 같은 평가 항목이라도 팀(부서)별 직무 맥락이 다르므로 (item_id, team_key) 단위로 캐시.
-- team_key 는 부서명 또는 'default' (NULL 대신 사용 — UNIQUE 매칭 단순화)

CREATE TABLE IF NOT EXISTS public.evaluation_item_examples (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid        NOT NULL REFERENCES public.evaluation_items(id) ON DELETE CASCADE,
  team_key      text        NOT NULL DEFAULT 'default', -- 부서명 또는 직무명, 기본값 'default'
  examples      jsonb       NOT NULL DEFAULT '[]'::jsonb, -- string[]
  generated_at  timestamptz NOT NULL DEFAULT now(),
  generated_by  uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  UNIQUE (item_id, team_key)
);

CREATE INDEX IF NOT EXISTS idx_eval_item_examples_lookup
  ON public.evaluation_item_examples(item_id, team_key);

ALTER TABLE public.evaluation_item_examples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eval_examples_select ON public.evaluation_item_examples;
CREATE POLICY eval_examples_select ON public.evaluation_item_examples
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS eval_examples_insert ON public.evaluation_item_examples;
CREATE POLICY eval_examples_insert ON public.evaluation_item_examples
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS eval_examples_update ON public.evaluation_item_examples;
CREATE POLICY eval_examples_update ON public.evaluation_item_examples
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS eval_examples_delete ON public.evaluation_item_examples;
CREATE POLICY eval_examples_delete ON public.evaluation_item_examples
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','ceo','director','division_head','hr_admin')
    )
  );

COMMENT ON TABLE public.evaluation_item_examples IS
  '평가 항목 × 팀별 AI 예시 목표 캐시 — 자기평가 목표 설정 시 자동 노출';
