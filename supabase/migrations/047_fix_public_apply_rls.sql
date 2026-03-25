-- 047: 외부 지원 페이지 RLS 수정
-- /apply/:postingId 페이지가 비로그인(anon) 사용자에게도 접근 가능하도록 수정
-- 문제: job_postings SELECT가 authenticated 전용이라 공고 조회 불가

-- ─── 1) job_postings: anon 사용자도 open 상태 공고 조회 가능 ───
CREATE POLICY "job_postings_select_anon_open" ON public.job_postings
  FOR SELECT TO anon
  USING (status = 'open');

-- ─── 2) submit_application RPC 함수 생성 ───
-- SECURITY DEFINER로 RLS 우회하여 지원서 데이터 INSERT
CREATE OR REPLACE FUNCTION public.submit_application(
  p_job_posting_id uuid,
  p_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_source_channel text DEFAULT 'direct',
  p_source_detail text DEFAULT NULL,
  p_resume_url text DEFAULT NULL,
  p_cover_letter_url text DEFAULT NULL,
  p_cover_letter_text text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id uuid;
  v_posting_exists boolean;
BEGIN
  -- 공고 존재 + open 상태 확인
  SELECT EXISTS(
    SELECT 1 FROM job_postings WHERE id = p_job_posting_id AND status = 'open'
  ) INTO v_posting_exists;

  IF NOT v_posting_exists THEN
    RAISE EXCEPTION '채용공고가 존재하지 않거나 마감되었습니다.';
  END IF;

  -- 지원자 INSERT
  INSERT INTO candidates (
    job_posting_id, name, email, phone,
    source_channel, source_detail,
    resume_url, cover_letter_url, cover_letter_text,
    status, applied_at
  ) VALUES (
    p_job_posting_id, p_name, p_email, p_phone,
    p_source_channel, p_source_detail,
    p_resume_url, p_cover_letter_url, p_cover_letter_text,
    'applied', now()
  )
  RETURNING id INTO v_candidate_id;

  RETURN v_candidate_id;
END;
$$;

-- anon 사용자도 호출 가능
GRANT EXECUTE ON FUNCTION public.submit_application TO anon;
GRANT EXECUTE ON FUNCTION public.submit_application TO authenticated;

-- ─── 3) resumes 스토리지 버킷 anon 업로드 정책 ───
-- 이미 정책이 있으면 무시됨 (IF NOT EXISTS 대신 DO 블록 사용)
DO $$
BEGIN
  -- anon INSERT (업로드)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'resumes_anon_upload'
  ) THEN
    CREATE POLICY "resumes_anon_upload" ON storage.objects
      FOR INSERT TO anon
      WITH CHECK (bucket_id = 'resumes');
  END IF;
END $$;
