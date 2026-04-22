-- 054_ojt_mentor_auto_permission.sql
-- 목적: 멘토로 지정된 직원에게 담당 멘티 소속 OJT 프로그램의 일정표·주차별 보고서 권한 자동 부여
-- 조건: mentor_assignments.status = 'active' + mentee_id가 해당 program_id에 ojt_enrollments 로 등록

-- ─── OJT 일정표 (ojt_schedule_items) ────────────────────
DROP POLICY IF EXISTS ojt_schedule_write ON ojt_schedule_items;
CREATE POLICY ojt_schedule_write ON ojt_schedule_items FOR ALL USING (
  -- 기본 관리자·리더 권한
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('ceo','admin','director','division_head','leader','hr_admin')
  )
  OR
  -- 멘토 자동 권한: 해당 프로그램 수강 중인 멘티의 active 멘토
  EXISTS (
    SELECT 1 FROM mentor_assignments ma
    JOIN ojt_enrollments oe ON oe.employee_id = ma.mentee_id
    WHERE ma.mentor_id = auth.uid()
      AND ma.status = 'active'
      AND oe.program_id = ojt_schedule_items.program_id
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('ceo','admin','director','division_head','leader','hr_admin')
  )
  OR EXISTS (
    SELECT 1 FROM mentor_assignments ma
    JOIN ojt_enrollments oe ON oe.employee_id = ma.mentee_id
    WHERE ma.mentor_id = auth.uid()
      AND ma.status = 'active'
      AND oe.program_id = ojt_schedule_items.program_id
  )
);

-- ─── 주차별 보고서 (ojt_weekly_reports) ─────────────────
DROP POLICY IF EXISTS ojt_weekly_select ON ojt_weekly_reports;
CREATE POLICY ojt_weekly_select ON ojt_weekly_reports FOR SELECT USING (
  mentee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('ceo','admin','director','division_head','leader','hr_admin')
  )
  OR EXISTS (
    -- 이 보고서의 멘티의 멘토면 조회 가능
    SELECT 1 FROM mentor_assignments ma
    WHERE ma.mentor_id = auth.uid()
      AND ma.status = 'active'
      AND ma.mentee_id = ojt_weekly_reports.mentee_id
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
  OR EXISTS (
    SELECT 1 FROM mentor_assignments ma
    WHERE ma.mentor_id = auth.uid()
      AND ma.status = 'active'
      AND ma.mentee_id = ojt_weekly_reports.mentee_id
  )
) WITH CHECK (
  mentee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('ceo','admin','director','division_head','leader','hr_admin')
  )
  OR EXISTS (
    SELECT 1 FROM mentor_assignments ma
    WHERE ma.mentor_id = auth.uid()
      AND ma.status = 'active'
      AND ma.mentee_id = ojt_weekly_reports.mentee_id
  )
);
