export type AgentContextType = 'general' | 'project' | 'recruitment' | 'ojt' | 'evaluation' | 'hr' | 'urgent'

export interface AgentConversation {
  id: string
  user_id: string
  title: string | null
  summary: string | null
  project_id: string | null
  department_id: string | null
  context_type: AgentContextType
  is_bookmarked: boolean
  is_archived: boolean
  tags: string[]
  message_count: number
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export interface AgentMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  provider: string | null
  model: string | null
  created_at: string
}
