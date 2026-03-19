-- =====================================================================
-- 023: 메신저 RLS 최종 수정
-- 모든 인증 사용자가 채팅방 생성/조회/참여 가능하도록 단순화
-- =====================================================================

-- ─── chat_rooms: 모든 정책 재생성 ─────────────────────────────
DROP POLICY IF EXISTS "room_members_read" ON public.chat_rooms;
DROP POLICY IF EXISTS "room_create" ON public.chat_rooms;
DROP POLICY IF EXISTS "room_update" ON public.chat_rooms;

-- SELECT: 인증된 사용자 모두 조회 (RLS에서 멤버 필터링은 앱 레벨에서)
CREATE POLICY "chat_rooms_select" ON public.chat_rooms
  FOR SELECT TO authenticated USING (true);

-- INSERT: 인증된 사용자 모두
CREATE POLICY "chat_rooms_insert" ON public.chat_rooms
  FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE: 생성자 또는 관리자
CREATE POLICY "chat_rooms_update" ON public.chat_rooms
  FOR UPDATE TO authenticated USING (
    created_by = auth.uid() OR public.is_admin()
  );

-- ─── chat_room_members: 정책 재생성 ──────────────────────────
DROP POLICY IF EXISTS "members_read" ON public.chat_room_members;
DROP POLICY IF EXISTS "members_insert" ON public.chat_room_members;
DROP POLICY IF EXISTS "members_update" ON public.chat_room_members;
DROP POLICY IF EXISTS "members_delete" ON public.chat_room_members;

CREATE POLICY "chat_members_select" ON public.chat_room_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "chat_members_insert" ON public.chat_room_members
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "chat_members_update" ON public.chat_room_members
  FOR UPDATE TO authenticated USING (
    user_id = auth.uid() OR public.is_admin()
  );

CREATE POLICY "chat_members_delete" ON public.chat_room_members
  FOR DELETE TO authenticated USING (
    user_id = auth.uid() OR public.is_admin()
  );

-- ─── messages: 정책 재생성 ───────────────────────────────────
DROP POLICY IF EXISTS "messages_member_read" ON public.messages;
DROP POLICY IF EXISTS "messages_member_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;

CREATE POLICY "messages_select" ON public.messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE TO authenticated USING (
    sender_id = auth.uid() OR public.is_admin()
  );

-- ─── message_reactions: 정책 재생성 ──────────────────────────
DROP POLICY IF EXISTS "reactions_read" ON public.message_reactions;
DROP POLICY IF EXISTS "reactions_insert" ON public.message_reactions;
DROP POLICY IF EXISTS "reactions_delete" ON public.message_reactions;

CREATE POLICY "reactions_select" ON public.message_reactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "reactions_insert" ON public.message_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "reactions_delete" ON public.message_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());
