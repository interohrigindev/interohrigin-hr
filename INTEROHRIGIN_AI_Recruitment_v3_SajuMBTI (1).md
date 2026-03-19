# AI 채용관리 시스템 — 기존 인사평가 통합 개발 계획서 (v3)

> **프로젝트**: INTEROHRIGIN HR System — 채용관리 모듈 확장
> **레포지토리**: https://github.com/interohrigindev/interohrigin-hr
> **운영 사이트**: https://interohrigin-hr2.pages.dev/
> **개발 환경**: Firebase Studio + Claude CLI
> **기술 스택**: React + TypeScript + Vite + Tailwind CSS + Supabase + Cloudflare Pages
> **작성일**: 2026.03.13 (v3 업데이트 — 사주/MBTI 직무분석 추가)

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| v1 | 03.12 | 최초 작성 (12단계 프롬프트) |
| v2 | 03.12 | AI 신뢰도 3단계 모델 추가 (14단계) |
| v3 | 03.13 | 사주/MBTI 직무분석 기능 추가 (15단계), 직원관리 확장 |

---

## 1. 핵심 전략: AI 신뢰도 3단계 성장 모델

### 1-1. 왜 이 접근인가

채용은 사람의 인생이 걸린 문제입니다. 검증 없이 AI에 면접을 맡기면 지원자도 불안하고 회사도 리스크가 큽니다. 따라서 **AI가 처음부터 판단하지 않고, 데이터를 쌓아 신뢰를 증명한 후에 점진적으로 권한이 확대되는 구조**로 설계합니다.

### 1-2. 3단계 신뢰 성장 모델

```
Phase A: 관찰자 (Observer)         현재 개발 범위
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  사람이 면접을 보고 → AI는 녹화본을 분석만 한다
  AI 추천 vs 실제 결정을 비교 축적한다
  
  면접관: "나는 이 사람 합격"
  AI:     "저도 분석해봤는데 PASS입니다" (또는 "저는 REVIEW인데요")
  시스템:  이 차이를 기록하고 일치율을 추적한다
  
  ┌─────────────────────────────────────┐
  │  AI 추천 vs 실제 결정 일치율: 72%    │
  │  분석 완료: 12건 / 목표: 50건       │
  │  ████████░░░░░░░░░░ 24%            │
  │                                     │
  │  ⚠ AI 단독 면접 해제 조건 미충족     │
  │  (일치율 90%↑ 및 50건↑ 필요)        │
  └─────────────────────────────────────┘

Phase B: 보조자 (Assistant)        데이터 50건+ & 일치율 80%+
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  사람이 면접을 보되, AI가 실시간으로 보조한다
  AI가 "이 답변에서 모순이 있습니다" 등 알림 제공
  면접 직후 AI 분석 리포트가 즉시 생성된다
  면접관은 AI 분석을 참고하여 더 정확한 판단을 한다

Phase C: 1차 면접관 (Primary)      일치율 90%+ & 100건+ & 수습 성공률 검증
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  AI가 1차 화상면접을 단독 진행한다
  분석 리포트 + 신뢰도 지표를 인사담당자에게 제공한다
  인사담당자가 리포트 기반으로 2차 대면 면접 여부를 결정한다
```

### 1-3. 신뢰도 판단 기준 (자동 산출)

```
AI 신뢰도 = 가중 평균(
  ① AI추천 vs 실제결정 일치율           × 40%
  ② AI PASS 추천자 중 실제 합격 비율     × 25%
  ③ AI FAIL 추천자 중 실제 불합격 비율   × 15%
  ④ AI 합격 추천자의 수습 통과율         × 20%  ← 장기 지표
)

Phase B 해제 조건: 신뢰도 70%↑ + 데이터 30건↑
Phase C 해제 조건: 신뢰도 85%↑ + 데이터 80건↑ + 수습 데이터 10건↑
```

### 1-4. 사업화 시 강점

- "저희는 처음부터 AI 단독으로 하지 않습니다."
- "귀사의 면접 데이터를 쌓아서 일치율이 90% 이상 검증되면 그때 AI 단독 면접을 오픈합니다."
- "인터오리진에서 143건 데이터로 검증된 92% 정확도의 AI입니다."
- 범용 AI 면접 서비스와 달리, **각 회사의 고유한 인재상을 학습한 맞춤형 AI**

---

## 2. v3 신규 기능: 사주/MBTI 직무분석 시스템

### 2-1. 기능 개요

미팅에서 논의된 내용: 직원들의 생년월일(사주)과 MBTI를 분석하여 직무 적합성, 업무 성향, 보직 배치 참고 자료를 AI가 생성합니다.

```
┌─────────────────────────────────────────────────────┐
│  사주/MBTI 직무분석 시스템                             │
│                                                     │
│  입력: 생년월일(양력/음력) + 생시(선택) + MBTI         │
│        ▼                                            │
│  AI 분석:                                           │
│  ├── 사주 기반 성향 분석 (역학 공식 기반)              │
│  ├── MBTI 기반 직무 적합도                           │
│  ├── 사주+MBTI 교차 분석                             │
│  └── 종합 직무 추천 + 업무 성향 + 리더십 스타일        │
│        ▼                                            │
│  열람 권한:                                          │
│  ├── 임원진 (대표/이사): 항상 열람 가능 ✅             │
│  ├── 리더/팀장: 관리자 설정에 따라 (토글)              │
│  └── 본인: 관리자 설정에 따라 (토글) — 기본값 OFF      │
│                                                     │
│  채용 연동:                                          │
│  └── 지원자의 사주/MBTI → 채용 분석 리포트에 통합       │
│      기존 직원과 사주/MBTI 유사도 비교 가능             │
└─────────────────────────────────────────────────────┘
```

