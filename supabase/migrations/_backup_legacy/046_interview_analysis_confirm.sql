-- 046: 면접 분석 확인 완료 + 원본 파일 삭제 지원
-- 관리자가 분석 결과를 확인하면 원본 녹화/녹음 파일을 삭제하여 Storage 용량 절약

-- interview_analyses에 확인 관련 컬럼 추가
ALTER TABLE public.interview_analyses
  ADD COLUMN IF NOT EXISTS confirmed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS file_deleted  boolean DEFAULT false;

-- interview_recordings에 schedule 연결 + 삭제 상태 지원
ALTER TABLE public.interview_recordings
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.interview_schedules(id) ON DELETE SET NULL;

-- recording_url을 nullable로 변경 (파일 삭제 후 null)
-- 이미 nullable이면 무시됨
ALTER TABLE public.interview_recordings
  ALTER COLUMN recording_url DROP NOT NULL;

-- status에 'deleted' 값 허용
ALTER TABLE public.interview_recordings
  DROP CONSTRAINT IF EXISTS interview_recordings_status_check;

ALTER TABLE public.interview_recordings
  ADD CONSTRAINT interview_recordings_status_check
  CHECK (status IN ('uploading', 'uploaded', 'processing', 'completed', 'error', 'deleted'));

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_interview_recordings_schedule
  ON public.interview_recordings(schedule_id);

CREATE INDEX IF NOT EXISTS idx_interview_analyses_confirmed
  ON public.interview_analyses(confirmed_at)
  WHERE confirmed_at IS NOT NULL;
