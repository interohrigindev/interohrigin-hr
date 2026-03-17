-- =====================================================================
-- InterOhrigin HR — P-02: 채용 + OJT + 수습 + 사주/MBTI + 신뢰도 테이블
-- 신규 26개 테이블 생성
-- Supabase SQL Editor에서 실행하세요.
-- =====================================================================

-- =====================================================================
-- 1. 채용관리 테이블 (10개)
-- =====================================================================

-- ─── job_postings (채용공고) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_postings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text        NOT NULL,
  department_id   uuid        REFERENCES public.departments(id),
  position        text,
  employment_type text        DEFAULT 'full_time' CHECK (employment_type IN ('full_time','contract','intern','part_time')),
  experience_level text       DEFAULT 'any' CHECK (experience_level IN ('any','entry','junior','mid','senior','executive')),
  description     text,
  requirements    text,
  preferred       text,
  salary_range    text,
  ai_questions    jsonb       DEFAULT '[]'::jsonb,
  status          text        DEFAULT 'draft' CHECK (status IN ('draft','open','closed','cancelled')),
  deadline        date,
  created_by      uuid        REFERENCES public.employees(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER trg_job_postings_updated_at
  BEFORE UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── candidates (지원자) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.candidates (
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
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TRIGGER trg_candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── resume_analysis (이력서 AI 분석) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.resume_analysis (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  resume_text           text,
  ai_summary            text,
  strengths             jsonb       DEFAULT '[]'::jsonb,
  weaknesses            jsonb       DEFAULT '[]'::jsonb,
  position_fit          integer     CHECK (position_fit BETWEEN 0 AND 100),
  organization_fit      integer     CHECK (organization_fit BETWEEN 0 AND 100),
  suggested_department  text,
  suggested_position    text,
  suggested_salary_range text,
  red_flags             jsonb       DEFAULT '[]'::jsonb,
  recommendation        text        CHECK (recommendation IN ('PROCEED','REVIEW','REJECT')),
  analyzed_at           timestamptz DEFAULT now(),
  created_at            timestamptz DEFAULT now()
);

-- ─── pre_survey_templates (사전 질의서 템플릿) ─────────────────────
CREATE TABLE IF NOT EXISTS public.pre_survey_templates (
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

-- ─── interview_schedules (면접 일정) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.interview_schedules (
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
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TRIGGER trg_interview_schedules_updated_at
  BEFORE UPDATE ON public.interview_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── interview_recordings (면접 녹화/녹음) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.interview_recordings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  recording_url   text,
  recording_type  text        DEFAULT 'video' CHECK (recording_type IN ('video','audio')),
  duration_seconds integer,
  file_size_bytes bigint,
  status          text        DEFAULT 'uploading' CHECK (status IN ('uploading','uploaded','processing','completed','error')),
  created_at      timestamptz DEFAULT now()
);

-- ─── face_to_face_evals (대면 면접 평가) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.face_to_face_evals (
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

-- ─── voice_analysis (음성 분석) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voice_analysis (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  recording_id    uuid        REFERENCES public.interview_recordings(id),
  confidence_score    decimal,
  speech_speed        decimal,
  filler_word_count   integer,
  voice_stability     decimal,
  response_time_avg   decimal,
  sentiment_score     decimal,
  analysis_details    jsonb       DEFAULT '{}'::jsonb,
  created_at          timestamptz DEFAULT now()
);

-- ─── transcriptions (STT 결과) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transcriptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id    uuid        NOT NULL REFERENCES public.interview_recordings(id) ON DELETE CASCADE,
  candidate_id    uuid        REFERENCES public.candidates(id),
  full_text       text,
  segments        jsonb       DEFAULT '[]'::jsonb,
  language        text        DEFAULT 'ko',
  provider        text        DEFAULT 'whisper',
  created_at      timestamptz DEFAULT now()
);

-- ─── recruitment_reports (AI 종합 분석 리포트) ─────────────────────
CREATE TABLE IF NOT EXISTS public.recruitment_reports (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id        uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  report_type         text        DEFAULT 'comprehensive' CHECK (report_type IN ('comprehensive','resume','interview','final')),
  overall_score       integer,
  summary             text,
  detailed_analysis   jsonb       DEFAULT '{}'::jsonb,
  talent_match        jsonb       DEFAULT '{}'::jsonb,
  saju_mbti_analysis  jsonb       DEFAULT '{}'::jsonb,
  salary_recommendation text,
  department_recommendation text,
  position_recommendation text,
  ai_recommendation   text        CHECK (ai_recommendation IN ('STRONG_HIRE','HIRE','REVIEW','NO_HIRE')),
  provider            text,
  model               text,
  created_at          timestamptz DEFAULT now()
);

-- =====================================================================
-- 2. 의사결정 테이블 (2개)
-- =====================================================================

-- ─── hiring_decisions (채용 결정) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hiring_decisions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  decision        text        NOT NULL CHECK (decision IN ('hired','rejected','hold')),
  decided_by      uuid        REFERENCES public.employees(id),
  reason          text,
  offered_salary  text,
  offered_department_id uuid  REFERENCES public.departments(id),
  offered_position text,
  start_date      date,
  ai_recommendation text,
  ai_score        integer,
  created_at      timestamptz DEFAULT now()
);

-- ─── talent_profiles (인재상 프로필) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.talent_profiles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  department_id   uuid        REFERENCES public.departments(id),
  traits          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  skills          jsonb       DEFAULT '[]'::jsonb,
  values          jsonb       DEFAULT '[]'::jsonb,
  description     text,
  reference_employees jsonb   DEFAULT '[]'::jsonb,
  is_active       boolean     DEFAULT true,
  created_by      uuid        REFERENCES public.employees(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER trg_talent_profiles_updated_at
  BEFORE UPDATE ON public.talent_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================================
-- 3. AI 신뢰도 테이블 (3개)
-- =====================================================================

-- ─── ai_accuracy_log (AI vs 실제 결정 비교) ───────────────────────
CREATE TABLE IF NOT EXISTS public.ai_accuracy_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id        uuid        REFERENCES public.candidates(id),
  employee_id         uuid        REFERENCES public.employees(id),
  ai_recommendation   text,
  ai_score            integer,
  actual_decision     text,
  match_result        text        CHECK (match_result IN ('match','partial','mismatch')),
  context_type        text        DEFAULT 'hiring' CHECK (context_type IN ('hiring','probation','performance')),
  notes               text,
  created_at          timestamptz DEFAULT now()
);

-- ─── ai_trust_metrics (신뢰도 스냅샷) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_trust_metrics (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start    date        NOT NULL,
  period_end      date        NOT NULL,
  total_predictions   integer DEFAULT 0,
  correct_predictions integer DEFAULT 0,
  accuracy_rate       decimal,
  current_phase       text    DEFAULT 'A' CHECK (current_phase IN ('A','B','C')),
  details             jsonb   DEFAULT '{}'::jsonb,
  created_at          timestamptz DEFAULT now()
);

-- ─── ai_phase_transitions (Phase 전환 이력) ────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_phase_transitions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phase      text        NOT NULL CHECK (from_phase IN ('A','B','C')),
  to_phase        text        NOT NULL CHECK (to_phase IN ('A','B','C')),
  reason          text,
  accuracy_at_transition decimal,
  approved_by     uuid        REFERENCES public.employees(id),
  created_at      timestamptz DEFAULT now()
);

-- =====================================================================
-- 4. 사주/MBTI 테이블 (3개)
-- =====================================================================

-- ─── employee_profiles (직원 확장 프로필) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_profiles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  birth_date      date,
  birth_time      time,
  lunar_birth     boolean     DEFAULT false,
  mbti            text        CHECK (mbti IN (
                    'ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP',
                    'ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ'
                  )),
  blood_type      text        CHECK (blood_type IN ('A','B','O','AB')),
  hanja_name      text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER trg_employee_profiles_updated_at
  BEFORE UPDATE ON public.employee_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── personality_analysis (AI 성향 분석) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.personality_analysis (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  analysis_type   text        NOT NULL CHECK (analysis_type IN ('saju','mbti','cross','comprehensive')),
  result          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  strengths       jsonb       DEFAULT '[]'::jsonb,
  cautions        jsonb       DEFAULT '[]'::jsonb,
  job_fit         jsonb       DEFAULT '{}'::jsonb,
  team_fit        jsonb       DEFAULT '{}'::jsonb,
  provider        text,
  model           text,
  created_at      timestamptz DEFAULT now()
);

-- ─── profile_visibility_settings (열람 토글) ───────────────────────
CREATE TABLE IF NOT EXISTS public.profile_visibility_settings (
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

-- =====================================================================
-- 5. 수습/OJT/멘토 테이블 (5개)
-- =====================================================================

-- ─── ojt_programs (OJT 프로그램) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ojt_programs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  department_id   uuid        REFERENCES public.departments(id),
  job_type        text,
  description     text,
  modules         jsonb       DEFAULT '[]'::jsonb,
  quiz_questions  jsonb       DEFAULT '[]'::jsonb,
  duration_days   integer     DEFAULT 7,
  is_active       boolean     DEFAULT true,
  created_by      uuid        REFERENCES public.employees(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER trg_ojt_programs_updated_at
  BEFORE UPDATE ON public.ojt_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── ojt_enrollments (OJT 수강 현황) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.ojt_enrollments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  program_id      uuid        NOT NULL REFERENCES public.ojt_programs(id) ON DELETE CASCADE,
  status          text        DEFAULT 'enrolled' CHECK (status IN ('enrolled','in_progress','completed','dropped')),
  progress        jsonb       DEFAULT '{}'::jsonb,
  quiz_scores     jsonb       DEFAULT '[]'::jsonb,
  total_quiz_score integer,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER trg_ojt_enrollments_updated_at
  BEFORE UPDATE ON public.ojt_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── mentor_assignments (멘토-멘티 배정) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.mentor_assignments (
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

-- ─── mentor_daily_reports (멘토 일일 평가) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.mentor_daily_reports (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id       uuid        NOT NULL REFERENCES public.mentor_assignments(id) ON DELETE CASCADE,
  day_number          integer     NOT NULL CHECK (day_number BETWEEN 1 AND 90),
  mentor_mission      text,
  mentee_mission      text,
  mentor_completed    boolean     DEFAULT false,
  mentee_completed    boolean     DEFAULT false,
  learning_attitude   text        CHECK (learning_attitude IN ('excellent','good','average','poor','very_poor')),
  adaptation_level    text        CHECK (adaptation_level IN ('excellent','good','average','poor','very_poor')),
  mentor_comment      text,
  mentee_feedback     text,
  created_at          timestamptz DEFAULT now()
);

-- ─── probation_evaluations (수습 단계별 평가) ──────────────────────
CREATE TABLE IF NOT EXISTS public.probation_evaluations (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                   uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  stage                         text        NOT NULL CHECK (stage IN ('week1','week2','week3','month1','month2','month3')),
  evaluator_id                  uuid        REFERENCES public.employees(id),
  evaluator_role                text,
  scores                        jsonb       DEFAULT '{}'::jsonb,
  ai_assessment                 text,
  continuation_recommendation   text        CHECK (continuation_recommendation IN ('continue','warning','terminate')),
  comments                      text,
  created_at                    timestamptz DEFAULT now(),
  UNIQUE (employee_id, stage, evaluator_id)
);

-- =====================================================================
-- 6. 기록 테이블 (2개)
-- =====================================================================

-- ─── special_notes (특이사항) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.special_notes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  author_id       uuid        NOT NULL REFERENCES public.employees(id),
  note_type       text        NOT NULL CHECK (note_type IN ('positive','negative')),
  content         text        NOT NULL,
  severity        text        DEFAULT 'minor' CHECK (severity IN ('minor','moderate','major')),
  created_at      timestamptz DEFAULT now()
);

-- ─── exit_surveys (퇴사 설문) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exit_surveys (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id             uuid        NOT NULL REFERENCES public.employees(id),
  exit_date               date,
  exit_reason_category    text,
  exit_reason_detail      text,
  best_experience         text,
  worst_experience        text,
  suggestions             text,
  anonymous_feedback      text,
  token                   text        UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  completed_at            timestamptz,
  created_at              timestamptz DEFAULT now()
);

-- =====================================================================
-- 7. 업무 연동 테이블 (1개)
-- =====================================================================

-- ─── work_metrics (업무 동기화 데이터) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.work_metrics (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_year     integer     NOT NULL,
  period_quarter  integer     NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),
  task_completion_rate    decimal,
  deadline_compliance     decimal,
  avg_daily_satisfaction  decimal,
  total_tasks             integer DEFAULT 0,
  completed_tasks         integer DEFAULT 0,
  overdue_tasks           integer DEFAULT 0,
  details                 jsonb   DEFAULT '{}'::jsonb,
  synced_at               timestamptz DEFAULT now(),
  created_at              timestamptz DEFAULT now(),
  UNIQUE (employee_id, period_year, period_quarter)
);

-- =====================================================================
-- 8. 인덱스
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_candidates_job_posting     ON public.candidates(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status          ON public.candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_source          ON public.candidates(source_channel);
CREATE INDEX IF NOT EXISTS idx_candidates_invite_token    ON public.candidates(invite_token);

CREATE INDEX IF NOT EXISTS idx_resume_analysis_candidate  ON public.resume_analysis(candidate_id);

CREATE INDEX IF NOT EXISTS idx_interview_schedules_candidate ON public.interview_schedules(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interview_schedules_date   ON public.interview_schedules(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_interview_recordings_candidate ON public.interview_recordings(candidate_id);

CREATE INDEX IF NOT EXISTS idx_face_to_face_candidate     ON public.face_to_face_evals(candidate_id);

CREATE INDEX IF NOT EXISTS idx_recruitment_reports_candidate ON public.recruitment_reports(candidate_id);

CREATE INDEX IF NOT EXISTS idx_hiring_decisions_candidate  ON public.hiring_decisions(candidate_id);

CREATE INDEX IF NOT EXISTS idx_employee_profiles_employee  ON public.employee_profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_personality_analysis_employee ON public.personality_analysis(employee_id);

CREATE INDEX IF NOT EXISTS idx_ojt_enrollments_employee    ON public.ojt_enrollments(employee_id);
CREATE INDEX IF NOT EXISTS idx_ojt_enrollments_program     ON public.ojt_enrollments(program_id);

CREATE INDEX IF NOT EXISTS idx_mentor_assignments_mentee   ON public.mentor_assignments(mentee_id);
CREATE INDEX IF NOT EXISTS idx_mentor_assignments_mentor   ON public.mentor_assignments(mentor_id);

CREATE INDEX IF NOT EXISTS idx_mentor_daily_reports_assignment ON public.mentor_daily_reports(assignment_id);

CREATE INDEX IF NOT EXISTS idx_probation_evals_employee    ON public.probation_evaluations(employee_id);

CREATE INDEX IF NOT EXISTS idx_special_notes_employee      ON public.special_notes(employee_id);

CREATE INDEX IF NOT EXISTS idx_exit_surveys_employee       ON public.exit_surveys(employee_id);
CREATE INDEX IF NOT EXISTS idx_exit_surveys_token          ON public.exit_surveys(token);

CREATE INDEX IF NOT EXISTS idx_work_metrics_employee       ON public.work_metrics(employee_id);

CREATE INDEX IF NOT EXISTS idx_ai_accuracy_candidate       ON public.ai_accuracy_log(candidate_id);
CREATE INDEX IF NOT EXISTS idx_ai_accuracy_employee        ON public.ai_accuracy_log(employee_id);

-- =====================================================================
-- 9. RLS 정책
-- =====================================================================

-- RLS 활성화
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

-- ─── 채용관리: 관리자(director 이상) CRUD, 인증 사용자 SELECT ──────

-- job_postings
CREATE POLICY "job_postings_select" ON public.job_postings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "job_postings_insert" ON public.job_postings
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "job_postings_update" ON public.job_postings
  FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "job_postings_delete" ON public.job_postings
  FOR DELETE TO authenticated USING (public.is_admin());

-- candidates: 관리자만 CRUD
CREATE POLICY "candidates_select" ON public.candidates
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "candidates_insert_auth" ON public.candidates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "candidates_insert_anon" ON public.candidates
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "candidates_update" ON public.candidates
  FOR UPDATE TO authenticated USING (public.is_admin());

-- resume_analysis
CREATE POLICY "resume_analysis_select" ON public.resume_analysis
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "resume_analysis_insert" ON public.resume_analysis
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- pre_survey_templates
CREATE POLICY "survey_templates_select" ON public.pre_survey_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "survey_templates_manage" ON public.pre_survey_templates
  FOR ALL TO authenticated USING (public.is_admin());

-- interview_schedules
CREATE POLICY "interview_schedules_select" ON public.interview_schedules
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "interview_schedules_manage" ON public.interview_schedules
  FOR ALL TO authenticated USING (public.is_admin());

-- interview_recordings
CREATE POLICY "interview_recordings_select" ON public.interview_recordings
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "interview_recordings_insert_anon" ON public.interview_recordings
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "interview_recordings_insert_auth" ON public.interview_recordings
  FOR INSERT TO authenticated WITH CHECK (true);

-- face_to_face_evals
CREATE POLICY "f2f_evals_select" ON public.face_to_face_evals
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "f2f_evals_manage" ON public.face_to_face_evals
  FOR ALL TO authenticated USING (public.is_admin());

-- voice_analysis
CREATE POLICY "voice_analysis_select" ON public.voice_analysis
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "voice_analysis_manage" ON public.voice_analysis
  FOR ALL TO authenticated USING (public.is_admin());

-- transcriptions
CREATE POLICY "transcriptions_select" ON public.transcriptions
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "transcriptions_manage" ON public.transcriptions
  FOR ALL TO authenticated USING (public.is_admin());

-- recruitment_reports
CREATE POLICY "recruitment_reports_select" ON public.recruitment_reports
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "recruitment_reports_manage" ON public.recruitment_reports
  FOR ALL TO authenticated USING (public.is_admin());

-- hiring_decisions
CREATE POLICY "hiring_decisions_select" ON public.hiring_decisions
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "hiring_decisions_manage" ON public.hiring_decisions
  FOR ALL TO authenticated USING (public.is_admin());

-- talent_profiles
CREATE POLICY "talent_profiles_select" ON public.talent_profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "talent_profiles_manage" ON public.talent_profiles
  FOR ALL TO authenticated USING (public.is_admin());

-- ─── AI 신뢰도: 관리자만 ──────────────────────────────────────────

CREATE POLICY "ai_accuracy_select" ON public.ai_accuracy_log
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "ai_accuracy_insert" ON public.ai_accuracy_log
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "ai_trust_select" ON public.ai_trust_metrics
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "ai_trust_manage" ON public.ai_trust_metrics
  FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "ai_phase_select" ON public.ai_phase_transitions
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "ai_phase_manage" ON public.ai_phase_transitions
  FOR ALL TO authenticated USING (public.is_admin());

-- ─── 사주/MBTI: 본인 + 관리자 ─────────────────────────────────────

-- employee_profiles: 본인 또는 관리자
CREATE POLICY "emp_profiles_select_own" ON public.employee_profiles
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "emp_profiles_upsert_own" ON public.employee_profiles
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "emp_profiles_update_own" ON public.employee_profiles
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

-- personality_analysis: 본인(토글 설정에 따라) + 관리자
CREATE POLICY "personality_select" ON public.personality_analysis
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      employee_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.profile_visibility_settings v
        WHERE v.employee_id = auth.uid()
          AND (v.show_saju = true OR v.show_mbti = true)
      )
    )
  );

CREATE POLICY "personality_manage" ON public.personality_analysis
  FOR ALL TO authenticated USING (public.is_admin());

-- profile_visibility_settings: 본인 + 관리자
CREATE POLICY "visibility_select_own" ON public.profile_visibility_settings
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "visibility_upsert_own" ON public.profile_visibility_settings
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "visibility_update_own" ON public.profile_visibility_settings
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

-- ─── OJT/수습/멘토: 관련자 + 관리자 ──────────────────────────────

-- ojt_programs
CREATE POLICY "ojt_programs_select" ON public.ojt_programs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ojt_programs_manage" ON public.ojt_programs
  FOR ALL TO authenticated USING (public.is_admin());

-- ojt_enrollments
CREATE POLICY "ojt_enrollments_select_own" ON public.ojt_enrollments
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "ojt_enrollments_manage" ON public.ojt_enrollments
  FOR ALL TO authenticated USING (public.is_admin());

-- mentor_assignments
CREATE POLICY "mentor_assign_select" ON public.mentor_assignments
  FOR SELECT TO authenticated
  USING (mentee_id = auth.uid() OR mentor_id = auth.uid() OR public.is_admin());

CREATE POLICY "mentor_assign_manage" ON public.mentor_assignments
  FOR ALL TO authenticated USING (public.is_admin());

-- mentor_daily_reports
CREATE POLICY "mentor_daily_select" ON public.mentor_daily_reports
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.mentor_assignments a
      WHERE a.id = mentor_daily_reports.assignment_id
        AND (a.mentor_id = auth.uid() OR a.mentee_id = auth.uid())
    )
  );

