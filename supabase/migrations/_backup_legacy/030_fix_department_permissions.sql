-- =====================================================================
-- 030: 부서 권한 정리
-- - departments 테이블은 건드리지 않음 (직원 FK 참조)
-- - board_permissions: 실제 3개 본부 기준으로 재정리
-- - 권한 간소화: 생성/삭제/코멘트/조회만 사용
-- =====================================================================

-- ─── 1. board_permissions 정리: 불필요 항목 삭제 ─────────────────────
DELETE FROM public.board_permissions
  WHERE department IN ('디자인팀', '영업팀', '경영지원팀', '경영관리본부');

-- ─── 2. 마케팅영업본부 departments 추가 (없으면) ────────────────────
INSERT INTO public.departments (name) VALUES ('마케팅영업본부')
ON CONFLICT (name) DO NOTHING;

-- ─── 3. 3개 본부 권한 설정 (생성/삭제/코멘트/조회) ──────────────────
INSERT INTO public.board_permissions
  (department, can_create_project, can_delete_project, can_comment, can_view)
VALUES
  ('브랜드사업본부', true, false, true, true),
  ('마케팅영업본부', true, false, true, true),
  ('경영지원본부', true, false, true, true)
ON CONFLICT (department) DO UPDATE SET
  can_create_project = EXCLUDED.can_create_project,
  can_delete_project = EXCLUDED.can_delete_project,
  can_comment = EXCLUDED.can_comment,
  can_view = EXCLUDED.can_view;

-- ─── 4. 임원 / 시스템관리자 전체 권한 보장 ──────────────────────────
INSERT INTO public.board_permissions
  (department, can_create_project, can_delete_project, can_comment, can_view)
VALUES
  ('임원', true, true, true, true),
  ('시스템관리자', true, true, true, true)
ON CONFLICT (department) DO UPDATE SET
  can_create_project = true,
  can_delete_project = true,
  can_comment = true,
  can_view = true;
