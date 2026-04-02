-- =====================================================================
-- 038: 월간 점검 프로젝트/특이사항 구조 + 작업 이미지 첨부
-- =====================================================================

-- ─── 1. monthly_checkins에 프로젝트 + 특이사항(JSON) 컬럼 추가 ────
ALTER TABLE public.monthly_checkins
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS special_notes jsonb DEFAULT '[]'::jsonb;

-- special_notes 형식: [{ "tag": "이슈"|"성과"|"칭찬"|"제안"|"기타", "text": "..." }, ...]

COMMENT ON COLUMN public.monthly_checkins.project_name IS '관련 프로젝트명 (자유 입력)';
COMMENT ON COLUMN public.monthly_checkins.special_notes IS '특이사항 배열 [{tag, text}]';

-- ─── 2. tasks에 이미지 첨부 컬럼 추가 ──────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;

-- images 형식: [{ "url": "...", "name": "...", "size": 123 }, ...]

COMMENT ON COLUMN public.tasks.images IS '첨부 이미지 배열 [{url, name, size}]';
