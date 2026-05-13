-- 0513: pipeline_stages 삭제 권한 확장 — admin + 프로젝트 담당자(manager) 허용
-- 기존: is_admin() 만 → 일반 사용자가 삭제 시 RLS silently 거부

DROP POLICY IF EXISTS "pipeline_stages_delete" ON public.pipeline_stages;

CREATE POLICY "pipeline_stages_delete" ON public.pipeline_stages
FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.project_boards pb
    WHERE pb.id = project_id
      AND pb.manager_id = auth.uid()
  )
);

COMMENT ON POLICY "pipeline_stages_delete" ON public.pipeline_stages IS
  '관리자(admin) + 해당 프로젝트의 담당자(manager_id) 만 단계 삭제 가능';
