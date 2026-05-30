/**
 * 도움말 Article 데이터 — Help Center 기반 모델
 *
 * 외부 SaaS 리서치 결과(2026) 베스트 프랙티스 적용:
 *  - Static product tour 는 비효율 (드롭율 ↑)
 *  - Contextual help + 검색 가능한 Knowledge Base 가 표준
 *  - 사용자 요청 시(컨텍스트형) 호출이 핵심
 *
 * Article 구조:
 *  - id: 고유 슬러그
 *  - category: '시작하기' / '근태/연차' / '결재' / '평가' / '프로젝트' 등
 *  - title: 짧고 명확한 질문형 ("어떻게 ...?")
 *  - keywords: 검색용 키워드 (한국어/영문 혼용)
 *  - relatedRoutes: 이 article 이 어떤 페이지(들)에서 유용한가 (컨텍스트 매칭)
 *  - content: 마크다운-스타일 텍스트 (간단한 ## 헤더 / · 리스트 / **굵게** 지원)
 *  - relatedTourId: 체험형 투어를 함께 제공할 경우 chapters.ts 의 챕터 ID
 *  - relatedArticleIds: 함께 보면 좋은 article
 */

export type ArticleCategory = '시작하기' | '근태/연차' | '결재' | '평가' | '프로젝트' | '메뉴 안내' | 'FAQ'

export interface HelpArticle {
  id: string
  category: ArticleCategory
  title: string
  /** 검색용 키워드 (소문자/공백 무관 매칭) */
  keywords: string[]
  /** 컨텍스트 매칭: 이 article 이 가장 유용한 라우트 prefix 들 */
  relatedRoutes: string[]
  content: string
  /** 함께 제공할 체험형 투어 (chapters.ts 의 챕터 ID) */
  relatedTourId?: string
  /** 함께 보면 좋은 article id 들 */
  relatedArticleIds?: string[]
  /** 인기 / 추천 (Help Center 상단 노출) */
  featured?: boolean
}

