-- =====================================================================
-- 039: candidates FK CASCADE 누락 수정
-- ai_accuracy_log, transcriptions의 candidate_id FK에 ON DELETE CASCADE 추가
-- (채용공고 삭제 시 연쇄 삭제가 블로킹되던 문제 해결)
-- =====================================================================

-- ─── ai_accuracy_log.candidate_id → CASCADE ─────────────────────
ALTER TABLE public.ai_accuracy_log
  DROP CONSTRAINT IF EXISTS ai_accuracy_log_candidate_id_fkey;
ALTER TABLE public.ai_accuracy_log
  ADD CONSTRAINT ai_accuracy_log_candidate_id_fkey
  FOREIGN KEY (candidate_id) REFERENCES public.candidates(id)
  ON DELETE CASCADE;

-- ─── transcriptions.candidate_id → CASCADE ──────────────────────
ALTER TABLE public.transcriptions
  DROP CONSTRAINT IF EXISTS transcriptions_candidate_id_fkey;
ALTER TABLE public.transcriptions
  ADD CONSTRAINT transcriptions_candidate_id_fkey
  FOREIGN KEY (candidate_id) REFERENCES public.candidates(id)
  ON DELETE CASCADE;
