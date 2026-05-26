/**
 * ArticleContent — 간단한 마크다운 렌더러
 *
 * 의존성 없이 직접 파싱:
 *  - ## 헤더 → h3
 *  - **굵게**
 *  - · 또는 - 리스트
 *  - > 블록 인용
 *  - 빈 줄 → 단락
 *  - 줄 안의 백틱 `code`
 */
import { Fragment } from 'react'

interface ArticleContentProps {
  content: string
}

export function ArticleContent({ content }: ArticleContentProps) {
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let listBuffer: string[] = []
  let quoteBuffer: string[] = []
  let paragraphBuffer: string[] = []

  const flushList = () => {
    if (listBuffer.length === 0) return
    blocks.push(
      <ul key={`list-${blocks.length}`} className="space-y-1 mb-3 text-sm text-gray-700">
        {listBuffer.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-gray-400 select-none">·</span>
            <span className="flex-1">{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    )
    listBuffer = []
  }
  const flushQuote = () => {
    if (quoteBuffer.length === 0) return
    blocks.push(
      <blockquote
        key={`quote-${blocks.length}`}
        className="border-l-4 border-brand-300 bg-brand-50/50 pl-3 py-2 mb-3 text-sm text-gray-700 italic"
      >
        {quoteBuffer.map((l, i) => (
          <p key={i}>{renderInline(l)}</p>
        ))}
      </blockquote>
    )
    quoteBuffer = []
  }
  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return
    blocks.push(
      <p key={`p-${blocks.length}`} className="text-sm text-gray-700 mb-3 leading-relaxed">
        {paragraphBuffer.map((l, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {renderInline(l)}
          </Fragment>
        ))}
      </p>
    )
    paragraphBuffer = []
  }
  const flushAll = () => { flushList(); flushQuote(); flushParagraph() }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    // 헤더
    if (line.startsWith('## ')) {
      flushAll()
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="text-base font-bold text-gray-900 mt-4 mb-2">
          {renderInline(line.slice(3))}
        </h3>
      )
      continue
    }

    // 리스트 (· 또는 -)
    if (/^[·\-•]\s+/.test(line)) {
      flushQuote(); flushParagraph()
      listBuffer.push(line.replace(/^[·\-•]\s+/, ''))
      continue
    }

    // 숫자 리스트
    if (/^\d+\.\s+/.test(line)) {
      flushQuote(); flushParagraph()
      listBuffer.push(line.replace(/^\d+\.\s+/, ''))
      continue
    }

    // 인용
    if (line.startsWith('> ')) {
      flushList(); flushParagraph()
      quoteBuffer.push(line.slice(2))
      continue
    }

    // 빈 줄 — flush
    if (line.trim() === '') {
      flushAll()
      continue
    }

    // 일반 단락
    flushList(); flushQuote()
    paragraphBuffer.push(line)
  }
  flushAll()

  return <div className="article-content">{blocks}</div>
}

/**
 * 인라인 렌더링: **굵게**, `코드` 처리
 */
function renderInline(text: string): React.ReactNode {
  // **굵게** + `코드` 동시 처리
  // 단순 정규식 — 중첩 미지원이지만 본 매뉴얼에선 충분
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`)/

  while (remaining.length > 0) {
    const match = remaining.match(pattern)
    if (!match) {
      parts.push(remaining)
      break
    }
    const idx = match.index ?? 0
    if (idx > 0) parts.push(remaining.slice(0, idx))
    if (match[2]) {
      parts.push(<strong key={key++} className="font-semibold text-gray-900">{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-gray-100 text-xs font-mono text-gray-800">
          {match[3]}
        </code>
      )
    }
    remaining = remaining.slice(idx + match[1].length)
  }

  return <>{parts}</>
}