CREATE POLICY "mentor_daily_insert" ON public.mentor_daily_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.mentor_assignments a
      WHERE a.id = mentor_daily_reports.assignment_id
        AND a.mentor_id = auth.uid()
    )
  );

CREATE POLICY "mentor_daily_update" ON public.mentor_daily_reports
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.mentor_assignments a
      WHERE a.id = mentor_daily_reports.assignment_id
        AND (a.mentor_id = auth.uid() OR a.mentee_id = auth.uid())
    )
  );

-- probation_evaluations
CREATE POLICY "probation_select" ON public.probation_evaluations
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "probation_manage" ON public.probation_evaluations
  FOR ALL TO authenticated USING (public.is_admin());

-- ─── 기록: 관련자 + 관리자 ────────────────────────────────────────

-- special_notes: 인증 사용자 읽기, 관리자/리더 쓰기
CREATE POLICY "special_notes_select" ON public.special_notes
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR employee_id = auth.uid()
    OR author_id = auth.uid()
  );

CREATE POLICY "special_notes_insert" ON public.special_notes
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

-- exit_surveys: 본인(토큰) + 관리자
CREATE POLICY "exit_surveys_select" ON public.exit_surveys
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "exit_surveys_select_anon" ON public.exit_surveys
  FOR SELECT TO anon USING (true);

