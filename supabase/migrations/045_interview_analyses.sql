-- 045: 면접 내용 분석 결과 테이블
-- 화상면접/대면면접 녹음·녹화 → 텍스트 추출 → AI 분석 결과 저장
-- 향후 AI 면접관 실시간 분석 확장을 위한 구조 포함

CREATE TABLE IF NOT EXISTS public.interview_analyses (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id        uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  schedule_id         uuid        REFERENCES public.interview_schedules(id) ON DELETE SET NULL,
  recording_id        uuid        REFERENCES public.interview_recordings(id) ON DELETE SET NULL,
  interview_type      text        NOT NULL CHECK (interview_type IN ('video', 'face_to_face')),

  -- ─── 텍스트 추출 (Transcription) ───────────────────────────
  transcription       text,                           -- 전체 전사 텍스트
  transcription_segments jsonb    DEFAULT '[]'::jsonb, -- [{start, end, speaker, text}]

  -- ─── AI 분석 결과 ──────────────────────────────────────────
  ai_summary          text,                           -- 면접 내용 요약
  key_answers         jsonb       DEFAULT '[]'::jsonb, -- [{question, answer, evaluation}]
  communication_score integer     CHECK (communication_score BETWEEN 0 AND 100),
  expertise_score     integer     CHECK (expertise_score BETWEEN 0 AND 100),
  attitude_score      integer     CHECK (attitude_score BETWEEN 0 AND 100),
  overall_score       integer     CHECK (overall_score BETWEEN 0 AND 100),
  strengths           jsonb       DEFAULT '[]'::jsonb,
  concerns            jsonb       DEFAULT '[]'::jsonb,
  overall_impression  text,

  -- ─── 향후 AI 면접관 확장 필드 ──────────────────────────────
  -- AI 면접관이 참여한 세션 메타데이터
  ai_interviewer_session  jsonb   DEFAULT '{}'::jsonb,
  -- AI 면접관이 생성한 질문 목록 [{question, purpose, follow_up}]
  ai_interviewer_questions jsonb  DEFAULT '[]'::jsonb,
  -- 실시간 감정/표정 분석 [{timestamp, emotion, confidence}]
  real_time_emotions  jsonb       DEFAULT '[]'::jsonb,
  -- 실시간 이상 탐지 플래그 [{timestamp, flag_type, description}]
  real_time_flags     jsonb       DEFAULT '[]'::jsonb,
  -- 실시간 음성 분석 {speech_speed, filler_words, confidence_trend}
  real_time_voice     jsonb       DEFAULT '{}'::jsonb,

  -- ─── 메타 ─────────────────────────────────────────────────
  ai_provider         text,
  ai_model            text,
  status              text        DEFAULT 'pending'
                                  CHECK (status IN ('pending','transcribing','analyzing','completed','error')),
  error_message       text,
  analyzed_at         timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_interview_analyses_candidate
  ON public.interview_analyses(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interview_analyses_schedule
  ON public.interview_analyses(schedule_id);

-- RLS
ALTER TABLE public.interview_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interview_analyses_select_auth"
  ON public.interview_analyses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "interview_analyses_insert_auth"
  ON public.interview_analyses FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "interview_analyses_update_auth"
  ON public.interview_analyses FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "interview_analyses_delete_auth"
  ON public.interview_analyses FOR DELETE TO authenticated
  USING (true);
