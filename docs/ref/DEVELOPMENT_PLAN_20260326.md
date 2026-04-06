# HR 플랫폼 개발 계획 — 2026.03.26 미팅 전수 분석

> 최종 업데이트: 2026.03.27
> 미팅 일시: 2026.03.26 (목) 오후 3:50 ~ 6:01 (131분)
> 참석자: 차주용 대표, 강제묵 이사, 최다혜, 황경미, 김영석 이사

---

## Context

2026.03.26 기능 사용 미팅 전체 내용 분석 + 현재 코드 구현 상태 교차 검토.
13개 개발 항목을 Phase A~D로 분류하여 우선순위 + 규모 + 자료 의존성을 정리.

**다음 미팅 목표**: 2026.03.31(화) — 채용관리 전체 프로세스 모의 테스트

---

## Phase A — 즉시 (코드 1~2줄, 당일 처리)

### A-1. 면접 안내 이메일 문구 추가
- **요청**: '모든 안내는 이메일로 발송됩니다' 문구 삽입
- **파일**: `src/lib/email-templates.ts` — 면접 안내 이메일 템플릿 본문에 추가
- **규모**: 소 ⭐

### A-2. AI 추천 면접 질문 재노출
- **요청**: 강제묵 이사 — 화상/대면 면접 시 면접관 화면에 AI 질문 표시
- **현황**: `job-detail.tsx` L217에 코드 존재하나 이전에 숨김 처리됨
- **작업**:
  - `src/routes/recruitment/job-detail.tsx` — 주석 해제 또는 조건 복원
  - `src/routes/recruitment/candidate-report.tsx` L91 — 면접관 탭에도 AI 질문 노출
- **규모**: 소 ⭐

---

## Phase B — 긴급 (3/31 전 완료 — 모의 테스트 대비)

### B-1. 합격 이메일 커스터마이징 ⚡
- **요청**: 합격 메일에 조건 입력란 추가
- **현황**: `candidate-report.tsx` L359~430에 기본 발송 로직 구현. 조건 입력란 없음
- **작업**:
  1. `candidate-report.tsx` — 합격 결정 Dialog에 입력 필드 추가:
     - 연봉 (숫자 입력, 단위: 천 원)
     - 수습 기간 급여 (숫자 입력)
     - 정규직 전환 급여 (숫자 입력)
     - 직무명 (텍스트)
     - 입사 예정일 (날짜 picker)
  2. `src/lib/email-templates.ts` — `hiringAcceptEmail()` 함수 수정:
     - 이메일 본문에 위 조건 항목을 정렬된 리스트로 표시
  3. DB 저장:
     - 입력값을 `hiring_decisions.data` jsonb에 저장
     - JSON 구조: `{ salary, probation_salary, regular_salary, job_title, start_date }`
- **자료 대기**: 불합격 메일 양식 (강제묵 이사, 3/27) → 수신 후 `hiringRejectEmail()` 수정
- **규모**: 중 ⚙️

### B-2. 합격자 응답 페이지 신규 개발 🆕
- **요청**: 합격 조건 확인 + 연봉 협상/입사일 조정 의견 작성 → 임원 자동 알림
- **URL**: `/accept/:token` (외부 접근, 로그인 불필요)
- **작업**:
  1. `src/routes/recruitment/accept-offer.tsx` 신규 생성:
     - 토큰으로 `hiring_decisions` 조회
     - 합격 조건 표시 (B-1에서 저장된 salary, start_date 등)
     - 입력 폼:
       - "합격 조건에 동의하십니까?" (네/아니오)
       - 연봉 협상 의사 (없음 / 협상 희망 / 협상 금액 입력)
       - 희망 입사일 변경 (선택)
       - 기타 요청사항 (텍스트 에어리어)
     - 제출 시 `hiring_decisions.candidate_response` jsonb에 저장
       - JSON: `{ agreed: bool, salary_negotiation: { desired: bool, amount?: number }, start_date_change?: date, notes?: string }`
  2. `src/routes/recruitment/candidate-report.tsx` 수정:
     - 합격 이메일 발송 시:
       - 토큰 생성: `crypto.randomUUID()`
       - `hiring_decisions` 테이블에 `offer_token` 저장
       - 이메일 본문에 응답 페이지 링크 포함: `https://[domain]/accept/[token]`
  3. 제출 완료 시 자동 알림:
     - 해당 공고 담당자(부서 임원)에게 이메일 발송: "합격자 응답이 등록되었습니다."
     - 플랫폼 내 알림도 생성 (옵션)
  4. `src/routes/index.tsx` 라우트 추가:
     ```typescript
     { path: '/accept/:token', element: <AcceptOfferPage /> }
     ```
