-- 116: 면접 답변/코멘트 atomic RPC 4종
--
-- 목적:
--   관리자 페이지와 외부 공유 페이지 양쪽에서 동일한 candidates row 의
--   interview_answers (jsonb) / interviewer_comments (jsonb[]) 를 변경할 수 있다.
--   클라이언트가 전체 객체/배열을 통째로 덮어쓰는 기존 방식은 동시 편집 시
--   변경 손실(lost update) 가 발생하므로, 모든 변경을 row-level lock 기반
--   atomic RPC 로 통일한다.
--
-- 신규 RPC:
--   * save_interview_answer(p_candidate_id, p_key, p_answer)        — 관리자 답변 저장
--   * add_interviewer_comment(p_candidate_id, p_content)             — 관리자 코멘트 추가
--   * add_shared_interviewer_comment(p_token, p_content)             — 외부 공유 코멘트 추가
--   * delete_interviewer_comment(p_candidate_id, p_comment_id)       — 코멘트 삭제 (id 기반)
--
-- 공통 권한:
--   employees.role ∈ (admin, hr_admin, ceo, director, division_head, executive)
--   외부 RPC 는 추가로 candidate_share_links 활성/만료 검증
--
-- 코멘트 구조:
--   { id: uuid, author_id: uuid, author_name: text, content: text, created_at: timestamptz }
--   기존 데이터는 id 가 없을 수 있어 RPC 가 자동으로 부여(없으면 gen_random_uuid).

-- ─── 헬퍼: 권한 체크 (관리자/임원만) ──────────────────────────────
CREATE OR REPLACE FUNCTION public._check_recruitment_writer_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  SELECT role INTO v_role FROM public.employees WHERE id = auth.uid() LIMIT 1;
  IF v_role IS NULL
     OR v_role NOT IN ('admin','hr_admin','ceo','director','division_head','executive') THEN
    RAISE EXCEPTION '권한이 없습니다 (임원/대표/관리자만 가능)';
  END IF;
END;
$$;

-- ─── 헬퍼: 코멘트 배열 정규화 (id 누락 시 자동 부여) ──────────────
CREATE OR REPLACE FUNCTION public._normalize_interviewer_comments(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF v_item ? 'id' AND (v_item->>'id') IS NOT NULL AND length(v_item->>'id') > 0 THEN
      v_out := v_out || jsonb_build_array(v_item);
    ELSE
      v_out := v_out || jsonb_build_array(v_item || jsonb_build_object('id', gen_random_uuid()::text));
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

-- ─── 1) save_interview_answer (관리자) ───────────────────────────
DROP FUNCTION IF EXISTS public.save_interview_answer(uuid, text, text);

