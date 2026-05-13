-- 0513: project_updates.stage_id FK 를 ON DELETE SET NULL 로 변경
-- 기존: REFERENCES pipeline_stages(id) (기본 NO ACTION → 단계 삭제 시 FK 위반으로 차단)
-- 신규: REFERENCES pipeline_stages(id) ON DELETE SET NULL (단계 삭제 시 stage_id 만 NULL, 업데이트 이력은 보존)

ALTER TABLE public.project_updates
  DROP CONSTRAINT IF EXISTS project_updates_stage_id_fkey;

ALTER TABLE public.project_updates
  ADD CONSTRAINT project_updates_stage_id_fkey
  FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;

COMMENT ON CONSTRAINT project_updates_stage_id_fkey ON public.project_updates IS
  '단계가 삭제되어도 업데이트 이력은 보존하고 stage_id 만 NULL 로 설정';
