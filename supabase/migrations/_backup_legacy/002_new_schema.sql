-- =====================================================================
-- InterOhrigin HR 인사평가 시스템 — 신규 스키마
-- Supabase SQL Editor에서 실행하세요
--
-- ⚠ 기존 001 마이그레이션을 실행한 적이 있다면
--   아래 DROP 블록의 주석을 해제하고 먼저 실행하세요.
-- =====================================================================

-- =====================================================================
-- 0. 기존 테이블 정리 (필요 시 주석 해제)
-- =====================================================================
/*
DROP TABLE IF EXISTS public.evaluation_scores    CASCADE;
DROP TABLE IF EXISTS public.evaluations          CASCADE;
DROP TABLE IF EXISTS public.evaluation_criteria  CASCADE;
DROP TABLE IF EXISTS public.evaluation_periods   CASCADE;
DROP TABLE IF EXISTS public.profiles             CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
*/

-- =====================================================================
-- 1. 유틸리티 함수: updated_at 자동 갱신 트리거
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 2. departments (부서)
-- =====================================================================
CREATE TABLE public.departments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- =====================================================================
-- 3. employees (직원 — auth.users 확장)
-- =====================================================================
CREATE TABLE public.employees (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  email         text        NOT NULL,
  department_id uuid        REFERENCES public.departments(id),
  role          text        NOT NULL CHECK (role IN (
                              'employee','leader','director_kim','director_kang','executive','ceo'
                            )),
  is_active     boolean     DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================================
-- 4. evaluation_periods (평가 기간)
-- =====================================================================
CREATE TABLE public.evaluation_periods (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  year       integer     NOT NULL,
  quarter    integer     NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  status     text        DEFAULT 'draft' CHECK (status IN ('draft','in_progress','completed')),
  start_date date,
  end_date   date,
  created_at timestamptz DEFAULT now(),
  UNIQUE (year, quarter)
);

-- =====================================================================
-- 5. evaluation_categories (평가 카테고리)
-- =====================================================================
CREATE TABLE public.evaluation_categories (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text    NOT NULL,
  weight     decimal NOT NULL,
  sort_order integer NOT NULL
);

-- =====================================================================
-- 6. evaluation_items (평가 항목)
-- =====================================================================
CREATE TABLE public.evaluation_items (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid    NOT NULL REFERENCES public.evaluation_categories(id) ON DELETE CASCADE,
  name        text    NOT NULL,
  description text,
  max_score   integer DEFAULT 10,
  sort_order  integer NOT NULL,
  is_active   boolean DEFAULT true
);

-- =====================================================================
-- 7. evaluation_targets (직원별 평가 시트)
-- =====================================================================
CREATE TABLE public.evaluation_targets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id   uuid        NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  employee_id uuid        NOT NULL REFERENCES public.employees(id),
  status      text        DEFAULT 'pending' CHECK (status IN (
                            'pending','self_done','leader_done','director_kim_done',
                            'director_kang_done','executive_done','ceo_done','completed'
                          )),
  final_score decimal,
  grade       text        CHECK (grade IN ('S','A','B','C','D')),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (period_id, employee_id)
);

CREATE TRIGGER trg_evaluation_targets_updated_at
  BEFORE UPDATE ON public.evaluation_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================================
-- 8. self_evaluations (자기평가)
-- =====================================================================
CREATE TABLE public.self_evaluations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id          uuid        NOT NULL REFERENCES public.evaluation_targets(id) ON DELETE CASCADE,
  item_id            uuid        NOT NULL REFERENCES public.evaluation_items(id),
  personal_goal      text,
  achievement_method text,
  self_comment       text,
  score              integer     CHECK (score BETWEEN 0 AND 10),
  is_draft           boolean     DEFAULT true,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  UNIQUE (target_id, item_id)
);

CREATE TRIGGER trg_self_evaluations_updated_at
  BEFORE UPDATE ON public.self_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================================
-- 9. evaluator_scores (평가자 점수)
-- =====================================================================
CREATE TABLE public.evaluator_scores (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id      uuid        NOT NULL REFERENCES public.evaluation_targets(id) ON DELETE CASCADE,
  item_id        uuid        NOT NULL REFERENCES public.evaluation_items(id),
  evaluator_id   uuid        NOT NULL REFERENCES public.employees(id),
  evaluator_role text        NOT NULL CHECK (evaluator_role IN (
                               'leader','director_kim','director_kang','executive','ceo'
                             )),
  score          integer     CHECK (score BETWEEN 0 AND 10),
  comment        text,
  is_draft       boolean     DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (target_id, item_id, evaluator_role)
);

