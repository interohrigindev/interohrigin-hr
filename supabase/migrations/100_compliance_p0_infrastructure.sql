-- 100: 법적 리스크 대응 P0 — 공통 인프라
-- 기준 문서: docs/HR플랫폼_법적리스크대응_보완개발계획_0520.md §4 P0
-- 원칙:
--   - employees / evaluations / evaluation_items / users 는 ALTER 금지 (별도 테이블만 사용)
--   - 권한 검증은 SECURITY DEFINER RPC 우선
--   - 신규 기능은 feature_rollouts 로 기본 OFF — 활성화는 관리자 UI 토글
--   - 영향: 기존 코드 0 변경 (이 마이그레이션 적용만으로 기존 동작 영향 없음)

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- 1. audit_logs — 감사 로그 (모든 민감 액션 기록)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_uid    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role   text,                              -- 캡처 시점 역할 (직원 정보 변경 후에도 추적 가능)
  action_type  text NOT NULL,                     -- 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'send' | 'export' | 'login' | ...
  entity_type  text NOT NULL,                     -- 'overtime_request' | 'leave_promotion' | 'disciplinary_case' | ...
  entity_id    uuid,                              -- nullable (집계성 액션)
  before_data  jsonb,                             -- 변경 전 (UPDATE/DELETE 만)
  after_data   jsonb,                             -- 변경 후 (CREATE/UPDATE)
  diff_summary text,                              -- 사람이 읽을 수 있는 한 줄 요약 (옵션)
  request_source text DEFAULT 'web',              -- 'web' | 'api' | 'cron' | 'rpc'
  ip_hash      text,                              -- IP 원본 저장 X (해시만 — 보안)
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_idx       ON public.audit_logs (actor_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx      ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx      ON public.audit_logs (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx  ON public.audit_logs (created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 조회: admin / hr_admin / ceo / director / division_head 만
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin"
ON public.audit_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
);

-- INSERT/UPDATE/DELETE 는 직접 차단 — RPC 만으로 기록
-- (정책 미정의 = 차단)

COMMENT ON TABLE public.audit_logs IS '법적 리스크 대응 — 모든 민감 액션 감사 로그. INSERT 는 SECURITY DEFINER RPC log_audit() 만 허용.';


-- ════════════════════════════════════════════════════════════════════
-- 2. audit_exports — 감사 로그 CSV/PDF 내보내기 이력
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_exports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exporter_uid    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  filter_summary  jsonb NOT NULL DEFAULT '{}'::jsonb,  -- 어떤 필터로 export 했는지
  row_count       int NOT NULL,
  format          text NOT NULL CHECK (format IN ('csv','json','pdf')),
  file_path       text,                                -- storage 경로 (옵션)
  reason          text,                                -- export 사유 (감사용)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_exports_exporter_idx ON public.audit_exports (exporter_uid, created_at DESC);
ALTER TABLE public.audit_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_exports_select_admin" ON public.audit_exports;
CREATE POLICY "audit_exports_select_admin"
ON public.audit_exports FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
);


-- ════════════════════════════════════════════════════════════════════
-- 3. notification_templates — 알림 템플릿 (한 곳에서 문구 관리)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,             -- 'leave_promotion_6m' | 'overtime_warning_50h' 등
  channel       text NOT NULL CHECK (channel IN ('email','push','slack','webhook','in_app')),
  subject_tpl   text,                             -- 이메일 제목 등 (변수 치환 가능: {{name}})
  body_tpl      text NOT NULL,                    -- HTML 또는 plain text
  variables     jsonb NOT NULL DEFAULT '[]'::jsonb, -- 사용 가능 변수 목록 (문서화)
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_templates_select_admin" ON public.notification_templates;
CREATE POLICY "notification_templates_select_admin"
ON public.notification_templates FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
);

DROP POLICY IF EXISTS "notification_templates_modify_admin" ON public.notification_templates;
CREATE POLICY "notification_templates_modify_admin"
ON public.notification_templates FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo')
  )
);


