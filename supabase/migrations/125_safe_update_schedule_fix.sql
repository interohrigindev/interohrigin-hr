-- 125: safe_update_interview_schedule RPC 회귀 수정
--
-- 사용자 보고:
--   '수정 실패: record "v_before" has no field "notes"' 에러로 일정 수정 차단.
--
-- 원인:
--   124 에서 화이트리스트에 'notes' 와 v_before.notes 참조를 포함했으나,
--   실제 interview_schedules 테이블에 notes 컬럼이 존재하지 않음.
--   또한 interviewer_ids 가 jsonb 타입인데 text[] 로 캐스팅하던 부분도
--   타입 불일치로 잠재 에러.
--
-- 수정:
--   1) 화이트리스트와 RPC 본문에서 notes 제거
--   2) interviewer_ids 는 jsonb 그대로 할당 (캐스팅 제거)
--   3) 비교 시 v_before.interviewer_ids 가 이미 jsonb 라 to_jsonb() 불필요
--
-- 124 와 동일 시그니처라 멱등 + 클라이언트 코드 변경 불필요.

DROP FUNCTION IF EXISTS public.safe_update_interview_schedule(uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.safe_update_interview_schedule(
  p_schedule_id uuid,
  p_patch       jsonb,
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

  -- 화이트리스트 — 실제 interview_schedules 컬럼만 (notes 제거)
  v_allowed    text[] := ARRAY[
    'scheduled_at', 'duration_minutes', 'interview_type', 'priority',
    'meeting_link', 'google_event_id', 'location_info', 'interviewer_ids',
    'status', 'pre_materials_sent', 'pre_materials_sent_at'
  ];

  v_scheduled_at        timestamptz;
  v_duration_minutes    int;
  v_interview_type      text;
  v_priority            text;
  v_meeting_link        text;
  v_google_event_id     text;
  v_location_info       text;
  v_interviewer_ids     jsonb;
  v_status              text;
  v_pre_sent            boolean;
  v_pre_sent_at         timestamptz;
BEGIN
  PERFORM public._check_recruitment_writer_role();

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION '잘못된 patch 형식입니다 (jsonb object 필요)';
  END IF;

  IF p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION '변경할 내용이 없습니다';
  END IF;

  -- 화이트리스트 외 키 차단
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

  -- 화이트리스트 필드만 추출
  v_scheduled_at     := COALESCE((p_patch->>'scheduled_at')::timestamptz, v_before.scheduled_at);
  v_duration_minutes := COALESCE((p_patch->>'duration_minutes')::int,    v_before.duration_minutes);
  v_interview_type   := COALESCE(p_patch->>'interview_type',             v_before.interview_type);
  v_priority         := COALESCE(p_patch->>'priority',                   v_before.priority);
  v_meeting_link     := COALESCE(p_patch->>'meeting_link',               v_before.meeting_link);
  v_google_event_id  := COALESCE(p_patch->>'google_event_id',            v_before.google_event_id);
  v_location_info    := COALESCE(p_patch->>'location_info',              v_before.location_info);
  -- interviewer_ids 는 jsonb 그대로 유지 (124 의 text[] 캐스팅 버그 제거)
  v_interviewer_ids  := COALESCE(p_patch->'interviewer_ids',             COALESCE(v_before.interviewer_ids, '[]'::jsonb));
  v_status           := COALESCE(p_patch->>'status',                     v_before.status);
  v_pre_sent         := COALESCE((p_patch->>'pre_materials_sent')::boolean,  v_before.pre_materials_sent);
  v_pre_sent_at      := COALESCE((p_patch->>'pre_materials_sent_at')::timestamptz, v_before.pre_materials_sent_at);

  -- 변경 키 집계
  IF v_scheduled_at    IS DISTINCT FROM v_before.scheduled_at        THEN v_changed := v_changed || 'scheduled_at'; END IF;
  IF v_duration_minutes IS DISTINCT FROM v_before.duration_minutes   THEN v_changed := v_changed || 'duration_minutes'; END IF;
  IF v_interview_type  IS DISTINCT FROM v_before.interview_type      THEN v_changed := v_changed || 'interview_type'; END IF;
  IF v_priority        IS DISTINCT FROM v_before.priority            THEN v_changed := v_changed || 'priority'; END IF;
  IF v_meeting_link    IS DISTINCT FROM v_before.meeting_link        THEN v_changed := v_changed || 'meeting_link'; END IF;
  IF v_google_event_id IS DISTINCT FROM v_before.google_event_id     THEN v_changed := v_changed || 'google_event_id'; END IF;
  IF v_location_info   IS DISTINCT FROM v_before.location_info       THEN v_changed := v_changed || 'location_info'; END IF;
  IF v_interviewer_ids IS DISTINCT FROM COALESCE(v_before.interviewer_ids, '[]'::jsonb)
                                                                      THEN v_changed := v_changed || 'interviewer_ids'; END IF;
  IF v_status          IS DISTINCT FROM v_before.status              THEN v_changed := v_changed || 'status'; END IF;
  IF v_pre_sent        IS DISTINCT FROM v_before.pre_materials_sent  THEN v_changed := v_changed || 'pre_materials_sent'; END IF;
  IF v_pre_sent_at     IS DISTINCT FROM v_before.pre_materials_sent_at THEN v_changed := v_changed || 'pre_materials_sent_at'; END IF;

  IF array_length(v_changed, 1) IS NULL THEN
    RAISE EXCEPTION '실제로 변경된 항목이 없습니다';
  END IF;

  -- Atomic update — interviewer_ids 는 jsonb 그대로
  UPDATE public.interview_schedules
     SET scheduled_at         = v_scheduled_at,
         duration_minutes     = v_duration_minutes,
         interview_type       = v_interview_type,
         priority             = v_priority,
         meeting_link         = v_meeting_link,
         google_event_id      = v_google_event_id,
         location_info        = v_location_info,
         interviewer_ids      = v_interviewer_ids,
         status               = v_status,
         pre_materials_sent   = v_pre_sent,
         pre_materials_sent_at = v_pre_sent_at,
         updated_at           = now()
   WHERE id = p_schedule_id
  RETURNING * INTO v_after;

  SELECT name, role INTO v_actor_name, v_actor_role
    FROM public.employees WHERE id = auth.uid() LIMIT 1;

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
  '면접 일정 안전 수정 RPC (125 fix — notes 컬럼 부재 + interviewer_ids jsonb 타입 정정).';
