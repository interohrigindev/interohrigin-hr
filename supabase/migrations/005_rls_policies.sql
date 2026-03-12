-- =====================================================================
-- InterOhrigin HR — Row Level Security 정책 (재설정)
-- 기존 002에서 생성된 헬퍼 함수·정책을 모두 교체합니다.
-- Supabase SQL Editor에서 실행하세요.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 0. 기존 정책 전부 삭제
-- ─────────────────────────────────────────────────────────────────────

-- departments
DROP POLICY IF EXISTS "departments_select_all"       ON public.departments;
DROP POLICY IF EXISTS "departments_manage_management" ON public.departments;

-- employees
DROP POLICY IF EXISTS "employees_select_self"         ON public.employees;
DROP POLICY IF EXISTS "employees_select_management"   ON public.employees;
DROP POLICY IF EXISTS "employees_select_leader"       ON public.employees;
DROP POLICY IF EXISTS "employees_manage_management"   ON public.employees;

-- evaluation_periods
DROP POLICY IF EXISTS "periods_select_all"            ON public.evaluation_periods;
DROP POLICY IF EXISTS "periods_manage_management"     ON public.evaluation_periods;

-- evaluation_categories
DROP POLICY IF EXISTS "categories_select_all"         ON public.evaluation_categories;
DROP POLICY IF EXISTS "categories_manage_management"  ON public.evaluation_categories;

-- evaluation_items
DROP POLICY IF EXISTS "items_select_all"              ON public.evaluation_items;
DROP POLICY IF EXISTS "items_manage_management"       ON public.evaluation_items;

-- evaluation_targets
DROP POLICY IF EXISTS "targets_select_self"           ON public.evaluation_targets;
DROP POLICY IF EXISTS "targets_select_leader"         ON public.evaluation_targets;
DROP POLICY IF EXISTS "targets_select_management"     ON public.evaluation_targets;
DROP POLICY IF EXISTS "targets_manage_management"     ON public.evaluation_targets;

-- self_evaluations
DROP POLICY IF EXISTS "self_eval_select_own"          ON public.self_evaluations;
DROP POLICY IF EXISTS "self_eval_insert_own"          ON public.self_evaluations;
DROP POLICY IF EXISTS "self_eval_update_own"          ON public.self_evaluations;
DROP POLICY IF EXISTS "self_eval_select_leader"       ON public.self_evaluations;
DROP POLICY IF EXISTS "self_eval_manage_management"   ON public.self_evaluations;

-- evaluator_scores
DROP POLICY IF EXISTS "eval_scores_own"               ON public.evaluator_scores;
DROP POLICY IF EXISTS "eval_scores_select_employee"   ON public.evaluator_scores;
DROP POLICY IF EXISTS "eval_scores_select_management" ON public.evaluator_scores;

-- evaluator_comments
DROP POLICY IF EXISTS "eval_comments_own"               ON public.evaluator_comments;
DROP POLICY IF EXISTS "eval_comments_select_employee"   ON public.evaluator_comments;
DROP POLICY IF EXISTS "eval_comments_select_management" ON public.evaluator_comments;

-- evaluation_weights
DROP POLICY IF EXISTS "weights_select_all"            ON public.evaluation_weights;
DROP POLICY IF EXISTS "weights_manage_management"     ON public.evaluation_weights;

-- 기존 헬퍼 함수 삭제
DROP FUNCTION IF EXISTS public.current_user_role();
DROP FUNCTION IF EXISTS public.is_management();

-- ─────────────────────────────────────────────────────────────────────
-- 1. 헬퍼 함수
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text AS $$
  SELECT role FROM public.employees WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_department_id()
RETURNS uuid AS $$
  SELECT department_id FROM public.employees WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT role IN ('executive', 'ceo') FROM public.employees WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─────────────────────────────────────────────────────────────────────
-- 2. RLS 활성화 (멱등, 이미 활성화돼 있어도 안전)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.departments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_periods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_targets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_evaluations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluator_scores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluator_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_weights    ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 3. departments
-- =====================================================================

