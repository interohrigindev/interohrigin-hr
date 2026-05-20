-- 채용 지원자 이력서/자기소개서 URL 형식 분포 분석
-- Supabase Dashboard > SQL Editor 에서 실행 (SELECT only, 데이터 변경 X)
-- 결과를 보고 candidate-storage 통합 작업의 CHECK 제약 강도를 결정

-- ════════════════════════════════════════════
-- 1) resume_url 형식별 분포
-- ════════════════════════════════════════════
SELECT
  CASE
    WHEN resume_url IS NULL THEN '00_null'
    WHEN resume_url LIKE '%/storage/v1/object/%/resumes/%' THEN '01_supabase_public_resumes'
    WHEN resume_url LIKE '%/storage/v1/object/%/recruitment-files/%' THEN '02_supabase_public_recruitment_files'
    WHEN resume_url LIKE 'http%' THEN '03_external_or_other_http'
    WHEN resume_url LIKE '/%' THEN '04_root_relative'
    ELSE '05_relative_path'
  END AS pattern,
  COUNT(*) AS count
FROM candidates
GROUP BY 1
ORDER BY 1;

-- ════════════════════════════════════════════
-- 2) cover_letter_url 형식별 분포 (동일 패턴)
-- ════════════════════════════════════════════
SELECT
  CASE
    WHEN cover_letter_url IS NULL THEN '00_null'
    WHEN cover_letter_url LIKE '%/storage/v1/object/%/resumes/%' THEN '01_supabase_public_resumes'
    WHEN cover_letter_url LIKE '%/storage/v1/object/%/recruitment-files/%' THEN '02_supabase_public_recruitment_files'
    WHEN cover_letter_url LIKE 'http%' THEN '03_external_or_other_http'
    WHEN cover_letter_url LIKE '/%' THEN '04_root_relative'
    ELSE '05_relative_path'
  END AS pattern,
  COUNT(*) AS count
FROM candidates
GROUP BY 1
ORDER BY 1;

-- ════════════════════════════════════════════
-- 3) 외부 URL (다른 ATS) 케이스 샘플 — 정규화 대상에서 제외할 패턴 확인
-- ════════════════════════════════════════════
SELECT id, name, resume_url
FROM candidates
WHERE resume_url LIKE 'http%'
  AND resume_url NOT LIKE '%/storage/v1/object/%/resumes/%'
  AND resume_url NOT LIKE '%/storage/v1/object/%/recruitment-files/%'
LIMIT 20;

-- ════════════════════════════════════════════
-- 4) recruitment-files 버킷에만 있는 지원자 수 (마이그레이션 우선순위 판단)
-- ════════════════════════════════════════════
SELECT COUNT(*) AS recruitment_files_only_count
FROM candidates
WHERE resume_url LIKE '%/storage/v1/object/%/recruitment-files/%'
   OR cover_letter_url LIKE '%/storage/v1/object/%/recruitment-files/%';

-- ════════════════════════════════════════════
-- 5) 포트폴리오 파일 분석 (portfolio_files jsonb)
-- ════════════════════════════════════════════
SELECT
  CASE
    WHEN portfolio_files IS NULL OR jsonb_array_length(portfolio_files) = 0 THEN '00_none'
    WHEN portfolio_files::text LIKE '%/storage/v1/object/%/resumes/%' THEN '01_resumes'
    WHEN portfolio_files::text LIKE '%/storage/v1/object/%/recruitment-files/%' THEN '02_recruitment_files'
    ELSE '03_other'
  END AS pattern,
  COUNT(*) AS count
FROM candidates
GROUP BY 1
ORDER BY 1;
