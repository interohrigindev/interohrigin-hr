-- =====================================================================
-- 021: 사내 메신저 테이블 (M-01)
-- chat_rooms, chat_room_members, messages, message_reactions
-- + 인덱스 + RLS + Realtime + 트리거
-- =====================================================================

-- ─── 1. 채팅방 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text,
  type                        text        NOT NULL DEFAULT 'dm' CHECK (type IN ('dm','group','project','department','mentor','recruitment')),
  description                 text,

  linked_project_id           text,
  linked_job_posting_id       uuid        REFERENCES public.job_postings(id),
  linked_mentor_assignment_id uuid        REFERENCES public.mentor_assignments(id),
  linked_department           text,

  is_ai_enabled               boolean     DEFAULT true,
  is_archived                 boolean     DEFAULT false,

  created_by                  uuid        REFERENCES public.employees(id),
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  last_message_at             timestamptz
);

CREATE TRIGGER trg_chat_rooms_updated_at
  BEFORE UPDATE ON public.chat_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── 2. 채팅방 멤버 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_room_members (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid        NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL,
  role            text        DEFAULT 'member' CHECK (role IN ('admin','member')),
  last_read_at    timestamptz DEFAULT now(),
  unread_count    integer     DEFAULT 0,
  is_muted        boolean     DEFAULT false,
  is_pinned       boolean     DEFAULT false,
  joined_at       timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- ─── 3. 메시지 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id               uuid        NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id             uuid        REFERENCES public.employees(id),
  content               text        NOT NULL,
  message_type          text        DEFAULT 'text' CHECK (message_type IN ('text','image','file','ai_bot','system','urgent_alert','task_update')),

  attachment_url        text,
  attachment_name       text,
  attachment_size       integer,
  attachment_type       text,

  reply_to_id           uuid        REFERENCES public.messages(id),

  linked_urgent_task_id uuid,
  linked_candidate_id   uuid,
  linked_employee_id    uuid,

  is_edited             boolean     DEFAULT false,
  edited_at             timestamptz,
  is_deleted            boolean     DEFAULT false,

  created_at            timestamptz DEFAULT now()
);

-- ─── 4. 이모지 반응 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL,
  emoji           text        NOT NULL,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- ═══════════════════════════════════
-- 인덱스
-- ═══════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON public.messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON public.messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_members_user ON public.chat_room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_members_room ON public.chat_room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_last_message ON public.chat_rooms(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_type ON public.chat_rooms(type);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions(message_id);

-- ═══════════════════════════════════
-- Realtime 활성화
-- ═══════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_room_members;

-- ═══════════════════════════════════
-- RLS 정책
-- ═══════════════════════════════════
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- chat_rooms: 멤버만 조회
CREATE POLICY "room_members_read" ON public.chat_rooms
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.chat_room_members WHERE room_id = id AND user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "room_create" ON public.chat_rooms
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "room_update" ON public.chat_rooms
  FOR UPDATE TO authenticated USING (
    created_by = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.chat_room_members WHERE room_id = id AND user_id = auth.uid() AND role = 'admin')
  );

-- chat_room_members: 본인 + 같은 방 멤버 + 관리자
CREATE POLICY "members_read" ON public.chat_room_members
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.chat_room_members m2 WHERE m2.room_id = room_id AND m2.user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "members_insert" ON public.chat_room_members
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "members_update" ON public.chat_room_members
  FOR UPDATE TO authenticated USING (
    user_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "members_delete" ON public.chat_room_members
  FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR public.is_admin()
  );

-- messages: 해당 채팅방 멤버만
CREATE POLICY "messages_member_read" ON public.messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.chat_room_members WHERE room_id = messages.room_id AND user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "messages_member_insert" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.chat_room_members WHERE room_id = messages.room_id AND user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE TO authenticated USING (
    sender_id = auth.uid()
    OR public.is_admin()
  );

-- message_reactions: 해당 방 멤버
CREATE POLICY "reactions_read" ON public.message_reactions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.chat_room_members crm ON crm.room_id = m.room_id
      WHERE m.id = message_reactions.message_id AND crm.user_id = auth.uid()
    )
  );

CREATE POLICY "reactions_insert" ON public.message_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "reactions_delete" ON public.message_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ═══════════════════════════════════
-- last_message_at 자동 갱신 + unread_count 트리거
-- ═══════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_room_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chat_rooms SET last_message_at = now(), updated_at = now()
  WHERE id = NEW.room_id;

  UPDATE public.chat_room_members
  SET unread_count = unread_count + 1
  WHERE room_id = NEW.room_id AND user_id != COALESCE(NEW.sender_id, '00000000-0000-0000-0000-000000000000'::uuid);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_room_last_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.update_room_last_message();
