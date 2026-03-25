-- 048: 기능별 AI 엔진 설정 테이블
-- 각 AI 기능마다 다른 provider/model을 배정할 수 있도록 지원
-- ai_feature_settings에 매핑이 없으면 기존 ai_settings의 is_active=true 설정을 fallback으로 사용

CREATE TABLE IF NOT EXISTS public.ai_feature_settings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key     text        NOT NULL UNIQUE,  -- 기능 식별자
  feature_label   text        NOT NULL,         -- 기능 한글명 (UI 표시용)
  ai_setting_id   uuid        REFERENCES public.ai_settings(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 트리거: updated_at 자동 갱신
CREATE TRIGGER trg_ai_feature_settings_updated_at
  BEFORE UPDATE ON public.ai_feature_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ai_feature_settings_key ON public.ai_feature_settings(feature_key);

-- RLS
ALTER TABLE public.ai_feature_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_feature_settings_select_auth"
  ON public.ai_feature_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ai_feature_settings_insert_admin"
  ON public.ai_feature_settings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE user_id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "ai_feature_settings_update_admin"
  ON public.ai_feature_settings FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees WHERE user_id = auth.uid() AND role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE user_id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "ai_feature_settings_delete_admin"
  ON public.ai_feature_settings FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees WHERE user_id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ─── 기본 기능 목록 시드 (ai_setting_id는 NULL = 기본 설정 사용) ───
INSERT INTO public.ai_feature_settings (feature_key, feature_label) VALUES
  ('resume_analysis',       '서류 심사 (1차 AI 분석)'),
  ('comprehensive_analysis', '채용 종합 분석'),
  ('survey_generation',     '사전질의서 생성'),
  ('schedule_optimization', '면접 일정 최적화'),
  ('job_posting_ai',        '채용공고 AI 작성'),
  ('interview_transcription','면접 텍스트 추출'),
  ('evaluation_report',     '인사평가 리포트'),
  ('personality_analysis',  '직원 성격분석 (MBTI/사주)'),
  ('employee_profile_ai',   '직원 프로필 AI'),
  ('ojt_mission',           'OJT 일일 미션 생성'),
  ('probation_eval',        '수습 평가 AI'),
  ('work_chat',             '업무 AI 챗봇'),
  ('daily_report',          '일일업무보고 생성'),
  ('exit_analysis',         '퇴사 설문 분석'),
  ('messenger_ai',          '메신저 AI'),
  ('ai_agent',              'AI 에이전트 (플로팅)')
ON CONFLICT (feature_key) DO NOTHING;
