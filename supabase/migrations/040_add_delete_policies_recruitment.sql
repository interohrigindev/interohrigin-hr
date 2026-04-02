-- =====================================================================
-- 040: 채용 관련 테이블 DELETE RLS 정책 추가
-- 기존에 SELECT/INSERT만 있어서 관리자가 삭제 불가했던 문제 해결
-- =====================================================================

-- ai_accuracy_log
DROP POLICY IF EXISTS "ai_accuracy_log_delete" ON public.ai_accuracy_log;
CREATE POLICY "ai_accuracy_log_delete" ON public.ai_accuracy_log
  FOR DELETE TO authenticated USING (public.is_admin());

-- hiring_decisions
DROP POLICY IF EXISTS "hiring_decisions_delete" ON public.hiring_decisions;
CREATE POLICY "hiring_decisions_delete" ON public.hiring_decisions
  FOR DELETE TO authenticated USING (public.is_admin());

-- recruitment_reports
DROP POLICY IF EXISTS "recruitment_reports_delete" ON public.recruitment_reports;
CREATE POLICY "recruitment_reports_delete" ON public.recruitment_reports
  FOR DELETE TO authenticated USING (public.is_admin());

-- face_to_face_evals
DROP POLICY IF EXISTS "face_to_face_evals_delete" ON public.face_to_face_evals;
CREATE POLICY "face_to_face_evals_delete" ON public.face_to_face_evals
  FOR DELETE TO authenticated USING (public.is_admin());

-- voice_analysis
DROP POLICY IF EXISTS "voice_analysis_delete" ON public.voice_analysis;
CREATE POLICY "voice_analysis_delete" ON public.voice_analysis
  FOR DELETE TO authenticated USING (public.is_admin());

-- transcriptions
DROP POLICY IF EXISTS "transcriptions_delete" ON public.transcriptions;
CREATE POLICY "transcriptions_delete" ON public.transcriptions
  FOR DELETE TO authenticated USING (public.is_admin());

-- interview_recordings
DROP POLICY IF EXISTS "interview_recordings_delete" ON public.interview_recordings;
CREATE POLICY "interview_recordings_delete" ON public.interview_recordings
  FOR DELETE TO authenticated USING (public.is_admin());

-- interview_schedules
DROP POLICY IF EXISTS "interview_schedules_delete" ON public.interview_schedules;
CREATE POLICY "interview_schedules_delete" ON public.interview_schedules
  FOR DELETE TO authenticated USING (public.is_admin());

-- resume_analysis
DROP POLICY IF EXISTS "resume_analysis_delete" ON public.resume_analysis;
CREATE POLICY "resume_analysis_delete" ON public.resume_analysis
  FOR DELETE TO authenticated USING (public.is_admin());

-- candidates
DROP POLICY IF EXISTS "candidates_delete" ON public.candidates;
CREATE POLICY "candidates_delete" ON public.candidates
  FOR DELETE TO authenticated USING (public.is_admin());
