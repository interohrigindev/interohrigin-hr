# INTEROHRIGIN HR Platform — 통합 개발계획서 v4

> **채용 → 입사 → OJT → 업무 → 평가 → 퇴사** 직원 생애주기 통합 관리
> **기준 미팅**: 2026.03.16 (오영근 대표 / 차주용 / 강제묵 / 김형석)
> **레포**: https://github.com/interohrigindev/interohrigin-hr
> **운영**: https://interohrigin-hr2.pages.dev/
> **개발 환경**: https://studio.firebase.google.com/interohrigin-hr-08305956
> **최종 업데이트**: 2026.03.16

---

## 미팅 핵심 요약 (3/16)

대표가 요청한 최종 그림:
**"직원 이름을 검색하면 면접부터 퇴사까지 모든 이력이 한 화면에 나오는 것"**

구체적으로:
- 채용 당시 이력서/면접 분석 결과
- OJT 평가 + 멘토 평가
- 수습 기간 1주~3개월 단계별 변화
- 일일 업무 보고서 기반 분석
- 분기 평가 이력
- 사주/MBTI/성향 분석
- 특이사항 (긍정/부정 이벤트)
- 퇴사 사유까지

→ AI가 이 모든 데이터를 한 장으로 요약해주는 구조

---

## 우선 성공 기준 (대표 의견)

> "이거 다 되면 세상 뒤집히는 거고, 현실적으로 아래만 돼도 성공"
> 1. 사전 질의서 자동화
> 2. 화상면접 관리
> 3. 연차/기본 인사 데이터 관리
> 4. 업무 데이터 누적 구조 설계
>
> → **실무에서 바로 쓸 수 있는 기능부터 단계적 확장**

---

## 전체 프롬프트 맵 (30단계)

```
Phase 1: 채용관리 + 인사평가 통합 (HR 시스템)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  기반
  P-01  프로젝트 구조 파악 + 전체 라우팅 + 메뉴 추가
  P-02  Supabase 전체 테이블 생성 (채용+신뢰도+사주+수습+멘토)

  채용 CRUD + 이력서 AI 필터
  P-03  채용 대시보드 + 공고 CRUD + AI 질문 + 유입경로 관리
  P-04  이력서/자기소개서 업로드 + AI 1차 필터링 ← 미팅 신규
  P-05  사전 질의서 (직무/경력별 AI 질문 생성 + 생년월일/MBTI 수집)

  면접 관리
  P-06  면접 일정 자동 매칭 + 사전 자료 발송 ← 미팅 신규
  P-07  면접 녹화 페이지 (웹캠) + 사전 자료 열람 검증
  P-08  대면 면접 평가 폼 (복장/태도/도착시간/인성질문) ← 미팅 신규
  P-09  음성 분석 엔진 (6항목) + STT + 녹음 업로드

  AI 분석 + 리포트
  P-10  인재상 매칭 엔진 ★핵심★
  P-11  AI 종합 분석 (모든 면접 데이터 통합 + 연봉/부서 추천)
  P-12  지원자 분석 리포트 (합산 리포트 + 사주/MBTI 탭)

  입사 + OJT + 수습
  P-13  합격 통보 + 직원 등록 + 입사 전 안내/미션 자동 발송 ← 미팅 신규
  P-14  OJT 시스템 (AI 챗봇 교육 + 퀴즈 자동 생성) ← 미팅 강화
  P-15  멘토-멘티 시스템 (일일 미션 + 객관식 평가) ← 미팅 신규
  P-16  수습 단계별 평가 (1주/2주/3주/1개월/2개월/3개월) ← 미팅 신규

  신뢰도 + 사주 + 통합
  P-17  AI 신뢰도 대시보드 + Phase 자동 판정
  P-18  사주/MBTI 직무분석 (토글 공개 제어)
  P-19  직원 프로필 통합 검색 ★핵심★ (이름 → 전체 이력 한 화면)
  P-20  특이사항 기록 시스템 (긍정/부정 이벤트 누적) ← 미팅 신규
  P-21  이메일 발송 + 통합 대시보드 + 반응형 + 배포


Phase 2: 업무 관리 + 인사평가 연동 (work-milestone + HR)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  업무 시스템
  P-22 [WM] work-milestone 구조 파악 + 직원 연동
  P-23 [WM] AI ToDo 자동 생성 (프로젝트 → 작업 분해)
  P-24 [WM] 일일 업무 보고서 고도화 (미완료 이월 + 감정 점수) ← 미팅 신규
  P-25 [WM] AI 업무 챗봇 (질문 → 담당자 연결 + 병가 대체) ← 미팅 신규

  인사평가 연동
  P-26 [HR] 업무 데이터 동기화 + 자기평가 객관화
  P-27 [HR] AI 평가 리포트에 업무 데이터 통합
  P-28 [HR] 채용 AI 예측 vs 실제 업무 성과 검증

  퇴사 + 테스트
  P-29 [HR] 퇴사 관리 (퇴사 설문 + 사유 분석) ← 미팅 신규
  P-30 [HR+WM] 전체 통합 테스트 + 배포
```