CREATE POLICY "dept_select_authenticated"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "dept_insert_admin"
  ON public.departments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "dept_update_admin"
  ON public.departments FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "dept_delete_admin"
  ON public.departments FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- 4. employees
-- =====================================================================

CREATE POLICY "emp_select_authenticated"
  ON public.employees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "emp_update_self_or_admin"
  ON public.employees FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "emp_insert_admin"
  ON public.employees FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "emp_delete_admin"
  ON public.employees FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- 5. evaluation_periods
-- =====================================================================

CREATE POLICY "period_select_authenticated"
  ON public.evaluation_periods FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "period_insert_admin"
  ON public.evaluation_periods FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "period_update_admin"
  ON public.evaluation_periods FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "period_delete_admin"
  ON public.evaluation_periods FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- 6. evaluation_categories
-- =====================================================================

CREATE POLICY "cat_select_authenticated"
  ON public.evaluation_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "cat_insert_admin"
  ON public.evaluation_categories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "cat_update_admin"
  ON public.evaluation_categories FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "cat_delete_admin"
  ON public.evaluation_categories FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- 7. evaluation_items
-- =====================================================================

CREATE POLICY "item_select_authenticated"
  ON public.evaluation_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "item_insert_admin"
  ON public.evaluation_items FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "item_update_admin"
  ON public.evaluation_items FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "item_delete_admin"
  ON public.evaluation_items FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- 8. evaluation_targets
-- =====================================================================

-- SELECT: 본인 평가 시트
CREATE POLICY "target_select_own"
  ON public.evaluation_targets FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());

-- SELECT: 팀장(leader)은 같은 부서 직원
CREATE POLICY "target_select_leader_dept"
  ON public.evaluation_targets FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'leader'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = evaluation_targets.employee_id
        AND e.department_id = public.get_my_department_id()
    )
  );

-- SELECT: director 이상은 전체
CREATE POLICY "target_select_director_up"
  ON public.evaluation_targets FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('director_kim', 'director_kang', 'executive', 'ceo')
  );

-- UPDATE: admin만
CREATE POLICY "target_update_admin"
  ON public.evaluation_targets FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- 9. self_evaluations
-- =====================================================================

-- SELECT: 자기 target의 것
CREATE POLICY "self_eval_select_own"
  ON public.self_evaluations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = self_evaluations.target_id
        AND t.employee_id = auth.uid()
    )
  );

-- SELECT: leader 이상은 평가 대상 직원의 자기평가 조회
CREATE POLICY "self_eval_select_evaluator"
  ON public.self_evaluations FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('leader', 'director_kim', 'director_kang', 'executive', 'ceo')
    AND EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = self_evaluations.target_id
        -- leader는 같은 부서만, director 이상은 전체
        AND (
          public.get_my_role() <> 'leader'
          OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = t.employee_id
              AND e.department_id = public.get_my_department_id()
          )
        )
    )
  );

-- INSERT: 자기 target + target.status = 'pending'
CREATE POLICY "self_eval_insert_own"
  ON public.self_evaluations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = self_evaluations.target_id
        AND t.employee_id = auth.uid()
        AND t.status = 'pending'
    )
  );

-- UPDATE: 자기 target + target.status = 'pending'
CREATE POLICY "self_eval_update_own"
  ON public.self_evaluations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = self_evaluations.target_id
        AND t.employee_id = auth.uid()
        AND t.status = 'pending'
    )
  );

-- =====================================================================
-- 10. evaluator_scores
-- =====================================================================

-- SELECT: 자기 target에 대한 점수
CREATE POLICY "eval_score_select_own_target"
  ON public.evaluator_scores FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_scores.target_id
        AND t.employee_id = auth.uid()
    )
  );

-- SELECT: 내가 평가자인 점수
CREATE POLICY "eval_score_select_my_scores"
  ON public.evaluator_scores FOR SELECT
  TO authenticated
  USING (evaluator_id = auth.uid());

-- SELECT: admin은 전체
CREATE POLICY "eval_score_select_admin"
  ON public.evaluator_scores FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- INSERT: 내가 평가자 + 해당 target이 내 차례