### 2-2. 열람 권한 단계적 공개 구조

```
                     임원진      리더/팀장    본인(직원)
                    (대표/이사)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
사주 분석 결과         ✅ 항상      🔒 토글     🔒 토글
MBTI 분석 결과         ✅ 항상      🔒 토글     🔒 토글
직무 적합도            ✅ 항상      🔒 토글     🔒 토글
업무 성향 리포트        ✅ 항상      🔒 토글     🔒 토글
보직 배치 추천         ✅ 항상      ❌ 비공개    ❌ 비공개
부모/건강 운세         ✅ 항상      ❌ 비공개    ❌ 비공개

관리자 설정 토글:
  [🔘 리더/팀장에게 사주·MBTI 분석 공개]  ON / OFF
  [🔘 본인에게 사주·MBTI 분석 공개]      ON / OFF
  → 기본값: 모두 OFF (임원진에게만 먼저 공개)
  → 나중에 필요 시 토글로 단계적 오픈
```

### 2-3. AI 분석 프롬프트 설계

```
사주 분석 프롬프트:
"당신은 동양 역학(사주팔자) 전문가이자 조직심리학자입니다.
 다음 직원의 생년월일 정보를 기반으로 직무 관점에서 분석하세요.

 이름: {name}
 생년월일: {birthdate} ({calendar_type: 양력/음력})
 생시: {birth_time} (있는 경우)
 현재 부서: {department}
 현재 직급: {position}

 다음 JSON으로 분석:
 {
   saju_summary: '사주 기본 구성 요약 (일간, 오행 균형 등)',
   personality_traits: ['핵심 성격 특성 3~5개'],
   work_style: {
     strengths: ['업무 강점 3개'],
     weaknesses: ['업무 약점 2개'],
     ideal_environment: '최적 업무 환경 설명',
     stress_factors: ['스트레스 요인 2개']
   },
   job_aptitude: {
     best_fit: ['가장 적합한 직무 3개'],
     good_fit: ['적합한 직무 3개'],
     poor_fit: ['부적합한 직무 2개'],
     current_fit_score: 0~100  // 현재 직무 적합도
   },
   leadership_style: '리더십 스타일 설명',
   team_dynamics: '팀 내 역할 (리더/서포터/크리에이터/분석가 등)',
   interpersonal: {
     communication_style: '소통 스타일',
     conflict_pattern: '갈등 시 패턴',
     collaboration_tip: '협업 시 팁'
   },
   yearly_outlook: {
     year_2026: '2026년 업무운 간략 (1~2문장)',
     career_advice: '커리어 조언 (1~2문장)'
   },
   health_note: '건강 유의사항 (간략)',
   family_note: '가정 관련 참고사항 (간략)'
 }

 주의: 이 분석은 참고 자료이며, 과학적 근거가 아닌 전통 역학 기반입니다.
 직무 관점에서 실용적으로 해석해주세요."


MBTI 분석 프롬프트:
"당신은 MBTI 전문 조직심리학자입니다.
 다음 직원의 MBTI를 기반으로 직무 관점에서 분석하세요.

 이름: {name}
 MBTI: {mbti_type}
 현재 부서: {department}
 현재 직급: {position}

 다음 JSON으로 분석:
 {
   type_summary: 'MBTI 유형 핵심 설명 (2~3문장)',
   work_preferences: {
     preferred_tasks: ['선호 업무 유형 3개'],
     avoided_tasks: ['기피 업무 유형 2개'],
     decision_style: '의사결정 스타일',
     time_management: '시간 관리 특성'
   },
   team_role: '팀 내 최적 역할',
   management_tip: '이 유형의 직원을 관리할 때 팁 (임원용)',
   motivation_factors: ['동기부여 요인 3개'],
   growth_areas: ['성장 필요 영역 2개'],
   compatible_types: ['잘 맞는 MBTI 유형 3개'],
   challenging_types: ['어려운 MBTI 유형 2개'],
   current_role_fit: 0~100  // 현재 직무 적합도
 }"


교차 분석 프롬프트 (사주 + MBTI 통합):
"다음 직원의 사주 분석과 MBTI 분석 결과를 통합하여
 최종 직무분석 리포트를 작성하세요.

 사주 분석: {saju_result}
 MBTI 분석: {mbti_result}

 JSON으로 교차 분석:
 {
   integrated_summary: '사주와 MBTI를 종합한 이 직원의 핵심 특성 (3~4문장)',
   consistency_check: '사주와 MBTI 결과의 일치/불일치 포인트',
   final_job_recommendation: {
     top_3_roles: ['최적 직무 1', '최적 직무 2', '최적 직무 3'],
     current_role_overall_fit: 0~100,
     reassignment_suggestion: '보직 변경 필요 시 추천 (또는 현재 유지 추천)'
   },
   executive_brief: '임원진 요약 — 이 직원에 대해 알아야 할 핵심 3가지',
   personal_brief: '본인 요약 — 자기 계발 방향 (본인 공개 시 표시)'
 }"
```

### 2-4. 채용 프로세스 연동

