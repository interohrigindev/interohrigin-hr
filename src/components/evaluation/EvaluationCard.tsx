import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { SCORE_LABELS } from '@/lib/constants'
import type { EvalPhase } from '@/hooks/useSelfEvaluation'
import { CheckCircle, Sparkles, RefreshCw } from 'lucide-react'
import { generateAIContentSafe } from '@/lib/ai-client'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface EvaluationCardData {
  personal_goal: string
  achievement_method: string
  self_comment: string
  score: number | null
}

interface EvaluationCardProps {
  index: number
  itemId?: string
  name: string
  description: string | null
  maxScore: number
  data: EvaluationCardData
  onChange: (data: EvaluationCardData) => void
  readOnly?: boolean
  phase?: EvalPhase
  /** 팀/부서명 (예: "개발팀", "디자인팀") — AI 예시를 팀 맥락에 맞게 생성하기 위함 */
  teamKey?: string | null
  /** 직무명 (예: "개발자", "디자이너") — 추가 컨텍스트 */
  jobTitle?: string | null
  /** 평가 유형 — 'quantitative' / 'qualitative' / 'mixed' */
  evalType?: 'quantitative' | 'qualitative' | 'mixed' | null
}

export function EvaluationCard({
  index,
  itemId,
  name,
  description,
  maxScore,
  data,
  onChange,
  readOnly,
  phase,
  teamKey,
  jobTitle,
  evalType,
}: EvaluationCardProps) {
  const { profile } = useAuth()
  const effectivePhase = phase ?? (readOnly ? 'readonly' : undefined)

  const isGoalPhase = effectivePhase === 'goal_setting'
  const isEvalPhase = effectivePhase === 'quarterly_eval'
  const isFullReadOnly = effectivePhase === 'readonly' || readOnly

  // 자동 노출되는 AI 예시 목표 (캐시 기반)
  const [aiExamples, setAiExamples] = useState<string[]>([])
  const [aiGenerating, setAiGenerating] = useState(false)

  // 팀별로 캐시 분리 — 같은 항목이라도 팀에 따라 예시 톤·기준이 다름
  const cacheTeamKey = (teamKey && teamKey.trim().length > 0) ? teamKey.trim() : 'default'

  // 마운트 시 캐시 로드 (팀별 → 'default' 폴백) → 모두 없으면 자동 생성
  useEffect(() => {
    if (!isGoalPhase || !itemId || isFullReadOnly) return
    let cancelled = false
    ;(async () => {
      // 1차: 팀별 캐시
      const { data: teamCached } = await supabase
        .from('evaluation_item_examples')
        .select('examples')
        .eq('item_id', itemId)
        .eq('team_key', cacheTeamKey)
        .maybeSingle()
      if (cancelled) return
      const teamList = ((teamCached?.examples as string[] | null) || []).filter((s) => typeof s === 'string')
      if (teamList.length > 0) {
        setAiExamples(teamList)
        return
      }
      // 2차: default 캐시 (관리자가 사전 생성한 베이스라인)
      if (cacheTeamKey !== 'default') {
        const { data: defCached } = await supabase
          .from('evaluation_item_examples')
          .select('examples')
          .eq('item_id', itemId)
          .eq('team_key', 'default')
          .maybeSingle()
        if (cancelled) return
        const defList = ((defCached?.examples as string[] | null) || []).filter((s) => typeof s === 'string')
        if (defList.length > 0) {
          setAiExamples(defList)
          return
        }
      }
      // 3차: 둘 다 없음 → 즉석 생성 후 팀별 캐시 저장
      await generateAndCache()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, isGoalPhase, isFullReadOnly, cacheTeamKey])

  async function generateAndCache(force = false) {
    if (!itemId) return
    setAiGenerating(true)
    try {
      // 평가 유형별 가이드라인 분기
      const typeGuide = (() => {
        if (evalType === 'quantitative') {
          return `[평가 유형: 정량평가]
- 반드시 **구체적인 숫자/수치 기준** 포함 (예: "월 N건", "OO% 이상", "OO일 이내")
- 측정 단위가 명확해야 함 (건수, 비율, 시간, 금액 등)
- 달성 여부를 객관적으로 확인 가능한 KPI 형태`
        }
        if (evalType === 'qualitative') {
          return `[평가 유형: 정성평가]
- 정성적인 목표지만 **객관적으로 판단 가능한 기준** 포함
- "어떤 행동/태도/산출물로 확인 가능한지" 명시 (예: "팀 회의에서 OO 제안", "분기 1회 OO 보고서 작성")
- 모호한 형용사("열심히", "잘") 대신 행동 중심 표현 사용`
        }
        return `[평가 유형: 혼합]
- 가능하면 수치 기준을 포함하되, 정량화 어려운 부분은 객관적으로 판단 가능한 행동 기준으로 작성`
      })()

      const teamCtx = (teamKey && teamKey.trim().length > 0) ? `\n- 소속 팀: ${teamKey}` : ''
      const jobCtx = (jobTitle && jobTitle.trim().length > 0) ? `\n- 직무: ${jobTitle}` : ''

      const prompt = `당신은 조직 성과관리 코치입니다. 아래 평가 항목에 대해, 자기평가 단계에서 직원이 작성할 수 있는 **분기 목표 예시** 3가지를 한국어로 제안해 주세요.

[평가 항목]
- 이름: ${name}
- 설명: ${description || '(설명 없음)'}
- 만점: ${maxScore}점${teamCtx}${jobCtx}

${typeGuide}

[공통 규칙]
- 각 목표는 1~2문장, 60자 이내로 간결하게
- 결정형이 아닌 제안형/권장형 (예: "~을 OO회 진행한다", "~을 정리한다")
- 해당 팀·직무 맥락에 맞춰 현실적이고 실무적이게
- 직원이 골라서 자신의 생각과 구체 목표를 덧붙일 시작점 역할

[출력 형식]
각 줄을 "- " 으로 시작하는 마크다운 목록으로만 출력. 그 외 안내·인사·서론·결론 일체 금지.`

      const res = await generateAIContentSafe('goal_examples', prompt, { maxAttempts: 2 })
      if (!res.success || !res.content.trim()) {
        setAiGenerating(false)
        return
      }
      const lines = res.content
        .split('\n')
        .map((l) => l.replace(/^[\s\-•·*0-9.]+/, '').trim())
        .filter((l) => l.length > 0 && l.length < 200)
        .slice(0, 3)
      if (lines.length === 0) {
        setAiGenerating(false)
        return
      }
      setAiExamples(lines)
      // 캐시 저장 (UPSERT — item_id + team_key 단위)
      if (force) {
        await supabase.from('evaluation_item_examples')
          .update({ examples: lines, generated_at: new Date().toISOString(), generated_by: profile?.id })
          .eq('item_id', itemId)
          .eq('team_key', cacheTeamKey)
      } else {
        await supabase.from('evaluation_item_examples').insert({
          item_id: itemId,
          team_key: cacheTeamKey,
          examples: lines,
          generated_by: profile?.id || null,
        })
      }
    } finally {
      setAiGenerating(false)
    }
  }

  function applySuggestion(text: string) {
    if (data.personal_goal.trim().length > 0) {
      if (!confirm('현재 입력한 목표를 이 예시로 교체하시겠습니까? (이후 직접 수정 가능)')) return
    }
    update({ personal_goal: text })
  }

  const isComplete = (() => {
    if (isGoalPhase) {
      return data.personal_goal.trim() !== '' && data.achievement_method.trim() !== ''
    }
    if (isEvalPhase) {
      return data.score != null && data.self_comment.trim() !== ''
    }
    return (
      data.score != null &&
      data.personal_goal.trim() !== '' &&
      data.achievement_method.trim() !== '' &&
      data.self_comment.trim() !== ''
    )
  })()

  function update(patch: Partial<EvaluationCardData>) {
    onChange({ ...data, ...patch })
  }

  return (
    <div
      className={cn(
        'rounded-xl bg-white p-5 transition-colors',
        isComplete
          ? 'border-2 border-brand-200 shadow-sm'
          : 'border-2 border-dashed border-gray-200'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">
            {index}. {name}
          </span>
          <Badge variant="primary">{maxScore}점 만점</Badge>
          {isComplete && <CheckCircle className="h-4 w-4 text-emerald-500" />}
        </div>
      </div>

      {/* Description */}
      {description && (
        <div className="mb-4 rounded-lg bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-600 leading-relaxed">{description}</p>
        </div>
      )}

      {/* Textareas */}
      <div className="space-y-4 mb-4">
        {/* 목표 + 달성방법 */}
        <div>
          <Textarea
            label="🎯 나의 목표"
            placeholder="이 항목에서 달성하고자 하는 구체적인 목표를 작성하세요"
            rows={3}
            value={data.personal_goal}
            onChange={(e) => update({ personal_goal: e.target.value })}
            disabled={isFullReadOnly || isEvalPhase}
          />

          {/* 자동 노출되는 AI 예시 목표 — goal_setting 단계에서만 */}
          {isGoalPhase && !isFullReadOnly && (
            <div className="mt-2">
              {aiGenerating && aiExamples.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 px-2 py-3 bg-gray-50 rounded-md">
                  <Sparkles className="h-3 w-3 animate-pulse" />
                  AI 가 이 항목 설명을 분석해 예시 목표를 준비하고 있습니다…
                </div>
              ) : aiExamples.length > 0 ? (
                <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-brand-700 inline-flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      AI 예시 — 클릭해서 적용 후 자신의 생각·구체 목표를 덧붙여주세요
                    </p>
                    <button
                      type="button"
                      onClick={() => generateAndCache(true)}
                      disabled={aiGenerating}
                      className="text-[11px] text-gray-400 hover:text-brand-600 inline-flex items-center gap-0.5 disabled:opacity-50"
                      title="AI 예시 새로 생성"
                    >
                      <RefreshCw className={cn('h-3 w-3', aiGenerating && 'animate-spin')} />
                      재생성
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {aiExamples.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => applySuggestion(s)}
                        className="block w-full text-left text-xs text-gray-700 bg-white hover:bg-brand-50 hover:border-brand-300 border border-gray-200 rounded-md px-3 py-2 transition-colors"
                      >
                        <span className="text-brand-500 font-bold mr-1">{i + 1}.</span>
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2">※ AI 제안은 결정이 아닌 권장입니다. 본인 직무·상황에 맞게 수정해서 활용해주세요.</p>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <Textarea
          label="🔧 달성 방법"
          placeholder="목표를 달성하기 위한 구체적인 방법과 전략을 작성하세요"
          rows={3}
          value={data.achievement_method}
          onChange={(e) => update({ achievement_method: e.target.value })}
          disabled={isFullReadOnly || isEvalPhase}
        />

        {/* 자기평가 코멘트 */}
        {!isGoalPhase && (
          <Textarea
            label="💬 자기평가 코멘트"
            placeholder="자기평가에 대한 의견을 작성하세요"
            rows={3}
            value={data.self_comment}
            onChange={(e) => update({ self_comment: e.target.value })}
            disabled={isFullReadOnly}
          />
        )}
      </div>

      {/* Score */}
      {!isGoalPhase && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">⭐ 점수</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {Array.from({ length: maxScore }, (_, i) => i + 1).map((score) => (
              <button
                key={score}
                type="button"
                disabled={isFullReadOnly}
                onClick={() => update({ score })}
                title={SCORE_LABELS[score]}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                  data.score === score
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-brand-50 hover:text-brand-600',
                  isFullReadOnly && 'cursor-not-allowed opacity-50'
                )}
              >
                {score}
              </button>
            ))}
            {data.score != null && (
              <span className="ml-2 text-sm text-gray-500">{SCORE_LABELS[data.score]}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
