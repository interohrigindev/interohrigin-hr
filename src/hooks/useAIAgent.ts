import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { generateAIChat } from '@/lib/ai-client'
import type { AIConfig } from '@/lib/ai-client'
import { useAuth } from '@/hooks/useAuth'
import type { AgentConversation, AgentMessage, AgentContextType } from '@/types/ai-agent'

const SYSTEM_PROMPT_BASE = `당신은 인터오리진(InterOhrigin)의 AI 어시스턴트 직원입니다.
회사는 화장품/뷰티 브랜드 사업을 영위하며, 브랜드사업본부·마케팅영업본부·경영관리본부로 운영됩니다.
한국어로 응답하며, 마크다운 형식을 사용합니다.
당신의 대화는 전사 지식으로 아카이빙되므로 정확하고 유용한 정보를 제공하세요.
프로젝트 진행, 시장 조사, 경쟁사 분석, 디자인 참고, 아이디어 도출, 의사결정 지원 등 실질적인 업무 도움을 제공합니다.`

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
  const [loading] = useState(false)
  const [sending, setSending] = useState(false)

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
        setMessages((prev) => [...prev, payload.new as AgentMessage])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeConvId])

  // ─── AI 설정 로드 ────────────────────────────────────────
  async function getAIConfig(): Promise<AIConfig | null> {
    const { data } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single()
    if (!data) return null
    return { provider: data.provider, apiKey: data.api_key, model: data.model }
  }

  // ─── 시스템 프롬프트 빌드 ────────────────────────────────
  function buildSystemPrompt(contextType: AgentContextType, projectName?: string): string {
    let prompt = SYSTEM_PROMPT_BASE

    if (profile) {
      prompt += `\n\n현재 사용자: ${profile.name} (${profile.role})`
    }

    if (contextType === 'project' && projectName) {
      prompt += `\n현재 프로젝트: ${projectName}`
      prompt += `\n프로젝트 맥락에서 실질적인 업무 지원을 제공하세요. 시장 트렌드, 경쟁사 분석, 실행 전략 등을 포함해주세요.`
    }

    return prompt
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

    if (error || !data) return null

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

    // 대화가 없으면 자동 생성
    let convId = activeConvId
    if (!convId) {
      const conv = await startNewConversation()
      if (!conv) { setSending(false); return { error: '대화 생성 실패' } }
      convId = conv.id
    }

    // 유저 메시지 저장
    await supabase.from('agent_messages').insert({
      conversation_id: convId,
      role: 'user',
      content,
    })

    // AI 호출
    const aiConfig = await getAIConfig()
    if (!aiConfig) {
      setSending(false)
      return { error: 'AI 설정이 없습니다. 관리자 설정에서 API 키를 등록하세요.' }
    }

    try {
      // 최근 메시지 20개 + 현재 메시지로 컨텍스트 구성
      const recentMsgs = [...messages.slice(-20), { role: 'user' as const, content }]
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      const activeConv = conversations.find((c) => c.id === convId)
      const contextType = activeConv?.context_type || detectContextType(location.pathname)
      const systemPrompt = buildSystemPrompt(contextType)

      const response = await generateAIChat(aiConfig, systemPrompt, recentMsgs)

      // AI 응답 저장
      await supabase.from('agent_messages').insert({
        conversation_id: convId,
        role: 'assistant',
        content: response.content,
        provider: response.provider,
        model: response.model,
      })

      // 첫 응답이면 자동 제목 생성
      const conv = conversations.find((c) => c.id === convId)
      if (conv && !conv.title && messages.length <= 1) {
        generateTitle(convId, content, response.content)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI 응답 실패'
      await supabase.from('agent_messages').insert({
        conversation_id: convId,
        role: 'assistant',
        content: `오류가 발생했습니다: ${msg}`,
      })
    }

    setSending(false)
    await loadConversations()
    return { error: null }
  }

  // ─── 제목 자동 생성 (비동기) ─────────────────────────────
  async function generateTitle(convId: string, userMsg: string, aiMsg: string) {
    try {
      const aiConfig = await getAIConfig()
      if (!aiConfig) return
      const resp = await generateAIChat(aiConfig,
        '다음 대화를 5단어 이내로 요약하세요. 제목만 출력하고 다른 텍스트는 없이.',
        [{ role: 'user', content: userMsg }, { role: 'assistant', content: aiMsg }]
      )
      const title = resp.content.replace(/["""]/g, '').trim().slice(0, 50)
      if (title) {
        await supabase.from('agent_conversations').update({ title }).eq('id', convId)
        await loadConversations()
      }
    } catch { /* ignore title generation errors */ }
  }

  // ─── 대화 관리 ───────────────────────────────────────────
  async function selectConversation(id: string) {
    setActiveConvId(id)
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

  // ─── 아카이브 검색 ───────────────────────────────────────
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

  const activeConversation = conversations.find((c) => c.id === activeConvId) || null

  return {
    conversations,
    activeConversation,
    messages,
    loading,
    sending,

    startNewConversation,
    selectConversation,
    sendMessage,
    toggleBookmark,
    archiveConversation,
    deleteConversation,
    searchArchive,
  }
}
