-- ============================================================
-- 042: Fix approval RLS infinite recursion
-- ============================================================
-- 문제: approval_documents SELECT 정책이 approval_steps를 참조하고,
--       approval_steps SELECT 정책이 approval_documents를 참조하여
--       무한 재귀 발생.
-- 해결: SECURITY DEFINER 함수로 RLS를 우회하여 순환 참조 방지.
-- ============================================================

-- ─── 1. 헬퍼 함수 생성 ─────────────────────────────────────

-- 현재 사용자가 해당 결재문서의 결재자인지 확인 (RLS 우회)
CREATE OR REPLACE FUNCTION public.is_approver_of_document(doc_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_steps
    WHERE document_id = doc_id
      AND approver_id = auth.uid()
  );
$$;

-- 현재 사용자가 해당 결재단계의 문서 신청자인지 확인 (RLS 우회)
CREATE OR REPLACE FUNCTION public.is_requester_of_step_document(step_doc_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_documents
    WHERE id = step_doc_id
      AND requester_id = auth.uid()
  );
$$;

-- ─── 2. approval_documents 정책 교체 ────────────────────────

DROP POLICY IF EXISTS "approval_doc_select" ON approval_documents;
DROP POLICY IF EXISTS "approval_doc_insert" ON approval_documents;
DROP POLICY IF EXISTS "approval_doc_update" ON approval_documents;
DROP POLICY IF EXISTS "approval_doc_delete" ON approval_documents;

-- SELECT: 본인 신청 OR 관리자 OR 결재자
CREATE POLICY "approval_doc_select" ON approval_documents
  FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR public.is_admin()
    OR public.is_approver_of_document(id)
  );

-- INSERT: 본인 신청 OR 관리자
CREATE POLICY "approval_doc_insert" ON approval_documents
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() OR public.is_admin());

-- UPDATE: 본인 신청 OR 관리자
CREATE POLICY "approval_doc_update" ON approval_documents
  FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() OR public.is_admin());

-- DELETE: 관리자만
CREATE POLICY "approval_doc_delete" ON approval_documents
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ─── 3. approval_steps 정책 교체 ────────────────────────────

DROP POLICY IF EXISTS "approval_steps_select" ON approval_steps;
DROP POLICY IF EXISTS "approval_steps_insert" ON approval_steps;
DROP POLICY IF EXISTS "approval_steps_update" ON approval_steps;
DROP POLICY IF EXISTS "approval_steps_delete" ON approval_steps;

-- SELECT: 본인이 결재자 OR 관리자 OR 문서 신청자
CREATE POLICY "approval_steps_select" ON approval_steps
  FOR SELECT TO authenticated
  USING (
    approver_id = auth.uid()
    OR public.is_admin()
    OR public.is_requester_of_step_document(document_id)
  );

-- INSERT: 관리자 OR 본인이 결재자 OR 문서 신청자 (결재라인 생성용)
CREATE POLICY "approval_steps_insert" ON approval_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR approver_id = auth.uid()
    OR public.is_requester_of_step_document(document_id)
  );

-- UPDATE: 본인이 결재자 OR 관리자
CREATE POLICY "approval_steps_update" ON approval_steps
  FOR UPDATE TO authenticated
  USING (approver_id = auth.uid() OR public.is_admin());

-- DELETE: 관리자만
CREATE POLICY "approval_steps_delete" ON approval_steps
  FOR DELETE TO authenticated
  USING (public.is_admin());
