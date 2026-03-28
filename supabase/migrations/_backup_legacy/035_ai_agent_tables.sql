-- =====================================================================
-- 035: AI 에이전트 테이블
-- 전사 컨텍스트 아카이빙 기반 AI 어시스턴트
-- =====================================================================

-- ─── 1. 대화 스레드 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_conversations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES public.employees(id),
  title             text,
  summary           text,

  -- 컨텍스트 연결
  project_id        uuid,
  department_id     uuid        REFERENCES public.departments(id) ON DELETE SET NULL,
  context_type      text        DEFAULT 'general' CHECK (context_type IN (
    'general','project','recruitment','ojt','evaluation','hr','urgent'
  )),

  -- 정리
  is_bookmarked     boolean     DEFAULT false,
  is_archived       boolean     DEFAULT false,
  tags              text[]      DEFAULT '{}',

  -- 통계
  message_count     integer     DEFAULT 0,
  last_message_at   timestamptz,

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TRIGGER trg_agent_conversations_updated_at
  BEFORE UPDATE ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── 2. 메시지 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid        NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  role              text        NOT NULL CHECK (role IN ('user','assistant','system')),
  content           text        NOT NULL,

  provider          text,
  model             text,

  created_at        timestamptz DEFAULT now()
);

-- ─── 3. 인덱스 ────────────────────────────────────────────────────
CREATE INDEX idx_agent_conv_user ON public.agent_conversations(user_id);
CREATE INDEX idx_agent_conv_project ON public.agent_conversations(project_id);
CREATE INDEX idx_agent_conv_dept ON public.agent_conversations(department_id);
CREATE INDEX idx_agent_conv_last_msg ON public.agent_conversations(last_message_at DESC);
CREATE INDEX idx_agent_conv_tags ON public.agent_conversations USING GIN(tags);
CREATE INDEX idx_agent_msg_conv ON public.agent_messages(conversation_id, created_at);

-- ─── 4. Realtime ──────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;

-- ─── 5. RLS ───────────────────────────────────────────────────────
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

-- 대화: 본인 것 + 관리자 전체 + 아카이브된 비개인 대화는 전체 열람
CREATE POLICY "agent_conv_select" ON public.agent_conversations
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR (is_archived = true AND context_type != 'general')
  );

CREATE POLICY "agent_conv_insert" ON public.agent_conversations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "agent_conv_update" ON public.agent_conversations
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "agent_conv_delete" ON public.agent_conversations
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- 메시지: 대화 접근 권한에 따름
CREATE POLICY "agent_msg_select" ON public.agent_messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.agent_conversations c
      WHERE c.id = conversation_id AND (
        c.user_id = auth.uid()
        OR public.is_admin()
        OR (c.is_archived = true AND c.context_type != 'general')
      )
    )
  );

CREATE POLICY "agent_msg_insert" ON public.agent_messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.agent_conversations WHERE id = conversation_id AND user_id = auth.uid())
  );

-- ─── 6. 메시지 카운트 자동 업데이트 트리거 ──────────────────────
CREATE OR REPLACE FUNCTION public.update_agent_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.agent_conversations
  SET message_count = message_count + 1,
      last_message_at = now(),
      updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agent_msg_stats
  AFTER INSERT ON public.agent_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_agent_conversation_stats();
