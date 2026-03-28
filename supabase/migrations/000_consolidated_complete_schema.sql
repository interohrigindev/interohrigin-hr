-- =====================================================================
-- INTEROHRIGIN HR Platform — 통합 마이그레이션 스키마
-- 새로운 Supabase PRO 데이터베이스에서 한 번에 실행하면
-- 전체 스키마를 생성하는 자립형(self-contained) 파일입니다.
--
-- 모든 ALTER TABLE 변경사항이 최종 상태로 병합되어 있습니다.
-- 기존 55개 마이그레이션 + v6_labor_rebuild 통합본
--
-- 생성일: 2026-03-27
-- =====================================================================

BEGIN;

-- #####################################################################
-- SECTION 0: Extensions
-- #####################################################################

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- #####################################################################
-- SECTION 1: Utility Functions
-- #####################################################################

-- updated_at 자동 갱신 트리거 함수
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- #####################################################################
-- SECTION 2: Core Tables — departments, employees
-- #####################################################################

-- ─── departments (부서) ───────────────────────────────────────────────
-- 최종: 029에서 UNIQUE(name), 043에서 parent_id 추가
CREATE TABLE public.departments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  parent_id  uuid        REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_departments_parent_id ON public.departments(parent_id);

-- ─── employees (직원 — auth.users 확장) ──────────────────────────────
-- 최종: 010에서 phone/address/birth_date/avatar_url 추가
--       016에서 employee_number/hire_date/position/employment_type/emergency_contact 추가
--       010에서 role CHECK에 division_head, admin 추가
CREATE TABLE public.employees (
  id                uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  email             text        NOT NULL,
  department_id     uuid        REFERENCES public.departments(id) ON DELETE SET NULL,
  role              text        NOT NULL CHECK (role IN ('employee','leader','director','division_head','ceo','admin')),
  is_active         boolean     DEFAULT true,
  phone             text,
  address           text,
  birth_date        date,
  avatar_url        text,
  employee_number   text        UNIQUE,
  hire_date         date,
  position          text,
  employment_type   text        DEFAULT 'full_time'
                                CHECK (employment_type IS NULL OR employment_type IN ('full_time','contract','intern','part_time')),
  emergency_contact jsonb,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_employees_department_id    ON public.employees(department_id);
CREATE INDEX idx_employees_role             ON public.employees(role);
CREATE INDEX idx_employees_employee_number  ON public.employees(employee_number);
CREATE INDEX idx_employees_hire_date        ON public.employees(hire_date);


-- #####################################################################
-- SECTION 3: Evaluation System (10 tables)
-- #####################################################################

-- ─── evaluation_periods (평가 기간) ──────────────────────────────────
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

-- ─── evaluation_categories (평가 카테고리) ───────────────────────────
CREATE TABLE public.evaluation_categories (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text    NOT NULL,
  weight     decimal NOT NULL,
  sort_order integer NOT NULL
);

-- ─── evaluation_items (평가 항목) ────────────────────────────────────
-- 최종: 009에서 evaluation_type 추가
CREATE TABLE public.evaluation_items (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid    NOT NULL REFERENCES public.evaluation_categories(id) ON DELETE CASCADE,
  name            text    NOT NULL,
  description     text,
  max_score       integer DEFAULT 10,
  sort_order      integer NOT NULL,
  is_active       boolean DEFAULT true,
  evaluation_type text    DEFAULT 'quantitative'
                          CHECK (evaluation_type IN ('quantitative','qualitative','mixed'))
);

-- ─── evaluation_targets (직원별 평가 시트) ───────────────────────────
-- 최종: 007에서 status CHECK 변경 → 6단계
CREATE TABLE public.evaluation_targets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id   uuid        NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  employee_id uuid        NOT NULL REFERENCES public.employees(id),
  status      text        DEFAULT 'pending' CHECK (status IN (
                            'pending','self_done','leader_done','director_done','ceo_done','completed'
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

-- ─── self_evaluations (자기평가) ─────────────────────────────────────
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

-- ─── evaluator_scores (평가자 점수) ──────────────────────────────────
-- 최종: 007에서 evaluator_role CHECK → leader/director/ceo
CREATE TABLE public.evaluator_scores (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id      uuid        NOT NULL REFERENCES public.evaluation_targets(id) ON DELETE CASCADE,
  item_id        uuid        NOT NULL REFERENCES public.evaluation_items(id),
  evaluator_id   uuid        NOT NULL REFERENCES public.employees(id),
  evaluator_role text        NOT NULL CHECK (evaluator_role IN ('leader','director','ceo')),
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

-- ─── evaluator_comments (평가자 종합 코멘트) ─────────────────────────
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

-- ─── evaluation_weights (평가자별 가중치) ────────────────────────────
-- 최종: 007에서 evaluator_role CHECK → self/leader/director/ceo
CREATE TABLE public.evaluation_weights (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id      uuid    NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  evaluator_role text    NOT NULL CHECK (evaluator_role IN ('self','leader','director','ceo')),
  weight         decimal NOT NULL,
  UNIQUE (period_id, evaluator_role)
);

-- ─── grade_criteria (등급 기준) ──────────────────────────────────────
CREATE TABLE public.grade_criteria (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  grade     text    NOT NULL CHECK (grade IN ('S','A','B','C','D')) UNIQUE,
  min_score integer NOT NULL,
  max_score integer NOT NULL,
  label     text
);

-- 평가 인덱스
CREATE INDEX idx_evaluation_targets_period   ON public.evaluation_targets(period_id);
CREATE INDEX idx_evaluation_targets_employee ON public.evaluation_targets(employee_id);
CREATE INDEX idx_evaluation_targets_status   ON public.evaluation_targets(status);
CREATE INDEX idx_self_evaluations_target     ON public.self_evaluations(target_id);
CREATE INDEX idx_evaluator_scores_target     ON public.evaluator_scores(target_id);
CREATE INDEX idx_evaluator_scores_role       ON public.evaluator_scores(evaluator_role);


-- #####################################################################
-- SECTION 4: Recruitment & Lifecycle Tables (채용관리)
-- #####################################################################

-- ─── job_postings (채용공고) ──────────────────────────────────────────
-- 최종: 049에서 survey_template_id 추가 (FK는 pre_survey_templates 생성 후)
CREATE TABLE public.job_postings (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text        NOT NULL,
  department_id     uuid        REFERENCES public.departments(id) ON DELETE SET NULL,
  position          text,
  employment_type   text        DEFAULT 'full_time' CHECK (employment_type IN ('full_time','contract','intern','part_time')),
  experience_level  text        DEFAULT 'any' CHECK (experience_level IN ('any','entry','junior','mid','senior','executive')),
  description       text,
  requirements      text,
  preferred         text,
  salary_range      text,
  ai_questions      jsonb       DEFAULT '[]'::jsonb,
  status            text        DEFAULT 'draft' CHECK (status IN ('draft','open','closed','cancelled')),
  deadline          date,
  survey_template_id uuid,      -- FK: pre_survey_templates
  location          text,
  work_hours        text,
  headcount         integer,
  benefits          text,
  hiring_process    text,
  contact_name      text,
  contact_email     text,
  contact_phone     text,
  company_intro     text,
  team_intro        text,
  created_by        uuid        REFERENCES public.employees(id),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TRIGGER trg_job_postings_updated_at
  BEFORE UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── candidates (지원자) ─────────────────────────────────────────────
-- 최종: 044에서 invite_token은 이미 포함, 055에서 interviewer_comments 추가
CREATE TABLE public.candidates (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id      uuid        REFERENCES public.job_postings(id) ON DELETE CASCADE,
  name                text        NOT NULL,
  email               text        NOT NULL,
  phone               text,
  source_channel      text        DEFAULT 'direct' CHECK (source_channel IN (
                                    'job_korea','headhunter','referral','university','agency','direct','other'
                                  )),
  source_detail       text,
  resume_url          text,
  cover_letter_url    text,
  cover_letter_text   text,
  status              text        DEFAULT 'applied' CHECK (status IN (
                                    'applied','resume_reviewed','survey_sent','survey_done',
                                    'interview_scheduled','video_done','face_to_face_done',
                                    'processing','analyzed','decided','hired','rejected'
                                  )),
  metadata            jsonb       DEFAULT '{}'::jsonb,
  invite_token        text        UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  pre_survey_data     jsonb,
  pre_survey_analysis jsonb,
  talent_match_score  integer,
  similar_employees   jsonb,
  processing_step     text,
  interviewer_comments jsonb      DEFAULT '[]',     -- 055 추가
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TRIGGER trg_candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── resume_analysis (이력서 AI 분석) ────────────────────────────────
CREATE TABLE public.resume_analysis (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id           uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  resume_text            text,
  ai_summary             text,
  strengths              jsonb       DEFAULT '[]'::jsonb,
  weaknesses             jsonb       DEFAULT '[]'::jsonb,
  position_fit           integer     CHECK (position_fit BETWEEN 0 AND 100),
  organization_fit       integer     CHECK (organization_fit BETWEEN 0 AND 100),
  suggested_department   text,
  suggested_position     text,
  suggested_salary_range text,
  red_flags              jsonb       DEFAULT '[]'::jsonb,
  recommendation         text        CHECK (recommendation IN ('PROCEED','REVIEW','REJECT')),
  analyzed_at            timestamptz DEFAULT now(),
  created_at             timestamptz DEFAULT now()
);

-- ─── pre_survey_templates (사전 질의서 템플릿) ───────────────────────
CREATE TABLE public.pre_survey_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  job_type        text,
  experience_type text        CHECK (experience_type IN ('entry','experienced','any')),
  questions       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_active       boolean     DEFAULT true,
  created_by      uuid        REFERENCES public.employees(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER trg_pre_survey_templates_updated_at
  BEFORE UPDATE ON public.pre_survey_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- job_postings.survey_template_id FK 적용 (pre_survey_templates 생성 후)
ALTER TABLE public.job_postings
  ADD CONSTRAINT job_postings_survey_template_id_fkey
  FOREIGN KEY (survey_template_id) REFERENCES public.pre_survey_templates(id) ON DELETE SET NULL;

CREATE INDEX idx_job_postings_survey_template ON public.job_postings(survey_template_id);

-- ─── interview_schedules (면접 일정) ─────────────────────────────────
-- 최종: 051에서 google_event_id 추가
CREATE TABLE public.interview_schedules (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  interviewer_ids       jsonb       DEFAULT '[]'::jsonb,
  interview_type        text        NOT NULL CHECK (interview_type IN ('video','face_to_face')),
  scheduled_at          timestamptz NOT NULL,
  duration_minutes      integer     DEFAULT 30,
  priority              text        DEFAULT 'normal' CHECK (priority IN ('urgent','normal','low')),
  pre_materials_sent    boolean     DEFAULT false,
  pre_materials_sent_at timestamptz,
  meeting_link          text,
  location_info         text,
  status                text        DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  google_event_id       text,       -- 051 추가
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TRIGGER trg_interview_schedules_updated_at
  BEFORE UPDATE ON public.interview_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_interview_schedules_event_id ON public.interview_schedules(google_event_id) WHERE google_event_id IS NOT NULL;

-- ─── interview_recordings (면접 녹화/녹음) ───────────────────────────
-- 최종: 046에서 schedule_id 추가, status에 'deleted' 허용
CREATE TABLE public.interview_recordings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id     uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  schedule_id      uuid        REFERENCES public.interview_schedules(id) ON DELETE SET NULL,
  recording_url    text,
  recording_type   text        DEFAULT 'video' CHECK (recording_type IN ('video','audio')),
  duration_seconds integer,
  file_size_bytes  bigint,
  status           text        DEFAULT 'uploading' CHECK (status IN ('uploading','uploaded','processing','completed','error','deleted')),
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_interview_recordings_schedule ON public.interview_recordings(schedule_id);

-- ─── face_to_face_evals (대면 면접 평가) ─────────────────────────────
CREATE TABLE public.face_to_face_evals (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id              uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  evaluator_id              uuid        REFERENCES public.employees(id),
  arrival_time              timestamptz,
  scheduled_time            timestamptz,
  arrival_status            text        CHECK (arrival_status IN ('early','on_time','late')),
  minutes_early_or_late     integer     DEFAULT 0,
  pre_arrival_contact       boolean     DEFAULT false,
  appearance_score          integer     CHECK (appearance_score BETWEEN 1 AND 5),
  attitude_score            integer     CHECK (attitude_score BETWEEN 1 AND 5),
  pre_material_read         boolean     DEFAULT false,
  pre_material_verification jsonb       DEFAULT '{}'::jsonb,
  answer_consistency        integer     CHECK (answer_consistency BETWEEN 1 AND 5),
  personality_questions     jsonb       DEFAULT '[]'::jsonb,
  free_comments             text,
  total_score               integer,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE TRIGGER trg_face_to_face_evals_updated_at
  BEFORE UPDATE ON public.face_to_face_evals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── voice_analysis (음성 분석) ──────────────────────────────────────
CREATE TABLE public.voice_analysis (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id       uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  recording_id       uuid        REFERENCES public.interview_recordings(id),
  confidence_score   decimal,
  speech_speed       decimal,
  filler_word_count  integer,
  voice_stability    decimal,
  response_time_avg  decimal,
  sentiment_score    decimal,
  analysis_details   jsonb       DEFAULT '{}'::jsonb,
  created_at         timestamptz DEFAULT now()
);

-- ─── transcriptions (STT 결과) ───────────────────────────────────────
CREATE TABLE public.transcriptions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id  uuid        NOT NULL REFERENCES public.interview_recordings(id) ON DELETE CASCADE,
  candidate_id  uuid        REFERENCES public.candidates(id),
  full_text     text,
  segments      jsonb       DEFAULT '[]'::jsonb,
  language      text        DEFAULT 'ko',
  provider      text        DEFAULT 'whisper',
  created_at    timestamptz DEFAULT now()
);

-- ─── recruitment_reports (AI 종합 분석 리포트) ───────────────────────
CREATE TABLE public.recruitment_reports (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id             uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  report_type              text        DEFAULT 'comprehensive' CHECK (report_type IN ('comprehensive','resume','interview','final')),
  overall_score            integer,
  summary                  text,
  detailed_analysis        jsonb       DEFAULT '{}'::jsonb,
  talent_match             jsonb       DEFAULT '{}'::jsonb,
  saju_mbti_analysis       jsonb       DEFAULT '{}'::jsonb,
  salary_recommendation    text,
  department_recommendation text,
  position_recommendation  text,
  ai_recommendation        text        CHECK (ai_recommendation IN ('STRONG_HIRE','HIRE','REVIEW','NO_HIRE')),
  provider                 text,
  model                    text,
  created_at               timestamptz DEFAULT now()
);

-- ─── interview_analyses (면접 내용 분석 결과) ────────────────────────
-- 최종: 045 생성 + 046에서 confirmed_at, file_deleted 추가
CREATE TABLE public.interview_analyses (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id             uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  schedule_id              uuid        REFERENCES public.interview_schedules(id) ON DELETE SET NULL,
  recording_id             uuid        REFERENCES public.interview_recordings(id) ON DELETE SET NULL,
  interview_type           text        NOT NULL CHECK (interview_type IN ('video','face_to_face')),
  -- 텍스트 추출
  transcription            text,
  transcription_segments   jsonb       DEFAULT '[]'::jsonb,
  -- AI 분석 결과
  ai_summary               text,
  key_answers              jsonb       DEFAULT '[]'::jsonb,
  communication_score      integer     CHECK (communication_score BETWEEN 0 AND 100),
  expertise_score          integer     CHECK (expertise_score BETWEEN 0 AND 100),
  attitude_score           integer     CHECK (attitude_score BETWEEN 0 AND 100),
  overall_score            integer     CHECK (overall_score BETWEEN 0 AND 100),
  strengths                jsonb       DEFAULT '[]'::jsonb,
  concerns                 jsonb       DEFAULT '[]'::jsonb,
  overall_impression       text,
  -- AI 면접관 확장 필드
  ai_interviewer_session   jsonb       DEFAULT '{}'::jsonb,
  ai_interviewer_questions jsonb       DEFAULT '[]'::jsonb,
  real_time_emotions       jsonb       DEFAULT '[]'::jsonb,
  real_time_flags          jsonb       DEFAULT '[]'::jsonb,
  real_time_voice          jsonb       DEFAULT '{}'::jsonb,
  -- 메타
  ai_provider              text,
  ai_model                 text,
  status                   text        DEFAULT 'pending'
                                       CHECK (status IN ('pending','transcribing','analyzing','completed','error')),
  error_message            text,
  analyzed_at              timestamptz,
  -- 046 추가
  confirmed_at             timestamptz,
  file_deleted             boolean     DEFAULT false,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

CREATE INDEX idx_interview_analyses_candidate  ON public.interview_analyses(candidate_id);
CREATE INDEX idx_interview_analyses_schedule   ON public.interview_analyses(schedule_id);
CREATE INDEX idx_interview_analyses_confirmed  ON public.interview_analyses(confirmed_at) WHERE confirmed_at IS NOT NULL;


-- #####################################################################
-- SECTION 5: Decision & AI Trust Tables (의사결정/AI 신뢰도)
-- #####################################################################

-- ─── hiring_decisions (채용 결정) ────────────────────────────────────
CREATE TABLE public.hiring_decisions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  decision              text        NOT NULL CHECK (decision IN ('hired','rejected','hold')),
  decided_by            uuid        REFERENCES public.employees(id),
  reason                text,
  offered_salary        text,
  offered_department_id uuid        REFERENCES public.departments(id) ON DELETE SET NULL,
  offered_position      text,
  start_date            date,
  ai_recommendation     text,
  ai_score              integer,
  created_at            timestamptz DEFAULT now()
);

-- ─── talent_profiles (인재상 프로필) ─────────────────────────────────
CREATE TABLE public.talent_profiles (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  department_id       uuid        REFERENCES public.departments(id) ON DELETE SET NULL,
  traits              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  skills              jsonb       DEFAULT '[]'::jsonb,
  values              jsonb       DEFAULT '[]'::jsonb,
  description         text,
  reference_employees jsonb       DEFAULT '[]'::jsonb,
  is_active           boolean     DEFAULT true,
  created_by          uuid        REFERENCES public.employees(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TRIGGER trg_talent_profiles_updated_at
  BEFORE UPDATE ON public.talent_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── ai_accuracy_log (AI vs 실제 결정 비교) ─────────────────────────
CREATE TABLE public.ai_accuracy_log (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id       uuid        REFERENCES public.candidates(id),
  employee_id        uuid        REFERENCES public.employees(id),
  ai_recommendation  text,
  ai_score           integer,
  actual_decision    text,
  match_result       text        CHECK (match_result IN ('match','partial','mismatch')),
  context_type       text        DEFAULT 'hiring' CHECK (context_type IN ('hiring','probation','performance')),
  notes              text,
  created_at         timestamptz DEFAULT now()
);

-- ─── ai_trust_metrics (신뢰도 스냅샷) ───────────────────────────────
CREATE TABLE public.ai_trust_metrics (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start        date        NOT NULL,
  period_end          date        NOT NULL,
  total_predictions   integer     DEFAULT 0,
  correct_predictions integer     DEFAULT 0,
  accuracy_rate       decimal,
  current_phase       text        DEFAULT 'A' CHECK (current_phase IN ('A','B','C')),
  details             jsonb       DEFAULT '{}'::jsonb,
  created_at          timestamptz DEFAULT now()
);

-- ─── ai_phase_transitions (Phase 전환 이력) ──────────────────────────
CREATE TABLE public.ai_phase_transitions (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phase             text        NOT NULL CHECK (from_phase IN ('A','B','C')),
  to_phase               text        NOT NULL CHECK (to_phase IN ('A','B','C')),
  reason                 text,
  accuracy_at_transition decimal,
  approved_by            uuid        REFERENCES public.employees(id),
  created_at             timestamptz DEFAULT now()
);


-- #####################################################################
-- SECTION 6: Personality / MBTI / Saju Tables
-- #####################################################################

-- ─── employee_profiles (직원 확장 프로필) ────────────────────────────
CREATE TABLE public.employee_profiles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid        NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  birth_date  date,
  birth_time  time,
  lunar_birth boolean     DEFAULT false,
  mbti        text        CHECK (mbti IN (
                'ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP',
                'ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ'
              )),
  blood_type  text        CHECK (blood_type IN ('A','B','O','AB')),
  hanja_name  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TRIGGER trg_employee_profiles_updated_at
  BEFORE UPDATE ON public.employee_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── personality_analysis (AI 성향 분석) ─────────────────────────────
CREATE TABLE public.personality_analysis (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  analysis_type text        NOT NULL CHECK (analysis_type IN ('saju','mbti','cross','comprehensive')),
  result        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  strengths     jsonb       DEFAULT '[]'::jsonb,
  cautions      jsonb       DEFAULT '[]'::jsonb,
  job_fit       jsonb       DEFAULT '{}'::jsonb,
  team_fit      jsonb       DEFAULT '{}'::jsonb,
  provider      text,
  model         text,
  created_at    timestamptz DEFAULT now()
);

-- ─── profile_visibility_settings (열람 토글) ─────────────────────────
CREATE TABLE public.profile_visibility_settings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  show_mbti       boolean     DEFAULT false,
  show_blood_type boolean     DEFAULT false,
  show_saju       boolean     DEFAULT false,
  show_birth_date boolean     DEFAULT false,
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER trg_profile_visibility_updated_at
  BEFORE UPDATE ON public.profile_visibility_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- #####################################################################
-- SECTION 7: OJT / Mentor / Probation Tables
-- #####################################################################

-- ─── ojt_programs (OJT 프로그램) ─────────────────────────────────────
CREATE TABLE public.ojt_programs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  department_id uuid        REFERENCES public.departments(id) ON DELETE SET NULL,
  job_type      text,
  description   text,
  modules       jsonb       DEFAULT '[]'::jsonb,
  quiz_questions jsonb      DEFAULT '[]'::jsonb,
  duration_days integer     DEFAULT 7,
  is_active     boolean     DEFAULT true,
  created_by    uuid        REFERENCES public.employees(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TRIGGER trg_ojt_programs_updated_at
  BEFORE UPDATE ON public.ojt_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── ojt_enrollments (OJT 수강 현황) ────────────────────────────────
CREATE TABLE public.ojt_enrollments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  program_id       uuid        NOT NULL REFERENCES public.ojt_programs(id) ON DELETE CASCADE,
  status           text        DEFAULT 'enrolled' CHECK (status IN ('enrolled','in_progress','completed','dropped')),
  progress         jsonb       DEFAULT '{}'::jsonb,
  quiz_scores      jsonb       DEFAULT '[]'::jsonb,
  total_quiz_score integer,
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE TRIGGER trg_ojt_enrollments_updated_at
  BEFORE UPDATE ON public.ojt_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── mentor_assignments (멘토-멘티 배정) ─────────────────────────────
CREATE TABLE public.mentor_assignments (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mentee_id               uuid        NOT NULL REFERENCES public.employees(id),
  mentor_id               uuid        NOT NULL REFERENCES public.employees(id),
  assignment_type         text        NOT NULL DEFAULT 'initial' CHECK (assignment_type IN ('initial','final')),
  start_date              date        NOT NULL,
  end_date                date,
  status                  text        DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  mentor_rating_by_mentee jsonb,
  mentee_rating_by_mentor jsonb,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE TRIGGER trg_mentor_assignments_updated_at
  BEFORE UPDATE ON public.mentor_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── mentor_daily_reports (멘토 일일 평가) ───────────────────────────
CREATE TABLE public.mentor_daily_reports (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id      uuid        NOT NULL REFERENCES public.mentor_assignments(id) ON DELETE CASCADE,
  day_number         integer     NOT NULL CHECK (day_number BETWEEN 1 AND 90),
  mentor_mission     text,
  mentee_mission     text,
  mentor_completed   boolean     DEFAULT false,
  mentee_completed   boolean     DEFAULT false,
  learning_attitude  text        CHECK (learning_attitude IN ('excellent','good','average','poor','very_poor')),
  adaptation_level   text        CHECK (adaptation_level IN ('excellent','good','average','poor','very_poor')),
  mentor_comment     text,
  mentee_feedback    text,
  created_at         timestamptz DEFAULT now()
);

-- ─── probation_evaluations (수습 단계별 평가) ────────────────────────
-- 최종: 020에서 stage CHECK, UNIQUE 제약, 추가 컬럼 변경
CREATE TABLE public.probation_evaluations (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                 uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  stage                       text        NOT NULL CHECK (stage IN ('round1','round2','round3','week1','week2','week3','month1','month2','month3')),
  evaluator_id                uuid        REFERENCES public.employees(id),
  evaluator_role              text,
  scores                      jsonb       DEFAULT '{}'::jsonb,
  ai_assessment               text,
  continuation_recommendation text        CHECK (continuation_recommendation IN ('continue','warning','terminate')),
  comments                    text,
  praise                      text,
  improvement                 text,
  mentor_summary              text,
  leader_summary              text,
  exec_one_liner              text,
  strengths                   text,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  UNIQUE (employee_id, stage, evaluator_id, evaluator_role)
);

CREATE TRIGGER trg_probation_evaluations_updated_at
  BEFORE UPDATE ON public.probation_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- #####################################################################
-- SECTION 8: Records Tables (기록/퇴사)
-- #####################################################################

-- ─── special_notes (특이사항) ────────────────────────────────────────
CREATE TABLE public.special_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL REFERENCES public.employees(id),
  note_type   text        NOT NULL CHECK (note_type IN ('positive','negative')),
  content     text        NOT NULL,
  severity    text        DEFAULT 'minor' CHECK (severity IN ('minor','moderate','major')),
  created_at  timestamptz DEFAULT now()
);

-- ─── exit_surveys (퇴사 설문) ────────────────────────────────────────
CREATE TABLE public.exit_surveys (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id          uuid        NOT NULL REFERENCES public.employees(id),
  exit_date            date,
  exit_reason_category text,
  exit_reason_detail   text,
  best_experience      text,
  worst_experience     text,
  suggestions          text,
  anonymous_feedback   text,
  token                text        UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  completed_at         timestamptz,
  created_at           timestamptz DEFAULT now()
);

-- ─── work_metrics (업무 동기화 데이터) ───────────────────────────────
CREATE TABLE public.work_metrics (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id             uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_year             integer     NOT NULL,
  period_quarter          integer     NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),
  task_completion_rate    decimal,
  deadline_compliance     decimal,
  avg_daily_satisfaction  decimal,
  total_tasks             integer     DEFAULT 0,
  completed_tasks         integer     DEFAULT 0,
  overdue_tasks           integer     DEFAULT 0,
  details                 jsonb       DEFAULT '{}'::jsonb,
  synced_at               timestamptz DEFAULT now(),
  created_at              timestamptz DEFAULT now(),
  UNIQUE (employee_id, period_year, period_quarter)
);


-- #####################################################################
-- SECTION 9: Work Management Tables (업무 관리)
-- #####################################################################

-- ─── projects (프로젝트) ─────────────────────────────────────────────
CREATE TABLE public.projects (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  description   text,
  department_id uuid        REFERENCES public.departments(id) ON DELETE SET NULL,
  owner_id      uuid        REFERENCES public.employees(id),
  status        text        DEFAULT 'active' CHECK (status IN ('planning','active','completed','cancelled')),
  start_date    date,
  end_date      date,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── project_boards (프로젝트 보드) ──────────────────────────────────
-- 최종: 029에서 shared_departments, 039에서 manager/leader/executive_id 추가
CREATE TABLE public.project_boards (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand              text,
  category           text        DEFAULT '제품',
  project_name       text        NOT NULL,
  launch_date        date,
  status             text        DEFAULT 'active' CHECK (status IN ('active','holding','completed','cancelled')),
  priority           integer     DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  assignee_ids       uuid[]      NOT NULL DEFAULT '{}',
  department         text,
  template_type      text,
  shared_departments text[]      DEFAULT '{}',
  manager_id         uuid        REFERENCES public.employees(id),
  leader_id          uuid        REFERENCES public.employees(id),
  executive_id       uuid        REFERENCES public.employees(id),
  created_by         uuid        REFERENCES public.employees(id),
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE TRIGGER trg_project_boards_updated_at
  BEFORE UPDATE ON public.project_boards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── tasks (작업/ToDo) ───────────────────────────────────────────────
-- 최종: 026에서 linked_board_id 추가
CREATE TABLE public.tasks (
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
  linked_board_id uuid        REFERENCES public.project_boards(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── pipeline_stages (파이프라인 단계) ───────────────────────────────
CREATE TABLE public.pipeline_stages (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid        NOT NULL REFERENCES public.project_boards(id) ON DELETE CASCADE,
  stage_name           text        NOT NULL,
  stage_order          integer     NOT NULL,
  status               text        DEFAULT '시작전' CHECK (status IN ('완료','진행중','시작전','홀딩')),
  deadline             date,
  completed_at         timestamptz,
  editable_departments text[]      DEFAULT '{"브랜드사업본부"}',
  stage_assignee_ids   uuid[],
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE TRIGGER trg_pipeline_stages_updated_at
  BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── project_updates (프로젝트 업데이트 로그) ────────────────────────
CREATE TABLE public.project_updates (
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

-- ─── board_permissions (보드 권한 설정) ──────────────────────────────
CREATE TABLE public.board_permissions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  department          text        NOT NULL UNIQUE,
  can_create_project  boolean     DEFAULT false,
  can_delete_project  boolean     DEFAULT false,
  can_edit_all_stages boolean     DEFAULT false,
  can_comment         boolean     DEFAULT true,
  can_view            boolean     DEFAULT true,
  editable_stages     text[]      DEFAULT '{}',
  updated_at          timestamptz DEFAULT now()
);

-- ─── project_templates (프로젝트 템플릿) ─────────────────────────────
-- 최종: 031에서 department 추가
CREATE TABLE public.project_templates (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  template_type  text        NOT NULL,
  stages         jsonb       NOT NULL,
  avg_total_days integer,
  department     text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_project_templates_department ON public.project_templates(department);

-- ─── daily_reports (일일 업무 보고서) ────────────────────────────────
CREATE TABLE public.daily_reports (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid        NOT NULL REFERENCES public.employees(id),
  report_date           date        NOT NULL,
  tasks_completed       jsonb       DEFAULT '[]'::jsonb,
  tasks_in_progress     jsonb       DEFAULT '[]'::jsonb,
  tasks_planned         jsonb       DEFAULT '[]'::jsonb,
  carryover_tasks       jsonb       DEFAULT '[]'::jsonb,
  ai_priority_suggestion text,
  satisfaction_score    integer     CHECK (satisfaction_score BETWEEN 1 AND 10),
  satisfaction_comment  text,
  blockers              text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE (employee_id, report_date)
);

CREATE TRIGGER trg_daily_reports_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── chat_messages (AI 업무 챗봇 메시지) ─────────────────────────────
CREATE TABLE public.chat_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid        NOT NULL REFERENCES public.employees(id),
  role        text        NOT NULL CHECK (role IN ('user','assistant')),
  content     text        NOT NULL,
  metadata    jsonb       DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now()
);

-- 업무 관리 인덱스
CREATE INDEX idx_projects_department          ON public.projects(department_id);
CREATE INDEX idx_projects_owner              ON public.projects(owner_id);
CREATE INDEX idx_tasks_project               ON public.tasks(project_id);
CREATE INDEX idx_tasks_assignee              ON public.tasks(assignee_id);
CREATE INDEX idx_tasks_status                ON public.tasks(status);
CREATE INDEX idx_tasks_linked_board          ON public.tasks(linked_board_id);
CREATE INDEX idx_daily_reports_employee      ON public.daily_reports(employee_id);
CREATE INDEX idx_daily_reports_date          ON public.daily_reports(report_date);
CREATE INDEX idx_chat_messages_employee      ON public.chat_messages(employee_id);
CREATE INDEX idx_project_boards_brand        ON public.project_boards(brand);
CREATE INDEX idx_project_boards_status       ON public.project_boards(status);
CREATE INDEX idx_project_boards_created      ON public.project_boards(created_at DESC);
CREATE INDEX idx_project_boards_manager      ON public.project_boards(manager_id);
CREATE INDEX idx_project_boards_leader       ON public.project_boards(leader_id);
CREATE INDEX idx_project_boards_executive    ON public.project_boards(executive_id);
CREATE INDEX idx_pipeline_stages_project     ON public.pipeline_stages(project_id);
CREATE INDEX idx_pipeline_stages_status      ON public.pipeline_stages(status);
CREATE INDEX idx_project_updates_project     ON public.project_updates(project_id);
CREATE INDEX idx_project_updates_created     ON public.project_updates(created_at DESC);


-- #####################################################################
-- SECTION 10: CEO Urgent Tasks (CEO 긴급 업무)
-- #####################################################################

-- ─── urgent_tasks ────────────────────────────────────────────────────
-- 최종: 054에서 sub_tasks, confirm_status, confirmed_by, confirmed_at 추가
CREATE TABLE public.urgent_tasks (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                  text        NOT NULL,
  description            text,
  priority               integer     DEFAULT 1 CHECK (priority BETWEEN 1 AND 10),
  assigned_to            uuid[]      DEFAULT '{}',
  created_by             uuid        REFERENCES public.employees(id),
  deadline               timestamptz NOT NULL,
  is_overdue             boolean     DEFAULT false,
  status                 text        DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','overdue')),
  completed_at           timestamptz,
  completed_by           uuid        REFERENCES public.employees(id),
  completion_note        text,
  reminder_count         integer     DEFAULT 0,
  last_reminder_at       timestamptz,
  reminder_interval_hours integer    DEFAULT 4,
  project_id             text,
  related_employee_id    uuid        REFERENCES public.employees(id),
  sub_tasks              jsonb       DEFAULT '[]',
  confirm_status         text,
  confirmed_by           uuid        REFERENCES public.employees(id),
  confirmed_at           timestamptz,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

-- ─── task_reminders (AI 리마인드 이력) ───────────────────────────────
CREATE TABLE public.task_reminders (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  urgent_task_id  uuid        NOT NULL REFERENCES public.urgent_tasks(id) ON DELETE CASCADE,
  sent_to         uuid        NOT NULL REFERENCES public.employees(id),
  sent_via        text        DEFAULT 'popup' CHECK (sent_via IN ('push','sms','email','popup')),
  sent_at         timestamptz DEFAULT now(),
  acknowledged    boolean     DEFAULT false,
  acknowledged_at timestamptz,
  response_note   text
);

-- ─── reminder_penalties (리마인드 → 인사평가 감점) ───────────────────
CREATE TABLE public.reminder_penalties (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id             uuid        NOT NULL REFERENCES public.employees(id),
  period_start            date,
  period_end              date,
  total_urgent_assigned   integer     DEFAULT 0,
  total_completed_on_time integer     DEFAULT 0,
  total_overdue           integer     DEFAULT 0,
  total_reminders_received integer    DEFAULT 0,
  penalty_score           float       DEFAULT 0,
  evaluation_id           uuid,
  created_at              timestamptz DEFAULT now(),
  UNIQUE (employee_id, period_start)
);

CREATE INDEX idx_urgent_tasks_status          ON public.urgent_tasks(status);
CREATE INDEX idx_urgent_tasks_deadline        ON public.urgent_tasks(deadline);
CREATE INDEX idx_urgent_tasks_priority        ON public.urgent_tasks(priority);
CREATE INDEX idx_task_reminders_task          ON public.task_reminders(urgent_task_id);
CREATE INDEX idx_task_reminders_sent_to       ON public.task_reminders(sent_to);
CREATE INDEX idx_reminder_penalties_employee  ON public.reminder_penalties(employee_id);


-- #####################################################################
-- SECTION 11: Messenger Tables (사내 메신저)
-- #####################################################################

-- ─── chat_rooms (채팅방) ─────────────────────────────────────────────
CREATE TABLE public.chat_rooms (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text,
  type                        text        NOT NULL DEFAULT 'dm' CHECK (type IN ('dm','group','project','department','mentor','recruitment')),
  description                 text,
  linked_project_id           text,
  linked_job_posting_id       uuid        REFERENCES public.job_postings(id),
  linked_mentor_assignment_id uuid        REFERENCES public.mentor_assignments(id),
  linked_department           text,
  is_ai_enabled               boolean     DEFAULT true,
  is_archived                 boolean     DEFAULT false,
  created_by                  uuid        REFERENCES public.employees(id),
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  last_message_at             timestamptz
);

CREATE TRIGGER trg_chat_rooms_updated_at
  BEFORE UPDATE ON public.chat_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── chat_room_members (채팅방 멤버) ─────────────────────────────────
CREATE TABLE public.chat_room_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      uuid        NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL,
  role         text        DEFAULT 'member' CHECK (role IN ('admin','member')),
  last_read_at timestamptz DEFAULT now(),
  unread_count integer     DEFAULT 0,
  is_muted     boolean     DEFAULT false,
  is_pinned    boolean     DEFAULT false,
  joined_at    timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- ─── messages (메시지) ───────────────────────────────────────────────
CREATE TABLE public.messages (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id               uuid        NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id             uuid        REFERENCES public.employees(id),
  content               text        NOT NULL,
  message_type          text        DEFAULT 'text' CHECK (message_type IN ('text','image','file','ai_bot','system','urgent_alert','task_update')),
  attachment_url        text,
  attachment_name       text,
  attachment_size       integer,
  attachment_type       text,
  reply_to_id           uuid        REFERENCES public.messages(id),
  linked_urgent_task_id uuid,
  linked_candidate_id   uuid,
  linked_employee_id    uuid,
  is_edited             boolean     DEFAULT false,
  edited_at             timestamptz,
  is_deleted            boolean     DEFAULT false,
  created_at            timestamptz DEFAULT now()
);

-- ─── message_reactions (이모지 반응) ─────────────────────────────────
CREATE TABLE public.message_reactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  emoji      text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- 메신저 인덱스
CREATE INDEX idx_messages_room_created       ON public.messages(room_id, created_at DESC);
CREATE INDEX idx_messages_sender             ON public.messages(sender_id);
CREATE INDEX idx_messages_reply              ON public.messages(reply_to_id);
CREATE INDEX idx_chat_room_members_user      ON public.chat_room_members(user_id);
CREATE INDEX idx_chat_room_members_room      ON public.chat_room_members(room_id);
CREATE INDEX idx_chat_rooms_last_message     ON public.chat_rooms(last_message_at DESC);
CREATE INDEX idx_chat_rooms_type             ON public.chat_rooms(type);
CREATE INDEX idx_message_reactions_message   ON public.message_reactions(message_id);


-- #####################################################################
-- SECTION 12: AI Settings & Agent Tables
-- #####################################################################

-- ─── ai_settings (AI 설정) ───────────────────────────────────────────
-- 최종: 040에서 provider CHECK에 'claude' 추가
CREATE TABLE public.ai_settings (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider   text        NOT NULL CHECK (provider IN ('gemini','openai','claude')),
  api_key    text        NOT NULL,
  model      text        NOT NULL,
  is_active  boolean     DEFAULT true,
  module     text        DEFAULT 'hr' CHECK (module IN ('hr','sales','inventory')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── ai_reports (AI 리포트 저장) ─────────────────────────────────────
CREATE TABLE public.ai_reports (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id      uuid        REFERENCES public.evaluation_targets(id) ON DELETE CASCADE,
  period_id      uuid        REFERENCES public.evaluation_periods(id),
  employee_id    uuid        REFERENCES public.employees(id),
  provider       text        NOT NULL,
  model          text        NOT NULL,
  report_content text        NOT NULL,
  report_type    text        DEFAULT 'individual' CHECK (report_type IN ('individual','department','company')),
  module         text        DEFAULT 'hr',
  created_at     timestamptz DEFAULT now()
);

-- ─── ai_feature_settings (기능별 AI 엔진 설정) ──────────────────────
CREATE TABLE public.ai_feature_settings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key   text        NOT NULL UNIQUE,
  feature_label text        NOT NULL,
  ai_setting_id uuid        REFERENCES public.ai_settings(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TRIGGER trg_ai_feature_settings_updated_at
  BEFORE UPDATE ON public.ai_feature_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_ai_feature_settings_key ON public.ai_feature_settings(feature_key);

-- ─── agent_conversations (AI 에이전트 대화 스레드) ───────────────────
CREATE TABLE public.agent_conversations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES public.employees(id),
  title          text,
  summary        text,
  project_id     uuid,
  department_id  uuid        REFERENCES public.departments(id) ON DELETE SET NULL,
  context_type   text        DEFAULT 'general' CHECK (context_type IN (
    'general','project','recruitment','ojt','evaluation','hr','urgent'
  )),
  is_bookmarked  boolean     DEFAULT false,
  is_archived    boolean     DEFAULT false,
  tags           text[]      DEFAULT '{}',
  message_count  integer     DEFAULT 0,
  last_message_at timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE TRIGGER trg_agent_conversations_updated_at
  BEFORE UPDATE ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── agent_messages (AI 에이전트 메시지) ─────────────────────────────
CREATE TABLE public.agent_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  role            text        NOT NULL CHECK (role IN ('user','assistant','system')),
  content         text        NOT NULL,
  provider        text,
  model           text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_agent_conv_user       ON public.agent_conversations(user_id);
CREATE INDEX idx_agent_conv_project    ON public.agent_conversations(project_id);
CREATE INDEX idx_agent_conv_dept       ON public.agent_conversations(department_id);
CREATE INDEX idx_agent_conv_last_msg   ON public.agent_conversations(last_message_at DESC);
CREATE INDEX idx_agent_conv_tags       ON public.agent_conversations USING GIN(tags);
CREATE INDEX idx_agent_msg_conv        ON public.agent_messages(conversation_id, created_at);


-- #####################################################################
-- SECTION 13: External Data / Integration Tables
-- #####################################################################

-- ─── imported_work_data (외부 데이터 마이그레이션) ───────────────────
CREATE TABLE public.imported_work_data (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid        REFERENCES public.employees(id),
  employee_name text,
  source        text        NOT NULL CHECK (source IN ('slack','notion','naver_works','other')),
  content_type  text        DEFAULT 'daily_report' CHECK (content_type IN ('daily_report','project_update','message','document','other')),
  content       text,
  original_date timestamptz,
  metadata      jsonb       DEFAULT '{}'::jsonb,
  imported_at   timestamptz DEFAULT now(),
  ai_analysis   jsonb,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_imported_work_data_source   ON public.imported_work_data(source);
CREATE INDEX idx_imported_work_data_employee ON public.imported_work_data(employee_id);
CREATE INDEX idx_imported_work_data_date     ON public.imported_work_data(original_date);

-- ─── integration_settings (외부 연동 설정) ──────────────────────────
CREATE TABLE public.integration_settings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       text        NOT NULL CHECK (provider IN ('slack','notion','naver_works')),
  access_token   text        NOT NULL,
  workspace_name text,
  workspace_id   text,
  is_active      boolean     DEFAULT true,
  config         jsonb       DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_integration_settings_active_provider
  ON public.integration_settings (provider) WHERE is_active = true;

-- ─── meeting_records (회의 녹음 & 회의록) ───────────────────────────
CREATE TABLE public.meeting_records (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                  text        NOT NULL,
  recorded_by            uuid        NOT NULL REFERENCES public.employees(id),
  participant_ids        uuid[]      DEFAULT '{}',
  department_id          uuid        REFERENCES public.departments(id) ON DELETE SET NULL,
  project_id             uuid,
  recording_url          text,
  duration_seconds       integer,
  file_size_bytes        bigint,
  transcription          text,
  transcription_segments jsonb       DEFAULT '[]',
  summary                text,
  action_items           jsonb       DEFAULT '[]',
  decisions              jsonb       DEFAULT '[]',
  status                 text        DEFAULT 'recording' CHECK (status IN (
    'recording','uploaded','transcribing','summarizing','completed','error'
  )),
  error_message          text,
  is_sent                boolean     DEFAULT false,
  sent_at                timestamptz,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

CREATE TRIGGER trg_meeting_records_updated_at
  BEFORE UPDATE ON public.meeting_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_meeting_records_user    ON public.meeting_records(recorded_by);
CREATE INDEX idx_meeting_records_dept    ON public.meeting_records(department_id);
CREATE INDEX idx_meeting_records_project ON public.meeting_records(project_id);
CREATE INDEX idx_meeting_records_status  ON public.meeting_records(status);


-- #####################################################################
-- SECTION 14: Evaluation Enhancements (평가 개선)
-- #####################################################################

-- ─── monthly_checkins (월간 업무 점검) ───────────────────────────────
CREATE TABLE public.monthly_checkins (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year            integer     NOT NULL,
  month           integer     NOT NULL CHECK (month BETWEEN 1 AND 12),
  tag             text        NOT NULL DEFAULT '기타' CHECK (tag IN ('이슈','칭찬','제안','기타')),
  content         text,
  leader_feedback text,
  exec_feedback   text,
  ceo_feedback    text,
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','leader_reviewed','exec_reviewed','ceo_reviewed')),
  is_locked       boolean     NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (employee_id, year, month)
);

CREATE TRIGGER trg_monthly_checkins_updated_at
  BEFORE UPDATE ON public.monthly_checkins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_monthly_checkins_employee ON public.monthly_checkins(employee_id);
CREATE INDEX idx_monthly_checkins_period   ON public.monthly_checkins(year, month);
CREATE INDEX idx_monthly_checkins_status   ON public.monthly_checkins(status);

-- ─── peer_reviews (동료 다면 평가) ───────────────────────────────────
CREATE TABLE public.peer_reviews (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id     uuid        REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  reviewer_id   uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewee_id   uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  overall_score integer     CHECK (overall_score BETWEEN 0 AND 100),
  strengths     text,
  improvements  text,
  is_anonymous  boolean     NOT NULL DEFAULT true,
  is_submitted  boolean     NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (period_id, reviewer_id, reviewee_id)
);

CREATE TRIGGER trg_peer_reviews_updated_at
  BEFORE UPDATE ON public.peer_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_peer_reviews_period   ON public.peer_reviews(period_id);
CREATE INDEX idx_peer_reviews_reviewer ON public.peer_reviews(reviewer_id);
CREATE INDEX idx_peer_reviews_reviewee ON public.peer_reviews(reviewee_id);

-- ─── peer_review_assignments (동료 평가 배정) ────────────────────────
CREATE TABLE public.peer_review_assignments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id   uuid        NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  reviewer_id uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewee_id uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (period_id, reviewer_id, reviewee_id)
);

CREATE INDEX idx_peer_assignments_period   ON public.peer_review_assignments(period_id);
CREATE INDEX idx_peer_assignments_reviewer ON public.peer_review_assignments(reviewer_id);


-- #####################################################################
-- SECTION 15: HR Labor Tables (인사노무 - v6 리빌딩 최종)
-- #####################################################################

-- ─── employee_hr_details (직원 인사정보 확장) ────────────────────────
CREATE TABLE public.employee_hr_details (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id             uuid        NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  resident_number_masked  text,
  address                 text,
  emergency_contact       jsonb,
  bank_account            jsonb,
  employment_type         text        DEFAULT 'regular',
  contract_start_date     date,
  contract_end_date       date,
  probation_end_date      date,
  position_level          text,
  job_title               text,
  base_salary             integer,
  annual_salary           integer,
  salary_type             text        DEFAULT 'monthly',
  annual_leave_basis      text        DEFAULT 'hire_date',
  annual_leave_total      float       DEFAULT 0,
  annual_leave_used       float       DEFAULT 0,
  annual_leave_remaining  float       DEFAULT 0,
  work_schedule           text        DEFAULT 'standard',
  weekly_hours            integer     DEFAULT 40,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX idx_hr_details_employee ON public.employee_hr_details(employee_id);

-- ─── attendance_records (출퇴근 기록) ────────────────────────────────
CREATE TABLE public.attendance_records (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid        NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  date             date        NOT NULL,
  clock_in         timestamptz,
  clock_out        timestamptz,
  clock_in_method  text        DEFAULT 'web',
  clock_in_ip      text,
  clock_in_location jsonb,
  regular_hours    float       DEFAULT 0,
  overtime_hours   float       DEFAULT 0,
  night_hours      float       DEFAULT 0,
  holiday_hours    float       DEFAULT 0,
  total_hours      float       DEFAULT 0,
  status           text        DEFAULT 'normal',
  late_minutes     integer     DEFAULT 0,
  note             text,
  is_modified      boolean     DEFAULT false,
  modified_by      uuid,
  modified_reason  text,
  UNIQUE(employee_id, date),
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_attendance_emp_date ON public.attendance_records(employee_id, date);
CREATE INDEX idx_attendance_date     ON public.attendance_records(date);

-- ─── leave_requests (휴가/연차 신청) ─────────────────────────────────
CREATE TABLE public.leave_requests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type       text        NOT NULL,
  start_date       date        NOT NULL,
  end_date         date        NOT NULL,
  days_count       float       NOT NULL,
  reason           text,
  approval_status  text        DEFAULT 'pending',
  current_step     integer     DEFAULT 0,
  approval_line    jsonb       DEFAULT '[]',
  approved_by      uuid        REFERENCES public.employees(id),
  approved_at      timestamptz,
  rejection_reason text,
  is_promoted      boolean     DEFAULT false,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_leave_req_employee ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_req_status   ON public.leave_requests(approval_status);

-- ─── approval_documents (전자결재 문서) ──────────────────────────────
CREATE TABLE public.approval_documents (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type           text        NOT NULL,
  doc_number         text        UNIQUE,
  title              text        NOT NULL,
  content            jsonb       NOT NULL DEFAULT '{}',
  attachments        jsonb       DEFAULT '[]',
  requester_id       uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  department         text,
  status             text        DEFAULT 'draft',
  current_step       integer     DEFAULT 0,
  total_steps        integer     DEFAULT 0,
  amount             integer,
  linked_leave_id    uuid,
  linked_employee_id uuid,
  submitted_at       timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX idx_approval_doc_requester ON public.approval_documents(requester_id);
CREATE INDEX idx_approval_doc_status    ON public.approval_documents(status);
CREATE INDEX idx_approval_doc_type      ON public.approval_documents(doc_type);

-- ─── approval_steps (결재선) ─────────────────────────────────────────
CREATE TABLE public.approval_steps (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id          uuid        NOT NULL REFERENCES public.approval_documents(id) ON DELETE CASCADE,
  step_order           integer     NOT NULL,
  approver_id          uuid        NOT NULL REFERENCES public.employees(id),
  approver_role        text,
  action               text        DEFAULT 'pending',
  comment              text,
  acted_at             timestamptz,
  is_delegated         boolean     DEFAULT false,
  original_approver_id uuid,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX idx_approval_steps_doc      ON public.approval_steps(document_id);
CREATE INDEX idx_approval_steps_approver ON public.approval_steps(approver_id);

-- ─── approval_templates (결재선 템플릿) ──────────────────────────────
CREATE TABLE public.approval_templates (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type           text        NOT NULL,
  name               text        NOT NULL,
  steps              jsonb       NOT NULL DEFAULT '[]',
  condition_field    text,
  condition_operator text,
  condition_value    text,
  is_active          boolean     DEFAULT true,
  created_at         timestamptz DEFAULT now()
);

-- ─── payroll (급여 정산) ─────────────────────────────────────────────
CREATE TABLE public.payroll (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid        NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  pay_year              integer     NOT NULL,
  pay_month             integer     NOT NULL,
  base_pay              integer     DEFAULT 0,
  overtime_pay          integer     DEFAULT 0,
  night_pay             integer     DEFAULT 0,
  holiday_pay           integer     DEFAULT 0,
  bonus                 integer     DEFAULT 0,
  allowances            jsonb       DEFAULT '{}',
  total_gross           integer     DEFAULT 0,
  income_tax            integer     DEFAULT 0,
  local_tax             integer     DEFAULT 0,
  national_pension      integer     DEFAULT 0,
  health_insurance      integer     DEFAULT 0,
  long_care             integer     DEFAULT 0,
  employment_insurance  integer     DEFAULT 0,
  other_deductions      jsonb       DEFAULT '{}',
  total_deductions      integer     DEFAULT 0,
  net_pay               integer     DEFAULT 0,
  work_days             integer     DEFAULT 0,
  overtime_hours_total  float       DEFAULT 0,
  leave_days_used       float       DEFAULT 0,
  late_count            integer     DEFAULT 0,
  absent_count          integer     DEFAULT 0,
  status                text        DEFAULT 'draft',
  confirmed_by          uuid,
  confirmed_at          timestamptz,
  paid_at               timestamptz,
  UNIQUE(employee_id, pay_year, pay_month),
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_payroll_emp_period ON public.payroll(employee_id, pay_year, pay_month);

-- ─── payroll_settings (급여 설정) ────────────────────────────────────
CREATE TABLE public.payroll_settings (
  id                       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_allowance           integer DEFAULT 200000,
  transportation_allowance integer DEFAULT 0,
  national_pension_rate    float   DEFAULT 0.045,
  health_insurance_rate    float   DEFAULT 0.03545,
  long_care_rate           float   DEFAULT 0.1295,
  employment_insurance_rate float  DEFAULT 0.009,
  tax_year                 integer DEFAULT 2026,
  pay_day                  integer DEFAULT 25,
  updated_at               timestamptz DEFAULT now()
);

-- ─── electronic_contracts (전자계약서) ───────────────────────────────
CREATE TABLE public.electronic_contracts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  contract_type         text        NOT NULL,
  title                 text        NOT NULL,
  content               text        NOT NULL,
  company_signed        boolean     DEFAULT false,
  company_signed_at     timestamptz,
  employee_signed       boolean     DEFAULT false,
  employee_signed_at    timestamptz,
  employee_signature_url text,
  contract_start        date,
  contract_end          date,
  pdf_url               text,
  status                text        DEFAULT 'draft',
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_contracts_employee ON public.electronic_contracts(employee_id);

-- ─── personnel_orders (인사 발령 이력) ──────────────────────────────
CREATE TABLE public.personnel_orders (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  order_type            text        NOT NULL,
  effective_date        date        NOT NULL,
  from_department       text,
  to_department         text,
  from_position         text,
  to_position           text,
  from_salary           integer,
  to_salary             integer,
  reason                text,
  approval_document_id  uuid,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_personnel_employee ON public.personnel_orders(employee_id);

-- ─── approval_delegations (결재 위임) ───────────────────────────────
CREATE TABLE public.approval_delegations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id uuid        NOT NULL REFERENCES public.employees(id),
  delegate_id  uuid        NOT NULL REFERENCES public.employees(id),
  start_date   date        NOT NULL,
  end_date     date        NOT NULL,
  reason       text,
  is_active    boolean     DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

-- ─── weekly_hours_tracking (주 52시간 추적) ─────────────────────────
CREATE TABLE public.weekly_hours_tracking (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid    NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  week_start     date    NOT NULL,
  week_end       date    NOT NULL,
  regular_hours  float   DEFAULT 0,
  overtime_hours float   DEFAULT 0,
  total_hours    float   DEFAULT 0,
  is_over_48     boolean DEFAULT false,
  is_over_52     boolean DEFAULT false,
  alert_sent     boolean DEFAULT false,
  UNIQUE(employee_id, week_start),
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_weekly_hours_emp ON public.weekly_hours_tracking(employee_id, week_start);

-- ─── certificates (증명서) ───────────────────────────────────────────
CREATE TABLE public.certificates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid        NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  certificate_type text        NOT NULL,
  issued_at        timestamptz DEFAULT now(),
  issued_data      jsonb,
  pdf_url          text,
  purpose          text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_certificates_employee ON public.certificates(employee_id);

-- ─── training_records (교육 관리) ────────────────────────────────────
CREATE TABLE public.training_records (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  training_type   text        NOT NULL,
  training_name   text        NOT NULL,
  year            integer     NOT NULL,
  completed       boolean     DEFAULT false,
  completed_at    date,
  certificate_url text,
  uploaded_at     timestamptz,
  note            text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(employee_id, training_name, year)
);

CREATE INDEX idx_training_emp_year ON public.training_records(employee_id, year);


-- #####################################################################
-- SECTION 16: Bulletin Board & Calendar (게시판/캘린더)
-- #####################################################################

-- ─── bulletin_posts (게시글) ─────────────────────────────────────────
CREATE TABLE public.bulletin_posts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category      text        NOT NULL DEFAULT 'general',
  title         text        NOT NULL,
  content       text        NOT NULL,
  author_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  department    text,
  is_pinned     boolean     DEFAULT false,
  is_important  boolean     DEFAULT false,
  view_count    integer     DEFAULT 0,
  comment_count integer     DEFAULT 0,
  attachments   jsonb       DEFAULT '[]',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_bulletin_posts_category ON public.bulletin_posts(category);
CREATE INDEX idx_bulletin_posts_created  ON public.bulletin_posts(created_at DESC);
CREATE INDEX idx_bulletin_posts_author   ON public.bulletin_posts(author_id);
CREATE INDEX idx_bulletin_posts_pinned   ON public.bulletin_posts(is_pinned) WHERE is_pinned = true;

-- ─── bulletin_comments (댓글) ────────────────────────────────────────
CREATE TABLE public.bulletin_comments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid        NOT NULL REFERENCES public.bulletin_posts(id) ON DELETE CASCADE,
  author_id         uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  content           text        NOT NULL,
  parent_comment_id uuid        REFERENCES public.bulletin_comments(id) ON DELETE CASCADE,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_bulletin_comments_post   ON public.bulletin_comments(post_id);
CREATE INDEX idx_bulletin_comments_parent ON public.bulletin_comments(parent_comment_id);

-- ─── company_events (전사 캘린더) ────────────────────────────────────
CREATE TABLE public.company_events (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                   text        NOT NULL,
  description             text,
  event_type              text        NOT NULL DEFAULT 'company',
  start_datetime          timestamptz NOT NULL,
  end_datetime            timestamptz,
  all_day                 boolean     DEFAULT false,
  participants            uuid[]      DEFAULT '{}',
  department_id           uuid        REFERENCES public.departments(id) ON DELETE SET NULL,
  color                   text,
  external_calendar_id    text,
  external_source         text,
  sync_status             text        DEFAULT 'local_only',
  linked_candidate_id     uuid,
  linked_project_id       text,
  linked_leave_request_id uuid,
  recurrence_rule         text,
  created_by              uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX idx_company_events_start    ON public.company_events(start_datetime);
CREATE INDEX idx_company_events_type     ON public.company_events(event_type);
CREATE INDEX idx_company_events_dept     ON public.company_events(department_id);
CREATE INDEX idx_company_events_external ON public.company_events(external_calendar_id) WHERE external_calendar_id IS NOT NULL;


-- #####################################################################
-- SECTION 17: Recruitment / Lifecycle Indexes (채용 인덱스)
-- #####################################################################

CREATE INDEX idx_candidates_job_posting         ON public.candidates(job_posting_id);
CREATE INDEX idx_candidates_status              ON public.candidates(status);
CREATE INDEX idx_candidates_source              ON public.candidates(source_channel);
CREATE INDEX idx_candidates_invite_token        ON public.candidates(invite_token);
CREATE INDEX idx_resume_analysis_candidate      ON public.resume_analysis(candidate_id);
CREATE INDEX idx_interview_schedules_candidate  ON public.interview_schedules(candidate_id);
CREATE INDEX idx_interview_schedules_date       ON public.interview_schedules(scheduled_at);
CREATE INDEX idx_interview_recordings_candidate ON public.interview_recordings(candidate_id);
CREATE INDEX idx_face_to_face_candidate         ON public.face_to_face_evals(candidate_id);
CREATE INDEX idx_recruitment_reports_candidate   ON public.recruitment_reports(candidate_id);
CREATE INDEX idx_hiring_decisions_candidate      ON public.hiring_decisions(candidate_id);
CREATE INDEX idx_employee_profiles_employee      ON public.employee_profiles(employee_id);
CREATE INDEX idx_personality_analysis_employee   ON public.personality_analysis(employee_id);
CREATE INDEX idx_ojt_enrollments_employee        ON public.ojt_enrollments(employee_id);
CREATE INDEX idx_ojt_enrollments_program         ON public.ojt_enrollments(program_id);
CREATE INDEX idx_mentor_assignments_mentee       ON public.mentor_assignments(mentee_id);
CREATE INDEX idx_mentor_assignments_mentor       ON public.mentor_assignments(mentor_id);
CREATE INDEX idx_mentor_daily_reports_assignment  ON public.mentor_daily_reports(assignment_id);
CREATE INDEX idx_probation_evals_employee        ON public.probation_evaluations(employee_id);
CREATE INDEX idx_special_notes_employee          ON public.special_notes(employee_id);
CREATE INDEX idx_exit_surveys_employee           ON public.exit_surveys(employee_id);
CREATE INDEX idx_exit_surveys_token              ON public.exit_surveys(token);
CREATE INDEX idx_work_metrics_employee           ON public.work_metrics(employee_id);
CREATE INDEX idx_ai_accuracy_candidate           ON public.ai_accuracy_log(candidate_id);
CREATE INDEX idx_ai_accuracy_employee            ON public.ai_accuracy_log(employee_id);

-- ─── 보강: 누락 인덱스 추가 (장기 운영 성능 최적화) ─────────────────
CREATE INDEX idx_evaluation_items_category        ON public.evaluation_items(category_id);
CREATE INDEX idx_pre_survey_templates_active      ON public.pre_survey_templates(is_active);
CREATE INDEX idx_interview_analyses_candidate     ON public.interview_analyses(candidate_id);
CREATE INDEX idx_job_postings_department          ON public.job_postings(department_id);
CREATE INDEX idx_job_postings_status              ON public.job_postings(status);
CREATE INDEX idx_leave_requests_dates             ON public.leave_requests(start_date, end_date);
CREATE INDEX idx_payroll_status                   ON public.payroll(status);
CREATE INDEX idx_personnel_orders_date            ON public.personnel_orders(effective_date);

-- ─── 보강: JSONB GIN 인덱스 (검색 성능 최적화) ──────────────────────
CREATE INDEX idx_candidates_metadata_gin          ON public.candidates USING GIN (metadata);
CREATE INDEX idx_candidates_survey_data_gin       ON public.candidates USING GIN (pre_survey_data);


-- #####################################################################
-- SECTION 18: Views (뷰)
-- #####################################################################

-- ─── v_evaluation_summary (평가 요약 대시보드) ───────────────────────
CREATE OR REPLACE VIEW public.v_evaluation_summary AS
WITH
  self_totals AS (
    SELECT se.target_id, SUM(se.score) AS self_total
    FROM public.self_evaluations se
    WHERE se.score IS NOT NULL AND se.is_draft = false
    GROUP BY se.target_id
  ),
  evaluator_totals AS (
    SELECT
      es.target_id,
      SUM(CASE WHEN es.evaluator_role = 'leader'   THEN es.score END) AS leader_total,
      SUM(CASE WHEN es.evaluator_role = 'director'  THEN es.score END) AS director_total,
      SUM(CASE WHEN es.evaluator_role = 'ceo'       THEN es.score END) AS ceo_total
    FROM public.evaluator_scores es
    WHERE es.score IS NOT NULL AND es.is_draft = false
    GROUP BY es.target_id
  ),
  weighted AS (
    SELECT
      t.id AS target_id,
      CASE
        WHEN (
          COALESCE(CASE WHEN st.self_total     IS NOT NULL THEN w_self.weight END, 0) +
          COALESCE(CASE WHEN et.leader_total   IS NOT NULL THEN w_leader.weight END, 0) +
          COALESCE(CASE WHEN et.director_total IS NOT NULL THEN w_dir.weight END, 0) +
          COALESCE(CASE WHEN et.ceo_total      IS NOT NULL THEN w_ceo.weight END, 0)
        ) = 0 THEN NULL
        ELSE ROUND(
          (
            COALESCE(st.self_total     * w_self.weight,   0) +
            COALESCE(et.leader_total   * w_leader.weight, 0) +
            COALESCE(et.director_total * w_dir.weight,    0) +
            COALESCE(et.ceo_total      * w_ceo.weight,    0)
          ) / (
            COALESCE(CASE WHEN st.self_total     IS NOT NULL THEN w_self.weight END, 0) +
            COALESCE(CASE WHEN et.leader_total   IS NOT NULL THEN w_leader.weight END, 0) +
            COALESCE(CASE WHEN et.director_total IS NOT NULL THEN w_dir.weight END, 0) +
            COALESCE(CASE WHEN et.ceo_total      IS NOT NULL THEN w_ceo.weight END, 0)
          )
        , 2)
      END AS weighted_score
    FROM public.evaluation_targets t
    LEFT JOIN self_totals     st ON st.target_id = t.id
    LEFT JOIN evaluator_totals et ON et.target_id = t.id
    LEFT JOIN public.evaluation_weights w_self   ON w_self.period_id   = t.period_id AND w_self.evaluator_role   = 'self'
    LEFT JOIN public.evaluation_weights w_leader ON w_leader.period_id = t.period_id AND w_leader.evaluator_role = 'leader'
    LEFT JOIN public.evaluation_weights w_dir    ON w_dir.period_id    = t.period_id AND w_dir.evaluator_role    = 'director'
    LEFT JOIN public.evaluation_weights w_ceo    ON w_ceo.period_id    = t.period_id AND w_ceo.evaluator_role    = 'ceo'
  )
SELECT
  t.id              AS target_id,
  t.period_id,
  p.year,
  p.quarter,
  t.employee_id,
  e.name            AS employee_name,
  d.name            AS department_name,
  st.self_total,
  et.leader_total,
  et.director_total,
  et.ceo_total,
  w.weighted_score,
  CASE
    WHEN w.weighted_score IS NULL THEN NULL
    WHEN w.weighted_score >= 90   THEN 'S'
    WHEN w.weighted_score >= 80   THEN 'A'
    WHEN w.weighted_score >= 70   THEN 'B'
    WHEN w.weighted_score >= 60   THEN 'C'
    ELSE 'D'
  END               AS grade,
  t.status
FROM public.evaluation_targets t
JOIN public.evaluation_periods p ON p.id = t.period_id
JOIN public.employees          e ON e.id = t.employee_id
LEFT JOIN public.departments   d ON d.id = e.department_id
LEFT JOIN self_totals         st ON st.target_id = t.id
LEFT JOIN evaluator_totals    et ON et.target_id = t.id
LEFT JOIN weighted             w ON w.target_id  = t.id;

-- ─── v_item_scores_comparison (항목별 점수 비교) ─────────────────────
CREATE OR REPLACE VIEW public.v_item_scores_comparison AS
SELECT
  t.id              AS target_id,
  emp.name          AS employee_name,
  i.name            AS item_name,
  c.name            AS category_name,
  se.score          AS self_score,
  MAX(CASE WHEN es.evaluator_role = 'leader'   THEN es.score END) AS leader_score,
  MAX(CASE WHEN es.evaluator_role = 'director'  THEN es.score END) AS director_score,
  MAX(CASE WHEN es.evaluator_role = 'ceo'       THEN es.score END) AS ceo_score,
  (
    GREATEST(
      COALESCE(se.score, -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'leader'   THEN es.score END), -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'director'  THEN es.score END), -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'ceo'       THEN es.score END), -1)
    ) -
    LEAST(
      COALESCE(se.score, 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'leader'   THEN es.score END), 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'director'  THEN es.score END), 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'ceo'       THEN es.score END), 11)
    )
  ) AS max_deviation,
  (
    GREATEST(
      COALESCE(se.score, -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'leader'   THEN es.score END), -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'director'  THEN es.score END), -1),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'ceo'       THEN es.score END), -1)
    ) -
    LEAST(
      COALESCE(se.score, 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'leader'   THEN es.score END), 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'director'  THEN es.score END), 11),
      COALESCE(MAX(CASE WHEN es.evaluator_role = 'ceo'       THEN es.score END), 11)
    )
  ) >= 3 AS has_deviation_flag
FROM public.evaluation_targets t
JOIN public.employees           emp ON emp.id = t.employee_id
CROSS JOIN public.evaluation_items i
JOIN public.evaluation_categories c ON c.id = i.category_id
LEFT JOIN public.self_evaluations se ON se.target_id = t.id AND se.item_id = i.id
LEFT JOIN public.evaluator_scores es ON es.target_id = t.id AND es.item_id = i.id
WHERE i.is_active = true
GROUP BY t.id, emp.name, i.id, i.name, c.name, se.score;

-- ─── v_evaluation_progress (평가 진행률) ─────────────────────────────
CREATE OR REPLACE VIEW public.v_evaluation_progress AS
WITH status_order(status_name, status_rank) AS (
  VALUES
    ('pending',        0),
    ('self_done',      1),
    ('leader_done',    2),
    ('director_done',  3),
    ('ceo_done',       4),
    ('completed',      5)
)
SELECT
  p.id               AS period_id,
  p.year,
  p.quarter,
  COUNT(t.id)        AS total_employees,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 1) AS self_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 2) AS leader_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 3) AS director_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 4) AS ceo_done_count,
  COUNT(t.id) FILTER (WHERE so.status_rank >= 5) AS completed_count
FROM public.evaluation_periods p
LEFT JOIN public.evaluation_targets t ON t.period_id = p.id
LEFT JOIN status_order so ON so.status_name = t.status
GROUP BY p.id, p.year, p.quarter;


-- #####################################################################
-- SECTION 19: Functions (최종 버전)
-- #####################################################################

-- ─── 헬퍼 함수: 현재 사용자 역할 ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text AS $$
  SELECT role FROM public.employees WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_department_id()
RETURNS uuid AS $$
  SELECT department_id FROM public.employees WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- is_admin(): director/division_head/ceo/admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT role IN ('director','division_head','ceo','admin')
     FROM public.employees WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 본인 레코드 여부
CREATE OR REPLACE FUNCTION public.is_own_record(record_employee_id uuid)
RETURNS boolean AS $$
  SELECT record_employee_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 팀 리더 여부
CREATE OR REPLACE FUNCTION public.is_team_leader_of(target_employee_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees me
    JOIN public.employees target ON target.department_id = me.department_id
    WHERE me.id = auth.uid()
      AND target.id = target_employee_id
      AND me.role IN ('leader','director','division_head','ceo','admin')
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 결재 순환참조 방지 헬퍼
CREATE OR REPLACE FUNCTION public.is_approver_of_document(doc_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_steps WHERE document_id = doc_id AND approver_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_requester_of_step_document(step_doc_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_documents WHERE id = step_doc_id AND requester_id = auth.uid()
  );
$$;

-- ─── calculate_final_score: 가중치 적용 최종 점수 ───────────────────
CREATE OR REPLACE FUNCTION public.calculate_final_score(p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period_id      uuid;
  v_self_total     decimal;
  v_leader_total   decimal;
  v_director_total decimal;
  v_ceo_total      decimal;
  v_weighted_sum   decimal := 0;
  v_weight_sum     decimal := 0;
  v_score          decimal;
  v_grade          text;
  v_w              decimal;
BEGIN
  SELECT period_id INTO v_period_id FROM evaluation_targets WHERE id = p_target_id;
  IF v_period_id IS NULL THEN RAISE EXCEPTION '평가 대상을 찾을 수 없습니다: %', p_target_id; END IF;

  SELECT SUM(score) INTO v_self_total FROM self_evaluations
    WHERE target_id = p_target_id AND score IS NOT NULL AND is_draft = false;

  SELECT
    SUM(CASE WHEN evaluator_role = 'leader'   THEN score END),
    SUM(CASE WHEN evaluator_role = 'director' THEN score END),
    SUM(CASE WHEN evaluator_role = 'ceo'      THEN score END)
  INTO v_leader_total, v_director_total, v_ceo_total
  FROM evaluator_scores WHERE target_id = p_target_id AND score IS NOT NULL AND is_draft = false;

  -- self
  IF v_self_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'self';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_self_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;
  -- leader
  IF v_leader_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'leader';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_leader_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;
  -- director
  IF v_director_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'director';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_director_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;
  -- ceo
  IF v_ceo_total IS NOT NULL THEN
    SELECT weight INTO v_w FROM evaluation_weights WHERE period_id = v_period_id AND evaluator_role = 'ceo';
    IF v_w IS NOT NULL THEN v_weighted_sum := v_weighted_sum + v_ceo_total * v_w; v_weight_sum := v_weight_sum + v_w; END IF;
  END IF;

  IF v_weight_sum > 0 THEN v_score := ROUND(v_weighted_sum / v_weight_sum, 2); ELSE v_score := NULL; END IF;

  v_grade := CASE WHEN v_score IS NULL THEN NULL WHEN v_score >= 90 THEN 'S' WHEN v_score >= 80 THEN 'A' WHEN v_score >= 70 THEN 'B' WHEN v_score >= 60 THEN 'C' ELSE 'D' END;

  UPDATE evaluation_targets SET final_score = v_score, grade = v_grade WHERE id = p_target_id;
  RETURN jsonb_build_object('score', v_score, 'grade', v_grade);
END;
$$;

-- ─── generate_evaluation_sheets: 평가 시트 일괄 생성 ────────────────
CREATE OR REPLACE FUNCTION public.generate_evaluation_sheets(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target_id   uuid;
  v_employee_id uuid;
  v_count       integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM evaluation_periods WHERE id = p_period_id) THEN
    RAISE EXCEPTION '평가 기간을 찾을 수 없습니다: %', p_period_id;
  END IF;
  FOR v_employee_id IN SELECT id FROM employees WHERE is_active = true AND role IN ('employee','leader')
  LOOP
    INSERT INTO evaluation_targets (period_id, employee_id, status)
    VALUES (p_period_id, v_employee_id, 'pending')
    ON CONFLICT (period_id, employee_id) DO NOTHING
    RETURNING id INTO v_target_id;
    IF v_target_id IS NOT NULL THEN
      INSERT INTO self_evaluations (target_id, item_id)
      SELECT v_target_id, i.id FROM evaluation_items i WHERE i.is_active = true
      ON CONFLICT (target_id, item_id) DO NOTHING;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ─── advance_evaluation_stage: 평가 단계 전진 ──────────────────────
CREATE OR REPLACE FUNCTION public.advance_evaluation_stage(p_target_id uuid, p_current_role text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_status text; v_expected_status text; v_next_status text;
  v_total_items integer; v_scored_items integer; v_missing integer; v_employee_role text;
BEGIN
  SELECT status INTO v_current_status FROM evaluation_targets WHERE id = p_target_id;
  IF v_current_status IS NULL THEN RAISE EXCEPTION '평가 대상을 찾을 수 없습니다: %', p_target_id; END IF;

  CASE p_current_role
    WHEN 'self'     THEN v_expected_status := 'pending';       v_next_status := 'self_done';
    WHEN 'leader'   THEN v_expected_status := 'self_done';     v_next_status := 'leader_done';
    WHEN 'director' THEN v_expected_status := 'leader_done';   v_next_status := 'director_done';
    WHEN 'ceo'      THEN v_expected_status := 'director_done'; v_next_status := 'ceo_done';
    ELSE RAISE EXCEPTION '잘못된 평가자 역할입니다: %', p_current_role;
  END CASE;

  IF v_current_status <> v_expected_status THEN
    RAISE EXCEPTION '현재 단계(%)에서 % 역할이 평가를 진행할 수 없습니다.', v_current_status, p_current_role;
  END IF;

  SELECT COUNT(*) INTO v_total_items FROM evaluation_items WHERE is_active = true;

  IF p_current_role = 'self' THEN
    SELECT COUNT(*) INTO v_scored_items FROM self_evaluations WHERE target_id = p_target_id AND score IS NOT NULL;
    v_missing := v_total_items - v_scored_items;
    IF v_missing > 0 THEN RAISE EXCEPTION '자기평가 미입력 항목이 %개 있습니다.', v_missing; END IF;
    UPDATE self_evaluations SET is_draft = false WHERE target_id = p_target_id;
  ELSE
    SELECT COUNT(*) INTO v_scored_items FROM evaluator_scores WHERE target_id = p_target_id AND evaluator_role = p_current_role AND score IS NOT NULL;
    v_missing := v_total_items - v_scored_items;
    IF v_missing > 0 THEN RAISE EXCEPTION '% 평가 미입력 항목이 %개 있습니다.', p_current_role, v_missing; END IF;
    UPDATE evaluator_scores SET is_draft = false WHERE target_id = p_target_id AND evaluator_role = p_current_role;
  END IF;

  UPDATE evaluation_targets SET status = v_next_status WHERE id = p_target_id;

  -- 리더 자기평가 완료 시 leader_done 자동 스킵
  IF p_current_role = 'self' AND v_next_status = 'self_done' THEN
    SELECT e.role INTO v_employee_role FROM evaluation_targets t JOIN employees e ON e.id = t.employee_id WHERE t.id = p_target_id;
    IF v_employee_role = 'leader' THEN
      UPDATE evaluation_targets SET status = 'leader_done' WHERE id = p_target_id;
      RETURN 'leader_done';
    END IF;
  END IF;

  IF v_next_status = 'ceo_done' THEN
    PERFORM calculate_final_score(p_target_id);
    UPDATE evaluation_targets SET status = 'completed' WHERE id = p_target_id;
    RETURN 'completed';
  END IF;

  RETURN v_next_status;
END;
$$;

-- ─── create_employee_with_auth: 직원 생성 RPC ──────────────────────
CREATE OR REPLACE FUNCTION public.create_employee_with_auth(
  p_email text, p_password text, p_name text,
  p_role text DEFAULT 'employee', p_department_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_now timestamptz := now(); v_has_is_sso_user boolean;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '직원을 생성할 권한이 없습니다.'; END IF;
  IF p_role NOT IN ('employee','leader','director','division_head','ceo','admin') THEN
    RAISE EXCEPTION '유효하지 않은 역할입니다: %', p_role;
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION '이미 등록된 이메일입니다: %', p_email;
  END IF;

  v_user_id := gen_random_uuid();

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'is_sso_user'
  ) INTO v_has_is_sso_user;

  IF v_has_is_sso_user THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
    VALUES (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, p_password, v_now, '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', p_name), v_now, v_now, '', '', false);
  ELSE
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
    VALUES (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, p_password, v_now, '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', p_name), v_now, v_now, '', '');
  END IF;

  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (v_user_id, v_user_id, p_email, 'email', jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true), v_now, v_now, v_now);

  INSERT INTO public.employees (id, email, name, role, department_id, is_active)
  VALUES (v_user_id, p_email, p_name, p_role, p_department_id, true);

  RETURN v_user_id;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION '이미 등록된 이메일이거나 중복된 데이터입니다: %', p_email;
  WHEN others THEN RAISE EXCEPTION '직원 생성 중 오류: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

-- ─── delete_employee: 직원 삭제 RPC ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_employee(p_employee_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '직원을 삭제할 권한이 없습니다.'; END IF;
  DELETE FROM public.evaluator_comments WHERE target_id IN (SELECT id FROM public.evaluation_targets WHERE employee_id = p_employee_id);
  DELETE FROM public.evaluator_scores WHERE target_id IN (SELECT id FROM public.evaluation_targets WHERE employee_id = p_employee_id);
  DELETE FROM public.self_evaluations WHERE target_id IN (SELECT id FROM public.evaluation_targets WHERE employee_id = p_employee_id);
  DELETE FROM public.evaluation_targets WHERE employee_id = p_employee_id;
  DELETE FROM public.employees WHERE id = p_employee_id;
  DELETE FROM auth.identities WHERE user_id = p_employee_id;
  DELETE FROM auth.users WHERE id = p_employee_id;
END;
$$;

-- ─── reset_employee_password: 비밀번호 초기화 ───────────────────────
CREATE OR REPLACE FUNCTION public.reset_employee_password(p_employee_id uuid, p_new_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '비밀번호를 변경할 권한이 없습니다.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id) THEN RAISE EXCEPTION '해당 직원을 찾을 수 없습니다.'; END IF;
  UPDATE auth.users SET encrypted_password = p_new_password, updated_at = now() WHERE id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION '해당 사용자의 인증 정보를 찾을 수 없습니다.'; END IF;
END;
$$;

-- ─── get_email_by_employee_number: 사원번호로 이메일 조회 ───────────
CREATE OR REPLACE FUNCTION public.get_email_by_employee_number(p_employee_number text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  SELECT email INTO v_email FROM public.employees WHERE employee_number = p_employee_number AND is_active = true LIMIT 1;
  IF v_email IS NULL THEN RAISE EXCEPTION '해당 사원번호를 찾을 수 없습니다: %', p_employee_number; END IF;
  RETURN v_email;
END;
$$;

-- ─── generate_employee_number: 사원번호 자동 생성 ───────────────────
CREATE OR REPLACE FUNCTION public.generate_employee_number()
RETURNS TRIGGER AS $$
DECLARE v_date_part text; v_seq integer; v_emp_number text;
BEGIN
  IF NEW.hire_date IS NOT NULL AND (NEW.employee_number IS NULL OR NEW.employee_number = '') THEN
    v_date_part := to_char(NEW.hire_date, 'YYMMDD');
    SELECT COALESCE(MAX(
      CASE WHEN employee_number ~ ('^' || v_date_part || '\d{2}$')
        THEN substring(employee_number FROM 7 FOR 2)::integer ELSE 0 END
    ), 0) + 1 INTO v_seq
    FROM public.employees WHERE employee_number LIKE v_date_part || '%' AND id != NEW.id;
    v_emp_number := v_date_part || lpad(v_seq::text, 2, '0');
    NEW.employee_number := v_emp_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_employee_number ON public.employees;
CREATE TRIGGER trg_auto_employee_number
  BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.generate_employee_number();

-- ─── submit_application: 비로그인 지원서 제출 ───────────────────────
CREATE OR REPLACE FUNCTION public.submit_application(
  p_job_posting_id uuid, p_name text, p_email text,
  p_phone text DEFAULT NULL, p_source_channel text DEFAULT 'direct',
  p_source_detail text DEFAULT NULL, p_resume_url text DEFAULT NULL,
  p_cover_letter_url text DEFAULT NULL, p_cover_letter_text text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_candidate_id uuid; v_posting_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM job_postings WHERE id = p_job_posting_id AND status = 'open') INTO v_posting_exists;
  IF NOT v_posting_exists THEN RAISE EXCEPTION '채용공고가 존재하지 않거나 마감되었습니다.'; END IF;
  INSERT INTO candidates (job_posting_id, name, email, phone, source_channel, source_detail, resume_url, cover_letter_url, cover_letter_text, status)
  VALUES (p_job_posting_id, p_name, p_email, p_phone, p_source_channel, p_source_detail, p_resume_url, p_cover_letter_url, p_cover_letter_text, 'applied')
  RETURNING id INTO v_candidate_id;
  RETURN v_candidate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_application TO anon;
GRANT EXECUTE ON FUNCTION public.submit_application TO authenticated;


-- #####################################################################
-- SECTION 20: Triggers (트리거)
-- #####################################################################

-- 긴급 업무 updated_at
CREATE OR REPLACE FUNCTION public.update_urgent_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_urgent_tasks_updated_at
  BEFORE UPDATE ON public.urgent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_urgent_tasks_updated_at();

-- 긴급 업무 기한 초과 자동 감지
CREATE OR REPLACE FUNCTION public.check_urgent_task_overdue()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deadline < now() AND NEW.status IN ('pending','in_progress') THEN
    NEW.is_overdue = true;
    NEW.status = 'overdue';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_overdue
  BEFORE INSERT OR UPDATE ON public.urgent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.check_urgent_task_overdue();

-- 메신저 last_message_at 자동 갱신 + unread_count 트리거
CREATE OR REPLACE FUNCTION public.update_room_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chat_rooms SET last_message_at = now(), updated_at = now() WHERE id = NEW.room_id;
  UPDATE public.chat_room_members SET unread_count = unread_count + 1
    WHERE room_id = NEW.room_id AND user_id != COALESCE(NEW.sender_id, '00000000-0000-0000-0000-000000000000'::uuid);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_room_last_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_room_last_message();

-- AI 에이전트 메시지 카운트 자동 업데이트
CREATE OR REPLACE FUNCTION public.update_agent_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.agent_conversations SET message_count = message_count + 1, last_message_at = now(), updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agent_msg_stats
  AFTER INSERT ON public.agent_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_agent_conversation_stats();

-- 출퇴근 시 근무시간 자동 계산
CREATE OR REPLACE FUNCTION public.calculate_work_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_in IS NOT NULL AND NEW.clock_out IS NOT NULL THEN
    NEW.total_hours := ROUND((EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600 - 1)::numeric, 1);
    IF NEW.total_hours < 0 THEN NEW.total_hours := 0; END IF;
    IF NEW.total_hours > 8 THEN
      NEW.regular_hours := 8;
      NEW.overtime_hours := ROUND((NEW.total_hours - 8)::numeric, 1);
    ELSE
      NEW.regular_hours := NEW.total_hours;
      NEW.overtime_hours := 0;
    END IF;
    IF EXTRACT(HOUR FROM NEW.clock_in AT TIME ZONE 'Asia/Seoul') > 9
       OR (EXTRACT(HOUR FROM NEW.clock_in AT TIME ZONE 'Asia/Seoul') = 9
           AND EXTRACT(MINUTE FROM NEW.clock_in AT TIME ZONE 'Asia/Seoul') > 0) THEN
      NEW.status := 'late';
      NEW.late_minutes := ROUND(EXTRACT(EPOCH FROM (
        NEW.clock_in AT TIME ZONE 'Asia/Seoul' - (NEW.date + TIME '09:00:00')
      )) / 60);
      IF NEW.late_minutes < 0 THEN NEW.late_minutes := 0; END IF;
    END IF;
    IF NEW.total_hours < 6 AND NEW.status = 'normal' THEN
      NEW.status := 'early_leave';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_hours
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.calculate_work_hours();

-- 결재 문서번호 자동 생성
CREATE OR REPLACE FUNCTION public.generate_doc_number()
RETURNS TRIGGER AS $$
DECLARE year_str text; seq_num integer;
BEGIN
  year_str := to_char(now(), 'YYYY');
  SELECT COUNT(*) + 1 INTO seq_num FROM approval_documents WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now());
  NEW.doc_number := 'AP-' || year_str || '-' || lpad(seq_num::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_doc_number
  BEFORE INSERT ON public.approval_documents
  FOR EACH ROW WHEN (NEW.doc_number IS NULL)
  EXECUTE FUNCTION public.generate_doc_number();

-- 연차 승인 시 잔여일수 자동 갱신
CREATE OR REPLACE FUNCTION public.update_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.approval_status = 'approved' AND (OLD.approval_status IS NULL OR OLD.approval_status != 'approved') THEN
    UPDATE employee_hr_details
    SET annual_leave_used = annual_leave_used + NEW.days_count,
        annual_leave_remaining = annual_leave_total - (annual_leave_used + NEW.days_count),
        updated_at = now()
    WHERE employee_id = NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leave_balance
  AFTER INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_leave_balance();


-- #####################################################################
-- SECTION 21: RLS (Row Level Security) 정책
-- #####################################################################

-- ═══ RLS 활성화 ══════════════════════════════════════════════════════

ALTER TABLE public.departments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_periods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_targets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_evaluations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluator_scores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluator_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_weights    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_criteria        ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_postings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_analysis           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_survey_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_schedules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_recordings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_to_face_evals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_analysis            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcriptions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_analyses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_decisions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_accuracy_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_trust_metrics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_phase_transitions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personality_analysis      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_visibility_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ojt_programs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ojt_enrollments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_assignments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_daily_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probation_evaluations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_notes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exit_surveys              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_metrics              ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_boards   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_updates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_templates  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.urgent_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reminders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_penalties ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_rooms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feature_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages        ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.imported_work_data    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_records       ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.monthly_checkins        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_reviews            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_review_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.employee_hr_details   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_steps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electronic_contracts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_delegations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_hours_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records      ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bulletin_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletin_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_events     ENABLE ROW LEVEL SECURITY;


-- ═══ Core: departments 정책 ═════════════════════════════════════════
CREATE POLICY "dept_select_authenticated" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept_insert_admin" ON public.departments FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "dept_update_admin" ON public.departments FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "dept_delete_admin" ON public.departments FOR DELETE TO authenticated USING (public.is_admin());

-- ═══ Core: employees 정책 ═══════════════════════════════════════════
CREATE POLICY "emp_select_authenticated" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "emp_update_self_or_admin" ON public.employees FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "emp_insert_admin" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "emp_delete_admin" ON public.employees FOR DELETE TO authenticated USING (public.is_admin());

-- ═══ Evaluation: periods/categories/items/weights/grade_criteria ════
CREATE POLICY "period_select_authenticated" ON public.evaluation_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "period_insert_admin" ON public.evaluation_periods FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "period_update_admin" ON public.evaluation_periods FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "period_delete_admin" ON public.evaluation_periods FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "cat_select_authenticated" ON public.evaluation_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "cat_insert_admin" ON public.evaluation_categories FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "cat_update_admin" ON public.evaluation_categories FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "cat_delete_admin" ON public.evaluation_categories FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "item_select_authenticated" ON public.evaluation_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_insert_admin" ON public.evaluation_items FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "item_update_admin" ON public.evaluation_items FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "item_delete_admin" ON public.evaluation_items FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "weight_select_authenticated" ON public.evaluation_weights FOR SELECT TO authenticated USING (true);
CREATE POLICY "weight_insert_admin" ON public.evaluation_weights FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "weight_update_admin" ON public.evaluation_weights FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "weight_delete_admin" ON public.evaluation_weights FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "grade_criteria_select_all" ON public.grade_criteria FOR SELECT USING (true);
CREATE POLICY "grade_criteria_manage_admin" ON public.grade_criteria FOR ALL TO authenticated USING (public.is_admin());

-- ═══ Evaluation: targets ════════════════════════════════════════════
CREATE POLICY "target_select_own" ON public.evaluation_targets FOR SELECT TO authenticated USING (employee_id = auth.uid());
CREATE POLICY "target_select_leader_dept" ON public.evaluation_targets FOR SELECT TO authenticated
  USING (public.get_my_role() = 'leader' AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = evaluation_targets.employee_id AND e.department_id = public.get_my_department_id()));
CREATE POLICY "target_select_director_up" ON public.evaluation_targets FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('director','division_head','ceo','admin'));
CREATE POLICY "target_update_admin" ON public.evaluation_targets FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "target_insert_admin" ON public.evaluation_targets FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "target_delete_admin" ON public.evaluation_targets FOR DELETE TO authenticated USING (public.is_admin());

-- ═══ Evaluation: self_evaluations ═══════════════════════════════════
CREATE POLICY "self_eval_select_own" ON public.self_evaluations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evaluation_targets t WHERE t.id = self_evaluations.target_id AND t.employee_id = auth.uid()));
CREATE POLICY "self_eval_select_evaluator" ON public.self_evaluations FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('leader','director','division_head','ceo','admin')
    AND EXISTS (SELECT 1 FROM public.evaluation_targets t WHERE t.id = self_evaluations.target_id
      AND (public.get_my_role() NOT IN ('leader') OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = t.employee_id AND e.department_id = public.get_my_department_id()))));
CREATE POLICY "self_eval_insert_own" ON public.self_evaluations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.evaluation_targets t WHERE t.id = self_evaluations.target_id AND t.employee_id = auth.uid() AND t.status = 'pending'));
CREATE POLICY "self_eval_update_own" ON public.self_evaluations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evaluation_targets t WHERE t.id = self_evaluations.target_id AND t.employee_id = auth.uid() AND t.status = 'pending'));
CREATE POLICY "self_eval_insert_admin" ON public.self_evaluations FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "self_eval_delete_admin" ON public.self_evaluations FOR DELETE TO authenticated USING (public.is_admin());

-- ═══ Evaluation: evaluator_scores ═══════════════════════════════════
CREATE POLICY "eval_score_select_own_target" ON public.evaluator_scores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evaluation_targets t WHERE t.id = evaluator_scores.target_id AND t.employee_id = auth.uid()));
CREATE POLICY "eval_score_select_my_scores" ON public.evaluator_scores FOR SELECT TO authenticated USING (evaluator_id = auth.uid());
CREATE POLICY "eval_score_select_admin" ON public.evaluator_scores FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "eval_score_insert_my_turn" ON public.evaluator_scores FOR INSERT TO authenticated
  WITH CHECK (evaluator_id = auth.uid() AND EXISTS (SELECT 1 FROM public.evaluation_targets t WHERE t.id = evaluator_scores.target_id
    AND ((evaluator_scores.evaluator_role = 'leader' AND t.status = 'self_done') OR (evaluator_scores.evaluator_role = 'director' AND t.status = 'leader_done') OR (evaluator_scores.evaluator_role = 'ceo' AND t.status = 'director_done'))));
CREATE POLICY "eval_score_update_my_turn" ON public.evaluator_scores FOR UPDATE TO authenticated
  USING (evaluator_id = auth.uid() AND EXISTS (SELECT 1 FROM public.evaluation_targets t WHERE t.id = evaluator_scores.target_id
    AND ((evaluator_scores.evaluator_role = 'leader' AND t.status = 'self_done') OR (evaluator_scores.evaluator_role = 'director' AND t.status = 'leader_done') OR (evaluator_scores.evaluator_role = 'ceo' AND t.status = 'director_done'))));

-- ═══ Evaluation: evaluator_comments ═════════════════════════════════
CREATE POLICY "eval_comment_select_own_target" ON public.evaluator_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evaluation_targets t WHERE t.id = evaluator_comments.target_id AND t.employee_id = auth.uid()));
CREATE POLICY "eval_comment_select_my_comments" ON public.evaluator_comments FOR SELECT TO authenticated USING (evaluator_id = auth.uid());
CREATE POLICY "eval_comment_select_admin" ON public.evaluator_comments FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "eval_comment_insert_my_turn" ON public.evaluator_comments FOR INSERT TO authenticated
  WITH CHECK (evaluator_id = auth.uid() AND EXISTS (SELECT 1 FROM public.evaluation_targets t WHERE t.id = evaluator_comments.target_id
    AND ((evaluator_comments.evaluator_role = 'leader' AND t.status = 'self_done') OR (evaluator_comments.evaluator_role = 'director' AND t.status = 'leader_done') OR (evaluator_comments.evaluator_role = 'ceo' AND t.status = 'director_done'))));
CREATE POLICY "eval_comment_update_my_turn" ON public.evaluator_comments FOR UPDATE TO authenticated
  USING (evaluator_id = auth.uid() AND EXISTS (SELECT 1 FROM public.evaluation_targets t WHERE t.id = evaluator_comments.target_id
    AND ((evaluator_comments.evaluator_role = 'leader' AND t.status = 'self_done') OR (evaluator_comments.evaluator_role = 'director' AND t.status = 'leader_done') OR (evaluator_comments.evaluator_role = 'ceo' AND t.status = 'director_done'))));

-- ═══ Recruitment 정책 ═══════════════════════════════════════════════
CREATE POLICY "job_postings_select" ON public.job_postings FOR SELECT TO authenticated USING (true);
CREATE POLICY "job_postings_select_anon" ON public.job_postings FOR SELECT TO anon USING (true);
CREATE POLICY "job_postings_insert" ON public.job_postings FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "job_postings_update" ON public.job_postings FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "job_postings_delete" ON public.job_postings FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "candidates_select" ON public.candidates FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "candidates_insert_auth" ON public.candidates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "candidates_insert_anon" ON public.candidates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "candidates_select_anon_survey" ON public.candidates FOR SELECT TO anon USING (invite_token IS NOT NULL);
CREATE POLICY "candidates_update_anon_survey" ON public.candidates FOR UPDATE TO anon USING (invite_token IS NOT NULL AND status = 'survey_sent') WITH CHECK (invite_token IS NOT NULL);

CREATE POLICY "survey_templates_select_anon" ON public.pre_survey_templates FOR SELECT TO anon USING (is_active = true);

-- 채용관리: 관리자 CRUD, 인증 사용자 SELECT (대부분 동일 패턴)
DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'resume_analysis','pre_survey_templates','interview_schedules',
    'interview_recordings','face_to_face_evals','voice_analysis',
    'transcriptions','recruitment_reports','hiring_decisions','talent_profiles',
    'ai_accuracy_log','ai_trust_metrics','ai_phase_transitions',
    'employee_profiles','personality_analysis','profile_visibility_settings',
    'ojt_programs','ojt_enrollments','mentor_assignments',
    'mentor_daily_reports','probation_evaluations','special_notes',
    'exit_surveys','work_metrics'
  ]) LOOP
    EXECUTE format('CREATE POLICY "%s_select_auth" ON public.%I FOR SELECT TO authenticated USING (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_insert_auth" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_update_auth" ON public.%I FOR UPDATE TO authenticated USING (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_delete_auth" ON public.%I FOR DELETE TO authenticated USING (public.is_admin())', tbl, tbl);
  END LOOP;
