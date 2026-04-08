import DOMPurify from 'dompurify'
import { Copy, Check, RotateCcw, Pencil, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useState, useEffect } from 'react'
import type { AgentMessage } from '@/types/ai-agent'
import DocumentCard from './DocumentCard'
import type { DocumentResult, DocumentType } from '@/lib/google-workspace'

// ─── 마크다운 렌더러 ──────────────────────────────────────────

function renderMarkdown(text: string): string {
  let html = text
    // 코드블록
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
      const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()
      return `<div class="my-3 rounded-lg overflow-hidden border border-gray-200">
        <div class="flex items-center justify-between px-3 py-1.5 bg-gray-800 text-gray-400 text-[10px] font-mono">${lang || 'code'}<button onclick="navigator.clipboard.writeText(this.closest('div').nextElementSibling.textContent)" class="text-gray-500 hover:text-white text-[10px]">복사</button></div>
        <pre class="px-3 py-2.5 bg-gray-900 text-gray-100 text-xs leading-relaxed overflow-x-auto"><code>${escaped}</code></pre>
      </div>`
    })
    // 인라인 코드
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-gray-100 text-violet-700 rounded text-xs font-mono">$1</code>')
    // 헤딩
    .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-bold text-gray-800 mt-3 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-gray-800 mt-3 mb-1.5 flex items-center gap-1.5"><span class="w-1 h-4 bg-violet-500 rounded-full inline-block"></span>$1</h3>')
    .replace(/^## \d+\.\s(.+)$/gm, '<h2 class="text-base font-bold text-gray-900 mt-4 mb-2 pb-1 border-b border-gray-200">$1</h2>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-gray-900 mt-4 mb-2 pb-1 border-b border-gray-200">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-gray-900 mt-3 mb-2">$1</h1>')
    // 볼드 / 이탤릭
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 체크박스
    .replace(/^- \[ \] (.+)$/gm, '<li class="flex items-start gap-2 py-0.5"><span class="text-gray-400 mt-0.5">☐</span><span>$1</span></li>')
    .replace(/^- \[x\] (.+)$/gm, '<li class="flex items-start gap-2 py-0.5"><span class="text-green-500 mt-0.5">☑</span><span>$1</span></li>')
    // 특수 불릿
    .replace(/^- ✅ (.+)$/gm, '<li class="flex items-start gap-2 py-0.5 px-2 bg-green-50 rounded"><span>✅</span><span>$1</span></li>')
    .replace(/^- ⚠️ (.+)$/gm, '<li class="flex items-start gap-2 py-0.5 px-2 bg-amber-50 rounded"><span>⚠️</span><span>$1</span></li>')
    .replace(/^- 💡 (.+)$/gm, '<li class="flex items-start gap-2 py-0.5 px-2 bg-blue-50 rounded"><span>💡</span><span>$1</span></li>')
    // 일반 불릿
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-2 py-0.5"><span class="text-violet-400 mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-violet-400 inline-block"></span><span>$1</span></li>')
    // 번호 리스트
    .replace(/^(\d+)\. (.+)$/gm, '<li class="flex items-start gap-2 py-0.5"><span class="text-violet-600 font-semibold shrink-0 w-5 text-right">$1.</span><span>$2</span></li>')
    // 테이블
    .replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line.split('|').filter(c => c.trim())
      if (cells.every(c => /^[\s-:]+$/.test(c))) return '<tr class="border-b border-gray-200"></tr>'
      const cellsHtml = cells.map(c => `<td class="px-3 py-1.5 text-xs text-gray-700 border-b border-gray-100">${c.trim()}</td>`).join('')
      return `<tr class="hover:bg-gray-50">${cellsHtml}</tr>`
    })
    // 수평선
    .replace(/^---$/gm, '<hr class="my-3 border-gray-200" />')
    // 줄바꿈
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br>')

  // 테이블 래핑
  html = html.replace(
    /(<tr[\s\S]*?<\/tr>)+/g,
    (match) => `<div class="overflow-x-auto my-2 rounded-lg border border-gray-200"><table class="w-full text-sm">${match}</table></div>`
  )

  return DOMPurify.sanitize(html, { ADD_TAGS: ['style', 'button'], ADD_ATTR: ['class', 'style', 'onclick'] })
}

// ─── 스트리밍 텍스트 훅 ────────────────────────────────────────

