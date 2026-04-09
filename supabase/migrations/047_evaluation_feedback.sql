-- 047_evaluation_feedback.sql
-- 평가 피드백 루프: 직원이 평가 결과에 답변/소명 가능

-- 수습평가에 직원 공개 여부 + 직원 답변 컬럼 추가
ALTER TABLE public.probation_evaluations
  ADD COLUMN IF NOT EXISTS is_visible_to_employee boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS employee_response text,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

-- 업무보고 코멘트 테이블 (상위자 → 직원 피드백)
CREATE TABLE IF NOT EXISTS public.report_comments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type     text        NOT NULL CHECK (report_type IN ('daily_report', 'monthly_checkin', 'probation_eval')),
  report_id       uuid        NOT NULL,
  author_id       uuid        NOT NULL REFERENCES public.employees(id),
  content         text,
  sentiment       text        CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_comments_report ON public.report_comments(report_type, report_id);
CREATE INDEX IF NOT EXISTS idx_report_comments_author ON public.report_comments(author_id);

ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_comments_select" ON public.report_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "report_comments_insert" ON public.report_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() OR public.is_admin());
CREATE POLICY "report_comments_update" ON public.report_comments FOR UPDATE TO authenticated USING (author_id = auth.uid() OR public.is_admin());