END $$;

-- interview_analyses: 모든 인증 사용자 CRUD
CREATE POLICY "interview_analyses_select_auth" ON public.interview_analyses FOR SELECT TO authenticated USING (true);
CREATE POLICY "interview_analyses_insert_auth" ON public.interview_analyses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "interview_analyses_update_auth" ON public.interview_analyses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "interview_analyses_delete_auth" ON public.interview_analyses FOR DELETE TO authenticated USING (true);

-- ═══ Work Management 정책 ═══════════════════════════════════════════
CREATE POLICY "projects_select" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_manage" ON public.projects FOR ALL TO authenticated USING (public.is_admin() OR owner_id = auth.uid());
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated USING (assignee_id = auth.uid() OR public.is_admin());
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated USING (public.is_admin());
CREATE POLICY "daily_reports_select" ON public.daily_reports FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "daily_reports_insert" ON public.daily_reports FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());
CREATE POLICY "daily_reports_update" ON public.daily_reports FOR UPDATE TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "chat_messages_select" ON public.chat_messages FOR SELECT TO authenticated USING (employee_id = auth.uid());
CREATE POLICY "chat_messages_insert" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());

-- ═══ Project Board 정책 ═════════════════════════════════════════════
CREATE POLICY "project_boards_select" ON public.project_boards FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_boards_insert" ON public.project_boards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "project_boards_update" ON public.project_boards FOR UPDATE TO authenticated USING (true);
CREATE POLICY "project_boards_delete" ON public.project_boards FOR DELETE TO authenticated USING (public.is_admin());
CREATE POLICY "pipeline_stages_select" ON public.pipeline_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "pipeline_stages_insert" ON public.pipeline_stages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pipeline_stages_update" ON public.pipeline_stages FOR UPDATE TO authenticated USING (true);
CREATE POLICY "pipeline_stages_delete" ON public.pipeline_stages FOR DELETE TO authenticated USING (public.is_admin());
CREATE POLICY "project_updates_select" ON public.project_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_updates_insert" ON public.project_updates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "project_updates_update" ON public.project_updates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "board_permissions_select" ON public.board_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "board_permissions_manage" ON public.board_permissions FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "project_templates_select" ON public.project_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_templates_manage" ON public.project_templates FOR ALL TO authenticated USING (public.is_admin());