---

## 미팅 기반 신규/강화 요구사항 상세

### A. 채용 유입 경로 다각화 (P-03, P-04)

```
미팅 원문: "헤드헌터, 파견업체, 잡코리아, 지인추천, 대학 커뮤니티 등
           다양한 경로를 링크 기반으로 통합 접수"

구현:
  candidates 테이블에 source_channel 필드:
    'job_korea' | 'headhunter' | 'referral' | 'university' | 'agency' | 'direct' | 'other'
  
  각 채용공고별 고유 링크 생성:
    /apply/{posting_id}?source=headhunter&ref=밸류
    /apply/{posting_id}?source=university&ref=서울대
  
  관리자 대시보드에서 유입 경로별 통계:
    "잡코리아: 12명 / 헤드헌터: 5명 / 지인추천: 3명"
```

### B. 이력서/자기소개서 AI 1차 필터링 (P-04)

```
미팅 원문: "이력서 넣자마자 평가, 장단점, 강점, 1차 첫인상 조사"

구현:
  지원자가 이력서+자기소개서 업로드 (PDF/DOC/이미지)
  → AI가 즉시 분석:
    {
      summary: '1~2줄 요약',
      strengths: ['강점 3개'],
      weaknesses: ['약점 2개'],
      position_fit: 0~100,
      organization_fit: 0~100,
      suggested_department: '추천 부서',
      suggested_position: '추천 직급',
      suggested_salary_range: '추천 연봉 범위',
      red_flags: ['우려 사항'],
      recommendation: 'PROCEED | REVIEW | REJECT'
    }
  
  임원/인사담당자가 AI 분석 결과를 보고 OK/REJECT 결정
  → OK 시 자동으로 사전 질의서 발송
```

### C. 면접 일정 자동 매칭 (P-06)

```
미팅 원문: "급한 보직 우선순위, 30분씩 겹치지 않게 일정 잡기,
           면접 전에 회사소개서/브랜드소개서 전달"

구현:
  1. 관리자가 가용 면접 시간대 입력
  2. AI가 우선순위(급한 포지션) 기준으로 일정 자동 배정
  3. 면접 링크 + 사전 자료(회사소개, 브랜드소개) 자동 발송
  4. 사전 자료에 핵심 질문 5개를 임베딩하여 면접 시 검증
```

### D. 대면 면접 평가 폼 (P-08)

```
미팅 원문: "복장, 태도, 시간 준수, 답변 일관성, 인성 질문까지
           플랫폼 안에서 체크하고 제출"

구현:
  /admin/recruitment/interview/:candidateId/face-to-face

  평가 항목:
  □ 도착 시간 (10분 전/정시/지각 __ 분)
  □ 사전 안내 준수 (출발 연락, 주차 확인 등)
  □ 복장/외모 (5점 척도)
  □ 태도/자세 (5점 척도)
  □ 사전 자료 열람 여부 (브랜드 이름 맞추기 등으로 검증)
  □ 답변 일관성 (화상면접 답변 vs 대면 답변 비교)
  □ 인성 질문 (야근 수용도, 갈등 대처, 동료 관계 등)
  □ 자유 코멘트

  평가 완료 → "제출" 누르면:
  이력서 + 사전질의서 + 화상면접 + 대면면접 결과를 AI가 통합 분석
  → 최종 판단 자료 (한 장 요약) 생성
```

### E. 멘토-멘티 시스템 (P-15)

