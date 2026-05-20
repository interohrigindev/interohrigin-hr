-- 111: 결재 회수 기능 (P1-#3)
--   - 신청자 본인이 결재 전송 후 회수 가능
--   - 조건: 어떤 결재자도 아직 액션(approved/rejected) 하지 않은 상태
--   - 처리: status='withdrawn', completed_at=now, audit 기록

CREATE OR REPLACE FUNCTION public.withdraw_approval(p_doc_id uuid, p_reason text DEFAULT NULL)
RETURNS TABLE (ok boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc record;
  v_acted_count integer;
BEGIN
  -- 문서 조회
  SELECT id, requester_id, status, doc_type, doc_number, title
    INTO v_doc
  FROM public.approval_documents
  WHERE id = p_doc_id;

  IF v_doc.id IS NULL THEN
    RETURN QUERY SELECT false, '문서를 찾을 수 없습니다';
    RETURN;
  END IF;

  -- 본인 확인
  IF v_doc.requester_id <> auth.uid() THEN
    RETURN QUERY SELECT false, '본인만 회수할 수 있습니다';
    RETURN;
  END IF;

  -- 상태 확인
  IF v_doc.status NOT IN ('draft', 'submitted', 'in_review') THEN
    RETURN QUERY SELECT false, format('현재 상태(%s)에서는 회수할 수 없습니다', v_doc.status);
    RETURN;
  END IF;

  -- 결재자 액션 여부
  SELECT COUNT(*) INTO v_acted_count
  FROM public.approval_steps
  WHERE document_id = p_doc_id
    AND action IS NOT NULL
    AND action <> 'pending';

  IF v_acted_count > 0 THEN
    RETURN QUERY SELECT false, '이미 결재가 진행된 문서는 회수할 수 없습니다';
    RETURN;
  END IF;

  -- 회수 처리
  UPDATE public.approval_documents
  SET status = 'withdrawn',
      completed_at = now()
  WHERE id = p_doc_id;

  -- 모든 step 을 cancelled 로 표시
  UPDATE public.approval_steps
  SET action = 'cancelled', comment = COALESCE(p_reason, '신청자 회수'), acted_at = now()
  WHERE document_id = p_doc_id;

  -- 감사 로그
  PERFORM public.log_audit(
    'withdraw', 'approval_document', p_doc_id::text,
    NULL, NULL,
    format('결재 회수 — %s (%s)%s', v_doc.title, v_doc.doc_number,
           CASE WHEN p_reason IS NOT NULL THEN format(' / 사유: %s', p_reason) ELSE '' END)
  );

  RETURN QUERY SELECT true, '회수 완료';
END;
$$;

GRANT EXECUTE ON FUNCTION public.withdraw_approval(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.withdraw_approval(uuid, text) IS
  '결재 회수 — 신청자 본인 + 결재자 액션 없음 조건. status=withdrawn 으로 변경.';