-- ═══ Urgent Tasks 정책 ══════════════════════════════════════════════
CREATE POLICY "urgent_tasks_select" ON public.urgent_tasks FOR SELECT USING (true);
CREATE POLICY "urgent_tasks_insert" ON public.urgent_tasks FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));
CREATE POLICY "urgent_tasks_update" ON public.urgent_tasks FOR UPDATE USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')) OR auth.uid() = ANY(assigned_to));
CREATE POLICY "urgent_tasks_delete" ON public.urgent_tasks FOR DELETE USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));
CREATE POLICY "task_reminders_select" ON public.task_reminders FOR SELECT USING (true);
CREATE POLICY "task_reminders_insert" ON public.task_reminders FOR INSERT WITH CHECK (true);
CREATE POLICY "task_reminders_update" ON public.task_reminders FOR UPDATE USING (sent_to = auth.uid());
CREATE POLICY "reminder_penalties_select" ON public.reminder_penalties FOR SELECT USING (employee_id = auth.uid() OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));
CREATE POLICY "reminder_penalties_insert" ON public.reminder_penalties FOR INSERT WITH CHECK (true);

-- ═══ Messenger 정책 (최종: 023 단순화) ══════════════════════════════
CREATE POLICY "chat_rooms_select" ON public.chat_rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "chat_rooms_insert" ON public.chat_rooms FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "chat_rooms_update" ON public.chat_rooms FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.is_admin());
CREATE POLICY "chat_members_select" ON public.chat_room_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "chat_members_insert" ON public.chat_room_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "chat_members_update" ON public.chat_room_members FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "chat_members_delete" ON public.chat_room_members FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "messages_update" ON public.messages FOR UPDATE TO authenticated USING (sender_id = auth.uid() OR public.is_admin());
CREATE POLICY "reactions_select" ON public.message_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "reactions_insert" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "reactions_delete" ON public.message_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ═══ AI 정책 ════════════════════════════════════════════════════════
CREATE POLICY "ai_settings_select_authenticated" ON public.ai_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_settings_admin_insert" ON public.ai_settings FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "ai_settings_admin_update" ON public.ai_settings FOR UPDATE USING (public.is_admin());
CREATE POLICY "ai_settings_admin_delete" ON public.ai_settings FOR DELETE USING (public.is_admin());
CREATE POLICY "ai_reports_admin_select" ON public.ai_reports FOR SELECT USING (public.is_admin());
CREATE POLICY "ai_reports_admin_insert" ON public.ai_reports FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "ai_reports_admin_update" ON public.ai_reports FOR UPDATE USING (public.is_admin());
CREATE POLICY "ai_reports_admin_delete" ON public.ai_reports FOR DELETE USING (public.is_admin());
CREATE POLICY "ai_feature_settings_select_auth" ON public.ai_feature_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_feature_settings_insert_admin" ON public.ai_feature_settings FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "ai_feature_settings_update_admin" ON public.ai_feature_settings FOR UPDATE USING (public.is_admin());
CREATE POLICY "ai_feature_settings_delete_admin" ON public.ai_feature_settings FOR DELETE USING (public.is_admin());

