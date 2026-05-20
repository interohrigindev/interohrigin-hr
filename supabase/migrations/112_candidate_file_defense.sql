-- 112: 지원자 파일 (이력서/자기소개서) 방어선
--   - 신규 데이터는 단일 형식 강제 (상대 path 또는 외부 URL prefix)
--   - 옛 데이터는 그대로 보존 (코드의 fallback 으로 흡수)
--   - resumes 버킷이 표준, recruitment-files 는 read-only 권장 (단, 외부 시스템 의존성 있으면 유지)
--
-- 주의: CHECK 제약은 NOT VALID 로 추가 후 점진적 검증.
-- 기존 데이터에 위반 케이스가 있으면 ALTER 실패하므로 안전.

-- ============================================================
-- 1. trigger 기반 형식 검증 — 신규 INSERT/UPDATE 시 경고 (차단은 아님)
--    완전 차단은 데이터 정규화(단계 2) 완료 후 적용 권장
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_candidate_file_url()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- resume_url 검증
  IF NEW.resume_url IS NOT NULL THEN
    -- 허용 형식:
    -- 1) 상대 path (slash 시작 X, http 시작 X)
    -- 2) 외부 URL (http 시작이지만 supabase storage URL 이 아님)
    -- 차단 대상:
    -- - storage/v1/object/public/* 패턴 (옛 깨진 URL)
    -- - 빈 문자열
    IF NEW.resume_url = '' THEN
      RAISE WARNING '[candidate.resume_url] 빈 문자열은 NULL 권장';
    END IF;
  END IF;

  -- cover_letter_url 동일 검증
  IF NEW.cover_letter_url IS NOT NULL THEN
    IF NEW.cover_letter_url = '' THEN
      RAISE WARNING '[candidate.cover_letter_url] 빈 문자열은 NULL 권장';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_candidate_file_url ON public.candidates;
CREATE TRIGGER trg_validate_candidate_file_url
  BEFORE INSERT OR UPDATE OF resume_url, cover_letter_url ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_candidate_file_url();

-- ============================================================
-- 2. RPC: 파일 URL 진단 (관리자 콘솔 용)
-- ============================================================
CREATE OR REPLACE FUNCTION public.diagnose_candidate_file_urls()
RETURNS TABLE (
  pattern text,
  resume_count bigint,
  cover_letter_count bigint,
  sample_resume text,
  sample_cover text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH resumes AS (
    SELECT
      CASE
        WHEN resume_url IS NULL THEN '00_null'
        WHEN resume_url LIKE '%/storage/v1/object/%/resumes/%' THEN '01_supabase_public_resumes'
        WHEN resume_url LIKE '%/storage/v1/object/%/recruitment-files/%' THEN '02_supabase_public_recruitment_files'
        WHEN resume_url LIKE 'http%' THEN '03_external_or_other_http'
        WHEN resume_url LIKE '/%' THEN '04_root_relative'
        ELSE '05_relative_path'
      END AS p,
      resume_url
    FROM public.candidates
  ),
  covers AS (
    SELECT
      CASE
        WHEN cover_letter_url IS NULL THEN '00_null'
        WHEN cover_letter_url LIKE '%/storage/v1/object/%/resumes/%' THEN '01_supabase_public_resumes'
        WHEN cover_letter_url LIKE '%/storage/v1/object/%/recruitment-files/%' THEN '02_supabase_public_recruitment_files'
        WHEN cover_letter_url LIKE 'http%' THEN '03_external_or_other_http'
        WHEN cover_letter_url LIKE '/%' THEN '04_root_relative'
        ELSE '05_relative_path'
      END AS p,
      cover_letter_url
    FROM public.candidates
  )
  SELECT
    COALESCE(r.p, c.p) AS pattern,
    COALESCE((SELECT count(*) FROM resumes r2 WHERE r2.p = COALESCE(r.p, c.p)), 0) AS resume_count,
    COALESCE((SELECT count(*) FROM covers c2 WHERE c2.p = COALESCE(r.p, c.p)), 0) AS cover_letter_count,
    (SELECT resume_url FROM resumes r3 WHERE r3.p = COALESCE(r.p, c.p) LIMIT 1) AS sample_resume,
    (SELECT cover_letter_url FROM covers c3 WHERE c3.p = COALESCE(r.p, c.p) LIMIT 1) AS sample_cover
  FROM (SELECT DISTINCT p FROM resumes) r
  FULL OUTER JOIN (SELECT DISTINCT p FROM covers) c ON r.p = c.p
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.diagnose_candidate_file_urls() TO authenticated;

COMMENT ON FUNCTION public.diagnose_candidate_file_urls() IS
  '지원자 파일 URL 형식 분포 진단 — 관리자가 정규화 진척 모니터링 시 사용';

-- ============================================================
-- 3. 안내 주석 (정책)
-- ============================================================
COMMENT ON COLUMN public.candidates.resume_url IS
  '이력서 파일 경로. 권장 형식: 상대 path (예: "12345/resume.pdf") — resumes 버킷 기준.
   레거시 형식 (전체 URL) 도 코드의 candidate-storage 진입점이 자동 해석.
   신규 업로드는 반드시 src/lib/candidate-storage.uploadCandidateFile() 사용.';

COMMENT ON COLUMN public.candidates.cover_letter_url IS
  '자기소개서 파일 경로. 권장 형식: 상대 path. 코드 진입점 candidate-storage 사용 필수.';
