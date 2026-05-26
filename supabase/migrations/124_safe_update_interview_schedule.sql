-- 124: 면접 일정 안전 수정 시스템
--
-- 사용자 요청:
--   면접 일정을 수정 가능하게 하되, 다시는 일정이 사라지지 않도록 안정 보장.
--
-- 안전망 5중 설계:
--   1) 화이트리스트 RPC — 허용된 필드만 update (id/candidate_id 등 키 변경 차단)
--   2) Row lock (FOR UPDATE) — 동시 편집 시 lost update 방지
--   3) Audit log — 누가/언제/무엇을 변경했는지 보관 (interview_schedule_audits)
--   4) 존재 검증 — id NOT FOUND 시 명시 예외 (조용히 사라지지 않음)
--   5) 권한 체크 — admin/hr_admin/ceo/director/division_head/executive 만
--
-- 변경 가능 필드 (화이트리스트):
--   scheduled_at, duration_minutes, interview_type, priority,
--   meeting_link, google_event_id, location_info, interviewer_ids,
--   notes, status, pre_materials_sent, pre_materials_sent_at
--
-- 변경 금지 (절대 안 됨):
--   id, candidate_id, created_at  ← 키성/감사성 필드는 RPC 가 가드

BEGIN;

-- ─── 1) Audit Log 테이블 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interview_schedule_audits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id  uuid NOT NULL,   -- ON DELETE 시 audit 는 그대로 보존 (FK 없음)
  candidate_id uuid,
  action       text NOT NULL CHECK (action IN ('update','status_change','cancel','restore')),
  actor_id     uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_name   text,
  actor_role   text,
  before_data  jsonb,
  after_data   jsonb,
  changed_keys text[],
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interview_schedule_audits_schedule_idx
  ON public.interview_schedule_audits (schedule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS interview_schedule_audits_actor_idx
  ON public.interview_schedule_audits (actor_id, created_at DESC);

ALTER TABLE public.interview_schedule_audits ENABLE ROW LEVEL SECURITY;

-- SELECT: 인증된 사용자 누구나 (이력 추적용)
DROP POLICY IF EXISTS "interview_schedule_audits_select" ON public.interview_schedule_audits;
CREATE POLICY "interview_schedule_audits_select"
  ON public.interview_schedule_audits FOR SELECT TO authenticated USING (true);

-- INSERT: SECURITY DEFINER RPC 만 (직접 INSERT 차단)
DROP POLICY IF EXISTS "interview_schedule_audits_insert_block" ON public.interview_schedule_audits;
CREATE POLICY "interview_schedule_audits_insert_block"
  ON public.interview_schedule_audits FOR INSERT TO authenticated WITH CHECK (false);

-- UPDATE/DELETE 차단 (감사 무결성)
DROP POLICY IF EXISTS "interview_schedule_audits_no_update" ON public.interview_schedule_audits;
CREATE POLICY "interview_schedule_audits_no_update"
  ON public.interview_schedule_audits FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "interview_schedule_audits_no_delete" ON public.interview_schedule_audits;
CREATE POLICY "interview_schedule_audits_no_delete"
  ON public.interview_schedule_audits FOR DELETE TO authenticated USING (false);

COMMENT ON TABLE public.interview_schedule_audits IS
  '면접 일정 변경 감사 로그 — 누가/언제/무엇을 변경했는지 보관. UPDATE/DELETE 차단(무결성).';

-- ─── 2) safe_update_interview_schedule RPC ──────────────────────
DROP FUNCTION IF EXISTS public.safe_update_interview_schedule(uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.safe_update_interview_schedule(
  p_schedule_id uuid,
  p_patch       jsonb,    -- 변경할 필드만 담은 jsonb. 화이트리스트 외 필드는 자동 무시.
  p_reason      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before     public.interview_schedules%ROWTYPE;
  v_after      public.interview_schedules%ROWTYPE;
  v_actor_name text;
  v_actor_role text;
  v_changed    text[] := ARRAY[]::text[];

  -- 화이트리스트 필드 — 이 외엔 변경 불가
  v_allowed    text[] := ARRAY[
    'scheduled_at', 'duration_minutes', 'interview_type', 'priority',
    'meeting_link', 'google_event_id', 'location_info', 'interviewer_ids',
    'notes', 'status', 'pre_materials_sent', 'pre_materials_sent_at'
  ];

  -- 패치 적용용 추출
  v_scheduled_at        timestamptz;
  v_duration_minutes    int;
  v_interview_type      text;
  v_priority            text;
  v_meeting_link        text;
  v_google_event_id     text;
  v_location_info       text;
  v_interviewer_ids     jsonb;
  v_notes               text;
  v_status              text;
  v_pre_sent            boolean;
  v_pre_sent_at         timestamptz;
BEGIN
  -- 권한 체크
  PERFORM public._check_recruitment_writer_role();

  -- 패치 검증
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION '잘못된 patch 형식입니다 (jsonb object 필요)';
  END IF;

  IF p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION '변경할 내용이 없습니다';
  END IF;

  -- 화이트리스트 외 키 차단 — 키 변경 시도 시 예외
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) AS k(key)
    WHERE k.key <> ALL(v_allowed)
  ) THEN
    RAISE EXCEPTION '허용되지 않은 필드가 포함되어 있습니다: %',
      (SELECT array_agg(k.key)
         FROM jsonb_object_keys(p_patch) AS k(key)
        WHERE k.key <> ALL(v_allowed));
  END IF;

  -- Row lock + 존재 확인
  SELECT * INTO v_before FROM public.interview_schedules
   WHERE id = p_schedule_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '면접 일정을 찾을 수 없습니다 (id=%). 다른 사용자가 삭제했을 수 있습니다.', p_schedule_id;
  END IF;

  -- 화이트리스트 필드만 추출 (없으면 기존 값 유지)
  v_scheduled_at     := COALESCE((p_patch->>'scheduled_at')::timestamptz, v_before.scheduled_at);
  v_duration_minutes := COALESCE((p_patch->>'duration_minutes')::int,    v_before.duration_minutes);
  v_interview_type   := COALESCE(p_patch->>'interview_type',             v_before.interview_type);
  v_priority         := COALESCE(p_patch->>'priority',                   v_before.priority);
  v_meeting_link     := COALESCE(p_patch->>'meeting_link',               v_before.meeting_link);
  v_google_event_id  := COALESCE(p_patch->>'google_event_id',            v_before.google_event_id);
  v_location_info    := COALESCE(p_patch->>'location_info',              v_before.location_info);
  v_interviewer_ids  := COALESCE(p_patch->'interviewer_ids',             COALESCE(to_jsonb(v_before.interviewer_ids), '[]'::jsonb));
  v_notes            := COALESCE(p_patch->>'notes',                      v_before.notes);
  v_status           := COALESCE(p_patch->>'status',                     v_before.status);
  v_pre_sent         := COALESCE((p_patch->>'pre_materials_sent')::boolean,  v_before.pre_materials_sent);
  v_pre_sent_at      := COALESCE((p_patch->>'pre_materials_sent_at')::timestamptz, v_before.pre_materials_sent_at);

  -- 변경 키 집계 (audit log 용)
  IF v_scheduled_at    IS DISTINCT FROM v_before.scheduled_at        THEN v_changed := v_changed || 'scheduled_at'; END IF;
  IF v_duration_minutes IS DISTINCT FROM v_before.duration_minutes   THEN v_changed := v_changed || 'duration_minutes'; END IF;
  IF v_interview_type  IS DISTINCT FROM v_before.interview_type      THEN v_changed := v_changed || 'interview_type'; END IF;
  IF v_priority        IS DISTINCT FROM v_before.priority            THEN v_changed := v_changed || 'priority'; END IF;
  IF v_meeting_link    IS DISTINCT FROM v_before.meeting_link        THEN v_changed := v_changed || 'meeting_link'; END IF;
  IF v_google_event_id IS DISTINCT FROM v_before.google_event_id     THEN v_changed := v_changed || 'google_event_id'; END IF;
  IF v_location_info   IS DISTINCT FROM v_before.location_info       THEN v_changed := v_changed || 'location_info'; END IF;
  IF v_interviewer_ids IS DISTINCT FROM COALESCE(to_jsonb(v_before.interviewer_ids), '[]'::jsonb)
                                                                      THEN v_changed := v_changed || 'interviewer_ids'; END IF;
  IF v_notes           IS DISTINCT FROM v_before.notes               THEN v_changed := v_changed || 'notes'; END IF;
  IF v_status          IS DISTINCT FROM v_before.status              THEN v_changed := v_changed || 'status'; END IF;
  IF v_pre_sent        IS DISTINCT FROM v_before.pre_materials_sent  THEN v_changed := v_changed || 'pre_materials_sent'; END IF;
  IF v_pre_sent_at     IS DISTINCT FROM v_before.pre_materials_sent_at THEN v_changed := v_changed || 'pre_materials_sent_at'; END IF;

  IF array_length(v_changed, 1) IS NULL THEN
    RAISE EXCEPTION '실제로 변경된 항목이 없습니다';
  END IF;

  -- Atomic update — 명시 컬럼만, 다른 컬럼은 절대 손대지 않음
  UPDATE public.interview_schedules
     SET scheduled_at         = v_scheduled_at,
         duration_minutes     = v_duration_minutes,
         interview_type       = v_interview_type,
         priority             = v_priority,
         meeting_link         = v_meeting_link,
         google_event_id      = v_google_event_id,
         location_info        = v_location_info,
         interviewer_ids      = (SELECT array_agg(value::text)::text[] FROM jsonb_array_elements_text(v_interviewer_ids)),
         notes                = v_notes,
         status               = v_status,
         pre_materials_sent   = v_pre_sent,
         pre_materials_sent_at = v_pre_sent_at,
         updated_at           = now()
   WHERE id = p_schedule_id
  RETURNING * INTO v_after;

  -- 작성자 정보
  SELECT name, role INTO v_actor_name, v_actor_role
    FROM public.employees WHERE id = auth.uid() LIMIT 1;

  -- Audit log 기록 (SECURITY DEFINER 라 RLS 우회)
  INSERT INTO public.interview_schedule_audits (
    schedule_id, candidate_id, action,
    actor_id, actor_name, actor_role,
    before_data, after_data, changed_keys, reason
  ) VALUES (
    p_schedule_id, v_after.candidate_id,
    CASE WHEN 'status' = ANY(v_changed) AND array_length(v_changed, 1) = 1
         THEN 'status_change'
         ELSE 'update' END,
    auth.uid(), COALESCE(v_actor_name, '관리자'), COALESCE(v_actor_role, ''),
    to_jsonb(v_before), to_jsonb(v_after), v_changed, p_reason
  );

  RETURN jsonb_build_object(
    'ok',           true,
    'schedule',     to_jsonb(v_after),
    'changed_keys', v_changed
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.safe_update_interview_schedule(uuid, jsonb, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.safe_update_interview_schedule(uuid, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.safe_update_interview_schedule(uuid, jsonb, text) IS
  '면접 일정 안전 수정 RPC — 화이트리스트 필드만 변경, Row lock, Audit log 자동 기록.';

-- ─── 3) get_schedule_audit_log RPC — 변경 이력 조회 ─────────────
DROP FUNCTION IF EXISTS public.get_schedule_audit_log(uuid, int);

CREATE OR REPLACE FUNCTION public.get_schedule_audit_log(
  p_schedule_id uuid,
  p_limit       int DEFAULT 20
)
RETURNS TABLE(
  id           uuid,
  action       text,
  actor_id     uuid,
  actor_name   text,
  actor_role   text,
  changed_keys text[],
  reason       text,
  before_data  jsonb,
  after_data   jsonb,
  created_at   timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, action, actor_id, actor_name, actor_role, changed_keys, reason,
         before_data, after_data, created_at
    FROM public.interview_schedule_audits
   WHERE schedule_id = p_schedule_id
   ORDER BY created_at DESC
   LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

GRANT EXECUTE ON FUNCTION public.get_schedule_audit_log(uuid, int) TO authenticated;

COMMIT;