-- ════════════════════════════════════════════════════════════════════
-- 4. notification_deliveries — 알림 발송 이력 (성공/실패 모두 기록)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key    text,                                  -- 어떤 템플릿
  channel         text NOT NULL CHECK (channel IN ('email','push','slack','webhook','in_app')),
  recipient_uid   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email text,                                  -- 외부 발송용
  subject         text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,    -- 치환된 변수값 + 최종 본문
  status          text NOT NULL CHECK (status IN ('queued','sent','failed','skipped')),
  error_message   text,
  related_entity_type text,                              -- 어떤 entity 관련 알림
  related_entity_id   uuid,
  sent_at         timestamptz,
  read_at         timestamptz,                           -- in_app/email tracking pixel 용
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_deliveries_recipient_idx ON public.notification_deliveries (recipient_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_deliveries_status_idx    ON public.notification_deliveries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_deliveries_entity_idx    ON public.notification_deliveries (related_entity_type, related_entity_id);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- 본인 수신 내역은 본인이 조회 가능 / 관리자는 전체
DROP POLICY IF EXISTS "notification_deliveries_select_self_or_admin" ON public.notification_deliveries;
CREATE POLICY "notification_deliveries_select_self_or_admin"
ON public.notification_deliveries FOR SELECT TO authenticated
USING (
  recipient_uid = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
);


-- ════════════════════════════════════════════════════════════════════
-- 5. feature_rollouts — 모듈 토글 + 단계적 활성화 범위
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.feature_rollouts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key     text NOT NULL UNIQUE,           -- 'overtime_approval' | 'leave_promotion' | 'anonymous_report' 등
  display_name    text NOT NULL,                  -- 사람이 읽을 수 있는 이름
  description     text,
  is_enabled      boolean NOT NULL DEFAULT false, -- 기본 OFF (운영 게이트)
  scope           text NOT NULL DEFAULT 'none' CHECK (scope IN ('none','admin_only','department','company_wide')),
  scope_filter    jsonb NOT NULL DEFAULT '{}'::jsonb, -- 'department' 인 경우 department_ids 배열 등
  enabled_at      timestamptz,                    -- 활성화 시각
  enabled_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           text,                           -- 관리자 메모 (활성화 사유/조건)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_rollouts_key_idx ON public.feature_rollouts (feature_key);
ALTER TABLE public.feature_rollouts ENABLE ROW LEVEL SECURITY;

-- 조회: 모든 authenticated (모듈 활성 여부는 본인 화면에서도 알아야 함)
DROP POLICY IF EXISTS "feature_rollouts_select_all" ON public.feature_rollouts;
CREATE POLICY "feature_rollouts_select_all"
ON public.feature_rollouts FOR SELECT TO authenticated
USING (true);

-- 수정: admin / ceo / hr_admin 만
DROP POLICY IF EXISTS "feature_rollouts_modify_admin" ON public.feature_rollouts;
CREATE POLICY "feature_rollouts_modify_admin"
ON public.feature_rollouts FOR ALL TO authenticated
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

-- 시드: P0/P1/P2/P3 모든 예정 모듈을 미리 등록 (전부 OFF 상태)
INSERT INTO public.feature_rollouts (feature_key, display_name, description, is_enabled, scope) VALUES
  ('audit_log_view',        '감사 로그 조회',           '관리자가 audit_logs 화면에서 변경 이력 조회', true,  'admin_only'),
  ('overtime_approval',     '연장근로 사전 승인제',     '직원이 야근 사전 신청 → 관리자 승인 후 근무 인정', false, 'none'),
  ('weekly_52h_warning',    '주 52시간 사전 경고',      '주 근무시간 45/50/52h 도달 시 자동 경고',          false, 'none'),
  ('leave_promotion',       '연차 촉진 자동화',         '소멸 6/2개월 전 자동 촉진서 발송',                 false, 'none'),
  ('leave_liability_dashboard','미사용 연차 수당 시뮬레이션','잠재 수당 부채 대시보드',                       false, 'none'),
  ('disciplinary_case',     '징계/면담 케이스 관리',    '징계 사유·의결·통보 증빙 관리',                   false, 'none'),
  ('probation_compliance',  '수습 종료 컴플라이언스',   '30일 전 알림 + 정당성 체크리스트',                false, 'none'),
  ('anonymous_report',      '익명 신고 핫라인',         '괴롭힘·성희롱 익명 제보 + 토큰 추적',             false, 'none'),
  ('legal_params_sync',     '법령 파라미터 자동 동기',  '최저임금/4대보험/공휴일 정부 API 동기화',         false, 'none')
ON CONFLICT (feature_key) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════
-- 6. compliance_run_logs — 배치/cron 실행 결과
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.compliance_run_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key         text NOT NULL,                          -- 'leave_promotion_daily' | 'weekly_52h_check' 등
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  status          text NOT NULL CHECK (status IN ('running','success','partial','failed')),
  processed_count int NOT NULL DEFAULT 0,
  success_count   int NOT NULL DEFAULT 0,
  failed_count    int NOT NULL DEFAULT 0,
  result_summary  jsonb NOT NULL DEFAULT '{}'::jsonb,     -- 상세 결과 요약
  error_message   text,
  triggered_by    text DEFAULT 'cron',                    -- 'cron' | 'manual' | 'api'
  triggered_uid   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS compliance_run_logs_job_idx ON public.compliance_run_logs (job_key, started_at DESC);
CREATE INDEX IF NOT EXISTS compliance_run_logs_status_idx ON public.compliance_run_logs (status, started_at DESC);

ALTER TABLE public.compliance_run_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compliance_run_logs_select_admin" ON public.compliance_run_logs;
CREATE POLICY "compliance_run_logs_select_admin"
ON public.compliance_run_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
);


