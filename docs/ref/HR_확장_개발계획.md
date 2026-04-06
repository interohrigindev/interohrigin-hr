# INTEROHRIGIN HR 플랫폼 — 종합 확장 개발 계획서

## Context

직원들이 현재 HR 플랫폼을 1차 체험한 후 피드백을 제출했습니다. 핵심 피드백:
- **장점**: 관리 효율성, AI 활용, 깔끔한 디자인, 체계적 정리
- **문제**: 대시보드 복잡 (Monday.com처럼 가독성 개선 요청), 직원 등록 실패 버그
- **요청**: 급여/근태, 연차, 전자결재, 채용 강화, 긴급업무 강화, 게시판, 캘린더, 교육, Google 연동, Excel 업로드, 모바일

이 계획은 안정성을 최우선으로, 기존 시스템 무결성을 보장하면서 단계적으로 기능을 확장합니다.

---

## 현재 시스템 현황 (93% 완성)

| 모듈 | 상태 | 라우트 | DB 테이블 |
|------|------|--------|----------|
| 인사평가 | ✅ 완료 | 8개 | 12개 (READ-ONLY) |
| 채용관리 | ✅ 완료 | 10개 | 10개 |
| OJT/수습 | ✅ 완료 | 3개 | 5개 |
| 메신저 | ✅ 완료 | 1개 | 4개 |
| 프로젝트 보드 | ✅ 완료 | 5개 | 5개 |
| 직원관리 | ✅ 완료 | 5개 | 5개 |
| 업무관리 | ✅ 대부분 | 8개 | 4개 |
| 긴급업무 | ✅ 완료 | 4개 | 3개 |

**인프라**: React 19 + TypeScript + Vite 7 + Tailwind 3.4 + Supabase + Cloudflare Pages
**DB**: 120+ 테이블, 40개 마이그레이션, 120+ RLS 정책, 5개 Storage 버킷

---

## Phase 1: 긴급 수정 + 대시보드 개선 (2주)

### 1-1. 직원 등록 버그 수정 (S)

