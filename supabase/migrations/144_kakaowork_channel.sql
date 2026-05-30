-- 144: KakaoWork 채널 — PDCA #6 Phase 7 (plug-and-play)
-- Design Ref: §3.3 — notification_channel_configs 컬럼 추가 + employee_kakaowork_map 신규
-- 절대 규칙 준수: employees / evaluations / evaluation_items / users 4테이블 변경 0

-- ============================================================
-- 1. notification_channel_configs 확장 (4테이블 외 ALTER 허용)
-- ============================================================
ALTER TABLE public.notification_channel_configs
  ADD COLUMN IF NOT EXISTS kakaowork_app_key text,    -- Bot Access Token (Bearer)
  ADD COLUMN IF NOT EXISTS kakaowork_bot_name text,   -- 표시용 (e.g. 'HR결재봇')
  ADD COLUMN IF NOT EXISTS kakaowork_enabled boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. employees ↔ KakaoWork user 매핑 (employees ALTER 금지 → 별도 테이블)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employee_kakaowork_map (
  employee_id        uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  kakaowork_user_id  text NOT NULL,           -- KakaoWork users.id
  email_used         text NOT NULL,           -- 매핑 기준 이메일 (감사용)
  display_name       text,                    -- KakaoWork 표시명 (참고용)
  synced_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kakaowork_user_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_kakaowork_map_user
  ON public.employee_kakaowork_map (kakaowork_user_id);

ALTER TABLE public.employee_kakaowork_map ENABLE ROW LEVEL SECURITY;

-- 관리자만 전체 수정
DROP POLICY IF EXISTS "kakaowork_map_admin_all" ON public.employee_kakaowork_map;
CREATE POLICY "kakaowork_map_admin_all"
ON public.employee_kakaowork_map FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('admin','hr_admin','ceo'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.role IN ('admin','hr_admin','ceo'))
);

-- 본인 매핑은 본인이 조회 가능 (디버깅용)
DROP POLICY IF EXISTS "kakaowork_map_self_select" ON public.employee_kakaowork_map;
CREATE POLICY "kakaowork_map_self_select"
ON public.employee_kakaowork_map FOR SELECT TO authenticated
USING (employee_id = auth.uid());

COMMENT ON TABLE public.employee_kakaowork_map IS
  '직원 ↔ KakaoWork user_id 매핑. 이메일 기준 동기화. PDCA #6 Phase 7';
COMMENT ON COLUMN public.notification_channel_configs.kakaowork_enabled IS
  'KakaoWork 채널 전체 ON/OFF 토글. false 면 디스패처가 자동 skip';
COMMENT ON COLUMN public.notification_channel_configs.kakaowork_app_key IS
  'KakaoWork Bot Access Token (Bearer). 관리자 설정 화면에서 입력';
