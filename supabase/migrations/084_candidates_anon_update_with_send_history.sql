-- 0514: 사전질의서 응답 RLS 정책 확장
-- 기존 정책은 status = 'survey_sent' 일 때만 anon update 허용.
-- 사전질의서가 옵션 발송으로 변경된 후 handleSendSurvey 가 status 를 변경하지 않게 되어,
-- 지원자가 응답 제출 시 RLS 가 silent reject → 0 row 만 영향받고 DB 에 저장 안 되는 문제가 있었음.
-- 해결: invite_token 이 있고 사전질의서 발송 이력이 1회 이상이면 anon 이 update 가능하도록 확장.

DROP POLICY IF EXISTS "candidates_update_anon_survey" ON public.candidates;

CREATE POLICY "candidates_update_anon_survey" ON public.candidates
FOR UPDATE TO anon
USING (
  invite_token IS NOT NULL AND (
    status = 'survey_sent'
    OR jsonb_array_length(COALESCE(survey_send_history, '[]'::jsonb)) > 0
  )
)
WITH CHECK (invite_token IS NOT NULL);

COMMENT ON POLICY "candidates_update_anon_survey" ON public.candidates IS
  '사전질의서 응답 제출 — invite_token 보유 + (status=survey_sent OR 발송 이력 ≥ 1회)';
