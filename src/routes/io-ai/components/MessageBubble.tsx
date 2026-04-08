import DOMPurify from 'dompurify'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import type { AgentMessage } from '@/types/ai-agent'

function renderMarkdown(text: string): string {
  let html = text
    // 코드블록 (``` ... ```)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
      const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()
      return `<div class="my-2 rounded-lg overflow-hidden border border-gray-200">
        <div class="flex items-center justify-between px-3 py-1.5 bg-gray-800 text-gray-400 text-[10px] font-mono">${lang || 'code'}</div>
        <pre class="px-3 py-2.5 bg-gray-900 text-gray-100 text-xs leading-relaxed overflow-x-auto"><code>${escapedCode}</code></pre>
      </div>`
    })
    // 인라인 코드
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-gray-100 text-violet-700 rounded text-xs font-mono">$1</code>')
    // 헤딩
    .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-bold text-gray-800 mt-3 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-gray-800 mt-3 mb-1.5 flex items-center gap-1.5"><span class="w-1 h-4 bg-violet-500 rounded-full inline-block"></span>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-gray-900 mt-4 mb-2 pb-1 border-b border-gray-200">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-gray-900 mt-3 mb-2">$1</h1>')
    // 볼드 / 이탤릭
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 체크박스 리스트
    .replace(/^- \[ \] (.+)$/gm, '<li class="flex items-start gap-2 py-0.5"><span class="text-gray-400 mt-0.5">☐</span><span>$1</span></li>')
    .replace(/^- \[x\] (.+)$/gm, '<li class="flex items-start gap-2 py-0.5"><span class="text-green-500 mt-0.5">☑</span><span>$1</span></li>')
    // 특수 불릿
    .replace(/^- ✅ (.+)$/gm, '<li class="flex items-start gap-2 py-0.5 px-2 bg-green-50 rounded"><span>✅</span><span>$1</span></li>')
    .replace(/^- ⚠️ (.+)$/gm, '<li class="flex items-start gap-2 py-0.5 px-2 bg-amber-50 rounded"><span>⚠️</span><span>$1</span></li>')
    .replace(/^- 💡 (.+)$/gm, '<li class="flex items-start gap-2 py-0.5 px-2 bg-blue-50 rounded"><span>💡</span><span>$1</span></li>')
    // 일반 불릿
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-2 py-0.5"><span class="text-violet-500 mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-violet-400 inline-block"></span><span>$1</span></li>')
    // 번호 리스트
    .replace(/^(\d+)\. (.+)$/gm, '<li class="flex items-start gap-2 py-0.5"><span class="text-violet-600 font-semibold shrink-0 w-5 text-right">$1.</span><span>$2</span></li>')
    // 테이블
    .replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line.split('|').filter(c => c.trim())
      if (cells.every(c => /^[\s-:]+$/.test(c))) return '<tr class="border-b border-gray-200"></tr>'
      const isHeader = false
      const tag = isHeader ? 'th' : 'td'
      const cellsHtml = cells.map(c => `<${tag} class="px-3 py-1.5 text-xs text-gray-700 border-b border-gray-100">${c.trim()}</${tag}>`).join('')
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

  return DOMPurify.sanitize(html, { ADD_TAGS: ['style'], ADD_ATTR: ['class', 'style'] })
}

export default function MessageBubble({ message }: { message: AgentMessage }) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  function handleCopy() {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isUser) {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-[80%] bg-violet-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed">
          <span className="whitespace-pre-wrap">{message.content}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5 group animate-slide-up">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-white text-[10px] font-bold">IO</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-gray-800 leading-relaxed">
          <div
            className="prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        </div>
        {/* 복사 버튼 */}
        <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-gray-400 hover:text-gray-600 rounded"
          >
            {copied ? <><Check className="h-3 w-3" /> 복사됨</> : <><Copy className="h-3 w-3" /> 복사</>}
          </button>
          {message.provider && (
            <span className="text-[10px] text-gray-300">
              {message.provider} · {message.model}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
