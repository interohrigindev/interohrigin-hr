# ROUTES — 라우트 맵 + 모듈 구조

## 모듈 구조

```
┌──────────────────────────────────────┐
│       공유 데이터베이스 (Supabase)      │
│  employees, evaluations (READ ONLY)   │
│  + 신규 40+ 테이블                     │
└────────┬──────────────┬──────────┬───┘
    ┌────┴────┐   ┌────┴────┐  ┌──┴───┐
    │ 메인 HR  │   │ 채용관리 │  │메신저│
    │(인사/근태│   │(공고/면접│  │(슬랙 │
    │ 결재/평가│   │ 분석/OJT│  │ 유지)│
    │ 급여/교육│   │ 수습)   │  │      │
    └─────────┘   └─────────┘  └──────┘
```

## src/ 디렉토리 구조

```
src/
  components/     재사용 UI (Button, Card, Dialog, Spinner 등)
  routes/         라우트별 페이지
  lib/            유틸리티, supabase 클라이언트, email-templates
  types/          TypeScript 타입 (database.ts, employee-lifecycle.ts, work.ts)
  hooks/          커스텀 훅 (useAuth, useEvaluation, useReport 등)
  contexts/       React Context
  assets/         이미지, 아이콘
```

## 라우트 맵

### 관리자 (/admin)
| 경로 | 페이지 |
|------|--------|
| /admin/dashboard | 통합 대시보드 |
| /admin/urgent | CEO 긴급 업무 |
| /admin/recruitment/* | 채용 (대시보드, 공고, 질의서, 인재상, 신뢰도) |
| /admin/employees/:id/profile | 직원 통합 프로필 |
| /admin/employees/analysis | 사주/MBTI 분석 |
| /admin/employees/notes | 특이사항 관리 |
| /admin/ojt | OJT 관리 |
| /admin/probation | 수습 평가 |
| /admin/employees/handover | 퇴직자 인수인계 관리 (예정) |
| /admin/employees/handover/:id/chat | 인수인계 챗봇 (예정) |
| /admin/leave | 연차 관리 |
| /admin/attendance | 근태 관리 |
| /admin/approval | 전자 결재 |
| /admin/certificates | 증명서 관리 |
| /admin/organization | 조직도 |
| /admin/payroll | 급여 관리 |
| /admin/training | 교육 관리 |

### 직원 셀프서비스 (/my)
| 경로 | 페이지 |
|------|--------|
| /my/leave | 내 연차 현황 + 신청 |
| /my/attendance | 내 출퇴근 기록 |
| /my/approval | 내 결재 신청/현황 |
| /my/payroll | 급여명세서 |
| /my/certificates | 증명서 발급 |
| /my/training | 교육 현황 |
| /my/profile | 내 정보 수정 |
| /my/handover | 내 인수인계 문서 (예정) |

### 공통
| 경로 | 페이지 |
|------|--------|
| /self-evaluation | 자기평가 |
| /evaluate/:id | 평가 상세 |
| /report/:id | 평가 리포트 |
| /peer-review | 동료 평가 |
| /monthly-checkin | 월간 업무 점검 |
| /meeting-notes | 회의록 |
| /messenger | 사내 메신저 |
| /settings/* | 설정 (일반, 평가, 비용관리) |

## 예정 추가 메모 (2026.04.21)

- `src/routes/ojt/probation-results.tsx`
  - 수습평가 카드 정보 보강
  - PDF 저장
  - AI 코멘트 확장
  - AI 종합 분석
- `src/routes/monthly-checkin/*`
  - 상단 이슈/칭찬/제안/기타 탭 정리
  - 직원 계정 월간 점검 흐름 보완
- `src/routes/evaluation/*`
  - 동료평가 10항목 × 10점 구조 보강
- `src/routes/employees/handover.tsx`
  - 인수인계 메인 화면
  - 자산/계약서/문서 위치 인벤토리
- `src/routes/employees/handover-chat.tsx`
  - 후임자용 질문/답변 UI
- `src/routes/ojt/*`
  - OJT 일정 보완
  - AI 퀴즈 생성 오류 수정
- `src/routes/work/*`
  - 프로젝트 대시보드 개인화
  - 일일보고 진행 작업 자동 연동
- `src/routes/leave/*`
  - 직원별 연차 캘린더/월간 뷰
- `src/routes/approval/*`
  - 전자결재 런처형 진입
  - 품의서 작성 화면 확장

### 외부 (로그인 불필요)
| 경로 | 페이지 |
|------|--------|
| /careers | 채용 공고 목록 |
| /apply/:postingId | 지원서 제출 |
| /survey/:token | 사전 질의서 |
| /interview/:token | 면접 녹화 |
| /exit-survey/:token | 퇴사 설문 |
| /accept/:token | 합격 수락 |
