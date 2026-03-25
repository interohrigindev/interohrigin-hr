# CLAUDE.md — INTEROHRIGIN HR Platform 개발 가이드

> 이 파일은 Claude AI가 프로젝트를 이해하고 일관성 있게 개발하기 위한 컨텍스트 문서입니다.
> 최종 업데이트: 2026.03.24 (v6 미팅 반영)

---

## 프로젝트 개요

**인터오리진 HR 플랫폼** — 직원 생애주기 통합 관리 시스템
- 채용 → 입사 → OJT → 업무 → 평가 → 퇴사 전 과정을 AI로 통합 관리
- 인사노무 기능(연차/근태/결재/증명서/급여/교육) 포함

### 핵심 비전
> "직원 이름을 검색하면 면접부터 퇴사까지 모든 이력이 한 화면에 나오는 것" — 오영근 대표

### 기술 스택
- **프론트엔드**: React + TypeScript + Tailwind CSS
- **백엔드/DB**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **배포**: Cloudflare Pages
- **개발 환경**: Firebase Studio + Claude CLI
- **AI**: Gemini API (분석/추천/리포트)
- **STT**: Whisper API (음성 분석, 선택적)

### 주요 URL
- 운영: https://interohrigin-hr2.pages.dev/
- 레포: https://github.com/interohrigindev/interohrigin-hr
- 개발 환경: https://studio.firebase.google.com/interohrigin-hr-08305956

---

## 아키텍처

### 모듈 구조 (v6 — 3/24 결정)

```
┌─────────────────────────────────────────────┐
│           공유 데이터베이스 (Supabase)          │
│  employees, evaluations, 기존 테이블 (READ ONLY) │
│  + 신규 37개 테이블                            │
└────────┬──────────────┬──────────────┬───────┘
         │              │              │
    ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
    │ 메인 HR  │   │ 채용관리 │   │ 메신저  │
    │ 플랫폼   │   │ (분리)  │   │ (슬랙)  │
    │         │   │         │   │         │
    │ - 인사   │   │ - 공고  │   │ 당분간   │
    │ - 근태   │   │ - 면접  │   │ 기존    │
    │ - 연차   │   │ - 분석  │   │ 슬랙    │
    │ - 결재   │   │ - OJT   │   │ 유지    │
    │ - 급여   │   │ - 수습  │   │         │
    │ - 교육   │   │         │   │         │
    │ - 평가   │   │         │   │         │
    │ - 프로젝트│   │         │   │         │
    └─────────┘   └─────────┘   └─────────┘
```

### 테이블 규칙

```
READ ONLY (절대 ALTER 금지):
  employees, evaluations, evaluation_items, users

신규 테이블 (총 37개):
  채용관리: 10개 (job_postings, candidates, resume_analysis 등)
  의사결정: 2개 (hiring_decisions, talent_profiles)
  AI 신뢰도: 3개 (ai_accuracy_log, ai_trust_metrics 등)
  사주/MBTI: 3개 (employee_profiles, personality_analysis 등)
  수습/OJT/멘토: 5개 (ojt_programs, mentor_assignments 등)
  기록: 2개 (special_notes, exit_surveys)
  업무 연동: 1개 (work_metrics)
  긴급 업무: 3개 (urgent_tasks, task_reminders, reminder_penalties)
  인사노무: 8개 (attendance_records, leave_management, leave_requests,
                 leave_promotions, approval_templates, approval_requests,
                 certificates, training_records)
```

---

## 개발 규칙

### 필수 준수사항

1. **기존 코드 우선 파악**: 매 프롬프트 시작 시 기존 파일 구조와 패턴을 먼저 확인
2. **기존 패턴 따르기**: 네이밍, 컴포넌트 구조, 색상, 스타일 모두 기존과 동일하게
3. **기존 테이블 READ ONLY**: employees, evaluations, evaluation_items, users는 절대 ALTER 금지
4. **AI는 보조자**: AI 추천을 "결정"으로 표현하지 않음. "권장합니다", "제안합니다" 등 사용
5. **사주/MBTI는 참고 자료**: 의사결정 근거가 아닌 참고용
6. **민감 정보 보호**: 건강/가정 정보는 임원 외 비공개
7. **Phase 전환은 수동**: AI 신뢰도 Phase 자동 전환 금지 (관리자 수동 승인)

### 코딩 컨벤션

```typescript
// 파일 구조
src/
  components/        // 재사용 UI 컴포넌트
  pages/             // 라우트별 페이지
    admin/           // 관리자 페이지
    my/              // 직원 셀프서비스 페이지
  lib/               // 유틸리티, Supabase 클라이언트
  types/             // TypeScript 타입 정의
  hooks/             // 커스텀 훅

// 네이밍 규칙
- 컴포넌트: PascalCase (LeaveManagement.tsx)
- 파일: kebab-case (leave-management.tsx) 또는 기존 패턴 따르기
- 테이블: snake_case (leave_management)
- 상수: UPPER_SNAKE_CASE

// UI 패턴
- Tailwind CSS 사용
- 기존 공통 컴포넌트(Button, Card, Table, Modal) 재사용
- 반응형 필수 (모바일 우선)
- 한국어 UI (날짜 형식: YYYY.MM.DD)
```

