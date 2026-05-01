-- 065: 새 지원자 접수 시 알림 수신자 조회 RPC
-- 사용처: 공개 지원 페이지(/apply/:postingId) 에서 submit 직후 알림 메일 발송 대상 조회

CREATE OR REPLACE FUNCTION public.get_candidate_notification_recipients(p_job_posting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job  public.job_postings%ROWTYPE;
  v_recipients jsonb := '[]'::jsonb;
  v_creator_email text;
  v_admin_emails jsonb;
BEGIN
  SELECT * INTO v_job FROM public.job_postings WHERE id = p_job_posting_id;
  IF NOT FOUND THEN RETURN v_recipients; END IF;

  -- 1) 공고에 명시된 contact_email
  IF v_job.contact_email IS NOT NULL AND length(trim(v_job.contact_email)) > 0 THEN
    v_recipients := v_recipients || jsonb_build_array(jsonb_build_object(
      'email', v_job.contact_email,
      'name', COALESCE(v_job.contact_name, '담당자'),
      'role', 'contact'
    ));
  END IF;

  -- 2) 공고 작성자(created_by) 의 이메일
  IF v_job.created_by IS NOT NULL THEN
    SELECT email INTO v_creator_email FROM public.employees WHERE id = v_job.created_by AND email IS NOT NULL;
    IF v_creator_email IS NOT NULL AND v_creator_email <> COALESCE(v_job.contact_email, '') THEN
      v_recipients := v_recipients || jsonb_build_array(jsonb_build_object(
        'email', v_creator_email,
        'name', '공고 담당자',
        'role', 'creator'
      ));
    END IF;
  END IF;

  -- 3) hr_admin 역할 직원들 (전사 채용 담당자)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('email', email, 'name', name, 'role', 'hr_admin')), '[]'::jsonb)
    INTO v_admin_emails
    FROM public.employees
   WHERE role = 'hr_admin' AND email IS NOT NULL AND status = 'active';

  v_recipients := v_recipients || v_admin_emails;

  RETURN jsonb_build_object(
    'job_title', v_job.title,
    'recipients', v_recipients
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_candidate_notification_recipients(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_candidate_notification_recipients(uuid) IS '새 지원자 접수 알림 메일 수신자 목록 (공고 담당자 + hr_admin)';
