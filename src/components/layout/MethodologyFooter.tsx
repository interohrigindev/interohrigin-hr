import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Info } from 'lucide-react'

interface MethodologyFooterProps {
  mode: 'compact' | 'expanded'
}

function MethodologyDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="평가 방법론 안내"
      className="max-w-2xl max-h-[80vh] overflow-y-auto"
    >
      <div className="space-y-5 text-sm text-gray-700 leading-relaxed">
        {/* 다면평가 정의 */}
        <section>
          <h3 className="font-semibold text-gray-900 mb-1">
            다면평가(360° Feedback)란?
          </h3>
          <p>
            다면평가는 한 명의 평가자가 아닌, 상사·동료·본인 등 다양한 관점에서
            업무 역량과 성과를 종합적으로 평가하는 방법론입니다. 단일 평가자의
            주관적 편향을 줄이고, 보다 공정하고 입체적인 평가 결과를 도출합니다.
          </p>
        </section>

        {/* 국내외 사례 */}
        <section>
          <h3 className="font-semibold text-gray-900 mb-1">
            국내외 적용 사례
          </h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>GE (Session C)</strong> — 다단계 리더십 평가 및 피드백
              체계 운영
            </li>
            <li>
              <strong>Google (OKR + Peer Review)</strong> — 목표 기반 성과 관리와
              동료 평가 병행
            </li>
            <li>
              <strong>삼성 (다면평가제)</strong> — 상사·동료·부하 등 복수 평가자
              참여
            </li>
            <li>
              <strong>SK (역량평가체계)</strong> — 역량 중심 다면평가와 성과
              연계
            </li>
          </ul>
        </section>

        {/* 본 시스템 평가 구조 */}
        <section>
          <h3 className="font-semibold text-gray-900 mb-1">
            본 시스템의 평가 구조
          </h3>
          <p className="mb-2">
            본 시스템은 4단계 다면평가 프로세스를 따릅니다:
          </p>
          <div className="flex items-center gap-2 flex-wrap text-xs font-medium">
            <span className="rounded-full bg-blue-100 text-blue-800 px-3 py-1">
              ① 자기평가
            </span>
            <span className="text-gray-400">→</span>
            <span className="rounded-full bg-green-100 text-green-800 px-3 py-1">
              ② 리더 평가
            </span>
            <span className="text-gray-400">→</span>
            <span className="rounded-full bg-purple-100 text-purple-800 px-3 py-1">
              ③ 이사 평가
            </span>
            <span className="text-gray-400">→</span>
            <span className="rounded-full bg-amber-100 text-amber-800 px-3 py-1">
              ④ 대표이사 최종 평가
            </span>
          </div>
        </section>

        {/* 정량/정성 구분 */}
        <section>
          <h3 className="font-semibold text-gray-900 mb-1">
            정량 · 정성 평가 구분
          </h3>
          <p>
            평가항목은 <strong>정량 평가</strong>(수치 기반, 객관적 성과 지표)와{' '}
            <strong>정성 평가</strong>(역량·태도·협업 등 서술형 항목)로 구분됩니다.
            두 영역을 분리하여 측정함으로써 성과와 역량을 균형 있게 반영합니다.
          </p>
        </section>

        {/* 가중 평균 */}
        <section>
          <h3 className="font-semibold text-gray-900 mb-1">
            가중 평균 산출 방식
          </h3>
          <p>
            각 평가 단계별 점수에 사전 설정된 가중치를 적용하여 최종 점수를
            산출합니다. 이를 통해 직급·역할에 따른 평가 비중을 체계적으로
            반영하며, 단일 평가자의 점수에 과도하게 의존하지 않습니다.
          </p>
        </section>

        {/* 자체개발 고지 */}
        <section className="border-t border-gray-200 pt-4">
          <p className="text-xs text-gray-500 text-center">
            본 인사평가 시스템은 <strong>인터오리진</strong>이 자체 개발한
            자산입니다.
          </p>
          <p className="text-xs text-gray-400 text-center mt-1">
            powered by LocalContentsLab
          </p>
        </section>
      </div>
    </Dialog>
  )
}

export function MethodologyFooter({ mode }: MethodologyFooterProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  if (mode === 'compact') {
    return (
      <>
        <div className="border-t border-gray-200 px-4 py-3">
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-brand-600 transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
            <span>평가 방법론 안내</span>
          </button>
          <p className="mt-1 text-[10px] text-gray-300">
            인터오리진 자체개발 · powered by LocalContentsLab
          </p>
        </div>
        <MethodologyDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
        />
      </>
    )
  }

  // expanded mode (로그인 페이지용)
  return (
    <>
      <div className="mt-6 rounded-xl border border-gray-200 bg-white/70 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <div>
            <p className="text-xs font-medium text-gray-700">
              본 시스템은 다면평가(360° Feedback) 방법론에 기반하여 설계된 체계적
              인사평가 시스템입니다.
            </p>
            <button
              onClick={() => setDialogOpen(true)}
              className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              자세히 보기 →
            </button>
          </div>
        </div>
        <p className="mt-3 border-t border-gray-100 pt-2 text-center text-[10px] text-gray-400">
          인터오리진 자체개발 · powered by LocalContentsLab
        </p>
      </div>
      <MethodologyDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  )
}
