-- =====================================================================
-- 032: 템플릿 부서명 수정 + board_permissions 정리
-- 경영지원본부 → 경영관리본부 (실제 departments 테이블 기준)
-- =====================================================================

-- 템플릿 부서명 수정
UPDATE public.project_templates
  SET department = '경영관리본부'
  WHERE department = '경영지원본부';

-- board_permissions: 경영지원본부 레코드 삭제 (경영관리본부가 이미 존재)
DELETE FROM public.board_permissions WHERE department = '경영지원본부';
