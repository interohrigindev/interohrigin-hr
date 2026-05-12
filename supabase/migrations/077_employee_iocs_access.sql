-- 0513: 직원별 IO CS (iocs-eys.pages.dev) 접근 권한 플래그
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS iocs_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.iocs_access IS 'IO CS 고객관리 플랫폼(iocs-eys.pages.dev) 접근 승인 여부. admin/director/division_head/ceo 는 본 플래그와 무관하게 항상 접근 가능.';
