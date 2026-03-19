-- =====================================================================
-- 033: FK CASCADE 정책 보강
-- 부서 삭제 시 연관 레코드가 블로킹되지 않도록 SET NULL 적용
-- project_boards.department 기본값 제거
-- =====================================================================

-- ─── 1. employees.department_id: NO ACTION → SET NULL ─────────────
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_department_id_fkey;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id)
  ON DELETE SET NULL;

-- ─── 2. job_postings.department_id: NO ACTION → SET NULL ──────────
ALTER TABLE public.job_postings
  DROP CONSTRAINT IF EXISTS job_postings_department_id_fkey;
ALTER TABLE public.job_postings
  ADD CONSTRAINT job_postings_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id)
  ON DELETE SET NULL;

-- ─── 3. hiring_decisions.offered_department_id → SET NULL ─────────
ALTER TABLE public.hiring_decisions
  DROP CONSTRAINT IF EXISTS hiring_decisions_offered_department_id_fkey;
ALTER TABLE public.hiring_decisions
  ADD CONSTRAINT hiring_decisions_offered_department_id_fkey
  FOREIGN KEY (offered_department_id) REFERENCES public.departments(id)
  ON DELETE SET NULL;

-- ─── 4. talent_profiles.department_id → SET NULL ──────────────────
ALTER TABLE public.talent_profiles
  DROP CONSTRAINT IF EXISTS talent_profiles_department_id_fkey;
ALTER TABLE public.talent_profiles
  ADD CONSTRAINT talent_profiles_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id)
  ON DELETE SET NULL;

-- ─── 5. projects.department_id → SET NULL ─────────────────────────
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_department_id_fkey;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id)
  ON DELETE SET NULL;

-- ─── 6. ojt_programs.department_id → SET NULL ─────────────────────
ALTER TABLE public.ojt_programs
  DROP CONSTRAINT IF EXISTS ojt_programs_department_id_fkey;
ALTER TABLE public.ojt_programs
  ADD CONSTRAINT ojt_programs_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id)
  ON DELETE SET NULL;

-- ─── 7. project_boards.department 기본값 제거 ─────────────────────
ALTER TABLE public.project_boards
  ALTER COLUMN department DROP DEFAULT;
