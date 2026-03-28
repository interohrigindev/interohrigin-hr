-- =============================================
-- P-25: 외부 데이터 마이그레이션 테이블
-- =============================================

CREATE TABLE IF NOT EXISTS imported_work_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id),
  employee_name text,
  source text NOT NULL CHECK (source IN ('slack', 'notion', 'naver_works', 'other')),
  content_type text DEFAULT 'daily_report' CHECK (content_type IN ('daily_report', 'project_update', 'message', 'document', 'other')),
  content text,
  original_date timestamptz,
  metadata jsonb DEFAULT '{}',
  imported_at timestamptz DEFAULT now(),
  ai_analysis jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE imported_work_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imported_work_data_select" ON imported_work_data
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE id = auth.uid()
      AND role IN ('ceo', 'admin', 'director', 'division_head')
    )
  );

CREATE POLICY "imported_work_data_insert" ON imported_work_data
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE id = auth.uid()
      AND role IN ('ceo', 'admin', 'director', 'division_head')
    )
  );

CREATE POLICY "imported_work_data_delete" ON imported_work_data
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE id = auth.uid()
      AND role IN ('ceo', 'admin')
    )
  );

-- 인덱스
CREATE INDEX idx_imported_work_data_source ON imported_work_data(source);
CREATE INDEX idx_imported_work_data_employee ON imported_work_data(employee_id);
CREATE INDEX idx_imported_work_data_date ON imported_work_data(original_date);

-- reminder_penalties에 unique constraint 추가 (upsert용)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reminder_penalties_employee_period_unique'
  ) THEN
    ALTER TABLE reminder_penalties
      ADD CONSTRAINT reminder_penalties_employee_period_unique
      UNIQUE (employee_id, period_start);
  END IF;
END $$;
