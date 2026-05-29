-- 138_shared_ai_recommended_questions.sql
-- ─────────────────────────────────────────────────────────────────────
-- #5: 지원자 공유 링크에서 "AI 권장 면접 질문" 새로고침/직접수정 → 지원자 단위 영구 저장
--   · 현재 AI 권장 질문은 job_postings.ai_questions(공고 단위). 공고 원본은 보존.
--   · 지원자별 override 를 candidates.ai_recommended_questions(jsonb 배열) 에 저장.
--     null  → 공고 기본 질문(job.ai_questions) 사용
--     배열  → 해당 지원자에 한해 override
--   · 외부 링크는 로그인(채용 작성 권한) 필요 → SECURITY DEFINER + 토큰 검증으로 저장.
-- candidates 테이블은 ALTER 금지 대상 아님 (금지: employees/evaluations/evaluation_items/users).
-- ─────────────────────────────────────────────────────────────────────
BEGIN;

-- 1) 지원자별 AI 권장 질문 override 컬럼
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS ai_recommended_questions jsonb;

COMMENT ON COLUMN public.candidates.ai_recommended_questions IS
  '#5: 지원자별 AI 권장 면접 질문 override (jsonb 문자열 배열). null=공고 기본(job_postings.ai_questions) 사용.';

-- 2) get_shared_candidate — candidate 객체에 ai_recommended_questions 추가 (123 본문 + 1필드)
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
      'ai_recommended_questions', v_cand.ai_recommended_questions,
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
  '외부 공유 링크용 — 123 + ai_recommended_questions(지원자별 AI 권장 질문 override, #5).';

-- 3) set_shared_ai_questions — 외부 공유 링크에서 지원자 AI 권장 질문 저장 (수정/새로고침)
DROP FUNCTION IF EXISTS public.set_shared_ai_questions(text, jsonb);
CREATE OR REPLACE FUNCTION public.set_shared_ai_questions(
  p_token     text,
  p_questions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.candidate_share_links%ROWTYPE;
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

  -- 형식 검증 (문자열 배열)
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN
    RAISE EXCEPTION '질문 형식이 올바르지 않습니다 (배열 필요)';
  END IF;

  UPDATE public.candidates
     SET ai_recommended_questions = p_questions
   WHERE id = v_link.candidate_id;

  RETURN jsonb_build_object('ok', true, 'ai_recommended_questions', p_questions);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_shared_ai_questions(text, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.set_shared_ai_questions(text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.set_shared_ai_questions(text, jsonb) IS
  '#5: 외부 공유 링크에서 지원자별 AI 권장 면접 질문 저장 (수정/새로고침, 작성자=채용 권한자).';

COMMIT;
