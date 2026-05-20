-- 113: get_shared_candidate 확장 — 관리자 상세에 있는 모든 정보를 외부 공유 페이지에서도 볼 수 있도록
--
-- 추가/수정 항목:
--   * candidate.portfolio_files, portfolio_links — 포트폴리오 파일/링크
--   * candidate.pre_survey_analysis — 사전질의서 AI 분석
--   * candidate.pbd_survey_completed_at, pbd_survey_sent_at — v2 PBD 진행 상태
--   * job.ai_questions — 권장 면접 질문 (1차/2차 모두 보이도록)
--   * job.survey_template — 사전질의서 질문 텍스트 (Q+A 매칭용)
--   * pbd_response — v2 PBD 응답 (있을 경우)

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
  -- 1) 로그인 필수
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  -- 2) 권한 체크 — 임원/대표/관리자급만
  SELECT role INTO v_viewer_role
    FROM public.employees
   WHERE id = auth.uid()
   LIMIT 1;

  IF v_viewer_role IS NULL
     OR v_viewer_role NOT IN ('admin','hr_admin','ceo','director','division_head','executive') THEN
    RAISE EXCEPTION '권한이 없습니다 (임원/대표/관리자만 열람 가능)';
  END IF;

  -- 3) 링크 검증
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

  -- 사전질의서 템플릿 (질문 텍스트 매칭용) — 채용공고의 survey_template_id 우선,
  -- 일치 안 되면 응답한 question id 가 어디 템플릿에 있는지 전체 검색은 클라이언트에서 처리
  IF v_job.survey_template_id IS NOT NULL THEN
    SELECT to_jsonb(t.*) INTO v_survey_template
      FROM public.pre_survey_templates t WHERE id = v_job.survey_template_id;
  END IF;

  -- v2 PBD 응답 (있는 경우)
  IF v_cand.pbd_survey_token IS NOT NULL THEN
    -- pbd_surveys 또는 pbd_responses 테이블이 있다면 join — 없으면 NULL
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
  '외부 공유 링크용 — 지원자 상세의 모든 정보 (이력서/포트폴리오/사전질의서/면접 일정/면접관 코멘트/권장 질문) 반환.';
