-- 062_health_check_functions.sql
-- Phase 2 — 능동 헬스체크 자동 점검 함수
--   호출 결과를 health_checks 테이블에 자동 기록
--   문제 발견 시 maintenance_tasks 큐에 자동 등록 (관리자 검토용, 자동 보완 X)

-- ─── 헬퍼: 헬스체크 1건 기록 ──────────────────────────
CREATE OR REPLACE FUNCTION public.record_health_check(
  p_check_name text,
  p_status text,
  p_duration_ms int DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO health_checks (check_name, status, duration_ms, details, error_message)
  VALUES (p_check_name, p_status, p_duration_ms, p_details, p_error_message)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ─── 헬퍼: 관리자 검토 큐 등록 ─────────────────────────
CREATE OR REPLACE FUNCTION public.queue_maintenance_task(
  p_task_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_related_table text DEFAULT NULL,
  p_related_ids jsonb DEFAULT NULL,
  p_proposed_action text DEFAULT NULL,
  p_proposed_sql text DEFAULT NULL,
  p_severity text DEFAULT 'normal',
  p_detected_by text DEFAULT 'health_check'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  -- 동일 task_type + title 이 pending 상태면 새로 만들지 않고 무시 (중복 방지)
  IF EXISTS (
    SELECT 1 FROM maintenance_tasks
    WHERE task_type = p_task_type AND title = p_title AND status = 'pending'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO maintenance_tasks (
    task_type, title, description, related_table, related_ids,
    proposed_action, proposed_sql, severity, detected_by
  )
  VALUES (
    p_task_type, p_title, p_description, p_related_table, p_related_ids,
    p_proposed_action, p_proposed_sql, p_severity, p_detected_by
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ─── 메인 헬스체크 RPC ────────────────────────────────
-- 모든 점검을 실행하고 결과·문제를 자동 기록
CREATE OR REPLACE FUNCTION public.run_all_health_checks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_count int;
  v_orphans int;
  v_summary jsonb := '{}'::jsonb;
  v_issues int := 0;
BEGIN
  -- ─── 1. 활성 평가 기간 존재 ─────────────
  v_start := clock_timestamp();
  SELECT COUNT(*) INTO v_count FROM evaluation_periods WHERE is_active = true;
  IF v_count = 0 THEN
    PERFORM record_health_check('active_evaluation_period', 'warning',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int,
      jsonb_build_object('count', 0),
      '활성 평가 기간이 없습니다');
    PERFORM queue_maintenance_task(
      'no_active_period', '활성 평가 기간 없음',
      '현재 is_active=true 인 evaluation_periods 가 없어 평가 메뉴가 동작하지 않습니다.',
      'evaluation_periods', NULL,
      '관리자 화면에서 새 평가 기간을 만들거나 기존 기간을 활성화하세요.',
      NULL, 'high'
    );
    v_issues := v_issues + 1;
  ELSIF v_count > 1 THEN
    PERFORM record_health_check('active_evaluation_period', 'fail',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int,
      jsonb_build_object('count', v_count),
      '활성 평가 기간이 여러 개입니다 (정확히 1개여야 함)');
    v_issues := v_issues + 1;
  ELSE
    PERFORM record_health_check('active_evaluation_period', 'pass',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int, NULL, NULL);
  END IF;

  -- ─── 2. 평가 워크플로우 데이터 일관성 ──
  -- self_done 이상인데 자기평가 점수 없음
  v_start := clock_timestamp();
  SELECT COUNT(*) INTO v_orphans
  FROM evaluation_targets t
  WHERE t.status IN ('self_done','leader_done','director_done','ceo_done','completed')
    AND NOT EXISTS (SELECT 1 FROM self_evaluations WHERE target_id = t.id AND score IS NOT NULL AND is_draft = false);

  IF v_orphans > 0 THEN
    PERFORM record_health_check('orphan_self_done', 'warning',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int,
      jsonb_build_object('orphan_count', v_orphans),
      v_orphans || '건의 평가 대상이 status>=self_done 이지만 점수가 없거나 draft 상태입니다');
    PERFORM queue_maintenance_task(
      'orphan_self_done',
      '자기평가 status 와 점수 불일치 ' || v_orphans || '건',
      'evaluation_targets.status 가 self_done 이상인데 self_evaluations 점수가 없거나 is_draft=true 인 케이스. RLS 거부 또는 데이터 정합성 깨짐 가능.',
      'evaluation_targets', NULL,
      '아래 SQL 로 영향 대상 확인 후 수동 보완.',
      'SELECT t.id, e.name FROM evaluation_targets t JOIN employees e ON e.id = t.employee_id WHERE t.status IN (''self_done'',''leader_done'',''director_done'',''ceo_done'',''completed'') AND NOT EXISTS (SELECT 1 FROM self_evaluations WHERE target_id = t.id AND score IS NOT NULL AND is_draft = false);',
      'high'
    );
    v_issues := v_issues + 1;
  ELSE
    PERFORM record_health_check('orphan_self_done', 'pass',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int, NULL, NULL);
  END IF;

  -- ─── 3. job_posting 없는 active 후보자 ──
  v_start := clock_timestamp();
  SELECT COUNT(*) INTO v_orphans
  FROM candidates c
  WHERE c.job_posting_id IS NULL AND c.status NOT IN ('rejected','hired');

  IF v_orphans > 0 THEN
    PERFORM record_health_check('orphan_candidates', 'warning',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int,
      jsonb_build_object('orphan_count', v_orphans), NULL);
    PERFORM queue_maintenance_task(
      'orphan_candidates',
      '공고 없는 진행 중인 지원자 ' || v_orphans || '건',
      '채용공고가 삭제되었거나 NULL 인 지원자가 진행 중 상태로 남아있습니다.',
      'candidates', NULL,
      '관리자 화면에서 해당 지원자를 다른 공고로 이동하거나 거절 처리하세요.',
      'SELECT id, name, email, status FROM candidates WHERE job_posting_id IS NULL AND status NOT IN (''rejected'',''hired'');',
      'normal'
    );
    v_issues := v_issues + 1;
  ELSE
    PERFORM record_health_check('orphan_candidates', 'pass',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int, NULL, NULL);
  END IF;

  -- ─── 4. 마이그레이션 적용 상태 (포트폴리오 컬럼) ─
  v_start := clock_timestamp();
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'candidates' AND column_name = 'portfolio_files'
  ) THEN
    PERFORM record_health_check('migration_060_check', 'fail',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int, NULL,
      'migration 060 (portfolio_files) 가 적용되지 않았습니다');
    v_issues := v_issues + 1;
  ELSE
    PERFORM record_health_check('migration_060_check', 'pass',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int, NULL, NULL);
  END IF;

  -- ─── 5. 휴면 사용자 / 이메일 미설정 ─────
  v_start := clock_timestamp();
  SELECT COUNT(*) INTO v_orphans
  FROM employees WHERE is_active = true AND (email IS NULL OR email = '');
  IF v_orphans > 0 THEN
    PERFORM record_health_check('employee_no_email', 'warning',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int,
      jsonb_build_object('count', v_orphans),
      v_orphans || '명의 활성 직원이 이메일 미설정');
    v_issues := v_issues + 1;
  ELSE
    PERFORM record_health_check('employee_no_email', 'pass',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int, NULL, NULL);
  END IF;

  -- ─── 6. 인사담당(hr_admin) 존재 ────────
  v_start := clock_timestamp();
  SELECT COUNT(*) INTO v_count FROM employees WHERE role = 'hr_admin' AND is_active = true;
  IF v_count = 0 THEN
    PERFORM record_health_check('hr_admin_present', 'warning',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int, NULL,
      '연차 결재라인의 인사담당 단계 담당자가 없습니다');
    PERFORM queue_maintenance_task(
      'no_hr_admin', '인사담당 역할 직원 없음',
      '연차 결재라인의 2단계(인사담당) 가 자동 배정되지 않습니다. 직원 한 명에게 role=''hr_admin'' 을 지정하세요.',
      'employees', NULL,
      '권한 설정에서 인사담당 직원의 역할을 ''인사담당'' 으로 변경.',
      NULL, 'high'
    );
    v_issues := v_issues + 1;
  ELSE
    PERFORM record_health_check('hr_admin_present', 'pass',
      EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int, NULL, NULL);
  END IF;

  v_summary := jsonb_build_object(
    'total_checks', 6,
    'issues_found', v_issues,
    'ran_at', now()
  );

  RETURN v_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_all_health_checks TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_health_check TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_maintenance_task TO authenticated;
