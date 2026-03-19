// =====================================================================
// 사내 메신저 TypeScript 타입 정의
// =====================================================================

export type ChatRoomType = 'dm' | 'group' | 'project' | 'department' | 'mentor' | 'recruitment'
export type ChatMemberRole = 'admin' | 'member'
export type MessageType = 'text' | 'image' | 'file' | 'ai_bot' | 'system' | 'urgent_alert' | 'task_update'

export interface ChatRoom {
  id: string
  name: string | null
  type: ChatRoomType
  description: string | null
  linked_project_id: string | null
  linked_job_posting_id: string | null
  linked_mentor_assignment_id: string | null
  linked_department: string | null
  is_ai_enabled: boolean
  is_archived: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  last_message_at: string | null
}

export interface ChatRoomMember {
  id: string
  room_id: string
  user_id: string
  role: ChatMemberRole
  last_read_at: string
  unread_count: number
  is_muted: boolean
  is_pinned: boolean
  joined_at: string
}

export interface Message {
  id: string
  room_id: string
  sender_id: string | null
  content: string
  message_type: MessageType
  attachment_url: string | null
  attachment_name: string | null
  attachment_size: number | null
  attachment_type: string | null
  reply_to_id: string | null
  linked_urgent_task_id: string | null
  linked_candidate_id: string | null
  linked_employee_id: string | null
  is_edited: boolean
  edited_at: string | null
  is_deleted: boolean
  created_at: string
}

export interface MessageReaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

// ─── UI helpers ─────────────────────────────────────────────────

export interface ChatRoomWithMeta extends ChatRoom {
  unread_count: number
  is_pinned: boolean
  is_muted: boolean
  last_message?: string
  member_count?: number
  members?: { user_id: string; name: string }[]
}

export interface MessageWithSender extends Message {
  sender_name?: string
  sender_role?: string
  reply_to?: Message | null
  reactions?: MessageReaction[]
}

export const ROOM_TYPE_ICONS: Record<ChatRoomType, string> = {
  dm: '👤',
  group: '👥',
  project: '📋',
  department: '🏢',
  mentor: '🎓',
  recruitment: '💼',
}

export const ROOM_TYPE_LABELS: Record<ChatRoomType, string> = {
  dm: '1:1 대화',
  group: '그룹',
  project: '프로젝트',
  department: '부서',
  mentor: '멘토-멘티',
  recruitment: '채용 논의',
}

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '✅']
