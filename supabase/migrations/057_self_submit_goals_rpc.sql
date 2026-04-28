-- 057_self_submit_goals_rpc.sql
-- 목적: 직원 본인이 자기평가 목표설정을 제출할 때 evaluation_targets.goals_submitted 를
--       업데이트할 수 있도록 SECURITY DEFINER RPC 추가.
--       (기존 RLS 'target_update_admin' 은 admin만 UPDATE 허용 → 직원이 silent block 당함)

DROP FUNCTION IF EXISTS public.submit_self_goals(uuid);
CREATE OR REPLACE FUNCTION public.submit_self_goals(p_target_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_status      text;
  v_period_id   uuid;
  v_locked      boolean;
BEGIN
  -- 본인의 평가 대상인지 확인
  SELECT employee_id, status, period_id
    INTO v_employee_id, v_status, v_period_id
  FROM evaluation_targets WHERE id = p_target_id;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION '평가 대상을 찾을 수 없습니다: %', p_target_id;
  END IF;

  IF v_employee_id <> auth.uid() THEN
    RAISE EXCEPTION '본인의 평가 대상이 아닙니다.';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION '이미 진행된 평가입니다 (status=%).', v_status;
  END IF;

  -- 해당 기간이 잠겨 있으면 거부
  SELECT is_locked INTO v_locked FROM evaluation_periods WHERE id = v_period_id;
  IF COALESCE(v_locked, false) THEN
    RAISE EXCEPTION '평가 기간이 잠겨 있어 제출할 수 없습니다.';
  END IF;

  -- goals_submitted 플래그 업데이트
  UPDATE evaluation_targets
    SET goals_submitted = true,
        goals_submitted_at = now()
    WHERE id = p_target_id;

  RETURN json_build_object(
    'target_id', p_target_id,
    'goals_submitted', true,
    'goals_submitted_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_self_goals(uuid) TO authenticated;
