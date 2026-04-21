-- 051_hr_admin_role.sql
-- 목적: 연차 결재라인의 '인사담당' 단계를 지원하기 위해 employees.role CHECK 제약에 'hr_admin' 추가

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee','leader','director','division_head','ceo','admin','hr_admin'));

-- 적용 방법:
--   1) Supabase SQL Editor에서 위 2개 문장 실행
--   2) 인사담당 직원(민지님 등)의 role을 'hr_admin' 으로 UPDATE
--      예: UPDATE employees SET role = 'hr_admin' WHERE email = '민지님이메일';
