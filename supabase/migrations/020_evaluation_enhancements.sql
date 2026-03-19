-- =====================================================================
-- 020: 수습/정규직 평가 시스템 개선
-- probation_evaluations ALTER + monthly_checkins + peer_reviews + peer_review_assignments
-- =====================================================================

-- =====================================================================
-- 1. probation_evaluations 변경
-- =====================================================================

-- stage CHECK 변경: week1~month3 → round1, round2, round3
ALTER TABLE public.probation_evaluations DROP CONSTRAINT IF EXISTS probation_evaluations_stage_check;
ALTER TABLE public.probation_evaluations ADD CONSTRAINT probation_evaluations_stage_check
  CHECK (stage IN ('round1', 'round2', 'round3', 'week1', 'week2', 'week3', 'month1', 'month2', 'month3'));

-- UNIQUE 제약 조건 변경 (evaluator_role 포함)
ALTER TABLE public.probation_evaluations DROP CONSTRAINT IF EXISTS probation_evaluations_employee_id_stage_evaluator_id_key;
ALTER TABLE public.probation_evaluations ADD CONSTRAINT probation_evaluations_employee_stage_role_key
  UNIQUE (employee_id, stage, evaluator_id, evaluator_role);

-- 코멘트 컬럼 추가
ALTER TABLE public.probation_evaluations ADD COLUMN IF NOT EXISTS praise text;
ALTER TABLE public.probation_evaluations ADD COLUMN IF NOT EXISTS improvement text;
ALTER TABLE public.probation_evaluations ADD COLUMN IF NOT EXISTS mentor_summary text;
ALTER TABLE public.probation_evaluations ADD COLUMN IF NOT EXISTS leader_summary text;
ALTER TABLE public.probation_evaluations ADD COLUMN IF NOT EXISTS exec_one_liner text;
ALTER TABLE public.probation_evaluations ADD COLUMN IF NOT EXISTS strengths text;
ALTER TABLE public.probation_evaluations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TRIGGER trg_probation_evaluations_updated_at
  BEFORE UPDATE ON public.probation_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================================
-- 2. monthly_checkins (월간 업무 점검)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.monthly_checkins (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year            integer     NOT NULL,
  month           integer     NOT NULL CHECK (month BETWEEN 1 AND 12),
  tag             text        NOT NULL DEFAULT '기타' CHECK (tag IN ('이슈', '칭찬', '제안', '기타')),
  content         text,
  leader_feedback text,
  exec_feedback   text,
  ceo_feedback    text,
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'leader_reviewed', 'exec_reviewed', 'ceo_reviewed')),
  is_locked       boolean     NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (employee_id, year, month)
);

CREATE TRIGGER trg_monthly_checkins_updated_at
  BEFORE UPDATE ON public.monthly_checkins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_monthly_checkins_employee ON public.monthly_checkins(employee_id);
CREATE INDEX IF NOT EXISTS idx_monthly_checkins_period ON public.monthly_checkins(year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_checkins_status ON public.monthly_checkins(status);

-- =====================================================================
-- 3. peer_reviews (동료 다면 평가)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.peer_reviews (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       uuid        REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  reviewer_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  overall_score   integer     CHECK (overall_score BETWEEN 0 AND 100),
  strengths       text,
  improvements    text,
  is_anonymous    boolean     NOT NULL DEFAULT true,
  is_submitted    boolean     NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (period_id, reviewer_id, reviewee_id)
);

CREATE TRIGGER trg_peer_reviews_updated_at
  BEFORE UPDATE ON public.peer_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_peer_reviews_period ON public.peer_reviews(period_id);
CREATE INDEX IF NOT EXISTS idx_peer_reviews_reviewer ON public.peer_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_peer_reviews_reviewee ON public.peer_reviews(reviewee_id);

-- =====================================================================
-- 4. peer_review_assignments (동료 평가 배정)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.peer_review_assignments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       uuid        NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  reviewer_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (period_id, reviewer_id, reviewee_id)
);

CREATE INDEX IF NOT EXISTS idx_peer_assignments_period ON public.peer_review_assignments(period_id);
CREATE INDEX IF NOT EXISTS idx_peer_assignments_reviewer ON public.peer_review_assignments(reviewer_id);

-- =====================================================================
-- 5. RLS 정책
-- =====================================================================

-- monthly_checkins
ALTER TABLE public.monthly_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_checkins_select" ON public.monthly_checkins
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "monthly_checkins_insert" ON public.monthly_checkins
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "monthly_checkins_update" ON public.monthly_checkins
  FOR UPDATE TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.is_admin()
  );

-- peer_reviews
ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "peer_reviews_select" ON public.peer_reviews
  FOR SELECT TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR reviewee_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "peer_reviews_insert" ON public.peer_reviews
  FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid() OR public.is_admin());

CREATE POLICY "peer_reviews_update" ON public.peer_reviews
  FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid() OR public.is_admin());

-- peer_review_assignments
ALTER TABLE public.peer_review_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "peer_assignments_select" ON public.peer_review_assignments
  FOR SELECT TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR reviewee_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "peer_assignments_manage" ON public.peer_review_assignments
  FOR ALL TO authenticated USING (public.is_admin());
