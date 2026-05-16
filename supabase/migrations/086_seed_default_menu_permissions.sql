-- ════════════════════════════════════════════════════════════════════
-- 086. Role 기반 기본 메뉴 권한 일괄 적용 (직원 오픈 준비용)
-- ════════════════════════════════════════════════════════════════════
-- 목적:
--   현재 menu_permissions 테이블이 비어있어서 모든 직원이 모든 메뉴에 접근 가능한 상태.
--   직원에게 시스템 오픈 전, role별 적절한 기본 권한을 일괄 부여한다.
--   적용 후 관리자가 화면에서 직원별로 확인·미세 조정 가능.
--
-- 정책:
--   - 관리자급 (ceo/admin/director/division_head/executive): 전체 41개 메뉴
--   - 리더 (leader): 18개 (수습평가/채용/긴급/급여 제외 — 필요 시 수동 부여)
--   - 일반 직원 (그 외): 7개 기본 업무 메뉴
--
-- 안전 장치:
--   - 트랜잭션으로 묶어 실패 시 전체 롤백
--   - 기존 menu_permissions 항목 있으면 삭제 후 재삽입 (UPSERT 효과)
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 기존 권한 항목 제거 (활성 직원에 한해)
DELETE FROM public.menu_permissions
WHERE employee_id IN (SELECT id FROM public.employees WHERE is_active = true);

-- ─── 1. 관리자급 — 전체 메뉴 (41개) ─────────────────────────────────
INSERT INTO public.menu_permissions (employee_id, allowed_menus)
SELECT
  id,
  '[
    "/self-evaluation","/evaluate","/report","/messenger",
    "/admin/urgent","/admin/urgent/quick-eval","/admin/urgent/penalties","/admin/migrate",
    "/admin/recruitment","/admin/recruitment/postings","/admin/recruitment/survey",
    "/admin/recruitment/talent","/admin/recruitment/interviews","/admin/recruitment/ai-trust",
    "/admin/employees","/admin/employees/analysis","/admin/employees/notes","/admin/employees/exit",
    "/admin/ojt","/admin/ojt/mentor","/admin/probation",
    "/admin/dashboard","/admin/projects","/admin/projects/new","/admin/work","/admin/work/daily","/admin/projects/permissions",
    "/admin/leave","/admin/attendance","/admin/approval","/admin/certificates","/admin/organization","/admin/payroll","/admin/training",
    "/admin/monthly-checkin","/admin/peer-review","/admin/evaluation","/admin/settings/evaluation",
    "/admin/evaluation/ai-report","/admin/evaluation/ai-verify","/admin/evaluation/sync"
  ]'::jsonb
FROM public.employees
WHERE is_active = true
  AND role IN ('ceo', 'admin', 'director', 'division_head', 'executive');

-- ─── 2. 리더 — 18개 메뉴 (수습평가/채용/긴급/급여 제외) ────────────
INSERT INTO public.menu_permissions (employee_id, allowed_menus)
SELECT
  id,
  '[
    "/self-evaluation","/evaluate","/report","/messenger",
    "/admin/employees",
    "/admin/dashboard","/admin/projects","/admin/work","/admin/work/daily",
    "/admin/monthly-checkin","/admin/peer-review","/admin/evaluation",
    "/admin/leave","/admin/attendance","/admin/approval","/admin/certificates","/admin/organization","/admin/training"
  ]'::jsonb
FROM public.employees
WHERE is_active = true
  AND role = 'leader';

-- ─── 3. 일반 직원 — 7개 기본 메뉴 ───────────────────────────────────
INSERT INTO public.menu_permissions (employee_id, allowed_menus)
SELECT
  id,
  '[
    "/self-evaluation","/evaluate","/report","/messenger",
    "/admin/projects","/admin/work","/admin/work/daily"
  ]'::jsonb
FROM public.employees
WHERE is_active = true
  AND (role IS NULL OR role NOT IN ('ceo', 'admin', 'director', 'division_head', 'executive', 'leader'));

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 적용 확인 쿼리
-- ════════════════════════════════════════════════════════════════════
-- SELECT
--   e.name, e.role, d.name AS department,
--   jsonb_array_length(mp.allowed_menus) AS menu_count,
--   CASE WHEN mp.allowed_menus ? '/admin/probation' THEN '✅' ELSE '❌' END AS probation_eval
-- FROM employees e
-- LEFT JOIN departments d ON d.id = e.department_id
-- LEFT JOIN menu_permissions mp ON mp.employee_id = e.id
-- WHERE e.is_active = true
-- ORDER BY e.role, e.name;
