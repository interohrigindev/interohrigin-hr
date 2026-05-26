-- 122: get_shared_candidate RPC — 118의 직무 상세 확장 + 121의 PBD v2 fix 통합 (회귀 복구)
--
-- 회귀 사고:
--   121 이 114 정의를 base 로 PBD 부분만 정정하다가, 그 사이에 있던 118 (공유 페이지
--   직무 상세 + 유입경로 노출) 의 모든 확장 필드를 덮어쓰는 회귀가 발생.
--   → 공유 페이지에서 직무 description/requirements/preferred 등이 다시 사라짐.
--
-- 본 마이그레이션:
--   118 전체 정의를 그대로 복원 + 121 에서 추가한 PBD 부분만 survey_test_responses 기반으로 정정.
--   누락 없이 모든 누적 확장을 통합한 최종본.
--
-- 누적 변경 이력:
--   113: 초기 통합 응답 (포트폴리오, 사전질의서, 면접 일정 등)
--   114: 2차 면접 맞춤 질문 (second_interview_questions)
--   118: 직무 상세 (description/requirements/preferred 등) + source_detail + interview_answers
--   121: PBD 응답 → survey_test_responses 매칭 (하지만 118 확장을 덮어씀 = 본 122 로 복구)

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

  -- v2 PBD 응답 — 실제 저장 테이블은 survey_test_responses (097 마이그레이션 candidate_id 컬럼)
  -- candidate_id 로 매칭. 같은 후보가 여러 번 응답 가능하면 최신 1건.
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
  '외부 공유 링크용 — 지원자 + 직무 상세(118) + 유입경로(118) + 면접 답변(118) + 2차 맞춤 질문(114) + PBD v2 응답(survey_test_responses, 122 fix) 일괄 반환.';
