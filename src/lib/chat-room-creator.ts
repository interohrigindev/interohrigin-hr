import { supabase } from '@/lib/supabase'
import type { ChatRoom, ChatRoomType } from '@/types/messenger'

// ─── 1:1 DM 생성 (또는 기존 DM 반환) ─────────────────────────
export async function getOrCreateDM(userId1: string, userId2: string): Promise<ChatRoom | null> {
  // Find existing DM between these two users
  const { data: existing } = await supabase
    .from('chat_room_members')
    .select('room_id')
    .eq('user_id', userId1)

  if (existing && existing.length > 0) {
    const roomIds = existing.map((m) => m.room_id)
    const { data: rooms } = await supabase
      .from('chat_rooms')
      .select('*')
      .in('id', roomIds)
      .eq('type', 'dm')

    if (rooms) {
      for (const room of rooms) {
        const { data: members } = await supabase
          .from('chat_room_members')
          .select('user_id')
          .eq('room_id', room.id)

        if (members && members.length === 2) {
          const memberIds = members.map((m) => m.user_id)
          if (memberIds.includes(userId1) && memberIds.includes(userId2)) {
            return room as ChatRoom
          }
        }
      }
    }
  }

  // Create new DM room
  const { data: room, error } = await supabase
    .from('chat_rooms')
    .insert({ type: 'dm', created_by: userId1 })
    .select()
    .single()

  if (error || !room) return null

  // Add both members
  await supabase.from('chat_room_members').insert([
    { room_id: room.id, user_id: userId1, role: 'admin' },
    { room_id: room.id, user_id: userId2, role: 'member' },
  ])

  return room as ChatRoom
}

// ─── 부서 채팅방 ────────────────────────────────────────────────
export async function getOrCreateDepartmentRoom(department: string, createdBy: string): Promise<ChatRoom | null> {
  const { data: existing } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('type', 'department')
    .eq('linked_department', department)
    .limit(1)
    .maybeSingle()

  if (existing) return existing as ChatRoom

  const { data: room, error } = await supabase
    .from('chat_rooms')
    .insert({
      name: `🏢 ${department}`,
      type: 'department',
      linked_department: department,
      created_by: createdBy,
    })
    .select()
    .single()

  if (error || !room) return null
  return room as ChatRoom
}

// ─── 프로젝트 채팅방 ────────────────────────────────────────────
export async function createProjectRoom(
  projectId: string,
  projectName: string,
  memberIds: string[],
  createdBy: string
): Promise<ChatRoom | null> {
  // Check for existing
  const { data: existing } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('type', 'project')
    .eq('linked_project_id', projectId)
    .limit(1)
    .maybeSingle()

  if (existing) return existing as ChatRoom

  const { data: room, error } = await supabase
    .from('chat_rooms')
    .insert({
      name: `📋 ${projectName}`,
      type: 'project',
      linked_project_id: projectId,
      created_by: createdBy,
    })
    .select()
    .single()

  if (error || !room) return null

  // Add members
  const members = memberIds.map((uid) => ({
    room_id: room.id,
    user_id: uid,
    role: uid === createdBy ? 'admin' : 'member',
  }))
  await supabase.from('chat_room_members').insert(members)

  // System message
  await supabase.from('messages').insert({
    room_id: room.id,
    sender_id: null,
    content: `📋 프로젝트 "${projectName}" 채팅방이 생성되었습니다.`,
    message_type: 'system',
  })

  return room as ChatRoom
}

// ─── 채용 논의방 ────────────────────────────────────────────────
export async function createRecruitmentRoom(
  jobPostingId: string,
  interviewerIds: string[],
  createdBy: string,
  postingTitle: string
): Promise<ChatRoom | null> {
  const { data: existing } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('type', 'recruitment')
    .eq('linked_job_posting_id', jobPostingId)
    .limit(1)
    .maybeSingle()

  if (existing) return existing as ChatRoom

  const { data: room, error } = await supabase
    .from('chat_rooms')
    .insert({
      name: `💼 ${postingTitle} 면접관 논의`,
      type: 'recruitment',
      linked_job_posting_id: jobPostingId,
      created_by: createdBy,
    })
    .select()
    .single()

  if (error || !room) return null

  const members = interviewerIds.map((uid) => ({
    room_id: room.id,
    user_id: uid,
    role: uid === createdBy ? 'admin' : 'member',
  }))
  await supabase.from('chat_room_members').insert(members)

  return room as ChatRoom
}

// ─── 멘토-멘티 채팅방 ───────────────────────────────────────────
export async function createMentorRoom(
  mentorId: string,
  menteeId: string,
  assignmentId: string
): Promise<ChatRoom | null> {
  const { data: existing } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('type', 'mentor')
    .eq('linked_mentor_assignment_id', assignmentId)
    .limit(1)
    .maybeSingle()

  if (existing) return existing as ChatRoom

  const { data: room, error } = await supabase
    .from('chat_rooms')
    .insert({
      name: '🎓 멘토-멘티',
      type: 'mentor',
      linked_mentor_assignment_id: assignmentId,
      created_by: mentorId,
      is_ai_enabled: true,
    })
    .select()
    .single()

  if (error || !room) return null

  await supabase.from('chat_room_members').insert([
    { room_id: room.id, user_id: mentorId, role: 'admin' },
    { room_id: room.id, user_id: menteeId, role: 'member' },
  ])

  // AI welcome message
  await supabase.from('messages').insert({
    room_id: room.id,
    sender_id: null,
    content: '🤖 안녕하세요! 멘토링이 시작되었습니다.\n오늘의 미션: 회사 시설물 위치를 안내해주세요.',
    message_type: 'ai_bot',
  })

  return room as ChatRoom
}

// ─── 그룹 채팅방 ────────────────────────────────────────────────
export async function createGroupRoom(
  name: string,
  memberIds: string[],
  createdBy: string,
  description?: string
): Promise<ChatRoom | null> {
  const { data: room, error } = await supabase
    .from('chat_rooms')
    .insert({
      name: `👥 ${name}`,
      type: 'group' as ChatRoomType,
      description: description || null,
      created_by: createdBy,
    })
    .select()
    .single()

  if (error || !room) return null

  const members = memberIds.map((uid) => ({
    room_id: room.id,
    user_id: uid,
    role: uid === createdBy ? 'admin' : 'member',
  }))
  await supabase.from('chat_room_members').insert(members)

  return room as ChatRoom
}

// ─── 긴급 업무 알림 메시지 전송 ──────────────────────────────────
export async function sendUrgentAlert(
  roomId: string,
  content: string,
  urgentTaskId?: string
): Promise<void> {
  await supabase.from('messages').insert({
    room_id: roomId,
    sender_id: null,
    content,
    message_type: 'urgent_alert',
    linked_urgent_task_id: urgentTaskId || null,
  })
}

// ─── 시스템 메시지 전송 ──────────────────────────────────────────
export async function sendSystemMessage(roomId: string, content: string): Promise<void> {
  await supabase.from('messages').insert({
    room_id: roomId,
    sender_id: null,
    content,
    message_type: 'system',
  })
}
