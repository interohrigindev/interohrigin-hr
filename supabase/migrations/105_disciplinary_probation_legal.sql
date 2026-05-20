-- 105: P2-1 + P2-2 + P3-1 통합 (징계/수습 컴플라이언스/법령 파라미터)
-- 각 모듈은 feature_rollouts 로 독립 토글

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- P2-1: disciplinary_cases — 징계/면담 케이스
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.disciplinary_cases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  case_type       text NOT NULL CHECK (case_type IN ('warning','meeting','suspension','demotion','dismissal','other')),
  subject         text NOT NULL,
  reason          text NOT NULL,
  reason_category text,                                -- 자유 분류 (예: 근태/업무태도/규정위반)
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','review','decided','notified','closed')),
  decision        text,
  decision_at     timestamptz,
  notified_at     timestamptz,
  notification_method text,                            -- '서면/이메일/대면'
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disciplinary_cases_emp_idx ON public.disciplinary_cases (employee_id, created_at DESC);
ALTER TABLE public.disciplinary_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disc_cases_select"
ON public.disciplinary_cases FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
    AND e.role IN ('admin','hr_admin','ceo','director','division_head'))
);
CREATE POLICY "disc_cases_modify"
ON public.disciplinary_cases FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
    AND e.role IN ('admin','hr_admin','ceo'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
    AND e.role IN ('admin','hr_admin','ceo'))
);

-- 면담/조사 일지
CREATE TABLE IF NOT EXISTS public.disciplinary_meetings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES public.disciplinary_cases(id) ON DELETE CASCADE,
  meeting_at      timestamptz NOT NULL,
  meeting_type    text NOT NULL CHECK (meeting_type IN ('preliminary','committee','final','followup')),
  attendees       text,                                -- 자유 기재
  minutes         text NOT NULL,                       -- 회의록
  decisions       text,
  next_step       text,
  recorded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disc_meetings_case_idx ON public.disciplinary_meetings (case_id, meeting_at DESC);
ALTER TABLE public.disciplinary_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disc_meetings_select" ON public.disciplinary_meetings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo','director','division_head')));
CREATE POLICY "disc_meetings_modify" ON public.disciplinary_meetings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo')))
WITH CHECK (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo')));

-- 첨부 문서 (의결서/통보문/면담일지 PDF 등)
CREATE TABLE IF NOT EXISTS public.disciplinary_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES public.disciplinary_cases(id) ON DELETE CASCADE,
  document_type   text NOT NULL CHECK (document_type IN ('resolution','notice','minutes','evidence','other')),
  storage_path    text NOT NULL,                       -- private bucket path
  filename        text NOT NULL,
  uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.disciplinary_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disc_docs_select" ON public.disciplinary_documents FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo','director','division_head')));
CREATE POLICY "disc_docs_modify" ON public.disciplinary_documents FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo')))
WITH CHECK (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo')));


-- ════════════════════════════════════════════════════════════════════
-- P2-2: probation_compliance_reviews — 수습 종료 컴플라이언스
-- employees ALTER 안 함 — 별도 보조 테이블에 저장
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.probation_compliance_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewed_at     timestamptz NOT NULL DEFAULT now(),
  reviewer_uid    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 정당성 체크리스트
  eval_objective_done       boolean DEFAULT false,
  meeting_count_sufficient  boolean DEFAULT false,
  written_notice_prepared   boolean DEFAULT false,
  improvement_period_given  boolean DEFAULT false,
  documents_complete        boolean DEFAULT false,
  notes           text,
  overall_decision text CHECK (overall_decision IN ('proceed','more_review','stop')),
  UNIQUE(employee_id, reviewed_at)
);

CREATE INDEX IF NOT EXISTS prob_compl_emp_idx ON public.probation_compliance_reviews (employee_id, reviewed_at DESC);
ALTER TABLE public.probation_compliance_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prob_compl_select" ON public.probation_compliance_reviews FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive')));
CREATE POLICY "prob_compl_modify" ON public.probation_compliance_reviews FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo')))
WITH CHECK (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo')));

-- 알림 발송 이력 (30일 전 등)
CREATE TABLE IF NOT EXISTS public.probation_alert_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  alert_type      text NOT NULL CHECK (alert_type IN ('expiry_30d','expiry_7d','expiry_today')),
  alert_for_date  date NOT NULL,                       -- 수습 만료 예정일
  sent_at         timestamptz NOT NULL DEFAULT now(),
  delivery_id     uuid REFERENCES public.notification_deliveries(id) ON DELETE SET NULL,
  UNIQUE(employee_id, alert_type, alert_for_date)
);

ALTER TABLE public.probation_alert_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prob_alert_select" ON public.probation_alert_logs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive')));


-- ════════════════════════════════════════════════════════════════════
-- P3-1: legal_params — 법령 파라미터 마스터
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.legal_params (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  param_key       text NOT NULL,                       -- 'min_wage_hourly' | 'national_pension_rate' 등
  param_value     jsonb NOT NULL,                      -- {amount: 9860, currency: 'KRW'} 등
  effective_from  date NOT NULL,
  effective_to    date,
  source          text,                                -- 정부 API URL 또는 출처
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','active','archived')),
  approved_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(param_key, effective_from)
);

CREATE INDEX IF NOT EXISTS legal_params_key_idx ON public.legal_params (param_key, effective_from DESC);
CREATE INDEX IF NOT EXISTS legal_params_status_idx ON public.legal_params (status);

ALTER TABLE public.legal_params ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legal_params_select" ON public.legal_params FOR SELECT TO authenticated USING (true);
CREATE POLICY "legal_params_modify" ON public.legal_params FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo')))
WITH CHECK (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo')));

CREATE TABLE IF NOT EXISTS public.legal_param_fetch_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  source          text NOT NULL,
  status          text NOT NULL CHECK (status IN ('success','no_change','failed')),
  changes_detected jsonb,
  error_message   text
);

ALTER TABLE public.legal_param_fetch_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legal_fetch_logs_select" ON public.legal_param_fetch_logs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid()
  AND e.role IN ('admin','hr_admin','ceo','director','division_head')));

COMMIT;
