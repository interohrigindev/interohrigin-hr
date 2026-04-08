import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowLeft, Menu } from 'lucide-react'
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

  const [showSidebar, setShowSidebar] = useState(true)

  // 플로팅에서 전환 시 conversationId 자동 선택
  useEffect(() => {
    const state = location.state as { conversationId?: string } | null
    if (state?.conversationId) {
      selectConversation(state.conversationId)
      setShowSidebar(false)
    }
  }, [location.state])

  function handleNewChat() {
    startNewConversation()
    setShowSidebar(false)
  }

  function handleSelectConv(id: string) {
    selectConversation(id)
    setShowSidebar(false)
  }

  async function handleSendMessage(content: string) {
    await sendMessage(content)
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white overflow-hidden -m-6">
      {/* 사이드바 — 데스크톱 항상 표시, 모바일 토글 */}
      <div className={`${showSidebar ? 'flex' : 'hidden'} md:flex w-full md:w-72 lg:w-80 shrink-0`}>
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

      {/* 채팅 영역 */}
      <div className={`${!showSidebar ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-0`}>
        {/* 모바일 뒤로가기 */}
        <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white">
          <button
            onClick={() => setShowSidebar(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 truncate">
            {activeConversation?.title || '새 대화'}
          </span>
        </div>

        <ChatArea
          conversation={activeConversation}
          messages={messages}
          sending={sending}
          lastError={lastError}
          onSendMessage={handleSendMessage}
        />
      </div>

      {/* 모바일 사이드바 토글 버튼 (채팅 뷰에서) */}
      {!showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="md:hidden fixed top-20 left-4 z-30 p-2 bg-white border rounded-xl shadow-sm text-gray-500 hover:bg-gray-50"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
