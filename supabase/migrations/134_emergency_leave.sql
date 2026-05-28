-- 134: 긴급연차 (emergency-leave) — PDCA #4
--
-- 흐름 (Design §2.2):
--   1. 직원이 [긴급연차] 신청 → emergency_leave_requests INSERT (status='filed'), 결재선 없음
--      → 동시에 임원급(hr_admin/ceo/director) 이메일 자동 발송 (앱에서 sendNotification 루프)
--   2. 출근 후 보완자료(진단서/사유서) 업로드 → emergency-leave-files 버킷, status='supplemented'
--   3. [연차 신청] 전환 → leave_requests 정식 row INSERT (기존 결재선/트리거 재사용)
--      → emergency.status='promoted' + promoted_to_leave_id 링크
--   4. 정식 결재 최종 승인 시 기존 trigger_leave_balance 가 days_count 만큼 1회 차감
--      → 무급분(unpaid_days)은 leave_requests.days_count 에 넣지 않고 여기에만 기록 (이중/과차감 방지)
--
-- 절대 규칙: 기존 테이블 ALTER 0 (신규 테이블만). CREATE ... IF NOT EXISTS 멱등.
-- 트리거 재사용: public.update_updated_at() (migration 120 leave_waivers 와 동일)

BEGIN;

-- ─── emergency_leave_requests 테이블 ───────────────────────────
CREATE TABLE IF NOT EXISTS public.emergency_leave_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  -- 사유 유형 (긴급사유 vs 병가). 병가(sick)만 전환 시 진단서 첨부 필수
  leave_kind            text NOT NULL DEFAULT 'emergency'
                          CHECK (leave_kind IN ('emergency','sick')),

  start_date            date NOT NULL,
  end_date              date NOT NULL,
  days_count            numeric(4,1) NOT NULL DEFAULT 1 CHECK (days_count > 0),

  -- 필수항목 ① 연차 사유 (구체적)
  reason                text NOT NULL,
  -- 필수항목 ② 업무 인수인계 + 대리인
  handover_notes        text,
  delegate_employee_id  uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  delegate_name_text    text,
  -- 필수항목 ③ 병원 방문 계획 (병가 시)
  hospital_plan         text,
  -- 필수항목 ④ 당일 상신 가능(true) / 불가 시 익일 사후 상신(false) + 비고
  same_day_filing       boolean,
  filing_note           text,

  -- 보완 첨부 (출근 후) — emergency-leave-files/{employee_id}/{uuid}-{name}
  attachment_path       text,
  attachment_uploaded_at timestamptz,

  -- 상태 머신: filed → (supplemented) → promoted | cancelled
  status                text NOT NULL DEFAULT 'filed'
                          CHECK (status IN ('filed','supplemented','promoted','cancelled')),

  -- 정식 전환 링크 (leave_requests 양방향)
  promoted_to_leave_id  uuid REFERENCES public.leave_requests(id) ON DELETE SET NULL,
  promoted_at           timestamptz,

  -- 무급 처리 (관리자 수동 — 차감/무급/혼합)
  paid_deduct_days      numeric(4,1) NOT NULL DEFAULT 0 CHECK (paid_deduct_days >= 0),
  unpaid_days           numeric(4,1) NOT NULL DEFAULT 0 CHECK (unpaid_days >= 0),
  payout_decided_by     uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  payout_decided_at     timestamptz,

  -- 발송 추적 (임원급 이메일 발송 완료 시각)
  notified_at           timestamptz,

  created_by            uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emergency_leave_emp_idx
  ON public.emergency_leave_requests (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS emergency_leave_status_idx
  ON public.emergency_leave_requests (status);
CREATE INDEX IF NOT EXISTS emergency_leave_promoted_idx
  ON public.emergency_leave_requests (promoted_to_leave_id);

-- updated_at 자동 갱신 (기존 공통 함수 재사용)
DROP TRIGGER IF EXISTS trg_emergency_leave_updated_at ON public.emergency_leave_requests;
CREATE TRIGGER trg_emergency_leave_updated_at
  BEFORE UPDATE ON public.emergency_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.emergency_leave_requests ENABLE ROW LEVEL SECURITY;

-- ─── RLS 정책 ──────────────────────────────────────────────────
-- 주의: employees.id = auth.uid() (employees.id 가 auth.users FK).
-- ⚠️ 관리자 role 목록에 hr_admin 반드시 포함 (PDCA #3 교훈 — is_admin() 은 hr_admin 누락).
--    화면 가드(leave.tsx)와 동일하게 인라인 명시.

-- SELECT: 본인 + 임원급 (민감 건강정보 → 임원급 외 비공개)
DROP POLICY IF EXISTS "emergency_leave_select" ON public.emergency_leave_requests;
CREATE POLICY "emergency_leave_select"
ON public.emergency_leave_requests FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid()
      AND e.role IN ('director','division_head','ceo','admin','hr_admin')
  )
);

