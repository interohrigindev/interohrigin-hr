/**
 * Smart AI Router — 메시지 분석 → 최적 AI Provider 자동 선택
 */
import { supabase } from '@/lib/supabase'
import type { AIConfig } from '@/lib/ai-client'

export type TaskType =
  | 'document_generation'
  | 'data_analysis'
  | 'code_generation'
  | 'creative_writing'
  | 'summarization'
  | 'translation'
  | 'general_chat'

// ─── 키워드 기반 작업 분류 ──────────────────────────────────────

const TASK_PATTERNS: { type: TaskType; keywords: string[] }[] = [
  {
    type: 'document_generation',
    keywords: [
      'ppt', 'PPT', '슬라이드', '프레젠테이션', '보고서 작성', '문서 작성',
      '기획서', '제안서', '회의록 작성', '스프레드시트', '엑셀', '표 만들어',
      '템플릿', '양식', '레포트 작성', '초안 작성', '문서화',
    ],
  },
  {
    type: 'data_analysis',
    keywords: [
      '분석해', '데이터', '차트', '통계', '트렌드', '비교해',
      '시장 조사', '경쟁사', '매출', '성과 분석', '지표', 'KPI',
      '수치', '그래프', '인사이트', '벤치마크',
    ],
  },
  {
    type: 'code_generation',
    keywords: [
      '코드', '함수', 'API', '스크립트', '프로그래밍', '개발',
      '구현해', '자동화', 'SQL', 'JavaScript', 'Python', '쿼리',
    ],
  },
  {
    type: 'creative_writing',
    keywords: [
      '브레인스토밍', '아이디어', '카피', '슬로건', '마케팅 문구',
      '콘텐츠', '기획', '전략', '네이밍', '컨셉',
    ],
  },
  {
    type: 'summarization',
    keywords: [
      '요약해', '정리해', '핵심만', '간단하게', '축약',
    ],
  },
  {
    type: 'translation',
    keywords: [
      '번역', 'translate', '영어로', '한국어로', '일본어로', '중국어로',
    ],
  },
]

export function classifyTask(message: string): TaskType {
  const lower = message.toLowerCase()
  for (const { type, keywords } of TASK_PATTERNS) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return type
    }
  }
  return 'general_chat'
}

// ─── Provider 우선순위 ──────────────────────────────────────────

const PROVIDER_PRIORITY: Record<TaskType, string[]> = {
  document_generation: ['claude', 'gemini', 'openai'],
  data_analysis: ['gemini', 'claude', 'openai'],
  code_generation: ['claude', 'openai', 'gemini'],
  creative_writing: ['claude', 'openai', 'gemini'],
  summarization: ['gemini', 'claude', 'openai'],
  translation: ['gemini', 'claude', 'openai'],
  general_chat: ['gemini', 'claude', 'openai'],
}

const TASK_LABELS: Record<TaskType, string> = {
  document_generation: '문서 생성',
  data_analysis: '데이터 분석',
  code_generation: '코드 생성',
  creative_writing: '크리에이티브',
  summarization: '요약',
  translation: '번역',
  general_chat: '일반 대화',
}

export function getTaskLabel(taskType: TaskType): string {
  return TASK_LABELS[taskType]
}

// ─── 활성 Provider 목록 조회 ────────────────────────────────────

export async function getAllActiveProviders(): Promise<AIConfig[]> {
  const { data } = await supabase
    .from('ai_settings')
    .select('provider, api_key, model')
    .eq('is_active', true)
    .neq('provider', 'deepgram')

  if (!data) return []
  return data.map((s) => ({
    provider: s.provider,
    apiKey: s.api_key,
    model: s.model,
  }))
}

// ─── 최적 Provider 선택 ─────────────────────────────────────────

export function selectOptimalProvider(
  taskType: TaskType,
  available: AIConfig[]
): AIConfig | null {
  const priority = PROVIDER_PRIORITY[taskType]

  for (const preferred of priority) {
    const match = available.find((a) => a.provider === preferred)
    if (match) return match
  }

  // 어떤 것이든 사용 가능한 것
  return available[0] || null
}

// ─── 통합: 메시지 → 최적 Provider ──────────────────────────────

export async function routeMessage(message: string): Promise<{
  config: AIConfig | null
  taskType: TaskType
}> {
  const taskType = classifyTask(message)
  const available = await getAllActiveProviders()
  const config = selectOptimalProvider(taskType, available)
  return { config, taskType }
}
