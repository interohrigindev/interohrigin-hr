# HR 플랫폼 업데이트 개발계획서 — SOS 긴급연차 개편 외

- 작성일: 2026-05-29
- 범위: 긴급연차 SOS 개편 / 연차 결재·이메일 수정 / 채용 대시보드 개선 / 연차 현황 대시보드 / 법무·노무사 검토 항목
- 진행 방식: `/pdca cto-lead` 오케스트레이션 (기능별 PDCA 사이클)

## 0. 절대 규칙·제약 (CLAUDE.md)
- 기존 테이블 ALTER 금지: `employees`, `evaluations`, `evaluation_items`, `users` → 신규 컬럼 필요 시 별도 테이블 또는 ALTER 허용 테이블(`leave_requests`, `emergency_leave_requests`, `candidates`, `job_postings` 등) 사용
- AI 추천은 "결정"이 아닌 "제안/권장" 표현 (사주/직무적합성·면접질문 모두 적용)
- 민감정보(건강/가정) 임원 외 비공개 → SOS 사유·증빙은 기존 `EMERGENCY_NOTIFY_ROLES`(hr_admin/ceo/director) 한정 유지
- 한국어 UI, 날짜 YYYY.MM.DD, 모바일 반응형 필수
- Phase 자동 전환 금지(관리자 수동 승인)
- 코드 수정은 Edit(부분 수정), 수정 후 반드시 빌드 검증
- 마이그레이션은 `scripts/db-exec.mjs`로 적용(콘솔 수동 불필요), main push = Cloudflare 자동 배포

## 0-1. 현행 자산 (재사용 기반)
- 긴급연차: `src/routes/hr-ops/leave.tsx`([일반]/[긴급] 토글, `reqMode`/`emgKind`/대리인), `emergency_leave_requests` 테이블, `EMERGENCY_NOTIFY_ROLES`, `emergencyLeaveNotificationEmail`(`src/lib/email-templates.ts`)
- 연차 잔여 계산: `src/lib/leave-calculator.ts`
- 결재: `src/routes/hr-ops/approval.tsx`(`doc.content` 렌더, `linked_leave_id` 보유), `ApprovalLineViewer`
- 채용: `src/routes/recruitment/dashboard.tsx`, `candidate-report.tsx`(`second_interview_questions`), `src/lib/recruitment-ai.ts`(`generateInterviewQuestions`/`generateSecondInterviewQuestions`), 사전질의 생년월일/MBTI/한자이름 수집(`survey-manage.tsx`)
- 연차 현황/촉진: `src/routes/admin/leave-promotion.tsx`, `src/routes/my/leave-promotion.tsx`

---

## 🔴 F1. SOS 긴급연차 개편 (최우선 / 긴급)
기존 "긴급연차"를 **SOS**로 재브랜딩하고 신청 플로우를 다단계로 재설계. 무분별한 사용 억제 + 직관적 인지 목적.

### F1-1. 네이밍·재배치 (UX)
- "긴급연차" → **"SOS"** 명칭 변경
- 메인 화면 **최상단 좌측**에 **빨간색 SOS 버튼** 배치 (직관 인지 + 사용 억제)
- 영향: 사이드바/홈(`src/components/layout/Sidebar.tsx`, `src/routes/home.tsx`), `leave.tsx` 진입 동선
- 리스크: 메인 레이아웃 변경 → 다른 메뉴 회귀 점검 필요

### F1-2. 신청 전 경고 팝업 (강제 노출, ⚠️ 법무 검토)
신청 진입 시 강제 노출. 포함 내용:
1. 현재 잔여 연차 개수 (`leave-calculator.ts`)
2. 사용 후 잔여 개수 예고
3. 연차 없을 시 경고: 무급 / 만근 미달 / 다음달 연차 미생성
4. 24시간 내 증빙 미제출 시 무단결근 처리 안내
5. "신청하시겠습니까?" 쿠팡식 최종 확인 단계
- 리스크: 문구 **법무 검토 필요** → 구조 먼저 구현 + 문구는 DRAFT 상수로 분리(추후 교체 용이)

### F1-3. 신청 사유 유형 + 다단계 플로우 (플로우 재설계)
- 사유 유형 선택: 갑작스러운 질병 / 가족 경조사 / 교통사고 등 (확장 가능 enum)
- 단계: **유형 선택 → 대리인 선택 → 병원 방문 예정 기재 → 최종 제출**
- 영향: `emergency_leave_requests` 신규 컬럼(`reason_type`, `hospital_visit_plan` 등) → ALTER 허용 테이블, 마이그레이션 필요
- 기존 대리인(`delegate_employee_id`/`delegate_name_text`) 재사용

### F1-4. 신청 완료 안내 팝업 (UX)
- 완료 후 안내 메시지 노출
- **오전 진료 후 오후 출근 선택지 안내**(반차 유도 → 연차 절약) 포함

### F1 의존성/규모
- DB 마이그레이션 1건(컬럼 추가) + leave.tsx 대규모 UI 재구성 + 홈/사이드바 + 이메일 본문(F2-2와 연계)
- 규모: 大 (PDCA 1~2 사이클 권장, 다단계로 분할)

---

## 🟡 F2. 연차 결재·이메일 수정 (개선/버그)