```
지원자 채용 시:
  사전 질의서에서 생년월일 + MBTI 수집
       ▼
  AI 사주/MBTI 분석 자동 실행
       ▼
  채용 분석 리포트의 인재상 매칭에 통합
  "이 지원자의 사주/MBTI 분석 결과, 마케팅팀보다 경영지원팀에 적합"
       ▼
  합격 후 직원 등록 시:
  → 사주/MBTI 데이터가 직원 프로필에 자동 연동
  → 기존 직원들과 사주/MBTI 유사도 비교 가능
```

---

## 3. 확인된 기존 프로젝트 구조

```
interohrigin-hr/
├── .github/workflows/          ← CI/CD (Cloudflare Pages 자동 배포)
├── .idx/                       ← Firebase Studio 설정
├── public/                     ← 정적 파일
├── scripts/                    ← 유틸리티 스크립트
├── src/                        ← React 소스 (TypeScript 70%)
├── supabase/migrations/        ← Supabase SQL 마이그레이션 (PLpgSQL 28.3%)
├── .env.production             ← 프로덕션 환경변수
├── GEMINI.md                   ← Gemini AI 연동 가이드/설정
├── eslint.config.js
├── index.html
├── package.json / package-lock.json
├── postcss.config.js
├── tailwind.config.js          ← Tailwind 설정
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── vite.config.ts              ← Vite 설정
└── wrangler.toml               ← Cloudflare Workers/Pages 설정
```

---

## 4. 통합 후 전체 데이터 흐름

```
채용공고 생성 → AI 질문 생성 → 지원자 초대
       │
       ▼
사전 질의서 (링크) ──── AI 사전 분석 ──── 사주/MBTI 수집 ← v3 추가
       │
       ▼
면접 진행 (사람이 보고, 녹화/녹음)
       │
       ▼
녹화본 업로드 → 분석 파이프라인 실행
       │
       ├── 음성 분석 (에너지/침묵/안정성)
       ├── STT 변환 (답변 텍스트화)
       ├── 답변 내용 분석 (논리성/구체성)
       ├── 인재상 매칭 (기존 평가 데이터 기반)
       ├── 사주/MBTI 직무분석 (채용 연동) ← v3 추가
       └── AI 종합 분석 + PASS/REVIEW/FAIL 추천
              │
              ▼
   면접관 의사결정 (사람)
   → AI추천 vs 실제결정 비교 자동 기록
              │
              ▼
   합격 → 직원 등록 (기존 직원관리 연동)
   → 사주/MBTI 데이터 직원 프로필에 자동 연동 ← v3 추가
              │
              ▼
   직원관리에서 사주/MBTI 분석 열람 ← v3 추가
   → 임원진: 항상 열람 가능
   → 리더/본인: 토글 설정에 따라 공개
```

---

## 5. Supabase 테이블 설계 (v3 추가분)

### 기존 테이블 (v2 유지)

job_postings, candidates, pre_survey_templates, interview_recordings,
voice_analysis, transcriptions, recruitment_reports, hiring_decisions,
talent_profiles, ai_accuracy_log, ai_trust_metrics, ai_phase_transitions

### v3 신규: 사주/MBTI 관련 테이블

```sql
-- ============================================
-- v3 추가: 사주/MBTI 직무분석
-- ============================================

-- 기존 employees 테이블에 ALTER 대신, 별도 프로필 테이블로 관리
-- (기존 테이블 수정 금지 원칙 유지)
CREATE TABLE employee_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,          -- 기존 employees 테이블 참조
  
  -- 생년월일 정보
  birth_date date,                    -- 생년월일
  birth_date_type text DEFAULT 'solar', -- 'solar' (양력) | 'lunar' (음력)
  birth_time text,                    -- 생시 (선택) — '자시'~'해시' 또는 HH:MM
  
  -- MBTI
  mbti_type text,                     -- 'ENFP', 'ISTJ' 등 16가지
  mbti_tested_at date,                -- MBTI 검사일 (자기 신고)
  
  -- 추가 정보 (향후 확장)
  blood_type text,                    -- 혈액형 (선택)
  zodiac_sign text,                   -- 띠 (자동 계산 가능)
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 사주/MBTI AI 분석 결과
CREATE TABLE personality_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,          -- 기존 employees 참조
  
  -- 분석 유형
  analysis_type text NOT NULL,        -- 'saju' | 'mbti' | 'integrated'
  
  -- AI 분석 결과 (JSON)
  saju_result jsonb,                  -- 사주 분석 전체 결과
  mbti_result jsonb,                  -- MBTI 분석 전체 결과
  integrated_result jsonb,            -- 교차 분석 결과
  
  -- 핵심 요약 (빠른 조회용)
  job_fit_score integer,              -- 현재 직무 적합도 (0~100)
  top_roles jsonb,                    -- 추천 직무 ["영업", "마케팅", ...]
  personality_tags jsonb,             -- 성격 태그 ["소통형", "분석가", ...]
  leadership_style text,              -- 리더십 스타일
  executive_brief text,               -- 임원용 요약 (1~2문장)
  personal_brief text,                -- 본인용 요약 (본인 공개 시)
  
  -- 메타
  ai_model_used text,                 -- 사용된 AI 모델
  analyzed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- 열람 권한 설정 (관리자가 관리)
CREATE TABLE profile_visibility_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 공개 설정 (토글)
  show_to_leaders boolean DEFAULT false,    -- 리더/팀장에게 공개
  show_to_self boolean DEFAULT false,       -- 본인에게 공개
  
  -- 세부 항목별 공개 설정 (선택적 세분화)
  leader_visible_fields jsonb DEFAULT '["mbti_result", "work_style", "team_role"]',
  self_visible_fields jsonb DEFAULT '["mbti_result", "personal_brief", "growth_areas"]',
  
  -- 임원 전용 항목 (항상 비공개 — 임원만 열람)
  -- family_note, health_note, reassignment_suggestion은
  -- 리더/본인에게 절대 공개되지 않음
  
  updated_by text,                    -- 마지막 수정한 관리자
  updated_at timestamptz DEFAULT now()
);

-- 초기 설정 데이터 (1행만 존재)
INSERT INTO profile_visibility_settings (show_to_leaders, show_to_self)
VALUES (false, false);

-- 지원자용 사주/MBTI 분석 (채용 프로세스에서)
-- → candidates.metadata에 birth_date, mbti 저장
-- → recruitment_reports.talent_match에 사주/MBTI 분석 통합
-- → 합격 시 employee_profiles로 자동 이전
```

