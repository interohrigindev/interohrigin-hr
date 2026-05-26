/**
 * 인터랙티브 온라인 매뉴얼 타입 (Phase 1: 직원 기본 메뉴)
 *
 * 핵심:
 *  - TourStep: 한 단계 정의 — target selector (data-tour 권장), 설명, 액션
 *  - ManualChapter: step 배열 + 권한 카테고리
 *
 * target 은 CSS selector. 안정성을 위해 컴포넌트에 data-tour="..." 속성을 부여하고
 * '[data-tour="..."]' 형식으로 참조하는 것을 권장 (class/id 변경 회귀 차단).
 */

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

export type TourStepAction = 'observe' | 'click' | 'fill' | 'navigate'

export interface TourStep {
  id: string
  title: string
  description: string
  /** CSS selector. 없으면 화면 중앙 모달로 표시 */
  target?: string
  /** step 시작 시 navigate. 미입력 시 챕터 시작 route 유지 */
  route?: string
  placement?: TourPlacement
  action?: TourStepAction
  /** 사용자에게 보여줄 보조 힌트 (예: "이 버튼을 클릭해서 직접 해보세요") */
  hint?: string
}

export type ManualCategory = 'employee' | 'hr-admin' | 'executive'

export interface ManualChapter {
  id: string
  category: ManualCategory
  title: string
  description: string
  /** lucide-react icon name (단순 식별자 — 컴포넌트는 별도 매핑) */
  icon: string
  /** 예상 소요시간 (분) */
  estimatedMinutes: number
  /** Tour 시작 시 navigate 할 route */
  startRoute: string
  steps: TourStep[]
}
