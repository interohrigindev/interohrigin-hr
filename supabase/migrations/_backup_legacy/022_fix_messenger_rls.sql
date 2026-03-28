-- =====================================================================
-- 022: 메신저 RLS 정책 수정
-- chat_rooms SELECT: 생성자(created_by)도 조회 가능하도록
-- chat_rooms INSERT: RETURNING 절이 작동하도록 SELECT 허용
-- =====================================================================

-- 기존 정책 제거 후 재생성
DROP POLICY IF EXISTS "room_members_read" ON public.chat_rooms;
DROP POLICY IF EXISTS "room_create" ON public.chat_rooms;
DROP POLICY IF EXISTS "room_update" ON public.chat_rooms;

-- chat_rooms SELECT: 멤버 OR 생성자 OR 관리자
CREATE POLICY "room_members_read" ON public.chat_rooms
  FOR SELECT TO authenticated USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.chat_room_members WHERE room_id = id AND user_id = auth.uid())
    OR public.is_admin()
  );

-- chat_rooms INSERT: 인증된 사용자 모두 가능
CREATE POLICY "room_create" ON public.chat_rooms
  FOR INSERT TO authenticated WITH CHECK (true);

-- chat_rooms UPDATE: 생성자 또는 방 admin 또는 관리자
CREATE POLICY "room_update" ON public.chat_rooms
  FOR UPDATE TO authenticated USING (
    created_by = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.chat_room_members WHERE room_id = id AND user_id = auth.uid() AND role = 'admin')
  );

-- messages INSERT도 수정: 생성자가 멤버 등록 전에 시스템 메시지를 넣을 수 있도록
DROP POLICY IF EXISTS "messages_member_insert" ON public.messages;
CREATE POLICY "messages_member_insert" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    OR sender_id IS NULL
    OR EXISTS (SELECT 1 FROM public.chat_room_members WHERE room_id = messages.room_id AND user_id = auth.uid())
    OR public.is_admin()
  );
