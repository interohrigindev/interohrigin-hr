-- 103: P1-3 — 연차 촉진 자동화 + 미사용 수당 시뮬레이션
-- 재사용: leave_requests, employee_hr_details.annual_leave_*
-- 신규: annual_leave_promotions, leave_balance_snapshots, leave_promotion_responses

BEGIN;

-- 촉진 통지 이력 (6개월/2개월 전)
CREATE TABLE IF NOT EXISTS public.annual_leave_promotions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  stage           text NOT NULL CHECK (stage IN ('6m','2m')),
  remaining_days  float NOT NULL,
  expires_on      date NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  delivery_id     uuid REFERENCES public.notification_deliveries(id) ON DELETE SET NULL,
  read_at         timestamptz,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(employee_id, stage, expires_on)
);

CREATE INDEX IF NOT EXISTS leave_promo_emp_idx ON public.annual_leave_promotions (employee_id, sent_at DESC);

ALTER TABLE public.annual_leave_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_promo_select"
ON public.annual_leave_promotions FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
);

-- 잔여 연차 스냅샷 (일자별 시점 캡처)
CREATE TABLE IF NOT EXISTS public.leave_balance_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  snapshot_date   date NOT NULL DEFAULT CURRENT_DATE,
  total_days      float NOT NULL DEFAULT 0,
  used_days       float NOT NULL DEFAULT 0,
  remaining_days  float NOT NULL DEFAULT 0,
  estimated_liability_krw integer DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS leave_balance_emp_idx ON public.leave_balance_snapshots (employee_id, snapshot_date DESC);

ALTER TABLE public.leave_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_balance_select"
ON public.leave_balance_snapshots FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
);

-- 직원 회신 (사용 예정일 입력)
CREATE TABLE IF NOT EXISTS public.leave_promotion_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id    uuid NOT NULL REFERENCES public.annual_leave_promotions(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  planned_dates   date[] NOT NULL DEFAULT '{}',  -- 사용 예정일 배열
  notes           text,
  responded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_promo_resp_emp_idx ON public.leave_promotion_responses (employee_id, responded_at DESC);

ALTER TABLE public.leave_promotion_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_promo_resp_select"
ON public.leave_promotion_responses FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
);

-- RPC: 직원 본인이 촉진 회신
CREATE OR REPLACE FUNCTION public.respond_leave_promotion(
  p_promotion_id uuid,
  p_planned_dates date[],
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_promo public.annual_leave_promotions%ROWTYPE;
  v_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인 필요' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_promo FROM public.annual_leave_promotions WHERE id = p_promotion_id;
  IF v_promo.employee_id <> v_uid THEN
    RAISE EXCEPTION '본인 촉진서만 회신 가능합니다' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.leave_promotion_responses (promotion_id, employee_id, planned_dates, notes)
  VALUES (p_promotion_id, v_uid, p_planned_dates, p_notes)
  RETURNING id INTO v_id;

  -- 열람 시각도 함께 기록 (회신 = 열람 완료)
  UPDATE public.annual_leave_promotions SET read_at = now() WHERE id = p_promotion_id;

  PERFORM public.log_audit('create', 'leave_promotion_response', v_id,
    NULL,
    jsonb_build_object('promotion_id', p_promotion_id, 'planned_dates', p_planned_dates),
    '연차 촉진서 회신 — 사용 예정일 ' || array_length(p_planned_dates, 1)::text || '일');

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_leave_promotion(uuid, date[], text) TO authenticated;

COMMIT;
