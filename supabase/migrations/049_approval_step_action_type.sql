-- ============================================================
-- Migration 049: 결재선 단계에 승인 유형(결재/합의/참조) 추가 (C8)
-- ============================================================
-- action_type:
--   'approve'    (기본) 결재 — 승인/반려 권한 있음
--   'consult'    합의    — 동의 표시. 반려 가능하지만 일반적으로 병렬 합의
--   'reference'  참조    — 조회 권한만. 문서 진행에 영향 없음
--
-- approval_templates.steps JSONB 내부 각 step에 action_type 추가 가능.
-- approval_steps 테이블에도 컬럼 추가 — 실제 결재 진행 시 각 단계 유형 보관.
-- 기존 레코드는 action_type = 'approve' 기본값.
-- ============================================================

ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'approve';

COMMENT ON COLUMN public.approval_steps.action_type IS
  '단계 유형: approve(결재) | consult(합의) | reference(참조). 템플릿의 steps JSONB에도 동일 키를 함께 보관.';

-- 참조(reference) 단계는 current_step 카운트에서 건너뛸 수 있도록 index만 추가 (쿼리 최적화 목적)
CREATE INDEX IF NOT EXISTS idx_approval_steps_action_type ON public.approval_steps(action_type);
