-- 051: interview_schedules에 Google Calendar Event ID 저장
-- Google Meet 녹화 파일을 Google Drive에서 자동 매칭하기 위한 식별자

ALTER TABLE public.interview_schedules
  ADD COLUMN IF NOT EXISTS google_event_id text;

CREATE INDEX IF NOT EXISTS idx_interview_schedules_event_id
  ON public.interview_schedules(google_event_id)
  WHERE google_event_id IS NOT NULL;
