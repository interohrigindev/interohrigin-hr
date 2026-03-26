-- =====================================================================
-- 지원자 면접관 코멘트 컬럼 추가
-- 실행일: 2026.03.26
-- =====================================================================

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS interviewer_comments jsonb DEFAULT '[]';

COMMENT ON COLUMN candidates.interviewer_comments IS '면접관 코멘트 배열: [{author_id, author_name, content, created_at}]';
