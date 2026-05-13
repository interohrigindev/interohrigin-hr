-- 0513: tasks_update RLS 확장 — 프로젝트 참여자(매니저/리더/임원/담당자)도 작업 상태 토글 가능
-- 기존: assignee_id = auth.uid() OR is_admin()
-- 신규: + linked_board_id 가 가리키는 project_boards 의 manager/leader/executive/assignees 에 포함되면 허용

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;

CREATE POLICY "tasks_update" ON public.tasks
FOR UPDATE TO authenticated
USING (
  assignee_id = auth.uid()
  OR public.is_admin()
  OR (
    linked_board_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.project_boards pb
      WHERE pb.id = linked_board_id
        AND (
          auth.uid() = pb.manager_id
          OR auth.uid() = pb.leader_id
          OR auth.uid() = pb.executive_id
          OR auth.uid() = ANY (pb.assignee_ids)
        )
    )
  )
);

COMMENT ON POLICY "tasks_update" ON public.tasks IS
  'assignee 본인 + admin + 해당 작업이 속한 project_boards 참여자(매니저/리더/임원/담당자) 가 상태/내용 업데이트 가능';
