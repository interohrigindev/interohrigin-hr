-- 097: 사전질의서 v2.0 (PBD) — 지원자 연결 컬럼/토큰 추가
-- 목적: candidate ↔ survey_test_responses 매칭 + 토큰 기반 발송

BEGIN;

-- 1) candidates: PBD 발송/완료 추적 + 토큰
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS pbd_survey_token text,
  ADD COLUMN IF NOT EXISTS pbd_survey_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS pbd_survey_completed_at timestamptz;

-- 토큰 유일성 (NULL 다중 허용)
CREATE UNIQUE INDEX IF NOT EXISTS candidates_pbd_survey_token_uidx
  ON public.candidates (pbd_survey_token)
  WHERE pbd_survey_token IS NOT NULL;

-- 2) survey_test_responses: candidate 연결
ALTER TABLE public.survey_test_responses
  ADD COLUMN IF NOT EXISTS candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS survey_test_responses_candidate_id_idx
  ON public.survey_test_responses (candidate_id);

-- 3) 토큰으로 candidate 조회 (anon 도 가능 — 응답 페이지에서 토큰 검증용)
CREATE OR REPLACE FUNCTION public.get_candidate_by_pbd_token(p_token text)
RETURNS TABLE(id uuid, name text, email text, job_posting_id uuid, completed_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT c.id, c.name, c.email, c.job_posting_id, c.pbd_survey_completed_at
  FROM public.candidates c
  WHERE c.pbd_survey_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_candidate_by_pbd_token(text) TO anon, authenticated;

-- 4) 응답 완료 처리 (anon 도 호출 가능 — 토큰 검증 후 candidates 업데이트)
CREATE OR REPLACE FUNCTION public.complete_pbd_survey(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cand_id uuid;
BEGIN
  SELECT id INTO v_cand_id
  FROM public.candidates
  WHERE pbd_survey_token = p_token
  LIMIT 1;

  IF v_cand_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.candidates
     SET pbd_survey_completed_at = now(),
         status = CASE
           WHEN status IN ('applied','resume_reviewed','survey_sent') THEN 'survey_done'
           ELSE status  -- 후속 단계 이미 진행됐으면 status 유지
         END
   WHERE id = v_cand_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_pbd_survey(text) TO anon, authenticated;

COMMIT;
