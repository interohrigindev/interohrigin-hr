-- =====================================================================
-- INTEROHRIGIN HR Platform — 사내 게시판 테이블
-- 실행일: 2026.03.26
-- =====================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  1. 게시글 (Bulletin Posts)                                      │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS bulletin_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'general',  -- 'notice' | 'general' | 'qa' | 'suggestion'
  title text NOT NULL,
  content text NOT NULL,
  author_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  department text,                            -- 작성자 부서 (스냅샷)

  -- 표시 옵션
  is_pinned boolean DEFAULT false,            -- 상단 고정
  is_important boolean DEFAULT false,         -- 중요 표시

  -- 통계
  view_count integer DEFAULT 0,
  comment_count integer DEFAULT 0,            -- 댓글 수 캐시

  -- 첨부파일
  attachments jsonb DEFAULT '[]',             -- [{name, url, size, type}]

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE bulletin_posts IS '사내 게시판 게시글 (공지/자유/Q&A/건의)';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │  2. 댓글 (Bulletin Comments)                                     │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS bulletin_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES bulletin_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  content text NOT NULL,
  parent_comment_id uuid REFERENCES bulletin_comments(id) ON DELETE CASCADE,  -- 대댓글

  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE bulletin_comments IS '게시글 댓글 및 대댓글';


-- =====================================================================
-- 인덱스
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_bulletin_posts_category ON bulletin_posts(category);
CREATE INDEX IF NOT EXISTS idx_bulletin_posts_created ON bulletin_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulletin_posts_author ON bulletin_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_bulletin_posts_pinned ON bulletin_posts(is_pinned) WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS idx_bulletin_comments_post ON bulletin_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_bulletin_comments_parent ON bulletin_comments(parent_comment_id);


-- =====================================================================
-- RLS
-- =====================================================================

ALTER TABLE bulletin_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin_comments ENABLE ROW LEVEL SECURITY;

-- 게시글: 인증 사용자 읽기, 본인 글 수정/삭제
CREATE POLICY "bulletin_posts_select" ON bulletin_posts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "bulletin_posts_insert" ON bulletin_posts
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "bulletin_posts_update" ON bulletin_posts
  FOR UPDATE TO authenticated USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo', 'admin', 'director', 'division_head'))
  );

CREATE POLICY "bulletin_posts_delete" ON bulletin_posts
  FOR DELETE TO authenticated USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo', 'admin', 'director', 'division_head'))
  );

-- 댓글: 인증 사용자 읽기/쓰기, 본인 댓글 삭제
CREATE POLICY "bulletin_comments_select" ON bulletin_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "bulletin_comments_insert" ON bulletin_comments
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "bulletin_comments_delete" ON bulletin_comments
  FOR DELETE TO authenticated USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('ceo', 'admin', 'director', 'division_head'))
  );