-- ═══ Agent 정책 ═════════════════════════════════════════════════════
CREATE POLICY "agent_conv_select" ON public.agent_conversations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR (is_archived = true AND context_type != 'general'));
CREATE POLICY "agent_conv_insert" ON public.agent_conversations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "agent_conv_update" ON public.agent_conversations FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "agent_conv_delete" ON public.agent_conversations FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "agent_msg_select" ON public.agent_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agent_conversations c WHERE c.id = conversation_id AND (c.user_id = auth.uid() OR public.is_admin() OR (c.is_archived = true AND c.context_type != 'general'))));
CREATE POLICY "agent_msg_insert" ON public.agent_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.agent_conversations WHERE id = conversation_id AND user_id = auth.uid()));

-- ═══ External Data 정책 ═════════════════════════════════════════════
CREATE POLICY "imported_work_data_select" ON public.imported_work_data FOR SELECT USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));
CREATE POLICY "imported_work_data_insert" ON public.imported_work_data FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));
CREATE POLICY "imported_work_data_delete" ON public.imported_work_data FOR DELETE USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin')));
CREATE POLICY "integration_settings_select" ON public.integration_settings FOR SELECT USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));
CREATE POLICY "integration_settings_insert" ON public.integration_settings FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));
CREATE POLICY "integration_settings_update" ON public.integration_settings FOR UPDATE USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));
CREATE POLICY "integration_settings_delete" ON public.integration_settings FOR DELETE USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin')));

