-- ============================================================
-- 044: candidates 테이블 anon 사용자 RLS 정책 추가
-- ============================================================
-- 설문 페이지(/survey/:token)는 비로그인(anon) 상태에서 접근.
-- 기존 정책은 authenticated(관리자)만 SELECT/UPDATE 허용하므로,
-- anon 사용자가 invite_token으로 자기 데이터를 조회·수정할 수 없었음.
-- → survey_done 상태 업데이트 실패 → 면접일정에 지원자 미표시
-- ============================================================

-- 1) anon SELECT: invite_token이 있는 지원자만 조회 가능
CREATE POLICY "candidates_select_anon_survey" ON public.candidates
  FOR SELECT TO anon
  USING (invite_token IS NOT NULL);

-- 2) anon UPDATE: 설문 완료 시 자기 데이터 업데이트 허용
--    survey_sent 상태인 지원자만 업데이트 가능 (범위 제한)
CREATE POLICY "candidates_update_anon_survey" ON public.candidates
  FOR UPDATE TO anon
  USING (invite_token IS NOT NULL AND status = 'survey_sent')
  WITH CHECK (invite_token IS NOT NULL);