### F2-1. 결재 화면 신청 내용 표시 (버그)
- 현상: 결재자(예: 보미 팀장)가 연차 결재 화면에서 **아무 내용도 안 보임**
- 원인 추정: `approval.tsx`가 `doc.content`만 렌더 → 연차 데이터는 `linked_leave_id`(leave_requests)에 있어 content가 비어 표시 누락
- 수정: doc_type=`leave`일 때 `linked_leave_id`의 leave_requests(사유·날짜·유형·반차여부 등)를 조회/표시. **모든 연차 결재가 세부 내용 표시되도록 UI 재구성**
- 영향: `approval.tsx`(상세 모달 + 상세 페이지 양쪽 렌더 1201/1701 라인)

### F2-2. 이메일 알림 본문 자체완결 (버그)
- 현상: 이메일 알림이 페이지 링크 의존 → 링크 없이 **본문 확인만으로 끝나도록**
- 수정: `emergencyLeaveNotificationEmail`(및 관련 연차 알림)에 신청 내용 전체를 본문 표로 포함, 불필요한 CTA 링크 제거
- 영향: `src/lib/email-templates.ts`

### F2 규모: 中 (PDCA 1 사이클)

---

## 🔵 F3. 긴급연차(SOS) 반복 사용 정책 (노무사 검토 대기)
- 단계별 절차 강화: 1~2회 간편, **3회부터 강화** 방식
- 인센티브 방식 **제외**
- 증빙 미제출 시 무단결근 처리
- 상태: **노무사 컨펌 필요** → 정책 수치·문구 확정 전까지 **구조(횟수 카운트, 단계별 분기)만 설계**하고 문구/임계값은 파라미터화. F1-2 경고문과 연동.
- 규모: 中 (F1과 결합, 노무사 확정 후 활성화)

---

## 🔵 F4. 채용 대시보드 개선 (일반)

### F4-1. 사주 기반 직무 적합성 분석 (AI 추가)
- 기존 MBTI/적성검사 → **이름 + 생년월일** 기반 사주 직무 적합성 분석 추가
- 사전질의에서 생년월일/한자이름 수집됨(`survey-manage.tsx`) → 입력원 확보
- `generateAIContent` + 신규 feature key(`saju_job_fit`) 패턴 재사용, 결과는 **"제안/권장" 어조** 고정
- 저장: `candidates` 신규 컬럼 또는 `resume_analysis` 활용(ALTER 허용)
- 리스크: 사주=비과학적 → "참고용 제안"으로 명확히 표기(차별 소지 법무 확인 권장)

### F4-2. 면접 지원 직무 변경 기능 (직무 전환)
- 강 이사 권한으로 지원자 직무 전환(재무→인사 등): `candidates.job_posting_id` 변경
- 직무 변경 시 **해당 직무 AI 추천 질문 자동 변경**(`generateInterviewQuestions` 재호출 → #5 작업과 연계)
- **대표 확인 시 변경 이력 표시**(변경 로그 테이블/컬럼)
- 영향: 지원자 상세/대시보드, 권한 RLS, 변경 이력 저장

### F4-3. 대면 면접 STT 자동 저장 (검토/논의)
- 1차 화상: 스크립트 자동 저장 이미 가능
- 대면: 녹음 후 매핑 방식 논의 중 → **입력란 제거 + 자동 채움** 방식 검토
- 상태: 기술 검토 단계(Whisper STT 파이프라인, 녹음 업로드 동선) → PoC 후 결정
- 규모: F4-1/2 = 中, F4-3 = 검토(별도)

---

## 🔵 F5. 연차 현황 대시보드 가독성 개편 (UI)
- 상단에 **이름 + 잔여 연차 수 + 연차 촉진 필요 여부**만 노출, 나머지는 클릭 시 확장
- **눈이 불편한 임원 가독성** 고려: 폰트 크게/레이아웃 단순화
- 영향: `src/routes/admin/leave-promotion.tsx` 등 연차 현황 화면
- 규모: 中 (PDCA 1 사이클)

---

## 권장 진행 순서 (PDCA 분할)
1. **F2 (버그 2건)** — 즉시 효과·저위험. 결재 내용 표시 + 이메일 본문화
2. **F1 (SOS 개편)** — 긴급. F1-1 재배치 → F1-3 플로우 → F1-2 경고팝업(문구 DRAFT) → F1-4 완료안내
3. **F5 (연차 현황 가독성)** — 임원 요청, 독립적
4. **F4-1/F4-2 (사주 분석 / 직무 변경)** — 채용, #5 작업과 연계
5. **F3 (반복사용 정책)** — 노무사 확정 후 활성화
6. **F4-3 (대면 STT)** — PoC/논의 후

## 검토·확인 필요 (착수 전)
- ⚠️ **법무**: F1-2 경고 팝업 문구, F4-1 사주 분석 채용 활용(차별 소지)
- ⚖️ **노무사**: F3 반복사용 절차 강화 수치/무단결근 처리
- ❓ "메인 화면 최상단 좌측" = 사이드바 상단인지 홈 대시보드 상단인지 확정 필요
- ❓ SOS 사유 유형 최종 목록(질병/경조사/교통사고 외)
- ❓ F4-2 변경 이력 노출 범위(대표 전용 vs 전체)
