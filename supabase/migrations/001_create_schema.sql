-- =============================================
-- InterOhrigin HR 인사평가 시스템 데이터베이스 스키마
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 1. profiles 테이블 (auth.users 확장)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  department text,
  position text,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee')),
  manager_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. evaluation_periods 테이블 (평가 기간)
CREATE TABLE public.evaluation_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  year integer NOT NULL,
  half text NOT NULL CHECK (half IN ('H1', 'H2')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  start_date date,
  end_date date,
  created_at timestamptz DEFAULT now()
);

-- 3. evaluation_criteria 테이블 (평가 항목)
CREATE TABLE public.evaluation_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  category text NOT NULL,
  name text NOT NULL,
  description text,
  weight integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

-- 4. evaluations 테이블 (평가)
CREATE TABLE public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  evaluator_id uuid NOT NULL REFERENCES public.profiles(id),
  type text NOT NULL CHECK (type IN ('self', 'manager')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'confirmed')),
  total_score numeric,
  grade text CHECK (grade IN ('S', 'A', 'B', 'C', 'D')),
  comment text,
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. evaluation_scores 테이블 (항목별 점수)
CREATE TABLE public.evaluation_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  criteria_id uuid NOT NULL REFERENCES public.evaluation_criteria(id) ON DELETE CASCADE,
  score integer CHECK (score >= 1 AND score <= 5),
  comment text
);

-- =============================================
-- RLS 정책
-- =============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_scores ENABLE ROW LEVEL SECURITY;

-- profiles 정책
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Managers can read team profiles" ON public.profiles
  FOR SELECT USING (manager_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- evaluation_periods 정책
CREATE POLICY "Everyone can read periods" ON public.evaluation_periods
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage periods" ON public.evaluation_periods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- evaluation_criteria 정책
CREATE POLICY "Everyone can read criteria" ON public.evaluation_criteria
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage criteria" ON public.evaluation_criteria
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- evaluations 정책
CREATE POLICY "Users can read own evaluations" ON public.evaluations
  FOR SELECT USING (employee_id = auth.uid() OR evaluator_id = auth.uid());

CREATE POLICY "Users can insert own self-evaluations" ON public.evaluations
  FOR INSERT WITH CHECK (evaluator_id = auth.uid());

CREATE POLICY "Users can update own draft evaluations" ON public.evaluations
  FOR UPDATE USING (evaluator_id = auth.uid() AND status = 'draft');

CREATE POLICY "Admins can read all evaluations" ON public.evaluations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage all evaluations" ON public.evaluations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- evaluation_scores 정책
CREATE POLICY "Users can read own scores" ON public.evaluation_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.evaluations
      WHERE evaluations.id = evaluation_scores.evaluation_id
      AND (evaluations.employee_id = auth.uid() OR evaluations.evaluator_id = auth.uid())
    )
  );

CREATE POLICY "Users can manage own evaluation scores" ON public.evaluation_scores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.evaluations
      WHERE evaluations.id = evaluation_scores.evaluation_id
      AND evaluations.evaluator_id = auth.uid()
      AND evaluations.status = 'draft'
    )
  );

CREATE POLICY "Admins can manage all scores" ON public.evaluation_scores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- 트리거: updated_at 자동 갱신
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER on_evaluations_updated
  BEFORE UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- 시드 데이터: 기본 평가 기간 및 항목
-- =============================================

-- 2026년 상반기 평가 기간
INSERT INTO public.evaluation_periods (id, name, year, half, status, start_date, end_date)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '2026년 상반기 인사평가',
  2026,
  'H1',
  'active',
  '2026-01-01',
  '2026-06-30'
);

-- 업무성과 (40%)
INSERT INTO public.evaluation_criteria (period_id, category, name, description, weight, sort_order) VALUES
('a0000000-0000-0000-0000-000000000001', '업무성과', '목표달성도', '설정된 업무 목표의 달성 정도', 15, 1),
('a0000000-0000-0000-0000-000000000001', '업무성과', '업무품질', '업무 결과물의 정확성과 완성도', 13, 2),
('a0000000-0000-0000-0000-000000000001', '업무성과', '업무효율성', '시간 및 자원의 효율적 활용', 12, 3);

-- 업무능력 (30%)
INSERT INTO public.evaluation_criteria (period_id, category, name, description, weight, sort_order) VALUES
('a0000000-0000-0000-0000-000000000001', '업무능력', '전문지식', '담당 업무 관련 전문 지식 수준', 10, 4),
('a0000000-0000-0000-0000-000000000001', '업무능력', '문제해결력', '업무 수행 중 문제 분석 및 해결 능력', 10, 5),
('a0000000-0000-0000-0000-000000000001', '업무능력', '기획력', '업무 기획 및 전략 수립 능력', 10, 6);

-- 업무태도 (30%)
INSERT INTO public.evaluation_criteria (period_id, category, name, description, weight, sort_order) VALUES
('a0000000-0000-0000-0000-000000000001', '업무태도', '책임감', '맡은 업무에 대한 책임감과 성실성', 10, 7),
('a0000000-0000-0000-0000-000000000001', '업무태도', '협업능력', '팀원 간 소통과 협력', 10, 8),
('a0000000-0000-0000-0000-000000000001', '업무태도', '자기개발', '자기계발 노력과 성장 의지', 10, 9);