### 라우트 구조

```
관리자 (/admin):
  /admin/dashboard           → 통합 대시보드 (Monday.com 스타일)
  /admin/urgent              → CEO 긴급 업무

  채용관리 (분리 예정):
    /admin/recruitment/*     → 채용 대시보드, 공고, 질의서, 인재상, 신뢰도

  직원관리:
    /admin/employees/:id/profile → 통합 프로필 (★핵심★)
    /admin/employees/analysis    → 사주/MBTI 분석
    /admin/employees/notes       → 특이사항 관리

  OJT/수습:
    /admin/ojt               → OJT 관리
    /admin/ojt/mentor        → 멘토-멘티
    /admin/probation         → 수습 평가

  인사노무 (v6 신규):
    /admin/leave             → 연차 관리 대시보드
    /admin/attendance        → 근태 관리
    /admin/approval          → 전자 결재 관리
    /admin/approval/templates → 결재 양식 관리
    /admin/certificates      → 증명서 관리
    /admin/organization      → 조직도
    /admin/payroll           → 급여 관리
    /admin/training          → 교육 관리

직원 셀프서비스 (/my):
  /my/leave                  → 내 연차 현황 + 신청
  /my/attendance             → 내 출퇴근 기록
  /my/approval               → 내 결재 신청/현황
  /my/payroll                → 내 급여명세서
  /my/certificates           → 증명서 발급
  /my/training               → 내 교육 현황
  /my/profile                → 내 정보 수정

외부 (로그인 불필요):
  /apply/:postingId          → 지원서 제출
  /survey/:token             → 사전 질의서
  /interview/:token          → 면접 녹화
  /exit-survey/:token        → 퇴사 설문
```

---

## 개발 우선순위 (v6 기준)

```
★긴급(즉시):
  1. Supabase Pro 유료 전환 + 백업 설정
  2. 대시보드 UI 개선 (Monday.com 스타일)
  3. 모듈 분리 설계 (메신저 제거, 채용 분리)

★최우선(이번 주):
  4. 연차 관리 시스템 (P-26)
  5. 프로젝트 관리 파일 업로드 기능

★높음(1~2주):
  6. 전자 결재/품의서 (P-28)
  7. 모바일 반응형 최적화

중간(2~3주):
  8. 근태 관리 (P-27)
  9. 증명서 발급 + 조직도 (P-29)
  10. 급여 관리 (P-30)
  11. 교육 관리 (P-31)

기존 진행:
  12. 채용관리 Phase 1 (P-01~P-21)
  13. CEO 긴급 대시보드 (P-22)
  14. 인사평가 간소화 (P-23)
```

---

## 전체 프롬프트 맵 (41단계)

```
Phase 1: 채용관리 + 인사평가 통합 (P-01~P-21)
Phase 1.5: 긴급 업무 + 평가 간소화 (P-22~P-25)
Phase 1.7: 인사노무 기능 (P-26~P-31) ← v6 신규
Phase 2: 시스템 + 업무 연동 (P-32~P-41)
```

---

## 환경 설정

### Supabase
- 프로젝트: interohrigin-hr
- 유료 전환 필요 ($25/월) — 백업 + 안정성
- Storage 버킷: interview-recordings, resumes, certificates, training-docs (private)
- RLS: 기존 패턴 동일 적용

### 환경 변수
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GEMINI_API_KEY=
```

### 배포
- Cloudflare Pages (자동 배포)
- 메인: interohrigin-hr2.pages.dev
- 채용 모듈: 분리 시 별도 URL

---

## 미팅 이력

| 날짜 | 버전 | 핵심 결정 |
|------|------|----------|
| 2026.03.16 | v4 | 전체 구조 설계, 30단계 프롬프트, 직원 통합 프로필 |
| 2026.03.17 | v5 | CEO 긴급 대시보드, 리마인드, 인사평가 간소화, 사번 자동생성 |
| 2026.03.24 | v6 | 인사노무 기능 추가(연차/근태/결재/증명서/급여/교육), 모듈 분리, Monday.com UI |

---

## 주의사항 요약

```
❌ 절대 금지:
  - 기존 테이블(employees, evaluations 등) ALTER
  - Phase 자동 전환
  - AI 추천을 "결정"으로 표현
  - 건강/가정 정보 임원 외 노출
  - localStorage/sessionStorage 사용 (Artifact 내)

✅ 필수:
  - 기존 패턴/네이밍/색상 동일
  - 모든 새 페이지 모바일 반응형
  - 연차는 입사일 기준 (회계연도 아님)
  - 전자 결재 PDF 출력 지원
  - 데이터 보관 최소 2년
  - 한국어 UI, 날짜 YYYY.MM.DD
```

---

*이 문서는 Claude AI가 INTEROHRIGIN HR Platform 개발 시 참조하는 프로젝트 컨텍스트입니다.*