```
미팅 원문: "멘토에게 매일 미션 제공, 멘티에게도 미션,
           멘토가 객관식으로 평가, 멘토 자격도 평가"

구현:
  입사 후 첫 1주: 멘토 배정
  
  멘토 일일 미션 (AI가 매일 다르게 생성):
    Day 1: "주차장/식당/편의점 위치 안내했나요?"
    Day 2: "점심을 함께 먹었나요? 못 먹는 음식을 확인했나요?"
    Day 3: "멘티의 업무 스타일을 관찰하고 특징을 기록하세요"
    Day 4: "멘티에게 꿈이 무엇인지 물어보세요"
    Day 5: "멘티가 어려워하는 부분을 파악하세요"
  
  멘티 일일 미션:
    Day 1: "회사 시설물 위치를 익히세요"
    Day 2: "선배 2명 이상과 대화하세요"
    ...
  
  매일 멘토 평가 (객관식):
    학습 태도: 매우좋음/좋음/보통/부족/매우부족
    적응도: 매우좋음/좋음/보통/부족/매우부족
    + 짧은 코멘트 (1~2줄)
  
  1주 후: 멘토링 종료 → 멘티가 멘토 평가 (선택적 익명)
  
  3개월차 마지막 주: 2차 멘토링 (정직원 전환 전 스퍼트)
  
  멘토 성과도 누적 → 멘토 자격 평가에 반영
```

### F. 수습 단계별 평가 (P-16)

```
미팅 원문: "1주차/2주차/3주차/1개월/2개월/3개월 단위 평가,
           2개월 차에 거의 결정, AI와 사람이 동시에 반대하면 종료"

구현:
  probation_evaluations 테이블:
    employee_id, evaluation_stage (week1/week2/week3/month1/month2/month3)
    evaluator_id, evaluator_role (mentor/leader/executive)
    scores (jsonb), comments, ai_assessment
    continuation_recommendation ('continue' | 'warning' | 'terminate')
  
  각 단계별 평가 시점에 알림 → 평가 폼 작성
  
  AI 분석:
    "이 직원은 1주차 대비 2주차에 적응도가 15% 향상되었습니다.
     멘토 평가와 OJT 퀴즈 점수가 모두 상승 추세입니다.
     계속 진행을 권장합니다."
  
  또는:
    "이 직원은 OJT 퀴즈 30점, 멘토 평가 '부족',
     데일리 로그 미작성 3일. 면접 시 AI 분석 결과와 비교하면
     예측 대비 부정적입니다. 주의가 필요합니다."
  
  2개월차 평가에서 AI + 임원 모두 'terminate' → 퇴사 프로세스 안내
```

### G. 특이사항 기록 (P-20)

```
미팅 원문: "이 친구는 혼자서 청소를 했다 → 칭찬
           이 친구는 엘리베이터에 침 뱉다 걸렸다 → 감점"

구현:
  special_notes 테이블:
    employee_id, author_id, type ('positive' | 'negative')
    content: "혼자서 청소를 자발적으로 함"
    severity: 'minor' | 'moderate' | 'major'
    created_at
  
  누구나(멘토/리더/임원) 직원 프로필에서 특이사항 추가 가능
  
  AI가 분기 평가 시 이 데이터를 자동 반영:
    "이 직원에 대해 이번 분기 긍정 기록 5건, 부정 기록 1건이 있습니다.
     긍정: 자발적 청소, 동료 도움, 야근 자진 등
     부정: 문 열어놓고 퇴근 1회"
```

### H. 직원 통합 검색 (P-19) ★대표 핵심 요청★

