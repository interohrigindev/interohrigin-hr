---
name: dailyreport-projects-cron-infra
description: 일일보고/프로젝트/tasks 관계 + 검증된 서버 cron 패턴 진입점 맵 — recurring-task(PDCA #5) 및 이후 일일보고/스케줄 작업 시 재사용
metadata:
  type: project
---

PDCA #5 (recurring-task) Phase 1 조사에서 코드로 검증한 인프라.

**일일 업무보고 데이터 모델**:
- `daily_reports` (employee_id, report_date, JSONB 배열들): `tasks_completed`/`tasks_in_progress`/`tasks_planned`/`carryover_tasks` 각각 `DailyReportTask[]` = `{id,title,status,note?,project_id?,project_name?}` (src/types/work.ts). 추가 컬럼: ai_priority_suggestion, satisfaction_score/comment, blockers, work_memo, project_memos(jsonb), excluded_projects(text[]).
- 작성 화면: `src/routes/work/daily-report.tsx` (약 1730 LOC, 단일 파일). 저장=`handleSave` (daily_reports upsert). 결재 제출=별도 — `approval_documents`(doc_type='daily_report', content=jsonb 스냅샷) + `approval_steps`(결재선 fan-out) INSERT. `alreadySubmitted` 로 1일 1회 제어.
- **자동 수집 로직 (핵심)**: 신규 보고서 진입 시 `fetchData` 가 자동 채움 — 완료=오늘 status='done' tasks + 오늘 project_updates(상태변경/일반) ; 진행중=현재 status='in_progress' tasks(+linked_board_id 프로젝트명) ; 계획=status='todo' tasks(10개) ; 이월=어제 보고서의 in_progress+planned. 기존 보고서 있으면 `autoMergeTodayActivity` 가 새 활동만 머지하고 사용자 편집(title) 보존.
- 수동 가져오기: `importInProgressFromProjects`(내 project_boards 진행중 pipeline_stages → 진행중 섹션), `refreshCompletedFromProjects`.

**프로젝트 모델**: 테이블명은 `project_boards`(project_name, assignee_ids[], status active/planning, priority, launch_date) + `pipeline_stages`(stage_name, status '진행중' 한글, stage_assignee_ids[]) + `project_updates`(author_id, content, status_changed_to, project_id) + `tasks`(assignee_id, status todo/in_progress/done, linked_board_id, completed_at). 생성 화면 `src/routes/projects/new.tsx`(useProjectBoard 훅). **types/work.ts 의 Project 인터페이스(name 등)는 실제 사용 테이블 아님 — 실제는 project_boards**.

**검증된 서버 cron 패턴 (전날 알림의 정석, 재사용)**:
- `functions/api/cron-leave-promotion.ts` = Cloudflare Pages Function, POST `/api/cron-leave-promotion`, `X-Cron-Secret` 헤더 인증, service_role 로 Supabase RPC(`run_leave_promotion_automation`, SECURITY DEFINER, migration 110) 호출. 외부 cron(cron-job.org/GitHub Actions) 또는 CF Cron Trigger 가 매일 호출.
- **RPC 는 발송하지 않고 row INSERT 만** — 이메일은 별도. 서버 컨텍스트에서 메일은 `functions/api/send-email.ts`(Gmail API, POST {to,subject,html}) 를 server-to-server fetch 로 호출해야 함. **클라이언트 `src/lib/notification-sender.ts` 의 sendNotification 은 브라우저(@/lib/supabase) 전용이라 cron Function 에서 사용 불가** — cron 은 send-email Function 직접 호출.
- env: CRON_SECRET, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GMAIL_* (CF Pages Settings).

**Why/How**: recurring-task "전날 알림" 은 cron-leave-promotion 패턴 복제(신규 cron Function + 신규 RPC). project_boards/pipeline_stages 한글 status('진행중') 주의.

**PDCA #5 (recurring-task) 완결 (2026-05-28, Match 98.4%, SC 7/7, migration 135) — 검증된 사실**:
- 신규 2테이블: `recurring_tasks`(템플릿: recur_type weekly|monthly, weekdays int[] 0=일~6=토 = EXTRACT(DOW) 컨벤션, month_day 말일은 RPC LEAST(month_day, 월말일) 보정, reminder_time time, is_active) + `recurring_task_occurrences`(발생: status pending|in_progress|done|missed, **UNIQUE(template_id, occurrence_date)** 멱등, reminder_sent_at/missed_notified_at 멱등 플래그). RLS 본인+관리자(hr_admin 포함). occurrence INSERT/발송컬럼은 SECURITY DEFINER RPC 전용(일반 INSERT/DELETE false).
- 3 RPC(SECURITY DEFINER, search_path 고정, KST=`(now() AT TIME ZONE 'Asia/Seoul')::date`): materialize_recurring_occurrences(오늘+내일 ON CONFLICT DO NOTHING, GET DIAGNOSTICS는 int v_rowcount) / pick_recurring_reminders(내일발생+reminder_time 30분버킷 매칭+미발송 → UPDATE..FROM..RETURNING CTE로 선별+reminder_sent_at 마킹) / pick_recurring_missed(발생일경과 미완료 missed 전이 + 미통지 마킹).
- **발송경로 결정(중요)**: `app.supabase_url`/`app.service_role_key` 등 app.* DB 설정값이 db-exec 세션에선 null(mall은 설정됨) → pg_cron 직접 net.http_post 의존 회피. materialize(HTTP 불요)만 pg_cron 직접 RPC(`cron.schedule('recurring_materialize','0 15 * * *')` UTC15=KST자정, db-exec 등록 가능). 이메일(reminder/missed)은 **외부 cron(cron-job.org 등) → CF Function `/api/cron-recurring-reminder|missed`(X-Cron-Secret, cron-leave-promotion 동형) → service_role pick RPC → `/api/send-email`(같은 origin server-to-server)**. ⚠️ 배포만으론 알림 자동 안 됨 — 외부 cron 등록 필수(deferred). net.http_post 자체는 작동(mall_healthkeeper_tomorrow_reminder 사용, pg_net extname 조회 0건이나 net.http_post 호출 가능, vault 스키마 존재) — 본 사이클은 app.* null로 미사용.
- **CF Function은 email-templates.ts import 불가**(client 모듈 import.meta.env 의존) → 이메일 HTML inline 재구성 + esc 자체 구현. send-email 계약 = `{to, subject, html}`. client용 recurringReminderEmail/recurringMissedEmail은 email-templates.ts에 별도 추가(escapeHtml/nl2br 재사용).
- **daily-report.tsx FR-08 append-only 회귀 0 패턴(재사용 가치 高)**: ~1730 LOC 단일 파일에 기존 4 source(done task/update/in_progress/todo) 코드 한 줄도 수정 없이 ① 컴포넌트 밖 모듈 헬퍼 `fetchRecurringForDaily`(occurrence done/in_progress 조회, recurring_tasks!inner join) ② `useEffect(fetchData)` 다음 신규 useEffect(`[loading, employeeId, selectedDate]`, loading=false 이후)로 `setCompleted(prev=>[...prev,...dedup된 add])` functional append. occurrence.id=DailyReportTask.id로 autoMergeTodayActivity dedupe(freshIds)/편집보존 호환. project_name='반복업무', title='[반복] '+템플릿명. 반복 0건이면 prev 반환. 잔존 I-2: 기존 저장보고서+같은날 autoMergeTodayActivity fire-and-forget full-replace setCompleted가 늦게 land 시 일시 누락 가능(저장분 영속화로 실사용 안전, 실측 권고).
- Button variant는 primary/outline (default 없음 — TS 주의). Badge는 default/success/warning/danger/info. 라우트는 정적(`/admin/projects/recurring`,`recurring-check`)을 동적 `:id`보다 먼저 등록.