**원인 확인 완료**: [TabEmployees.tsx:300](src/components/settings/TabEmployees.tsx#L300)에서 `inviteForm.password`를 bcrypt 해싱 없이 RPC에 전달. [마이그레이션 013](supabase/migrations/013_fix_pgcrypto_create_employee.sql#L42)은 "클라이언트에서 bcrypt 해싱된 값"을 기대.

**수정**:
- `handleInvite()` 함수에서 `const hashedPassword = await bcrypt.hash(inviteForm.password, 10)` 추가
- `p_password: hashedPassword`로 변경
- 기존 등록 실패 직원은 비밀번호 변경 기능(정상 작동 확인됨, 474번 줄)으로 복구

**파일**: `src/components/settings/TabEmployees.tsx` 1개만 수정

### 1-2. 메인 대시보드 리디자인 (L)

**현재**: [home.tsx](src/routes/home.tsx) — 6개 정적 블록 네비게이션 (ADMIN_BLOCKS 배열)
**목표**: Monday.com 영감의 위젯 기반 통합 대시보드

**레이아웃 구조**:
```
┌──────────────────────────────────────────────────┐
│  인사말 + 날짜                                      │
├───────────┬───────────┬───────────┬──────────────┤
│ KPI 카드   │ KPI 카드   │ KPI 카드   │ KPI 카드     │
│(긴급업무)  │(프로젝트)  │(채용현황)  │(평가진행)     │
├───────────┴───────────┼──────────────────────────┤
│  긴급 업무 + 나의 할일   │  오늘의 일정              │
├────────────────────────┼──────────────────────────┤
│  프로젝트 파이프라인 요약 │  최근 메신저 알림          │
├────────────────────────┴──────────────────────────┤
│  팀별 업무 완료율 / 평가 진행률 차트                   │
└──────────────────────────────────────────────────┘
```

**역할별 위젯 구성**: CEO/임원은 전사 뷰, 리더는 팀 뷰, 직원은 개인 뷰

**신규 파일**:
- `src/components/dashboard/widgets/KPISummaryWidget.tsx`
- `src/components/dashboard/widgets/UrgentTasksWidget.tsx`
- `src/components/dashboard/widgets/ProjectPipelineWidget.tsx`
- `src/components/dashboard/widgets/ScheduleWidget.tsx`
- `src/components/dashboard/widgets/MessengerWidget.tsx`
- `src/hooks/useHomeDashboard.ts`

**수정 파일**: `src/routes/home.tsx` (리팩터링)
**DB 변경**: 없음 (기존 테이블 조회만)
**기존 훅 재사용**: `useDashboard`, `useProjectBoard`, `useUrgentTasks`

---

## Phase 2: 급여/근태/연차/전자결재 (4~5주)

### 2-1. 근태 관리 (XL)

**신규 테이블** (마이그레이션 041):
- `attendance_records` — employee_id, date, clock_in, clock_out, work_type, total_hours, overtime_hours
- `attendance_settings` — standard_start/end_time, grace_period, overtime_threshold

**접근**: 웹 기반 출퇴근 체크 (로그인 시 자동/수동 버튼). PC on/off 모니터링은 별도 에이전트 필요하므로 향후 과제.

**신규 파일**: `src/routes/attendance/index.tsx`, `src/hooks/useAttendance.ts`

### 2-2. 연차 관리 (L)

**신규 테이블** (마이그레이션 042):
- `leave_policies` — years_of_service 기반 연차 자동 부여 규칙
- `leave_balances` — employee_id, year, total/used/remaining_days
- `leave_requests` — leave_type, start/end_date, status (pending→approved→rejected)
- `leave_types` — annual, sick, special, half_day

**승인 워크플로우**: 인사평가 4단계 승인 흐름 패턴 재사용
**메신저 연동**: 승인/반려 시 시스템 메시지 자동 발송

### 2-3. 급여 관리 (XL)

**신규 테이블** (마이그레이션 043):
- `salary_info` — base_salary, allowances(jsonb), effective_from/to
- `payroll_records` — year, month, base_pay, overtime_pay, deductions(jsonb: 4대보험+세금), net_pay, status
- `severance_estimates` — years_of_service, avg_salary_3months, estimated_amount
- `tax_settings` — year, 보험요율, 소득세 구간(jsonb)

**보안**: RLS로 본인 + admin/ceo만 접근. 급여명세서 PDF는 `jspdf`(이미 의존성 포함) 사용.
**퇴직금 자동 계산**: employees.hire_date + salary_info 기반

### 2-4. 전자결재 (XL)

**신규 테이블** (마이그레이션 044):
- `approval_templates` — category(expense/leave/purchase/general), form_schema(jsonb), approval_line_default
- `approval_requests` — requester_id, title, form_data(jsonb), status, total_amount
- `approval_steps` — request_id, step_order, approver_id, status, comment
- `approval_attachments` — file_url, file_name, file_size

**기존 패턴 활용**: `evaluation_targets.status` 진행 방식과 동일한 다단계 승인
**메신저 연동**: 결재 요청/승인/반려 시 `messages` 테이블에 `message_type: 'system'` 삽입

---

## Phase 3: 채용 강화 + AI 고도화 (3주)

### 3-1. AI 이력서 스크리닝 강화 (M)

**기존 인프라 100% 활용**: `resume_analysis` 테이블 (마이그레이션 014), `ai-client.ts`
- 합격/불합격 자동 분류 (resume_analysis.recommendation 필드)
- 이력서 일괄 업로드 UI (`xlsx` 라이브러리 이미 포함)

### 3-2. 면접 자동 스케줄링 (L)

**신규 테이블** (마이그레이션 045):
- `interview_calendar_sync` — interviewer_id, provider(google/outlook), calendar_id, tokens
- `interview_auto_schedules` — candidate_id, proposed_slots(jsonb), selected_slot, calendar_event_id

**Google Calendar 연동**: Phase 5와 연계

### 3-3. AI 면접 비교 분석 (M)

기존 `interview_recordings`, `voice_analysis`, `transcriptions` 테이블 활용. 비교 분석 뷰 컴포넌트만 추가.

---

## Phase 4: 커뮤니케이션 + 업무 강화 (3~4주)

### 4-1. 긴급 업무 강화 (M)

**기존 테이블 확장** (마이그레이션 046): `urgent_tasks`에 nullable 컬럼 추가
- department_id, leader_id, sub_tasks(jsonb), confirm_status
- 워크플로우: 직원 편집 → 임원 확인

### 4-2. 사내 게시판 (L)

**신규 테이블** (마이그레이션 047):
- `bulletin_boards` — category(notice/general/qa/suggestion), title, content, is_pinned, view_count
- `bulletin_comments` — post_id, author_id, content, parent_comment_id (대댓글)

### 4-3. 전사 캘린더 (L)

**신규 테이블** (마이그레이션 048):
- `company_events` — event_type(meeting/interview/company/holiday/training), datetime, participants[], linked_candidate_id, linked_project_id, recurrence_rule

### 4-4. 교육 관리 (M)

**신규 테이블** (마이그레이션 049):
- `training_programs` — category(legal/mandatory/voluntary/certification), is_recurring
- `training_records` — employee_id, completion_date, expiry_date, certificate_url, status

**법정교육 추적**: 산업안전보건교육, 개인정보보호교육, 성희롱예방교육, 직장내 괴롭힘예방교육

---

## Phase 5: 시스템 연동 + 모바일 (3~4주)

### 5-1. Google Workspace 연동 (XL)

**기존 패턴 활용**: [slack.ts](functions/api/slack.ts) Cloudflare Pages Functions 프록시 패턴 그대로 적용
- `/functions/api/google.ts` 추가
- OAuth 2.0 인증 → `integration_settings` 테이블에 토큰 저장
- Gmail: 면접 초대 이메일 자동 발송
- Calendar: 면접 일정 + 전사 캘린더 양방향 동기화

### 5-2. Excel 업로드 자동 입력 (M)

**기존 의존성 활용**: `xlsx: ^0.18.5` (이미 package.json에 포함)
- 직원 일괄 등록, 급여 데이터, 교육 이력 템플릿 다운로드 → 업로드 → 파싱
- 신규 Storage 버킷: `document-uploads`
- 신규 테이블 (마이그레이션 050): `file_retention_policies` — bucket_name, retention_days, auto_delete

### 5-3. 모바일 최적화 — PWA (L)

**PWA 선택 근거**: Cloudflare Pages에서 추가 비용 $0, 코드 100% 재사용, 50~200명 규모에 적합
- 이미 반응형 구현 완료 (Sidebar 모바일 오버레이, Header 햄버거 메뉴)
- `manifest.json` + Service Worker 추가
- Web Push API로 푸시 알림 (FCM 연동)
- 메신저 모바일 UX 개선 (터치 제스처)

---

## 데이터베이스 확장 요약

### 신규 테이블: ~23개 (현재 120+ → 143+)

| Phase | 마이그레이션 | 테이블 수 | 주요 테이블 |
|-------|------------|----------|-----------|
| 1 | 없음 | 0 | 기존 조회만 |
| 2 | 041~044 | ~15 | attendance_*, leave_*, salary_*, payroll_*, approval_* |
| 3 | 045 | ~2 | interview_calendar_sync, interview_auto_schedules |
| 4 | 046~049 | ~5 | urgent_tasks 확장, bulletin_*, company_events, training_* |
| 5 | 050 | ~1 | file_retention_policies |

### 기존 테이블 수정 원칙

- **employees 등 평가 테이블**: 절대 ALTER 금지 (CLAUDE.md 원칙)
- **urgent_tasks**: nullable 컬럼만 추가 (기존 데이터 영향 없음)
- **integration_settings**: provider CHECK에 'google' 추가

---

## Supabase 요금제 권장

### 200명 확장 시 예측

| 항목 | 50명 (현재) | 200명 (목표) |
|------|-----------|-------------|
| DB 행 수 | ~10K~50K | ~200K~500K |
| 스토리지 | 1~5GB | 10~20GB |
| Realtime 동시접속 | 30~50 | 100~200 |
| 주요 증가 원인 | — | 근태 73K행/년, 메시지 |

### 권장: **Supabase Pro ($25/월)**

| 항목 | Free | **Pro ($25/월)** | Team ($599/월) |
|------|------|-----------------|---------------|
| 스토리지 | 1GB | **100GB** | 100GB |
| Realtime | 200 | **500** | 무제한 |
| Edge Functions | 500K/월 | **2M/월** | 무제한 |
| 200명 대응 | ❌ 불가 | **✅ 충분** | 여유 |

**면접 녹화 대량 저장 시 스토리지 추가 요금 가능 → 90일 보존 정책 권장**

---

## 통합 연동 매트릭스

```
연차 관리 ──→ 전자결재 (연차 신청 시 결재)
           ──→ 전사 캘린더 (승인된 연차 자동 반영)
           ──→ 근태 관리 (연차일 출근 기록 자동 처리)
           ──→ 메신저 (승인/반려 알림)

급여 관리 ──→ 근태 관리 (초과근무 수당 계산)
           ──→ 연차 관리 (미사용 연차 수당)

전자결재 ──→ 메신저 (결재 알림)
          ──→ 대시보드 (미처리 결재 위젯)

교육 관리 ──→ 전사 캘린더 (교육 일정)
           ──→ 메신저 (미이수 리마인드)
```

**메신저 알림 통합 패턴**: 모든 신규 기능에서 `messages` 테이블에 `message_type: 'system'` 삽입으로 통일

---

## 안정성 리스크 평가 및 대응

### 1. RLS 정책 성능 (리스크: 중간)
- 현재 120+ → 150+로 증가 예상
- `is_admin()` 함수에 `STABLE` 힌트 확인 필요
- 급여/근태 테이블은 최소 RLS (본인 + admin만)
- **대응**: 200명 규모 부하 테스트, 특히 messages SELECT 성능

### 2. Realtime 구독 확장 (리스크: 낮음~중간)
- Pro 플랜 동시 500개 제한
- 200명 × 메신저+프로젝트 = ~400 구독
- **대응**: 근태/결재는 Realtime 대신 30초 폴링, 메신저만 Realtime 유지

### 3. 파일 스토리지 관리
| 버킷 | 보존 기간 | 근거 |
|------|----------|------|
| avatars | 무기한 | 용량 작음 |
| resumes | 채용 후 1년 | 법적 보관 |
| interview-recordings | 90일 | 용량 큼 |
| meeting-recordings | 90일 | 용량 큼 |
| chat-attachments | 1년 | 업무 히스토리 |
| document-uploads (신규) | 정책별 | 급여명세서 5년, 기타 1년 |

**자동 삭제**: Supabase Edge Function + CRON

### 4. 마이그레이션 전략
- 모든 신규 기능은 신규 테이블로 (기존 평가 테이블 ALTER 금지)
- 각 Phase 완료 후 안정화 기간 1주
- 마이그레이션별 롤백 스크립트 작성

### 5. 백업
- Supabase Pro: 일일 자동 백업 (7일 보존) + PITR
- 급여 데이터: 월 1회 CSV 자동 내보내기

---

## 사용자 질문 답변

| 질문 | 답변 |
|------|------|
| Excel 업로드 → 자동 입력? | ✅ 가능. `xlsx` 라이브러리 이미 포함. Phase 5에서 템플릿 다운로드→업로드→파싱 구현 |
| 파일 보존 기간? | `file_retention_policies` 테이블로 관리. 이력서 1년, 녹화 90일, 급여명세서 5년 |
| 모바일 최적화? | PWA로 구현. 반응형 UI 대부분 완료, manifest.json + Service Worker 추가 예정 |

---

## 전체 타임라인

| Phase | 기간 | 핵심 산출물 |
|-------|------|-----------|
| **1. 긴급 수정 + 대시보드** | 2주 | 등록 버그 수정, Monday.com 스타일 대시보드 |
| **2. 급여/근태/연차/결재** | 4~5주 | 4대 HR 핵심 기능 |
| **3. 채용 AI 강화** | 3주 | AI 스크리닝, 자동 스케줄링 |
| **4. 커뮤니케이션 + 업무** | 3~4주 | 게시판, 캘린더, 교육, 긴급업무 강화 |
| **5. 연동 + 모바일** | 3~4주 | Google Workspace, Excel 업로드, PWA |
| **총계** | **~15~18주** | |

---

## 검증 방법

각 Phase 완료 시:
1. **기존 기능 회귀 테스트**: 인사평가 전체 흐름, 메신저 실시간 동작, 프로젝트 보드 확인
2. **신규 기능 E2E 테스트**: 각 역할(admin/ceo/leader/employee)로 로그인하여 전체 워크플로우 검증
3. **RLS 보안 테스트**: 권한 없는 사용자의 데이터 접근 시도 확인
4. **모바일 테스트**: Chrome DevTools Device Mode + 실제 모바일 브라우저
5. **빌드 검증**: `npm run build` 성공 확인 후 Cloudflare Pages 배포
