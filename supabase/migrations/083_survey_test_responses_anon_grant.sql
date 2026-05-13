-- 0514: 사전질의서 v2.0 — anon 역할에 SELECT GRANT 부여
-- 082 에서 RLS 정책으로 anon SELECT 허용은 했으나, 테이블 자체의 GRANT 가 없으면
-- Supabase 가 0 row 를 반환함 → 공개 결과 페이지가 빈 화면으로 보이는 원인.
-- INSERT 는 081 에서 이미 anon 에 부여됨 (응답 페이지가 동작 중이므로).

GRANT SELECT ON public.survey_test_responses TO anon;
GRANT SELECT ON public.survey_test_responses TO authenticated;