-- ═══ Meeting 정책 ═══════════════════════════════════════════════════
CREATE POLICY "meeting_select" ON public.meeting_records FOR SELECT TO authenticated USING (recorded_by = auth.uid() OR auth.uid() = ANY(participant_ids) OR public.is_admin());
CREATE POLICY "meeting_insert" ON public.meeting_records FOR INSERT TO authenticated WITH CHECK (recorded_by = auth.uid());
CREATE POLICY "meeting_update" ON public.meeting_records FOR UPDATE TO authenticated USING (recorded_by = auth.uid() OR public.is_admin());
CREATE POLICY "meeting_delete" ON public.meeting_records FOR DELETE TO authenticated USING (recorded_by = auth.uid() OR public.is_admin());

-- ═══ Evaluation Enhancements 정책 ═══════════════════════════════════
CREATE POLICY "monthly_checkins_select" ON public.monthly_checkins FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "monthly_checkins_insert" ON public.monthly_checkins FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "monthly_checkins_update" ON public.monthly_checkins FOR UPDATE TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "peer_reviews_select" ON public.peer_reviews FOR SELECT TO authenticated USING (reviewer_id = auth.uid() OR reviewee_id = auth.uid() OR public.is_admin());
CREATE POLICY "peer_reviews_insert" ON public.peer_reviews FOR INSERT TO authenticated WITH CHECK (reviewer_id = auth.uid() OR public.is_admin());
CREATE POLICY "peer_reviews_update" ON public.peer_reviews FOR UPDATE TO authenticated USING (reviewer_id = auth.uid() OR public.is_admin());
CREATE POLICY "peer_assignments_select" ON public.peer_review_assignments FOR SELECT TO authenticated USING (reviewer_id = auth.uid() OR reviewee_id = auth.uid() OR public.is_admin());
CREATE POLICY "peer_assignments_manage" ON public.peer_review_assignments FOR ALL TO authenticated USING (public.is_admin());

