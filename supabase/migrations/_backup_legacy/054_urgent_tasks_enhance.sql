-- =====================================================================
-- 긴급 업무 강화 — 하위 업무 + 임원 확인 워크플로우
-- 실행일: 2026.03.26
-- =====================================================================

-- 하위 업무 (sub_tasks): [{title, assignee, done}]
ALTER TABLE urgent_tasks
  ADD COLUMN IF NOT EXISTS sub_tasks jsonb DEFAULT '[]';

-- 임원 확인 워크플로우
ALTER TABLE urgent_tasks
  ADD COLUMN IF NOT EXISTS confirm_status text;       -- null | 'pending' | 'confirmed'

ALTER TABLE urgent_tasks
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE urgent_tasks
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

COMMENT ON COLUMN urgent_tasks.sub_tasks IS '하위 업무 배열: [{title, assignee, done}]';
COMMENT ON COLUMN urgent_tasks.confirm_status IS '임원 확인 상태: null(불필요) | pending(대기) | confirmed(확인됨)';
