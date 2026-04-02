-- =====================================================================
-- 041: 채용 이메일 템플릿 테이블
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.recruitment_email_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text       NOT NULL UNIQUE,
  label       text        NOT NULL,
  subject     text        NOT NULL,
  body_html   text        NOT NULL,
  variables   text[]      DEFAULT '{}',
  is_active   boolean     NOT NULL DEFAULT true,
  updated_by  uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.recruitment_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ret_select" ON public.recruitment_email_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ret_manage" ON public.recruitment_email_templates
  FOR ALL TO authenticated USING (public.is_admin());
