-- 046_add_probation_employment_type.sql
-- employment_type CHECK 제약조건에 'probation'(수습) 추가

-- employees 테이블
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_employment_type_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_employment_type_check
  CHECK (employment_type IS NULL OR employment_type IN ('full_time', 'contract', 'intern', 'part_time', 'probation'));

-- job_postings 테이블 (채용공고)
ALTER TABLE public.job_postings
  DROP CONSTRAINT IF EXISTS job_postings_employment_type_check;

ALTER TABLE public.job_postings
  ADD CONSTRAINT job_postings_employment_type_check
  CHECK (employment_type IN ('full_time', 'contract', 'intern', 'part_time', 'probation'));
