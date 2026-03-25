-- ============================================================
-- 043: departments 테이블에 parent_id 추가 — 부서 계층 구조 지원
-- ============================================================
-- 조직도에서 부서 트리를 구성하려면 parent_id가 필요.
-- 기존 departments 테이블에 self-referencing FK를 추가한다.
-- ============================================================

-- parent_id 컬럼 추가 (이미 존재하면 무시)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'departments'
      AND column_name = 'parent_id'
  ) THEN
    ALTER TABLE public.departments
      ADD COLUMN parent_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_departments_parent_id ON public.departments(parent_id);
