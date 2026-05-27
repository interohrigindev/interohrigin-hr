-- 132: 수습 직원 평가 정책 정리 + safe_update_interview_schedule array append 버그 fix
--
-- 🚨 보고 (2026-05-27):
--   (1) 면접 일정 수정 시: ERROR malformed array literal: "scheduled_at"
--   (2) 김보미 팀장(수습)에게 유지혜 평가가 등록되어 강제묵 이사로 안 넘어감
--       → 정책: 수습 직원은 정규직 자기평가/팀원평가 대상에서 제외, 부서
--          leader 가 수습이면 leader 단계 자동 스킵 → director 단계 직진
--
-- ─── (1) safe_update_interview_schedule array append 버그 ─────────────
--   v_changed text[] 에 단일 문자열 concat 시도 시 PostgreSQL 이 문자열을
--   text[] 로 cast 시도 → "malformed array literal" 에러.
--   해결: array_append() 사용으로 통일 (또는 ARRAY['...']::text[] || ).
--
-- ─── (2) generate_evaluation_sheets / advance_evaluation_stage ────────
--   수습(employment_type='probation') 직원:
--     · 자기평가 대상 등록 자체 안 함 → 본인 평가 화면에 데이터 없음
--     · 사원의 leader 가 수습이면 자동 스킵 (074 의 leader 부재 케이스
--       와 동일 패턴 — director 단계로 직진)
--
-- ─── (3) 기존 잘못 등록된 데이터 정리 ─────────────────────────────────
--   현재 활성 평가 기간에 수습 직원의 evaluation_targets row 삭제
--   (이미 자기평가 데이터가 있는 경우는 보존 — INSERT 흔적은 무시)
--   그리고 부서에 수습 leader 만 있는 사원의 status='self_done' → 'leader_done'
--   자동 승격

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1) safe_update_interview_schedule — array append 버그 fix
-- ═══════════════════════════════════════════════════════════════════════
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

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) AS k(key)
    WHERE k.key <> ALL(v_allowed)
  ) THEN
    RAISE EXCEPTION '허용되지 않은 필드가 포함되어 있습니다: %',
      (SELECT array_agg(k.key)
         FROM jsonb_object_keys(p_patch) AS k(key)
        WHERE k.key <> ALL(v_allowed));
  END IF;

  SELECT * INTO v_before FROM public.interview_schedules
   WHERE id = p_schedule_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '면접 일정을 찾을 수 없습니다 (id=%). 다른 사용자가 삭제했을 수 있습니다.', p_schedule_id;
  END IF;

  v_scheduled_at     := COALESCE((p_patch->>'scheduled_at')::timestamptz, v_before.scheduled_at);
  v_duration_minutes := COALESCE((p_patch->>'duration_minutes')::int,    v_before.duration_minutes);
  v_interview_type   := COALESCE(p_patch->>'interview_type',             v_before.interview_type);
  v_priority         := COALESCE(p_patch->>'priority',                   v_before.priority);
  v_meeting_link     := COALESCE(p_patch->>'meeting_link',               v_before.meeting_link);
  v_google_event_id  := COALESCE(p_patch->>'google_event_id',            v_before.google_event_id);
  v_location_info    := COALESCE(p_patch->>'location_info',              v_before.location_info);
  v_interviewer_ids  := COALESCE(p_patch->'interviewer_ids',             COALESCE(v_before.interviewer_ids, '[]'::jsonb));
  v_status           := COALESCE(p_patch->>'status',                     v_before.status);
  v_pre_sent         := COALESCE((p_patch->>'pre_materials_sent')::boolean,  v_before.pre_materials_sent);
  v_pre_sent_at      := COALESCE((p_patch->>'pre_materials_sent_at')::timestamptz, v_before.pre_materials_sent_at);

  -- ★ array_append 사용 (132 fix — || 'string' 패턴이 malformed array literal 유발)
  IF v_scheduled_at     IS DISTINCT FROM v_before.scheduled_at        THEN v_changed := array_append(v_changed, 'scheduled_at'); END IF;
  IF v_duration_minutes IS DISTINCT FROM v_before.duration_minutes    THEN v_changed := array_append(v_changed, 'duration_minutes'); END IF;
  IF v_interview_type   IS DISTINCT FROM v_before.interview_type      THEN v_changed := array_append(v_changed, 'interview_type'); END IF;
  IF v_priority         IS DISTINCT FROM v_before.priority            THEN v_changed := array_append(v_changed, 'priority'); END IF;
  IF v_meeting_link     IS DISTINCT FROM v_before.meeting_link        THEN v_changed := array_append(v_changed, 'meeting_link'); END IF;
  IF v_google_event_id  IS DISTINCT FROM v_before.google_event_id     THEN v_changed := array_append(v_changed, 'google_event_id'); END IF;
  IF v_location_info    IS DISTINCT FROM v_before.location_info       THEN v_changed := array_append(v_changed, 'location_info'); END IF;
  IF v_interviewer_ids  IS DISTINCT FROM COALESCE(v_before.interviewer_ids, '[]'::jsonb)
                                                                       THEN v_changed := array_append(v_changed, 'interviewer_ids'); END IF;
  IF v_status           IS DISTINCT FROM v_before.status              THEN v_changed := array_append(v_changed, 'status'); END IF;
  IF v_pre_sent         IS DISTINCT FROM v_before.pre_materials_sent  THEN v_changed := array_append(v_changed, 'pre_materials_sent'); END IF;
  IF v_pre_sent_at      IS DISTINCT FROM v_before.pre_materials_sent_at THEN v_changed := array_append(v_changed, 'pre_materials_sent_at'); END IF;

  IF array_length(v_changed, 1) IS NULL THEN
    RAISE EXCEPTION '실제로 변경된 항목이 없습니다';
  END IF;

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
  '면접 일정 안전 수정 RPC (132 fix — array append 버그).';

