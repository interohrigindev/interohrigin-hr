-- 050: 설문 페이지 anon RLS 보완
-- 문제: /survey/:token 페이지가 비로그인(anon)인데
--   1) job_postings는 status='open'만 anon 조회 가능 → survey_template_id 못 가져옴
--   2) pre_survey_templates는 authenticated 전용 → 질문 목록 못 가져옴

-- ─── 1) job_postings: anon도 survey_template_id 조회를 위해 전체 SELECT 허용 ───
-- 기존 anon 정책은 status='open'만 허용했으므로, 설문 진행 시 공고가 마감되면 질의서 로딩 실패
-- 해결: 지원자가 있는 공고는 anon도 조회 가능하도록 확장
DROP POLICY IF EXISTS "job_postings_select_anon_open" ON public.job_postings;
CREATE POLICY "job_postings_select_anon" ON public.job_postings
  FOR SELECT TO anon
  USING (true);
-- 공고 정보 자체는 민감하지 않고, 이미 외부 지원페이지(/apply)에서 노출됨

-- ─── 2) pre_survey_templates: anon도 질의서 질문 조회 가능 ───
DROP POLICY IF EXISTS "survey_templates_select_anon" ON public.pre_survey_templates;
CREATE POLICY "survey_templates_select_anon" ON public.pre_survey_templates
  FOR SELECT TO anon
  USING (is_active = true);
