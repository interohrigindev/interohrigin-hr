-- =====================================================================
-- 041: 인사노무 RLS 정책 강화
-- 기존 USING (true) → 본인 데이터 + 관리자 오버라이드
-- Supabase SQL Editor에서 실행
-- =====================================================================

-- ═══════════════════════════════════
-- 1. is_admin() 함수 업데이트 (역할 매칭 수정)
-- ═══════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT role IN ('director', 'division_head', 'ceo', 'admin')
     FROM public.employees WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 본인 employee_id 일치 여부 헬퍼
CREATE OR REPLACE FUNCTION public.is_own_record(record_employee_id uuid)
RETURNS boolean AS $$
  SELECT record_employee_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 팀 리더 여부 (같은 부서 + leader 이상)
CREATE OR REPLACE FUNCTION public.is_team_leader_of(target_employee_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees me
    JOIN public.employees target ON target.department_id = me.department_id
    WHERE me.id = auth.uid()
      AND target.id = target_employee_id
      AND me.role IN ('leader', 'director', 'division_head', 'ceo', 'admin')
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════
-- 2. attendance_records — 근태
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "attendance_select" ON attendance_records;
DROP POLICY IF EXISTS "attendance_insert" ON attendance_records;
DROP POLICY IF EXISTS "attendance_update" ON attendance_records;
DROP POLICY IF EXISTS "attendance_delete" ON attendance_records;

CREATE POLICY "attendance_select" ON attendance_records
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin() OR public.is_team_leader_of(employee_id));

CREATE POLICY "attendance_insert" ON attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "attendance_update" ON attendance_records
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "attendance_delete" ON attendance_records
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ═══════════════════════════════════
-- 3. leave_requests — 연차 신청
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "leave_requests_select" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_insert" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_update" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_delete" ON leave_requests;

CREATE POLICY "leave_requests_select" ON leave_requests
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin() OR public.is_team_leader_of(employee_id));

CREATE POLICY "leave_requests_insert" ON leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "leave_requests_update" ON leave_requests
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "leave_requests_delete" ON leave_requests
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ═══════════════════════════════════
-- 4. employee_hr_details — 인사정보
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "hr_details_select" ON employee_hr_details;
DROP POLICY IF EXISTS "hr_details_insert" ON employee_hr_details;
DROP POLICY IF EXISTS "hr_details_update" ON employee_hr_details;
DROP POLICY IF EXISTS "hr_details_delete" ON employee_hr_details;

CREATE POLICY "hr_details_select" ON employee_hr_details
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "hr_details_insert" ON employee_hr_details
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "hr_details_update" ON employee_hr_details
  FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "hr_details_delete" ON employee_hr_details
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ═══════════════════════════════════
-- 5. approval_documents — 전자 결재
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "approval_doc_select" ON approval_documents;
DROP POLICY IF EXISTS "approval_doc_insert" ON approval_documents;
DROP POLICY IF EXISTS "approval_doc_update" ON approval_documents;
DROP POLICY IF EXISTS "approval_doc_delete" ON approval_documents;

CREATE POLICY "approval_doc_select" ON approval_documents
  FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM approval_steps s
      WHERE s.document_id = approval_documents.id
        AND s.approver_id = auth.uid()
    )
  );

CREATE POLICY "approval_doc_insert" ON approval_documents
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() OR public.is_admin());

CREATE POLICY "approval_doc_update" ON approval_documents
  FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() OR public.is_admin());

CREATE POLICY "approval_doc_delete" ON approval_documents
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ═══════════════════════════════════
-- 6. approval_steps — 결재 단계
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "approval_steps_select" ON approval_steps;
DROP POLICY IF EXISTS "approval_steps_insert" ON approval_steps;
DROP POLICY IF EXISTS "approval_steps_update" ON approval_steps;
DROP POLICY IF EXISTS "approval_steps_delete" ON approval_steps;

CREATE POLICY "approval_steps_select" ON approval_steps
  FOR SELECT TO authenticated
  USING (
    approver_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM approval_documents d
      WHERE d.id = approval_steps.document_id
        AND d.requester_id = auth.uid()
    )
  );

CREATE POLICY "approval_steps_insert" ON approval_steps
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR approver_id = auth.uid());

CREATE POLICY "approval_steps_update" ON approval_steps
  FOR UPDATE TO authenticated
  USING (approver_id = auth.uid() OR public.is_admin());

CREATE POLICY "approval_steps_delete" ON approval_steps
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ═══════════════════════════════════
-- 7. approval_templates — 결재 양식 (관리자만 편집, 전체 읽기)
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "approval_tpl_select" ON approval_templates;
DROP POLICY IF EXISTS "approval_tpl_insert" ON approval_templates;
DROP POLICY IF EXISTS "approval_tpl_update" ON approval_templates;
DROP POLICY IF EXISTS "approval_tpl_delete" ON approval_templates;

