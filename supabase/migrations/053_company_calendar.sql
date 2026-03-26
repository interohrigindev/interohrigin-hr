-- =====================================================================
-- INTEROHRIGIN HR Platform — 전사 캘린더 테이블
-- 실행일: 2026.03.26
-- =====================================================================

CREATE TABLE IF NOT EXISTS company_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,

  -- 유형
  event_type text NOT NULL DEFAULT 'company',
  -- 'meeting' | 'interview' | 'company' | 'holiday' | 'training' | 'leave'

  -- 일시
  start_datetime timestamptz NOT NULL,
  end_datetime timestamptz,
  all_day boolean DEFAULT false,

  -- 참여자 / 부서
  participants uuid[] DEFAULT '{}',
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,

  -- 표시
  color text,  -- hex or tailwind color name

  -- 외부 캘린더 연동
  external_calendar_id text,          -- Google Calendar event ID
  external_source text,               -- 'google' | 'outlook' | null
  sync_status text DEFAULT 'local_only',
  -- 'synced' | 'local_only' | 'external_only'

  -- 다른 모듈 연결
  linked_candidate_id uuid,
  linked_project_id text,
  linked_leave_request_id uuid,

  -- 반복
  recurrence_rule text,               -- RRULE format

  -- 메타
  created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE company_events IS '전사 캘린더 이벤트 (내부 + 외부 동기화)';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_company_events_start ON company_events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_company_events_type ON company_events(event_type);
CREATE INDEX IF NOT EXISTS idx_company_events_dept ON company_events(department_id);
CREATE INDEX IF NOT EXISTS idx_company_events_external ON company_events(external_calendar_id) WHERE external_calendar_id IS NOT NULL;

-- RLS
ALTER TABLE company_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_events_select" ON company_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "company_events_insert" ON company_events
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "company_events_update" ON company_events
  FOR UPDATE TO authenticated USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head'))
  );

CREATE POLICY "company_events_delete" ON company_events
  FOR DELETE TO authenticated USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head'))
  );
