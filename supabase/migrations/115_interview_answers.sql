-- 115: 면접 질문별 답변 기록
--
-- 목적:
--   면접 진행 중 면접관이 각 질문(공고 ai_questions / 2차 맞춤 second_interview_questions)에
--   답변을 기재하여 기록을 남길 수 있도록 한다.
--   관리자 페이지(candidate-report)와 외부 공유 페이지(candidate-share) 양쪽에서 입력 가능.
--
-- 데이터 구조:
--   candidates.interview_answers jsonb
--     → 객체 형태: { "ai:0": "답변 텍스트", "ai:1": "...", "second:0": "..." }
--     → key 규칙: "{type}:{index}", type ∈ {ai, second}, index = 0-based
--
-- RPC 변경:
--   * get_shared_candidate 재정의 — 응답에 interview_answers 포함
--   * save_shared_interview_answer 신규 — 외부 공유 페이지에서 답변 저장

-- 1) 컬럼 추가 (멱등)
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS interview_answers jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.candidates.interview_answers IS
  '면접 질문별 답변 기록 — key 형식 "{ai|second}:{index}", value 답변 텍스트.';

-- 2) get_shared_candidate 재정의 (114 정의에 interview_answers 추가)
DROP FUNCTION IF EXISTS public.get_shared_candidate(text);

