-- =====================================================================
-- 039: 프로젝트 보드 역할 컬럼 추가 (담당자/리더/이사)
-- =====================================================================

ALTER TABLE public.project_boards
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS leader_id uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS executive_id uuid REFERENCES public.employees(id);

COMMENT ON COLUMN public.project_boards.manager_id IS '프로젝트 담당자 (실무 담당)';
COMMENT ON COLUMN public.project_boards.leader_id IS '프로젝트 리더 (팀장)';
COMMENT ON COLUMN public.project_boards.executive_id IS '프로젝트 이사 (임원 책임)';

CREATE INDEX IF NOT EXISTS idx_project_boards_manager ON public.project_boards(manager_id);
CREATE INDEX IF NOT EXISTS idx_project_boards_leader ON public.project_boards(leader_id);
CREATE INDEX IF NOT EXISTS idx_project_boards_executive ON public.project_boards(executive_id);
