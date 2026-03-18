# CLAUDE.md — INTEROHRIGIN HR Platform

## 프로젝트 개요

인터오리진의 **채용 → 입사 → OJT → 업무 → 평가 → 퇴사**까지 직원의 전체 생애주기를 AI로 통합 관리하는 HR 플랫폼.

**핵심 요청 (대표)**: "직원 이름을 검색하면 면접부터 퇴사까지 모든 이력이 한 화면에 나오는 것"

## 레포지토리

- **HR 시스템**: `interohrigin-hr` (이 프로젝트)
  - DB: Supabase (PostgreSQL)
  - 호스팅: Cloudflare Pages
  - 기존 기능: 인사평가 시스템 (자기→리더→임원→CEO + AI 분석)

- **업무 마일스톤**: `work-milestone` (별도 프로젝트)
  - DB: Firebase Firestore
  - 호스팅: Firebase Hosting

## 기술 스택

```
Frontend: React 19 + TypeScript + Vite 6 + Tailwind CSS
Backend:  Supabase (Auth + DB + Storage + Edge Functions + Realtime)
AI:       Gemini 2.5 Flash (기본) + OpenAI Whisper (STT, 선택)
Deploy:   Cloudflare Pages (GitHub Actions 자동 배포)
Dev Env:  Firebase Studio (idx)
```

## 디자인 시스템

```
배경:     다크 (#0B0E14 외곽, #111620 카드)
액센트:   골드 (#D4A853)
텍스트:   #E2E8F0 (밝음), #8892A5 (중간), #5A6478 (어두움)
상태:     완료=#4ADE80, 진행중=#F59E0B, 대기=#6B7280, 차단=#EF4444
긴급:     #EF4444 (빨강, CEO 긴급 업무 전용)
```

## 핵심 원칙

1. **기존 코드 최소 수정**: 기존 인사평가 기능이 깨지면 안 됨
2. **기존 테이블 READ ONLY**: employees, evaluations, evaluation_items 등 ALTER 금지 (employee_profiles로 분리)
3. **기존 패턴 따르기**: 컴포넌트/쿼리/스타일/라우팅 모두 기존 방식 그대로
4. **AI는 보조자**: 처음부터 판단하지 않음. 데이터 축적 후 점진적 확대 (3단계: 관찰자→보조자→면접관)
5. **사주/MBTI는 참고**: 과학적 판단이 아닌 참고 자료. 민감 정보(건강/가정)는 임원 외 비공개
6. **인사평가는 간소화**: 객관식 10문항 + 총평 2줄. 5분 내 완료. 원클릭 그리드 뷰
7. **리마인드는 집요하게**: CEO 긴급 업무는 완료될 때까지 알림 중지 불가

## 프로젝트 구조

```
interohrigin-hr/
├── .github/workflows/     ← CI/CD
├── .idx/                  ← Firebase Studio
├── public/
├── scripts/
├── src/                   ← React (TS 70%)
├── supabase/migrations/   ← SQL (PLpgSQL 28.3%)
├── .env.production
├── GEMINI.md              ← AI 연동 가이드
├── CLAUDE.md              ← 이 파일
├── tailwind.config.js
├── vite.config.ts
└── wrangler.toml
```

## DB 구조 (총 29개 신규 테이블)

### 기존 (수정 금지)
employees, evaluations, evaluation_items, users

### 채용관리 (10개)
job_postings, candidates, resume_analysis, pre_survey_templates,
interview_schedules, interview_recordings, face_to_face_evals,
voice_analysis, transcriptions, recruitment_reports

### 의사결정 (2개)
hiring_decisions (→ ai_accuracy_log 트리거), talent_profiles

### AI 신뢰도 (3개)
ai_accuracy_log, ai_trust_metrics, ai_phase_transitions

### 사주/MBTI (3개)
employee_profiles (사번 자동생성 포함), personality_analysis, profile_visibility_settings

### 수습/OJT/멘토 (5개)
ojt_programs, ojt_enrollments, mentor_assignments, mentor_daily_reports, probation_evaluations

### 기록 (2개)
special_notes (긍정/부정 이벤트), exit_surveys (퇴사 설문)

### 긴급 업무 (3개) — 3/17 추가
urgent_tasks (CEO Top 10), task_reminders (AI 리마인드), reminder_penalties (감점)

### 업무 연동 (1개)
work_metrics (work-milestone 동기화)

## 사번 자동 생성 규칙

```
포맷: YYMMDDRR (8자리)
  YY: 입사년도 2자리
  MMDD: 입사월일 4자리
  RR: 당일 입사 순번 2자리
예시: 26031701 (2026년 3월 17일 첫 번째 입사자)
→ 트리거로 자동 생성 (입사일만 입력하면 됨)
```

## 인사평가 간소화 (3/17 결정)

```
기존: 주관식 20문항 → 시간 오래 걸림
변경: 객관식 10문항 (5점 척도) + 총평 2줄 → 5분 내 완료
  1. 업무 성과  2. 책임감  3. 소통/협업  4. 전문성  5. 성장 가능성
  6. 조직 적합도  7. 근태/태도  8. 리더십  9. 창의성  10. 종합 추천
한 화면 그리드 뷰로 팀 전체 평가 가능.
AI 참고 데이터(업무 실적+긴급업무 감점)가 상단에 자동 표시.
```

## CEO 긴급 업무 시스템 (3/17 최우선)

```
- CEO/임원이 Top 10 긴급 업무를 지정
- 전 직원이 볼 수 있는 전용 탭
- 미완료 시 AI가 자동으로 리마인드 (4시간 간격, 끌 수 없음)
- 완료 버튼 누를 때까지 멈추지 않음
- 리마인드 횟수 → 인사평가 감점에 반영
- 감정 케어: 재촉 시 AI가 적절한 멘트 제안
```

## AI 연동

- GEMINI.md에 기술된 방식을 따를 것
- API 키는 사이트 설정 또는 .env에 저장
- AI 호출 시 기존 코드의 패턴을 그대로 사용

## 인증/권한

- Supabase Auth (기존 구현 확인 필요)
- 역할: admin, executive, leader, employee
- 긴급 업무 생성: admin/executive만
- 사주/MBTI 전체 열람: admin/executive만 (leader/employee는 토글)
- 외부 페이지 (/apply, /survey, /interview, /exit-survey): 토큰 기반

## 커밋 규칙

```
feat: 채용 대시보드 구현
fix: 음성 분석 에러 처리
refactor: 평가 폼 간소화
```

## 자주 쓰는 명령어

```bash
npm run dev              # 개발 서버
npm run build            # 빌드
npx supabase db push     # 마이그레이션 적용
npx supabase functions deploy [name]  # Edge Function 배포
```

## 개발 참조 문서

| 문서 | 용도 |
|------|------|
| CLAUDE.md (이 파일) | 프로젝트 컨텍스트 |
| GEMINI.md | AI 연동 가이드 |
| QUICKGUIDE.md | Firebase Studio + 기술 스택 참조 |
| v5 개발계획서 | 전체 프롬프트 (P-01~P-35) |