-- ═══════════════════════════════════════════════════════════════════════
-- 2) generate_evaluation_sheets — 수습(probation) 직원 제외
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.generate_evaluation_sheets(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target_id   uuid;
  v_employee_id uuid;
  v_count       integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM evaluation_periods WHERE id = p_period_id) THEN
    RAISE EXCEPTION '평가 기간을 찾을 수 없습니다: %', p_period_id;
  END IF;

  -- 정규직 평가 대상자: employee/leader/hr_admin 중 employment_type 이
  -- 'probation' 이 아닌 직원만. 수습은 별도 수습평가(probation) 메뉴 사용.
  FOR v_employee_id IN
    SELECT id FROM employees
    WHERE is_active = true
      AND role IN ('employee', 'leader', 'hr_admin')
      AND COALESCE(employment_type, 'full_time') <> 'probation'
  LOOP
    INSERT INTO evaluation_targets (period_id, employee_id, status)
    VALUES (p_period_id, v_employee_id, 'pending')
    ON CONFLICT (period_id, employee_id) DO NOTHING
    RETURNING id INTO v_target_id;

    IF v_target_id IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_evaluation_sheets(uuid) TO authenticated;

COMMENT ON FUNCTION public.generate_evaluation_sheets(uuid) IS
  '평가 기간 생성 시 정규직 직원 자동 등록 (132: 수습 employment_type=probation 제외).';

