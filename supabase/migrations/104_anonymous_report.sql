-- 104: P2-3 — 익명 신고 핫라인
-- 원칙: 제보자 실명/uid 절대 저장 X. 토큰 기반 추적.

BEGIN;

CREATE TABLE IF NOT EXISTS public.anonymous_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_token  text NOT NULL UNIQUE,            -- 제보자 본인 재접속용 (해시 X — 본인이 알아야 함)
  category        text NOT NULL CHECK (category IN ('harassment','sexual','discrimination','retaliation','safety','other')),
  subject         text,
  body            text NOT NULL,
  related_persons text,                            -- 자유 기재 (해당자 이름 — 임의 입력)
  status          text NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received','reviewing','escalated','resolved','closed')),
  severity        text DEFAULT 'normal' CHECK (severity IN ('low','normal','high','critical')),
  hr_internal_notes text,                          -- HR 내부 메모 (제보자에게 안 보임)
  assigned_to     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS anon_reports_status_idx ON public.anonymous_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS anon_reports_category_idx ON public.anonymous_reports (category, created_at DESC);

ALTER TABLE public.anonymous_reports ENABLE ROW LEVEL SECURITY;

-- 조회: HR 전용 (제보자는 RPC 로만 본인 토큰으로 조회)
DROP POLICY IF EXISTS "anon_reports_select_hr" ON public.anonymous_reports;
CREATE POLICY "anon_reports_select_hr"
ON public.anonymous_reports FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('admin','hr_admin','ceo')
  )
);

-- 응답 (HR ↔ 제보자 양방향 메시지)
CREATE TABLE IF NOT EXISTS public.anonymous_report_replies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.anonymous_reports(id) ON DELETE CASCADE,
  from_role       text NOT NULL CHECK (from_role IN ('reporter','hr')),
  body            text NOT NULL,
  hr_author_uid   uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- HR 측 응답만 uid 저장
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS anon_replies_report_idx ON public.anonymous_report_replies (report_id, created_at);

ALTER TABLE public.anonymous_report_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_replies_select_hr" ON public.anonymous_report_replies;
CREATE POLICY "anon_replies_select_hr"
ON public.anonymous_report_replies FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('admin','hr_admin','ceo')
  )
);

-- RPC: 익명 제보 접수 (anon 가능)
CREATE OR REPLACE FUNCTION public.submit_anonymous_report(
  p_category text,
  p_subject text,
  p_body text,
  p_related_persons text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_id uuid;
BEGIN
  IF p_body IS NULL OR length(trim(p_body)) < 10 THEN
    RAISE EXCEPTION '제보 내용은 10자 이상 입력해주세요' USING ERRCODE='22023';
  END IF;
  IF p_category NOT IN ('harassment','sexual','discrimination','retaliation','safety','other') THEN
    RAISE EXCEPTION '카테고리가 올바르지 않습니다' USING ERRCODE='22023';
  END IF;

  v_token := encode(gen_random_bytes(16), 'hex');  -- 32자 hex 토큰

  INSERT INTO public.anonymous_reports (tracking_token, category, subject, body, related_persons)
  VALUES (v_token, p_category, p_subject, p_body, p_related_persons)
  RETURNING id INTO v_id;

  -- 감사 로그: 익명이므로 actor X. 토큰은 절대 로그에 남기지 않음 — entity_id 만.
  PERFORM public.log_audit('create', 'anonymous_report', v_id, NULL, NULL, '익명 제보 접수 (' || p_category || ')');

  RETURN jsonb_build_object('token', v_token, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_anonymous_report(text, text, text, text) TO anon, authenticated;

-- RPC: 토큰으로 본인 제보 + 응답 조회 (anon 가능)
CREATE OR REPLACE FUNCTION public.get_anonymous_report_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report jsonb;
  v_replies jsonb;
BEGIN
  SELECT to_jsonb(r.*) - 'hr_internal_notes' INTO v_report  -- HR 내부 메모 제거
    FROM public.anonymous_reports r WHERE tracking_token = p_token LIMIT 1;
  IF v_report IS NULL THEN
    RAISE EXCEPTION '제보를 찾을 수 없습니다 (토큰 확인)' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'from_role', from_role, 'body', body, 'created_at', created_at
  ) ORDER BY created_at), '[]'::jsonb)
    INTO v_replies
    FROM public.anonymous_report_replies
   WHERE report_id = (v_report->>'id')::uuid;

  RETURN jsonb_build_object('report', v_report, 'replies', v_replies);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_anonymous_report_by_token(text) TO anon, authenticated;

-- RPC: 제보자 추가 메시지 (anon 가능)
CREATE OR REPLACE FUNCTION public.reply_anonymous_report_by_token(p_token text, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
  v_id uuid;
BEGIN
  IF p_body IS NULL OR length(trim(p_body)) < 1 THEN
    RAISE EXCEPTION '내용을 입력해주세요' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_report_id FROM public.anonymous_reports WHERE tracking_token = p_token LIMIT 1;
  IF v_report_id IS NULL THEN
    RAISE EXCEPTION '제보를 찾을 수 없습니다' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.anonymous_report_replies (report_id, from_role, body)
  VALUES (v_report_id, 'reporter', p_body)
  RETURNING id INTO v_id;

  PERFORM public.log_audit('create', 'anonymous_report_reply', v_id, NULL, NULL, '제보자 추가 메시지');
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reply_anonymous_report_by_token(text, text) TO anon, authenticated;

-- RPC: HR 답변 (HR 권한 필수)
CREATE OR REPLACE FUNCTION public.reply_anonymous_report_hr(p_report_id uuid, p_body text)
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
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인 필요' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.employees WHERE id = v_uid LIMIT 1;
  IF v_role NOT IN ('admin','hr_admin','ceo') THEN
    RAISE EXCEPTION '응답 권한이 없습니다' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.anonymous_report_replies (report_id, from_role, body, hr_author_uid)
  VALUES (p_report_id, 'hr', p_body, v_uid)
  RETURNING id INTO v_id;

  PERFORM public.log_audit('create', 'anonymous_report_reply', v_id, NULL, NULL, 'HR 답변');
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reply_anonymous_report_hr(uuid, text) TO authenticated;

COMMIT;
