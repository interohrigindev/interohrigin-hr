-- =====================================================================
-- 040: AI 설정 provider 확장 + 누락된 Storage 버킷 생성
-- =====================================================================

-- ─── 1. ai_settings provider CHECK 제약조건에 'claude' 추가 ─────────
-- 기존: CHECK (provider IN ('gemini', 'openai'))
-- 변경: CHECK (provider IN ('gemini', 'openai', 'claude'))

ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_provider_check;

ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_provider_check
  CHECK (provider IN ('gemini', 'openai', 'claude'));

-- ─── 2. 누락된 Storage 버킷 생성 ───────────────────────────────────

-- avatars (012_storage_avatars.sql에 정의되어 있으나 미적용 대비)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- resumes (014에 정의되어 있으나 미적용 대비)
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

-- interview-recordings (014에 정의되어 있으나 미적용 대비)
INSERT INTO storage.buckets (id, name, public)
VALUES ('interview-recordings', 'interview-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- meeting-recordings (037에 정의되어 있으나 미적용 대비)
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-recordings', 'meeting-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- chat-attachments (코드에서 사용하지만 마이그레이션 누락)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-attachments', 'chat-attachments', false, 10485760)  -- 10MB
ON CONFLICT (id) DO NOTHING;

-- ─── 3. chat-attachments RLS 정책 (이미 존재하면 무시) ────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chat_attachments_insert' AND tablename = 'objects') THEN
    CREATE POLICY "chat_attachments_insert" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-attachments');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chat_attachments_select' AND tablename = 'objects') THEN
    CREATE POLICY "chat_attachments_select" ON storage.objects
      FOR SELECT TO authenticated USING (bucket_id = 'chat-attachments');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chat_attachments_delete' AND tablename = 'objects') THEN
    CREATE POLICY "chat_attachments_delete" ON storage.objects
      FOR DELETE TO authenticated USING (bucket_id = 'chat-attachments');
  END IF;
END
$$;

-- =====================================================================
-- 완료: ai_settings claude 지원 + 5개 Storage 버킷 보장
-- =====================================================================