### RLS 정책 (사주/MBTI 열람 권한)

```sql
-- employee_profiles: 본인 데이터 읽기 + 관리자 전체 CRUD
CREATE POLICY "profiles_read_own" ON employee_profiles
  FOR SELECT USING (
    employee_id = auth.uid()  -- 본인 프로필은 읽기 가능 (데이터 자체)
  );

CREATE POLICY "profiles_admin_all" ON employee_profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'executive'))
  );

-- personality_analysis: 열람 권한에 따라 분기
-- (실제 분기는 프론트엔드에서 profile_visibility_settings를 확인하여 처리)
-- RLS에서는 기본적으로 admin/executive만 접근
CREATE POLICY "analysis_executive_only" ON personality_analysis
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'executive'))
  );

-- 리더/본인 접근은 Supabase RPC 함수로 처리 (visibility 설정 확인)
CREATE OR REPLACE FUNCTION get_personality_analysis(target_employee_id uuid)
RETURNS jsonb AS $$
DECLARE
  viewer_role text;
  vis_settings record;
  analysis record;
  result jsonb;
BEGIN
  -- 현재 사용자 역할 확인
  SELECT role INTO viewer_role FROM users WHERE id = auth.uid();
  
  -- 설정 확인
  SELECT * INTO vis_settings FROM profile_visibility_settings LIMIT 1;
  
  -- 분석 데이터 로드
  SELECT * INTO analysis FROM personality_analysis
    WHERE employee_id = target_employee_id
    AND analysis_type = 'integrated'
    ORDER BY created_at DESC LIMIT 1;
  
  IF viewer_role IN ('admin', 'executive') THEN
    -- 임원: 전체 데이터 반환
    RETURN to_jsonb(analysis);
  ELSIF viewer_role = 'leader' AND vis_settings.show_to_leaders THEN
    -- 리더: 허용된 필드만 반환
    RETURN jsonb_build_object(
      'mbti_result', analysis.mbti_result,
      'job_fit_score', analysis.job_fit_score,
      'personality_tags', analysis.personality_tags,
      'leadership_style', analysis.leadership_style
      -- family_note, health_note, reassignment_suggestion 제외
    );
  ELSIF target_employee_id::text = auth.uid()::text AND vis_settings.show_to_self THEN
    -- 본인: 허용된 필드만 반환
    RETURN jsonb_build_object(
      'mbti_result', analysis.mbti_result,
      'personal_brief', analysis.personal_brief,
      'job_fit_score', analysis.job_fit_score,
      'personality_tags', analysis.personality_tags
      -- 보직 배치 추천, 임원 메모 등 제외
    );
  ELSE
    RETURN NULL;  -- 접근 불가
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 6. 확장 후 메뉴 구조 (v3)

```
interohrigin-hr.pages.dev
━━━━━━━━━━━━━━━━━━━━━━━━

├── 대시보드 (통합 — 평가 + 채용 현황)
│
├── 📋 인사평가 (기존)
│
├── 👥 채용관리 (v2)
│   ├── 채용 대시보드
│   ├── 채용공고
│   ├── 사전 질의서
│   ├── 인재상 설정
│   └── AI 신뢰도
│
├── 👤 직원관리 (기존 + v3 확장)
│   ├── 직원 리스트
│   ├── 직원 추가
│   ├── 프로필 관리
│   └── 🔮 사주/MBTI 분석 ◀── v3 신규
│       ├── 직원별 분석 리포트 (임원 전용)
│       ├── 전체 직원 성향 맵 (임원 전용)
│       └── 부서별 궁합 분석 (임원 전용)
│
└── ⚙️ 설정 (기존 + v3 확장)
    ├── AI API 키
    ├── 회사 정보
    ├── 인재상 설정
    └── 🔒 사주/MBTI 공개 설정 ◀── v3 신규
        ├── [토글] 리더/팀장 공개
        └── [토글] 본인 공개
```

---

## 7. 바이브코딩 프롬프트 (총 15단계 — v3)

> v2의 14단계에 PROMPT 15 (사주/MBTI) 추가.
> PROMPT 02, 04, 08, 09, 12에 사주/MBTI 관련 내용 보강.

---

### PROMPT 01 — 프로젝트 구조 파악 + 채용관리 라우팅 추가

```
(v2와 동일하되, 라우트 2개 추가)

추가 라우트:
/admin/employees/analysis       → 사주/MBTI 분석 (직원관리 하위)
/admin/employees/analysis/:id   → 개인별 분석 상세

사이드바 직원관리 하위에 추가:
  └── 🔮 사주/MBTI 분석