CREATE OR REPLACE FUNCTION public.get_shared_candidate(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link   public.candidate_share_links%ROWTYPE;
  v_cand   public.candidates%ROWTYPE;
  v_job    public.job_postings%ROWTYPE;
  v_dept_name text;
  v_resume public.resume_analysis%ROWTYPE;
  v_survey_template jsonb;
  v_pbd_response jsonb;
  v_schedules jsonb;
  v_result jsonb;
  v_viewer_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT role INTO v_viewer_role
    FROM public.employees
   WHERE id = auth.uid()
   LIMIT 1;

  IF v_viewer_role IS NULL
     OR v_viewer_role NOT IN ('admin','hr_admin','ceo','director','division_head','executive') THEN
    RAISE EXCEPTION '권한이 없습니다 (임원/대표/관리자만 열람 가능)';
  END IF;

  SELECT * INTO v_link FROM public.candidate_share_links WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION '링크를 찾을 수 없습니다'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION '비활성화된 링크입니다'; END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION '만료된 링크입니다';
  END IF;

  SELECT * INTO v_cand FROM public.candidates WHERE id = v_link.candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION '지원자 정보가 없습니다'; END IF;

  SELECT * INTO v_job FROM public.job_postings WHERE id = v_cand.job_posting_id;

  IF v_job.department_id IS NOT NULL THEN
    SELECT name INTO v_dept_name FROM public.departments WHERE id = v_job.department_id;
  END IF;

  SELECT * INTO v_resume FROM public.resume_analysis WHERE candidate_id = v_cand.id ORDER BY analyzed_at DESC LIMIT 1;

  IF v_job.survey_template_id IS NOT NULL THEN
    SELECT to_jsonb(t.*) INTO v_survey_template
      FROM public.pre_survey_templates t WHERE id = v_job.survey_template_id;
  END IF;

  IF v_cand.pbd_survey_token IS NOT NULL THEN
    BEGIN
      SELECT to_jsonb(p.*) INTO v_pbd_response
        FROM public.pbd_surveys p
       WHERE p.token = v_cand.pbd_survey_token
       LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
      v_pbd_response := NULL;
    END;
  END IF;

  SELECT COALESCE(jsonb_agg(s ORDER BY s.scheduled_at DESC), '[]'::jsonb)
    INTO v_schedules
    FROM public.interview_schedules s
   WHERE s.candidate_id = v_cand.id;

  UPDATE public.candidate_share_links
     SET last_viewed_at = now(), view_count = view_count + 1
   WHERE id = v_link.id;

  v_result := jsonb_build_object(
    'candidate', jsonb_build_object(
      'id', v_cand.id,
      'name', v_cand.name,
      'email', v_cand.email,
      'phone', v_cand.phone,
      'status', v_cand.status,
      'source_channel', v_cand.source_channel,
      'resume_url', v_cand.resume_url,
      'cover_letter_text', v_cand.cover_letter_text,
      'cover_letter_url', v_cand.cover_letter_url,
      'portfolio_files', COALESCE(v_cand.portfolio_files, '[]'::jsonb),
      'portfolio_links', COALESCE(v_cand.portfolio_links, '[]'::jsonb),
      'pre_survey_data', v_cand.pre_survey_data,
      'pre_survey_analysis', v_cand.pre_survey_analysis,
      'metadata', v_cand.metadata,
      'interviewer_comments', v_cand.interviewer_comments,
      'talent_match_score', v_cand.talent_match_score,
      'pbd_survey_sent_at', v_cand.pbd_survey_sent_at,
      'pbd_survey_completed_at', v_cand.pbd_survey_completed_at,
      'second_interview_questions', v_cand.second_interview_questions,
      'second_interview_questions_generated_at', v_cand.second_interview_questions_generated_at,
      'interview_answers', COALESCE(v_cand.interview_answers, '{}'::jsonb),
      'created_at', v_cand.created_at
    ),
    'job', CASE WHEN v_job.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_job.id,
      'title', v_job.title,
      'department', v_dept_name,
      'position', v_job.position,
      'employment_type', v_job.employment_type,
      'ai_questions', COALESCE(v_job.ai_questions, '[]'::jsonb)
    ) END,
    'survey_template', v_survey_template,
    'pbd_response', v_pbd_response,
    'resume_analysis', CASE WHEN v_resume.id IS NULL THEN NULL ELSE jsonb_build_object(
      'ai_summary', v_resume.ai_summary,
      'strengths', v_resume.strengths,
      'weaknesses', v_resume.weaknesses,
      'position_fit', v_resume.position_fit,
      'organization_fit', v_resume.organization_fit,
      'recommendation', v_resume.recommendation
    ) END,
    'interview_schedules', v_schedules
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_shared_candidate(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_shared_candidate(text) TO authenticated;

COMMENT ON FUNCTION public.get_shared_candidate(text) IS
  '외부 공유 링크용 — 지원자 상세 모든 정보 + 면접 질문/답변 반환.';

-- 3) save_shared_interview_answer 신규 — 외부 공유 페이지에서 답변 저장
DROP FUNCTION IF EXISTS public.save_shared_interview_answer(text, text, text);

CREATE OR REPLACE FUNCTION public.save_shared_interview_answer(
  p_token  text,
  p_key    text,   -- "ai:0", "second:1" 등
  p_answer text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link   public.candidate_share_links%ROWTYPE;
  v_viewer_role text;
  v_updated_answers jsonb;
BEGIN
  -- 1) 로그인 + 권한 (113 RPC 동일 정책)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT role INTO v_viewer_role
    FROM public.employees
   WHERE id = auth.uid()
   LIMIT 1;

  IF v_viewer_role IS NULL
     OR v_viewer_role NOT IN ('admin','hr_admin','ceo','director','division_head','executive') THEN
    RAISE EXCEPTION '권한이 없습니다 (임원/대표/관리자만 답변 입력 가능)';
  END IF;

  -- 2) 링크 검증
  SELECT * INTO v_link FROM public.candidate_share_links WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION '링크를 찾을 수 없습니다'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION '비활성화된 링크입니다'; END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION '만료된 링크입니다';
  END IF;

  -- 3) key 형식 검증 (XSS/주입 방지 — 단순 패턴 체크)
  IF p_key IS NULL OR p_key !~ '^(ai|second):[0-9]+$' THEN
    RAISE EXCEPTION '잘못된 질문 키 형식입니다 (예: ai:0, second:1)';
  END IF;

  -- 4) 답변 업데이트 (jsonb_set: 빈 문자열이면 키 제거)
  IF p_answer IS NULL OR length(trim(p_answer)) = 0 THEN
    UPDATE public.candidates
       SET interview_answers = COALESCE(interview_answers, '{}'::jsonb) - p_key
     WHERE id = v_link.candidate_id
     RETURNING interview_answers INTO v_updated_answers;
  ELSE
    UPDATE public.candidates
       SET interview_answers = jsonb_set(
             COALESCE(interview_answers, '{}'::jsonb),
             ARRAY[p_key],
             to_jsonb(p_answer::text),
             true
           )
     WHERE id = v_link.candidate_id
     RETURNING interview_answers INTO v_updated_answers;
  END IF;

  RETURN jsonb_build_object('ok', true, 'interview_answers', v_updated_answers);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_shared_interview_answer(text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.save_shared_interview_answer(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.save_shared_interview_answer(text, text, text) IS
  '외부 공유 페이지에서 면접 질문별 답변 저장 (관리자/임원 권한 필요).';
