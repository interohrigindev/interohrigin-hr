-- =====================================================================
-- 024: 프로젝트 협업 보드 테이블 (P-BOARD-01)
-- project_boards, pipeline_stages, project_updates,
-- board_permissions, project_templates
-- =====================================================================

-- ─── 1. 프로젝트 보드 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_boards (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           text        NOT NULL,
  category        text        DEFAULT '제품',
  project_name    text        NOT NULL,
  launch_date     date,
  status          text        DEFAULT 'active' CHECK (status IN ('active','holding','completed','cancelled')),
  priority        integer     DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  assignee_ids    uuid[]      NOT NULL DEFAULT '{}',
  department      text        DEFAULT '브랜드사업본부',
  template_type   text,
  created_by      uuid        REFERENCES public.employees(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER trg_project_boards_updated_at
  BEFORE UPDATE ON public.project_boards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── 2. 파이프라인 단계 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid        NOT NULL REFERENCES public.project_boards(id) ON DELETE CASCADE,
  stage_name            text        NOT NULL,
  stage_order           integer     NOT NULL,
  status                text        DEFAULT '시작전' CHECK (status IN ('완료','진행중','시작전','홀딩')),
  deadline              date,
  completed_at          timestamptz,
  editable_departments  text[]      DEFAULT '{"브랜드사업본부"}',
  stage_assignee_ids    uuid[],
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TRIGGER trg_pipeline_stages_updated_at
  BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── 3. 프로젝트 업데이트 로그 ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_updates (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid        NOT NULL REFERENCES public.project_boards(id) ON DELETE CASCADE,
  stage_id              uuid        REFERENCES public.pipeline_stages(id),
  author_id             uuid        NOT NULL REFERENCES public.employees(id),
  content               text        NOT NULL,
  status_changed_from   text,
  status_changed_to     text,
  attachments           jsonb       DEFAULT '[]',
  is_cross_dept_request boolean     DEFAULT false,
  requested_department  text,
  request_status        text        CHECK (request_status IN ('pending','accepted','completed','rejected')),
  request_completed_at  timestamptz,
  created_at            timestamptz DEFAULT now()
);

-- ─── 4. 보드 권한 설정 ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_permissions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  department            text        NOT NULL UNIQUE,
  can_create_project    boolean     DEFAULT false,
  can_delete_project    boolean     DEFAULT false,
  can_edit_all_stages   boolean     DEFAULT false,
  can_comment           boolean     DEFAULT true,
  can_view              boolean     DEFAULT true,
  editable_stages       text[]      DEFAULT '{}',
  updated_at            timestamptz DEFAULT now()
);

-- ─── 5. 프로젝트 템플릿 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  template_type   text        NOT NULL,
  stages          jsonb       NOT NULL,
  avg_total_days  integer,
  created_at      timestamptz DEFAULT now()
);

-- ═══════════════════════════════════
-- 인덱스
-- ═══════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_project_boards_brand ON public.project_boards(brand);
CREATE INDEX IF NOT EXISTS idx_project_boards_status ON public.project_boards(status);
CREATE INDEX IF NOT EXISTS idx_project_boards_created ON public.project_boards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_project ON public.pipeline_stages(project_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_status ON public.pipeline_stages(status);
CREATE INDEX IF NOT EXISTS idx_project_updates_project ON public.project_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_project_updates_created ON public.project_updates(created_at DESC);

-- ═══════════════════════════════════
-- Realtime
-- ═══════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_updates;

-- ═══════════════════════════════════
-- RLS
-- ═══════════════════════════════════
ALTER TABLE public.project_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_boards_select" ON public.project_boards
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_boards_insert" ON public.project_boards
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "project_boards_update" ON public.project_boards
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "project_boards_delete" ON public.project_boards
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "pipeline_stages_select" ON public.pipeline_stages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pipeline_stages_insert" ON public.pipeline_stages
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pipeline_stages_update" ON public.pipeline_stages
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "pipeline_stages_delete" ON public.pipeline_stages
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "project_updates_select" ON public.project_updates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_updates_insert" ON public.project_updates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "board_permissions_select" ON public.board_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "board_permissions_manage" ON public.board_permissions
  FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "project_templates_select" ON public.project_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_templates_manage" ON public.project_templates
  FOR ALL TO authenticated USING (public.is_admin());

-- ═══════════════════════════════════
-- 초기 데이터
-- ═══════════════════════════════════
INSERT INTO public.board_permissions (department, can_create_project, can_delete_project, can_edit_all_stages, editable_stages) VALUES
  ('브랜드사업본부', true, true, true, '{"시장조사","제형","패키지","판매가","상세페이지","촬영","마케팅"}'),
  ('디자인팀', false, false, false, '{"패키지","상세페이지"}'),
  ('영업팀', false, false, false, '{"판매가","마케팅"}'),
  ('경영지원팀', false, false, false, '{}'),
  ('임원', true, true, true, '{"시장조사","제형","패키지","판매가","상세페이지","촬영","마케팅"}')
ON CONFLICT (department) DO NOTHING;

INSERT INTO public.project_templates (name, template_type, stages, avg_total_days) VALUES
  ('신제품 출시', 'new_product', '[
    {"name":"시장조사","order":1,"default_duration_days":14,"editable_departments":["브랜드사업본부"]},
    {"name":"제형","order":2,"default_duration_days":30,"editable_departments":["브랜드사업본부"]},
    {"name":"패키지","order":3,"default_duration_days":21,"editable_departments":["브랜드사업본부","디자인팀"]},
    {"name":"판매가","order":4,"default_duration_days":7,"editable_departments":["브랜드사업본부","영업팀"]},
    {"name":"상세페이지","order":5,"default_duration_days":14,"editable_departments":["브랜드사업본부","디자인팀"]},
    {"name":"촬영","order":6,"default_duration_days":7,"editable_departments":["브랜드사업본부"]},
    {"name":"마케팅","order":7,"default_duration_days":21,"editable_departments":["브랜드사업본부","영업팀"]}
  ]', 120),
  ('리뉴얼', 'renewal', '[
    {"name":"제형","order":1,"default_duration_days":14,"editable_departments":["브랜드사업본부"]},
    {"name":"패키지","order":2,"default_duration_days":14,"editable_departments":["브랜드사업본부","디자인팀"]},
    {"name":"판매가","order":3,"default_duration_days":7,"editable_departments":["브랜드사업본부","영업팀"]},
    {"name":"상세페이지","order":4,"default_duration_days":10,"editable_departments":["브랜드사업본부","디자인팀"]},
    {"name":"마케팅","order":5,"default_duration_days":14,"editable_departments":["브랜드사업본부","영업팀"]}
  ]', 60),
  ('용기 변경', 'repackage', '[
    {"name":"패키지","order":1,"default_duration_days":14,"editable_departments":["브랜드사업본부","디자인팀"]},
    {"name":"상세페이지","order":2,"default_duration_days":7,"editable_departments":["브랜드사업본부","디자인팀"]},
    {"name":"마케팅","order":3,"default_duration_days":7,"editable_departments":["브랜드사업본부","영업팀"]}
  ]', 30)
ON CONFLICT DO NOTHING;
