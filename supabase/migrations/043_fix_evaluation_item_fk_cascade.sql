-- 043_fix_evaluation_item_fk_cascade.sql
-- evaluation_items 삭제 시 연관 데이터 자동 삭제 (CASCADE)
-- PRO DB (ckzbzumycmgkcpyhlclb) 에서 실행할 것!

-- self_evaluations.item_id FK → CASCADE
ALTER TABLE public.self_evaluations
  DROP CONSTRAINT IF EXISTS self_evaluations_item_id_fkey,
  ADD CONSTRAINT self_evaluations_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES public.evaluation_items(id) ON DELETE CASCADE;

-- evaluator_scores.item_id FK → CASCADE
ALTER TABLE public.evaluator_scores
  DROP CONSTRAINT IF EXISTS evaluator_scores_item_id_fkey,
  ADD CONSTRAINT evaluator_scores_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES public.evaluation_items(id) ON DELETE CASCADE;