function useStreamingText(content: string, isLatest: boolean) {
  const [displayed, setDisplayed] = useState(content)
  const [isStreaming, setIsStreaming] = useState(false)

  useEffect(() => {
    if (!isLatest) {
      setDisplayed(content)
      return
    }

    // 새 메시지가 들어오면 스트리밍 시작
    setIsStreaming(true)
    setDisplayed('')

    const words = content.split(/(\s+)/)
    let current = ''
    let i = 0

    const interval = setInterval(() => {
      if (i >= words.length) {
        setIsStreaming(false)
        clearInterval(interval)
        return
      }
      // 한 번에 3-5 단어씩 표시 (빠른 느낌)
      const chunk = words.slice(i, i + 3).join('')
      current += chunk
      setDisplayed(current)
      i += 3
    }, 30)

    return () => clearInterval(interval)
  }, [content, isLatest])

  return { displayed, isStreaming }
}

// ─── 메시지 버블 ───────────────────────────────────────────────

interface MessageBubbleProps {
  message: AgentMessage
  isLatest?: boolean
  onEdit?: (id: string, content: string) => void
  onRegenerate?: () => void
}

export default function MessageBubble({ message, isLatest = false, onEdit, onRegenerate }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const isUser = message.role === 'user'

  const { displayed, isStreaming } = useStreamingText(
    message.content,
    isLatest && !isUser
  )

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleEditSubmit() {
    if (editText.trim() && editText !== message.content && onEdit) {
      onEdit(message.id, editText.trim())
    }
    setEditing(false)
  }

  // ─── 문서 카드 메시지 ────────────────────────
  if (message.provider === 'google-workspace' && message.model) {
    const urlMatch = message.content.match(/\[(.+?)\]\((.+?)\)/)
    if (urlMatch) {
      const docResult: DocumentResult = {
        type: message.model as DocumentType,
        id: '', url: urlMatch[2], title: urlMatch[1],
      }
      return (
        <div className="flex items-start gap-3 animate-slide-up">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-white text-[10px] font-bold">IO</span>
          </div>
          <div className="w-72">
            <DocumentCard doc={docResult} />
          </div>
        </div>
      )
    }
  }

  // ─── 사용자 메시지 ─────────────────────────────
  if (isUser) {
    return (
      <div className="flex justify-end group animate-slide-up">
        <div className="max-w-[80%]">
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full min-w-[300px] text-sm border border-violet-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => { setEditing(false); setEditText(message.content) }} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 rounded-lg border border-gray-200">
                  취소
                </button>
                <button onClick={handleEditSubmit} className="px-3 py-1 text-xs text-white bg-violet-600 hover:bg-violet-700 rounded-lg">
                  전송
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-violet-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed">
                <span className="whitespace-pre-wrap">{message.content}</span>
              </div>
              {/* 호버 액션 */}
              <div className="flex justify-end gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleCopy(message.content)} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="복사">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                {onEdit && (
                  <button onClick={() => setEditing(true)} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="편집">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ─── AI 응답 ─────────────────────────────────────
  return (
    <div className="flex items-start gap-3 group animate-slide-up">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-white text-[10px] font-bold">IO</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-800 leading-relaxed">
          <div
            className="prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(displayed) }}
          />
          {/* 스트리밍 커서 */}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-violet-500 ml-0.5 animate-pulse" />
          )}
        </div>

        {/* 액션 버튼 (스트리밍 완료 후) */}
        {!isStreaming && (
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => handleCopy(message.content)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="복사"
            >
              {copied ? <><Check className="h-3 w-3 text-green-500" /> 복사됨</> : <><Copy className="h-3 w-3" /> 복사</>}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="다시 생성"
              >
                <RotateCcw className="h-3 w-3" /> 다시 생성
              </button>
            )}
            <div className="flex items-center gap-0.5 ml-1">
              <button
                onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
                className={`p-1 rounded transition-colors ${feedback === 'up' ? 'text-green-500 bg-green-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                title="좋은 응답"
              >
                <ThumbsUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
                className={`p-1 rounded transition-colors ${feedback === 'down' ? 'text-red-500 bg-red-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                title="개선 필요"
              >
                <ThumbsDown className="h-3 w-3" />
              </button>
            </div>
            {message.provider && (
              <span className="text-[10px] text-gray-300 ml-auto">
                {message.provider} · {message.model}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