-- INSERT: 본인만 (employee_id = self, created_by = self)
DROP POLICY IF EXISTS "emergency_leave_insert_self" ON public.emergency_leave_requests;
CREATE POLICY "emergency_leave_insert_self"
ON public.emergency_leave_requests FOR INSERT TO authenticated
WITH CHECK (employee_id = auth.uid());

-- UPDATE(본인): 보완자료 업로드 / 내용 수정 / 전환(status='promoted') / 취소
DROP POLICY IF EXISTS "emergency_leave_update_self" ON public.emergency_leave_requests;
CREATE POLICY "emergency_leave_update_self"
ON public.emergency_leave_requests FOR UPDATE TO authenticated
USING (employee_id = auth.uid())
WITH CHECK (employee_id = auth.uid());

-- UPDATE(관리자): 무급 확정 등
DROP POLICY IF EXISTS "emergency_leave_update_admin" ON public.emergency_leave_requests;
CREATE POLICY "emergency_leave_update_admin"
ON public.emergency_leave_requests FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.employees e
          WHERE e.id = auth.uid()
            AND e.role IN ('director','division_head','ceo','admin','hr_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e
          WHERE e.id = auth.uid()
            AND e.role IN ('director','division_head','ceo','admin','hr_admin'))
);

-- DELETE 차단 (취소는 status='cancelled' soft)
DROP POLICY IF EXISTS "emergency_leave_no_delete" ON public.emergency_leave_requests;
CREATE POLICY "emergency_leave_no_delete"
ON public.emergency_leave_requests FOR DELETE TO authenticated USING (false);

COMMENT ON TABLE public.emergency_leave_requests IS
  '긴급연차 — 결재 없이 즉시 통보(임원급 이메일), 출근 후 보완자료 첨부 → 정식 연차(leave_requests)로 전환. 무급분은 unpaid_days 에만 기록(트리거 과차감 방지).';
COMMENT ON COLUMN public.emergency_leave_requests.status IS
  'filed(통보됨) → supplemented(보완자료 업로드) → promoted(정식 전환) | cancelled(취소)';
COMMENT ON COLUMN public.emergency_leave_requests.unpaid_days IS
  '무급 대체 일수. leave_requests.days_count 에는 포함하지 않음 (trigger_leave_balance 가 days_count 만 차감하므로).';

-- ─── Storage 버킷 ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('emergency-leave-files','emergency-leave-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage 정책 (db-exec.mjs/postgres 권한으로 적용됨 — 일반 Supabase migration runner 는
--   storage.objects 권한 부족으로 실패할 수 있어 db-exec 경유 적용. 멱등.)
--   버킷은 public=false 유지. 클라이언트는 createSignedUrl 사용.
DROP POLICY IF EXISTS emergency_leave_files_insert ON storage.objects;
CREATE POLICY emergency_leave_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'emergency-leave-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS emergency_leave_files_select ON storage.objects;
CREATE POLICY emergency_leave_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'emergency-leave-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = auth.uid()
          AND e.role IN ('director','division_head','ceo','admin','hr_admin')
      )
    )
  );

COMMIT;
