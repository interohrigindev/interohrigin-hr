-- ════════════════════════════════════════════════════════════════════
-- 087. 리더/일반 직원 기본 메뉴 권한 재조정 (사용자 피드백 반영)
-- ════════════════════════════════════════════════════════════════════
-- 변경 사항:
--   - 리더 + 일반 직원: 동일하게 17개 기본 메뉴
--   - 사이드바용 경로(/work/daily-report, /bulletin)도 함께 부여 (메뉴 표시용)
--   - 리더의 수습평가 권한(/admin/probation)은 별도 INSERT/UPDATE로 부여
--
-- 17개 메뉴 (관리자가 차주용/최성주에게 적용한 기준):
--   기본:     자기평가, 평가하기, 내 결과, 메신저
--   직원관리: 통합 프로필 검색
--   프로젝트: 통합 대시보드, 프로젝트 보드, 새 프로젝트, 작업 관리, 일일 보고서
--   인사노무: 연차 관리, 전자 결재, 증명서 발급, 조직도
--   인사평가: 월간 업무 점검, 동료 평가, 평가 대시보드
--
-- 사이드바 표시용 보조 경로:
--   /work/daily-report (사이드바 "일일 보고서")
--   /bulletin          (사이드바 "게시판")
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 리더 — 17개 기본 메뉴 + 사이드바 보조 경로
UPDATE public.menu_permissions
SET allowed_menus = '[
  "/self-evaluation","/evaluate","/report","/messenger",
  "/work/daily-report","/bulletin",
  "/admin/employees",
  "/admin/dashboard","/admin/projects","/admin/projects/new","/admin/work","/admin/work/daily",
  "/admin/leave","/admin/approval","/admin/certificates","/admin/organization",
  "/admin/monthly-checkin","/admin/peer-review","/admin/evaluation"
]'::jsonb
WHERE employee_id IN (
  SELECT id FROM public.employees WHERE is_active = true AND role = 'leader'
);

-- 일반 직원 (employee, hr_admin, null 등) — 동일 17개 메뉴
UPDATE public.menu_permissions
SET allowed_menus = '[
  "/self-evaluation","/evaluate","/report","/messenger",
  "/work/daily-report","/bulletin",
  "/admin/employees",
  "/admin/dashboard","/admin/projects","/admin/projects/new","/admin/work","/admin/work/daily",
  "/admin/leave","/admin/approval","/admin/certificates","/admin/organization",
  "/admin/monthly-checkin","/admin/peer-review","/admin/evaluation"
]'::jsonb
WHERE employee_id IN (
  SELECT id FROM public.employees
  WHERE is_active = true
    AND (role IS NULL OR role NOT IN ('ceo', 'admin', 'director', 'division_head', 'executive', 'leader'))
);

-- 관리자급 — 사이드바 보조 경로 보강 (전체 메뉴 + 사이드바용 경로)
UPDATE public.menu_permissions
SET allowed_menus = (
  CASE
    WHEN allowed_menus ? '/work/daily-report' AND allowed_menus ? '/bulletin'
      THEN allowed_menus
    ELSE allowed_menus
      || (CASE WHEN allowed_menus ? '/work/daily-report' THEN '[]'::jsonb ELSE '["/work/daily-report"]'::jsonb END)
      || (CASE WHEN allowed_menus ? '/bulletin' THEN '[]'::jsonb ELSE '["/bulletin"]'::jsonb END)
  END
)
WHERE employee_id IN (
  SELECT id FROM public.employees
  WHERE is_active = true AND role IN ('ceo','admin','director','division_head','executive')
);

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 확인 쿼리
-- ════════════════════════════════════════════════════════════════════
-- SELECT
--   e.name, e.role, jsonb_array_length(mp.allowed_menus) AS menu_count,
--   mp.allowed_menus ? '/work/daily-report' AS has_daily_report,
--   mp.allowed_menus ? '/bulletin' AS has_bulletin,
--   mp.allowed_menus ? '/admin/probation' AS has_probation_eval
-- FROM employees e
-- LEFT JOIN menu_permissions mp ON mp.employee_id = e.id
-- WHERE e.is_active = true
-- ORDER BY e.role, e.name;
