-- 070: 지원자 상태에 'no_show' (지원 불참) 추가
-- 1차 화상면접 등에 무단 불참한 지원자를 명확히 분리해서 추적하기 위함
-- 기존 'rejected' 와 별개로 운영 통계·재지원 차단 정책 등에 활용

ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_status_check;

ALTER TABLE public.candidates ADD CONSTRAINT candidates_status_check
  CHECK (status IN (
    'applied',
    'resume_reviewed',
    'survey_sent',
    'survey_done',
    'interview_scheduled',
    'video_done',
    'face_to_face_scheduled',
    'face_to_face_done',
    'processing',
    'analyzed',
    'decided',
    'hired',
    'rejected',
    'no_show'        -- 신규: 지원 불참 (면접 무단 불참 등)
  ));

COMMENT ON COLUMN public.candidates.status IS
  '지원자 상태 — no_show: 면접 무단 불참 / rejected: 평가 후 불합격';