-- ════════════════════════════════════════════════════════════════════
-- 7. SECURITY DEFINER RPC: log_audit
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action_type  text,
  p_entity_type  text,
  p_entity_id    uuid DEFAULT NULL,
  p_before       jsonb DEFAULT NULL,
  p_after        jsonb DEFAULT NULL,
  p_diff_summary text DEFAULT NULL,
  p_request_source text DEFAULT 'web',
  p_ip_hash      text DEFAULT NULL,
  p_user_agent   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT role INTO v_role FROM public.employees WHERE id = v_uid LIMIT 1;
  END IF;

  INSERT INTO public.audit_logs (
    actor_uid, actor_role, action_type, entity_type, entity_id,
    before_data, after_data, diff_summary, request_source, ip_hash, user_agent
  ) VALUES (
    v_uid, v_role, p_action_type, p_entity_type, p_entity_id,
    p_before, p_after, p_diff_summary, p_request_source, p_ip_hash, p_user_agent
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, jsonb, text, text, text, text) TO authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 8. SECURITY DEFINER RPC: record_notification_delivery
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_notification_delivery(
  p_template_key    text,
  p_channel         text,
  p_recipient_uid   uuid,
  p_recipient_email text,
  p_subject         text,
  p_payload         jsonb,
  p_status          text,
  p_error_message   text DEFAULT NULL,
  p_related_entity_type text DEFAULT NULL,
  p_related_entity_id   uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notification_deliveries (
    template_key, channel, recipient_uid, recipient_email,
    subject, payload, status, error_message,
    related_entity_type, related_entity_id,
    sent_at
  ) VALUES (
    p_template_key, p_channel, p_recipient_uid, p_recipient_email,
    p_subject, p_payload, p_status, p_error_message,
    p_related_entity_type, p_related_entity_id,
    CASE WHEN p_status = 'sent' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_notification_delivery(text, text, uuid, text, text, jsonb, text, text, text, uuid) TO authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 9. SECURITY DEFINER RPC: set_feature_rollout
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_feature_rollout(
  p_feature_key  text,
  p_is_enabled   boolean,
  p_scope        text,
  p_scope_filter jsonb DEFAULT '{}'::jsonb,
  p_notes        text DEFAULT NULL
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
  v_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role FROM public.employees WHERE id = v_uid LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr_admin','ceo') THEN
    RAISE EXCEPTION '기능 토글 권한이 없습니다 (admin/hr_admin/ceo 만)' USING ERRCODE = '42501';
  END IF;

  -- 변경 전 스냅샷
  SELECT to_jsonb(f) INTO v_before
    FROM public.feature_rollouts f WHERE feature_key = p_feature_key;

  -- 업데이트 (없으면 신규 행 생성)
  INSERT INTO public.feature_rollouts (feature_key, display_name, is_enabled, scope, scope_filter, enabled_at, enabled_by, notes, updated_at)
  VALUES (
    p_feature_key, p_feature_key, p_is_enabled, p_scope, p_scope_filter,
    CASE WHEN p_is_enabled THEN now() ELSE NULL END,
    CASE WHEN p_is_enabled THEN v_uid ELSE NULL END,
    p_notes, now()
  )
  ON CONFLICT (feature_key) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        scope = EXCLUDED.scope,
        scope_filter = EXCLUDED.scope_filter,
        enabled_at = CASE WHEN EXCLUDED.is_enabled THEN now() ELSE NULL END,
        enabled_by = CASE WHEN EXCLUDED.is_enabled THEN v_uid ELSE NULL END,
        notes = COALESCE(EXCLUDED.notes, public.feature_rollouts.notes),
        updated_at = now()
  RETURNING id, to_jsonb(public.feature_rollouts.*) INTO v_id, v_after;

  -- 감사 로그
  PERFORM public.log_audit(
    CASE WHEN p_is_enabled THEN 'enable' ELSE 'disable' END,
    'feature_rollout',
    v_id,
    v_before,
    v_after,
    '기능 ' || p_feature_key || ' ' || CASE WHEN p_is_enabled THEN '활성화' ELSE '비활성화' END
  );

  RETURN v_after;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_feature_rollout(text, boolean, text, jsonb, text) TO authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 10. 공개 API 헬퍼: is_feature_enabled (모든 사용자 호출 가능)
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_feature_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM public.feature_rollouts WHERE feature_key = p_feature_key LIMIT 1),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_feature_enabled(text) TO anon, authenticated;


COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 검증
-- ════════════════════════════════════════════════════════════════════
-- SELECT feature_key, is_enabled, scope FROM public.feature_rollouts ORDER BY feature_key;
-- SELECT public.log_audit('test', 'self_test', NULL, NULL, NULL, '마이그레이션 검증');
-- SELECT public.is_feature_enabled('audit_log_view');  -- true (시드값)
-- SELECT public.is_feature_enabled('overtime_approval'); -- false
