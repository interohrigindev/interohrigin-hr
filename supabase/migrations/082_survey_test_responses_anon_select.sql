-- 0514: 사전질의서 v2.0 — 결과 공개 페이지(로그인 불필요)용 SELECT 정책 확장
-- 기존: admin/hr_admin/임원/대표 만 SELECT 가능
-- 신규: anon 도 SELECT 가능 (DELETE 는 여전히 admin 만 가능 → 데이터 안전)
-- 사유: 1차 테스트 응답을 외부 관계자에게 공유해서 검토받기 위함
-- 위험도: 응답 자체에 주민번호/연락처 등은 수집하지 않으므로 노출 영향 낮음

DROP POLICY IF EXISTS "survey_test_select" ON public.survey_test_responses;
CREATE POLICY "survey_test_select" ON public.survey_test_responses
FOR SELECT TO anon, authenticated
USING (true);

COMMENT ON POLICY "survey_test_select" ON public.survey_test_responses IS
  '1차 테스트 응답 결과는 공개 공유용 페이지에서 anon 도 조회 가능 (DELETE 는 admin 전용)';