```
미팅 원문: "김형석 치면 모든 게 다 나오고 오영근 치면 다 나오고"

구현:
  /admin/employees/:id/profile (통합 프로필 페이지)
  
  검색 바에 이름 입력 → 직원 선택 → 한 화면에 전체 이력:
  
  ┌─────────────────────────────────────────────┐
  │ 👤 김형석 — 마케팅팀 대리 | ENFP | 1994.05.12│
  │                                             │
  │ [📋 채용] [🎓 OJT] [📊 업무] [📝 평가]       │
  │ [🔮 사주] [⚡ 특이사항] [📄 전체요약]         │
  │                                             │
  │ ═══ 📋 채용 이력 ═══                         │
  │ 지원일: 2025.06.01 | 경로: 잡코리아           │
  │ 이력서 AI 분석: 적합도 82점                   │
  │ 화상면접 AI 점수: 78점 | 대면면접: 85점       │
  │ 인재상 매칭: 88% (A등급 직원 김OO와 유사)     │
  │ AI 추천: PASS | 실제 결정: 합격               │
  │                                             │
  │ ═══ 🎓 OJT + 수습 ═══                       │
  │ OJT 퀴즈: 90점 | 멘토: 박지현 (평가: 우수)    │
  │ 수습 추이: 1주 B → 1개월 A- → 3개월 A        │
  │ 정직원 전환: 2025.09.01                      │
  │                                             │
  │ ═══ 📊 최근 업무 실적 ═══                    │
  │ 작업 완료율: 87% | 마감 준수: 92%             │
  │                                             │
  │ ═══ 📝 최근 평가 ═══                         │
  │ 2025 4Q: A- (종합 82점)                      │
  │                                             │
  │ ═══ ⚡ 특이사항 (최근 6개월) ═══              │
  │ ✅ 자발적 청소 3회 | 동료 도움 2회            │
  │ ⚠ 지각 1회 | 문 안 잠금 1회                  │
  │                                             │
  │ [🤖 AI 한 장 요약 생성]                       │
  │ → "이 직원은 채용 시 AI 예측(82점) 대비       │
  │    실제 성과가 우수(87%)한 인재입니다.         │
  │    기획 업무에서 특히 강점을 보이며..."        │
  └─────────────────────────────────────────────┘
```

### I. 퇴사 관리 (P-29)

```
미팅 원문: "퇴사 논문 쓰면 사직서하고 같이 간단한 정보 입력,
           퇴사 이유를 구두로는 못하니까 링크로"

구현:
  퇴사 확정 시 → 퇴사 설문 링크 자동 발송
  /exit-survey/:token (로그인 불필요)
  
  질문:
    퇴사 사유 (객관식 + 자유 서술)
    회사에 대한 건의사항 (익명 가능)
    재직 기간 중 가장 좋았던 점
    재직 기간 중 가장 힘들었던 점
    특정 인물/상황에 대한 피드백 (선택, 익명)
  
  결과 → 해당 직원 프로필에 저장 + AI 분석
  전체 퇴사 데이터 누적 → 조직 개선 인사이트:
    "최근 6개월 퇴사 3명 중 2명이 '야근 과다'를 사유로 선택"
```

### J. 일일 업무 보고서 개선 (P-24)

```
미팅 원문: "어제 안 한 거 자동으로 올라오고, AI가 오늘 할 일 추천하고,
           맨 마지막에 오늘 하루 점수 10점 만점에 몇 점"

구현 (work-milestone):
  업무 보고서 작성 시:
  
  1. 어제 미완료 업무가 자동으로 오늘 상단에 빨간색으로 표시
  2. AI가 우선순위 추천: "오늘 이것부터 하세요"
  3. 업무 작성 후 맨 하단에:
     "오늘 하루 만족도" → 😊😐😢 (3단계) 또는 1~10 슬라이더
     "한 줄 코멘트" → 선택적 자유 서술
  
  AI가 일/주/월 단위로 만족도 추이 분석:
    "이 직원은 최근 2주간 만족도가 하락 추세입니다.
     업무 변경 또는 면담을 권장합니다."
```

---

## Supabase 테이블 전체 설계

```
기존 (READ ONLY):
  employees, evaluations, evaluation_items, users

채용관리 (10개):
  job_postings         — 채용공고 + AI 질문 + 유입경로별 링크
  candidates           — 지원자 (source_channel, 이력서URL, AI분석결과)
  resume_analysis      — 이력서/자소서 AI 1차 분석 결과 ← 신규
  pre_survey_templates — 사전 질의서 템플릿
  interview_schedules  — 면접 일정 + 사전 자료 발송 이력 ← 신규
  interview_recordings — 면접 녹화/녹음
  face_to_face_evals   — 대면 면접 평가 (복장/태도/도착시간) ← 신규
  voice_analysis       — 음성 분석 결과
  transcriptions       — STT 결과
  recruitment_reports   — AI 종합 분석 + 인재상 매칭

의사결정 (2개):
  hiring_decisions      — 채용 결정 + 연봉/부서 확정
  talent_profiles       — 인재상 프로필

AI 신뢰도 (3개):
  ai_accuracy_log       — AI vs 면접관 비교 (트리거 자동)
  ai_trust_metrics      — 신뢰도 스냅샷
  ai_phase_transitions  — Phase 전환 이력

사주/MBTI (3개):
  employee_profiles     — 생년월일/MBTI/혈액형/한자이름
  personality_analysis  — AI 분석 결과
  profile_visibility_settings — 열람 토글

수습/OJT/멘토 (5개): ← 미팅 신규
  ojt_programs          — OJT 프로그램 정의 (회사/부서/직무)
  ojt_enrollments       — 수강 현황 + 퀴즈 점수
  mentor_assignments    — 멘토-멘티 배정 (1차/2차)
  mentor_daily_reports  — 멘토 일일 평가 (객관식+미션)
  probation_evaluations — 수습 단계별 평가 (1주~3개월)

기록 (2개): ← 미팅 신규
  special_notes         — 특이사항 (긍정/부정)
  exit_surveys          — 퇴사 설문 결과

업무 연동 (1개):
  work_metrics          — work-milestone 동기화 데이터

합계: 신규 26개 테이블
```

