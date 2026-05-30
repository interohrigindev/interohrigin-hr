-- 142_daily_report_ai_summary.sql
-- 일일보고서 한 줄 총평 AI 요약을 저장 시점에 1회 생성·저장.
-- 결재자는 저장된 요약을 그대로 보기만 함 (반복 AI 호출/토큰 중복 방지).
-- daily_reports 는 ALTER 금지 대상 아님.
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS ai_summary jsonb,
  ADD COLUMN IF NOT EXISTS ai_summary_source text;

COMMENT ON COLUMN public.daily_reports.ai_summary IS
  '한 줄 총평 AI 요약: {"work": ["문장1", ...], "personal": ["문장1", ...]} — 저장 시 1회 생성, 결재자에 표시.';
COMMENT ON COLUMN public.daily_reports.ai_summary_source IS
  'ai_summary 생성 시점의 satisfaction_comment 원문 (동일 텍스트면 재요약 스킵, 토큰 절약).';