CREATE OR REPLACE FUNCTION public.save_interview_answer(
  p_candidate_id uuid,
  p_key          text,
  p_answer       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current jsonb;
  v_new     jsonb;
BEGIN
  PERFORM public._check_recruitment_writer_role();

  IF p_key IS NULL OR p_key !~ '^(ai|second):[0-9]+$' THEN
    RAISE EXCEPTION '잘못된 질문 키 형식입니다 (예: ai:0, second:1)';
  END IF;

  -- row lock 후 atomic 수정
  SELECT COALESCE(interview_answers, '{}'::jsonb) INTO v_current
    FROM public.candidates
   WHERE id = p_candidate_id
     FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION '지원자를 찾을 수 없습니다'; END IF;

  IF p_answer IS NULL OR length(trim(p_answer)) = 0 THEN
    v_new := v_current - p_key;
  ELSE
    v_new := jsonb_set(v_current, ARRAY[p_key], to_jsonb(p_answer::text), true);
  END IF;

  UPDATE public.candidates SET interview_answers = v_new WHERE id = p_candidate_id;

  RETURN jsonb_build_object('ok', true, 'interview_answers', v_new);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_interview_answer(uuid, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.save_interview_answer(uuid, text, text) TO authenticated;

-- ─── 2) add_interviewer_comment (관리자) ─────────────────────────
DROP FUNCTION IF EXISTS public.add_interviewer_comment(uuid, text);

CREATE OR REPLACE FUNCTION public.add_interviewer_comment(
  p_candidate_id uuid,
  p_content      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current   jsonb;
  v_new_entry jsonb;
  v_new_list  jsonb;
  v_name      text;
BEGIN
  PERFORM public._check_recruitment_writer_role();

  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION '코멘트 내용을 입력하세요';
  END IF;

  SELECT name INTO v_name FROM public.employees WHERE id = auth.uid();

  SELECT public._normalize_interviewer_comments(COALESCE(interviewer_comments, '[]'::jsonb))
    INTO v_current
    FROM public.candidates
   WHERE id = p_candidate_id
     FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION '지원자를 찾을 수 없습니다'; END IF;

  v_new_entry := jsonb_build_object(
    'id',          gen_random_uuid()::text,
    'author_id',   auth.uid()::text,
    'author_name', COALESCE(v_name, '관리자'),
    'content',     trim(p_content),
    'created_at',  now()
  );

  v_new_list := v_current || jsonb_build_array(v_new_entry);

  UPDATE public.candidates SET interviewer_comments = v_new_list WHERE id = p_candidate_id;

  RETURN jsonb_build_object('ok', true, 'interviewer_comments', v_new_list);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_interviewer_comment(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.add_interviewer_comment(uuid, text) TO authenticated;

-- ─── 3) add_shared_interviewer_comment (외부 공유) ───────────────
DROP FUNCTION IF EXISTS public.add_shared_interviewer_comment(text, text);

CREATE OR REPLACE FUNCTION public.add_shared_interviewer_comment(
  p_token   text,
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
  v_new_entry jsonb;
  v_new_list  jsonb;
  v_name      text;
BEGIN
  PERFORM public._check_recruitment_writer_role();

  SELECT * INTO v_link FROM public.candidate_share_links WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION '링크를 찾을 수 없습니다'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION '비활성화된 링크입니다'; END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION '만료된 링크입니다';
  END IF;

  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION '코멘트 내용을 입력하세요';
  END IF;

  SELECT name INTO v_name FROM public.employees WHERE id = auth.uid();

  SELECT public._normalize_interviewer_comments(COALESCE(interviewer_comments, '[]'::jsonb))
    INTO v_current
    FROM public.candidates
   WHERE id = v_link.candidate_id
     FOR UPDATE;

  v_new_entry := jsonb_build_object(
    'id',          gen_random_uuid()::text,
    'author_id',   auth.uid()::text,
    'author_name', COALESCE(v_name, '외부 면접관'),
    'content',     trim(p_content),
    'created_at',  now()
  );

  v_new_list := v_current || jsonb_build_array(v_new_entry);

  UPDATE public.candidates SET interviewer_comments = v_new_list WHERE id = v_link.candidate_id;

  RETURN jsonb_build_object('ok', true, 'interviewer_comments', v_new_list);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_shared_interviewer_comment(text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.add_shared_interviewer_comment(text, text) TO authenticated;

-- ─── 4) delete_interviewer_comment (관리자, id 기반) ─────────────
DROP FUNCTION IF EXISTS public.delete_interviewer_comment(uuid, text);

CREATE OR REPLACE FUNCTION public.delete_interviewer_comment(
  p_candidate_id uuid,
  p_comment_id   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current  jsonb;
  v_new_list jsonb := '[]'::jsonb;
  v_item     jsonb;
BEGIN
  PERFORM public._check_recruitment_writer_role();

  SELECT public._normalize_interviewer_comments(COALESCE(interviewer_comments, '[]'::jsonb))
    INTO v_current
    FROM public.candidates
   WHERE id = p_candidate_id
     FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION '지원자를 찾을 수 없습니다'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_current) LOOP
    -- 본인 작성 코멘트만 삭제 허용 (author_id 일치)
    IF (v_item->>'id') = p_comment_id THEN
      IF (v_item->>'author_id') <> auth.uid()::text THEN
        RAISE EXCEPTION '본인이 작성한 코멘트만 삭제할 수 있습니다';
      END IF;
      -- skip (delete)
    ELSE
      v_new_list := v_new_list || jsonb_build_array(v_item);
    END IF;
  END LOOP;

  UPDATE public.candidates SET interviewer_comments = v_new_list WHERE id = p_candidate_id;

  RETURN jsonb_build_object('ok', true, 'interviewer_comments', v_new_list);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_interviewer_comment(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.delete_interviewer_comment(uuid, text) TO authenticated;