---

## Phase 1 프롬프트 (P-01 ~ P-21)

> Firebase Studio에서 Claude CLI로 순차 실행
> 프로젝트: interohrigin-hr (Supabase + Cloudflare)

---

### P-01 — 프로젝트 구조 파악 + 전체 라우팅 추가

```
이 프로젝트는 인터오리진 인사평가 시스템입니다.
여기에 채용관리 + OJT + 수습관리 + 직원 통합 프로필을 확장합니다.

## STEP 1: 기존 구조 완전 파악 (12가지 확인)

1. src/ 전체 파일/폴더 트리
2. package.json dependencies
3. 메인 라우팅 파일 — 현재 라우트 구조
4. 사이드바/네비게이션 컴포넌트
5. Supabase 클라이언트 설정 (lib/supabase.ts 등)
6. TypeScript 타입 정의
7. 공통 UI 컴포넌트 (Button, Card, Table, Modal 등)
8. tailwind.config.js 커스텀 색상
9. supabase/migrations/ SQL — 기존 테이블 스키마
10. GEMINI.md — AI 연동 방식
11. .env.production 환경변수 키 목록
12. 인증(로그인) 구현 방식

## STEP 2: 라우트 추가

채용관리:
  /admin/recruitment                → 채용 대시보드
  /admin/recruitment/jobs           → 채용공고 관리
  /admin/recruitment/jobs/new       → 새 공고
  /admin/recruitment/jobs/:id       → 공고 상세
  /admin/recruitment/candidates/:id → 지원자 리포트
  /admin/recruitment/survey         → 사전 질의서 관리
  /admin/recruitment/talent         → 인재상 설정
  /admin/recruitment/trust          → AI 신뢰도
  /admin/recruitment/interview/:candidateId/face-to-face → 대면 면접 폼

OJT/수습:
  /admin/ojt                        → OJT 관리
  /admin/ojt/mentor                 → 멘토-멘티 관리
  /admin/probation                  → 수습 평가 관리

직원 확장:
  /admin/employees/:id/profile      → 통합 프로필 (핵심)
  /admin/employees/analysis         → 사주/MBTI 분석
  /admin/employees/notes            → 특이사항 관리

외부 (로그인 불필요):
  /apply/:postingId                 → 지원서 제출 (이력서 업로드)
  /survey/:token                    → 사전 질의서
  /interview/:token                 → 면접 녹화
  /exit-survey/:token               → 퇴사 설문

## STEP 3: 사이드바 메뉴

채용관리
  ├── 채용 대시보드
  ├── 채용공고
  ├── 사전 질의서
  ├── 인재상 설정
  └── AI 신뢰도
직원관리
  ├── 직원 리스트
  ├── 통합 프로필 검색
  ├── 사주/MBTI 분석
  ├── 특이사항 관리
  └── 퇴사 관리
OJT/수습
  ├── OJT 프로그램
  ├── 멘토-멘티
  └── 수습 평가

## STEP 4: 빈 페이지 생성 (기존 패턴 동일)

## 주의사항
- 기존 파일 최소 수정
- 기존 패턴/네이밍/색상 동일하게
```

---

### P-02 — Supabase 전체 테이블 생성

