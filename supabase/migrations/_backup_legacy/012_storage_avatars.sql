-- Storage bucket for avatar photo uploads
-- Run this in Supabase SQL Editor

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars_upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_read" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');