CREATE TRIGGER trg_evaluator_scores_updated_at
  BEFORE UPDATE ON public.evaluator_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================================
-- 10. evaluator_comments (평가자 종합 코멘트)
-- =====================================================================
CREATE TABLE public.evaluator_comments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id      uuid        NOT NULL REFERENCES public.evaluation_targets(id) ON DELETE CASCADE,
  evaluator_id   uuid        NOT NULL REFERENCES public.employees(id),
  evaluator_role text        NOT NULL,
  strength       text,
  improvement    text,
  overall        text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (target_id, evaluator_role)
);

CREATE TRIGGER trg_evaluator_comments_updated_at
  BEFORE UPDATE ON public.evaluator_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================================
-- 11. evaluation_weights (평가자별 가중치)
-- =====================================================================
CREATE TABLE public.evaluation_weights (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id      uuid    NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  evaluator_role text    NOT NULL CHECK (evaluator_role IN (
                           'self','leader','director_kim','director_kang','executive','ceo'
                         )),
  weight         decimal NOT NULL,
  UNIQUE (period_id, evaluator_role)
);

-- =====================================================================
-- 12. 인덱스
-- =====================================================================
CREATE INDEX idx_employees_department_id   ON public.employees(department_id);
CREATE INDEX idx_employees_role            ON public.employees(role);

CREATE INDEX idx_evaluation_targets_period   ON public.evaluation_targets(period_id);
CREATE INDEX idx_evaluation_targets_employee ON public.evaluation_targets(employee_id);
CREATE INDEX idx_evaluation_targets_status   ON public.evaluation_targets(status);

CREATE INDEX idx_self_evaluations_target     ON public.self_evaluations(target_id);

CREATE INDEX idx_evaluator_scores_target     ON public.evaluator_scores(target_id);
CREATE INDEX idx_evaluator_scores_role       ON public.evaluator_scores(evaluator_role);

-- =====================================================================
-- 13. RLS (Row Level Security)
-- =====================================================================

-- 모든 테이블 RLS 활성화
ALTER TABLE public.departments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_periods   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_targets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_evaluations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluator_scores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluator_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_weights   ENABLE ROW LEVEL SECURITY;

-- ─── 헬퍼 함수: 현재 사용자 역할 조회 ──────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
  SELECT role FROM public.employees WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── 헬퍼 함수: 관리자 급 이상 여부 ────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_management()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid()
      AND role IN ('director_kim','director_kang','executive','ceo')
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── departments ────────────────────────────────────────────────────
CREATE POLICY "departments_select_all"
  ON public.departments FOR SELECT
  USING (true);

CREATE POLICY "departments_manage_management"
  ON public.departments FOR ALL
  USING (public.is_management());

-- ─── employees ──────────────────────────────────────────────────────
-- 로그인 사용자는 본인 정보를 읽을 수 있음
CREATE POLICY "employees_select_self"
  ON public.employees FOR SELECT
  USING (id = auth.uid());

-- 관리자급은 전체 직원 조회
CREATE POLICY "employees_select_management"
  ON public.employees FOR SELECT
  USING (public.is_management());

-- 팀장은 같은 부서 직원 조회
CREATE POLICY "employees_select_leader"
  ON public.employees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees AS me
      WHERE me.id = auth.uid()
        AND me.role = 'leader'
        AND me.department_id = employees.department_id
    )
  );

-- 관리자급만 직원 정보 수정
CREATE POLICY "employees_manage_management"
  ON public.employees FOR ALL
  USING (public.is_management());

-- ─── evaluation_periods ─────────────────────────────────────────────
CREATE POLICY "periods_select_all"
  ON public.evaluation_periods FOR SELECT
  USING (true);

CREATE POLICY "periods_manage_management"
  ON public.evaluation_periods FOR ALL
  USING (public.is_management());

-- ─── evaluation_categories ──────────────────────────────────────────
CREATE POLICY "categories_select_all"
  ON public.evaluation_categories FOR SELECT
  USING (true);

