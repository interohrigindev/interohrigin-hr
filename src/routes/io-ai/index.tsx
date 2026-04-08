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
    <>
      {/*
        DashboardLayout의 <main className="p-4 md:p-6"> 안에 렌더됨.
        패딩/스크롤을 무시하고 전체 영역을 차지하기 위해
        negative margin + fixed height 사용
      */}
      <div className="flex -m-4 md:-m-6 h-[calc(100vh-64px)] overflow-hidden">
        {/* ─── 사이드바 (다크) ─── */}
        {/* 데스크톱 */}
        <div
          className={`hidden md:block shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
            sidebarOpen ? 'w-64' : 'w-0'
          }`}
        >
          <div className="w-64 h-full">
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
        </div>

        {/* 모바일 사이드바 */}
        {!mobileChat && (
          <div className="md:hidden w-full">
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
        <div className={`${mobileChat ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-0 bg-white`}>
          {/* 상단 바 */}
          <div className="flex items-center gap-2 h-11 px-4 border-b border-gray-100 shrink-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden md:flex p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title={sidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setMobileChat(false)}
              className="md:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-medium text-gray-600 truncate flex-1">
              {activeConversation?.title || '새 대화'}
            </p>
          </div>

          <ChatArea
            messages={messages}
            sending={sending}
            lastError={lastError}
            onSendMessage={handleSendMessage}
          />
        </div>
      </div>
    </>
  )
}
