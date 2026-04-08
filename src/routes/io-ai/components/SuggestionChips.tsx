const FOLLOW_UP_SUGGESTIONS: Record<string, { icon: string; text: string }[]> = {
  document: [
    { icon: '📝', text: '문서를 수정해줘' },
    { icon: '📊', text: 'PPT로 만들어줘' },
    { icon: '📤', text: '팀에 공유할 수 있도록 정리해줘' },
  ],
  analysis: [
    { icon: '📈', text: '더 자세히 분석해줘' },
    { icon: '📊', text: '차트로 시각화해줘' },
    { icon: '📋', text: '보고서로 정리해줘' },
  ],
  default: [
    { icon: '🔄', text: '더 자세히 설명해줘' },
    { icon: '📝', text: '문서로 정리해줘' },
    { icon: '💡', text: '다른 관점에서 생각해줘' },
  ],
}

function detectSuggestionType(lastMessage: string): string {
  const lower = lastMessage.toLowerCase()
  if (['보고서', '문서', '기획서', '제안서', '작성'].some((k) => lower.includes(k))) return 'document'
  if (['분석', '데이터', '통계', '비교', '매출'].some((k) => lower.includes(k))) return 'analysis'
  return 'default'
}

export default function SuggestionChips({
  lastAssistantMessage,
  onSelect,
}: {
  lastAssistantMessage: string
  onSelect: (text: string) => void
}) {
  const type = detectSuggestionType(lastAssistantMessage)
  const suggestions = FOLLOW_UP_SUGGESTIONS[type]

  return (
    <div className="flex flex-wrap gap-1.5 animate-fade-in">
      {suggestions.map((s) => (
        <button
          key={s.text}
          onClick={() => onSelect(s.text)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-all"
        >
          <span>{s.icon}</span>
          <span>{s.text}</span>
        </button>
      ))}
    </div>
  )
}
