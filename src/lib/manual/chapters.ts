/**
 * 매뉴얼 챕터 데이터 (Phase 1: 직원 기본 메뉴)
 *
 * target selector 규칙 (2026-05-26 개편):
 *   - 사이드바 메뉴 항목: [data-tour="nav:<path>"] — 예: [data-tour="nav:/work/daily-report"]
 *   - 헤더 영역:           [data-tour="profile-menu"], [data-tour="notification-bell"] 등
 *   - 페이지 내부 요소:    [data-tour="..."] (각 페이지 컴포넌트에 부여)
 *
 * 설명은 단계별로 충분히 자세하게 작성 — "혼자 따라하면 이해되는" 톤.
 */

import type { ManualChapter } from '@/types/manual'

export const EMPLOYEE_CHAPTERS: ManualChapter[] = [
  // ─── 1) 대시보드 둘러보기 ──────────────────────────────────────
  {
    id: 'dashboard-overview',
    category: 'employee',
    title: '대시보드 둘러보기',
    description: '로그인 직후 첫 화면 — 홈 / 사이드바 / 헤더 / 프로필 메뉴 등 전체 UI 구조를 익힙니다.',
    icon: 'Home',
    estimatedMinutes: 2,
    startRoute: '/',
    steps: [
      {
        id: 'intro',
        title: '환영합니다 👋',
        description: '인터오리진 HR 플랫폼 매뉴얼 투어를 시작합니다.\n\n오른쪽 아래 "다음" 버튼을 누르면 단계별로 진행되고, 화살표 키(←→)로도 이동할 수 있습니다. 언제든 Esc 키로 종료 가능합니다.',
        placement: 'center',
      },
      {
        id: 'sidebar',
        title: '왼쪽 사이드바 — 메뉴 진입의 시작점',
        description: '왼쪽 사이드바에서 일일보고서 / 전자결재 / 연차관리 / 인사평가 / 메신저 등 모든 메뉴에 접근합니다.\n\n그룹 메뉴는 클릭하면 하위 항목이 펼쳐집니다 (예: "프로젝트 & 업무", "인사평가").',
        target: '[data-tour="sidebar"]',
        placement: 'right',
        hint: '본인 권한에 따라 보이는 메뉴가 다를 수 있어요',
      },
      {
        id: 'profile-area',
        title: '오른쪽 상단 — 본인 정보 영역',
        description: '본인 이름과 역할 배지가 표시됩니다. 이름을 클릭하면 프로필 페이지로 이동해서 사진/연락처/MBTI 등을 수정할 수 있습니다.\n\n옆에 있는 종 아이콘은 알림함이에요.',
        target: '[data-tour="profile-menu"]',
        placement: 'bottom',
      },
      {
        id: 'notification',
        title: '🔔 알림 종 — 실시간 알림 확인',
        description: '결재 요청, 댓글, 멘션, 일정 등 본인에게 온 모든 알림을 한 곳에서 확인합니다. 빨간색 숫자는 미확인 알림 개수입니다.',
        target: '[data-tour="notification-bell"]',
        placement: 'bottom',
      },
      {
        id: 'logout',
        title: '로그아웃 버튼',
        description: '사용을 마치면 우측 끝 "로그아웃" 버튼으로 안전하게 로그아웃합니다.\n\n공용 PC 사용 시 꼭 로그아웃해주세요!',
        target: '[data-tour="logout-button"]',
        placement: 'bottom',
      },
      {
        id: 'manual-link',
        title: '📖 매뉴얼 메뉴',
        description: '지금 보고 계신 이 매뉴얼은 사이드바의 "매뉴얼" 메뉴에서 언제든 다시 열 수 있습니다.\n\n다른 챕터도 이 메뉴에서 확인해보세요!',
        target: '[data-tour="nav:/manual"]',
        placement: 'right',
      },
      {
        id: 'done',
        title: '완료! 🎉',
        description: '대시보드 둘러보기를 마쳤습니다.\n\n다음 추천 챕터:\n· 일일 업무 보고 작성\n· 연차 신청하기\n· 메신저 사용법',
        placement: 'center',
      },
    ],
  },

  // ─── 2) 일일 업무 보고 작성 ─────────────────────────────────────
  {
    id: 'daily-report',
    category: 'employee',
    title: '일일 업무 보고 작성',
    description: '매일 업무 내용과 만족도를 기록하고 팀장 → 임원에게 결재 받는 방법을 익힙니다.',
    icon: 'FileText',
    estimatedMinutes: 3,
    startRoute: '/work/daily-report',
    steps: [
      {
        id: 'intro',
        title: '일일 업무 보고란?',
        description: '하루 동안 진행한 업무 내용을 기록하고 결재선(팀장 → 임원)을 따라 자동 발송되는 일일 보고 시스템입니다.\n\n매일 작성을 권장하며, 만족도 점수도 함께 기록합니다.',
        placement: 'center',
      },
      {
        id: 'menu',
        title: '메뉴 진입',
        description: '사이드바에서 "일일 보고서" 메뉴를 클릭하면 이 화면으로 들어옵니다.\n\n지금 보고 계신 화면이 일일 보고서 작성 페이지입니다.',
        target: '[data-tour="nav:/work/daily-report"]',
        placement: 'right',
      },
      {
        id: 'page-tour',
        title: '오늘 날짜 자동 설정',
        description: '현재 날짜가 자동 선택됩니다. 과거 보고가 빠진 경우 상단 날짜 선택기로 다른 날짜를 선택할 수 있어요.',
        placement: 'center',
        hint: '기본은 오늘 날짜 — 특별한 경우만 변경하세요',
      },
      {
        id: 'content-input',
        title: '업무 내용 입력 영역',
        description: '오늘 진행한 업무를 자유롭게 작성합니다.\n\n게시판처럼 굵게/이탤릭/리스트 등 서식을 적용할 수 있고, 이미지·파일 첨부도 가능합니다.\n\n예시:\n· 신규 채용 공고 작성 (3건)\n· 평가 미팅 참석 (오후 2시)\n· 마케팅 보고서 검토',
        placement: 'center',
      },
      {
        id: 'satisfaction',
        title: '오늘 만족도 점수',
        description: '오늘 업무에 대한 본인 만족도를 점수로 평가합니다.\n\n· 1~3점: 어려웠음/스트레스\n· 4~6점: 보통\n· 7~10점: 만족스럽고 성취감 있음\n\n솔직하게 기록하면 인사팀이 직원 만족도 추이를 파악할 수 있어요.',
        placement: 'center',
      },
      {
        id: 'satisfaction-comment',
        title: '한 줄 총평 (선택)',
        description: '점수에 대한 보충 설명을 자유롭게 적습니다.\n\n예시: "프로젝트 마감으로 야근했지만 성취감 있었음", "회의가 많아 본 업무 진행 부족"',
        placement: 'center',
      },
      {
        id: 'submit',
        title: '제출하기',
        description: '"제출" 버튼을 누르면 본인 부서의 결재선이 자동 적용되어 팀장에게 발송됩니다.\n\n결재 진행 상황은 사이드바의 "전자 결재" 메뉴에서 확인할 수 있어요.',
        placement: 'center',
      },
      {
        id: 'done',
        title: '제출 완료! ✅',
        description: '일일 업무 보고 작성을 익혔습니다.\n\n💡 팁: 매일 퇴근 전 5분만 투자하면 한 달 후 본인 성과 정리에 큰 도움이 됩니다.',
        placement: 'center',
      },
    ],
  },

  // ─── 3) 연차 신청하기 ─────────────────────────────────────────
  {
    id: 'leave-request',
    category: 'employee',
    title: '연차 신청하기',
    description: '연차 / 반차 / 특별휴가 신청과 결재선 확인 — 잔여 일수도 함께 확인합니다.',
    icon: 'Calendar',
    estimatedMinutes: 3,
    startRoute: '/my-leave',
    steps: [
      {
        id: 'intro',
        title: '연차 신청',
        description: '본인의 잔여 연차를 확인하고 휴가 신청서를 작성하는 메뉴입니다.\n\n신청 후 팀장 → 임원 → 인사담당 결재선을 거쳐 최종 승인됩니다.',
        placement: 'center',
      },
      {
        id: 'menu',
        title: '메뉴 위치',
        description: '"내 연차" 메뉴는 사이드바 또는 모바일 하단 메뉴에서 접근합니다.\n\n인사담당 등 관리자는 별도의 "연차 관리" 메뉴(전체 직원 연차 확인)를 사용합니다.',
        target: '[data-tour="nav:/my-leave"]',
        placement: 'right',
      },
      {
        id: 'remaining',
        title: '잔여 연차 확인',
        description: '화면 상단에 본인의 총 연차 / 사용 일수 / 잔여 일수가 표시됩니다.\n\n회계연도 기준으로 자동 계산되며, 입사 1년 차는 월별 발생 연차로 표시됩니다.',
        placement: 'center',
      },
      {
        id: 'new',
        title: '연차 신청 시작',
        description: '"연차 신청" 또는 "+ 새 신청" 버튼을 누르면 신청 폼이 열립니다.',
        placement: 'center',
      },
      {
        id: 'type',
        title: '휴가 종류 선택',
        description: '신청 가능한 종류:\n· 연차 (1일 단위)\n· 반차 (오전/오후)\n· 특별휴가 (경조사 등)\n· 병가\n\n반차는 시간 선택이 필요합니다 (예: 14:00~18:00).',
        placement: 'center',
      },
      {
        id: 'period',
        title: '기간 선택',
        description: '캘린더에서 시작일과 종료일을 선택합니다.\n\n주말과 공휴일은 자동 제외되며, 신청 가능 일수가 실시간 표시됩니다.',
        placement: 'center',
      },
      {
        id: 'reason',
        title: '사유 입력',
        description: '간단한 사유를 입력합니다.\n\n예시: "개인 사정", "가족 행사 (결혼식)", "건강 검진"\n\n민감한 사유는 자유롭게 일반적인 표현으로 적어도 됩니다.',
        placement: 'center',
      },
      {
        id: 'approval-line',
        title: '결재선 자동 적용',
        description: '본인 부서에 맞는 결재선이 자동 표시됩니다:\n\n팀장 → 임원 → 인사담당\n\n결재선을 변경하려면 인사담당에게 문의하세요.',
        placement: 'center',
      },
      {
        id: 'done',
        title: '신청 완료! 🌴',
        description: '연차 신청을 마쳤습니다.\n\n진행 상황은 "전자 결재 > 내 신청" 탭에서 확인할 수 있고, 결재자가 액션 전이라면 "회수" 버튼으로 신청을 철회할 수도 있어요.',
        placement: 'center',
      },
    ],
  },

  // ─── 4) 자기평가 작성 ──────────────────────────────────────────
  {
    id: 'self-evaluation',
    category: 'employee',
    title: '자기평가 작성',
    description: '분기 자기평가 — 업무 성과 / 직무 역량 / 조직 기여를 스스로 평가합니다.',
    icon: 'PenSquare',
    estimatedMinutes: 4,
    startRoute: '/self-evaluation',
    steps: [
      {
        id: 'intro',
        title: '자기평가란?',
        description: '분기마다 본인의 업무 성과를 스스로 점수와 코멘트로 평가하는 단계입니다.\n\n자기평가 → 팀장 평가 → 임원 평가 → 대표 확정 순으로 진행됩니다.\n\n평가 기간이 열려있어야 작성 가능합니다 (보통 분기 마지막 주 ~ 다음 분기 둘째 주).',
        placement: 'center',
      },
      {
        id: 'menu',
        title: '메뉴 진입',
        description: '"정규직 평가" 또는 "자기평가" 메뉴를 통해 진입합니다.\n\n현재 진행 중인 평가 기간이 자동 표시되며, 본인이 평가 대상이면 항목들이 노출됩니다.',
        placement: 'center',
      },
      {
        id: 'categories',
        title: '평가 카테고리',
        description: '평가 항목은 직무별로 다르게 구성됩니다:\n\n· 업무 성과 (목표 달성, 기여도)\n· 직무 역량 (전문성, 실행력)\n· 조직 기여 (협업, 리더십)\n\n각 카테고리에 여러 항목이 있어요.',
        placement: 'center',
      },
      {
        id: 'score',
        title: '점수 입력 (1~10점)',
        description: '각 항목마다 1~10점 척도로 본인을 평가합니다.\n\n· 1~3점: 미흡\n· 4~6점: 보통\n· 7~8점: 우수\n· 9~10점: 탁월\n\n솔직하게 입력하면 본인 성장에 더 도움이 됩니다.',
        placement: 'center',
      },
      {
        id: 'comment',
        title: '코멘트 작성',
        description: '점수에 대한 근거를 구체적인 사례로 작성합니다.\n\n예시:\n"신규 프로젝트 3건 성공적으로 런칭 (목표 2건 대비 150%)" → 9점\n"교육 일정 부족으로 신기술 학습 지연" → 5점\n\n구체적일수록 평가자가 참고하기 좋아요.',
        placement: 'center',
      },
      {
        id: 'temp-save',
        title: '💾 임시저장',
        description: '작성 중 일부만 완료된 상태로 "임시저장" 가능합니다.\n\n나중에 이어서 작성할 수 있어 안심하고 작성하세요.\n\n자동저장은 안 되므로 잠시 자리 비울 때는 꼭 임시저장을 눌러주세요.',
        placement: 'center',
      },
      {
        id: 'submit',
        title: '최종 제출',
        description: '모든 항목 작성 후 "제출" 버튼을 누르면 팀장 평가 단계로 자동 전환됩니다.\n\n⚠️ 제출 후에는 수정할 수 없으니 신중히 검토 후 제출해주세요.',
        placement: 'center',
      },
      {
        id: 'done',
        title: '제출 완료! 📝',
        description: '자기평가를 마쳤습니다.\n\n이후 단계는 자동으로 진행됩니다:\n팀장 평가 → 임원 평가 → 대표 확정 → 최종 점수 산출\n\n결과는 "내 평가 결과" 메뉴에서 확인할 수 있어요.',
        placement: 'center',
      },
    ],
  },

  // ─── 5) 전자결재 사용법 ────────────────────────────────────────
  {
    id: 'approval-usage',
    category: 'employee',
    title: '전자결재 사용법',
    description: '내 신청 / 결재 대기 / 회수 / 재상신 — 모든 결재 흐름을 익힙니다.',
    icon: 'Stamp',
    estimatedMinutes: 4,
    startRoute: '/admin/approval',
    steps: [
      {
        id: 'intro',
        title: '전자결재',
        description: '회사의 모든 공식 신청(연차, 출장, 경비, 일일보고 등)을 처리하는 중앙 허브입니다.\n\n본인이 신청한 문서와 결재해야 할 문서를 한 곳에서 관리합니다.',
        placement: 'center',
      },
      {
        id: 'menu',
        title: '메뉴 진입',
        description: '사이드바 "전자 결재" 메뉴로 진입합니다.\n\n알림 종에서 결재 요청 알림을 클릭해도 바로 진입 가능합니다.',
        target: '[data-tour="nav:/admin/approval"]',
        placement: 'right',
      },
      {
        id: 'tabs',
        title: '5개 탭 구조',
        description: '· 내 신청: 본인이 작성한 모든 신청서\n· 결재 대기: 본인이 결재해야 할 문서\n· 진행 중: 결재가 진행 중인 모든 문서\n· 완료: 승인 완료된 문서\n· 반려: 반려된 문서 (재상신 가능)\n\n각 탭에서 카운트 배지로 건수를 확인할 수 있어요.',
        placement: 'center',
      },
      {
        id: 'new',
        title: '새 신청서 작성',
        description: '"새 신청" 버튼으로 신청서 작성을 시작합니다.\n\n신청 가능한 종류:\n· 연차/반차\n· 출장 신청\n· 경비 청구\n· 일일 업무 보고\n· 일반 결재 (기타)',
        placement: 'center',
      },
      {
        id: 'approval-line-edit',
        title: '결재선 확인 / 수정',
        description: '신청 시 본인 부서 기본 결재선이 자동 적용됩니다.\n\n특별한 경우 결재자를 추가/변경할 수 있고, 같은 단계 N명이면 누구나 먼저 결재 가능한 병렬 결재 옵션도 있어요.',
        placement: 'center',
      },
      {
        id: 'status-tracking',
        title: '진행 상황 추적',
        description: '"진행 중" 탭에서 카드를 클릭하면 현재 어느 결재자 단계인지 자세히 볼 수 있습니다.\n\n각 결재자의 액션(승인/반려/대기), 시각, 코멘트가 시간 순으로 표시됩니다.',
        placement: 'center',
      },
      {
        id: 'recall',
        title: '🔁 결재 회수',
        description: '결재자가 액션 전이면 본인이 직접 신청을 회수할 수 있습니다.\n\n"내 신청" 탭에서 해당 카드의 "회수" 버튼 클릭 → 신청서가 본인에게 돌아옵니다.\n\n수정 후 다시 제출할 수 있어요.',
        placement: 'center',
        hint: '결재자가 승인/반려 후에는 회수 불가',
      },
      {
        id: 'resubmit',
        title: '🔁 반려 후 재상신',
        description: '반려된 문서는 "반려" 탭에서 확인 가능합니다.\n\n"재상신" 버튼으로 사유를 보강하거나 내용을 수정 후 다시 결재를 진행할 수 있어요.',
        placement: 'center',
      },
      {
        id: 'done',
        title: '결재 마스터! 🎯',
        description: '전자결재 모든 흐름을 익혔습니다.\n\n💡 자주 쓰는 메뉴는 대시보드의 "빠른 메뉴"에 추가해서 한 번 클릭으로 진입할 수도 있어요.',
        placement: 'center',
      },
    ],
  },

  // ─── 6) 메신저 사용법 ─────────────────────────────────────────
  {
    id: 'messenger-usage',
    category: 'employee',
    title: '메신저 사용법',
    description: '동료와 채팅 / 파일 첨부 / 검색 / 채널 관리를 익힙니다.',
    icon: 'MessageCircle',
    estimatedMinutes: 3,
    startRoute: '/messenger',
    steps: [
      {
        id: 'intro',
        title: '사내 메신저',
        description: '동료와 1:1 또는 그룹으로 실시간 소통하는 메뉴입니다.\n\n외부 메신저(카카오톡 등) 대신 업무 메시지를 회사 시스템 안에서 안전하게 주고받을 수 있어요.',
        placement: 'center',
      },
      {
        id: 'menu',
        title: '메뉴 진입',
        description: '사이드바의 "메신저" 또는 하단 빠른 메뉴에서 진입합니다.\n\n읽지 않은 메시지가 있으면 빨간색 숫자 배지로 표시됩니다.',
        target: '[data-tour="nav:/messenger"]',
        placement: 'right',
      },
      {
        id: 'channel-list',
        title: '채널 목록 (왼쪽)',
        description: '왼쪽에 본인이 참여한 모든 채널이 표시됩니다:\n\n· 1:1 대화 (개별 동료)\n· 그룹 채널 (팀 / 프로젝트)\n· 공지 채널 (회사 전체)\n\n최근 메시지 순으로 정렬됩니다.',
        placement: 'center',
      },
      {
        id: 'new',
        title: '새 대화 시작',
        description: '"새 대화" 또는 "+" 버튼으로 동료에게 1:1 메시지를 시작할 수 있습니다.\n\n그룹 채널은 인사담당이 만들거나, 본인이 직접 동료들을 초대해 만들 수 있어요.',
        placement: 'center',
      },
      {
        id: 'input',
        title: '메시지 입력창',
        description: '하단 입력창에서 텍스트, 이모지, 파일을 자유롭게 보낼 수 있습니다.\n\n· Enter: 메시지 전송\n· Shift + Enter: 줄바꿈',
        placement: 'center',
      },
      {
        id: 'attach',
        title: '📎 파일 첨부',
        description: '클립 아이콘 또는 드래그&드롭으로 파일 첨부 가능:\n\n· 이미지 (jpg, png, gif)\n· 문서 (pdf, doc, xlsx)\n· 영상 (mp4 등)\n\n최대 10MB까지 가능하며, 큰 파일은 Drive 링크를 활용하세요.',
        placement: 'center',
      },
      {
        id: 'search',
        title: '🔍 메시지 검색',
        description: '상단 검색창에서 키워드로 과거 메시지를 찾을 수 있습니다.\n\n특정 채널 안에서만 검색하거나, 전체 채널에서 검색할 수 있어요.',
        placement: 'center',
      },
      {
        id: 'notification',
        title: '🔔 알림 설정',
        description: '채널별로 알림 ON/OFF를 설정할 수 있습니다.\n\n공지 채널은 항상 알림 받고, 잡담 채널은 알림 끄는 식으로 본인에 맞게 조정하세요.',
        placement: 'center',
      },
      {
        id: 'done',
        title: '메신저 완료! 💬',
        description: '메신저 사용법을 모두 익혔습니다.\n\n💡 팁: 결재 진행 중인 문서에 대한 빠른 문의는 메신저로 결재자에게 직접 보내는 것이 효과적입니다.',
        placement: 'center',
      },
    ],
  },

  // ─── 7) 프로젝트 & 업무 (신규 추가, 2026-05-26) ───────────────
  {
    id: 'projects-work',
    category: 'employee',
    title: '프로젝트 & 업무 관리',
    description: '프로젝트 보드 / 작업 관리 / 인수인계 — 업무를 체계적으로 관리하는 방법을 익힙니다.',
    icon: 'LayoutGrid',
    estimatedMinutes: 5,
    startRoute: '/admin/projects',
    steps: [
      {
        id: 'intro',
        title: '프로젝트 & 업무 메뉴',
        description: '이 메뉴 그룹은 프로젝트 단위의 업무를 체계적으로 관리합니다.\n\n포함된 화면:\n· 통합 대시보드 (전체 현황)\n· 프로젝트 보드 (칸반)\n· 새 프로젝트 (생성)\n· 작업 관리 (개인 Task)\n· 나의 인수인계 (퇴사 전 준비)',
        placement: 'center',
      },
      {
        id: 'menu',
        title: '메뉴 진입',
        description: '사이드바 "프로젝트 & 업무" 그룹을 클릭하면 하위 메뉴가 펼쳐집니다.\n\n그룹 화살표(▼/▶)로 펼침/접힘 토글이 가능해요.',
        placement: 'center',
      },
      {
        id: 'dashboard',
        title: '📊 통합 대시보드',
        description: '본인이 참여한 모든 프로젝트의 현황을 한눈에 봅니다:\n\n· 진행 중 프로젝트 카드\n· 본인 담당 작업 (To Do / In Progress / Done)\n· 마감 임박 작업\n· 최근 활동 피드\n\n프로젝트 카드를 클릭하면 상세 화면으로 진입합니다.',
        target: '[data-tour="nav:/admin/projects"]',
        placement: 'right',
      },
      {
        id: 'board',
        title: '📋 프로젝트 보드 (칸반)',
        description: '"프로젝트 보드" 메뉴에서 각 프로젝트의 작업을 칸반 형태로 봅니다:\n\n· To Do (할 일)\n· In Progress (진행 중)\n· In Review (검토 중)\n· Done (완료)\n\n작업 카드를 드래그&드롭으로 상태 변경할 수 있어요.',
        target: '[data-tour="nav:/admin/projects/board"]',
        placement: 'right',
      },
      {
        id: 'new-project',
        title: '➕ 새 프로젝트 생성',
        description: '"새 프로젝트" 메뉴에서 신규 프로젝트를 만듭니다:\n\n1. 프로젝트명 / 부서 입력\n2. 목표 기간 설정\n3. 참여 멤버 초대\n4. 초기 작업(Task) 생성\n\n프로젝트 매니저는 자동으로 생성자로 지정됩니다.',
        target: '[data-tour="nav:/admin/projects/new"]',
        placement: 'right',
      },
      {
        id: 'tasks',
        title: '✅ 작업 관리',
        description: '"작업 관리" 메뉴는 본인에게 할당된 모든 Task를 한 화면에서 봅니다:\n\n· 본인 작업 우선순위 정렬\n· 마감일 기준 알림\n· 상태 변경 (시작/완료)\n· 코멘트로 진행 상황 공유\n\n프로젝트 단위가 아닌 개인 단위로 Task를 보고 싶을 때 유용해요.',
        target: '[data-tour="nav:/admin/work/tasks"]',
        placement: 'right',
      },
      {
        id: 'handover',
        title: '📦 나의 인수인계',
        description: '퇴사 예정자에게만 표시되는 메뉴입니다.\n\n진행 중인 업무 / 담당 프로젝트 / 거래처 등을 정리하여 후임자에게 체계적으로 인계할 수 있어요.\n\n인수인계 완료까지 단계별로 관리됩니다.',
        placement: 'center',
        hint: '이 메뉴는 퇴사 예정자에게만 노출됩니다',
      },
      {
        id: 'task-detail',
        title: '작업 카드 상세',
        description: '작업 카드를 클릭하면 다음을 확인할 수 있어요:\n\n· 작업 설명 / 첨부 파일\n· 담당자 / 마감일\n· 진행률 (%)\n· 댓글 / 멘션\n· 이력 (누가 언제 무엇을 변경)\n· 하위 작업 (Subtask)',
        placement: 'center',
      },
      {
        id: 'collaboration',
        title: '🤝 협업 팁',
        description: '효과적 협업을 위한 권장 사용법:\n\n· 매일 아침: 본인 작업 우선순위 확인\n· 작업 시작: "In Progress" 로 상태 변경\n· 완료 시: "Done" + 결과 코멘트 작성\n· 막힐 때: 카드 댓글에서 동료/매니저 멘션\n· 주간: 본인 완료 작업 회고',
        placement: 'center',
      },
      {
        id: 'done',
        title: '프로젝트 마스터! 🚀',
        description: '프로젝트 & 업무 관리 전체 흐름을 익혔습니다.\n\n💡 일일 업무 보고에 프로젝트 카드 링크를 첨부하면 보고가 더 풍부해집니다.\n\n다음 챕터에서 일일 업무 보고와 메신저 활용도 익혀보세요.',
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
