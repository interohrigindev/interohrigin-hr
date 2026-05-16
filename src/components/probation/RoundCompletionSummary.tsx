import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react'
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

interface CompletionStatus {
  leader: { done: number; required: number }
  executive: { done: number; required: number }
  ceo: { done: number; required: number }
  isComplete: boolean
}

interface RoundCompletionSummaryProps {
  stage: ProbationStage
  status: CompletionStatus
  cached: RoundSummary | null
  loading: boolean
  onAnalyze: () => void
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

/**
 * 회차별 종합 요약본 (Module 4).
 *
 * 표시 조건: 해당 회차에 리더+모든 임원+대표 평가 완료 시 활성화.
 * 미완료 시에는 진행 현황 (X/Y 명)만 표시하고 분석 버튼 비활성화.
 */
export function RoundCompletionSummary({ stage, status, cached, loading, onAnalyze }: RoundCompletionSummaryProps) {
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

      {!status.isComplete ? (
        <div className="p-4 bg-white text-sm text-gray-600">
          <p className="mb-2 font-medium">평가 진행 현황</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <ProgressTile label="리더" done={status.leader.done} required={status.leader.required} />
            <ProgressTile label="임원" done={status.executive.done} required={status.executive.required} />
            <ProgressTile label="대표" done={status.ceo.done} required={status.ceo.required} />
          </div>
          <p className="mt-3 text-xs text-gray-500">모든 평가자가 평가를 완료하면 종합 요약이 활성화됩니다.</p>
        </div>
      ) : cached ? (
        <div className="p-4 bg-white space-y-3">
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
      ) : (
        <div className="p-4 bg-white text-center text-xs text-gray-500">
          평가가 모두 완료되었습니다. "종합 요약 생성" 버튼을 눌러 AI 통합 요약을 받아보세요.
        </div>
      )}
    </div>
  )
}

function ProgressTile({ label, done, required }: { label: string; done: number; required: number }) {
  const isOk = done >= required && required > 0
  return (
    <div className={`text-center px-2 py-1.5 rounded ${isOk ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
      <div className="font-semibold">{label}</div>
      <div className="text-[11px] mt-0.5">{done}/{required}</div>
    </div>
  )
}
