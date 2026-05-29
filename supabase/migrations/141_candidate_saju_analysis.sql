-- 141_candidate_saju_analysis.sql
-- F4-1 개선: 사주 분석을 사전질의서(PBD) 수신 시 자동 생성 → 결과를 candidates 에 저장(1회 생성 후 재사용)
-- candidates 는 ALTER 금지 대상 아님.
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS saju_analysis text,
  ADD COLUMN IF NOT EXISTS saju_analysis_generated_at timestamptz;

COMMENT ON COLUMN public.candidates.saju_analysis IS
  'F4-1: 사주+PBD 종합 참고 의견 (자동 생성·저장, 참고용·비결정). 직무 변경 시 null 초기화 후 재생성.';
