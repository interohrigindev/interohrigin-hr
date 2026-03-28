-- =====================================================================
-- 등급 기준 테이블 (S/A/B/C/D 점수 범위 설정)
-- =====================================================================

CREATE TABLE public.grade_criteria (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  grade     text    NOT NULL CHECK (grade IN ('S','A','B','C','D')),
  min_score integer NOT NULL,
  max_score integer NOT NULL,
  label     text,
  UNIQUE (grade)
);

ALTER TABLE public.grade_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grade_criteria_select_all"
  ON public.grade_criteria FOR SELECT
  USING (true);

CREATE POLICY "grade_criteria_manage_management"
  ON public.grade_criteria FOR ALL
  USING (public.is_management());

-- ─── 기본값 ───────────────────────────────────────────────────────
INSERT INTO public.grade_criteria (grade, min_score, max_score, label) VALUES
  ('S', 90, 100, '탁월'),
  ('A', 80, 89,  '우수'),
  ('B', 70, 79,  '보통'),
  ('C', 60, 69,  '미흡'),
  ('D', 0,  59,  '부진');
