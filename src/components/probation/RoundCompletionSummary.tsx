import { Sparkles, Loader2, CheckCircle2, Mail, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ProbationStage } from '@/types/employee-lifecycle'

const STAGE_SHORT: Record<ProbationStage, string> = {
  round1: '1회차',
  round2: '2회차',
  round3: '3회차',
}

export interface RoundSummary {
  consensus: string
  strengths: string[]
  cautions: string[]
  recommendation: 'continue' | 'warning' | 'terminate'
  recommendationReason: string
}

export interface EvaluatorStatus {
  id: string
  name: string
  email: string | null
  position: string | null
  role: 'leader' | 'executive' | 'ceo'
  done: boolean
}

interface CompletionStatus {
  leader: { done: number; required: number }
  executive: { done: number; required: number }
  ceo: { done: number; required: number }
  evaluators: EvaluatorStatus[]
  isComplete: boolean
}

interface RoundCompletionSummaryProps {
  stage: ProbationStage
  status: CompletionStatus
  cached: RoundSummary | null
  loading: boolean
  onAnalyze: () => void
  canSendReminder?: boolean
  sendingTo?: string | null
  onSendReminder?: (evaluator: EvaluatorStatus) => void
}

const REC_LABELS: Record<RoundSummary['recommendation'], string> = {
  continue: '계속 근무',
  warning: '경고/주의',
  terminate: '수습 종료',
}

const REC_STYLES: Record<RoundSummary['recommendation'], string> = {
  continue: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  terminate: 'bg-red-100 text-red-700',
}

const ROLE_LABEL: Record<EvaluatorStatus['role'], string> = {
  leader: '리더',
  executive: '임원',
  ceo: '대표',
}

/**
 * 회차별 종합 요약본 (Module 4).
 *
 * 표시 조건: 해당 회차에 리더+모든 임원+대표 평가 완료 시 활성화.
 * 미완료 시에는 진행 현황 (X/Y 명)만 표시하고 분석 버튼 비활성화.
 */
export function RoundCompletionSummary({
  stage,
  status,
  cached,
  loading,
  onAnalyze,
  canSendReminder,
  sendingTo,
  onSendReminder,
}: RoundCompletionSummaryProps) {
  return (
    <div className="border-2 border-brand-300 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-gradient-to-r from-brand-50 to-purple-50 px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-semibold text-brand-900">{STAGE_SHORT[stage]} 종합 요약 (전체 평가자 통합)</span>
          {status.isComplete && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> 평가 완료
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onAnalyze}
          disabled={!status.isComplete || loading}
        >
          {loading
            ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 분석 중...</>
            : <><Sparkles className="h-3 w-3 mr-1" /> {cached ? '다시 분석' : '종합 요약 생성'}</>}
        </Button>
      </div>

      <div className="p-4 bg-white">
        {/* 진행 카운트 타일 */}
        <p className="text-sm font-medium text-gray-700 mb-2">평가 진행 현황</p>
        <div className="grid grid-cols-3 gap-2 text-xs mb-3">
          <ProgressTile label="리더" done={status.leader.done} required={status.leader.required} />
          <ProgressTile label="임원" done={status.executive.done} required={status.executive.required} />
          <ProgressTile label="대표" done={status.ceo.done} required={status.ceo.required} />
        </div>

        {/* 평가자별 상세 (이름 + 진행 상태 + 관리자용 독려 버튼) */}
        {status.evaluators.length > 0 ? (
          <div className="space-y-2">
            {(['leader', 'executive', 'ceo'] as const).map((roleKey) => {
              const list = status.evaluators.filter((e) => e.role === roleKey)
              if (list.length === 0) return null
              return (
                <div key={roleKey} className="border border-gray-200 rounded-md">
                  <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-700 border-b border-gray-200">
                    {ROLE_LABEL[roleKey]} ({list.filter((e) => e.done).length}/{list.length})
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {list.map((ev) => (
                      <li key={ev.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          {ev.done ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          ) : (
                            <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                          )}
                          <span className="font-medium text-gray-900 truncate">{ev.name}</span>
                          {ev.position && <span className="text-xs text-gray-500 truncate">{ev.position}</span>}
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                            ev.done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {ev.done ? '완료' : '미완료'}
                          </span>
                        </div>
                        {!ev.done && canSendReminder && onSendReminder && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onSendReminder(ev)}
                            disabled={!ev.email || sendingTo === ev.id}
                            className="ml-2 shrink-0"
                          >
                            {sendingTo === ev.id ? (
                              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 발송중</>
                            ) : (
                              <><Mail className="h-3 w-3 mr-1" /> 독려 발송</>
                            )}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-500">평가자 정보가 없습니다.</p>
        )}

        {!status.isComplete && (
          <p className="mt-3 text-xs text-gray-500">모든 평가자가 평가를 완료하면 종합 요약이 활성화됩니다.</p>
        )}
      </div>

      {status.isComplete && cached && (
        <div className="p-4 bg-white border-t border-gray-100 space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-700 mb-1.5">📋 종합 의견</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{cached.consensus}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-emerald-800 mb-1.5">✓ 공통 강점</p>
              <ul className="space-y-1 text-sm text-gray-700">
                {cached.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5"><span className="text-emerald-500 mt-0.5">•</span><span>{s}</span></li>
                ))}
              </ul>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-800 mb-1.5">△ 주의 사항</p>
              <ul className="space-y-1 text-sm text-gray-700">
                {cached.cautions.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5"><span className="text-amber-500 mt-0.5">•</span><span>{s}</span></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-3 bg-white">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-gray-700">최종 권고:</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${REC_STYLES[cached.recommendation]}`}>
                {REC_LABELS[cached.recommendation]}
              </span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{cached.recommendationReason}</p>
          </div>
        </div>
      )}

      {status.isComplete && !cached && (
        <div className="p-4 bg-white border-t border-gray-100 text-center text-xs text-gray-500">
          평가가 모두 완료되었습니다. "종합 요약 생성" 버튼을 눌러 AI 통합 요약을 받아보세요.
        </div>
      )}
    </div>
  )
}

function ProgressTile({ label, done, required }: { label: string; done: number; required: number }) {
  const isOk = done >= required
  return (
    <div className={`text-center px-2 py-1.5 rounded ${isOk ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
      <div className="font-semibold">{label}</div>
      <div className="text-[11px] mt-0.5">{done}/{required}</div>
    </div>
  )
}