나머지는 v2 PROMPT 01과 동일합니다.
```

---

### PROMPT 02 — Supabase 테이블 생성 (v3: 사주/MBTI 테이블 추가)

```
v2 PROMPT 02에 추가:

기존 12개 테이블에 3개 추가:

13. employee_profiles — 직원 생년월일/MBTI 입력 데이터
    - employee_id, birth_date, birth_date_type (solar/lunar)
    - birth_time (선택), mbti_type, blood_type (선택)
    
14. personality_analysis — AI 사주/MBTI 분석 결과
    - employee_id, analysis_type (saju/mbti/integrated)
    - saju_result (jsonb), mbti_result (jsonb), integrated_result (jsonb)
    - job_fit_score, top_roles, personality_tags
    - executive_brief, personal_brief
    
15. profile_visibility_settings — 공개 설정 (토글)
    - show_to_leaders (boolean, 기본 false)
    - show_to_self (boolean, 기본 false)
    - leader_visible_fields, self_visible_fields
    - 초기 데이터 1행 INSERT (둘 다 false)

★ RLS 정책:
  - personality_analysis는 기본적으로 admin/executive만 SELECT 가능
  - 리더/본인 접근은 get_personality_analysis() RPC 함수로 처리
  - profile_visibility_settings 확인하여 허용된 필드만 반환
  - family_note, health_note, reassignment_suggestion은 
    임원 외에 절대 반환하지 않음

나머지(채용 테이블 9개 + 신뢰도 테이블 3개)는 v2와 동일합니다.
```

---

### PROMPT 03~07 — (v2와 동일)

```
PROMPT 03: 채용 대시보드 + 채용공고 CRUD + AI 신뢰도 위젯
PROMPT 04: 사전 질의서 시스템
PROMPT 05: 지원자 면접 녹화 페이지
PROMPT 06: 음성 분석 엔진 + STT 연동
PROMPT 07: 인재상 매칭 엔진

모두 v2와 동일합니다.
단, PROMPT 04 사전 질의서에서 아래 항목 추가:

사전 질의서 기본 템플릿에 추가 질문:
  - "생년월일" (날짜 — 필수)
  - "양력/음력" (선택형: 양력/음력 — 필수)
  - "생시" (선택형: 모름/자시~해시 — 선택)
  - "MBTI" (선택형: 16가지 + 모름 — 선택)

수집된 데이터 → candidates.metadata에 저장
```

---

### PROMPT 08 — AI 종합 분석 + 신뢰도 + 사주/MBTI 연동 (v3 업데이트)

```
v2 PROMPT 08에 추가:

AI 종합 분석 파이프라인에 사주/MBTI 분석 단계 추가:

기존 파이프라인:
  Step 1: 음성 분석
  Step 2: STT 변환
  Step 3: 인재상 매칭
  Step 4: AI 종합 분석

v3 추가:
  Step 3.5: 사주/MBTI 분석 (candidates.metadata에서 데이터 있으면 실행)
    - birth_date + birth_date_type + birth_time → 사주 분석 프롬프트 실행
    - mbti_type → MBTI 분석 프롬프트 실행
    - 둘 다 있으면 → 교차 분석 프롬프트 실행
    - 결과를 Step 4 통합 프롬프트에 포함

Step 4 통합 프롬프트에 추가:
  "## 지원자 사주/MBTI 분석 (참고 자료)
   사주 분석: {saju_result 요약}
   MBTI 분석: {mbti_result 요약}
   교차 분석 직무 추천: {top_3_roles}
   현재 지원 직무 적합도: {current_fit_score}
   
   위 사주/MBTI 분석도 참고하여 종합 평가에 반영하세요.
   단, 사주는 참고 수준으로만 반영하고, 면접 답변과 음성 분석이 우선합니다."

recruitment_reports.talent_match에 추가:
  saju_mbti_analysis: {
    saju_summary: '...',
    mbti_type: 'ENFP',
    integrated_fit_score: 78,
    job_recommendation: '마케팅팀 추천',
    personality_note: '...'
  }
```

---

### PROMPT 09 — 지원자 분석 리포트 (v3: 사주/MBTI 탭 추가)

```
v2 PROMPT 09의 6탭에 1탭 추가 → 총 7탭:

탭 1: 📊 종합 대시보드 (v2 동일)
탭 2: 🎯 인재상 매칭 (v2 동일)
탭 3: 🎙️ 음성 분석 (v2 동일)
탭 4: 📝 답변 내용 (v2 동일)

탭 5: 🔮 사주/MBTI 분석 ← v3 신규
  ★ 이 탭은 임원(admin/executive) 역할에게만 표시
  ★ 사전 질의서에서 데이터를 수집한 경우에만 표시

  ┌──────────────────────────────────────────────────┐
  │  🔮 사주/MBTI 직무분석                             │
  │                                                  │
  │  ┌─────────────────┐  ┌─────────────────┐       │
  │  │ 사주 분석        │  │ MBTI 분석        │       │
  │  │                 │  │                 │       │
  │  │ 일간: 甲木      │  │ 유형: ENFP       │       │
  │  │ 오행: 목화 과다  │  │ "활력 넘치는      │       │
  │  │                 │  │  캠페이너"        │       │
  │  │ 직무 적합도:     │  │                 │       │
  │  │    72점         │  │ 직무 적합도:      │       │
  │  │                 │  │    81점          │       │
  │  └─────────────────┘  └─────────────────┘       │
  │                                                  │
  │  교차 분석 종합:                                    │
  │  "사주와 MBTI 모두 소통력·창의성이 강한 유형.         │
  │   마케팅/기획 직무에 가장 적합하며,                   │
  │   세밀한 숫자 관리(재무회계)는 다소 어려울 수 있음."   │
  │                                                  │
  │  추천 직무: ① 마케팅 ② 기획 ③ 영업                 │
  │  현재 지원 직무(재무회계) 적합도: 58점 ⚠              │
  │                                                  │
  │  성격 태그: #소통형 #창의적 #열정적 #변화지향          │
  │  리더십 스타일: 영감형 리더                          │
  │  팀 내 역할: 아이디어 제너레이터                     │
  │                                                  │
  │  📌 임원 참고사항:                                  │
  │  "이 지원자는 현 지원 직무보다 마케팅에 더 적합할      │
  │   수 있습니다. 면접 시 직무 전환 가능성을 타진해보세요."│
  └──────────────────────────────────────────────────┘

