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

    // Get all rooms I'm a member of with membership data
    const { data: memberships } = await supabase
      .from('chat_room_members')
      .select('room_id, unread_count, is_pinned, is_muted, last_read_at')
      .eq('user_id', profile.id)

    if (!memberships || memberships.length === 0) {
      setRooms([])
      setTotalUnread(0)
      setLoading(false)
      return
    }

    const roomIds = memberships.map((m) => m.room_id)

    // Get room data
    const { data: roomData } = await supabase
      .from('chat_rooms')
      .select('*')
      .in('id', roomIds)
      .eq('is_archived', false)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (!roomData) {
      setRooms([])
      setLoading(false)
      return
    }

    // Get latest message for each room
    const latestMessages = new Map<string, string>()
    const memberCounts = new Map<string, number>()

    for (const room of roomData) {
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content')
        .eq('room_id', room.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastMsg) latestMessages.set(room.id, lastMsg.content)

      const { count } = await supabase
        .from('chat_room_members')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room.id)

      memberCounts.set(room.id, count || 0)
    }

    // For DM rooms, get the other person's name
    const dmRoomNames = new Map<string, string>()
    const dmRooms = roomData.filter((r) => r.type === 'dm')
    for (const room of dmRooms) {
      const { data: members } = await supabase
        .from('chat_room_members')
        .select('user_id')
        .eq('room_id', room.id)
        .neq('user_id', profile.id)
        .limit(1)
        .maybeSingle()

      if (members) {
        const { data: emp } = await supabase
          .from('employees')
          .select('name')
          .eq('id', members.user_id)
          .single()

        if (emp) dmRoomNames.set(room.id, emp.name)
      }
    }

    const enriched: ChatRoomWithMeta[] = roomData.map((room) => {
      const membership = memberships.find((m) => m.room_id === room.id)
      return {
        ...room,
        name: room.type === 'dm' ? dmRoomNames.get(room.id) || '1:1 대화' : room.name,
        unread_count: membership?.unread_count || 0,
        is_pinned: membership?.is_pinned || false,
        is_muted: membership?.is_muted || false,
        last_message: latestMessages.get(room.id),
        member_count: memberCounts.get(room.id) || 0,
      }
    })

    // Sort: pinned first, then by last_message_at
    enriched.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1
      if (!a.is_pinned && b.is_pinned) return 1
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
      return bTime - aTime
    })

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
