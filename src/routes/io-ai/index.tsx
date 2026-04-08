import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeft } from 'lucide-react'
import { useAIAgent } from '@/hooks/useAIAgent'
import ChatSidebar from './components/ChatSidebar'
import ChatArea from './components/ChatArea'

export default function IOAIPage() {
  const location = useLocation()
  const {
    conversations, activeConversation, messages, sending, lastError,
    startNewConversation, selectConversation, sendMessage,
    toggleBookmark, archiveConversation, deleteConversation, searchArchive,
  } = useAIAgent()

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileChat, setMobileChat] = useState(false)

  // 플로팅에서 전환 시 conversationId 자동 선택
  useEffect(() => {
    const state = location.state as { conversationId?: string } | null
    if (state?.conversationId) {
      selectConversation(state.conversationId)
      setMobileChat(true)
    }
  }, [location.state])

  function handleNewChat() {
    startNewConversation()
    setMobileChat(true)
  }

  function handleSelectConv(id: string) {
    selectConversation(id)
    setMobileChat(true)
  }

  async function handleSendMessage(content: string) {
    setMobileChat(true)
    await sendMessage(content)
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden -m-6 bg-white">
      {/* ─── 사이드바 (다크 테마) ─── */}
      {/* 데스크톱: 토글 가능 */}
      <div
        className={`hidden md:flex shrink-0 transition-all duration-200 ${
          sidebarOpen ? 'w-64 lg:w-72' : 'w-0'
        } overflow-hidden`}
      >
        <ChatSidebar
          conversations={conversations}
          activeConvId={activeConversation?.id || null}
          onSelect={handleSelectConv}
          onNewChat={handleNewChat}
          onBookmark={toggleBookmark}
          onArchive={archiveConversation}
          onDelete={deleteConversation}
          onSearchArchive={searchArchive}
        />
      </div>

      {/* 모바일: 오버레이 */}
      {!mobileChat && (
        <div className="md:hidden flex w-full">
          <ChatSidebar
            conversations={conversations}
            activeConvId={activeConversation?.id || null}
            onSelect={handleSelectConv}
            onNewChat={handleNewChat}
            onBookmark={toggleBookmark}
            onArchive={archiveConversation}
            onDelete={deleteConversation}
            onSearchArchive={searchArchive}
          />
        </div>
      )}

      {/* ─── 채팅 영역 ─── */}
      <div className={`${mobileChat ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-0 relative`}>
        {/* 상단 바 — 사이드바 토글 + 대화 제목 */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white/80 backdrop-blur-sm shrink-0">
          {/* 데스크톱 사이드바 토글 */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:flex p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title={sidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </button>
          {/* 모바일 뒤로가기 */}
          <button
            onClick={() => setMobileChat(false)}
            className="md:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-medium text-gray-700 truncate flex-1">
            {activeConversation?.title || '새 대화'}
          </p>
        </div>

        <ChatArea
          conversation={activeConversation}
          messages={messages}
          sending={sending}
          lastError={lastError}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  )
}
