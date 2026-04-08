-- 045_add_deepgram_provider.sql
-- ai_settings provider CHECK 제약조건에 'deepgram' 추가 (회의록 STT용)

-- ============================================================
-- 1. 기존 CHECK 제약조건 제거 후 deepgram 포함하여 재생성
-- ============================================================
ALTER TABLE ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_provider_check;

ALTER TABLE ai_settings
  ADD CONSTRAINT ai_settings_provider_check
  CHECK (provider IN ('gemini', 'openai', 'claude', 'deepgram'));
