-- 064: 지원자 외부 공유 읽기전용 링크
-- 용도: 대표님 등 외부 인원에게 지원자 정보를 로그인 없이 열람할 수 있는 링크 발급

CREATE TABLE IF NOT EXISTS public.candidate_share_links (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  token         text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at    timestamptz,                 -- NULL = 만료 없음
  is_active     boolean     NOT NULL DEFAULT true,
  note          text,                        -- 메모 (예: "대표님 검토용")
  created_by    uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz,
  view_count    integer     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_candidate_share_links_candidate ON public.candidate_share_links(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_share_links_token ON public.candidate_share_links(token);

ALTER TABLE public.candidate_share_links ENABLE ROW LEVEL SECURITY;

-- 관리자만 생성/조회/수정
DROP POLICY IF EXISTS candidate_share_links_admin_all ON public.candidate_share_links;
CREATE POLICY candidate_share_links_admin_all ON public.candidate_share_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','hr_admin','ceo','director','division_head')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','hr_admin','ceo','director','division_head')
    )
  );

-- 외부 공유 링크로 지원자 정보 조회 RPC (RLS 우회 + 토큰 검증)
CREATE OR REPLACE FUNCTION public.get_shared_candidate(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link  public.candidate_share_links%ROWTYPE;
  v_cand  public.candidates%ROWTYPE;
  v_job   public.job_postings%ROWTYPE;
  v_resume public.resume_analysis%ROWTYPE;
  v_schedules jsonb;
  v_result jsonb;
BEGIN
  SELECT * INTO v_link FROM public.candidate_share_links WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION '링크를 찾을 수 없습니다'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION '비활성화된 링크입니다'; END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION '만료된 링크입니다';
  END IF;

  SELECT * INTO v_cand FROM public.candidates WHERE id = v_link.candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION '지원자 정보가 없습니다'; END IF;

  SELECT * INTO v_job FROM public.job_postings WHERE id = v_cand.job_posting_id;
  SELECT * INTO v_resume FROM public.resume_analysis WHERE candidate_id = v_cand.id ORDER BY analyzed_at DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(s ORDER BY s.scheduled_at DESC), '[]'::jsonb)
    INTO v_schedules
    FROM public.interview_schedules s
   WHERE s.candidate_id = v_cand.id;

  -- 조회 카운트 갱신
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
      'pre_survey_data', v_cand.pre_survey_data,
      'metadata', v_cand.metadata,
      'interviewer_comments', v_cand.interviewer_comments,
      'created_at', v_cand.created_at
    ),
    'job', CASE WHEN v_job.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_job.id,
      'title', v_job.title,
      'department', v_job.department,
      'job_type', v_job.job_type
    ) END,
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

GRANT EXECUTE ON FUNCTION public.get_shared_candidate(text) TO anon, authenticated;

COMMENT ON TABLE public.candidate_share_links IS '지원자 외부 공유 링크 (로그인 없이 읽기전용 열람)';
COMMENT ON FUNCTION public.get_shared_candidate(text) IS '공유 토큰으로 지원자 정보 조회 (RLS 우회, 만료/비활성 검증)';
