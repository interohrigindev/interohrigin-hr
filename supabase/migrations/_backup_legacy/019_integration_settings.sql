-- =============================================
-- P-26: 외부 연동 설정 테이블
-- =============================================

CREATE TABLE IF NOT EXISTS integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('slack', 'notion', 'naver_works')),
  access_token text NOT NULL,
  workspace_name text,
  workspace_id text,
  is_active boolean DEFAULT true,
  config jsonb DEFAULT '{}',
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- provider별 활성 설정 1개만 허용
CREATE UNIQUE INDEX idx_integration_settings_active_provider
  ON integration_settings (provider)
  WHERE is_active = true;

-- RLS (imported_work_data와 동일: director 이상)
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integration_settings_select" ON integration_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE id = auth.uid()
      AND role IN ('ceo', 'admin', 'director', 'division_head')
    )
  );

CREATE POLICY "integration_settings_insert" ON integration_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE id = auth.uid()
      AND role IN ('ceo', 'admin', 'director', 'division_head')
    )
  );

CREATE POLICY "integration_settings_update" ON integration_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE id = auth.uid()
      AND role IN ('ceo', 'admin', 'director', 'division_head')
    )
  );

CREATE POLICY "integration_settings_delete" ON integration_settings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE id = auth.uid()
      AND role IN ('ceo', 'admin')
    )
  );
