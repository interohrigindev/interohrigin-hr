-- 060_candidate_portfolio.sql
-- 목적: 지원서 작성 시 포트폴리오 파일 다중 업로드 + 외부 링크(드라이브 등) 입력 지원
--   - candidates 테이블에 portfolio_files / portfolio_links 컬럼 추가
--   - submit_application RPC 가 새 파라미터 받도록 갱신

-- 1) 포트폴리오 컬럼 추가
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS portfolio_files jsonb DEFAULT '[]'::jsonb,  -- [{path, filename, size}]
  ADD COLUMN IF NOT EXISTS portfolio_links jsonb DEFAULT '[]'::jsonb;  -- [{url, label}]

COMMENT ON COLUMN public.candidates.portfolio_files IS
  '포트폴리오 파일 목록 [{path: storage 경로, filename: 원본명, size: bytes}]';
COMMENT ON COLUMN public.candidates.portfolio_links IS
  '포트폴리오 외부 링크 목록 [{url: 링크, label: 표시명}] — Google Drive 등';

-- 2) submit_application RPC 갱신 — 새 파라미터 추가하여 시그니처 변경
--    PostgreSQL은 기본값과 무관하게 매개변수 개수가 다르면 별도 함수로 인식 → 기존 함수 명시적 DROP 필요
DROP FUNCTION IF EXISTS public.submit_application(
  uuid, text, text, text, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.submit_application(
  p_job_posting_id uuid, p_name text, p_email text,
  p_phone text DEFAULT NULL, p_source_channel text DEFAULT 'direct',
  p_source_detail text DEFAULT NULL, p_resume_url text DEFAULT NULL,
  p_cover_letter_url text DEFAULT NULL, p_cover_letter_text text DEFAULT NULL,
  p_portfolio_files jsonb DEFAULT '[]'::jsonb,
  p_portfolio_links jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_candidate_id uuid; v_posting_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM job_postings WHERE id = p_job_posting_id AND status = 'open') INTO v_posting_exists;
  IF NOT v_posting_exists THEN RAISE EXCEPTION '채용공고가 존재하지 않거나 마감되었습니다.'; END IF;

  INSERT INTO candidates (
    job_posting_id, name, email, phone, source_channel, source_detail,
    resume_url, cover_letter_url, cover_letter_text,
    portfolio_files, portfolio_links,
    status
  )
  VALUES (
    p_job_posting_id, p_name, p_email, p_phone, p_source_channel, p_source_detail,
    p_resume_url, p_cover_letter_url, p_cover_letter_text,
    COALESCE(p_portfolio_files, '[]'::jsonb),
    COALESCE(p_portfolio_links, '[]'::jsonb),
    'applied'
  )
  RETURNING id INTO v_candidate_id;
  RETURN v_candidate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_application TO anon;
GRANT EXECUTE ON FUNCTION public.submit_application TO authenticated;
