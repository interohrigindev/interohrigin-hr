-- 0513: 사전질의서 v2.0 테스트 응답 저장 테이블
-- 관리자/임원 1차 테스트 후 실제 채용에 반영하기 위한 비공개 시범 응답 저장소
-- 응답 자체는 누구나 (anon 포함) insert 가능하나, 결과 조회는 admin/임원만 가능

CREATE TABLE IF NOT EXISTS public.survey_test_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tester_name text NOT NULL,
  tester_email text,
  tester_role text, -- 자유 입력 (관리자/임원/직원 등)
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,        -- Q1~Q5 (채널/지원분야/전직장/출근일/희망연봉)
  consent jsonb NOT NULL DEFAULT '{}'::jsonb,     -- Q6~Q9 (서류/경업금지/운전/녹화동의)
  pbd_answers jsonb NOT NULL DEFAULT '{}'::jsonb, -- {P01: 3, P02: 4, ...}
  scores jsonb,                                   -- 채점 결과 (서버측 저장 안 함, 표시용은 클라이언트 계산)
  feedback text,                                  -- 테스트 응답자가 남기는 의견/개선점
  duration_seconds int,                           -- 소요 시간
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS survey_test_responses_created_at_idx
  ON public.survey_test_responses (created_at DESC);

ALTER TABLE public.survey_test_responses ENABLE ROW LEVEL SECURITY;

-- INSERT: 누구나 가능 (테스트 페이지는 비로그인 접근)
DROP POLICY IF EXISTS "survey_test_insert" ON public.survey_test_responses;
CREATE POLICY "survey_test_insert" ON public.survey_test_responses
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- SELECT: admin / hr_admin / director / division_head / ceo 만 결과 조회 가능
DROP POLICY IF EXISTS "survey_test_select" ON public.survey_test_responses;
CREATE POLICY "survey_test_select" ON public.survey_test_responses
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('hr_admin', 'director', 'division_head', 'ceo')
  )
);

-- DELETE: admin 만
DROP POLICY IF EXISTS "survey_test_delete" ON public.survey_test_responses;
CREATE POLICY "survey_test_delete" ON public.survey_test_responses
FOR DELETE TO authenticated
USING (public.is_admin());

COMMENT ON TABLE public.survey_test_responses IS
  '사전질의서 v2.0 1차 테스트 응답 저장 — 관리자/임원 시범 응답 검토용';
