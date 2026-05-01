-- 066: 결재 첨부파일 전용 storage 버킷 + RLS
-- 지출결의서 등 결재 문서의 증빙 자료/이미지 업로드 용도

INSERT INTO storage.buckets (id, name, public, file_size_limit)
  VALUES ('approval-attachments', 'approval-attachments', false, 52428800) -- 50MB
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "approval_attachments_insert" ON storage.objects;
CREATE POLICY "approval_attachments_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'approval-attachments');

DROP POLICY IF EXISTS "approval_attachments_select" ON storage.objects;
CREATE POLICY "approval_attachments_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'approval-attachments');

DROP POLICY IF EXISTS "approval_attachments_delete" ON storage.objects;
CREATE POLICY "approval_attachments_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'approval-attachments');
