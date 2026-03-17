-- =====================================================================
-- InterOhrigin HR — P-22: 업무 관리 모듈 테이블
-- work-milestone 연동 대신 HR 시스템 내 자체 구축
-- =====================================================================

-- ─── projects (프로젝트) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  description     text,
  department_id   uuid        REFERENCES public.departments(id),
  owner_id        uuid        REFERENCES public.employees(id),
  status          text        DEFAULT 'active' CHECK (status IN ('planning','active','completed','cancelled')),
  start_date      date,
  end_date        date,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── tasks (작업/ToDo) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        REFERENCES public.projects(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  description     text,
  assignee_id     uuid        REFERENCES public.employees(id),
  priority        text        DEFAULT 'normal' CHECK (priority IN ('urgent','high','normal','low')),
  status          text        DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','cancelled')),
  due_date        date,
  estimated_hours decimal,
  actual_hours    decimal,
  ai_generated    boolean     DEFAULT false,
  parent_task_id  uuid        REFERENCES public.tasks(id),
  sort_order      integer     DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── daily_reports (일일 업무 보고서) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id),
  report_date     date        NOT NULL,
  tasks_completed jsonb       DEFAULT '[]'::jsonb,
  tasks_in_progress jsonb     DEFAULT '[]'::jsonb,
  tasks_planned   jsonb       DEFAULT '[]'::jsonb,
  carryover_tasks jsonb       DEFAULT '[]'::jsonb,
  ai_priority_suggestion text,
  satisfaction_score integer  CHECK (satisfaction_score BETWEEN 1 AND 10),
  satisfaction_comment text,
  blockers        text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (employee_id, report_date)
);

CREATE TRIGGER trg_daily_reports_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── chat_messages (AI 업무 챗봇 메시지) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id),
  role            text        NOT NULL CHECK (role IN ('user','assistant')),
  content         text        NOT NULL,
  metadata        jsonb       DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT now()
);

-- ─── 인덱스 ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_department ON public.projects(department_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_daily_reports_employee ON public.daily_reports(employee_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON public.daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_chat_messages_employee ON public.chat_messages(employee_id);

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- projects: 인증 사용자 읽기, 관리자 CRUD
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_manage" ON public.projects
  FOR ALL TO authenticated USING (public.is_admin() OR owner_id = auth.uid());

-- tasks: 인증 사용자 읽기, 담당자/관리자 CRUD
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (assignee_id = auth.uid() OR public.is_admin());
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE TO authenticated USING (public.is_admin());

-- daily_reports: 본인 + 관리자
CREATE POLICY "daily_reports_select" ON public.daily_reports
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "daily_reports_insert" ON public.daily_reports
  FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());
CREATE POLICY "daily_reports_update" ON public.daily_reports
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

-- chat_messages: 본인만
CREATE POLICY "chat_messages_select" ON public.chat_messages
  FOR SELECT TO authenticated USING (employee_id = auth.uid());
CREATE POLICY "chat_messages_insert" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());

-- =====================================================================
-- 퇴사 관리 확장: exit_surveys에 AI 분석 필드 추가는 jsonb 활용
-- (기존 테이블 ALTER 금지 원칙이지만 exit_surveys는 신규 테이블이므로 가능)
-- =====================================================================
