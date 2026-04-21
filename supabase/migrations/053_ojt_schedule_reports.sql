-- 053_ojt_schedule_reports.sql
-- 목적: OJT 프로그램에 '세부 일정표'(일차별) + '주차별 보고서' 구조 추가
-- 노션 기반으로 운영하던 워크플로우를 HR 플랫폼에 내장

-- ─── 세부 일정표 (일차별 과제) ──────────────────────────
CREATE TABLE IF NOT EXISTS ojt_schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES ojt_programs(id) ON DELETE CASCADE,
  day_number int NOT NULL,
  time_slot text,               -- 예: '09:00-10:30'
  title text NOT NULL,
  description text,             -- 과제 상세
  output text,                  -- 기대 산출물
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ojt_schedule_program_day ON ojt_schedule_items(program_id, day_number, sort_order);

-- ─── 주차별 보고서 (멘티가 작성) ────────────────────────
CREATE TABLE IF NOT EXISTS ojt_weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES ojt_programs(id) ON DELETE CASCADE,
  mentee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_number int NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',   -- { learned, challenges, next_week, feedback_request }
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','reviewed')),
  mentor_feedback text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (program_id, mentee_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_ojt_weekly_mentee ON ojt_weekly_reports(mentee_id, week_number);
CREATE INDEX IF NOT EXISTS idx_ojt_weekly_program ON ojt_weekly_reports(program_id, status);

-- ─── RLS ────────────────────────────────────────────────
ALTER TABLE ojt_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ojt_weekly_reports ENABLE ROW LEVEL SECURITY;

-- 세부 일정표: 관리자·해당 프로그램 멘토는 CRUD, 멘티는 READ
DROP POLICY IF EXISTS ojt_schedule_select ON ojt_schedule_items;
CREATE POLICY ojt_schedule_select ON ojt_schedule_items FOR SELECT USING (true);

DROP POLICY IF EXISTS ojt_schedule_write ON ojt_schedule_items;
CREATE POLICY ojt_schedule_write ON ojt_schedule_items FOR ALL USING (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('ceo','admin','director','division_head','leader','hr_admin')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('ceo','admin','director','division_head','leader','hr_admin')
  )
);

-- 주차별 보고서: 본인(멘티) / 해당 프로그램 멘토·관리자
DROP POLICY IF EXISTS ojt_weekly_select ON ojt_weekly_reports;
CREATE POLICY ojt_weekly_select ON ojt_weekly_reports FOR SELECT USING (
  mentee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('ceo','admin','director','division_head','leader','hr_admin')
  )
);

DROP POLICY IF EXISTS ojt_weekly_write ON ojt_weekly_reports;
CREATE POLICY ojt_weekly_write ON ojt_weekly_reports FOR ALL USING (
  mentee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('ceo','admin','director','division_head','leader','hr_admin')
  )
) WITH CHECK (
  mentee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('ceo','admin','director','division_head','leader','hr_admin')
  )
);