CREATE POLICY "exit_surveys_update_anon" ON public.exit_surveys
  FOR UPDATE TO anon USING (true);

CREATE POLICY "exit_surveys_manage" ON public.exit_surveys
  FOR ALL TO authenticated USING (public.is_admin());

-- work_metrics
CREATE POLICY "work_metrics_select" ON public.work_metrics
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "work_metrics_manage" ON public.work_metrics
  FOR ALL TO authenticated USING (public.is_admin());

-- =====================================================================
-- 10. 트리거: hiring_decisions → ai_accuracy_log 자동 기록
-- =====================================================================

CREATE OR REPLACE FUNCTION public.log_hiring_accuracy()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.ai_accuracy_log (
    candidate_id, ai_recommendation, ai_score, actual_decision, match_result, context_type
  )
  SELECT
    NEW.candidate_id,
    NEW.ai_recommendation,
    NEW.ai_score,
    NEW.decision,
    CASE
      WHEN NEW.ai_recommendation IS NULL THEN NULL
      WHEN NEW.decision = 'hired' AND NEW.ai_recommendation IN ('STRONG_HIRE','HIRE') THEN 'match'
      WHEN NEW.decision = 'rejected' AND NEW.ai_recommendation = 'NO_HIRE' THEN 'match'
      WHEN NEW.decision = 'hold' AND NEW.ai_recommendation = 'REVIEW' THEN 'match'
      ELSE 'mismatch'
    END,
    'hiring';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hiring_accuracy_log
  AFTER INSERT ON public.hiring_decisions
  FOR EACH ROW EXECUTE FUNCTION public.log_hiring_accuracy();

-- =====================================================================
-- 11. Storage 버킷
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('resumes', 'resumes', false),
  ('interview-recordings', 'interview-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- resumes 버킷 정책
CREATE POLICY "resumes_upload_anyone" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'resumes');

CREATE POLICY "resumes_select_admin" ON storage.objects
  FOR SELECT USING (bucket_id = 'resumes' AND public.is_admin());

-- interview-recordings 버킷 정책
CREATE POLICY "recordings_upload_anyone" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'interview-recordings');

CREATE POLICY "recordings_select_admin" ON storage.objects
  FOR SELECT USING (bucket_id = 'interview-recordings' AND public.is_admin());

-- =====================================================================
-- 완료! 26개 신규 테이블 + RLS + 트리거 + 인덱스 + 스토리지 버킷
-- =====================================================================
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
