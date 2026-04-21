-- ============================================================
-- Migration 050: 퇴직자 인수인계 모듈 (B1)
-- ============================================================
-- 3개 테이블: handover_documents / handover_assets / handover_chats
-- employees 테이블은 FK만 사용 (ALTER 금지 규칙 준수)
-- ============================================================

-- ─── 1) handover_documents: 인수인계서 본문 ────────────────────
CREATE TABLE IF NOT EXISTS public.handover_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  successor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',  -- draft|generated|reviewed|completed
  content jsonb,                          -- { overview, projects[], daily_summary, pending_tasks[], knowhow, contacts[] }
  ai_generated_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id)
);

CREATE INDEX IF NOT EXISTS idx_handover_documents_employee ON public.handover_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_handover_documents_successor ON public.handover_documents(successor_id);
CREATE INDEX IF NOT EXISTS idx_handover_documents_status ON public.handover_documents(status);

-- ─── 2) handover_assets: 자산·계약서·문서 위치 인벤토리 ─────────
CREATE TABLE IF NOT EXISTS public.handover_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  asset_type text NOT NULL,              -- contract|device|document|account|other
  name text NOT NULL,
  location text,                          -- "구글드라이브 > IO인사 > 계약서 > ○○.pdf"
  url text,                               -- 클라우드 URL
  note text,
  return_status text NOT NULL DEFAULT 'pending',  -- pending|returned|n_a
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handover_assets_employee ON public.handover_assets(employee_id);
CREATE INDEX IF NOT EXISTS idx_handover_assets_type ON public.handover_assets(asset_type);

-- ─── 3) handover_chats: 후임자 챗봇 대화 로그 ────────────────
CREATE TABLE IF NOT EXISTS public.handover_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_id uuid NOT NULL REFERENCES public.handover_documents(id) ON DELETE CASCADE,
  asker_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  question text NOT NULL,
  answer text,
  sources jsonb,                          -- [{ type:'project'|'report'|'asset', ref_id, snippet }]
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handover_chats_handover ON public.handover_chats(handover_id);
CREATE INDEX IF NOT EXISTS idx_handover_chats_asker ON public.handover_chats(asker_id);

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.handover_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handover_assets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handover_chats     ENABLE ROW LEVEL SECURITY;

-- SELECT: 관리자 / 본인(퇴사자) / 후임자만
DROP POLICY IF EXISTS handover_documents_select ON public.handover_documents;
CREATE POLICY handover_documents_select ON public.handover_documents
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR employee_id = auth.uid()
    OR successor_id = auth.uid()
  );

DROP POLICY IF EXISTS handover_documents_insert ON public.handover_documents;
CREATE POLICY handover_documents_insert ON public.handover_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS handover_documents_update ON public.handover_documents;
CREATE POLICY handover_documents_update ON public.handover_documents
  FOR UPDATE TO authenticated USING (
    public.is_admin()
    OR employee_id = auth.uid()  -- 본인도 검수 단계에서 수정 가능
  );

DROP POLICY IF EXISTS handover_documents_delete ON public.handover_documents;
CREATE POLICY handover_documents_delete ON public.handover_documents
  FOR DELETE TO authenticated USING (public.is_admin());

-- handover_assets: 문서와 동일 접근 규칙
DROP POLICY IF EXISTS handover_assets_select ON public.handover_assets;
CREATE POLICY handover_assets_select ON public.handover_assets
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.handover_documents d
      WHERE d.employee_id = handover_assets.employee_id
        AND d.successor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS handover_assets_write ON public.handover_assets;
CREATE POLICY handover_assets_write ON public.handover_assets
  FOR ALL TO authenticated
  USING (public.is_admin() OR employee_id = auth.uid())
  WITH CHECK (public.is_admin() OR employee_id = auth.uid());

-- handover_chats: handover_documents와 동일 접근
DROP POLICY IF EXISTS handover_chats_select ON public.handover_chats;
CREATE POLICY handover_chats_select ON public.handover_chats
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR asker_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.handover_documents d
      WHERE d.id = handover_chats.handover_id
        AND (d.successor_id = auth.uid() OR d.employee_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS handover_chats_insert ON public.handover_chats;
CREATE POLICY handover_chats_insert ON public.handover_chats
  FOR INSERT TO authenticated WITH CHECK (
    public.is_admin()
    OR asker_id = auth.uid()
  );

-- ─── updated_at 자동 갱신 트리거 ─────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_handover_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS handover_documents_updated_at ON public.handover_documents;
CREATE TRIGGER handover_documents_updated_at
  BEFORE UPDATE ON public.handover_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_handover_updated_at();

DROP TRIGGER IF EXISTS handover_assets_updated_at ON public.handover_assets;
CREATE TRIGGER handover_assets_updated_at
  BEFORE UPDATE ON public.handover_assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_handover_updated_at();
