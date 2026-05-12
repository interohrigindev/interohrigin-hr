-- 0512: 일일보고 작업 현황 — 프로젝트별 메모 (project_id → HTML)
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS project_memos jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.daily_reports.project_memos IS '프로젝트별 추가 메모 — { project_id: html_string }. RichEditor 결과를 sanitize 후 저장.';
