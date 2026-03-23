# CLAUDE.md — INTEROHRIGIN HR Platform

## 프로젝트 개요

인터오리진의 **채용 → 입사 → OJT → 업무 → 평가 → 퇴사**까지 직원의 전체 생애주기를 AI로 통합 관리하는 HR 플랫폼.

## 레포지토리

- **HR 시스템**: `interohrigin-hr` (이 프로젝트)
  - DB: Supabase (PostgreSQL)
  - 호스팅: Cloudflare Pages
  - 기존 기능: 인사평가 시스템 (자기평가 → 리더 → 임원 → CEO 평가 + AI 분석 리포트)

- **업무 마일스톤**: `work-milestone` (별도 프로젝트)
  - DB: Firebase Firestore
  - 호스팅: Firebase Hosting
  - 기능: 업무 관리, 프로젝트 추적

## 기술 스택

```
Frontend: React 19 + TypeScript + Vite 6 + Tailwind CSS
Backend:  Supabase (Auth + DB + Storage + Edge Functions + Realtime)
AI:       Gemini 2.5 Flash (기본) + OpenAI Whisper (STT, 선택)
Deploy:   Cloudflare Pages (자동 배포 via GitHub Actions)
Dev Env:  Firebase Studio (idx)
```

## 디자인 시스템

```
배경:     다크 테마 (#0B0E14 외곽, #111620 카드)
액센트:   골드 (#D4A853)
텍스트:   #E2E8F0 (밝음), #8892A5 (중간), #5A6478 (어두움)
상태:     완료=#4ADE80, 진행중=#F59E0B, 대기=#6B7280, 차단=#EF4444
폰트:     시스템 기본 (Pretendard 선호)
```

## 핵심 원칙

1. **기존 코드 최소 수정**: 기존 인사평가 기능이 깨지면 안 됨
2. **기존 테이블 READ ONLY**: employees, evaluations, evaluation_items 등 ALTER 금지
3. **기존 패턴 따르기**: 컴포넌트/쿼리/스타일/라우팅 모두 기존 방식 그대로
4. **AI는 보조자**: 처음부터 AI가 판단하지 않음. 데이터 축적 후 점진적 확대
5. **사주/MBTI는 참고**: 과학적 판단이 아닌 참고 자료로만 표현
6. **민감 정보 보호**: 건강/가정/보직추천은 임원 외 절대 비공개

## 프로젝트 구조 (확인된 내용)

```
interohrigin-hr/
├── .github/workflows/     ← CI/CD (Cloudflare Pages 자동 배포)
├── .idx/                  ← Firebase Studio 설정
├── public/
├── scripts/
├── src/                   ← React 소스 (TypeScript 70%)
├── supabase/migrations/   ← SQL 마이그레이션 (PLpgSQL 28.3%)
├── .env.production
├── GEMINI.md              ← Gemini AI 연동 가이드
├── tailwind.config.js
├── vite.config.ts
└── wrangler.toml          ← Cloudflare Pages 설정
```

## DB 구조 요약

### 기존 테이블 (수정 금지)
- `employees` — 직원 목록
- `departments` — 부서 목록
- `evaluation_periods` — 평가 기간 (year, quarter, status)
- `evaluation_categories` — 평가 항목 카테고리
- `evaluation_items` — 개별 평가 항목
- `evaluation_targets` — 평가 대상 시트 (기간 + 직원)
- `self_evaluations` — 자기평가 응답
- `evaluator_scores` — 평가자 점수
- `evaluator_comments` — 평가자 코멘트
- `evaluation_weights` — 평가자 역할별 가중치
- `grade_criteria` — 등급 기준

### 신규 추가 테이블

**채용관리 (9개)**
- `job_postings` — 채용공고 (AI 질문 포함)
- `candidates` — 지원자 (다양한 유입경로 구분, status 추적)
- `pre_survey_templates` — 사전 질의서 템플릿
- `interview_recordings` — 면접 녹화/녹음
- `voice_analysis` — 음성 분석 결과 (6개 항목)
- `transcriptions` — STT 결과
- `recruitment_reports` — AI 분석 + 인재상 매칭 + 사주/MBTI
- `hiring_decisions` — 채용 결정 (→ ai_accuracy_log 트리거)
- `talent_profiles` — 인재상 프로필

**AI 신뢰도 (3개)**
- `ai_accuracy_log` — AI추천 vs 실제결정 비교 로그
- `ai_trust_metrics` — 신뢰도 스냅샷
- `ai_phase_transitions` — Phase 전환 이력

**사주/MBTI (3개)**
- `employee_profiles` — 생년월일/MBTI/혈액형
- `personality_analysis` — AI 분석 결과 (사주/MBTI/교차)
- `profile_visibility_settings` — 열람 토글 (기본 OFF)

**수습/OJT (4개)**
- `probation_evaluations` — 단계별 수습 평가 (3회차: 2주/6주/10주, 4인 평가: 멘토/리더/임원/대표, 5항목 × 20점)
- `mentor_assignments` — 멘토-멘티 배정
- `mentor_daily_reports` — 멘토 일일 평가 (객관식+코멘트)
- `special_notes` — 특이사항 기록 (긍정/부정 이벤트)

**평가 확장 (3개)**
- `monthly_checkins` — 월간 업무 점검 (태그: 이슈/칭찬/제안/기타, 리더→임원→대표 피드백)
- `peer_reviews` — 동료 다면 평가 (익명 100점, 최종 점수의 20% 반영)
- `peer_review_assignments` — 동료 평가 배정

**사내 메신저 (4개)**
- `chat_rooms` — 채팅방 (dm/group/project/department/mentor/recruitment)
- `chat_room_members` — 채팅방 멤버 + 읽음 추적 + 알림 설정
- `messages` — 메시지 (text/image/file/ai_bot/system/urgent_alert/task_update)
- `message_reactions` — 이모지 반응

**업무 연동 (1개)**
- `work_metrics` — work-milestone에서 동기화된 분기 데이터

## AI 연동

- GEMINI.md에 기술된 방식을 따를 것
- API 키는 Supabase 사이트 설정 또는 .env에 저장
- AI 호출 시 기존 코드의 패턴(함수, 에러 처리)을 그대로 사용

## 인증/권한

- Supabase Auth 사용 (기존 구현 확인 필요)
- 역할: admin(관리자), executive(임원), leader(팀장), employee(직원)
- 사주/MBTI: admin/executive만 전체 열람, leader/employee는 토글 설정에 따라
- 지원자 페이지(/interview/, /survey/): 토큰 기반, 로그인 불필요

## 커밋 규칙

- 기능 단위로 커밋
- 커밋 메시지: `feat: 채용 대시보드 구현`, `fix: 음성 분석 에러 처리`
- 기존 파일 수정 시 최소 변경, 변경 내역 주석 표기

## 자주 쓰는 명령어

```bash
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
npm run preview      # 빌드 미리보기
npx supabase db push # 마이그레이션 적용
```