- **DB**: `hiring_decisions` 테이블 마이그레이션:
  ```sql
  ALTER TABLE hiring_decisions ADD COLUMN offer_token uuid UNIQUE;
  ALTER TABLE hiring_decisions ADD COLUMN candidate_response jsonb DEFAULT NULL;
  ```
- **규모**: 대 🔴

### B-3. 채용관리 전체 에러 수정 + 테스트 ✅
- **목표**: 3/31 모의 테스트에서 에러 없이 전 프로세스 작동
- **테스트 시나리오**:
  1. 공고 생성 → 지원 링크 복사 → 외부 접속 → 이력서/자기소개서 제출
  2. 대시보드 → 접수 확인 → "AI 분석 실행" → 결과 조회
  3. "사전 질의서 발송" → 지원자가 외부 링크로 응답 → "재분석" 실행
  4. 면접 일정 등록 → 이메일 발송 확인 → 면접관/지원자 URL 접근
  5. 음성 또는 영상 파일 업로드 → "AI 분석 실행" → 결과 표시
  6. "최종 분석 실행" → 종합 리포트 → "합격" 선택 → 이메일 발송 → 응답 페이지 로드
- **체크 항목**:
  - 모든 이메일 발송 (면접 안내, 합격 통지) 정상 동작
  - 외부 토큰 기반 페이지(`/apply`, `/survey`, `/interview`, `/accept`) 인증 없이 접근 가능
  - AI 분석 에러 없음
  - 각 단계별 상태 변경 정상
- **파일**: 채용 관련 전체 (`src/routes/recruitment/`, `src/components/recruitment/`)
- **규모**: 중 ⚙️

---

## Phase C — 이번 주 내 (4/1~4/4)

### C-1. 채용 공고 통합 리크루팅 페이지 🆕
- **배경**: 잡코리아/사람인 공고 5개 제한 → 직무 합쳐서 올리는 문제 해결
- **URL**: `/careers` (외부 공개, 로그인 불필요)
- **파일**: `src/routes/public/careers.tsx` 신규 생성

#### 섹션 구성 (위→아래 순서)

**① Hero 섹션**
- 배경: 다크 계열 풀스크린 (인터오리진 브랜드 컬러)
- 상단 레이블: `RECRUIT` (영문, 대문자, 포인트 컬러)
- 메인 카피: `(주)인터오리진아이엔씨에 도전하는 많은 인재들을 기다리고 있습니다.`
- 높이: `h-screen` 또는 `h-96`

**② 복지 섹션**
- 섹션 타이틀: `복지`
- 8개 카드 그리드 (번호 + 아이콘 + 제목 + 설명)
- 레이아웃: `grid-cols-2 md:grid-cols-4`
- 각 카드 구조:
  - 좌상단: 번호 (포인트 컬러, 큰 폰트)
  - 우상단: 아이콘 (lucide react)
  - 하단: 제목 + 설명

  | No | 제목 | 설명 | 아이콘 |
  |----|------|------|--------|
  | 01 | 휴가제도 | 리프레시 여름 휴가 제공으로 재충전의 기회 보장 | Plane |
  | 02 | OH! FRIENDLY DAY | 매월 1회, 직원들과의 랜덤 회식으로 유대감 강화 | Users |
  | 03 | 명절 혜택 | 설 & 추석 등 명절 상품권 지급 | Gift |
  | 04 | 경조사 지원 | 화환 제공, 경조 휴가 및 비용 지원 등 전방위 지원 | Heart |
  | 05 | 생일 복지 | 생일 파티, 케이크, 선물, 반차 제공으로 특별한 하루 선사 | Cake |
  | 06 | 건강 케어 | 사내 헬스키퍼 상주, 정기 건강검진 제공 | Heart |
  | 07 | 교육 및 성장 | 체계적인 신규 입사자 교육, 빠르고 유연한 승진 기회 제공 | BookOpen |
  | 08 | 근무환경 | 스마트 오피스 운영, 자율복장, 업무용 개인 노트북 지급, 초역세권 위치 | Briefcase |

