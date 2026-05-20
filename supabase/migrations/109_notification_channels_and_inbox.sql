-- 109: 다채널 알림 인프라
--  - push_subscriptions: Web Push 구독 정보 저장
--  - notification_channel_configs: Slack/Webhook URL + VAPID 키 등 운영 설정
--  - in_app 알림 인박스 — notification_deliveries 를 그대로 활용 + read_at 필드 추가
--  - mark_notification_read RPC

-- ============================================================
-- 1. notification_deliveries 에 read_at 컬럼 추가 (in_app 인박스용)
-- ============================================================
ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS notif_deliv_inbox_idx
  ON public.notification_deliveries (recipient_uid, channel, sent_at DESC)
  WHERE channel = 'in_app';

-- ============================================================
-- 2. Web Push 구독 정보
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      text NOT NULL,
  p256dh        text NOT NULL,
  auth_secret   text NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subs_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subs_self" ON public.push_subscriptions;
CREATE POLICY "push_subs_self"
ON public.push_subscriptions FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 3. 알림 채널 설정 (Slack/Webhook/Push VAPID 키)
--    단일 row 로 운영 (key = 'default')
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_channel_configs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key        text NOT NULL UNIQUE,
  slack_webhook_url text,
  generic_webhook_url text,
  vapid_public_key  text,
  -- VAPID 비공개 키는 별도 서버 환경변수로 — DB 에 저장 X
  enabled_channels  jsonb NOT NULL DEFAULT '["email","in_app"]'::jsonb,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.notification_channel_configs (config_key, enabled_channels)
SELECT 'default', '["email","in_app"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.notification_channel_configs WHERE config_key='default');

ALTER TABLE public.notification_channel_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channel_configs_select" ON public.notification_channel_configs;
CREATE POLICY "channel_configs_select"
ON public.notification_channel_configs FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "channel_configs_modify" ON public.notification_channel_configs;
CREATE POLICY "channel_configs_modify"
ON public.notification_channel_configs FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('admin','hr_admin','ceo'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('admin','hr_admin','ceo'))
);

-- ============================================================
-- 4. RPC: 인앱 알림 읽음 처리
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_delivery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT recipient_uid INTO v_uid
  FROM public.notification_deliveries WHERE id = p_delivery_id;

  IF v_uid IS NULL OR v_uid <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.notification_deliveries
  SET read_at = now()
  WHERE id = p_delivery_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

-- ============================================================
-- 5. RPC: 본인 인박스 조회 (미읽음 우선)
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_my_inbox(p_limit integer DEFAULT 30)
RETURNS TABLE (
  id uuid,
  subject text,
  body text,
  related_entity_type text,
  related_entity_id uuid,
  sent_at timestamptz,
  read_at timestamptz,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.subject,
    (d.payload->>'body')::text AS body,
    d.related_entity_type,
    d.related_entity_id,
    d.sent_at,
    d.read_at,
    d.status::text
  FROM public.notification_deliveries d
  WHERE d.recipient_uid = auth.uid()
    AND d.channel = 'in_app'
  ORDER BY (d.read_at IS NULL) DESC, d.sent_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_inbox(integer) TO authenticated;

-- ============================================================
-- 6. RPC: 본인이 받은 연차 촉진 통지 조회 (회신 페이지용)
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_my_leave_promotions()
RETURNS TABLE (
  promotion_id uuid,
  stage text,
  remaining_days float,
  expires_on date,
  sent_at timestamptz,
  has_responded boolean,
  response_id uuid,
  planned_dates date[],
  notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.stage,
    p.remaining_days,
    p.expires_on,
    p.sent_at,
    (r.id IS NOT NULL),
    r.id,
    COALESCE(r.planned_dates, ARRAY[]::date[]),
    r.notes
  FROM public.annual_leave_promotions p
  LEFT JOIN public.leave_promotion_responses r ON r.promotion_id = p.id
  WHERE p.employee_id = auth.uid()
  ORDER BY p.sent_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_leave_promotions() TO authenticated;
