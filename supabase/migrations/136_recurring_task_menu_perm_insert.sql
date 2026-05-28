-- 136_recurring_task_menu_perm_insert.sql
-- 반복업무 등록 권한 확장: 관리자 역할(leader 이상)뿐 아니라
-- 메뉴권한관리에서 '반복업무 관리' 메뉴(/admin/projects/recurring)를 부여받은
-- 일반 사용자도 본인 명의(created_by=self)로 템플릿을 INSERT 할 수 있도록 허용.
--
-- allowed_menus 는 jsonb 배열 → 포함 검사는 `?` 연산자 사용.
-- created_by=self 조건은 유지(타인 명의 등록 차단). UPDATE/DELETE 는
-- 기존 정책(created_by=self OR 관리자)으로 이미 등록자 본인 관리 허용 → 변경 불필요.
-- SELECT 도 비변경(본인 작성/담당 + 관리자) — 가시성 과확장 방지.

DROP POLICY IF EXISTS "recur_tasks_insert" ON public.recurring_tasks;
CREATE POLICY "recur_tasks_insert"
ON public.recurring_tasks FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.employees e
              WHERE e.id = auth.uid()
                AND e.role IN ('leader','director','division_head','ceo','admin','hr_admin'))
    OR EXISTS (SELECT 1 FROM public.menu_permissions mp
                 WHERE mp.employee_id = auth.uid()
                   AND mp.allowed_menus ? '/admin/projects/recurring')
  )
);
