import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Message, MessageWithSender } from '@/types/messenger'

const PAGE_SIZE = 50

interface EmployeeBasic {
  id: string
  name: string
  role: string
}

export function useRealtimeMessages(roomId: string | null) {
  const { profile } = useAuth()
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [sending, setSending] = useState(false)
  const employeeCacheRef = useRef<Map<string, EmployeeBasic>>(new Map())

  // Load employee name for a sender_id
  const getEmployeeName = useCallback(async (senderId: string): Promise<EmployeeBasic | null> => {
    if (employeeCacheRef.current.has(senderId)) return employeeCacheRef.current.get(senderId)!
    const { data } = await supabase.from('employees').select('id, name, role').eq('id', senderId).single()
    if (data) {
      const emp = data as EmployeeBasic
      employeeCacheRef.current.set(senderId, emp)
      return emp
    }
    return null
  }, [])

  // Enrich a raw message with sender info
  const enrichMessage = useCallback(async (msg: Message): Promise<MessageWithSender> => {
    let senderName = '시스템'
    let senderRole = ''

    if (msg.sender_id) {
      const emp = await getEmployeeName(msg.sender_id)
      if (emp) {
        senderName = emp.name
        senderRole = emp.role
      }
    } else if (msg.message_type === 'ai_bot') {
      senderName = 'AI 어시스턴트'
    }

    return { ...msg, sender_name: senderName, sender_role: senderRole }
  }, [getEmployeeName])

  // Load initial messages
  const loadMessages = useCallback(async () => {
    if (!roomId) return
    setLoading(true)

    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (data) {
      const reversed = (data as Message[]).reverse()
      const enriched = await Promise.all(reversed.map(enrichMessage))
      setMessages(enriched)
      setHasMore(data.length === PAGE_SIZE)
    }

    // Mark as read
    if (profile?.id) {
      await supabase
        .from('chat_room_members')
        .update({ last_read_at: new Date().toISOString(), unread_count: 0 })
        .eq('room_id', roomId)
        .eq('user_id', profile.id)
    }

    setLoading(false)
  }, [roomId, profile?.id, enrichMessage])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // Realtime subscription
  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`,
      }, async (payload) => {
        const newMsg = payload.new as Message
        const enriched = await enrichMessage(newMsg)
        setMessages((prev) => [...prev, enriched])

        // Mark as read if we're viewing the room
        if (profile?.id && newMsg.sender_id !== profile.id) {
          await supabase
            .from('chat_room_members')
            .update({ last_read_at: new Date().toISOString(), unread_count: 0 })
            .eq('room_id', roomId)
            .eq('user_id', profile.id)
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        const updated = payload.new as Message
        setMessages((prev) => prev.map((m) =>
          m.id === updated.id ? { ...m, ...updated } : m
        ))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, profile?.id, enrichMessage])

  // Load more (older messages)
  async function loadMore() {
    if (!roomId || !hasMore || messages.length === 0) return

    const oldestTime = messages[0].created_at
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .lt('created_at', oldestTime)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (data) {
      const reversed = (data as Message[]).reverse()
      const enriched = await Promise.all(reversed.map(enrichMessage))
      setMessages((prev) => [...enriched, ...prev])
      setHasMore(data.length === PAGE_SIZE)
    }
  }

  // Send message
  async function sendMessage(
    content: string,
    type: string = 'text',
    extras?: Partial<Message>
  ): Promise<{ error: string | null }> {
    if (!roomId || !profile?.id) return { error: '로그인이 필요합니다' }
    setSending(true)

    const { error } = await supabase.from('messages').insert({
      room_id: roomId,
      sender_id: profile.id,
      content,
      message_type: type,
      ...extras,
    })

    setSending(false)
    if (error) return { error: error.message }
    return { error: null }
  }

  // Edit message
  async function editMessage(messageId: string, newContent: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('messages')
      .update({ content: newContent, is_edited: true, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('sender_id', profile?.id || '')

    if (error) return { error: error.message }
    return { error: null }
  }

  // Delete message (soft)
  async function deleteMessage(messageId: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('messages')
      .update({ is_deleted: true })
      .eq('id', messageId)
      .eq('sender_id', profile?.id || '')

    if (error) return { error: error.message }
    return { error: null }
  }

  // Add reaction
  async function addReaction(messageId: string, emoji: string): Promise<void> {
    if (!profile?.id) return
    await supabase.from('message_reactions').upsert(
      { message_id: messageId, user_id: profile.id, emoji },
      { onConflict: 'message_id,user_id,emoji' }
    )
  }

  // Remove reaction
  async function removeReaction(messageId: string, emoji: string): Promise<void> {
    if (!profile?.id) return
    await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', profile.id)
      .eq('emoji', emoji)
  }

  return {
    messages,
    loading,
    hasMore,
    sending,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    loadMore,
    refresh: loadMessages,
  }
}
