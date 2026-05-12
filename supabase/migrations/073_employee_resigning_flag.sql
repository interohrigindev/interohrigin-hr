-- 0512 미팅: 퇴사 예정자 플래그 — '나의 인수인계' 메뉴 조건부 노출용
-- 인사팀이 직원을 퇴사 예정자로 표시 → 해당 직원에게만 인수인계 메뉴 노출

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS is_resigning boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resigning_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS planned_exit_date date;

COMMENT ON COLUMN public.employees.is_resigning IS '퇴사 예정자 여부 — true 면 본인에게 인수인계 메뉴 노출';
COMMENT ON COLUMN public.employees.resigning_marked_at IS '퇴사 예정 표시 시점';
COMMENT ON COLUMN public.employees.planned_exit_date IS '예정 퇴사일 (선택)';

CREATE INDEX IF NOT EXISTS idx_employees_is_resigning ON public.employees(is_resigning) WHERE is_resigning = true;
