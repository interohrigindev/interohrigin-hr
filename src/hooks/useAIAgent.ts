import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { generateAIChat, getAIConfigForFeature } from '@/lib/ai-client'
import type { AIConfig } from '@/lib/ai-client'
import { routeMessage, getTaskLabel, getNextProvider } from '@/lib/ai-router'
import type { TaskType } from '@/lib/ai-router'
import { getSystemPrompt } from '@/lib/ai-prompts'
import { buildPlatformContext } from '@/lib/ai-context'
import { detectDocumentRequest, generateDocument } from '@/lib/document-generator'
import { useAuth } from '@/hooks/useAuth'
import type { AgentConversation, AgentMessage, AgentContextType } from '@/types/ai-agent'

function detectContextType(pathname: string): AgentContextType {
  if (pathname.includes('/projects/')) return 'project'
  if (pathname.includes('/recruitment')) return 'recruitment'
  if (pathname.includes('/ojt')) return 'ojt'
  if (pathname.includes('/evaluate') || pathname.includes('/peer-review')) return 'evaluation'
  if (pathname.includes('/urgent')) return 'urgent'
  return 'general'
}

export function useAIAgent() {
  const { profile } = useAuth()
  const location = useLocation()

  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [sending, setSending] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  // ─── 대화 목록 로드 ──────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await supabase
      .from('agent_conversations')
      .select('*')
      .eq('user_id', profile.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(30)
    setConversations((data || []) as AgentConversation[])
  }, [profile?.id])

  useEffect(() => { loadConversations() }, [loadConversations])

  // ─── 메시지 로드 ─────────────────────────────────────────
  const loadMessages = useCallback(async (convId: string) => {
    const { data } = await supabase
      .from('agent_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at')
    setMessages((data || []) as AgentMessage[])
  }, [])

  useEffect(() => {
    if (activeConvId) loadMessages(activeConvId)
    else setMessages([])
  }, [activeConvId, loadMessages])

  // ─── Realtime 구독 ───────────────────────────────────────
  useEffect(() => {
    if (!activeConvId) return
    const channel = supabase
      .channel(`agent-msg-${activeConvId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_messages',
        filter: `conversation_id=eq.${activeConvId}`,
      }, (payload) => {
        const newMsg = payload.new as AgentMessage
        setMessages((prev) => {
          // 이미 실제 ID로 존재하면 무시
          if (prev.some((m) => m.id === newMsg.id)) return prev
          // 낙관적 업데이트(temp-/local-/err-)를 실제 메시지로 교체
          const hasTemp = prev.some((m) => m.id.startsWith('temp-') || m.id.startsWith('local-') || m.id.startsWith('err-'))
          if (hasTemp) {
            // 같은 role+content의 temp 메시지를 찾아서 교체
            const tempIdx = prev.findIndex((m) =>
              (m.id.startsWith('temp-') || m.id.startsWith('local-') || m.id.startsWith('err-'))
              && m.role === newMsg.role && m.content === newMsg.content
            )
            if (tempIdx >= 0) {
              const next = [...prev]
              next[tempIdx] = newMsg
              return next
            }
          }
          return [...prev, newMsg]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeConvId])

  // ─── Smart AI Router — 메시지별 최적 Provider 선택 ────────
  async function getSmartConfig(message: string): Promise<{
    config: AIConfig | null; taskType: TaskType; allProviders: AIConfig[]
  }> {
    // 1) Smart Router로 최적 provider 선택
    const { config, taskType, allProviders } = await routeMessage(message)
    if (config) {
      console.log(`[AIRouter] ${getTaskLabel(taskType)} → ${config.provider}/${config.model}`)
      return { config, taskType, allProviders }
    }
    // 2) fallback: 기능별 설정
    const fallback = await getAIConfigForFeature('ai_agent')
    return { config: fallback, taskType, allProviders }
  }

  // ─── 새 대화 시작 ────────────────────────────────────────
  async function startNewConversation(projectId?: string) {
    if (!profile?.id) return null
    const contextType = detectContextType(location.pathname)
    const { data, error } = await supabase
      .from('agent_conversations')
      .insert({
        user_id: profile.id,
        context_type: contextType,
        project_id: projectId || null,
        department_id: profile.department_id || null,
      })
      .select()
      .single()

    if (error || !data) {
      console.error('[AIAgent] 대화 생성 실패:', error?.message)
      return null
    }

    const conv = data as AgentConversation
    setActiveConvId(conv.id)
    setMessages([])
    await loadConversations()
    return conv
  }

  // ─── 메시지 전송 ─────────────────────────────────────────
  async function sendMessage(content: string): Promise<{ error: string | null }> {
    if (!profile?.id || !content.trim()) return { error: '입력 필요' }

    setSending(true)
    setLastError(null)

    // 대화가 없으면 자동 생성
    let convId = activeConvId
    if (!convId) {
      const conv = await startNewConversation()
      if (!conv) {
        setSending(false)
        setLastError('대화 생성에 실패했습니다.')
        return { error: '대화 생성 실패' }
      }
      convId = conv.id
    }

    // 유저 메시지를 로컬 state에 즉시 추가 (낙관적 업데이트)
    const optimisticUserMsg: AgentMessage = {
      id: 'temp-' + Date.now(),
      conversation_id: convId,
      role: 'user',
      content,
      provider: null,
      model: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticUserMsg])

    // 유저 메시지 DB 저장
    const { error: insertErr } = await supabase.from('agent_messages').insert({
      conversation_id: convId,
      role: 'user',
      content,
    })
    if (insertErr) {
      console.error('[AIAgent] 메시지 저장 실패:', insertErr.message)
      setSending(false)
      setLastError('메시지 저장에 실패했습니다: ' + insertErr.message)
      return { error: insertErr.message }
    }

    // AI 호출 — Smart Router로 최적 provider 선택
    const { config: aiConfig, taskType, allProviders } = await getSmartConfig(content)
    if (!aiConfig) {
      const errMsg = 'AI 설정이 없습니다. 관리자 설정에서 API 키를 등록하세요.'
      setLastError(errMsg)
      setMessages((prev) => [...prev, {
        id: 'err-' + Date.now(),
        conversation_id: convId,
        role: 'assistant',
        content: errMsg,
        provider: null, model: null,
        created_at: new Date().toISOString(),
      }])
      setSending(false)
      return { error: errMsg }
    }

    try {
      // 최근 메시지로 컨텍스트 구성
      const recentMsgs = [...messages.filter((m) => m.role !== 'system').slice(-20), { role: 'user' as const, content }]
        .map((m) => ({ role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.content }))

      // RAG: 플랫폼 실시간 데이터 컨텍스트 빌드
      const platformContext = await buildPlatformContext(profile?.id)
      const systemPrompt = getSystemPrompt(taskType, profile?.name, profile?.role, platformContext)

      // AI 호출 (실패 시 다른 provider로 자동 fallback)
      let response
      let currentConfig = aiConfig
      console.log(`[AIRouter] ${getTaskLabel(taskType)} → ${currentConfig.provider}/${currentConfig.model} (${recentMsgs.length}msgs)`)
      try {
        response = await generateAIChat(currentConfig, systemPrompt, recentMsgs)
      } catch (primaryErr) {
        console.warn(`[AIRouter] ${currentConfig.provider} 실패, fallback 시도:`, primaryErr)
        const fallbackConfig = getNextProvider(taskType, allProviders, currentConfig.provider)
        if (fallbackConfig) {
          console.log(`[AIRouter] fallback → ${fallbackConfig.provider}/${fallbackConfig.model}`)
          currentConfig = fallbackConfig
          response = await generateAIChat(currentConfig, systemPrompt, recentMsgs)
        } else {
          throw primaryErr
        }
      }
      console.log('[AIAgent] AI 응답 수신, 길이:', response.content.length)

      // AI 응답 DB 저장
      const { error: aiInsertErr } = await supabase.from('agent_messages').insert({
        conversation_id: convId,
        role: 'assistant',
        content: response.content,
        provider: response.provider,
        model: response.model,
      })

      if (aiInsertErr) {
        console.error('[AIAgent] AI 응답 저장 실패:', aiInsertErr.message)
        // DB 저장 실패해도 로컬에 표시
        setMessages((prev) => [...prev, {
          id: 'local-' + Date.now(),
          conversation_id: convId,
          role: 'assistant',
          content: response.content,
          provider: response.provider, model: response.model,
          created_at: new Date().toISOString(),
        }])
      }

      // 문서 생성 감지 → Google Workspace 연동
      const docType = detectDocumentRequest(content)
      if (docType && response.content.length > 50) {
        try {
          const titleMatch = content.match(/['\"](.+?)['\"]/) || content.match(/(.{2,20})\s*(만들어|작성|생성)/)
          const docTitle = titleMatch?.[1] || '문서'
          const docResult = await generateDocument(docType, docTitle, response.content)

          // 문서 생성 결과를 별도 메시지로 추가
          const docMsg = `📄 **${docType === 'slides' ? 'Google Slides' : 'Google Docs'}** 문서가 생성되었습니다!\n\n[${docResult.title}](${docResult.url})`
          await supabase.from('agent_messages').insert({
            conversation_id: convId,
            role: 'assistant',
            content: docMsg,
            provider: 'google-workspace',
            model: docType,
          })
          setMessages((prev) => [...prev, {
            id: 'doc-' + Date.now(),
            conversation_id: convId,
            role: 'assistant',
            content: docMsg,
            provider: 'google-workspace',
            model: docType,
            created_at: new Date().toISOString(),
          }])
          console.log(`[Document] ${docType} 생성 완료:`, docResult.url)
        } catch (docErr: unknown) {
          const docErrMsg = docErr instanceof Error ? docErr.message : '문서 생성 실패'
          console.error('[Document] 문서 생성 실패:', docErrMsg)
          // 문서 생성 실패 메시지를 사용자에게 표시
          setMessages((prev) => [...prev, {
            id: 'doc-err-' + Date.now(),
            conversation_id: convId,
            role: 'assistant',
            content: `⚠️ Google 문서 생성에 실패했습니다: ${docErrMsg}\n\n위 내용을 복사하여 직접 문서를 작성하실 수 있습니다.`,
            provider: null, model: null,
            created_at: new Date().toISOString(),
          }])
        }
      }

      // 첫 응답이면 자동 제목 생성
      const conv = conversations.find((c) => c.id === convId)
      if (conv && !conv.title && messages.length <= 2) {
        generateTitle(convId, content, response.content)
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'AI 응답 실패'
      console.error('[AIAgent] AI 호출 실패:', errMsg)
      setLastError(errMsg)

      // 에러를 로컬 state에 즉시 표시
      setMessages((prev) => [...prev, {
        id: 'err-' + Date.now(),
        conversation_id: convId,
        role: 'assistant',
        content: `오류가 발생했습니다: ${errMsg}`,
        provider: null, model: null,
        created_at: new Date().toISOString(),
      }])

      // DB에도 저장 시도 (실패해도 무시)
      try {
        await supabase.from('agent_messages').insert({
          conversation_id: convId,
          role: 'assistant',
          content: `오류가 발생했습니다: ${errMsg}`,
        })
      } catch { /* ignore */ }
    }

    setSending(false)
    await loadConversations()
    return { error: null }
  }

  // ─── 제목 자동 생성 (비동기, 실패 무시) ──────────────────
  async function generateTitle(convId: string, userMsg: string, aiMsg: string) {
    try {
      const { config: titleConfig } = await getSmartConfig('요약')
      if (!titleConfig) return
      const resp = await generateAIChat(titleConfig,
        '다음 대화를 5단어 이내로 요약하세요. 제목만 출력하고 다른 텍스트는 없이.',
        [{ role: 'user', content: userMsg }, { role: 'assistant', content: aiMsg }]
      )
      const title = resp.content.replace(/["""]/g, '').trim().slice(0, 50)
      if (title) {
        await supabase.from('agent_conversations').update({ title }).eq('id', convId)
        await loadConversations()
      }
    } catch { /* title 생성 실패 무시 */ }
  }

  // ─── 대화 관리 ───────────────────────────────────────────
  async function selectConversation(id: string) {
    setActiveConvId(id)
    setLastError(null)
  }

  async function toggleBookmark(id: string) {
    const conv = conversations.find((c) => c.id === id)
    if (!conv) return
    await supabase.from('agent_conversations').update({ is_bookmarked: !conv.is_bookmarked }).eq('id', id)
    await loadConversations()
  }

  async function archiveConversation(id: string) {
    await supabase.from('agent_conversations').update({ is_archived: true }).eq('id', id)
    if (activeConvId === id) { setActiveConvId(null); setMessages([]) }
    await loadConversations()
  }

  async function deleteConversation(id: string) {
    await supabase.from('agent_conversations').delete().eq('id', id)
    if (activeConvId === id) { setActiveConvId(null); setMessages([]) }
    await loadConversations()
  }

  async function searchArchive(query: string): Promise<AgentConversation[]> {
    if (!query.trim()) return []
    const { data } = await supabase
      .from('agent_conversations')
      .select('*')
      .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
      .eq('is_archived', true)
      .order('last_message_at', { ascending: false })
      .limit(20)
    return (data || []) as AgentConversation[]
  }

  // ─── 메시지 편집 후 재전송 ────────────────────────────────
  async function editAndResend(messageId: string, newContent: string): Promise<{ error: string | null }> {
    if (!activeConvId) return { error: '대화 없음' }

    // 편집 대상 메시지 이후의 모든 메시지 삭제 (DB + 로컬)
    const msgIndex = messages.findIndex((m) => m.id === messageId)
    if (msgIndex < 0) return { error: '메시지를 찾을 수 없음' }

    const msgsToDelete = messages.slice(msgIndex)
    const idsToDelete = msgsToDelete.map((m) => m.id).filter((id) => !id.startsWith('temp-') && !id.startsWith('local-') && !id.startsWith('err-') && !id.startsWith('doc-'))

    // DB에서 삭제
    if (idsToDelete.length > 0) {
      await supabase.from('agent_messages').delete().in('id', idsToDelete)
    }

    // 로컬 state 업데이트
    setMessages((prev) => prev.slice(0, msgIndex))

    // 새 내용으로 재전송
    return sendMessage(newContent)
  }

  // ─── AI 응답 재생성 ──────────────────────────────────────
  async function regenerateResponse(): Promise<{ error: string | null }> {
    if (!activeConvId || messages.length === 0) return { error: '대화 없음' }

    // 마지막 assistant 메시지 찾기
    let lastAssistantIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') { lastAssistantIdx = i; break }
    }
    if (lastAssistantIdx < 0) return { error: '응답 없음' }

    // 마지막 user 메시지 찾기
    let lastUserMsg: AgentMessage | null = null
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserMsg = messages[i]; break }
    }
    if (!lastUserMsg) return { error: '질문 없음' }

    // 마지막 assistant 이후 메시지 모두 삭제
    const msgsToDelete = messages.slice(lastAssistantIdx)
    const idsToDelete = msgsToDelete.map((m) => m.id).filter((id) => !id.startsWith('temp-') && !id.startsWith('local-') && !id.startsWith('err-') && !id.startsWith('doc-'))

    if (idsToDelete.length > 0) {
      await supabase.from('agent_messages').delete().in('id', idsToDelete)
    }

    setMessages((prev) => prev.slice(0, lastAssistantIdx))

    // 같은 질문으로 재전송
    return sendMessage(lastUserMsg.content)
  }

  const activeConversation = conversations.find((c) => c.id === activeConvId) || null

  return {
    conversations,
    activeConversation,
    messages,
    sending,
    lastError,

    startNewConversation,
    selectConversation,
    sendMessage,
    editAndResend,
    regenerateResponse,
    toggleBookmark,
    archiveConversation,
    deleteConversation,
    searchArchive,
  }
}
