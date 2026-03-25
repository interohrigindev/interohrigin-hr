-- 049: 채용공고 ↔ 사전질의서 연결
-- job_postings에 survey_template_id 추가하여 공고별 질의서 명시적 매핑

ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS survey_template_id uuid
  REFERENCES public.pre_survey_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_postings_survey_template
  ON public.job_postings(survey_template_id);