```
기존 마이그레이션 방식을 확인하고 위 "Supabase 테이블 전체 설계"의
26개 테이블을 모두 생성합니다.

## 핵심 테이블 상세

### candidates (확장)
  id, job_posting_id, name, email, phone
  source_channel ('job_korea'|'headhunter'|'referral'|'university'|'agency'|'direct')
  source_detail (text) — "밸류 파견업체" 또는 "서울대 경영학과"
  resume_url, cover_letter_url
  resume_analysis_id (FK → resume_analysis)
  status ('applied'|'resume_reviewed'|'survey_sent'|'survey_done'|
          'interview_scheduled'|'video_done'|'face_to_face_done'|
          'processing'|'analyzed'|'decided'|'hired'|'rejected')
  metadata (jsonb — 생년월일, MBTI, 한자이름, 혈액형 등)
  invite_token (UNIQUE)
  pre_survey_data, pre_survey_analysis
  talent_match_score, similar_employees
  processing_step

### resume_analysis (신규)
  id, candidate_id
  resume_text (AI OCR/파싱 결과)
  ai_summary, strengths(jsonb), weaknesses(jsonb)
  position_fit(int), organization_fit(int)
  suggested_department, suggested_position, suggested_salary_range
  red_flags(jsonb), recommendation
  analyzed_at

### interview_schedules (신규)
  id, candidate_id, interviewer_ids(jsonb)
  interview_type ('video'|'face_to_face')
  scheduled_at, duration_minutes
  priority ('urgent'|'normal'|'low')
  pre_materials_sent(bool), pre_materials_sent_at
  meeting_link, location_info
  status ('scheduled'|'completed'|'cancelled'|'no_show')

### face_to_face_evals (신규)
  id, candidate_id, evaluator_id
  arrival_time, scheduled_time
  arrival_status ('early'|'on_time'|'late')
  minutes_early_or_late(int)
  pre_arrival_contact(bool) — 출발 연락 했는지
  appearance_score(int 1~5)
  attitude_score(int 1~5)
  pre_material_read(bool) — 사전 자료 읽었는지
  pre_material_verification(jsonb) — 검증 질문별 결과
  answer_consistency(int 1~5) — 화상면접 답변과 일관성
  personality_questions(jsonb) — 인성 질문별 답변/점수
  free_comments(text)
  total_score(int)

### mentor_assignments (신규)
  id, mentee_id(FK employees), mentor_id(FK employees)
  assignment_type ('initial'|'final') — 1차(입사 직후) / 2차(정직원 전환 전)
  start_date, end_date
  status ('active'|'completed'|'cancelled')
  mentor_rating_by_mentee(jsonb) — 멘티가 멘토 평가
  mentee_rating_by_mentor(jsonb) — 멘토가 멘티 최종 평가

### mentor_daily_reports (신규)
  id, assignment_id(FK mentor_assignments), day_number(1~7)
  mentor_mission(text) — AI가 생성한 오늘의 멘토 미션
  mentee_mission(text) — AI가 생성한 오늘의 멘티 미션
  mentor_completed(bool), mentee_completed(bool)
  learning_attitude ('excellent'|'good'|'average'|'poor'|'very_poor')
  adaptation_level ('excellent'|'good'|'average'|'poor'|'very_poor')
  mentor_comment(text) — 1~2줄
  mentee_feedback(text) — 멘티의 하루 소감
  created_at

### probation_evaluations (신규)
  id, employee_id
  stage ('week1'|'week2'|'week3'|'month1'|'month2'|'month3')
  evaluator_id, evaluator_role
  scores(jsonb) — 항목별 점수
  ai_assessment(text) — AI 분석
  continuation_recommendation ('continue'|'warning'|'terminate')
  comments(text)
  created_at

### special_notes (신규)
  id, employee_id, author_id
  note_type ('positive'|'negative')
  content(text)
  severity ('minor'|'moderate'|'major')
  created_at

### exit_surveys (신규)
  id, employee_id
  exit_date, exit_reason_category (객관식)
  exit_reason_detail(text)
  best_experience(text)
  worst_experience(text)
  suggestions(text)
  anonymous_feedback(text) — 특정인 관련 (익명)
  token(UNIQUE)
  completed_at

## 트리거
  hiring_decisions INSERT → ai_accuracy_log 자동 기록
  special_notes INSERT → employee 프로필 통계 자동 갱신 (선택)

## RLS 패턴: 기존과 동일
## TypeScript 타입: 기존 파일 패턴에 맞춰 추가
## Storage 버킷: interview-recordings, resumes (private)
```

---

### P-03 — 채용 대시보드 + 공고 CRUD + 유입경로 관리

