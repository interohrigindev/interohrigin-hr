-- AI 설정 테이블 (향후 확장 고려: module 컬럼)
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('gemini', 'openai')),
  api_key text NOT NULL,
  model text NOT NULL,
  is_active boolean DEFAULT true,
  module text DEFAULT 'hr' CHECK (module IN ('hr', 'sales', 'inventory')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- AI 리포트 저장 테이블
CREATE TABLE IF NOT EXISTS public.ai_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid REFERENCES public.evaluation_targets(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.evaluation_periods(id),
  employee_id uuid REFERENCES public.employees(id),
  provider text NOT NULL,
  model text NOT NULL,
  report_content text NOT NULL,
  report_type text DEFAULT 'individual' CHECK (report_type IN ('individual', 'department', 'company')),
  module text DEFAULT 'hr',
  created_at timestamptz DEFAULT now()
);

-- RLS 정책 (관리자만 접근)
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;

-- ai_settings: 관리자만 CRUD
CREATE POLICY "ai_settings_admin_select" ON public.ai_settings
  FOR SELECT USING (public.is_admin());

CREATE POLICY "ai_settings_admin_insert" ON public.ai_settings
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "ai_settings_admin_update" ON public.ai_settings
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "ai_settings_admin_delete" ON public.ai_settings
  FOR DELETE USING (public.is_admin());

-- ai_reports: 관리자만 CRUD
CREATE POLICY "ai_reports_admin_select" ON public.ai_reports
  FOR SELECT USING (public.is_admin());

CREATE POLICY "ai_reports_admin_insert" ON public.ai_reports
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "ai_reports_admin_update" ON public.ai_reports
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "ai_reports_admin_delete" ON public.ai_reports
  FOR DELETE USING (public.is_admin());
