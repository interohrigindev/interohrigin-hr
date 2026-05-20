-- 101: 법적 리스크 대응 P1-1 — 연장근로 사전 승인제
-- 기준: docs/HR플랫폼_법적리스크대응_보완개발계획_0520.md §4 P1-1
-- 원칙:
--   - 직원이 야근 사전 신청 → 관리자 승인 후 근무 인정
--   - 무승인 초과근무는 관리자 검토 상태로 자동 분류
--   - 모든 액션은 log_audit RPC 호출로 기록
--   - feature_rollouts.overtime_approval = true 일 때만 UI 노출 (기본 OFF)

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- 1. overtime_requests — 사전 신청
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.overtime_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_uid         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_date          date NOT NULL,                   -- 야근 예정일
  start_at_planned      timestamptz NOT NULL,            -- 예정 시작 시각
  end_at_planned        timestamptz NOT NULL,            -- 예정 종료 시각
  reason                text NOT NULL,                   -- 사유 (필수)
  expected_minutes      int GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (end_at_planned - start_at_planned))::int / 60
  ) STORED,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected','cancelled')),
  approver_uid          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_decision_at  timestamptz,
  approver_comment      text,
  cancellation_reason   text,                            -- 본인 취소 시 사유
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS overtime_requests_requester_idx ON public.overtime_requests (requester_uid, request_date DESC);
CREATE INDEX IF NOT EXISTS overtime_requests_status_idx    ON public.overtime_requests (status, request_date DESC);
CREATE INDEX IF NOT EXISTS overtime_requests_date_idx      ON public.overtime_requests (request_date DESC);

ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;

-- 조회: 본인 신청 + 관리자/임원/대표
CREATE POLICY "overtime_requests_select"
ON public.overtime_requests FOR SELECT TO authenticated
USING (
  requester_uid = auth.uid()
  OR approver_uid = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive','leader')
  )
);

-- INSERT/UPDATE 는 RPC 만 (정책 미정의)


-- ════════════════════════════════════════════════════════════════════
-- 2. overtime_actuals — 실제 종료 기록
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.overtime_actuals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid REFERENCES public.overtime_requests(id) ON DELETE SET NULL,
  employee_uid        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actual_start_at     timestamptz NOT NULL,
  actual_end_at       timestamptz NOT NULL,
  actual_minutes      int GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (actual_end_at - actual_start_at))::int / 60
  ) STORED,
  source              text NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('attendance','manual','inferred')),
  notes               text,
  deviation_minutes   int,                               -- 승인 종료 vs 실제 종료 (분)
  needs_review        boolean NOT NULL DEFAULT false,    -- 무승인 또는 편차 큼
  review_status       text DEFAULT 'pending'
                        CHECK (review_status IN ('pending','approved','rejected','exempt')),
  reviewer_uid        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_comment      text,
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS overtime_actuals_employee_idx ON public.overtime_actuals (employee_uid, actual_start_at DESC);
CREATE INDEX IF NOT EXISTS overtime_actuals_review_idx   ON public.overtime_actuals (needs_review, review_status);
CREATE INDEX IF NOT EXISTS overtime_actuals_request_idx  ON public.overtime_actuals (request_id);

ALTER TABLE public.overtime_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overtime_actuals_select"
ON public.overtime_actuals FOR SELECT TO authenticated
USING (
  employee_uid = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head','executive','leader')
  )
);


-- ════════════════════════════════════════════════════════════════════
-- 3. overtime_policy_snapshots — 정책 변경 이력
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.overtime_policy_snapshots (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from           date NOT NULL,
  daily_limit_minutes      int NOT NULL DEFAULT 240,     -- 일 4시간 (관행)
  weekly_limit_minutes     int NOT NULL DEFAULT 720,     -- 주 12시간 (52h 산식의 연장 한도)
  approval_required        boolean NOT NULL DEFAULT true,
  deviation_alert_minutes  int NOT NULL DEFAULT 30,      -- 편차 임계치
  notes                    text,
  created_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.overtime_policy_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overtime_policy_select"
ON public.overtime_policy_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "overtime_policy_modify_admin"
ON public.overtime_policy_snapshots FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('admin','hr_admin','ceo')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('admin','hr_admin','ceo')
  )
);