CREATE POLICY "eval_score_insert_my_turn"
  ON public.evaluator_scores FOR INSERT
  TO authenticated
  WITH CHECK (
    evaluator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_scores.target_id
        AND (
          (evaluator_scores.evaluator_role = 'leader'        AND t.status = 'self_done')
          OR (evaluator_scores.evaluator_role = 'director_kim'  AND t.status = 'leader_done')
          OR (evaluator_scores.evaluator_role = 'director_kang' AND t.status = 'director_kim_done')
          OR (evaluator_scores.evaluator_role = 'executive'     AND t.status = 'director_kang_done')
          OR (evaluator_scores.evaluator_role = 'ceo'           AND t.status = 'executive_done')
        )
    )
  );

-- UPDATE: 내가 평가자 + 해당 target이 내 차례
CREATE POLICY "eval_score_update_my_turn"
  ON public.evaluator_scores FOR UPDATE
  TO authenticated
  USING (
    evaluator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_scores.target_id
        AND (
          (evaluator_scores.evaluator_role = 'leader'        AND t.status = 'self_done')
          OR (evaluator_scores.evaluator_role = 'director_kim'  AND t.status = 'leader_done')
          OR (evaluator_scores.evaluator_role = 'director_kang' AND t.status = 'director_kim_done')
          OR (evaluator_scores.evaluator_role = 'executive'     AND t.status = 'director_kang_done')
          OR (evaluator_scores.evaluator_role = 'ceo'           AND t.status = 'executive_done')
        )
    )
  );

-- =====================================================================
-- 11. evaluator_comments
-- =====================================================================

-- SELECT: 자기 target에 대한 코멘트
CREATE POLICY "eval_comment_select_own_target"
  ON public.evaluator_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_comments.target_id
        AND t.employee_id = auth.uid()
    )
  );

-- SELECT: 내가 평가자인 코멘트
CREATE POLICY "eval_comment_select_my_comments"
  ON public.evaluator_comments FOR SELECT
  TO authenticated
  USING (evaluator_id = auth.uid());

-- SELECT: admin은 전체
CREATE POLICY "eval_comment_select_admin"
  ON public.evaluator_comments FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- INSERT: 내가 평가자 + 해당 target이 내 차례
CREATE POLICY "eval_comment_insert_my_turn"
  ON public.evaluator_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    evaluator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_comments.target_id
        AND (
          (evaluator_comments.evaluator_role = 'leader'        AND t.status = 'self_done')
          OR (evaluator_comments.evaluator_role = 'director_kim'  AND t.status = 'leader_done')
          OR (evaluator_comments.evaluator_role = 'director_kang' AND t.status = 'director_kim_done')
          OR (evaluator_comments.evaluator_role = 'executive'     AND t.status = 'director_kang_done')
          OR (evaluator_comments.evaluator_role = 'ceo'           AND t.status = 'executive_done')
        )
    )
  );

-- UPDATE: 내가 평가자 + 해당 target이 내 차례
CREATE POLICY "eval_comment_update_my_turn"
  ON public.evaluator_comments FOR UPDATE
  TO authenticated
  USING (
    evaluator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_comments.target_id
        AND (
          (evaluator_comments.evaluator_role = 'leader'        AND t.status = 'self_done')
          OR (evaluator_comments.evaluator_role = 'director_kim'  AND t.status = 'leader_done')
          OR (evaluator_comments.evaluator_role = 'director_kang' AND t.status = 'director_kim_done')
          OR (evaluator_comments.evaluator_role = 'executive'     AND t.status = 'director_kang_done')
          OR (evaluator_comments.evaluator_role = 'ceo'           AND t.status = 'executive_done')
        )
    )
  );

-- =====================================================================
-- 12. evaluation_weights
-- =====================================================================

CREATE POLICY "weight_select_authenticated"
  ON public.evaluation_weights FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "weight_insert_admin"
  ON public.evaluation_weights FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "weight_update_admin"
  ON public.evaluation_weights FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "weight_delete_admin"
  ON public.evaluation_weights FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- 완료!
-- =====================================================================
