-- ════════════════════════════════════════════════════════════════════
-- 088. 사이드바 경로와 메뉴 권한 페이지 경로 정합성 맞춤
-- ════════════════════════════════════════════════════════════════════
-- 배경:
--   메뉴 권한 설정 페이지(/settings/menu-permissions)에서 사용하는 경로 키와
--   실제 사이드바(Sidebar.tsx)에서 사용하는 to 경로가 서로 다른 메뉴가 있음.
--   예) 프로젝트 보드: 권한 페이지 '/admin/projects' vs 사이드바 '/admin/projects/board'
--   이로 인해 권한 페이지에서 체크하더라도 사이드바엔 해당 메뉴가 안 보이는 문제.
--
-- 해결:
--   각 메뉴에 대해 "권한 페이지 경로 + 사이드바 경로" 두 가지 모두 allowed_menus 에 보강.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 리더 + 일반 직원: 동일한 메뉴 세트 (사이드바 경로 보강)
UPDATE public.menu_permissions
SET allowed_menus = '[
  "/self-evaluation","/evaluate","/report","/messenger",
  "/work/daily-report","/bulletin",
  "/admin/employees",
  "/admin/dashboard","/admin/projects","/admin/projects/board","/admin/projects/new",
  "/admin/work","/admin/work/daily","/admin/work/tasks",
  "/admin/leave","/admin/approval","/admin/certificates","/admin/organization",
  "/admin/monthly-checkin","/admin/peer-review","/admin/evaluation"
]'::jsonb
WHERE employee_id IN (
  SELECT id FROM public.employees
  WHERE is_active = true
    AND (role IS NULL OR role NOT IN ('ceo','admin','director','division_head','executive'))
);

-- 관리자급: 전체 메뉴 + 사이드바 추가 경로
UPDATE public.menu_permissions
SET allowed_menus = '[
  "/self-evaluation","/evaluate","/report","/messenger",
  "/work/daily-report","/bulletin",
  "/admin/urgent","/admin/urgent/quick-eval","/admin/urgent/penalties","/admin/migrate",
  "/admin/recruitment","/admin/recruitment/postings","/admin/recruitment/survey",
  "/admin/recruitment/talent","/admin/recruitment/interviews","/admin/recruitment/ai-trust",
  "/admin/employees","/admin/employees/analysis","/admin/employees/notes","/admin/employees/exit",
  "/admin/ojt","/admin/ojt/mentor","/admin/probation","/admin/probation-results",
  "/admin/dashboard","/admin/projects","/admin/projects/board","/admin/projects/new",
  "/admin/work","/admin/work/daily","/admin/work/tasks","/admin/projects/permissions","/admin/projects/settings",
  "/admin/leave","/admin/attendance","/admin/approval","/admin/certificates","/admin/organization","/admin/payroll","/admin/training",
  "/admin/monthly-checkin","/admin/peer-review","/admin/evaluation","/admin/settings/evaluation",
  "/admin/evaluation/ai-report","/admin/evaluation/ai-verify","/admin/evaluation/sync",
  "/my/handover"
]'::jsonb
WHERE employee_id IN (
  SELECT id FROM public.employees
  WHERE is_active = true AND role IN ('ceo','admin','director','division_head','executive')
);

COMMIT;
