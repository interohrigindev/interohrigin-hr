/**
 * 매뉴얼 챕터 데이터 (Phase 1: 직원 기본 메뉴)
 *
 * 챕터 추가 방법:
 *  1) 아래 EMPLOYEE_CHAPTERS 배열에 ManualChapter 추가
 *  2) 각 step 의 target 은 가능하면 data-tour="..." 속성 사용 → 컴포넌트에 추가
 *  3) target 없으면 화면 중앙 모달로 표시
 *
 * Phase 2/3 는 HR_ADMIN_CHAPTERS, EXECUTIVE_CHAPTERS 로 추가 예정.
 */

import type { ManualChapter } from '@/types/manual'

export const EMPLOYEE_CHAPTERS: ManualChapter[] = [
  // ─── 1) 대시보드 둘러보기 ──────────────────────────────────────
  {
    id: 'dashboard-overview',
    category: 'employee',
    title: '대시보드 둘러보기',
    description: '홈 화면의 카드, 알림, 빠른 메뉴를 한눈에 익혀봅니다.',
    icon: 'Home',
    estimatedMinutes: 2,
    startRoute: '/',
    steps: [
      {
        id: 'intro',
        title: '환영합니다 👋',
        description: '인터오리진 HR 플랫폼 대시보드 둘러보기를 시작합니다. "다음" 버튼을 눌러 진행해주세요.',
        placement: 'center',
      },
      {
        id: 'home-welcome',
        title: '홈 화면',
        description: '여기는 로그인 후 가장 먼저 보이는 화면입니다. 오늘의 할 일과 알림을 한눈에 확인할 수 있어요.',
        placement: 'center',
      },
      {
        id: 'sidebar',
        title: '사이드바 메뉴',
        description: '왼쪽 사이드바에서 일일보고, 전자결재, 연차, 평가 등 모든 메뉴에 접근할 수 있습니다.',
        target: '[data-tour="sidebar"]',
        placement: 'right',
      },
      {
        id: 'profile',
        title: '내 정보',
        description: '오른쪽 상단의 본인 이름을 클릭하면 프로필 수정과 로그아웃이 가능합니다.',
        target: '[data-tour="profile-menu"]',
        placement: 'bottom',
      },
      {
        id: 'done',
        title: '완료! 🎉',
        description: '대시보드 둘러보기를 마쳤습니다. 다른 챕터도 확인해보세요!',
        placement: 'center',
      },
    ],
  },

  // ─── 2) 일일 업무 보고 작성 ─────────────────────────────────────
  {
    id: 'daily-report',
    category: 'employee',
    title: '일일 업무 보고 작성',
    description: '하루 업무 내용과 만족도를 기록하고 팀장에게 제출하는 방법을 익힙니다.',
    icon: 'FileText',
    estimatedMinutes: 3,
    startRoute: '/work/daily-report',
    steps: [
      {
        id: 'intro',
        title: '일일 업무 보고',
        description: '매일 본인의 업무 내용을 기록하고 팀장 → 임원 결재를 받는 메뉴입니다.',
        placement: 'center',
      },
      {
        id: 'date-picker',
        title: '날짜 선택',
        description: '상단에서 보고할 날짜를 선택합니다. 보통 오늘 날짜로 자동 설정됩니다.',
        target: '[data-tour="daily-date"]',
        placement: 'bottom',
      },
      {
        id: 'tasks',
        title: '업무 내용 입력',
        description: '오늘 진행한 업무를 자유롭게 작성합니다. 게시판처럼 서식과 이미지 첨부도 가능합니다.',
        target: '[data-tour="daily-content"]',
        placement: 'top',
        hint: '입력 후 "다음" 버튼을 눌러주세요',
      },
      {
        id: 'satisfaction',
        title: '오늘 만족도',
        description: '오늘 업무에 대한 만족도를 점수로 평가합니다. 솔직하게 입력해주세요.',
        target: '[data-tour="daily-satisfaction"]',
        placement: 'top',
      },
      {
        id: 'submit',
        title: '제출하기',
        description: '"제출" 버튼을 누르면 결재선이 자동으로 적용되어 팀장에게 발송됩니다.',
        target: '[data-tour="daily-submit"]',
        placement: 'top',
      },
      {
        id: 'done',
        title: '제출 완료! ✅',
        description: '일일 업무 보고 작성을 마쳤습니다. 결재 진행 상황은 "전자결재 > 내 신청" 에서 확인할 수 있어요.',
        placement: 'center',
      },
    ],
  },

  // ─── 3) 연차 신청하기 ─────────────────────────────────────────
  {
    id: 'leave-request',
    category: 'employee',
    title: '연차 신청하기',
    description: '연차 / 반차 / 특별휴가 신청 방법과 결재선을 확인합니다.',
    icon: 'Calendar',
    estimatedMinutes: 3,
    startRoute: '/my-leave',
    steps: [
      {
        id: 'intro',
        title: '연차 신청',
        description: '본인의 연차 잔여 일수를 확인하고 신청서를 작성합니다.',
        placement: 'center',
      },
      {
        id: 'remaining',
        title: '잔여 연차 확인',
        description: '현재 본인의 사용 가능한 연차를 확인할 수 있습니다. 회계연도 기준으로 자동 계산됩니다.',
        target: '[data-tour="leave-remaining"]',
        placement: 'bottom',
      },
      {
        id: 'new-button',
        title: '연차 신청 시작',
        description: '"연차 신청" 버튼을 누르면 신청 폼이 열립니다.',
        target: '[data-tour="leave-new"]',
        placement: 'bottom',
      },
      {
        id: 'period',
        title: '기간 선택',
        description: '시작일과 종료일을 선택합니다. 반차는 오전/오후 옵션을 선택하세요.',
        placement: 'center',
      },
      {
        id: 'reason',
        title: '사유 입력',
        description: '연차 사유를 간단히 입력합니다 (예: 개인사유, 병가, 가족 행사 등).',
        placement: 'center',
      },
      {
        id: 'approval-line',
        title: '결재선 자동 적용',
        description: '본인 부서에 맞는 결재선이 자동 적용됩니다. 팀장 → 임원 → 인사담당 순으로 진행됩니다.',
        placement: 'center',
      },
      {
        id: 'done',
        title: '신청 완료! 🌴',
        description: '연차 신청을 마쳤습니다. 결재 진행은 "전자결재 > 내 신청" 에서 확인할 수 있어요.',
        placement: 'center',
      },
    ],
  },

  // ─── 4) 자기평가 작성 ──────────────────────────────────────────
  {
    id: 'self-evaluation',
    category: 'employee',
    title: '자기평가 작성',
    description: '분기 자기평가 항목 입력과 제출 방법을 안내합니다.',
    icon: 'PenSquare',
    estimatedMinutes: 4,
    startRoute: '/self-evaluation',
    steps: [
      {
        id: 'intro',
        title: '자기평가',
        description: '분기마다 본인의 업무 성과를 스스로 평가하는 메뉴입니다. 평가 기간이 열려있어야 작성 가능합니다.',
        placement: 'center',
      },
      {
        id: 'category',
        title: '평가 카테고리',
        description: '업무 성과 / 직무 역량 / 조직 기여 등 카테고리별로 항목이 구성되어 있습니다.',
        target: '[data-tour="eval-categories"]',
        placement: 'right',
      },
      {
        id: 'score',
        title: '점수 입력',
        description: '각 항목마다 1~10점 척도로 본인을 평가합니다. 솔직하게 입력해주세요.',
        target: '[data-tour="eval-score"]',
        placement: 'top',
      },
      {
        id: 'comment',
        title: '코멘트 작성',
        description: '점수에 대한 근거를 자유롭게 작성합니다. 구체적인 사례를 적으면 좋습니다.',
        target: '[data-tour="eval-comment"]',
        placement: 'top',
      },
      {
        id: 'temp-save',
        title: '임시저장',
        description: '작성 중 "임시저장"으로 저장하면 나중에 이어서 작성할 수 있습니다.',
        target: '[data-tour="eval-temp-save"]',
        placement: 'top',
      },
      {
        id: 'submit',
        title: '제출하기',
        description: '"제출" 버튼을 누르면 팀장 평가 단계로 자동 전환됩니다. 제출 후에는 수정 불가합니다.',
        target: '[data-tour="eval-submit"]',
        placement: 'top',
      },
      {
        id: 'done',
        title: '제출 완료! 📝',
        description: '자기평가 제출이 완료되었습니다. 이후 단계는 팀장 → 임원 → 대표 순으로 진행됩니다.',
        placement: 'center',
      },
    ],
  },

  // ─── 5) 전자결재 사용법 ────────────────────────────────────────
  {
    id: 'approval-usage',
    category: 'employee',
    title: '전자결재 사용법',
    description: '신청 종류, 진행 확인, 회수, 재상신을 익힙니다.',
    icon: 'Stamp',
    estimatedMinutes: 4,
    startRoute: '/admin/approval',
    steps: [
      {
        id: 'intro',
        title: '전자결재',
        description: '회사 내 모든 공식 신청(연차, 출장, 경비, 일일보고 등)을 처리하는 메뉴입니다.',
        placement: 'center',
      },
      {
        id: 'tabs',
        title: '탭 구조',
        description: '내 신청 / 결재 대기 / 진행중 / 완료 / 반려 — 각 탭으로 상태별 문서를 확인할 수 있습니다.',
        target: '[data-tour="approval-tabs"]',
        placement: 'bottom',
      },
      {
        id: 'new',
        title: '신청서 작성',
        description: '"새 신청" 버튼으로 다양한 종류의 결재 문서를 작성할 수 있습니다.',
        target: '[data-tour="approval-new"]',
        placement: 'bottom',
      },
      {
        id: 'status-tracking',
        title: '진행 상황 확인',
        description: '신청한 문서 카드를 클릭하면 현재 어느 결재자 단계인지 자세히 볼 수 있습니다.',
        placement: 'center',
      },
      {
        id: 'recall',
        title: '결재 회수',
        description: '결재자가 액션 전이면 본인이 직접 신청을 회수할 수 있습니다. 회수 후 수정/재상신 가능합니다.',
        placement: 'center',
        hint: '회수는 결재자가 승인/반려하기 전에만 가능',
      },
      {
        id: 'resubmit',
        title: '재상신',
        description: '반려된 문서는 "재상신" 버튼으로 수정 후 다시 결재 진행할 수 있습니다.',
        placement: 'center',
      },
      {
        id: 'done',
        title: '결재 마스터! 🎯',
        description: '전자결재 사용법을 모두 익혔습니다. 신청부터 회수까지 자유롭게 활용해보세요.',
        placement: 'center',
      },
    ],
  },

  // ─── 6) 메신저 사용법 ─────────────────────────────────────────
  {
    id: 'messenger-usage',
    category: 'employee',
    title: '메신저 사용법',
    description: '동료와 채팅, 파일 첨부, 검색, 알림 설정을 안내합니다.',
    icon: 'MessageCircle',
    estimatedMinutes: 3,
    startRoute: '/chat',
    steps: [
      {
        id: 'intro',
        title: '사내 메신저',
        description: '동료와 1:1 / 그룹 채팅, 파일 공유, 빠른 의사소통이 가능한 메뉴입니다.',
        placement: 'center',
      },
      {
        id: 'channel-list',
        title: '채널 목록',
        description: '왼쪽에서 1:1 대화 / 그룹 채널 / 공지 채널을 선택할 수 있습니다.',
        target: '[data-tour="chat-list"]',
        placement: 'right',
      },
      {
        id: 'new-chat',
        title: '새 대화 시작',
        description: '"새 대화" 버튼으로 동료에게 1:1 메시지를 보낼 수 있습니다.',
        target: '[data-tour="chat-new"]',
        placement: 'bottom',
      },
      {
        id: 'input',
        title: '메시지 입력',
        description: '하단 입력창에서 텍스트, 이모지, 파일을 자유롭게 보낼 수 있습니다.',
        target: '[data-tour="chat-input"]',
        placement: 'top',
      },
      {
        id: 'attach',
        title: '파일 첨부',
        description: '클립 아이콘으로 사진, 문서, 영상 등 다양한 파일을 첨부할 수 있습니다 (최대 10MB).',
        placement: 'center',
      },
      {
        id: 'search',
        title: '메시지 검색',
        description: '상단 검색창에서 과거 메시지를 키워드로 검색할 수 있습니다.',
        placement: 'center',
      },
      {
        id: 'done',
        title: '메신저 완료! 💬',
        description: '메신저 사용법을 모두 익혔습니다. 동료들과 활발하게 소통해보세요!',
        placement: 'center',
      },
    ],
  },
]

/**
 * 모든 챕터를 카테고리별로 조회
 */
export function getChaptersByCategory(category: ManualChapter['category']): ManualChapter[] {
  if (category === 'employee') return EMPLOYEE_CHAPTERS
  // Phase 2/3 추가 시 여기에 분기
  return []
}

export function getChapterById(id: string): ManualChapter | null {
  return EMPLOYEE_CHAPTERS.find((c) => c.id === id) || null
}
