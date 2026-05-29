-- 140_candidate_job_change.sql
-- F4-2: 면접 지원 직무 변경 — 변경 이력 저장 (대표 확인용)
-- candidates 는 ALTER 금지 대상 아님.
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS job_change_history jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.candidates.job_change_history IS
  'F4-2: 지원 직무 변경 이력 [{from_job_id,from_title,to_job_id,to_title,changed_by,changed_by_name,changed_at}]';
