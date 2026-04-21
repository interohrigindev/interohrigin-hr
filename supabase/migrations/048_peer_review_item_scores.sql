-- ============================================================
-- Migration 048: 동료평가 10항목 × 10점 구조 (C2)
-- ============================================================
-- 기존 peer_reviews.overall_score(0~100, 단일 점수)에 더해
-- 항목별 점수를 JSONB로 보관. 10개 항목 × 10점 = 100점.
--
-- item_scores 예시:
--   {
--     "collaboration": 8,
--     "communication": 9,
--     "responsibility": 7,
--     ...
--   }
--
-- 항목 키 (총 10개, src/types/employee-lifecycle.ts의 PEER_REVIEW_CRITERIA 참조):
--   collaboration, communication, responsibility, expertise,
--   initiative, problem_solving, reliability, quality,
--   growth_mindset, culture_fit
--
-- overall_score는 애플리케이션 단에서 item_scores 합으로 유지.
-- 기존 레코드는 item_scores = NULL (호환).
-- ============================================================

ALTER TABLE public.peer_reviews
  ADD COLUMN IF NOT EXISTS item_scores jsonb;

COMMENT ON COLUMN public.peer_reviews.item_scores IS
  '10개 항목별 점수(각 0~10). key 목록은 PEER_REVIEW_CRITERIA 참조. overall_score = sum of values.';

-- RLS는 기존 peer_reviews 정책을 그대로 상속 (컬럼 추가만 영향).
