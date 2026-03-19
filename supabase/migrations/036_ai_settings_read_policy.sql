-- =====================================================================
-- 036: ai_settings SELECT 정책 — 인증된 사용자 모두 읽기 허용
-- 기존: is_admin()만 ALL 가능 → 직원이 AI 설정 조회 불가
-- 변경: SELECT는 모든 인증 사용자 허용 (api_key 노출은 기존 패턴과 동일)
-- =====================================================================

CREATE POLICY "ai_settings_select_authenticated"
  ON public.ai_settings
  FOR SELECT TO authenticated
  USING (true);
