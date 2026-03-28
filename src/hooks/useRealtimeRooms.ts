import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ChatRoomWithMeta } from '@/types/messenger'

export function useRealtimeRooms() {
  const { profile } = useAuth()
  const [rooms, setRooms] = useState<ChatRoomWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [totalUnread, setTotalUnread] = useState(0)

  const fetchRooms = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)

    // 단일 RPC 호출로 모든 채팅방 정보를 한번에 조회 (N+1 쿼리 해소)
    const { data, error } = await supabase
      .rpc('get_my_chat_rooms', { p_user_id: profile.id })

    if (error || !data) {
      setRooms([])
      setTotalUnread(0)
      setLoading(false)
      return
    }

    const enriched: ChatRoomWithMeta[] = (data as any[]).map((row) => ({
      id: row.id,
      name: row.type === 'dm' ? (row.dm_partner_name || '1:1 대화') : row.name,
      type: row.type,
      description: row.description,
      linked_project_id: row.linked_project_id,
      linked_job_posting_id: null,
      linked_mentor_assignment_id: null,
      linked_department: row.linked_department,
      is_ai_enabled: row.is_ai_enabled,
      is_archived: row.is_archived,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_message_at: row.last_message_at,
      unread_count: row.unread_count || 0,
      is_pinned: row.is_pinned || false,
      is_muted: row.is_muted || false,
      last_message: row.last_message,
      member_count: row.member_count || 0,
    }))

    setRooms(enriched)
    setTotalUnread(enriched.reduce((sum, r) => sum + (r.is_muted ? 0 : r.unread_count), 0))
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { fetchRooms() }, [fetchRooms])

  // Realtime subscription for room updates
  useEffect(() => {
    if (!profile?.id) return

    const channel = supabase
      .channel('my-rooms')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_room_members',
        filter: `user_id=eq.${profile.id}`,
      }, () => {
        fetchRooms()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id, fetchRooms])

  return {
    rooms,
    loading,
    totalUnread,
    refresh: fetchRooms,
  }
}
