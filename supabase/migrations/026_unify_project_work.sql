-- =====================================================================
-- 026: 프로젝트 & 업무 통합
-- tasks 테이블에 project_boards 연결 컬럼 추가
-- =====================================================================

-- tasks에 project_boards 연결
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS linked_board_id uuid REFERENCES public.project_boards(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_linked_board ON public.tasks(linked_board_id);