-- ═══ HR Labor 정책 (강화된 버전: 041/042) ═══════════════════════════
CREATE POLICY "hr_details_select" ON public.employee_hr_details FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "hr_details_insert" ON public.employee_hr_details FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "hr_details_update" ON public.employee_hr_details FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "hr_details_delete" ON public.employee_hr_details FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "attendance_select" ON public.attendance_records FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin() OR public.is_team_leader_of(employee_id));
CREATE POLICY "attendance_insert" ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "attendance_update" ON public.attendance_records FOR UPDATE TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "attendance_delete" ON public.attendance_records FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "leave_requests_select" ON public.leave_requests FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin() OR public.is_team_leader_of(employee_id));
CREATE POLICY "leave_requests_insert" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());
CREATE POLICY "leave_requests_update" ON public.leave_requests FOR UPDATE TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "leave_requests_delete" ON public.leave_requests FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "approval_doc_select" ON public.approval_documents FOR SELECT TO authenticated USING (requester_id = auth.uid() OR public.is_admin() OR public.is_approver_of_document(id));
CREATE POLICY "approval_doc_insert" ON public.approval_documents FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid() OR public.is_admin());
CREATE POLICY "approval_doc_update" ON public.approval_documents FOR UPDATE TO authenticated USING (requester_id = auth.uid() OR public.is_admin());
CREATE POLICY "approval_doc_delete" ON public.approval_documents FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "approval_steps_select" ON public.approval_steps FOR SELECT TO authenticated USING (approver_id = auth.uid() OR public.is_admin() OR public.is_requester_of_step_document(document_id));
CREATE POLICY "approval_steps_insert" ON public.approval_steps FOR INSERT TO authenticated WITH CHECK (public.is_admin() OR approver_id = auth.uid() OR public.is_requester_of_step_document(document_id));
CREATE POLICY "approval_steps_update" ON public.approval_steps FOR UPDATE TO authenticated USING (approver_id = auth.uid() OR public.is_admin());
CREATE POLICY "approval_steps_delete" ON public.approval_steps FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "approval_tpl_select" ON public.approval_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "approval_tpl_insert" ON public.approval_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "approval_tpl_update" ON public.approval_templates FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "approval_tpl_delete" ON public.approval_templates FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "payroll_select" ON public.payroll FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "payroll_insert" ON public.payroll FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "payroll_update" ON public.payroll FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "payroll_delete" ON public.payroll FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "payroll_settings_select" ON public.payroll_settings FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "payroll_settings_insert" ON public.payroll_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "payroll_settings_update" ON public.payroll_settings FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "certificates_select" ON public.certificates FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "certificates_insert" ON public.certificates FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "certificates_delete" ON public.certificates FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "training_select" ON public.training_records FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin() OR public.is_team_leader_of(employee_id));
CREATE POLICY "training_insert" ON public.training_records FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "training_update" ON public.training_records FOR UPDATE TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "training_delete" ON public.training_records FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "contracts_select" ON public.electronic_contracts FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "contracts_insert" ON public.electronic_contracts FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "contracts_update" ON public.electronic_contracts FOR UPDATE TO authenticated USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "delegations_select" ON public.approval_delegations FOR SELECT TO authenticated USING (delegator_id = auth.uid() OR delegate_id = auth.uid() OR public.is_admin());
CREATE POLICY "delegations_insert" ON public.approval_delegations FOR INSERT TO authenticated WITH CHECK (delegator_id = auth.uid() OR public.is_admin());
CREATE POLICY "delegations_update" ON public.approval_delegations FOR UPDATE TO authenticated USING (delegator_id = auth.uid() OR public.is_admin());