-- ═══════════════════════════════════════════════════════════════════════
-- 3) advance_evaluation_stage — 부서 leader 가 수습이면 leader_done 자동 스킵
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.advance_evaluation_stage(p_target_id uuid, p_role text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_status   text;
  v_expected_status  text;
  v_next_status      text;
  v_total_items      integer;
  v_scored_items     integer;
  v_missing          integer;
  v_employee_role    text;
  v_employee_dept_id uuid;
  v_has_active_leader boolean;
  v_evaluator_id     uuid;
  v_total_execs      integer;
  v_evaluated_execs  integer;
BEGIN
  v_evaluator_id := auth.uid();

  SELECT status INTO v_current_status FROM evaluation_targets WHERE id = p_target_id;
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION '평가 대상을 찾을 수 없습니다: %', p_target_id;
  END IF;

  CASE p_role
    WHEN 'self'     THEN v_expected_status := 'pending';       v_next_status := 'self_done';
    WHEN 'leader'   THEN v_expected_status := 'self_done';     v_next_status := 'leader_done';
    WHEN 'director' THEN v_expected_status := 'leader_done';   v_next_status := 'director_done';
    WHEN 'ceo'      THEN v_expected_status := 'director_done'; v_next_status := 'ceo_done';
    ELSE RAISE EXCEPTION '잘못된 평가자 역할입니다: %', p_role;
  END CASE;

  IF v_current_status <> v_expected_status THEN
    RAISE EXCEPTION '현재 단계(%)에서 % 역할이 평가를 진행할 수 없습니다.', v_current_status, p_role;
  END IF;

  SELECT COUNT(*) INTO v_total_items FROM self_evaluations WHERE target_id = p_target_id;

  IF p_role = 'self' THEN
    SELECT COUNT(*) INTO v_scored_items
    FROM self_evaluations WHERE target_id = p_target_id AND score IS NOT NULL;
    v_missing := v_total_items - v_scored_items;
    IF v_missing > 0 THEN
      RAISE EXCEPTION '자기평가 미입력 항목이 %개 있습니다.', v_missing;
    END IF;
    UPDATE self_evaluations SET is_draft = false WHERE target_id = p_target_id;
  ELSE
    SELECT COUNT(*) INTO v_scored_items
    FROM evaluator_scores
    WHERE target_id = p_target_id
      AND evaluator_role = p_role
      AND evaluator_id = v_evaluator_id
      AND score IS NOT NULL;
    v_missing := v_total_items - v_scored_items;
    IF v_missing > 0 THEN
      RAISE EXCEPTION '% 평가 미입력 항목이 %개 있습니다.', p_role, v_missing;
    END IF;
    UPDATE evaluator_scores SET is_draft = false
    WHERE target_id = p_target_id
      AND evaluator_role = p_role
      AND evaluator_id = v_evaluator_id;
  END IF;

  IF p_role = 'director' THEN
    SELECT COUNT(*) INTO v_total_execs
    FROM employees
    WHERE role IN ('director','division_head') AND is_active = true
      AND COALESCE(employment_type, 'full_time') <> 'probation';

    SELECT COUNT(DISTINCT evaluator_id) INTO v_evaluated_execs
    FROM evaluator_scores
    WHERE target_id = p_target_id
      AND evaluator_role = 'director'
      AND score IS NOT NULL
      AND is_draft = false;

    IF v_evaluated_execs < v_total_execs THEN
      RETURN v_current_status;
    END IF;
  END IF;

  UPDATE evaluation_targets SET status = v_next_status WHERE id = p_target_id;

  -- 자기평가 제출 후 leader_done 자동 스킵 조건:
  --   (a) 본인이 leader/hr_admin (126 정책)
  --   (b) 부서에 활성+정규직 leader 가 없음 (074 + 132 정책 — probation 제외)
  IF p_role = 'self' AND v_next_status = 'self_done' THEN
    SELECT e.role, e.department_id
      INTO v_employee_role, v_employee_dept_id
    FROM evaluation_targets t
    JOIN employees e ON e.id = t.employee_id
    WHERE t.id = p_target_id;

    IF v_employee_role IN ('leader', 'hr_admin') THEN
      UPDATE evaluation_targets SET status = 'leader_done' WHERE id = p_target_id;
      RETURN 'leader_done';
    END IF;

    IF v_employee_dept_id IS NOT NULL THEN
      -- 132: leader 가 있어도 수습이면 정규직 평가자 부재로 간주
      SELECT EXISTS (
        SELECT 1 FROM employees
        WHERE department_id = v_employee_dept_id
          AND role = 'leader'
          AND is_active = true
          AND COALESCE(employment_type, 'full_time') <> 'probation'
      ) INTO v_has_active_leader;
      IF NOT v_has_active_leader THEN
        UPDATE evaluation_targets SET status = 'leader_done' WHERE id = p_target_id;
        RETURN 'leader_done';
      END IF;
    END IF;
  END IF;

  IF v_next_status = 'ceo_done' THEN
    PERFORM calculate_final_score(p_target_id);
    UPDATE evaluation_targets SET status = 'completed' WHERE id = p_target_id;
    RETURN 'completed';
  END IF;

  RETURN v_next_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_evaluation_stage(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.advance_evaluation_stage(uuid, text) IS
  '평가 단계 전이 RPC (132: 수습 leader 자동 스킵 + 수습 임원 제외).';

-- ═══════════════════════════════════════════════════════════════════════
-- 4) 백필 — 활성 평가 기간에 잘못 등록된 수습 직원 정리 + 사원 status 승격
-- ═══════════════════════════════════════════════════════════════════════
-- 4-1) 수습 직원의 evaluation_targets 삭제 (자기평가 데이터 자체 정리)
DELETE FROM self_evaluations
WHERE target_id IN (
  SELECT t.id FROM evaluation_targets t
  JOIN evaluation_periods p ON p.id = t.period_id
  JOIN employees e ON e.id = t.employee_id
  WHERE p.status = 'in_progress'
    AND COALESCE(e.employment_type, 'full_time') = 'probation'
);

