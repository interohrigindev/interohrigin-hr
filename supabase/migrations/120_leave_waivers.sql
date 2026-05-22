-- 120: 연차 포기 각서 전자서명 (계획서 #5)
--
-- 흐름:
--   1. 인사담당(hr_admin/admin) 이 직원에게 "포기 각서 발급" → status='pending_signature' row 생성
--   2. 직원이 /my/leave-waiver/:id 진입 → 본문 확인 + 캔버스 서명
--   3. 서명 시 PNG 가 leave-waivers 버킷에 업로드되고 leave_waivers row 가 'signed' 로 전이
--   4. 인사담당이 payout_status 갱신 ('waived' 가 기본 — 수당 미지급 처리 완료 의미)
--
-- 법적 증빙: 본문 + 서명 이미지 + signed_ip / signed_user_agent / signed_at 로
--   사후 분쟁 시 증거. archived_at 으로 soft delete 만 허용 (실제 삭제는 admin SQL 만).

BEGIN;

-- ─── leave_waivers 테이블 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_waivers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id            uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  promotion_id           uuid REFERENCES public.annual_leave_promotions(id) ON DELETE SET NULL,
  waiver_year            int NOT NULL,
  waiver_days            numeric(5,1) NOT NULL CHECK (waiver_days > 0),
  waiver_text            text NOT NULL,                    -- 발급 시 확정된 각서 본문 (HTML, DOMPurify 후 표시)
  signature_image_path   text,                             -- Storage: leave-waivers/{employee_id}/{uuid}.png (서명 전 NULL)
  signed_at              timestamptz,                      -- 서명 완료 시각
  signed_ip              text,                             -- 증빙용 (선택)
  signed_user_agent      text,                             -- 증빙용 (선택)
  status                 text NOT NULL DEFAULT 'pending_signature'
                         CHECK (status IN ('pending_signature','signed','revoked')),
  payout_status          text NOT NULL DEFAULT 'pending'
                         CHECK (payout_status IN ('pending','waived','partial','revoked')),
  created_by             uuid NOT NULL REFERENCES public.employees(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  archived_at            timestamptz
);

-- 같은 직원·연도 활성 row 1건만
CREATE UNIQUE INDEX IF NOT EXISTS leave_waivers_unique_active
  ON public.leave_waivers (employee_id, waiver_year)
  WHERE archived_at IS NULL AND status != 'revoked';

CREATE INDEX IF NOT EXISTS leave_waivers_employee_idx ON public.leave_waivers (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leave_waivers_promotion_idx ON public.leave_waivers (promotion_id);
CREATE INDEX IF NOT EXISTS leave_waivers_status_idx ON public.leave_waivers (status) WHERE archived_at IS NULL;

CREATE TRIGGER trg_leave_waivers_updated_at
  BEFORE UPDATE ON public.leave_waivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.leave_waivers ENABLE ROW LEVEL SECURITY;

-- ─── RLS 정책 ──────────────────────────────────────────────
-- 주의: employees.id = auth.uid() (employees.id 가 auth.users FK)

-- SELECT: 본인 + admin/hr_admin/ceo/director/division_head
DROP POLICY IF EXISTS "leave_waivers_select" ON public.leave_waivers;
CREATE POLICY "leave_waivers_select"
ON public.leave_waivers FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin','ceo','director','division_head')
  )
);

-- INSERT: hr_admin/admin 만 발급 (created_by = self)
DROP POLICY IF EXISTS "leave_waivers_insert_admin" ON public.leave_waivers;
CREATE POLICY "leave_waivers_insert_admin"
ON public.leave_waivers FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin')
  )
);

-- UPDATE:
--   - 본인: status가 pending_signature 일 때 서명 완료 (signature_image_path/signed_at/status='signed')
--   - hr_admin/admin: payout_status / 취소(status='revoked') / soft delete(archived_at)
DROP POLICY IF EXISTS "leave_waivers_update_self" ON public.leave_waivers;
CREATE POLICY "leave_waivers_update_self"
ON public.leave_waivers FOR UPDATE TO authenticated
USING (employee_id = auth.uid())
WITH CHECK (employee_id = auth.uid());

DROP POLICY IF EXISTS "leave_waivers_update_admin" ON public.leave_waivers;
CREATE POLICY "leave_waivers_update_admin"
ON public.leave_waivers FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('admin','hr_admin')
  )
);

-- DELETE: 명시적 차단 (archived_at soft delete 만 사용)
DROP POLICY IF EXISTS "leave_waivers_no_delete" ON public.leave_waivers;
CREATE POLICY "leave_waivers_no_delete"
ON public.leave_waivers FOR DELETE TO authenticated
USING (false);

COMMENT ON TABLE public.leave_waivers IS
  '연차 포기 각서 전자서명 — 인사담당이 발급 후 직원이 캔버스 서명. 법적 증빙(노무 분쟁 대응).';
COMMENT ON COLUMN public.leave_waivers.status IS
  'pending_signature → signed (서명 완료) | revoked (취소)';
COMMENT ON COLUMN public.leave_waivers.payout_status IS
  'pending(서명 대기) → waived(수당 미지급 확정) | partial(일부 지급) | revoked(처리 취소)';

-- ─── Storage 버킷 ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('leave-waivers', 'leave-waivers', false)
ON CONFLICT (id) DO NOTHING;

-- storage.objects 정책은 권한 부족으로 SQL 으로 생성 불가 (참고: migration 119).
-- 버킷은 public=false 로 두고, 클라이언트는 supabase.storage.from('leave-waivers').createSignedUrl 사용.

COMMIT;
