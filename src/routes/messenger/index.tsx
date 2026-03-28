import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Send, Search, Plus, ArrowLeft, Paperclip, Pin,
  MoreVertical, Edit3, Trash2, Reply, Bot, Loader2,
  X, BellOff, MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { FileRetentionBadge, getRetentionMessage } from '@/components/ui/FileRetentionBadge'
import { useAuth } from '@/hooks/useAuth'
import { useRealtimeRooms } from '@/hooks/useRealtimeRooms'
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages'
import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature } from '@/lib/ai-client'
import { getOrCreateDM, createGroupRoom } from '@/lib/chat-room-creator'
import {
  ROOM_TYPE_ICONS,
  QUICK_REACTIONS,
  type MessageWithSender,
} from '@/types/messenger'

interface EmployeeBasic {
  id: string
  name: string
  department_id: string | null
  role: string
}

export default function MessengerPage() {
  const { roomId: paramRoomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast } = useToast()

  const { rooms, loading: roomsLoading, totalUnread, refresh: refreshRooms } = useRealtimeRooms()
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(paramRoomId || null)

  const {
    messages, loading: msgsLoading, hasMore, sending,
    sendMessage, editMessage, deleteMessage, addReaction, loadMore,
  } = useRealtimeMessages(selectedRoomId)

  // UI state
  const [input, setInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [showMobile, setShowMobile] = useState<'list' | 'chat'>('list')
  const [replyTo, setReplyTo] = useState<MessageWithSender | null>(null)
  const [editingMsg, setEditingMsg] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const [showRoomMenu, setShowRoomMenu] = useState(false)
  const [msgSearchQuery, setMsgSearchQuery] = useState('')
  const [showMsgSearch, setShowMsgSearch] = useState(false)
  const [aiTyping, setAiTyping] = useState(false)

  // New chat dialog
  const [newChatType, setNewChatType] = useState<'dm' | 'group'>('dm')
  const [newChatTarget, setNewChatTarget] = useState('')
  const [newChatGroupName, setNewChatGroupName] = useState('')
  const [newChatMembers, setNewChatMembers] = useState<string[]>([])
  const [employees, setEmployees] = useState<EmployeeBasic[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Load employees
  useEffect(() => {
    supabase.from('employees').select('id, name, department_id, role').eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setEmployees(data as EmployeeBasic[]) })
  }, [])

  // URL sync
  useEffect(() => {
    if (paramRoomId && paramRoomId !== selectedRoomId) {
      setSelectedRoomId(paramRoomId)
      setShowMobile('chat')
    }
  }, [paramRoomId])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // Browser tab title with unread count
  useEffect(() => {
    document.title = totalUnread > 0
      ? `(${totalUnread}) INTEROHRIGIN HR`
      : 'INTEROHRIGIN HR'
    return () => { document.title = 'INTEROHRIGIN HR' }
  }, [totalUnread])

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId)

  // Filter rooms by search
  const filteredRooms = useMemo(() => {
    if (!searchQuery.trim()) return rooms
    const q = searchQuery.toLowerCase()
    return rooms.filter((r) =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.last_message || '').toLowerCase().includes(q)
    )
  }, [rooms, searchQuery])

  // Filter messages by search
  const filteredMessages = useMemo(() => {
    if (!msgSearchQuery.trim()) return messages
    const q = msgSearchQuery.toLowerCase()
    return messages.filter((m) => m.content.toLowerCase().includes(q))
  }, [messages, msgSearchQuery])

  // ─── Select room ────────────────────────────────────────────
  function selectRoom(roomId: string) {
    setSelectedRoomId(roomId)
    setShowMobile('chat')
    setReplyTo(null)
    setEditingMsg(null)
    navigate(`/messenger/${roomId}`, { replace: true })
  }

  // ─── Send message ───────────────────────────────────────────
  async function handleSend() {
    if (!input.trim() || sending) return

    const messageContent = input.trim()
    const isAICommand = messageContent.startsWith('@AI') || messageContent.startsWith('/ai')

    setInput('')
    setReplyTo(null)

    const result = await sendMessage(messageContent, 'text', {
      reply_to_id: replyTo?.id || null,
    })

    if (result.error) {
      toast('메시지 전송 실패: ' + result.error, 'error')
      return
    }

    // Handle AI command
    if (isAICommand && selectedRoom?.is_ai_enabled) {
      await handleAIResponse(messageContent.replace(/^(@AI|\/ai)\s*/i, ''))
    }
  }

  // ─── AI response ────────────────────────────────────────────
  async function handleAIResponse(question: string) {
    if (!selectedRoomId) return
    setAiTyping(true)

    try {
      const config = await getAIConfigForFeature('messenger_ai')

      if (!config) {
        await sendSystemMsg('AI 설정이 필요합니다. 설정에서 API 키를 등록하세요.')
        setAiTyping(false)
        return
      }

      const employeeContext = employees.slice(0, 50).map((e) =>
        `- ${e.name} (${e.role})`
      ).join('\n')

      const recentMsgs = messages.slice(-10).map((m) =>
        `${m.sender_name || '시스템'}: ${m.content}`
      ).join('\n')

      const prompt = `당신은 인터오리진의 사내 AI 비서입니다.
직원들의 업무 질문에 답변하고, 담당자를 연결해주고, 회사 정보를 안내합니다.

회사 직원 목록:
${employeeContext}

최근 대화:
${recentMsgs}

사용자 질문: ${question}

사용 가능한 기능:
1. "이거 누구한테 물어봐?" → 담당자 추천
2. 업무 관련 질문 답변
3. 직원 정보 안내
4. 회사 규정/절차 안내

답변은 간결하고 친근하게 한국어로. 이모지를 적절히 사용.
모르는 건 "확인 후 답변드리겠습니다"로.`

      const result = await generateAIContent(config, prompt)

      await supabase.from('messages').insert({
        room_id: selectedRoomId,
        sender_id: null,
        content: result.content,
        message_type: 'ai_bot',
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      await sendSystemMsg('AI 응답 오류: ' + msg)
    }

    setAiTyping(false)
  }

  async function sendSystemMsg(content: string) {
    if (!selectedRoomId) return
    await supabase.from('messages').insert({
      room_id: selectedRoomId,
      sender_id: null,
      content,
      message_type: 'system',
    })
  }

  // ─── Edit message ───────────────────────────────────────────
  async function handleEdit(msgId: string) {
    if (!editContent.trim()) return
    const result = await editMessage(msgId, editContent.trim())
    if (result.error) { toast('수정 실패', 'error'); return }
    setEditingMsg(null)
    setEditContent('')
  }

  // ─── Delete message ─────────────────────────────────────────
  async function handleDelete(msgId: string) {
    const result = await deleteMessage(msgId)
    if (result.error) { toast('삭제 실패', 'error'); return }
  }

  // ─── New chat ───────────────────────────────────────────────
  async function handleCreateChat() {
    if (!profile?.id) return

    try {
      if (newChatType === 'dm') {
        if (!newChatTarget) { toast('대상을 선택하세요', 'error'); return }
        const room = await getOrCreateDM(profile.id, newChatTarget)
        if (room) {
          await refreshRooms()
          selectRoom(room.id)
        } else {
          toast('채팅방 생성 실패. 콘솔을 확인하세요.', 'error')
          return
        }
      } else {
        if (!newChatGroupName.trim()) { toast('그룹 이름을 입력하세요', 'error'); return }
        if (newChatMembers.length === 0) { toast('멤버를 선택하세요', 'error'); return }
        const allMembers = [...new Set([profile.id, ...newChatMembers])]
        const room = await createGroupRoom(newChatGroupName, allMembers, profile.id)
        if (room) {
          await refreshRooms()
          selectRoom(room.id)
        } else {
          toast('채팅방 생성 실패. 콘솔을 확인하세요.', 'error')
          return
        }
      }
    } catch (err) {
      console.error('Chat creation error:', err)
      toast('채팅방 생성 중 오류가 발생했습니다.', 'error')
      return
    }
    setShowNewChat(false)
    setNewChatTarget('')
    setNewChatGroupName('')
    setNewChatMembers([])
  }

  // ─── Room actions ───────────────────────────────────────────
  const togglePin = useCallback(async () => {
    if (!selectedRoomId || !profile?.id) return
    const room = rooms.find((r) => r.id === selectedRoomId)
    if (!room) return
    await supabase
      .from('chat_room_members')
      .update({ is_pinned: !room.is_pinned })
      .eq('room_id', selectedRoomId)
      .eq('user_id', profile.id)
    refreshRooms()
    setShowRoomMenu(false)
  }, [selectedRoomId, profile?.id, rooms, refreshRooms])

  const toggleMute = useCallback(async () => {
    if (!selectedRoomId || !profile?.id) return
    const room = rooms.find((r) => r.id === selectedRoomId)
    if (!room) return
    await supabase
      .from('chat_room_members')
      .update({ is_muted: !room.is_muted })
      .eq('room_id', selectedRoomId)
      .eq('user_id', profile.id)
    refreshRooms()
    setShowRoomMenu(false)
  }, [selectedRoomId, profile?.id, rooms, refreshRooms])

  // ─── Scroll ─────────────────────────────────────────────────
  function handleScroll() {
    const container = scrollContainerRef.current
    if (!container || !hasMore) return
    if (container.scrollTop < 100) {
      loadMore()
    }
  }

  // ─── Keyboard ───────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ─── File upload ────────────────────────────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedRoomId || !profile?.id) return

    if (file.size > 10 * 1024 * 1024) {
      toast('파일 크기는 10MB 이하만 가능합니다.', 'error')
      return
    }

    const allowedTypes = ['image/', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats', 'text/']
    if (!allowedTypes.some((t) => file.type.startsWith(t))) {
      toast('이미지, PDF, 문서 파일만 업로드 가능합니다.', 'error')
      return
    }

    const filePath = `chat/${selectedRoomId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(filePath, file)

    if (uploadError) {
      toast('파일 업로드 실패: ' + uploadError.message, 'error')
      return
    }

    const { data: urlData } = supabase.storage.from('chat-attachments').getPublicUrl(filePath)
    const isImage = file.type.startsWith('image/')

    await sendMessage(
      isImage ? `📷 ${file.name}` : `📎 ${file.name}`,
      isImage ? 'image' : 'file',
      {
        attachment_url: urlData.publicUrl,
        attachment_name: file.name,
        attachment_size: file.size,
        attachment_type: file.type,
      }
    )
    toast(getRetentionMessage('chat-attachments'), 'info')
  }

  if (roomsLoading && rooms.length === 0) return <PageSpinner />

  // ─── Chat Room List (Left Panel) ────────────────────────────
  const renderRoomList = () => (
    <div className="flex flex-col h-full border-r border-gray-200 bg-white">
      {/* Header */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-gray-900">메신저</h2>
          <Button size="sm" variant="outline" onClick={() => setShowNewChat(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="채팅방 검색..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-500"
          />
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto">
        {filteredRooms.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            {searchQuery ? '검색 결과가 없습니다' : '채팅방이 없습니다'}
          </div>
        ) : (
          filteredRooms.map((room) => (
            <button
              key={room.id}
              onClick={() => selectRoom(room.id)}
              className={`w-full flex items-start gap-3 px-3 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                selectedRoomId === room.id ? 'bg-brand-50 border-l-2 border-l-brand-500' : ''
              }`}
            >
              {/* Room icon */}
              <span className="text-lg mt-0.5 shrink-0">
                {ROOM_TYPE_ICONS[room.type]}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm truncate ${room.unread_count > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                    {room.name || '대화'}
                    {room.is_pinned && <Pin className="inline h-3 w-3 ml-1 text-brand-500" />}
                    {room.is_muted && <BellOff className="inline h-3 w-3 ml-1 text-gray-400" />}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0 ml-1">
                    {room.last_message_at
                      ? new Date(room.last_message_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-gray-500 truncate">
                    {room.last_message || '아직 메시지가 없습니다'}
                  </p>
                  {room.unread_count > 0 && !room.is_muted && (
                    <span className="shrink-0 ml-1 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                      {room.unread_count > 99 ? '99+' : room.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )

  // ─── Chat Area (Right Panel) ────────────────────────────────
  const renderChatArea = () => {
    if (!selectedRoomId || !selectedRoom) {
      return (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-400">
            <MessageCircle className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium mb-2">채팅방을 선택하세요</p>
            <p className="text-sm">왼쪽에서 대화를 선택하거나 새 대화를 시작하세요</p>
          </div>
        </div>
      )
    }

    return (
      <div className="flex-1 flex flex-col bg-white">
        {/* Chat header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            {/* Mobile back button */}
            <button
              onClick={() => { setShowMobile('list'); setSelectedRoomId(null); navigate('/messenger', { replace: true }) }}
              className="md:hidden p-1 rounded hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>

            <span className="text-lg">{ROOM_TYPE_ICONS[selectedRoom.type]}</span>
            <div>
              <h3 className="text-sm font-bold text-gray-900">{selectedRoom.name || '대화'}</h3>
              <p className="text-xs text-gray-500">
                {selectedRoom.member_count || 0}명
                {selectedRoom.is_ai_enabled && ' · AI 활성'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowMsgSearch(!showMsgSearch)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <Search className="h-4 w-4" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowRoomMenu(!showRoomMenu)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {showRoomMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  <button onClick={togglePin} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Pin className="h-4 w-4" /> {selectedRoom.is_pinned ? '고정 해제' : '채팅방 고정'}
                  </button>
                  <button onClick={toggleMute} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <BellOff className="h-4 w-4" /> {selectedRoom.is_muted ? '알림 켜기' : '알림 끄기'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Message search bar */}
        {showMsgSearch && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={msgSearchQuery}
              onChange={(e) => setMsgSearchQuery(e.target.value)}
              placeholder="메시지 검색..."
              className="flex-1 text-sm bg-transparent focus:outline-none"
              autoFocus
            />
            <button onClick={() => { setShowMsgSearch(false); setMsgSearchQuery('') }} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-1 bg-gray-50"
        >
          {hasMore && (
            <div className="text-center py-2">
              <button onClick={loadMore} className="text-xs text-brand-600 hover:underline">
                이전 메시지 불러오기
              </button>
            </div>
          )}

          {msgsLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-400">
                <MessageCircle className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">아직 메시지가 없습니다</p>
                {selectedRoom.is_ai_enabled && (
                  <p className="text-xs mt-1 text-gray-300">@AI로 AI 어시스턴트를 호출할 수 있습니다</p>
                )}
              </div>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const isMe = msg.sender_id === profile?.id
              const isSystem = msg.message_type === 'system'
              const isAI = msg.message_type === 'ai_bot'
              const isUrgent = msg.message_type === 'urgent_alert'
              const isDeleted = msg.is_deleted

              // System messages
              if (isSystem) {
                return (
                  <div key={msg.id} className="text-center py-1">
                    <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                      {msg.content}
                    </span>
                  </div>
                )
              }

              return (
                <div
                  key={msg.id}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'} group`}
                  onMouseEnter={() => setHoveredMsgId(msg.id)}
                  onMouseLeave={() => setHoveredMsgId(null)}
                >
                  <div className={`max-w-[75%] ${isMe ? '' : ''}`}>
                    {/* Sender name (group chats) */}
                    {!isMe && selectedRoom.type !== 'dm' && (
                      <p className="text-[10px] text-gray-500 ml-1 mb-0.5">
                        {isAI ? '🤖 AI 어시스턴트' : msg.sender_name || '시스템'}
                      </p>
                    )}

                    {/* Reply preview */}
                    {msg.reply_to_id && msg.reply_to && (
                      <div className="ml-1 mb-1 pl-2 border-l-2 border-gray-300">
                        <p className="text-[10px] text-gray-400 truncate">
                          {msg.reply_to.content}
                        </p>
                      </div>
                    )}

                    <div className="relative">
                      {/* Edit mode */}
                      {editingMsg === msg.id ? (
                        <div className="bg-white border-2 border-brand-300 rounded-2xl p-3">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full text-sm resize-none focus:outline-none"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex justify-end gap-1 mt-1">
                            <button onClick={() => setEditingMsg(null)} className="text-xs text-gray-500 px-2 py-1 hover:bg-gray-100 rounded">취소</button>
                            <button onClick={() => handleEdit(msg.id)} className="text-xs text-brand-600 px-2 py-1 hover:bg-brand-50 rounded font-medium">저장</button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`rounded-2xl px-4 py-2.5 text-sm ${
                            isDeleted
                              ? 'bg-gray-100 text-gray-400 italic'
                              : isUrgent
                              ? 'bg-red-50 border border-red-200 text-red-800 rounded-xl'
                              : isAI
                              ? 'bg-white border-2 border-purple-200 text-gray-900 rounded-bl-md shadow-sm'
                              : isMe
                              ? 'bg-brand-600 text-white rounded-br-md'
                              : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md shadow-sm'
                          }`}
                        >
                          {isUrgent && <span className="text-red-600 font-bold text-xs block mb-1">🔴 긴급 알림</span>}
                          {isAI && <span className="text-purple-600 font-bold text-xs block mb-1">🤖 AI</span>}

                          {isDeleted ? (
                            <span>삭제된 메시지입니다</span>
                          ) : (
                            <>
                              {/* Attachment */}
                              {msg.attachment_url && msg.message_type === 'image' && (
                                <img
                                  src={msg.attachment_url}
                                  alt={msg.attachment_name || '이미지'}
                                  className="max-w-full rounded-lg mb-1 cursor-pointer"
                                  onClick={() => window.open(msg.attachment_url!, '_blank')}
                                />
                              )}
                              {msg.attachment_url && msg.message_type === 'file' && (
                                <div className="space-y-1 mb-1">
                                  <a
                                    href={msg.attachment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100"
                                  >
                                    <Paperclip className="h-4 w-4 text-gray-500" />
                                    <div>
                                      <p className="text-xs font-medium text-gray-700">{msg.attachment_name}</p>
                                      {msg.attachment_size && (
                                        <p className="text-[10px] text-gray-400">{(msg.attachment_size / 1024).toFixed(1)} KB</p>
                                      )}
                                    </div>
                                  </a>
                                  <FileRetentionBadge
                                    createdAt={msg.created_at}
                                    retentionDays={180}
                                    downloadUrl={msg.attachment_url}
                                    fileName={msg.attachment_name || undefined}
                                    compact
                                  />
                                </div>
                              )}

                              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                            </>
                          )}

                          <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : ''}`}>
                            <span className={`text-[10px] ${isMe ? 'text-brand-200' : 'text-gray-400'}`}>
                              {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.is_edited && <span className={`text-[10px] ${isMe ? 'text-brand-200' : 'text-gray-400'}`}>(수정됨)</span>}
                          </div>
                        </div>
                      )}

                      {/* Hover actions */}
                      {hoveredMsgId === msg.id && !isDeleted && editingMsg !== msg.id && (
                        <div className={`absolute top-0 ${isMe ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5 z-10`}>
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => addReaction(msg.id, emoji)}
                              className="hover:bg-gray-100 rounded p-1 text-sm"
                              title={emoji}
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            onClick={() => setReplyTo(msg)}
                            className="hover:bg-gray-100 rounded p-1"
                            title="답글"
                          >
                            <Reply className="h-3 w-3 text-gray-500" />
                          </button>
                          {isMe && (
                            <>
                              <button
                                onClick={() => { setEditingMsg(msg.id); setEditContent(msg.content) }}
                                className="hover:bg-gray-100 rounded p-1"
                                title="수정"
                              >
                                <Edit3 className="h-3 w-3 text-gray-500" />
                              </button>
                              <button
                                onClick={() => handleDelete(msg.id)}
                                className="hover:bg-red-50 rounded p-1"
                                title="삭제"
                              >
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}

          {aiTyping && (
            <div className="flex justify-start">
              <div className="bg-white border-2 border-purple-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-purple-500" />
                  <span className="text-xs text-purple-500">AI 응답 중...</span>
                  <Loader2 className="h-3 w-3 text-purple-500 animate-spin" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Reply bar */}
        {replyTo && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Reply className="h-3 w-3" />
              <span>{replyTo.sender_name || '시스템'}에게 답글:</span>
              <span className="truncate max-w-[200px]">{replyTo.content}</span>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-gray-200 bg-white p-3">
          <div className="flex items-end gap-2">
            {/* File upload */}
            <label className="cursor-pointer p-2 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0">
              <Paperclip className="h-5 w-5" />
              <input
                type="file"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
                onChange={handleFileUpload}
              />
            </label>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedRoom.is_ai_enabled ? '@AI로 AI 호출 가능 · Enter로 전송' : '메시지를 입력하세요...'}
              rows={1}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-500 max-h-32"
              style={{ minHeight: '42px' }}
            />

            <Button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="rounded-xl px-4 shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] -mx-4 md:-mx-6 -my-4 md:-my-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Desktop: side-by-side */}
      <div className="hidden md:flex md:w-80 md:shrink-0">
        {renderRoomList()}
      </div>
      <div className="hidden md:flex md:flex-1">
        {renderChatArea()}
      </div>

      {/* Mobile: toggle between list and chat */}
      <div className="flex flex-col w-full md:hidden">
        {showMobile === 'list' ? renderRoomList() : renderChatArea()}
      </div>

      {/* ─── New Chat Dialog ───────────────────────────────────── */}
      <Dialog
        open={showNewChat}
        onClose={() => setShowNewChat(false)}
        title="새 대화 만들기"
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setNewChatType('dm')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                newChatType === 'dm' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              👤 1:1 대화
            </button>
            <button
              onClick={() => setNewChatType('group')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                newChatType === 'group' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              👥 그룹 대화
            </button>
          </div>

          {newChatType === 'dm' ? (
            <Select
              label="대화 상대"
              value={newChatTarget}
              onChange={(e) => setNewChatTarget(e.target.value)}
              options={employees.filter((e) => e.id !== profile?.id).map((e) => ({ value: e.id, label: e.name }))}
              placeholder="직원 선택"
            />
          ) : (
            <>
              <Input
                label="그룹 이름"
                value={newChatGroupName}
                onChange={(e) => setNewChatGroupName(e.target.value)}
                placeholder="채팅방 이름"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">멤버 선택</label>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                  {employees.filter((e) => e.id !== profile?.id).map((emp) => (
                    <label key={emp.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newChatMembers.includes(emp.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewChatMembers((prev) => [...prev, emp.id])
                          } else {
                            setNewChatMembers((prev) => prev.filter((id) => id !== emp.id))
                          }
                        }}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-sm text-gray-700">{emp.name}</span>
                    </label>
                  ))}
                </div>
                {newChatMembers.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">{newChatMembers.length}명 선택됨</p>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowNewChat(false)}>취소</Button>
            <Button onClick={handleCreateChat}>만들기</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