DELETE FROM evaluator_scores
WHERE target_id IN (
  SELECT t.id FROM evaluation_targets t
  JOIN evaluation_periods p ON p.id = t.period_id
  JOIN employees e ON e.id = t.employee_id
  WHERE p.status = 'in_progress'
    AND COALESCE(e.employment_type, 'full_time') = 'probation'
);

DELETE FROM evaluator_comments
WHERE target_id IN (
  SELECT t.id FROM evaluation_targets t
  JOIN evaluation_periods p ON p.id = t.period_id
  JOIN employees e ON e.id = t.employee_id
  WHERE p.status = 'in_progress'
    AND COALESCE(e.employment_type, 'full_time') = 'probation'
);

DELETE FROM evaluation_targets t
USING evaluation_periods p, employees e
WHERE p.id = t.period_id
  AND e.id = t.employee_id
  AND p.status = 'in_progress'
  AND COALESCE(e.employment_type, 'full_time') = 'probation';

-- 4-2) 부서에 정규직 leader 가 없는 self_done 사원 → leader_done 자동 승격
--      (수습 leader 만 있는 부서의 자기평가 제출자 처리)
UPDATE evaluation_targets t
SET status = 'leader_done'
FROM employees e, evaluation_periods p
WHERE t.employee_id = e.id
  AND t.period_id = p.id
  AND p.status = 'in_progress'
  AND t.status = 'self_done'
  AND e.department_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM employees leader
    WHERE leader.department_id = e.department_id
      AND leader.role = 'leader'
      AND leader.is_active = true
      AND COALESCE(leader.employment_type, 'full_time') <> 'probation'
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- 적용 확인:
-- ═══════════════════════════════════════════════════════════════════════
-- (a) 김보미 evaluation_targets 삭제 확인
--   SELECT t.id, e.name, e.role, e.employment_type
--   FROM evaluation_targets t JOIN employees e ON e.id = t.employee_id
--   WHERE e.name = '김보미';
--   → 0 rows
--
-- (b) 유지혜 status 승격 확인 (수습 leader 만 있으므로 leader_done 으로)
--   SELECT t.status FROM evaluation_targets t
--   JOIN employees e ON e.id = t.employee_id
--   WHERE e.name = '유지혜';
--   → 'leader_done' (자동 승격됨)
--
-- (c) 면접 일정 수정 테스트 — array append 정상
-- ═══════════════════════════════════════════════════════════════════════