CREATE POLICY "weekly_hours_select" ON public.weekly_hours_tracking FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin() OR public.is_team_leader_of(employee_id));
CREATE POLICY "weekly_hours_insert" ON public.weekly_hours_tracking FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "personnel_select" ON public.personnel_orders FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "personnel_insert" ON public.personnel_orders FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- ═══ Bulletin & Calendar 정책 ═══════════════════════════════════════
CREATE POLICY "bulletin_posts_select" ON public.bulletin_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "bulletin_posts_insert" ON public.bulletin_posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "bulletin_posts_update" ON public.bulletin_posts FOR UPDATE TO authenticated USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));
CREATE POLICY "bulletin_posts_delete" ON public.bulletin_posts FOR DELETE TO authenticated USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));
CREATE POLICY "bulletin_comments_select" ON public.bulletin_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "bulletin_comments_insert" ON public.bulletin_comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "bulletin_comments_delete" ON public.bulletin_comments FOR DELETE TO authenticated USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));

CREATE POLICY "company_events_select" ON public.company_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_events_insert" ON public.company_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "company_events_update" ON public.company_events FOR UPDATE TO authenticated USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));
CREATE POLICY "company_events_delete" ON public.company_events FOR DELETE TO authenticated USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo','admin','director','division_head')));