export const HELP_ARTICLES: HelpArticle[] = [
  // ─── 시작하기 ──────────────────────────────────────────────────
  {
    id: 'getting-started',
    category: '시작하기',
    title: '인터오리진 HR 플랫폼 — 처음 시작하기',
    keywords: ['시작', '입사', '신규', '온보딩', '가이드', 'getting started'],
    relatedRoutes: ['/'],
    featured: true,
    content: `
## 처음 사용하시나요?

인터오리진 HR 플랫폼에서 신규 입사자가 가장 먼저 해야 할 4가지:

**1. 내 프로필 완성하기**
우측 상단 본인 이름 클릭 → 사진/연락처/MBTI/주소 등 입력. 평가·결재·메신저에서 다른 동료에게 보이는 정보입니다.

**2. 일일 업무 보고 시작**
매일 퇴근 전 사이드바 "일일 보고서" 메뉴에서 오늘 한 업무를 기록합니다.

**3. 사내 메신저 둘러보기**
사이드바 또는 하단 빠른 메뉴에서 메신저 진입. 같은 팀원들과 채팅 시작.

**4. 평가 기간 확인**
분기마다 자기평가 → 팀장 평가 단계가 있습니다. 평가 기간이 열리면 알림이 와요.

💡 **팁**: 모르는 메뉴는 우하단 **? 도움말 버튼**을 누르면 그 화면 관련 도움말이 바로 나옵니다.
    `.trim(),
    relatedTourId: 'dashboard-overview',
    relatedArticleIds: ['daily-report-write', 'leave-request', 'self-eval-fill'],
  },

  {
    id: 'navigation-basics',
    category: '메뉴 안내',
    title: '사이드바 메뉴 구조 알아보기',
    keywords: ['사이드바', '메뉴', '네비', 'nav', '구조'],
    relatedRoutes: ['/'],
    content: `
## 사이드바 메뉴 구조

좌측 사이드바는 본인 권한에 따라 다른 메뉴가 보입니다.

**일반 직원에게 보이는 메뉴:**
· 홈 / 일일 보고서 / 전자 결재 / 게시판
· 인사평가 (그룹) — 정규직 평가, 월간 점검 등
· 프로젝트 & 업무 (그룹) — 통합 대시보드, 칸반 보드 등
· 매뉴얼 (지금 보고 있는 도움말)

**경영지원/임원 추가 메뉴:**
· 채용관리 / 직원관리 / OJT / 인사노무 / 시스템 관리

💡 그룹 메뉴는 클릭하면 하위 항목이 펼쳐집니다.
    `.trim(),
  },

  // ─── 일일 보고서 ──────────────────────────────────────────────
  {
    id: 'daily-report-write',
    category: '결재',
    title: '일일 업무 보고 작성 방법',
    keywords: ['일일', '보고서', 'daily', '업무', '만족도'],
    relatedRoutes: ['/work/daily-report'],
    featured: true,
    content: `
## 일일 업무 보고 작성

매일 본인 업무를 기록하고 팀장 → 임원 결재를 받는 시스템입니다.

**작성 단계:**
1. 사이드바 "일일 보고서" 클릭
2. 오늘 날짜 자동 선택 확인 (다른 날짜 선택 가능)
3. **업무 내용** 입력 — 게시판처럼 서식/이미지 첨부 가능
4. **오늘 만족도** 점수 (1~10) + 한 줄 총평
5. **제출** 클릭 → 자동으로 본인 부서 결재선 적용

**진행 상황 확인:**
"전자 결재 > 내 신청" 탭에서 결재 진행 단계 확인.

**자주 묻는 질문:**
· **Q: 과거 날짜 보고를 누락했어요** → 날짜 선택기로 과거 날짜 선택 후 작성 가능
· **Q: 임시저장은 어떻게?** → 아직 자동저장 없음, 작성 후 바로 제출 권장
· **Q: 결재선이 잘못 표시돼요** → 인사담당에게 부서 정보 확인 요청
    `.trim(),
    relatedTourId: 'daily-report',
    relatedArticleIds: ['approval-recall'],
  },

  // ─── 연차 ──────────────────────────────────────────────────
  {
    id: 'leave-request',
    category: '근태/연차',
    title: '연차/반차 신청 방법',
    keywords: ['연차', '휴가', '반차', '특별휴가', '병가'],
    relatedRoutes: ['/admin/approval'],
    featured: true,
    content: `
## 연차 신청

연차 신청은 **전자 결재** 메뉴에서 진행합니다.

**단계:**
1. 사이드바 "전자 결재" 클릭
2. 우측 상단 "**새 신청**" 버튼
3. 신청 종류에서 "**연차**" 선택
4. 시작일/종료일 선택 (반차는 오전/오후 선택)
5. 사유 입력 (예: "개인 사정", "가족 행사")
6. 결재선 확인 → **제출**

**잔여 연차 확인:**
신청 폼 상단에 본인 잔여 일수가 자동 표시됩니다.

**결재선:**
팀장 → 임원 → 인사담당 (자동 적용, 부서별 다름)

**회수/취소:**
결재자가 액션 전이면 "내 신청" 탭에서 "**회수**" 버튼 가능.

💡 **민감한 사유 (병가/경조사)**: 일반적인 표현으로 적어도 OK. 자세한 사항은 인사담당과 직접 협의.
    `.trim(),
    relatedArticleIds: ['approval-recall', 'leave-promotion'],
  },

  {
    id: 'leave-promotion',
    category: '근태/연차',
    title: '연차 촉진이란? (포기 각서)',
    keywords: ['연차', '촉진', '포기', '각서', '소멸'],
    relatedRoutes: ['/my/leave-promotion', '/my/leave-waiver'],
    content: `
## 연차 촉진 / 포기 각서

회사가 직원에게 미사용 연차를 **사용 권유**하는 법적 절차입니다.

**프로세스:**
1. 2개월 전: 1차 촉진 메일 발송
2. 1개월 전: 2차 촉진
3. 미사용 시: **포기 각서** 작성 요청 → 전자서명
4. 서명 시: 연차 수당 미지급 처리
5. 미서명 시: 연차 수당 지급 의무 유지

**본인 화면:**
· "내 연차 촉진 회신" 메뉴 — 촉진 메일에 회신
· 포기 각서가 발급되면 별도 알림 → 캔버스에서 직접 서명

⚠️ 각서는 법적 증빙이므로 신중히 검토 후 서명해주세요.
    `.trim(),
  },

  // ─── 결재 ──────────────────────────────────────────────────
  {
    id: 'approval-overview',
    category: '결재',
    title: '전자결재 — 5개 탭 사용법',
    keywords: ['결재', '전자결재', 'approval', '신청', '대기', '진행'],
    relatedRoutes: ['/admin/approval'],
    content: `
## 전자결재 — 모든 신청의 중앙 허브

**5개 탭 구조:**
· **내 신청** — 본인이 작성한 모든 신청서 (회수/재상신 가능)
· **결재 대기** — 본인이 결재해야 할 문서
· **진행 중** — 결재가 진행 중인 모든 문서
· **완료** — 승인 완료
· **반려** — 반려된 문서 (재상신 가능)

**신청 가능 종류:**
연차/반차, 출장, 경비, 일일보고, 일반 결재, 인사발령, 퇴직 등.

**결재선:**
· 자동 적용 (부서별 템플릿 기반)
· 같은 단계 N명이면 누구나 먼저 결재 (병렬)
· 특수 케이스만 수동 추가/변경

💡 **알림 종**(우상단 🔔)에서 결재 요청이 바로 떠요.
    `.trim(),
    relatedTourId: 'approval-usage',
    relatedArticleIds: ['approval-recall'],
  },

  {
    id: 'approval-recall',
    category: '결재',
    title: '신청 회수 / 재상신 하는 법',
    keywords: ['회수', '재상신', '취소', '반려'],
    relatedRoutes: ['/admin/approval'],
    content: `
## 결재 회수 & 재상신

**회수 (결재 시작 전 철회):**
1. "전자 결재 > 내 신청" 탭
2. 해당 신청 카드 클릭
3. "**회수**" 버튼 클릭
4. 사유 입력 → 확인
→ 신청서가 본인에게 돌아오고, 수정 후 재제출 가능

⚠️ **결재자가 이미 승인/반려하면 회수 불가** — 누구도 액션 전이어야 함.

**재상신 (반려 후 다시 제출):**
1. "**반려**" 탭에서 반려된 문서 확인
2. 반려 사유 검토
3. "**재상신**" 버튼 → 내용 수정 → 제출
→ 다시 1단계부터 결재 진행

**팁:** 결재가 지연되면 결재자에게 메신저로 정중히 안내.
    `.trim(),
  },

  // ─── 평가 ──────────────────────────────────────────────────
  {
    id: 'self-eval-fill',
    category: '평가',
    title: '자기평가 작성 방법',
    keywords: ['자기평가', '평가', '점수', '코멘트', 'self evaluation'],
    relatedRoutes: ['/self-evaluation', '/evaluation'],
    content: `
## 자기평가 작성

분기마다 본인의 업무 성과를 스스로 점수와 코멘트로 평가합니다.

**평가 흐름:**
자기평가 → 팀장 평가 → 임원 평가 → 대표 확정 → 최종 점수 산출

**작성 가능 시점:**
평가 기간이 열려있어야 작성 가능 (분기 마지막 주 ~ 다음 분기 둘째 주 권장). 평가 기간 시작 시 알림이 옵니다.

**점수 척도:**
· 1~3점: 미흡  · 4~6점: 보통  · 7~8점: 우수  · 9~10점: 탁월

**좋은 코멘트 작성법:**
구체적인 사례 + 수치를 함께 적으세요.

> 예시: "신규 프로젝트 3건 성공적 런칭 (목표 2건 대비 150%)" → 9점

**임시저장:**
일부만 완료된 상태로 저장 가능. 나중에 이어서 작성하세요.

⚠️ **제출 후에는 수정 불가** — 신중히 검토 후 제출.
    `.trim(),
    relatedTourId: 'self-evaluation',
  },

  {
    id: 'eval-result-check',
    category: '평가',
    title: '내 평가 결과 / 이력 확인',
    keywords: ['평가', '결과', '이력', '점수', 'pdf'],
    relatedRoutes: ['/my-evaluations'],
    content: `
## 내 평가 결과 조회

**메뉴:** 사이드바 "인사평가 > 내 평가 결과" 또는 평가 허브의 "내 평가 결과" 카드

**확인 가능 항목:**
· 분기별 최종 점수 / 등급 (S/A/B/C/D)
· 자기평가 / 팀장평가 / 임원평가 비교
· 평가자 코멘트 (직속 평가자 부분만 노출)
· PDF 다운로드 — 인쇄/보관용

**민감 정보 보호:**
임원·대표의 코멘트는 본인에게 비공개 처리될 수 있습니다 (정책에 따라).
    `.trim(),
  },

  // ─── 프로젝트 ─────────────────────────────────────────────
  {
    id: 'project-board',
    category: '프로젝트',
    title: '프로젝트 보드 (칸반) 사용법',
    keywords: ['프로젝트', '칸반', '보드', '작업', 'task'],
    relatedRoutes: ['/admin/projects', '/admin/projects/board'],
    content: `
## 프로젝트 보드 (칸반)

각 프로젝트의 작업을 4단계 칸반으로 봅니다.

**4단계:**
· **To Do** — 시작 전 작업
· **In Progress** — 진행 중
· **In Review** — 검토/리뷰 중
· **Done** — 완료

**작업 카드 액션:**
· 드래그&드롭으로 상태 변경
· 클릭 시 상세 (담당자/마감일/하위작업/댓글/이력)
· @멘션으로 동료 알림

**효과적 사용법:**
1. 매일 아침: 본인 작업 우선순위 확인
2. 시작 시: "In Progress" 로 이동
3. 완료 시: "Done" + 결과 코멘트
4. 막힐 때: 카드 댓글에서 동료 멘션
    `.trim(),
    relatedTourId: 'projects-work',
    relatedArticleIds: ['my-tasks'],
  },

  {
    id: 'my-tasks',
    category: '프로젝트',
    title: '내 작업 (Task) 관리',
    keywords: ['작업', 'task', '할일', 'todo', '마감'],
    relatedRoutes: ['/admin/work/tasks'],
    content: `
## 내 작업 관리

"작업 관리" 메뉴는 본인에게 할당된 **모든 Task**를 한 화면에서 봅니다.

**핵심 기능:**
· 본인 작업 우선순위 자동 정렬
· 마감일 임박 알림 (빨간색 배지)
· 상태 변경 (시작/완료/보류)
· 댓글로 진행 상황 공유

**프로젝트 보드와 차이:**
· 프로젝트 보드: 프로젝트 단위로 작업 보기
· 작업 관리: 본인 단위로 모든 프로젝트 작업 보기

💡 매일 시작 시 이 화면을 먼저 확인하면 우선순위를 빠르게 파악할 수 있어요.
    `.trim(),
  },

  // ─── FAQ ─────────────────────────────────────────────────
  {
    id: 'faq-password',
    category: 'FAQ',
    title: '비밀번호를 잊어버렸어요',
    keywords: ['비밀번호', 'password', '잊어', '재설정', '복구'],
    relatedRoutes: ['/login'],
    content: `
## 비밀번호 재설정

1. 로그인 화면에서 "**비밀번호를 잊으셨나요?**" 클릭
2. 가입한 이메일 입력
3. 이메일로 재설정 링크 수신 (최대 5분)
4. 링크 클릭 → 새 비밀번호 입력

**이메일이 안 오면:**
· 스팸함 확인
· 5분 후에도 안 오면 인사담당에게 직접 문의

⚠️ 보안상 비밀번호는 8자 이상, 영문+숫자+특수문자 조합 권장.
    `.trim(),
  },

  {
    id: 'faq-profile-update',
    category: 'FAQ',
    title: '내 정보(연락처/주소 등) 수정',
    keywords: ['프로필', '정보', '수정', '연락처', '주소', 'mbti'],
    relatedRoutes: ['/my-profile'],
    content: `
## 내 정보 수정

우측 상단 본인 이름 → **내 정보** 페이지

**수정 가능 항목:**
· 사진 (아바타)
· 연락처 / 비상연락처
· 주소
· 생년월일 / 한자 이름
· MBTI / 혈액형

**수정 불가 항목 (인사담당 문의):**
· 부서 / 직급 / 역할
· 입사일 / 사번
· 급여 정보

저장 시 자동으로 다른 화면에 반영됩니다.
    `.trim(),
  },

  {
    id: 'faq-mobile',
    category: 'FAQ',
    title: '모바일에서 사용할 수 있나요?',
    keywords: ['모바일', '핸드폰', 'pwa', '앱', 'mobile'],
    relatedRoutes: ['/'],
    content: `
## 모바일 사용

✅ 모든 기능을 모바일 브라우저에서 사용할 수 있습니다.

**PWA 설치 (홈 화면에 추가):**
· iOS Safari: 공유 버튼 → "홈 화면에 추가"
· Android Chrome: 메뉴 → "앱 설치"

설치 후 앱처럼 빠르게 실행 가능.

**모바일 최적화 메뉴:**
하단 빠른 메뉴 (홈/일일보고/결재/메신저) 로 자주 쓰는 화면 즉시 진입.

**알림:**
브라우저 알림 권한 허용 시 푸시 알림 수신.
    `.trim(),
  },

  // ─── PWA 설치 + 푸시 알림 통합 가이드 ───────────────────────────
  {
    id: 'pwa-notification-setup',
    category: '시작하기',
    title: '📱 앱(PWA) 설치하고 푸시 알림 받기 — 모바일·노트북 가이드',
    keywords: [
      '앱', '설치', 'pwa', '홈화면', '홈 추가', '바로가기',
      '푸시', '알림', '결재 알림', '못 받음', '알림 안 옴',
      'notification', 'push', 'mac', 'iphone', 'android', 'chrome', 'safari',
      'flag', '플래그', '깜빡', '안와',
    ],
    relatedRoutes: ['/'],
    featured: true,
    content: `
## 이 가이드로 무엇을 할 수 있나요?

HR 플랫폼을 **앱처럼 설치**하고 **결재·미결재 리마인더 푸시 알림**을 모바일·노트북에서 즉시 받을 수 있게 설정합니다.

설치하면 좋은 점:
· 홈 화면 / Dock 에서 한 번에 실행 (브라우저 탭 안 열어도 됨)
· 결재가 오면 바로 푸시 알림 (못 보고 지나치지 않음)
· 매일 KST 08:30 미처리 결재 자동 리마인더

소요 시간: 약 3분.

## 📱 1단계 — 모바일에 앱 설치

**아이폰 (iOS Safari)**
· 반드시 iOS 16.4 이상이어야 푸시 가능 — 설정 → 일반 → 정보 → 소프트웨어 버전에서 확인
· Safari 로 \`hr.interohrigin.com\` 접속
· 화면 하단 공유 아이콘 탭
· "홈 화면에 추가" 선택 → 우상단 "추가"
· 홈 화면에 "IO HR" 아이콘 생성됨
· 꼭 홈 화면 아이콘으로 열어야 푸시 가능 (Safari 브라우저로 열면 푸시 X)

**안드로이드 (Chrome)**
· Chrome 으로 \`hr.interohrigin.com\` 접속
· 우상단 메뉴(점 3개) → "앱 설치" 또는 "홈 화면에 추가" 선택
· 자동 설치되며 홈 화면에 아이콘 생성

## 💻 2단계 — 노트북에 앱 설치 (Mac/Windows)

· Chrome 으로 \`hr.interohrigin.com\` 접속
· 주소창 우측의 설치 아이콘 클릭 (또는 우상단 ⋮ → "IO HR 설치")
· "설치" 클릭
· Mac: Launchpad / Dock 에 "인터오리진 HR플랫폼" 생성
· Windows: 시작 메뉴 / 작업표시줄에 생성

설치 후엔 별도 창(탭바 없음)으로 실행됩니다.

## 🔔 3단계 — 푸시 알림 권한 허용

**모바일 (공통)**
· 앱(홈 화면 아이콘)으로 실행 → 로그인 직후 "알림 표시 권한" 팝업 자동 표시 → "허용" 탭
· 한 번이라도 "차단"을 눌렀다면 휴대폰 설정에서 강제 허용 필요
· iOS: 설정 → 알림 → IO HR → 알림 허용 ON
· Android: 설정 → 앱 → IO HR → 알림 → ON

**노트북 (Mac/Windows)**
· 앱으로 실행 → 로그인 직후 권한 팝업 → "허용"
· 권한 거부했으면 앱 우상단 ⋮ → "사이트 정보" → 알림 → 허용

## ⚠️ 4단계 — Mac 노트북 PWA 알림이 안 올 때 (필수 확인)

Mac 에서 가장 흔한 함정 — Chrome 권한은 다 켜놨는데 알림이 안 오는 경우. 다음 설정을 추가로 켜야 합니다.

**A. Chrome flag 활성화 (Mac 노트북 PWA 사용자 필수)**
· 앱 또는 Chrome 주소창에 다음 입력 → Enter:
· \`chrome://flags/#enable-mac-pwas-notification-attribution\`
· "Mac PWA notification attribution" 항목 우측 드롭다운을 **"Enabled"** 로 변경
· 하단 파란색 "Relaunch" 버튼 클릭 → Chrome 재시작
· 이걸 안 하면 PWA 푸시가 macOS 시스템 알림으로 전달되지 않습니다 (Chrome 148 기준)

**B. macOS 시스템 알림 권한 확인**
· 🍎 시스템 설정 → 알림
· 응용 프로그램 알림 목록 스크롤 → "인터오리진 HR플랫폼" 클릭
· 알림 허용 ON
· 알림 스타일: "배너"(자동 사라짐) 또는 "알림"(사용자가 닫을 때까지 표시)
· 잠금 화면에 표시 ON
· **알림 센터에 표시 ON** ← 누락 시 알림센터에 누적 안 됨
· 배지 표시 ON (Dock 아이콘 빨간 카운트)

**C. 집중 모드 / 방해 금지 해제**
· 메뉴바 우상단에 🌙 (달) 또는 ⭐ 보이면 집중 모드 ON 상태
· 메뉴바 → 제어 센터 → 집중 모드 → 해제

## ⚠️ 5단계 — 아이폰 PWA 알림이 안 올 때

· iOS 버전 16.4 이상인지 다시 확인
· 반드시 홈 화면 아이콘으로 열어 권한 허용했는지 (Safari 에서 연 채로 허용은 무효)
· 설정 → 알림 → "IO HR" 항목 확인
· 알림 허용 ON / 잠금 화면 / 알림 센터 / 배너 모두 ON
· 집중 모드 / 방해 금지 모드 해제 확인

## 🧪 6단계 — 테스트로 확인하기

설정 완료 후 본인에게 푸시 도착 여부 확인:
· 결재 상신: 본인이 결재 요청을 올려서 다음 결재자에게 도착하는지
· 헤더 종 아이콘: 알림 도착 시 빨간 배지 표시
· 앱 Dock 아이콘(Mac) / 홈 화면 배지(모바일): 미처리 알림 개수 표시

> 며칠이 지나도 푸시가 한 번도 안 온다면 시스템 관리자에게 문의하여 본인 계정의 push_subscriptions 등록 상태를 확인 받으세요.

## ❓ 자주 묻는 질문

**Q. 푸시 알림이 와도 결재 페이지로 자동 이동 안 됩니다.**
A. 알림 본문을 클릭하면 자동으로 결재 상세 페이지로 이동합니다. 클릭 안 한 경우엔 헤더 종 아이콘 클릭 → 알림 선택으로 이동 가능.

**Q. 이메일 알림은 받는데 푸시는 안 옵니다.**
A. 이메일은 기본 활성, 푸시는 권한 허용 + (Mac 의 경우) flag 활성화가 추가 필요합니다. 위 4단계 다시 확인.

**Q. 매일 아침 미결재 리마인더는 언제 옵니까?**
A. 매일 KST 08:30 자동 발송. 그날 첫 1회만 (중복 발송 없음). 결재가 처리되면 다음날부터 더 이상 안 옵니다.

**Q. 알림을 받고 싶지 않습니다.**
A. macOS 시스템 설정 → 알림 → "인터오리진 HR플랫폼" → "알림 허용" OFF. 또는 앱 우상단 ⋮ → "사이트 정보" → "알림" 차단.
    `.trim(),
  },
]

// ─── 검색 ─────────────────────────────────────────────────────

export function searchArticles(query: string): HelpArticle[] {
  const q = query.trim().toLowerCase()
  if (!q) return HELP_ARTICLES
  return HELP_ARTICLES.filter((a) => {
    if (a.title.toLowerCase().includes(q)) return true
    if (a.keywords.some((k) => k.toLowerCase().includes(q))) return true
    if (a.content.toLowerCase().includes(q)) return true
    return false
  })
}

// ─── 컨텍스트 매칭 — 현재 라우트에 가장 적합한 article 추천 ────
export function getArticlesForRoute(pathname: string): HelpArticle[] {
  return HELP_ARTICLES.filter((a) =>
    a.relatedRoutes.some((r) => pathname === r || pathname.startsWith(r + '/'))
  )
}

export function getArticleById(id: string): HelpArticle | null {
  return HELP_ARTICLES.find((a) => a.id === id) || null
}

export function getAllCategories(): ArticleCategory[] {
  const set = new Set<ArticleCategory>()
  HELP_ARTICLES.forEach((a) => set.add(a.category))
  return Array.from(set)
}
