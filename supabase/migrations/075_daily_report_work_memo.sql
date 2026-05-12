-- 0512: 일일보고서 — 작업 현황 영역에 자유도 있는 메모 입력 컬럼 추가
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS work_memo text;

COMMENT ON COLUMN public.daily_reports.work_memo IS '작업 현황 자유 메모 — 자동 프로젝트 연동 외에 직원이 추가로 기록하는 텍스트';
