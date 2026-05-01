-- 068: 수습평가 회차 마감 처리 테이블
-- 용도: 평가 시기를 놓쳐 평가가 작성되지 않은 회차를 관리자가 "마감(skip)" 처리
--       마감된 회차는 완료된 회차처럼 취급되어 활성 회차 강조·다음 회차 잠금이 풀림

CREATE TABLE IF NOT EXISTS public.probation_round_closures (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  stage       text        NOT NULL CHECK (stage IN ('round1','round2','round3')),
  reason      text,
  closed_by   uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  closed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_probation_round_closures_employee
  ON public.probation_round_closures(employee_id);

ALTER TABLE public.probation_round_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prob_closure_select ON public.probation_round_closures;
CREATE POLICY prob_closure_select ON public.probation_round_closures
  FOR SELECT TO authenticated USING (true);

-- 생성/삭제는 관리자/대표/이사/본부장만
DROP POLICY IF EXISTS prob_closure_write ON public.probation_round_closures;
CREATE POLICY prob_closure_write ON public.probation_round_closures
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','ceo','director','division_head')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','ceo','director','division_head')
    )
  );

COMMENT ON TABLE public.probation_round_closures IS
  '수습평가 회차 마감 처리 — 평가 시기 초과로 작성되지 않은 회차를 관리자가 skip 처리';