```
기존 대시보드/리스트/폼 패턴을 그대로 따릅니다.

## 채용 대시보드
  통계 카드: 진행중 공고 / 총 지원자 / 분석 완료 / AI 신뢰도 위젯
  유입경로별 통계 차트 (잡코리아: 12, 헤드헌터: 5, 추천: 3...)
  최근 지원자 리스트

## 채용공고 CRUD
  공고 생성 → AI 면접 질문 자동 생성
  유입경로별 지원 링크 자동 생성:
    일반: /apply/{id}
    헤드헌터용: /apply/{id}?source=headhunter&ref=밸류
    대학용: /apply/{id}?source=university&ref=서울대
  링크 복사 버튼 (경로별)

## 공고 상세
  지원자 리스트 (유입경로 Badge 표시)
  각 지원자의 현재 상태 표시 (applied → resume_reviewed → ... → hired)
  파이프라인 뷰 (칸반 스타일 선택적)
```

---

### P-04 — 이력서 업로드 + AI 1차 필터링

```
## 지원서 제출 페이지 (/apply/:postingId)

외부 페이지 (로그인 불필요), 밝은 테마.

입력:
  이름, 이메일, 전화번호
  이력서 업로드 (PDF/DOC/이미지)
  자기소개서 업로드 또는 직접 작성
  유입경로 (URL 파라미터에서 자동 설정, 없으면 선택)

제출 → Supabase Storage에 파일 저장 → candidates 레코드 생성

## AI 1차 분석 (자동)

이력서 텍스트 추출 (PDF → 텍스트, 이미지 → OCR)
AI 프롬프트:
  "HR 전문가로서 이 지원자의 이력서와 자기소개서를 분석하세요.
   채용공고: {직무, 요건}
   이력서: {텍스트}
   자기소개서: {텍스트}
   
   JSON 출력: summary, strengths[], weaknesses[], position_fit(0~100),
   organization_fit(0~100), suggested_department, suggested_position,
   suggested_salary_range, red_flags[], recommendation(PROCEED/REVIEW/REJECT)"

결과 → resume_analysis 테이블에 저장

## 관리자 화면

지원자 상세에서:
  이력서 원본 보기 + AI 분석 결과 카드
  "OK — 사전 질의서 발송" / "REJECT" 버튼
  OK 시 → 자동으로 사전 질의서 링크 이메일 발송
```

---

### P-05 ~ P-21 (이하 요약)

각 프롬프트의 핵심만 기술합니다. 상세 구현은 기존 계획서(v3)의 해당 프롬프트를 참조하되, 미팅에서 추가된 요구사항을 반영합니다.

**P-05**: 사전 질의서 — 직무/경력별 AI 질문 다르게 생성. 경력자→경력 기반, 신입→전공 기반. 10분 이내 분량. 생년월일/MBTI/한자이름 수집.

**P-06**: 면접 일정 자동 매칭 — 관리자 가용시간 입력, 우선순위별 자동 배정, 화상면접 링크+사전자료(회사소개/브랜드소개) 자동 발송.

**P-07**: 면접 녹화 페이지 — 기존 + "사전 자료를 읽었는지 검증하는 질문" AI가 자동 삽입. Phase C에서만 활성화.

**P-08**: 대면 면접 평가 폼 — 도착시간/복장/태도/사전자료 열람/답변 일관성/인성질문 체크리스트. 제출 시 전체 데이터 통합 분석.

**P-09**: 음성 분석 + STT + 녹음 업로드 — 기존과 동일.

**P-10**: 인재상 매칭 — 기존과 동일.

**P-11**: AI 종합 분석 — 이력서 분석 + 사전질의서 + 화상면접 + 대면면접 + 인재상 + 사주/MBTI 모두 통합. **연봉/부서 추천**도 포함 (미팅 요청).

**P-12**: 분석 리포트 — 모든 면접 단계 합산 리포트. 의사결정 시 AI vs 면접관 비교 자동 기록.

**P-13**: 합격 통보 + 직원 등록 — 합격 멘트 AI 생성, 입사 전 안내(출근일/준비사항), **첫 출근 전 미션**(경쟁 브랜드 조사 등) 자동 발송.

**P-14**: OJT 시스템 — AI 챗봇 대화형 교육 + 퀴즈 자동 생성 + 정직원 전환 시 2차 OJT.

**P-15**: 멘토-멘티 시스템 — 위 E항 전체 구현.

