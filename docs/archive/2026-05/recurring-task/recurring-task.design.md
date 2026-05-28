# recurring-task Design (Archived — PDCA #5)

> Archive 압축본. 전체 원본은 git history 에 보존. 정책: PDCA #2~#4 동일.

## 채택: Architecture Option C (Pragmatic)
발생/알림/미진행 = RPC 분리(멱등·테스트성). 일일보고 반영 = fetchData 국소 append. A(daily-report 대폭수정)·B(과설계) 회피.

## 3대 핵심 결정
1. **발송 경로**: 외부 cron → CF Function(`/api/cron-recurring-reminder|missed`, X-Cron-Secret) → service_role pick RPC → send-email. `app.*` DB설정 null 확인 → pg_cron 직접 HTTP 회피. materialize(HTTP 불요)만 pg_cron 직접 RPC.
2. **materialize 타이밍**: 자정 cron이 오늘+내일 발생분 멱등 INSERT (UNIQUE + ON CONFLICT). 내일분 선생성으로 전날 알림 대상 보장.
3. **reminder 매칭**: 외부 cron 30분/매시간 호출 + reminder_time 30분 버킷 매칭 + reminder_sent_at 멱등. 기본 09:00.

## 스키마 (migration 135)
- `recurring_tasks`: title/description/assignee_id/created_by/department/recur_type(weekly|monthly)/weekdays(int[] 0=일~6=토)/month_day(1~31, 말일 LEAST 보정)/reminder_time(time)/is_active. CHECK 제약 2(weekly→weekdays / monthly→month_day).
- `recurring_task_occurrences`: template_id FK CASCADE/occurrence_date/assignee_id/status(pending|in_progress|done|missed)/completed_at/note/reminder_sent_at/missed_notified_at. **UNIQUE(template_id, occurrence_date)**.
- RLS: 본인+관리자(director/division_head/ceo/admin/hr_admin). occurrence INSERT·발송컬럼 = SECURITY DEFINER RPC 전용. 본인 UPDATE status는 pending/in_progress/done만(missed 차단).
- 3 RPC: materialize_recurring_occurrences / pick_recurring_reminders / pick_recurring_missed (전부 SECURITY DEFINER, search_path 고정).

## FR-08 일일보고 반영
daily-report.tsx fetchData 기존 4 source 불변 + 모듈 헬퍼(fetchRecurringForDaily) + loading 이후 별도 useEffect로 functional append. occurrence.id = DailyReportTask.id (autoMergeTodayActivity dedupe 호환). done→완료, in_progress→진행, project_name='반복업무'.

## Module Map (S1~S5 / 실제 S1~S3로 통합)
DB+RPC+cron(S1) / CF Function+이메일(S2) / 타입·훅·관리화면(S2) / 체크화면+일일보고반영(S3) / 미진행+검증(S4 Check).

> 전체 원본(컴포넌트 다이어그램, Page UI Checklist, Test Plan L1~L3 등)은 git history 참조.