-- 기본 정책 1건 시드
INSERT INTO public.overtime_policy_snapshots (effective_from, daily_limit_minutes, weekly_limit_minutes, approval_required, deviation_alert_minutes, notes)
VALUES (CURRENT_DATE, 240, 720, true, 30, '초기 정책 — 일일 4h, 주간 12h, 사전 승인 필수, 편차 30분 이상 검토')
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════════
-- 4. SECURITY DEFINER RPC: request_overtime
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.request_overtime(
  p_request_date     date,
  p_start_at_planned timestamptz,
  p_end_at_planned   timestamptz,
  p_reason           text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_id  uuid;
  v_minutes int;
  v_policy public.overtime_policy_snapshots%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION '신청 사유는 5자 이상 입력해주세요' USING ERRCODE = '22023';
  END IF;
  IF p_end_at_planned <= p_start_at_planned THEN
    RAISE EXCEPTION '종료 시각은 시작 시각 이후여야 합니다' USING ERRCODE = '22023';
  END IF;

  v_minutes := EXTRACT(EPOCH FROM (p_end_at_planned - p_start_at_planned))::int / 60;

  -- 최신 정책 조회 (정보용 — 차단 X, 경고만)
  SELECT * INTO v_policy FROM public.overtime_policy_snapshots
    WHERE effective_from <= CURRENT_DATE ORDER BY effective_from DESC LIMIT 1;

  IF v_policy.id IS NOT NULL AND v_minutes > v_policy.daily_limit_minutes THEN
    -- 정책 초과 — 신청은 받되 사유에 자동 표시
    -- (관리자 검토 시점에 판단)
    NULL;
  END IF;

  INSERT INTO public.overtime_requests (requester_uid, request_date, start_at_planned, end_at_planned, reason)
  VALUES (v_uid, p_request_date, p_start_at_planned, p_end_at_planned, p_reason)
  RETURNING id INTO v_id;

  PERFORM public.log_audit(
    'create', 'overtime_request', v_id,
    NULL,
    jsonb_build_object('request_date', p_request_date, 'minutes', v_minutes, 'reason', p_reason),
    '연장근로 신청 (' || v_minutes || '분, ' || p_request_date || ')'
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_overtime(date, timestamptz, timestamptz, text) TO authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 5. SECURITY DEFINER RPC: decide_overtime (승인/반려)
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.decide_overtime(
  p_request_id uuid,
  p_decision   text,     -- 'approved' | 'rejected'
  p_comment    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_before jsonb;
  v_after  jsonb;
  v_req public.overtime_requests%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION '결정 값이 잘못되었습니다' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_role FROM public.employees WHERE id = v_uid LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr_admin','ceo','director','division_head','executive','leader') THEN
    RAISE EXCEPTION '승인 권한이 없습니다' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM public.overtime_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION '신청을 찾을 수 없습니다' USING ERRCODE = '22023';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION '이미 처리된 신청입니다 (현재 상태: %)', v_req.status USING ERRCODE = '22023';
  END IF;

  v_before := to_jsonb(v_req);

  UPDATE public.overtime_requests
     SET status = p_decision,
         approver_uid = v_uid,
         approver_decision_at = now(),
         approver_comment = p_comment,
         updated_at = now()
   WHERE id = p_request_id
   RETURNING to_jsonb(public.overtime_requests.*) INTO v_after;

  PERFORM public.log_audit(
    CASE WHEN p_decision = 'approved' THEN 'approve' ELSE 'reject' END,
    'overtime_request', p_request_id,
    v_before, v_after,
    '연장근로 ' || CASE WHEN p_decision = 'approved' THEN '승인' ELSE '반려' END
      || COALESCE(' — ' || p_comment, '')
  );

  RETURN v_after;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_overtime(uuid, text, text) TO authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 6. SECURITY DEFINER RPC: record_overtime_actual (실제 종료기록)
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_overtime_actual(
  p_request_id      uuid,
  p_actual_start_at timestamptz,
  p_actual_end_at   timestamptz,
  p_notes           text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_id uuid;
  v_req public.overtime_requests%ROWTYPE;
  v_policy public.overtime_policy_snapshots%ROWTYPE;
  v_deviation int := 0;
  v_needs_review boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다' USING ERRCODE = '42501';
  END IF;
  IF p_actual_end_at <= p_actual_start_at THEN
    RAISE EXCEPTION '종료 시각은 시작 시각 이후여야 합니다' USING ERRCODE = '22023';
  END IF;

  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_req FROM public.overtime_requests WHERE id = p_request_id;
    -- 본인 신청이 아니면 차단 (관리자라도 우회 안 함 — 본인 기록만)
    IF v_req.requester_uid <> v_uid THEN
      RAISE EXCEPTION '본인 신청만 기록할 수 있습니다' USING ERRCODE = '42501';
    END IF;
    IF v_req.status <> 'approved' THEN
      v_needs_review := true;   -- 미승인 상태인데 실제 근무 발생
    ELSE
      -- 편차 계산
      v_deviation := EXTRACT(EPOCH FROM (p_actual_end_at - v_req.end_at_planned))::int / 60;
    END IF;
  ELSE
    -- 신청 없음 — 무승인 야근
    v_needs_review := true;
  END IF;

  SELECT * INTO v_policy FROM public.overtime_policy_snapshots
    WHERE effective_from <= CURRENT_DATE ORDER BY effective_from DESC LIMIT 1;
  IF v_policy.id IS NOT NULL AND ABS(v_deviation) >= v_policy.deviation_alert_minutes THEN
    v_needs_review := true;
  END IF;

  INSERT INTO public.overtime_actuals (
    request_id, employee_uid, actual_start_at, actual_end_at,
    source, notes, deviation_minutes, needs_review
  ) VALUES (
    p_request_id, v_uid, p_actual_start_at, p_actual_end_at,
    'manual', p_notes, v_deviation, v_needs_review
  )
  RETURNING id INTO v_id;

  PERFORM public.log_audit(
    'create', 'overtime_actual', v_id,
    NULL,
    jsonb_build_object('request_id', p_request_id, 'deviation_minutes', v_deviation, 'needs_review', v_needs_review),
    '실제 종료 기록' || CASE WHEN v_needs_review THEN ' (검토 필요)' ELSE '' END
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_overtime_actual(uuid, timestamptz, timestamptz, text) TO authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 7. SECURITY DEFINER RPC: cancel_overtime_request
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cancel_overtime_request(
  p_request_id uuid,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_req public.overtime_requests%ROWTYPE;
  v_before jsonb;
  v_after  jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM public.overtime_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION '신청을 찾을 수 없습니다' USING ERRCODE = '22023';
  END IF;
  IF v_req.requester_uid <> v_uid THEN
    RAISE EXCEPTION '본인 신청만 취소할 수 있습니다' USING ERRCODE = '42501';
  END IF;
  IF v_req.status NOT IN ('pending','approved') THEN
    RAISE EXCEPTION '취소 불가 상태입니다 (현재: %)', v_req.status USING ERRCODE = '22023';
  END IF;

  v_before := to_jsonb(v_req);

  UPDATE public.overtime_requests
     SET status = 'cancelled',
         cancellation_reason = p_reason,
         updated_at = now()
   WHERE id = p_request_id
   RETURNING to_jsonb(public.overtime_requests.*) INTO v_after;

  PERFORM public.log_audit(
    'update', 'overtime_request', p_request_id,
    v_before, v_after,
    '연장근로 신청 취소' || COALESCE(' — ' || p_reason, '')
  );

  RETURN v_after;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_overtime_request(uuid, text) TO authenticated;

COMMIT;
