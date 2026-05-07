-- 사전 질의서 발송 이력 추적
-- candidates.survey_send_history: [{ sent_at: timestamptz }, ...] (최신이 마지막)

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS survey_send_history jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.candidates.survey_send_history IS '사전 질의서 발송 이력 — [{sent_at}] 배열, 횟수=length, 최근 발송=마지막 항목';
