-- 059_manual_resume_upload.sql
-- 목적: 외부 이력서·자기소개서 직접 업로드로 지원자 등록 가능하게 확장
--   - source_channel CHECK 제약에 'manual_upload' 추가
--   - 파일 원본명 보존용 컬럼 (선택)
--   - recruitment-files Storage 버킷 생성

-- 1) source_channel CHECK 갱신
ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_source_channel_check;
ALTER TABLE public.candidates ADD CONSTRAINT candidates_source_channel_check
  CHECK (source_channel IN (
    'job_korea','headhunter','referral','university','agency','direct',
    'manual_upload','other'
  ));

-- 2) 파일 원본명 컬럼 (어떤 파일을 올렸는지 기록)
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS resume_filename text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS cover_letter_filename text;

-- 3) Storage 버킷
INSERT INTO storage.buckets (id, name, public)
VALUES ('recruitment-files', 'recruitment-files', false)
ON CONFLICT (id) DO NOTHING;

-- 4) Storage RLS — director 이상만 업로드/조회 가능
DROP POLICY IF EXISTS "recruitment_files_read" ON storage.objects;
CREATE POLICY "recruitment_files_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'recruitment-files'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('ceo','admin','director','division_head','hr_admin','leader')
    )
  );

DROP POLICY IF EXISTS "recruitment_files_insert" ON storage.objects;
CREATE POLICY "recruitment_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recruitment-files'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('ceo','admin','director','division_head','hr_admin','leader')
    )
  );

DROP POLICY IF EXISTS "recruitment_files_delete" ON storage.objects;
CREATE POLICY "recruitment_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'recruitment-files'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('ceo','admin','director','division_head','hr_admin')
    )
  );
