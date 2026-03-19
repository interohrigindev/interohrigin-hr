-- =====================================================================
-- 025: project_updates UPDATE RLS 정책 추가
-- 타부서 요청 상태 변경(수락/완료/반려)을 위해 필요
-- =====================================================================

CREATE POLICY "project_updates_update" ON public.project_updates
  FOR UPDATE TO authenticated USING (true);
