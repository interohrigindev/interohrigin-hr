-- 089_employee_probation_lifecycle.sql
-- 수습 라이프사이클 추적 컬럼 추가
--  - probation_completed_at : 수습 종료일 (관리자가 통과/탈락 처리한 시점 또는 직접 입력)
--  - probation_result        : 수습 결과 (passed / failed / pending / null)
--  - converted_to_regular_at : 정규직 전환일

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS probation_completed_at date,
  ADD COLUMN IF NOT EXISTS probation_result text,
  ADD COLUMN IF NOT EXISTS converted_to_regular_at date;

-- CHECK 제약 (NULL 허용)
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_probation_result_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_probation_result_check
  CHECK (probation_result IS NULL OR probation_result IN ('passed', 'failed', 'pending'));

COMMENT ON COLUMN public.employees.probation_completed_at IS '수습 종료일 (통과/탈락 처리한 날짜 또는 수습 기간 종료일)';
COMMENT ON COLUMN public.employees.probation_result IS '수습 결과 — passed(통과/정규직 전환) / failed(탈락/계약 종료) / pending(보류) / null(미처리)';
COMMENT ON COLUMN public.employees.converted_to_regular_at IS '정규직 전환일 (passed 처리 시 자동 기록)';

CREATE INDEX IF NOT EXISTS idx_employees_probation_result
  ON public.employees(probation_result)
  WHERE probation_result IS NOT NULL;
