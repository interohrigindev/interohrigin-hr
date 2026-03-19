-- =====================================================================
-- 034: 남은 department FK도 SET NULL로 통일
-- =====================================================================

-- talent_profiles.department_id
ALTER TABLE public.talent_profiles
  DROP CONSTRAINT IF EXISTS talent_profiles_department_id_fkey;
ALTER TABLE public.talent_profiles
  ADD CONSTRAINT talent_profiles_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id)
  ON DELETE SET NULL;

-- projects.department_id (work management)
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_department_id_fkey;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id)
  ON DELETE SET NULL;

-- ojt_programs.department_id
ALTER TABLE public.ojt_programs
  DROP CONSTRAINT IF EXISTS ojt_programs_department_id_fkey;
ALTER TABLE public.ojt_programs
  ADD CONSTRAINT ojt_programs_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id)
  ON DELETE SET NULL;