탭 6: 🤖 AI 종합 분석 (v2 동일)
탭 7: ✅ 의사결정 (v2 동일)

나머지(신뢰도 배너, 비교 기록 등)는 v2와 동일합니다.
```

---

### PROMPT 10~11 — (v2와 동일)

```
PROMPT 10: AI 신뢰도 대시보드
PROMPT 11: 면접 녹음/녹화 업로드 + 분석

모두 v2와 동일합니다.
```

---

### PROMPT 12 — 이메일 + 직원연동 + 수습 + 사주/MBTI 이전 (v3 업데이트)

```
v2 PROMPT 12에 추가:

합격 → 직원 등록 시 사주/MBTI 데이터 자동 이전:

1. 기존: hiring_decisions → employees 연동 (v2)
2. v3 추가:
   candidates.metadata에서 birth_date, birth_date_type, birth_time, mbti_type 추출
   → employee_profiles 테이블에 자동 INSERT
   → 채용 과정에서 이미 실행된 사주/MBTI AI 분석이 있으면
     personality_analysis 테이블에도 복사 (recruitment_reports에서)
   
   이를 통해 합격자는 직원 등록 즉시 사주/MBTI 분석이 준비된 상태

나머지(이메일, 수습 연결)는 v2와 동일합니다.
```

---

### PROMPT 13~14 — (v2와 동일)

```
PROMPT 13: 통합 대시보드 + 반응형 + 보안
PROMPT 14: Phase 자동 판정 + 알림 시스템

모두 v2와 동일합니다.
```

---

### PROMPT 15 — 사주/MBTI 직무분석 시스템 (v3 신규)

```
직원들의 생년월일과 MBTI를 입력받아 AI가 직무분석을 수행하고,
임원진에게만 먼저 공개하며, 이후 단계적으로 공개 범위를 넓히는 시스템입니다.

## STEP 1: 직원 프로필 입력 UI

기존 직원관리 페이지를 확인하고, 직원 상세/편집 페이지에 추가:

"사주/MBTI 정보" 섹션:
┌──────────────────────────────────────────────────┐
│  🔮 사주/MBTI 정보                                │
│                                                  │
│  생년월일: [    년] [  월] [  일]  ○양력 ○음력     │
│  생시:     [▼ 선택] (모름/자시/축시/.../해시)       │
│  MBTI:     [▼ 선택] (모름/ISTJ/ISFJ/.../ENFP)    │
│  혈액형:   [▼ 선택] (모름/A/B/O/AB) — 선택사항     │
│                                                  │
│  [저장] [AI 분석 실행]                              │
└──────────────────────────────────────────────────┘

"AI 분석 실행" 버튼 클릭 시:
  - 사주 분석 프롬프트 실행 (birth_date가 있으면)
  - MBTI 분석 프롬프트 실행 (mbti_type이 있으면)
  - 둘 다 있으면 교차 분석까지 실행
  - 결과 → personality_analysis 테이블에 저장
  - 진행 상태: "사주 분석 중..." → "MBTI 분석 중..." → "교차 분석 중..." → "완료"

직원 리스트 페이지에서도 일괄 관리:
  - "사주/MBTI 미입력" 필터
  - 입력 현황 통계: "전체 40명 중 28명 입력 완료 (70%)"

## STEP 2: 직원별 분석 리포트 페이지

URL: /admin/employees/analysis/:employeeId

★ 이 페이지는 useAuth()로 현재 사용자 역할을 확인하여:
  - admin/executive: 전체 내용 표시
  - leader: profile_visibility_settings.show_to_leaders가 true이면 허용 필드만 표시
  - employee (본인): profile_visibility_settings.show_to_self가 true이면 허용 필드만 표시
  - 그 외: "열람 권한이 없습니다"

