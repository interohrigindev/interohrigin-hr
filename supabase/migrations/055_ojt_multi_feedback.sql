-- 055_ojt_multi_feedback.sql
-- 목적: OJT 프로세스 확장
--   1) 일정표 항목에 멘티 코멘트 추가 (mentee_comment, mentee_commented_at)
--   2) 주차별 보고서에 리더·임원·대표 피드백 추가 (기존 mentor_feedback 유지)

-- ─── 1) ojt_schedule_items 멘티 코멘트 컬럼 ──────────────
ALTER TABLE ojt_schedule_items ADD COLUMN IF NOT EXISTS mentee_comment text;
ALTER TABLE ojt_schedule_items ADD COLUMN IF NOT EXISTS mentee_commented_at timestamptz;

-- ─── 2) ojt_weekly_reports 멀티 롤 피드백 컬럼 ───────────
ALTER TABLE ojt_weekly_reports ADD COLUMN IF NOT EXISTS leader_feedback text;
ALTER TABLE ojt_weekly_reports ADD COLUMN IF NOT EXISTS leader_feedback_at timestamptz;
ALTER TABLE ojt_weekly_reports ADD COLUMN IF NOT EXISTS exec_feedback text;
ALTER TABLE ojt_weekly_reports ADD COLUMN IF NOT EXISTS exec_feedback_at timestamptz;
ALTER TABLE ojt_weekly_reports ADD COLUMN IF NOT EXISTS ceo_feedback text;
ALTER TABLE ojt_weekly_reports ADD COLUMN IF NOT EXISTS ceo_feedback_at timestamptz;