**③ 인재상 섹션**
- 섹션 타이틀: `인재상`
- 5개 항목 (아이콘 + 설명 텍스트)
- 레이아웃: `grid-cols-3 md:grid-cols-5` 또는 수평 플렉스
- 각 항목:
  1. 조직문화에서의 원활한 커뮤니케이션
  2. 적극적이고 주도적인 자세
  3. 고객 만족과 클라이언트 지향적인 자세
  4. 변함없는 열정과 노력
  5. 시대에 맞는 트렌드에 대한 이해

**④ 채용 프로세스 섹션**
- 섹션 타이틀: `채용 프로세스`
- 3단계 스텝 (화살표 연결):
  ```
  01 서류전형 → 02 실무면접 → 03 최종입사
  ```
- 하단 안내: `※ 필수 제출서류: 이력서 및 자기소개서, 경력기술서, 포트폴리오`

**⑤ 채용 공고 섹션 (동적)**
- 섹션 타이틀: `현재 채용 중` + 공고 수 배지
- Supabase에서 `status = 'open'` 공고만 조회
- 카드 그리드 (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`):
  - 부서명, 공고 제목, 경력 구분, 고용 형태, 마감일, "지원하기" 버튼
- 공고 없을 경우: "현재 진행 중인 채용 공고가 없습니다" 안내

#### 추가 작업
- `src/routes/index.tsx` 라우트 추가: `{ path: '/careers', element: <CareersPage /> }`
- `src/routes/recruitment/jobs.tsx` 공고 상세에 `/careers` 공유 링크 추가
- **규모**: 대 🔴

### C-2. 전결 위임 실행 로직 구현 (핵심) ⚡
- **문제**: 현재 `approval_delegations`에 위임 등록만 됨. 실제 결재 처리 시 위임 체크 없음
- **결정**: 임원이 부재 팀장/리더의 결재를 같은 화면에서 한 번에 전결 처리
- **작업**:
  1. `src/routes/hr-ops/approval.tsx` 수정:
     - `handleApprovalAction()` 함수: 결재 처리 전 `approval_delegations` 체크
       ```typescript
       // 현재 사용자가 위임받은 결재가 있는지 확인
       const delegatedApprovals = await supabase
         .from('approval_delegations')
         .select('*')
         .eq('delegate_id', employeeId)
         .gte('end_date', new Date().toISOString())
       ```
     - "대행 결재 필요" 섹션 추가 (위임받은 결재자 화면 좌측에):
       - 부재 중인 결재자(delegator_id)의 미결 건 목록 표시
       - 해당 건의 "전결 처리" 버튼 클릭 시:
         - 부재자의 결재 스텝 + 위임받은 임원 자신의 스텝 **동시 승인**
         - DB에 두 번의 승인 기록 추가 (delegated_by 플래그 표시)
     - 임원 간 전결도 동일 로직: 위임자가 임원인 경우 위임받은 임원이 한 번 클릭으로 처리
  2. DB 마이그레이션:
     ```sql
     ALTER TABLE approval_steps ADD COLUMN delegated_by uuid REFERENCES employees(id) DEFAULT NULL;
     -- delegated_by가 null이 아니면 이는 대행 결재로 처리된 결재
     ```
- **규모**: 대 🔴

### C-3. 결재 라인 강제 고정 ⚙️
- **결정**: 결재 라인은 문서 유형별로 강제 고정 (직원 변경 불가), 수신처/공유 범위도 강제
- **현황**: lock 기능 전혀 없음
- **작업**:
  1. `src/routes/hr-ops/approval.tsx` 수정:
     - 결재 신청 후 결재선 수정 UI 완전 비활성화:
       ```typescript
       // 결재 신청 완료 후 (status !== 'pending')
       disabled={status !== 'pending'}
       ```
     - 관리자(`role === 'admin'`)만 `approval_templates`에서 결재 라인 수정 가능
  2. DB 마이그레이션:
     ```sql
     ALTER TABLE approval_templates ADD COLUMN is_line_locked bool DEFAULT true;
     ALTER TABLE approval_templates ADD COLUMN fixed_recipients jsonb DEFAULT NULL;
     ALTER TABLE approval_templates ADD COLUMN fixed_cc jsonb DEFAULT NULL;
     -- fixed_recipients: [{ id, name, order }]
     -- fixed_cc: [{ id, name }]
     ```
  3. 결재 신청 시 로직:
     - 템플릿의 `is_line_locked = true`이면 `fixed_recipients` 그대로 복사
     - 사용자가 수정할 수 없게 UI 컨트롤 비활성화
- **규모**: 중 ⚙️

---

## Phase D — 자료 수신 후 진행

### D-1. 전자결재 양식 고도화
- **자료 대기**: 최다혜 팀장 → 각 양식별 입력 항목 텍스트 정리 (3/31 전)
- **대상 양식**:
  - 품의서: 제목, 목적, 금액, 지출 내역, 첨부파일
  - 지출결의서: 지출 일자, 항목, 금액, 적요, 영수증 첨부
  - 연장근무 신청서: 날짜, 시간, 사유, 업무 내용
  - 연차 신청서: 기간, 종류(연차/반차/반반차), 사유
  - 출장 신청서: 기간, 목적지, 목적, 예산
- **작업**: 각 양식의 `approval_templates` 데이터베이스 레코드 업데이트
  - `form_fields` 필드에 위 항목들을 JSON으로 정렬
- **파일**: `src/routes/hr-ops/approval.tsx`, `src/routes/hr-ops/approval-templates.tsx`
- **규모**: 중 ⚙️

### D-2. 증명서 발급 결재 프로세스 추가
- **현황**: 즉시 발급만 구현 (`certificates.tsx` L298~356)
- **결정**: 직원 신청 → 결재 → 승인 → PDF 출력
- **작업**:
  1. `src/routes/hr-ops/certificates.tsx` — 관리자 페이지:
     - "즉시 발급" 외 "결재 신청" 버튼 추가 (중복 버튼 아님, 옵션 선택)
  2. `src/routes/my/certificates.tsx` — 직원 셀프서비스:
     - 직원이 "증명서 신청" → `approval_requests` 테이블에 INSERT
     - 증명서 유형, 발급자, 필요 사유 입력 → 결재 라인으로 라우팅
  3. 결재 완료 시 PDF 자동 생성:
     - `approval_requests` 상태 = 'approved' 시 트리거
     - 직원 이메일로 PDF 자동 발송
- **규모**: 중 ⚙️

### D-3. 합격 → 직원 정보 자동 생성 개선 🔄
- **현황**: `employees/exit.tsx`에서 수동 등록 방식 (관리자 수동 버튼 클릭)
- **자료 대기**: OJT 계획서 템플릿 (이민지 님 복귀 후, 3/27)
- **작업**:
  1. `src/routes/recruitment/candidate-report.tsx` 수정:
     - 합격 확정 시 "직원 자동 등록" 옵션 추가 (체크박스):
       ```
       ☐ 직원 정보를 자동으로 생성합니다 (사번 자동 부여)
       ```
     - 체크 시 → `employees` 테이블에 INSERT:
       - 사번 자동 부여 (기존 로직 사용)
       - 채용 기록 → `employees.recruitment_candidate_id`에 연결
     - 자동 등록 완료 시:
       - 해당 부서 임원(leader_id)에게 이메일:
         - 제목: `[OJT] 신입사원 ${candidate.name} 입사 예정 (${start_date})`
         - 본문: OJT 계획서 작성 요청 + 링크
  2. 입사 전일 미작성 시 반복 알림:
     - Supabase `pg_cron` 사용:
       ```sql
       SELECT cron.schedule('ojt_reminder', '0 9 * * *', $$
         SELECT notify_incomplete_ojt_plans();
       $$);
       ```
     - 또는 Edge Function scheduled job (매일 09:00 실행)
  3. DB 마이그레이션:
     ```sql
     ALTER TABLE employees ADD COLUMN recruitment_candidate_id uuid REFERENCES candidates(id) DEFAULT NULL;
     ```
- **규모**: 대 🔴

### D-4. 면접 녹화 파일 2주 자동 보관 후 삭제 ⏰
- **결정**: 강제묵 이사 — 블랙박스 방식, 2주 자동 보관 후 삭제
- **현황**: 수동 삭제만 구현 (`InterviewAnalysis.tsx` L468~482)
- **작업**:
  1. DB 마이그레이션:
     ```sql
     ALTER TABLE interview_recordings ADD COLUMN auto_delete_at timestamptz DEFAULT (now() + interval '14 days');
     ```
  2. Supabase Edge Function (scheduled, 매일 00:00 UTC):
     ```typescript
     // supabase/functions/auto-delete-interview-recordings/index.ts
     const { data: toDelete } = await supabase
       .from('interview_recordings')
       .select('id, recording_url, storage_path')
       .lte('auto_delete_at', new Date().toISOString())
       .eq('status', 'completed')

     // 각 파일을 Storage에서 삭제
     // 테이블 업데이트: status = 'deleted', recording_url = NULL
     ```
  3. 관리자 화면 (`candidate-report.tsx`):
     - "자동 삭제 예정일" 컬럼 추가 (리드온리)
     - "수동 삭제" 버튼은 유지
- **규모**: 중 ⚙️

### D-5. 급여 자동계산 고도화 💰
- **자료 대기**: 급여 계산 엑셀 파일 + 4대보험 요율 기준표 (강제묵 이사, 다음 주 내)
- **결정 사항**:
  - 기본급 + 수당(식대/연장/육아/차량) + 공제 자동계산
  - 4대보험 요율 기반 자동 계산 (국민연금, 건강보험, 고용보험, 산재보험)
  - 중도입사/퇴사 일할계산
  - 수습 → 정규직 전환 급여 차이 처리
  - 무급휴가 공제, 연차 미사용 수당, 상여금
  - 급여명세서 직원 이메일 자동 발송
- **파일 신규**:
  - `src/lib/payroll-calc.ts` — 급여 계산 엔진
  - `src/routes/hr-ops/payroll.tsx` — 관리 화면
  - `src/routes/my/payroll.tsx` — 직원 명세서 조회
- **규모**: 대 🔴

---

## 전체 우선순위 로드맵

| 순위 | 항목 | Phase | 기한 | 규모 | 자료 필요 | 비고 |
|------|------|-------|------|------|----------|------|
| 1 | A-1 면접 이메일 문구 추가 | A | 즉시 | 소 ⭐ | 없음 | 1줄 |
| 2 | A-2 AI 면접 질문 재노출 | A | 즉시 | 소 ⭐ | 없음 | 1~2줄 |
| 3 | B-1 합격 이메일 커스터마이징 | B | 3/31 | 중 ⚙️ | 불합격 양식 (강제묵 이사 3/27) | Dialog + Email |
| 4 | B-2 합격자 응답 페이지 | B | 3/31 | 대 🔴 | 없음 | 신규 페이지 + DB |
| 5 | B-3 채용 에러 수정 + 테스트 | B | 3/31 | 중 ⚙️ | 없음 | 모의 테스트 |
| 6 | C-1 통합 리크루팅 페이지 | C | 4/4 | 대 🔴 | 없음 | 외부 공개 페이지 |
| 7 | C-2 전결 위임 실행 로직 | C | 4/4 | 대 🔴 | 없음 | 핵심 기능 |
| 8 | C-3 결재 라인 강제 고정 | C | 4/4 | 중 ⚙️ | 없음 | UI 잠금 |
| 9 | D-1 전자결재 양식 고도화 | D | 자료 후 | 중 ⚙️ | 최다혜 팀장 3/31 | 양식 정리 후 |
| 10 | D-2 증명서 결재 프로세스 | D | 자료 후 | 중 ⚙️ | D-1 완료 후 | 워크플로우 연결 |
| 11 | D-3 합격→직원 자동 생성 | D | 자료 후 | 대 🔴 | OJT 템플릿 3/27 | cron job 포함 |
| 12 | D-4 녹화 파일 2주 자동 삭제 | D | 자료 후 | 중 ⚙️ | 구글 드라이브 연동 검토 | Edge Function |
| 13 | D-5 급여 자동계산 고도화 | D | 자료 후 | 대 🔴 | 엑셀+요율표 (다음주) | 새로운 모듈 |

---

## 진행 체크리스트

### ✅ 즉시 처리 (A Phase — 2026.03.27)
- [ ] A-1. 면접 안내 이메일 문구 추가
- [ ] A-2. AI 면접 질문 재노출

### 🔥 우선순위 높음 (B Phase — 2026.03.31 전)
- [ ] B-1. 합격 이메일 커스터마이징 (불합격 양식 수신 대기)
- [ ] B-2. 합격자 응답 페이지 (신규 개발)
- [ ] B-3. 채용 프로세스 모의 테스트

### 📅 이번 주 (C Phase — 2026.04.01 ~ 2026.04.04)
- [ ] C-1. 통합 리크루팅 페이지 (`/careers`)
- [ ] C-2. 전결 위임 실행 로직
- [ ] C-3. 결재 라인 강제 고정

### ⏳ 자료 수신 후 (D Phase)
- [ ] D-1. 전자결재 양식 고도화 (최다혜 팀장 자료 대기)
- [ ] D-2. 증명서 결재 프로세스
- [ ] D-3. 합격→직원 자동 생성 (OJT 템플릿 대기)
- [ ] D-4. 녹화 파일 2주 자동 삭제
- [ ] D-5. 급여 자동계산 고도화 (엑셀 파일 대기)

---

## 자료 의존성 요약

| 자료 | 필요 기한 | 담당자 | 대기 항목 |
|------|---------|--------|---------|
| 불합격 이메일 양식 | 3/27 (금) | 강제묵 이사 | B-1 |
| OJT 계획서 템플릿 | 3/27 (금) | 이민지 님 | D-3 |
| 전자결재 양식 항목 텍스트 | 3/31 (화) 전 | 최다혜 팀장 | D-1 |
| 급여 계산 엑셀 + 4대보험 요율 | 다음 주 내 | 강제묵 이사 | D-5 |
| 구글 워크스페이스 기업 계정 | 3/26 당일 | 경영지원팀 | 녹화 기능 활성화 |
| 인재상 정리 (공통 + 직무별) | 3/31 전 | 경영지원팀 | C-1, D-3 참고 |

---

## 현재 코드 상태 (참고)

| 항목 | 파일 | 현황 |
|------|------|------|
| AI 면접 질문 | `job-detail.tsx` L217 | 코드 존재, 숨김 상태 |
| 합격/불합격 이메일 | `candidate-report.tsx` L359 | 구현됨, 조건 입력란 없음 |
| 녹화 저장/삭제 | `InterviewAnalysis.tsx` L468 | 수동 삭제만, 자동 삭제 없음 |
| 위임 결재 | `approval.tsx` L541 | 등록만, 실행 로직 미구현 |
| 증명서 발급 | `certificates.tsx` L298 | 즉시 발급만, 결재 연결 없음 |
| 합격→직원 등록 | `employees/exit.tsx` L118 | 수동 등록, 자동 연결 없음 |