임원용 전체 리포트:
┌──────────────────────────────────────────────────┐
│  🔮 김영석 — 사주/MBTI 직무분석 리포트              │
│  마케팅팀 | 대리 | ENFP | 1994.05.12 (양력)       │
│                                                  │
│  ═══ 사주 분석 ═══                                │
│  일간: 甲木 | 오행: 목2 화3 토1 금1 수1             │
│  핵심 성격: 진취적, 창의적, 리더십 강함              │
│  업무 강점: 기획력, 대인관계, 추진력                 │
│  업무 약점: 세밀함 부족, 끈기                       │
│  직무 적합도: 현재 직무(마케팅) 82점 ✅             │
│                                                  │
│  ═══ MBTI 분석 ═══                               │
│  유형: ENFP "활력 넘치는 캠페이너"                  │
│  선호 업무: 창의적 기획, 프레젠테이션, 네트워킹       │
│  기피 업무: 반복적 데이터 정리, 엄격한 감사           │
│  현재 직무 적합도: 85점 ✅                         │
│                                                  │
│  ═══ 교차 분석 (사주 × MBTI) ═══                  │
│  종합 요약: 사주와 MBTI 모두 창의적·소통형 특성.     │
│  현재 마케팅 직무에 매우 적합. 유지 권장.            │
│                                                  │
│  추천 직무: ① 마케팅 ② 기획 ③ 영업                │
│  성격 태그: #소통형 #창의적 #열정적                  │
│                                                  │
│  📌 임원 전용 메모:                                │
│  "이 직원은 2~3년 내 팀장 후보로 고려할 만함.        │
│   다만 세밀한 업무(예산 관리 등)는 보완 필요."       │
│                                                  │
│  🏥 건강 참고: "소화기 관련 유의, 과로 주의"         │
│  👨‍👩‍👧 가정 참고: "2026년 가정에 경사 가능성"          │
│                                                  │
│  ⚠ 위 건강/가정 참고는 임원에게만 표시됩니다.        │
└──────────────────────────────────────────────────┘

## STEP 3: 전체 직원 성향 맵 (임원 전용)

URL: /admin/employees/analysis

직원 전체를 한눈에 보는 대시보드:
  - MBTI 분포 차트 (16유형 바차트)
  - 부서별 MBTI 구성 (부서별 파이차트)
  - 직무 적합도 랭킹 (적합도 높은 순 / 낮은 순)
  - 팀 궁합 분석:
    "마케팅팀: ENFP 2명 + ISTJ 1명 + ENTP 1명
     → 창의성은 풍부하나 실행력 보완 필요. ISTJ인 김OO가 핵심."
  - "분석 미완료 직원" 리스트 → "일괄 분석" 버튼

## STEP 4: 공개 설정 토글 (설정 페이지)

기존 설정 페이지에 섹션 추가:

┌──────────────────────────────────────────────────┐
│  🔒 사주/MBTI 공개 설정                            │
│                                                  │
│  ┌─────────────────────────────────────────┐     │
│  │ 리더/팀장에게 공개                        │     │
│  │ 팀장급이 소속 팀원의 사주/MBTI 분석을      │     │
│  │ 열람할 수 있습니다.                       │     │
│  │                            [🔘 OFF]     │     │
│  │ 공개 항목: □ MBTI 분석  □ 업무 성향       │     │
│  │           □ 팀 역할    □ 직무 적합도      │     │
│  └─────────────────────────────────────────┘     │
│                                                  │
│  ┌─────────────────────────────────────────┐     │
│  │ 본인에게 공개                             │     │
│  │ 직원 본인이 자신의 사주/MBTI 분석을        │     │
│  │ 열람할 수 있습니다.                       │     │
│  │                            [🔘 OFF]     │     │
│  │ 공개 항목: □ MBTI 분석  □ 성격 특성       │     │
│  │           □ 자기계발 조언  □ 직무 적합도   │     │
│  └─────────────────────────────────────────┘     │
│                                                  │
│  ⚠ 건강/가정 참고, 보직 변경 추천은                 │
│    토글과 무관하게 항상 임원에게만 표시됩니다.        │
│                                                  │
│  [설정 저장]                                       │
└──────────────────────────────────────────────────┘

토글 변경 시:
  - profile_visibility_settings 테이블 UPDATE
  - 즉시 반영 (페이지 새로고침 시 적용)
  - 변경 이력 로깅 (누가 언제 변경했는지)

## STEP 5: 역할별 UI 분기

현재 사용자 역할에 따라 다르게 보여지는 로직:

const { user, role } = useAuth();
const { showToLeaders, showToSelf } = useVisibilitySettings();

// 직원 상세 페이지에서
if (role === 'admin' || role === 'executive') {
  // 전체 분석 결과 표시 (건강, 가정, 보직 추천 포함)
  return <FullAnalysisReport />;
} else if (role === 'leader' && showToLeaders) {
  // 허용된 필드만 표시 (MBTI, 업무성향, 팀역할)
  return <LimitedAnalysisReport fields={leaderVisibleFields} />;
} else if (isOwnProfile && showToSelf) {
  // 본인용: 자기계발 중심 (보직추천, 임원메모 제외)
  return <PersonalAnalysisReport fields={selfVisibleFields} />;
} else {
  // 사주/MBTI 섹션 자체를 숨김
  return null;
}

## 주의사항
- 사주 분석은 "참고 자료"임을 항상 명시 (과학적 근거가 아님)
- 건강/가정 관련 내용은 민감 정보 → 임원 외 절대 비공개
- 보직 배치 추천은 임원 전용 → 리더/본인에게 비공개
- AI 호출은 기존 Gemini/Claude API 패턴을 따름
- 사주 계산의 양력→음력 변환은 AI에게 맡김 (공식 라이브러리 불필요)
- 기존 employees 테이블은 수정하지 않고 employee_profiles로 별도 관리
```

---

## 8. 업데이트된 개발 일정 (v3 — 5일 스프린트)

```
Day 1: 3/13 (금) — 기반 설정 + DB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  오전: PROMPT 01 (구조 파악 + 라우팅 + 메뉴)
        → 사주/MBTI 라우트 2개 + 메뉴 추가 포함
  오후: PROMPT 02 (DB 15개 테이블 + 트리거 + RLS)
        → employee_profiles + personality_analysis + visibility_settings 포함

