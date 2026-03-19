-- =====================================================================
-- 029: 프로젝트 부서 권한 설정 업데이트
-- - departments.name UNIQUE 제약 추가
-- - 부서 추가 (경영관리본부, 마케팅영업본부)
-- - project_boards에 shared_departments 컬럼 추가
-- - board_permissions 업데이트 (실제 부서 기반 + 임원/관리자 전체 권한)
-- =====================================================================

-- ─── 0. departments.name에 UNIQUE 제약 추가 ─────────────────────────
ALTER TABLE public.departments
  ADD CONSTRAINT departments_name_unique UNIQUE (name);

-- ─── 1. 부서 추가 ──────────────────────────────────────────────────
INSERT INTO public.departments (name) VALUES
  ('경영관리본부'),
  ('마케팅영업본부')
ON CONFLICT (name) DO NOTHING;

-- ─── 2. project_boards에 공유 부서 컬럼 추가 ────────────────────────
ALTER TABLE public.project_boards
  ADD COLUMN IF NOT EXISTS shared_departments text[] DEFAULT '{}';

COMMENT ON COLUMN public.project_boards.shared_departments
  IS '프로젝트를 공유받아 협업 가능한 부서 목록';

-- ─── 3. board_permissions 업데이트 ──────────────────────────────────
-- 경영관리본부 추가
INSERT INTO public.board_permissions
  (department, can_create_project, can_delete_project, can_edit_all_stages, can_comment, can_view, editable_stages)
VALUES
  ('경영관리본부', true, false, false, true, true, '{}'),
  ('마케팅영업본부', true, false, false, true, true, '{"판매가","마케팅"}')
ON CONFLICT (department) DO NOTHING;

-- 임원 권한 보장 (이미 있으면 전체 권한으로 업데이트)
INSERT INTO public.board_permissions
  (department, can_create_project, can_delete_project, can_edit_all_stages, can_comment, can_view, editable_stages)
VALUES
  ('임원', true, true, true, true, true, '{"시장조사","제형","패키지","판매가","상세페이지","촬영","마케팅"}')
ON CONFLICT (department) DO UPDATE SET
  can_create_project = true,
  can_delete_project = true,
  can_edit_all_stages = true,
  can_comment = true,
  can_view = true,
  editable_stages = '{"시장조사","제형","패키지","판매가","상세페이지","촬영","마케팅"}';

-- 시스템 관리자 권한 추가
INSERT INTO public.board_permissions
  (department, can_create_project, can_delete_project, can_edit_all_stages, can_comment, can_view, editable_stages)
VALUES
  ('시스템관리자', true, true, true, true, true, '{"시장조사","제형","패키지","판매가","상세페이지","촬영","마케팅"}')
ON CONFLICT (department) DO UPDATE SET
  can_create_project = true,
  can_delete_project = true,
  can_edit_all_stages = true,
  can_comment = true,
  can_view = true,
  editable_stages = '{"시장조사","제형","패키지","판매가","상세페이지","촬영","마케팅"}';
