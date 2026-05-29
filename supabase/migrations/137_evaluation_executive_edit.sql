-- 137_evaluation_executive_edit.sql
-- ─────────────────────────────────────────────────────────────────────
-- 임원(이사/대표) 평가 확정 후 재수정 허용 (#4)
--   · 요청: "리더는 평가 수정 불가능, 임원은 평가 수정 가능"
--   · 기존 정책(eval_score_insert/update_my_turn)은 본인 차례(status=turn)에만 쓰기 허용
--     → 확정으로 status 가 다음 단계로 넘어가면 임원도 수정 불가 = 제출 후 오류/잠금 원인
--   · 본 마이그레이션: director/ceo 에 한해 "본인 차례 이후(완료 포함)" 에도
--     본인(evaluator_id=auth.uid()) row 의 INSERT/UPDATE 를 허용하는 정책을 "추가"한다.
--   · leader 정책은 변경하지 않음 → 리더는 기존대로 확정 후 잠금 유지.
-- 멱등: DROP POLICY IF EXISTS 후 재생성.
-- 영향 테이블: evaluator_scores, evaluator_comments (ALTER 금지 대상 아님 / 정책만 추가).
-- ─────────────────────────────────────────────────────────────────────

-- ═══ evaluator_scores — 임원 차례 이후 재수정 ═══════════════════════════
DROP POLICY IF EXISTS "eval_score_insert_exec_post" ON public.evaluator_scores;
CREATE POLICY "eval_score_insert_exec_post" ON public.evaluator_scores FOR INSERT TO authenticated
  WITH CHECK (
    evaluator_id = auth.uid()
    AND evaluator_role IN ('director','ceo')
    AND EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_scores.target_id
        AND (
          (evaluator_scores.evaluator_role = 'director' AND t.status IN ('leader_done','director_done','ceo_done','completed'))
          OR (evaluator_scores.evaluator_role = 'ceo' AND t.status IN ('director_done','ceo_done','completed'))
        )
    )
  );

DROP POLICY IF EXISTS "eval_score_update_exec_post" ON public.evaluator_scores;
CREATE POLICY "eval_score_update_exec_post" ON public.evaluator_scores FOR UPDATE TO authenticated
  USING (
    evaluator_id = auth.uid()
    AND evaluator_role IN ('director','ceo')
    AND EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_scores.target_id
        AND (
          (evaluator_scores.evaluator_role = 'director' AND t.status IN ('leader_done','director_done','ceo_done','completed'))
          OR (evaluator_scores.evaluator_role = 'ceo' AND t.status IN ('director_done','ceo_done','completed'))
        )
    )
  )
  WITH CHECK (
    evaluator_id = auth.uid()
    AND evaluator_role IN ('director','ceo')
    AND EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_scores.target_id
        AND (
          (evaluator_scores.evaluator_role = 'director' AND t.status IN ('leader_done','director_done','ceo_done','completed'))
          OR (evaluator_scores.evaluator_role = 'ceo' AND t.status IN ('director_done','ceo_done','completed'))
        )
    )
  );

-- ═══ evaluator_comments — 임원 차례 이후 재수정 ═════════════════════════
DROP POLICY IF EXISTS "eval_comment_insert_exec_post" ON public.evaluator_comments;
CREATE POLICY "eval_comment_insert_exec_post" ON public.evaluator_comments FOR INSERT TO authenticated
  WITH CHECK (
    evaluator_id = auth.uid()
    AND evaluator_role IN ('director','ceo')
    AND EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_comments.target_id
        AND (
          (evaluator_comments.evaluator_role = 'director' AND t.status IN ('leader_done','director_done','ceo_done','completed'))
          OR (evaluator_comments.evaluator_role = 'ceo' AND t.status IN ('director_done','ceo_done','completed'))
        )
    )
  );

DROP POLICY IF EXISTS "eval_comment_update_exec_post" ON public.evaluator_comments;
CREATE POLICY "eval_comment_update_exec_post" ON public.evaluator_comments FOR UPDATE TO authenticated
  USING (
    evaluator_id = auth.uid()
    AND evaluator_role IN ('director','ceo')
    AND EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_comments.target_id
        AND (
          (evaluator_comments.evaluator_role = 'director' AND t.status IN ('leader_done','director_done','ceo_done','completed'))
          OR (evaluator_comments.evaluator_role = 'ceo' AND t.status IN ('director_done','ceo_done','completed'))
        )
    )
  )
  WITH CHECK (
    evaluator_id = auth.uid()
    AND evaluator_role IN ('director','ceo')
    AND EXISTS (
      SELECT 1 FROM public.evaluation_targets t
      WHERE t.id = evaluator_comments.target_id
        AND (
          (evaluator_comments.evaluator_role = 'director' AND t.status IN ('leader_done','director_done','ceo_done','completed'))
          OR (evaluator_comments.evaluator_role = 'ceo' AND t.status IN ('director_done','ceo_done','completed'))
        )
    )
  );

COMMENT ON POLICY "eval_score_update_exec_post" ON public.evaluator_scores IS
  '137: 임원(director/ceo)은 본인 차례 이후(완료 포함)에도 본인 점수 재수정 허용 (#4)';
