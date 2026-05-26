-- 123: 면접 답변 — 작성자 기록 + 누적 이력 (공유 페이지 명시 저장 모드)
--
-- 사용자 요청:
--   공유 링크의 면접 질문 입력란에서 자동저장 제거.
--   로그인된 세션으로 입력 후 '저장' 버튼 클릭 시 답변이 아래에 누적되고
--   누가 입력했는지 확인 가능해야 함.
--
-- 설계:
--   기존 candidates.interview_answers (Record<key, string>) 는 그대로 보존 (legacy).
--   신규 candidates.interview_answer_entries (Record<key, Array<Entry>>) 컬럼 신설.
--   Entry: { id, author_id, author_name, author_role, content, created_at }
--
-- get_shared_candidate RPC 에도 새 필드를 응답에 포함시킨다 (122 base 위에 재정의).

BEGIN;

-- 1) 신규 컬럼 — 누적 답변 이력
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS interview_answer_entries jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.candidates.interview_answer_entries IS
  '면접 질문별 답변 이력 — { "ai:0": [{id, author_id, author_name, author_role, content, created_at}, ...] }';

-- 2) add_shared_interview_answer — 외부 공유 페이지에서 답변 추가 (누적, 인증된 사용자)
DROP FUNCTION IF EXISTS public.add_shared_interview_answer(text, text, text);

CREATE OR REPLACE FUNCTION public.add_shared_interview_answer(
  p_token   text,
  p_key     text,
  p_content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link      public.candidate_share_links%ROWTYPE;
  v_current   jsonb;
  v_key_arr   jsonb;
  v_new_entry jsonb;
  v_new_arr   jsonb;
  v_new_root  jsonb;
  v_name      text;
  v_role      text;
BEGIN
  -- 권한 (관리자/임원/대표만)
  PERFORM public._check_recruitment_writer_role();

  -- 토큰 검증
  SELECT * INTO v_link FROM public.candidate_share_links WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION '링크를 찾을 수 없습니다'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION '비활성화된 링크입니다'; END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION '만료된 링크입니다';
  END IF;

  -- 키 형식 검증 (ai:N / second:N 만 허용)
  IF p_key IS NULL OR p_key !~ '^(ai|second):[0-9]+$' THEN
    RAISE EXCEPTION '잘못된 질문 키 형식입니다 (예: ai:0, second:1)';
  END IF;

  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION '답변 내용을 입력하세요';
  END IF;

  -- 작성자 정보
  SELECT name, role INTO v_name, v_role
    FROM public.employees WHERE id = auth.uid() LIMIT 1;

  -- row lock 후 entries 갱신
  SELECT COALESCE(interview_answer_entries, '{}'::jsonb)
    INTO v_current
    FROM public.candidates
   WHERE id = v_link.candidate_id
     FOR UPDATE;

  v_key_arr := COALESCE(v_current -> p_key, '[]'::jsonb);
  IF jsonb_typeof(v_key_arr) <> 'array' THEN
    v_key_arr := '[]'::jsonb;
  END IF;

  v_new_entry := jsonb_build_object(
    'id',          gen_random_uuid()::text,
    'author_id',   auth.uid()::text,
    'author_name', COALESCE(v_name, '외부 면접관'),
    'author_role', COALESCE(v_role, ''),
    'content',     trim(p_content),
    'created_at',  now()
  );

  v_new_arr  := v_key_arr || jsonb_build_array(v_new_entry);
  v_new_root := jsonb_set(v_current, ARRAY[p_key], v_new_arr, true);

  UPDATE public.candidates
     SET interview_answer_entries = v_new_root
   WHERE id = v_link.candidate_id;

  RETURN jsonb_build_object('ok', true, 'interview_answer_entries', v_new_root);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_shared_interview_answer(text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.add_shared_interview_answer(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.add_shared_interview_answer(text, text, text) IS
  '외부 공유 페이지에서 면접 답변을 누적 추가 (작성자 자동 기록). 자동저장이 아닌 명시 저장 모드.';

-- 3) delete_shared_interview_answer — 본인이 작성한 답변만 삭제
DROP FUNCTION IF EXISTS public.delete_shared_interview_answer(text, text, text);

CREATE OR REPLACE FUNCTION public.delete_shared_interview_answer(
  p_token    text,
  p_key      text,
  p_entry_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link     public.candidate_share_links%ROWTYPE;
  v_current  jsonb;
  v_key_arr  jsonb;
  v_new_arr  jsonb := '[]'::jsonb;
  v_item     jsonb;
  v_new_root jsonb;
BEGIN
  PERFORM public._check_recruitment_writer_role();

  SELECT * INTO v_link FROM public.candidate_share_links WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION '링크를 찾을 수 없습니다'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION '비활성화된 링크입니다'; END IF;

  SELECT COALESCE(interview_answer_entries, '{}'::jsonb)
    INTO v_current
    FROM public.candidates
   WHERE id = v_link.candidate_id
     FOR UPDATE;

  v_key_arr := COALESCE(v_current -> p_key, '[]'::jsonb);

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_key_arr) LOOP
    IF (v_item->>'id') = p_entry_id THEN
      IF (v_item->>'author_id') <> auth.uid()::text THEN
        RAISE EXCEPTION '본인이 작성한 답변만 삭제할 수 있습니다';
      END IF;
      -- skip (delete)
    ELSE
      v_new_arr := v_new_arr || jsonb_build_array(v_item);
    END IF;
  END LOOP;

  v_new_root := jsonb_set(v_current, ARRAY[p_key], v_new_arr, true);

  UPDATE public.candidates
     SET interview_answer_entries = v_new_root
   WHERE id = v_link.candidate_id;

  RETURN jsonb_build_object('ok', true, 'interview_answer_entries', v_new_root);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_shared_interview_answer(text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.delete_shared_interview_answer(text, text, text) TO authenticated;

-- 4) get_shared_candidate 재정의 — 122 base 위에 interview_answer_entries 추가
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

  -- v2 PBD 응답 — survey_test_responses (122 fix)
  SELECT to_jsonb(p.*) INTO v_pbd_response
    FROM public.survey_test_responses p
   WHERE p.candidate_id = v_cand.id
   ORDER BY p.created_at DESC
   LIMIT 1;

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
      'source_detail',  v_cand.source_detail,
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
      'interview_answer_entries', COALESCE(v_cand.interview_answer_entries, '{}'::jsonb),
      'created_at', v_cand.created_at
    ),
    'job', CASE WHEN v_job.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',              v_job.id,
      'title',           v_job.title,
      'department',      v_dept_name,
      'position',        v_job.position,
      'employment_type', v_job.employment_type,
      'experience_level',v_job.experience_level,
      'headcount',       v_job.headcount,
      'salary_range',    v_job.salary_range,
      'location',        v_job.location,
      'work_hours',      v_job.work_hours,
      'description',     v_job.description,
      'requirements',    v_job.requirements,
      'preferred',       v_job.preferred,
      'benefits',        v_job.benefits,
      'hiring_process',  v_job.hiring_process,
      'company_intro',   v_job.company_intro,
      'team_intro',      v_job.team_intro,
      'ai_questions',    COALESCE(v_job.ai_questions, '[]'::jsonb)
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
  '외부 공유 링크용 — 122 + interview_answer_entries(누적 면접 답변, 작성자 기록).';

COMMIT;