CREATE POLICY "approval_tpl_select" ON approval_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "approval_tpl_insert" ON approval_templates
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "approval_tpl_update" ON approval_templates
  FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "approval_tpl_delete" ON approval_templates
  FOR DELETE TO authenticated USING (public.is_admin());

-- ═══════════════════════════════════
-- 8. payroll — 급여
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "payroll_select" ON payroll;
DROP POLICY IF EXISTS "payroll_insert" ON payroll;
DROP POLICY IF EXISTS "payroll_update" ON payroll;
DROP POLICY IF EXISTS "payroll_delete" ON payroll;

CREATE POLICY "payroll_select" ON payroll
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "payroll_insert" ON payroll
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "payroll_update" ON payroll
  FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "payroll_delete" ON payroll
  FOR DELETE TO authenticated USING (public.is_admin());

-- ═══════════════════════════════════
-- 9. payroll_settings — 급여 설정 (관리자 전용)
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "payroll_settings_select" ON payroll_settings;
DROP POLICY IF EXISTS "payroll_settings_insert" ON payroll_settings;
DROP POLICY IF EXISTS "payroll_settings_update" ON payroll_settings;

CREATE POLICY "payroll_settings_select" ON payroll_settings
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "payroll_settings_insert" ON payroll_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "payroll_settings_update" ON payroll_settings
  FOR UPDATE TO authenticated USING (public.is_admin());

-- ═══════════════════════════════════
-- 10. certificates — 증명서
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "certificates_select" ON certificates;
DROP POLICY IF EXISTS "certificates_insert" ON certificates;
DROP POLICY IF EXISTS "certificates_delete" ON certificates;

CREATE POLICY "certificates_select" ON certificates
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "certificates_insert" ON certificates
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "certificates_delete" ON certificates
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ═══════════════════════════════════
-- 11. training_records — 교육
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "training_select" ON training_records;
DROP POLICY IF EXISTS "training_insert" ON training_records;
DROP POLICY IF EXISTS "training_update" ON training_records;
DROP POLICY IF EXISTS "training_delete" ON training_records;

CREATE POLICY "training_select" ON training_records
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin() OR public.is_team_leader_of(employee_id));

CREATE POLICY "training_insert" ON training_records
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "training_update" ON training_records
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "training_delete" ON training_records
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ═══════════════════════════════════
-- 12. electronic_contracts — 전자 계약
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "contracts_select" ON electronic_contracts;
DROP POLICY IF EXISTS "contracts_insert" ON electronic_contracts;
DROP POLICY IF EXISTS "contracts_update" ON electronic_contracts;

CREATE POLICY "contracts_select" ON electronic_contracts
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "contracts_insert" ON electronic_contracts
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "contracts_update" ON electronic_contracts
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

-- ═══════════════════════════════════
-- 13. approval_delegations — 결재 위임
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "delegations_select" ON approval_delegations;
DROP POLICY IF EXISTS "delegations_insert" ON approval_delegations;
DROP POLICY IF EXISTS "delegations_update" ON approval_delegations;

CREATE POLICY "delegations_select" ON approval_delegations
  FOR SELECT TO authenticated
  USING (delegator_id = auth.uid() OR delegate_id = auth.uid() OR public.is_admin());

CREATE POLICY "delegations_insert" ON approval_delegations
  FOR INSERT TO authenticated
  WITH CHECK (delegator_id = auth.uid() OR public.is_admin());

CREATE POLICY "delegations_update" ON approval_delegations
  FOR UPDATE TO authenticated
  USING (delegator_id = auth.uid() OR public.is_admin());

-- ═══════════════════════════════════
-- 14. weekly_hours_tracking — 주간 근로시간
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "weekly_hours_select" ON weekly_hours_tracking;
DROP POLICY IF EXISTS "weekly_hours_insert" ON weekly_hours_tracking;

CREATE POLICY "weekly_hours_select" ON weekly_hours_tracking
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin() OR public.is_team_leader_of(employee_id));

CREATE POLICY "weekly_hours_insert" ON weekly_hours_tracking
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- ═══════════════════════════════════
-- 15. personnel_orders — 인사발령 (관리자 전용)
-- ═══════════════════════════════════

DROP POLICY IF EXISTS "personnel_select" ON personnel_orders;
DROP POLICY IF EXISTS "personnel_insert" ON personnel_orders;

CREATE POLICY "personnel_select" ON personnel_orders
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "personnel_insert" ON personnel_orders
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- =====================================================================
-- 완료: 인사노무 12개 테이블 RLS 강화
-- 규칙: 본인 데이터만 조회 + 팀리더 부서원 조회 + 관리자 전체 접근
-- =====================================================================
