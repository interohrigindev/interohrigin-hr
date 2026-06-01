-- 145: 김보미 3회차 CEO 평가를 2회차로 이동 (데이터 보정)
-- 사고 경위 (2026-06-01):
--   김보미 2회차 D-day 인 상황에서 대표이사가 모바일 페이지로 평가 진입 →
--   회차 dropdown 에서 round3 잘못 선택 → 평가 저장
--   당시 코드: 관리자/CEO 는 "회차 미도래" confirm 자동 우회 (probation.tsx:460)
-- 후속 코드 수정:
--   - probation.tsx handleSaveEval: 미도래 회차 hard block (관리자 포함)
--   - probation.tsx 회차 dropdown: 미도래 회차 옵션 자체를 노출하지 않음
--   - probation.tsx 모바일 UI: D-day/D-7 자동 펼침 카드로 재구성
--
-- 본 마이그레이션은 1회성 데이터 보정 (idempotent — 두 번 실행해도 안전).
-- UNIQUE (employee_id, stage, evaluator_id, evaluator_role) 제약과
-- 기존 2회차 CEO 평가 충돌 가능성을 사전 검사 후 이동.

BEGIN;

DO $$
DECLARE
  v_emp_id uuid;
  v_eval_count int;
  v_round2_ceo_exists int;
  v_evaluator_name text;
BEGIN
  -- 1. 김보미 employee_id 조회 (이름 동명이인 가드)
  SELECT id INTO v_emp_id
  FROM public.employees
  WHERE name = '김보미'
    AND employment_type = 'probation'
    AND is_active = true
  LIMIT 1;

  IF v_emp_id IS NULL THEN
    RAISE NOTICE '[skip] 김보미 (수습) 직원을 찾을 수 없습니다. 마이그레이션 건너뜀.';
    RETURN;
  END IF;

  -- 2. 김보미 round3 CEO 평가 존재 확인
  SELECT count(*) INTO v_eval_count
  FROM public.probation_evaluations
  WHERE employee_id = v_emp_id
    AND stage = 'round3'
    AND evaluator_role = 'ceo';

  IF v_eval_count = 0 THEN
    RAISE NOTICE '[skip] 김보미 round3 CEO 평가가 없습니다 (이미 보정되었거나 사고가 없었음).';
    RETURN;
  END IF;

  -- 3. 기존 round2 CEO 평가 충돌 검사 (동일 evaluator_id 인 경우 UPDATE 시 UNIQUE 위반)
  SELECT count(*) INTO v_round2_ceo_exists
  FROM public.probation_evaluations pe3
  JOIN public.probation_evaluations pe2
    ON pe2.employee_id = pe3.employee_id
   AND pe2.evaluator_id = pe3.evaluator_id
   AND pe2.evaluator_role = 'ceo'
   AND pe2.stage = 'round2'
  WHERE pe3.employee_id = v_emp_id
    AND pe3.stage = 'round3'
    AND pe3.evaluator_role = 'ceo';

  IF v_round2_ceo_exists > 0 THEN
    RAISE EXCEPTION '[abort] 김보미 round2 CEO 평가가 이미 존재 — 수동 확인 필요 (관리자에게 문의)';
  END IF;

  -- 4. 평가자 이름 (로그용)
  SELECT e.name INTO v_evaluator_name
  FROM public.probation_evaluations pe
  JOIN public.employees e ON e.id = pe.evaluator_id
  WHERE pe.employee_id = v_emp_id
    AND pe.stage = 'round3'
    AND pe.evaluator_role = 'ceo'
  LIMIT 1;

  -- 5. 이동 실행 (round3 → round2)
  UPDATE public.probation_evaluations
  SET stage = 'round2',
      updated_at = now()
  WHERE employee_id = v_emp_id
    AND stage = 'round3'
    AND evaluator_role = 'ceo';

  RAISE NOTICE '[ok] 김보미 (id=%) round3 CEO 평가(평가자=%) → round2 이동 완료 (%건)',
    v_emp_id, COALESCE(v_evaluator_name, '미상'), v_eval_count;
END $$;

COMMIT;

-- 검증 쿼리 (수동 확인용):
-- SELECT pe.stage, pe.evaluator_role, e.name as evaluator, pe.updated_at
-- FROM public.probation_evaluations pe
-- JOIN public.employees emp ON emp.id = pe.employee_id
-- LEFT JOIN public.employees e ON e.id = pe.evaluator_id
-- WHERE emp.name = '김보미'
-- ORDER BY pe.stage, pe.evaluator_role;
