-- =============================================
-- P-22: CEO 긴급 대시보드 + AI 리마인드 시스템
-- P-24: 리마인드 경고 → 인사평가 감점 연동
-- =============================================

-- ─── urgent_tasks: CEO 긴급 업무 (Top 10) ─────────────────────
CREATE TABLE IF NOT EXISTS urgent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  priority integer DEFAULT 1 CHECK (priority BETWEEN 1 AND 10),
  assigned_to uuid[] DEFAULT '{}',
  created_by uuid REFERENCES employees(id),

  -- 기한
  deadline timestamptz NOT NULL,
  is_overdue boolean DEFAULT false,

  -- 상태
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
  completed_at timestamptz,
  completed_by uuid REFERENCES employees(id),
  completion_note text,

  -- 리마인드
  reminder_count integer DEFAULT 0,
  last_reminder_at timestamptz,
  reminder_interval_hours integer DEFAULT 4,

  -- 연결
  project_id text,
  related_employee_id uuid REFERENCES employees(id),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── task_reminders: AI 리마인드 이력 ─────────────────────────
CREATE TABLE IF NOT EXISTS task_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  urgent_task_id uuid NOT NULL REFERENCES urgent_tasks(id) ON DELETE CASCADE,
  sent_to uuid NOT NULL REFERENCES employees(id),
  sent_via text DEFAULT 'popup' CHECK (sent_via IN ('push', 'sms', 'email', 'popup')),
  sent_at timestamptz DEFAULT now(),
  acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  response_note text
);

-- ─── reminder_penalties: 리마인드 경고 → 인사평가 감점 ─────────
CREATE TABLE IF NOT EXISTS reminder_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  period_start date,
  period_end date,

  -- 긴급 업무 관련
  total_urgent_assigned integer DEFAULT 0,
  total_completed_on_time integer DEFAULT 0,
  total_overdue integer DEFAULT 0,
  total_reminders_received integer DEFAULT 0,

  -- 감점 계산
  penalty_score float DEFAULT 0,

  -- 인사평가 반영
  evaluation_id uuid,

  created_at timestamptz DEFAULT now()
);

-- ─── 자동 updated_at 트리거 ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_urgent_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_urgent_tasks_updated_at
  BEFORE UPDATE ON urgent_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_urgent_tasks_updated_at();

-- ─── 기한 초과 자동 감지 트리거 ───────────────────────────────
CREATE OR REPLACE FUNCTION check_urgent_task_overdue()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deadline < now() AND NEW.status IN ('pending', 'in_progress') THEN
    NEW.is_overdue = true;
    IF NEW.status = 'pending' OR NEW.status = 'in_progress' THEN
      NEW.status = 'overdue';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_overdue
  BEFORE INSERT OR UPDATE ON urgent_tasks
  FOR EACH ROW
  EXECUTE FUNCTION check_urgent_task_overdue();

-- ─── RLS 정책 ─────────────────────────────────────────────────
ALTER TABLE urgent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_penalties ENABLE ROW LEVEL SECURITY;

-- urgent_tasks: 전 직원 읽기 가능, 임원/관리자만 생성/수정/삭제
CREATE POLICY "urgent_tasks_select" ON urgent_tasks
  FOR SELECT USING (true);

CREATE POLICY "urgent_tasks_insert" ON urgent_tasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE id = auth.uid()
      AND role IN ('ceo', 'admin', 'director', 'division_head')
    )
  );

CREATE POLICY "urgent_tasks_update" ON urgent_tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE id = auth.uid()
      AND role IN ('ceo', 'admin', 'director', 'division_head')
    )
    OR auth.uid() = ANY(assigned_to)
  );

CREATE POLICY "urgent_tasks_delete" ON urgent_tasks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE id = auth.uid()
      AND role IN ('ceo', 'admin', 'director', 'division_head')
    )
  );

-- task_reminders: 본인 리마인드만 읽기, 시스템이 생성
CREATE POLICY "task_reminders_select" ON task_reminders
  FOR SELECT USING (true);

CREATE POLICY "task_reminders_insert" ON task_reminders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "task_reminders_update" ON task_reminders
  FOR UPDATE USING (sent_to = auth.uid());

-- reminder_penalties: 본인 + 임원/관리자 읽기
CREATE POLICY "reminder_penalties_select" ON reminder_penalties
  FOR SELECT USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM employees
      WHERE id = auth.uid()
      AND role IN ('ceo', 'admin', 'director', 'division_head')
    )
  );

CREATE POLICY "reminder_penalties_insert" ON reminder_penalties
  FOR INSERT WITH CHECK (true);

-- ─── 인덱스 ───────────────────────────────────────────────────
CREATE INDEX idx_urgent_tasks_status ON urgent_tasks(status);
CREATE INDEX idx_urgent_tasks_deadline ON urgent_tasks(deadline);
CREATE INDEX idx_urgent_tasks_priority ON urgent_tasks(priority);
CREATE INDEX idx_task_reminders_task ON task_reminders(urgent_task_id);
CREATE INDEX idx_task_reminders_sent_to ON task_reminders(sent_to);
CREATE INDEX idx_reminder_penalties_employee ON reminder_penalties(employee_id);