-- #####################################################################
-- SECTION 22: Realtime (실시간 구독)
-- #####################################################################

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_updates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;


-- #####################################################################
-- SECTION 23: Storage Buckets
-- #####################################################################

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('interview-recordings', 'interview-recordings', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('meeting-recordings', 'meeting-recordings', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('chat-attachments', 'chat-attachments', false, 10485760) ON CONFLICT (id) DO NOTHING;

-- 스토리지 RLS 정책
CREATE POLICY "avatars_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "avatars_read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');
CREATE POLICY "meeting_storage_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'meeting-recordings');
CREATE POLICY "meeting_storage_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'meeting-recordings');
CREATE POLICY "chat_attachments_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-attachments');
CREATE POLICY "chat_attachments_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'chat-attachments');
CREATE POLICY "chat_attachments_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'chat-attachments');
CREATE POLICY "resumes_anon_upload" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'resumes');


-- #####################################################################
-- SECTION 24: Seed Data (초기 데이터)
-- #####################################################################

-- 등급 기준
INSERT INTO public.grade_criteria (grade, min_score, max_score, label) VALUES
  ('S', 90, 100, '탁월'),
  ('A', 80, 89,  '우수'),
  ('B', 70, 79,  '보통'),
  ('C', 60, 69,  '미흡'),
  ('D', 0,  59,  '부진');

-- 급여 설정 (2026년)
INSERT INTO public.payroll_settings (meal_allowance, transportation_allowance, national_pension_rate, health_insurance_rate, long_care_rate, employment_insurance_rate, tax_year, pay_day)
VALUES (200000, 0, 0.045, 0.03545, 0.1295, 0.009, 2026, 25);

-- 결재선 템플릿
INSERT INTO public.approval_templates (doc_type, name, steps) VALUES
  ('leave', '연차/반차 결재선', '[{"order":1,"role":"leader","label":"팀장 승인"},{"order":2,"role":"hr_admin","label":"인사 확인"}]'),
  ('overtime', '연장근무 결재선', '[{"order":1,"role":"leader","label":"팀장 승인"},{"order":2,"role":"executive","label":"이사 승인"}]'),
  ('expense', '경비 청구 (50만원 미만)', '[{"order":1,"role":"leader","label":"팀장 승인"},{"order":2,"role":"hr_admin","label":"경영지원 처리"}]'),
  ('expense_high', '경비 청구 (50만원 이상)', '[{"order":1,"role":"leader","label":"팀장 승인"},{"order":2,"role":"executive","label":"이사 승인"},{"order":3,"role":"ceo","label":"대표 최종"},{"order":4,"role":"hr_admin","label":"경영지원 처리"}]'),
  ('business_trip', '출장 신청', '[{"order":1,"role":"leader","label":"팀장 승인"},{"order":2,"role":"executive","label":"이사 승인"}]'),
  ('general', '일반 결재', '[{"order":1,"role":"leader","label":"팀장 승인"}]'),
  ('personnel', '인사 발령', '[{"order":1,"role":"executive","label":"이사 검토"},{"order":2,"role":"ceo","label":"대표 최종승인"}]'),
  ('resign', '퇴직 처리', '[{"order":1,"role":"leader","label":"팀장 확인"},{"order":2,"role":"executive","label":"이사 확인"},{"order":3,"role":"ceo","label":"대표 최종"},{"order":4,"role":"hr_admin","label":"인사 처리"}]');

-- AI 기능별 설정 시드
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

-- 프로젝트 보드 권한 시드
INSERT INTO public.board_permissions (department, can_create_project, can_delete_project, can_comment, can_view) VALUES
  ('브랜드사업본부', true, false, true, true),
  ('마케팅영업본부', true, false, true, true),
  ('경영관리본부', true, false, true, true),
  ('임원', true, true, true, true),
  ('시스템관리자', true, true, true, true)
ON CONFLICT (department) DO NOTHING;

-- 프로젝트 템플릿 시드
INSERT INTO public.project_templates (name, template_type, department, stages, avg_total_days) VALUES
  ('신제품 출시', 'new_product', '브랜드사업본부', '[
    {"name":"시장조사","order":1,"default_duration_days":14,"editable_departments":["브랜드사업본부"]},
    {"name":"제형","order":2,"default_duration_days":30,"editable_departments":["브랜드사업본부"]},
    {"name":"패키지","order":3,"default_duration_days":21,"editable_departments":["브랜드사업본부","디자인팀"]},
    {"name":"판매가","order":4,"default_duration_days":7,"editable_departments":["브랜드사업본부","영업팀"]},
    {"name":"상세페이지","order":5,"default_duration_days":14,"editable_departments":["브랜드사업본부","디자인팀"]},
    {"name":"촬영","order":6,"default_duration_days":7,"editable_departments":["브랜드사업본부"]},
    {"name":"마케팅","order":7,"default_duration_days":21,"editable_departments":["브랜드사업본부","영업팀"]}
  ]', 120),
  ('리뉴얼', 'renewal', '브랜드사업본부', '[
    {"name":"제형","order":1,"default_duration_days":14},
    {"name":"패키지","order":2,"default_duration_days":14},
    {"name":"판매가","order":3,"default_duration_days":7},
    {"name":"상세페이지","order":4,"default_duration_days":10},
    {"name":"마케팅","order":5,"default_duration_days":14}
  ]', 60),
  ('용기 변경', 'repackage', '브랜드사업본부', '[
    {"name":"패키지","order":1,"default_duration_days":14},
    {"name":"상세페이지","order":2,"default_duration_days":7},
    {"name":"마케팅","order":3,"default_duration_days":7}
  ]', 30),
  ('프로모션 캠페인', 'promotion_campaign', '마케팅영업본부', '[
    {"name":"시장분석","order":1,"default_duration_days":7},
    {"name":"전략기획","order":2,"default_duration_days":10},
    {"name":"콘텐츠제작","order":3,"default_duration_days":14},
    {"name":"채널세팅","order":4,"default_duration_days":7},
    {"name":"캠페인실행","order":5,"default_duration_days":14},
    {"name":"성과분석","order":6,"default_duration_days":7}
  ]', 59),
  ('영업제안', 'sales_proposal', '마케팅영업본부', '[
    {"name":"고객분석","order":1,"default_duration_days":5},
    {"name":"제안서작성","order":2,"default_duration_days":10},
    {"name":"가격협상","order":3,"default_duration_days":10},
    {"name":"계약체결","order":4,"default_duration_days":5}
  ]', 30),
  ('신규채널 입점', 'channel_entry', '마케팅영업본부', '[
    {"name":"채널조사","order":1,"default_duration_days":7},
    {"name":"입점제안","order":2,"default_duration_days":10},
    {"name":"조건협의","order":3,"default_duration_days":10},
    {"name":"상품등록","order":4,"default_duration_days":10},
    {"name":"런칭","order":5,"default_duration_days":7}
  ]', 44),
  ('사내 제도 개선', 'policy_improvement', '경영관리본부', '[
    {"name":"현황분석","order":1,"default_duration_days":10},
    {"name":"개선안수립","order":2,"default_duration_days":14},
    {"name":"검토승인","order":3,"default_duration_days":14},
    {"name":"시행공지","order":4,"default_duration_days":7}
  ]', 45),
  ('예산 편성', 'budget_planning', '경영관리본부', '[
    {"name":"부서요청취합","order":1,"default_duration_days":10},
    {"name":"예산안작성","order":2,"default_duration_days":14},
    {"name":"경영진검토","order":3,"default_duration_days":14},
    {"name":"조정확정","order":4,"default_duration_days":14},
    {"name":"배분통보","order":5,"default_duration_days":7}
  ]', 59),
  ('계약/법무', 'contract_legal', '경영관리본부', '[
    {"name":"요건정리","order":1,"default_duration_days":5},
    {"name":"계약서작성","order":2,"default_duration_days":10},
    {"name":"법무검토","order":3,"default_duration_days":10},
    {"name":"체결완료","order":4,"default_duration_days":5}
  ]', 30)
ON CONFLICT DO NOTHING;


-- #####################################################################
-- SECTION 25: PostGREST Schema Reload
-- #####################################################################

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- 통합 마이그레이션 완료!
-- 테이블 약 65개 + 뷰 3개 + 함수 15개 + 트리거 15개 + RLS 정책 150개+
-- =====================================================================