CREATE POLICY "categories_manage_management"
  ON public.evaluation_categories FOR ALL
  USING (public.is_management());

-- ─── evaluation_items ───────────────────────────────────────────────
CREATE POLICY "items_select_all"
  ON public.evaluation_items FOR SELECT
  USING (true);

CREATE POLICY "items_manage_management"
  ON public.evaluation_items FOR ALL
  USING (public.is_management());

-- ─── evaluation_targets ─────────────────────────────────────────────
-- 본인 평가 시트 조회
CREATE POLICY "targets_select_self"
  ON public.evaluation_targets FOR SELECT
  USING (employee_id = auth.uid());

-- 팀장: 같은 부서 직원 평가 시트 조회
CREATE POLICY "targets_select_leader"
  ON public.evaluation_targets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees AS me
      JOIN public.employees AS target_emp ON target_emp.id = evaluation_targets.employee_id
      WHERE me.id = auth.uid()
        AND me.role = 'leader'
        AND me.department_id = target_emp.department_id
    )
  );

-- 관리자급: 전체 조회 + 관리
CREATE POLICY "targets_select_management"
  ON public.evaluation_targets FOR SELECT
  USING (public.is_management());

CREATE POLICY "targets_manage_management"
  ON public.evaluation_targets FOR ALL
  USING (public.is_management());

-- ─── self_evaluations ───────────────────────────────────────────────
-- 본인 자기평가 읽기/쓰기
CREATE POLICY "self_eval_select_own"
  ON public.self_evaluations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = self_evaluations.target_id
        AND t.employee_id = auth.uid()
    )
  );

CREATE POLICY "self_eval_insert_own"
  ON public.self_evaluations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = self_evaluations.target_id
        AND t.employee_id = auth.uid()
    )
  );

CREATE POLICY "self_eval_update_own"
  ON public.self_evaluations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = self_evaluations.target_id
        AND t.employee_id = auth.uid()
    )
  );

-- 팀장은 부서 직원 자기평가 조회 가능
CREATE POLICY "self_eval_select_leader"
  ON public.self_evaluations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      JOIN public.employees target_emp ON target_emp.id = t.employee_id
      JOIN public.employees me ON me.id = auth.uid()
      WHERE t.id = self_evaluations.target_id
        AND me.role = 'leader'
        AND me.department_id = target_emp.department_id
    )
  );

-- 관리자급: 전체
CREATE POLICY "self_eval_manage_management"
  ON public.self_evaluations FOR SELECT
  USING (public.is_management());

-- ─── evaluator_scores ───────────────────────────────────────────────
-- 본인이 평가자인 점수 관리
CREATE POLICY "eval_scores_own"
  ON public.evaluator_scores FOR ALL
  USING (evaluator_id = auth.uid());

-- 피평가자 본인은 확정된 점수 조회 (completed 상태)
CREATE POLICY "eval_scores_select_employee"
  ON public.evaluator_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_scores.target_id
        AND t.employee_id = auth.uid()
        AND t.status = 'completed'
    )
  );

-- 관리자급: 전체 조회
CREATE POLICY "eval_scores_select_management"
  ON public.evaluator_scores FOR SELECT
  USING (public.is_management());

-- ─── evaluator_comments ─────────────────────────────────────────────
-- 본인이 평가자인 코멘트 관리
CREATE POLICY "eval_comments_own"
  ON public.evaluator_comments FOR ALL
  USING (evaluator_id = auth.uid());

-- 피평가자 본인은 확정된 코멘트 조회
CREATE POLICY "eval_comments_select_employee"
  ON public.evaluator_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_comments.target_id
        AND t.employee_id = auth.uid()
        AND t.status = 'completed'
    )
  );

-- 관리자급: 전체 조회
CREATE POLICY "eval_comments_select_management"
  ON public.evaluator_comments FOR SELECT
  USING (public.is_management());

-- ─── evaluation_weights ─────────────────────────────────────────────
CREATE POLICY "weights_select_all"
  ON public.evaluation_weights FOR SELECT
  USING (true);

CREATE POLICY "weights_manage_management"
  ON public.evaluation_weights FOR ALL
  USING (public.is_management());

-- =====================================================================
-- 완료! 위 SQL을 Supabase SQL Editor에 붙여넣고 "Run" 을 누르세요.
-- =====================================================================