**P-16**: 수습 단계별 평가 — 위 F항 전체 구현.

**P-17**: AI 신뢰도 — 혼동행렬, Phase 전환, trust-calculator.

**P-18**: 사주/MBTI — 토글 공개, 임원전용 상세.

**P-19**: 직원 통합 프로필 검색 — 위 H항 전체 구현. ★대표 핵심 요청★

**P-20**: 특이사항 기록 — 위 G항 구현.

**P-21**: 이메일 + 통합 대시보드 + 반응형 + 배포.

---

## Phase 2 프롬프트 (P-22 ~ P-30)

> work-milestone [WM] + interohrigin-hr [HR]

**P-22 [WM]**: 구조 파악 + 직원 연동.

**P-23 [WM]**: AI ToDo 자동 생성 — 프로젝트 목표→작업 분해→담당자 추천.

**P-24 [WM]**: 일일 업무 보고서 고도화 — 미완료 이월, AI 우선순위, 감정/만족도 점수, 객관식+코멘트 형식 표준화. (위 J항)

**P-25 [WM]**: AI 업무 챗봇 — "이거 누구한테 물어봐?" → 담당자 연결. 병가 시 대체 담당자 AI 추천. (미팅 원문: "걔가 병가야, 그러면 정수 있는데 걔가 못 와서 오영근 니가 해야 된다")

**P-26 [HR]**: 업무 데이터 동기화 + 자기평가 객관화.

**P-27 [HR]**: AI 평가 리포트에 업무+OJT+멘토+특이사항 전체 통합.

**P-28 [HR]**: 채용 AI 예측 vs 실제 업무 성과 검증.

**P-29 [HR]**: 퇴사 관리 — 퇴사 설문 링크, 사유 분석, 조직 개선 인사이트. (위 I항)

**P-30 [HR+WM]**: 전체 통합 테스트 + 배포.

---

## 개발 일정

```
Phase 1: 핵심 기능 우선 (3주)
━━━━━━━━━━━━━━━━━━━━━━━━━
  Week 1: P-01~P-05 (기반 + 채용 CRUD + 이력서 + 질의서)
  Week 2: P-06~P-12 (면접 + 분석 + 리포트)
  Week 3: P-13~P-21 (OJT + 멘토 + 수습 + 통합 프로필 + 배포)

Phase 2: 업무 연동 (2주)
━━━━━━━━━━━━━━━━━━━━━━━━━
  Week 4: P-22~P-25 (work-milestone 고도화)
  Week 5: P-26~P-30 (인사평가 연동 + 퇴사 + 테스트)
```

---

## 비용

| 항목 | 월 비용 |
|------|--------|
| Supabase Pro | $25 |
| Gemini API | ~$17 |
| Whisper API (선택) | ~$5 |
| Cloudflare Pages | $0 |
| Firebase Hosting | $0 |
| **합계** | **~$47 (₩65,000)** |

---

## 실행 규칙

```
✅ 반드시:
  - 매 프롬프트 시작 시 기존 코드 먼저 파악
  - 기존 패턴 동일하게 따름
  - 기존 테이블 READ ONLY
  - AI는 보조자 (처음부터 판단 안 함)
  - 사주/MBTI는 참고 자료
  - 민감 정보 임원 외 비공개
  - Phase 전환은 관리자 수동 승인

❌ 절대 안 됨:
  - 기존 테이블 ALTER
  - Phase 자동 전환
  - AI 추천을 "결정"으로 표현
  - 건강/가정 정보 임원 외 노출
```

---

## 네이버웍스 데이터 관련 (후속 액션)

```
미팅 결정: 차주용이 네이버웍스 내부 확인 후 데이터 추출 가능성 검토

확인 사항:
  1. 전체 업무보고 일괄 다운로드 가능 여부
  2. API 연동 가능 여부
  3. 로우 데이터 추출 요청 가능 여부
  4. 불가 시 수작업 범위

활용 계획:
  과거 5년치 업무보고 → AI 분석 → 직원별 업무 성향/패턴 도출
  → 기존 직원 프로필에 반영 → 인사평가 정확도 향상
```

---

*이 문서는 2026.03.16 미팅 내용을 완전히 반영한 INTEROHRIGIN HR Platform 통합 개발계획서입니다.*
*직원의 면접부터 퇴사까지 전체 생애주기를 AI로 통합 관리합니다.*
