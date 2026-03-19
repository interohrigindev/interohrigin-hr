-- =====================================================================
-- 037: 회의 녹음 & 회의록 테이블
-- AI 어시스턴트 회의 녹음 → STT → 요약 → 발송
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.meeting_records (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text        NOT NULL,
  recorded_by       uuid        NOT NULL REFERENCES public.employees(id),
  participant_ids   uuid[]      DEFAULT '{}',
  department_id     uuid        REFERENCES public.departments(id) ON DELETE SET NULL,
  project_id        uuid,

  -- 녹음
  recording_url     text,
  duration_seconds  integer,
  file_size_bytes   bigint,

  -- STT
  transcription     text,
  transcription_segments jsonb  DEFAULT '[]',

  -- AI 요약
  summary           text,
  action_items      jsonb       DEFAULT '[]',
  decisions         jsonb       DEFAULT '[]',

  -- 상태
  status            text        DEFAULT 'recording' CHECK (status IN (
    'recording','uploaded','transcribing','summarizing','completed','error'
  )),
  error_message     text,

  -- 발송
  is_sent           boolean     DEFAULT false,
  sent_at           timestamptz,

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TRIGGER trg_meeting_records_updated_at
  BEFORE UPDATE ON public.meeting_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 인덱스
CREATE INDEX idx_meeting_records_user ON public.meeting_records(recorded_by);
CREATE INDEX idx_meeting_records_dept ON public.meeting_records(department_id);
CREATE INDEX idx_meeting_records_project ON public.meeting_records(project_id);
CREATE INDEX idx_meeting_records_status ON public.meeting_records(status);

-- RLS
ALTER TABLE public.meeting_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_select" ON public.meeting_records
  FOR SELECT TO authenticated USING (
    recorded_by = auth.uid()
    OR auth.uid() = ANY(participant_ids)
    OR public.is_admin()
  );

CREATE POLICY "meeting_insert" ON public.meeting_records
  FOR INSERT TO authenticated WITH CHECK (recorded_by = auth.uid());

CREATE POLICY "meeting_update" ON public.meeting_records
  FOR UPDATE TO authenticated USING (recorded_by = auth.uid() OR public.is_admin());

CREATE POLICY "meeting_delete" ON public.meeting_records
  FOR DELETE TO authenticated USING (recorded_by = auth.uid() OR public.is_admin());

-- 스토리지 버킷 (없으면 생성)
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-recordings', 'meeting-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- 스토리지 정책
CREATE POLICY "meeting_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'meeting-recordings');

CREATE POLICY "meeting_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'meeting-recordings');
