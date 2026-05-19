-- 099: 일일보고 — 해당 날짜에 제외할 프로젝트 ID 목록
-- UX: 작업 내용이 없는 프로젝트를 보고서 단위로 제외 (영구 삭제 X, 다른 날짜는 영향 없음)

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS excluded_projects jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.daily_reports.excluded_projects IS
  '이 보고서에서 사용자가 명시적으로 제외한 프로젝트 ID 배열. 다른 날짜 보고서에는 영향 없음.';
