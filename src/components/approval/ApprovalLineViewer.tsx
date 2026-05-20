/**
 * 결재선 보기 컴포넌트 (편집 불가)
 *  - 직원 신청 다이얼로그 미리보기
 *  - 결재 상세 진행 흐름 표시
 *  - 결재 양식 미리보기
 *
 * 옵션 B (세로 타임라인) 디자인:
 *  ●────  ① 강제묵 (리더)              [대기 / 진행중 / 승인 / 반려]
 *  │
 *  ●────  ② 이민지 (인사담당)
 *  │       💬 "확인 후 진행" (코멘트)
 *  │
 *  ●────  ③ 오영근 (대표)
 */
import { Check, X, Clock, User, Send } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export type StepStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled' | 'skipped'
export type ApprovalActionType = 'approve' | 'consult' | 'reference'

export interface ApprovalLineStep {
  step?: number
  role_label: string   // 한글 라벨 (예: '리더', '인사담당', '이사/임원')
  approver_id?: string
  approver_name: string
  approver_position?: string | null
  approver_avatar_url?: string | null
  status?: StepStatus
  action_type?: ApprovalActionType  // 결재/합의/참조
  acted_at?: string | null
  comment?: string | null
}

interface ApprovalLineViewerProps {
  requesterName?: string  // 신청자 이름 (있으면 맨 위 노출)
  steps: ApprovalLineStep[]
  currentStepIndex?: number  // 0-based 현재 결재 진행 위치
  showStatus?: boolean       // 상태 뱃지 노출 여부 (기본 true)
  compact?: boolean          // 좁은 영역용 작은 사이즈
}

const ACTION_TYPE_LABEL: Record<ApprovalActionType, string> = {
  approve: '결재',
  consult: '합의',
  reference: '참조',
}

const ACTION_TYPE_COLOR: Record<ApprovalActionType, string> = {
  approve: 'bg-brand-100 text-brand-700',
  consult: 'bg-blue-100 text-blue-700',
  reference: 'bg-gray-100 text-gray-600',
}

function StatusBadge({ status }: { status?: StepStatus }) {
  if (!status || status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
        <Clock className="h-2.5 w-2.5" /> 대기
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
        <Clock className="h-2.5 w-2.5 animate-pulse" /> 진행중
      </span>
    )
  }
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
        <Check className="h-2.5 w-2.5" /> 승인
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold">
        <X className="h-2.5 w-2.5" /> 반려
      </span>
    )
  }
  if (status === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">
        <X className="h-2.5 w-2.5" /> 회수됨
      </span>
    )
  }
  if (status === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">
        건너뜀
      </span>
    )
  }
  return null
}

function StepDot({ status, current }: { status?: StepStatus; current?: boolean }) {
  const base = 'h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ring-4'
  if (status === 'approved') return <div className={`${base} bg-emerald-500 ring-emerald-100`}><Check className="h-4 w-4" /></div>
  if (status === 'rejected') return <div className={`${base} bg-rose-500 ring-rose-100`}><X className="h-4 w-4" /></div>
  if (status === 'cancelled') return <div className={`${base} bg-gray-300 ring-gray-100`}><X className="h-4 w-4" /></div>
  if (status === 'in_progress' || current) return <div className={`${base} bg-blue-500 ring-blue-100 animate-pulse`}><Clock className="h-4 w-4" /></div>
  return <div className={`${base} bg-gray-300 ring-gray-100`}><User className="h-4 w-4" /></div>
}

export function ApprovalLineViewer({
  requesterName,
  steps,
  currentStepIndex,
  showStatus = true,
  compact = false,
}: ApprovalLineViewerProps) {
  if (steps.length === 0) {
    return (
      <div className="text-center text-xs text-gray-400 py-4">
        결재 단계가 없습니다
      </div>
    )
  }

  // 자동 현재 단계 추론: 명시되지 않으면 pending/in_progress 인 첫 단계
  const inferredCurrent = currentStepIndex ?? steps.findIndex((s) => !s.status || s.status === 'pending' || s.status === 'in_progress')

  return (
    <div className={`relative ${compact ? 'space-y-1' : 'space-y-3'}`}>
      {/* 신청자 헤더 */}
      {requesterName && (
        <div className="flex items-center gap-3 relative">
          <div className={`${compact ? 'h-7 w-7' : 'h-8 w-8'} rounded-full bg-brand-500 text-white flex items-center justify-center ring-4 ring-brand-100 shrink-0`}>
            <Send className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-500">신청자</div>
            <div className="text-sm font-semibold text-gray-900">{requesterName}</div>
          </div>
        </div>
      )}

      {steps.map((step, idx) => {
        const isCurrent = idx === inferredCurrent
        const isLast = idx === steps.length - 1
        const actionType = step.action_type || 'approve'
        return (
          <div key={idx} className="flex gap-3 relative">
            {/* 좌측 도트 + 연결선 */}
            <div className="flex flex-col items-center shrink-0">
              <StepDot status={step.status} current={isCurrent} />
              {!isLast && <div className="w-0.5 flex-1 bg-gray-200 mt-1 min-h-[20px]" />}
            </div>

            {/* 우측 정보 */}
            <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-2'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-gray-400 font-mono">{idx + 1}.</span>
                <span className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-gray-900`}>
                  {step.approver_name}
                </span>
                <span className="text-xs text-gray-500">— {step.role_label}</span>
                {step.action_type && step.action_type !== 'approve' && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ACTION_TYPE_COLOR[actionType]}`}>
                    {ACTION_TYPE_LABEL[actionType]}
                  </span>
                )}
                {showStatus && <StatusBadge status={step.status} />}
              </div>

              {/* 코멘트 + 처리 시각 */}
              {step.comment && (
                <div className="text-xs text-gray-600 mt-1 bg-gray-50 rounded px-2 py-1 inline-block break-keep">
                  💬 {step.comment}
                </div>
              )}
              {step.acted_at && (
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {formatDate(step.acted_at, 'yyyy.MM.dd HH:mm')}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