Day 2: 3/16 (월) — 채용 CRUD + 사전 질의서
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  오전: PROMPT 03 (채용 대시보드 + 공고 목록)
  오후: PROMPT 04 (공고 CRUD + AI 질문 + 사전 질의서)
        → 질의서에 생년월일/MBTI 질문 포함

Day 3: 3/17 (화) — 면접 + 분석 엔진
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  오전: PROMPT 05 (면접 녹화) + PROMPT 06 전반 (음성 분석)
  오후: PROMPT 06 후반 (STT) + PROMPT 11 (녹음 업로드)

Day 4: 3/18 (수) — 인재상 + AI 분석 + 리포트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  오전: PROMPT 07 (인재상) + PROMPT 08 (AI 종합 + 사주/MBTI 연동)
  오후: PROMPT 09 (분석 리포트 7탭 — 사주/MBTI 탭 포함)

Day 5: 3/19 (목) — 신뢰도 + 사주시스템 + 배포 ★완료
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  오전: PROMPT 10 (AI 신뢰도) + PROMPT 15 (사주/MBTI 직무분석 시스템)
  오후: PROMPT 12~14 (이메일+연동+통합+배포) + 실전 테스트
```

---

## 9. 비용 (변경 없음)

| 항목 | 기존 | 추가 | 합계/월 |
|------|------|------|---------|
| Supabase Pro | $25 | — | $25 |
| Gemini API | ~$5 | ~$7 (사주/MBTI 분석 추가) | ~$12 |
| Whisper API (선택) | — | ~$5 | ~$5 |
| Cloudflare Pages | $0 | — | $0 |
| **합계** | **~$30** | **~$12** | **~$42 (₩58,000)** |

> 사주/MBTI 분석은 직원당 1회만 실행 → 40명 기준 약 $2 추가 (초기 일회성)
> 이후 신규 입사자 때만 추가 비용 발생

---

## 10. 실전 운영 시나리오 (Phase A + 사주/MBTI)

```
Week 1: MVP 배포 완료 (3/19)
━━━━━━━━━━━━━━━━━━━━━━━
  임원진(오영근 대표, 강재웅 이사)에게 시스템 안내
  직원 생년월일/MBTI 입력 요청 (직원 스스로 입력 또는 인사담당자 일괄 입력)
  → 입력 완료된 직원부터 "AI 분석 실행" → 임원진에게 결과 공유

Week 2~3: 사주/MBTI 결과 활용 시작
━━━━━━━━━━━━━━━━━━━━━━━
  임원진이 직원 분석 결과 검토
  수습 배치, 팀 구성, 보직 변경 시 참고 자료로 활용
  채용 면접 시 지원자의 사주/MBTI도 함께 확인

  이 시점에서는 토글 모두 OFF:
    → 리더/팀장: 사주/MBTI 모름
    → 직원 본인: 사주/MBTI 모름
    → 임원만 조용히 활용

Week 4+: 단계적 공개 검토
━━━━━━━━━━━━━━━━━━━━━━━
  임원진이 "팀장들에게도 보여주면 팀 관리에 도움되겠다" 판단 시
  → 설정에서 [리더/팀장 공개] 토글 ON
  → 팀장급이 소속 팀원의 MBTI, 업무 성향 열람 가능
     (건강/가정/보직추천은 여전히 비공개)

  나중에 "직원들도 자기 분석 결과 보면 자기 계발에 도움되겠다" 판단 시
  → [본인 공개] 토글 ON
  → 직원 본인이 MBTI 분석, 자기계발 조언 열람 가능
     (임원 메모, 보직추천은 여전히 비공개)
```

---

## 11. PROMPT 실행 시 주의사항 (v3 업데이트)

```
✅ 반드시 지킬 것:
  - 매 프롬프트 시작 시 기존 코드를 먼저 읽고 파악
  - 기존 파일 수정은 최소화
  - 기존 컴포넌트, 스타일, 쿼리 패턴을 동일하게 따름
  - 기존 색상 테마 (다크 + 골드 #D4A853) 유지
  - 기존 Supabase 테이블은 READ ONLY (ALTER 금지)
  - AI 신뢰도 로직은 트리거로 자동화
  - Phase 전환은 반드시 관리자 수동 승인
  - 사주/MBTI는 "참고 자료"로만 표현 (과학적 판단 아님)
  - 민감 정보(건강/가정)는 임원 외 절대 비공개
  - employee_profiles를 employees와 별도 테이블로 관리 (기존 테이블 수정 금지)

❌ 절대 하지 말 것:
  - 기존 employees/evaluations 테이블 구조 변경
  - Phase 자동 전환 (사람 승인 없이)
  - 리포트에서 AI 추천을 "결정"으로 표현
  - Phase A에서 AI 단독 면접 기능 활성화
  - 사주/MBTI 결과를 채용 합불합격의 결정적 근거로 표현
  - 건강/가정 정보를 임원 외에 노출
  - visibility 토글이 OFF인데 리더/본인에게 데이터 반환
```

---

*이 문서는 v3 업데이트로 사주/MBTI 직무분석 시스템이 추가된 개발 계획서입니다.*
*사주/MBTI는 임원진에게만 먼저 공개되며, 관리자 토글로 단계적 공개를 제어합니다.*
*AI는 처음부터 판단하지 않고, 데이터로 신뢰를 증명한 후에 권한이 확대됩니다.*
