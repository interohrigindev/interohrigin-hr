# Supabase FREE → PRO 마이그레이션 가이드

> 소스: `jlgdbofwlmhjayyjtyxv` (FREE) → 목적지: `ckzbzumycmgkcpyhlclb` (PRO)
> 작성일: 2026-03-26

---

## 마이그레이션 범위

| 항목 | 내용 |
|------|------|
| DB 스키마 | 55개 마이그레이션 파일 + v6 마이그레이션 2개 |
| 데이터 | 모든 public 스키마 테이블 |
| Auth 사용자 | auth.users + auth.identities (UUID 보존 필수) |
| Storage | 5개 버킷 (avatars, resumes, interview-recordings, meeting-recordings, chat-attachments) |
| Realtime | 9개 테이블 구독 |
| 트리거/함수 | calculate_work_hours, generate_doc_number, update_leave_balance 등 |
| Edge Functions | 없음 |

---

## Phase 0: 사전 준비 (D-2)

### 0-1. 양쪽 프로젝트 인증정보 수집

**소스 (FREE)**
- Supabase Dashboard → Settings → Database → Connection string (Direct connection)
- Supabase Dashboard → Settings → API → service_role (secret)

**목적지 (PRO)**
- DB connection string
- service_role key
- anon key (새 프로젝트용)

### 0-2. 도구 설치

```bash
brew install supabase/tap/supabase
brew install postgresql@17
```

### 0-3. 소스 DB 인벤토리 기록

소스 Supabase SQL Editor에서 실행하여 결과를 기록해둡니다:

```sql
-- 1) 테이블 목록
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- 2) 테이블별 행 수
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables WHERE schemaname = 'public';

-- 3) Auth 사용자 수
SELECT COUNT(*) FROM auth.users;

-- 4) Storage 파일 수
SELECT bucket_id, COUNT(*) FROM storage.objects GROUP BY bucket_id;
```

### 0-4. 소스 전체 백업

```bash
pg_dump "postgresql://postgres.[jlgdbofwlmhjayyjtyxv]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres" \
  --no-owner --no-privileges -F c -f full_backup_$(date +%Y%m%d).dump
```

> **Tip**: Connection string은 Supabase Dashboard → Settings → Database에서 확인

---

## Phase 1: 스키마 마이그레이션 (D-1, 다운타임 없음)

목적지 Supabase SQL Editor에서 실행합니다.

### 1-1. 확장 활성화

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 1-2. 마이그레이션 001~055 순차 실행

`supabase/migrations/` 폴더의 파일을 **번호 순서대로** SQL Editor에 복사+실행합니다.

```
001_create_schema.sql
002_new_schema.sql
003_seed_data.sql
004_views_and_functions.sql
005_rls_policies.sql
006_grade_criteria.sql
007_role_restructure.sql
008_fix_create_employee.sql
009_add_evaluation_type.sql
010_add_division_head_and_employee_fields.sql
011_ai_settings_and_reports.sql
012_storage_avatars.sql
013_fix_pgcrypto_create_employee.sql
014_recruitment_and_lifecycle_tables.sql
015_work_management_tables.sql
016_add_employee_extended_fields.sql
017_urgent_tasks_and_reminders.sql
018_imported_work_data.sql
019_integration_settings.sql
020_evaluation_enhancements.sql
021_messenger_tables.sql
022_fix_messenger_rls.sql
023_fix_messenger_rls_v2.sql
024_project_board_tables.sql
025_fix_project_updates_rls.sql
026_unify_project_work.sql
027_auto_employee_number.sql
028_employee_number_login_rpc.sql
029_project_department_permissions.sql
030_fix_department_permissions.sql
031_department_templates.sql
032_fix_template_dept_name.sql
033_fix_fk_cascade.sql
034_fix_remaining_fk.sql
035_ai_agent_tables.sql
036_ai_settings_read_policy.sql
037_meeting_records.sql
038_reset_employee_password.sql
039_project_board_role_columns.sql
040_fix_ai_settings_and_storage.sql
041_hr_rls_hardening.sql
042_fix_approval_rls_recursion.sql
043_departments_parent_id.sql
044_candidates_anon_survey_rls.sql
045_interview_analyses.sql
046_interview_analysis_confirm.sql
047_fix_public_apply_rls.sql
048_ai_feature_settings.sql
049_posting_survey_link.sql
050_survey_anon_rls.sql
051_interview_schedule_event_id.sql
052_bulletin_board.sql
053_company_calendar.sql
054_urgent_tasks_enhance.sql
055_candidate_interviewer_comments.sql
```

### 1-3. v6 마이그레이션 실행

```
docs/v6_database_migration.sql
docs/v6_labor_rebuild_migration.sql   ← 테이블 DROP+재생성 포함, 빈 DB이므로 안전
```

### 1-4. 검증

```sql
-- 테이블 수 확인
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';

-- 함수 확인
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name;

-- 뷰 확인
SELECT table_name FROM information_schema.views WHERE table_schema = 'public';

-- RLS 활성화 확인
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- 트리거 확인
SELECT trigger_name, event_object_table FROM information_schema.triggers
WHERE trigger_schema = 'public' ORDER BY event_object_table;

-- Storage 버킷 확인 (5개 있어야 함)
SELECT id, name, public, file_size_limit FROM storage.buckets;

-- Realtime 확인
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

---

## Phase 2: Auth 사용자 마이그레이션 (D-1, 다운타임 없음)

> **핵심**: `employees.id`가 `auth.users(id)`를 FK로 참조하므로 UUID가 완전히 동일해야 합니다.

### 2-1. 소스에서 auth.users 내보내기

소스 DB에 psql로 직접 연결하여 실행:

```sql
COPY (
  SELECT id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at, email_change_token_new, email_change,
    email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
    phone_change, phone_change_token, phone_change_sent_at,
    email_change_token_current, email_change_confirm_status,
    banned_until, reauthentication_token, reauthentication_sent_at,
    is_sso_user, deleted_at, is_anonymous
  FROM auth.users
) TO '/tmp/auth_users.csv' WITH CSV HEADER;
```

### 2-2. auth.identities도 내보내기

```sql
COPY (SELECT * FROM auth.identities) TO '/tmp/auth_identities.csv' WITH CSV HEADER;
```

### 2-3. 목적지에 가져오기

목적지 DB에 psql로 연결 후:

```sql
-- 기존 기본 사용자가 있다면 삭제
DELETE FROM auth.identities;
DELETE FROM auth.users;

-- auth.users 가져오기
COPY auth.users FROM '/tmp/auth_users.csv' WITH CSV HEADER;

-- auth.identities 가져오기
COPY auth.identities FROM '/tmp/auth_identities.csv' WITH CSV HEADER;
```

### 2-4. 검증

```sql
SELECT COUNT(*) FROM auth.users;
-- 소스와 동일한 숫자여야 함

SELECT id, email FROM auth.users ORDER BY created_at LIMIT 5;
```

---

## Phase 3: 데이터 마이그레이션 (당일, 다운타임 시작)

### 3-1. 소스 쓰기 중단 공지

사용자에게 점검 안내 → 새 데이터 입력 중단

### 3-2. 데이터 전용 내보내기

```bash
pg_dump "SOURCE_CONNECTION_STRING" \
  --data-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  -F c -f public_data.dump
```

### 3-3. 목적지에 가져오기

```bash
pg_restore -d "DEST_CONNECTION_STRING" \
  --data-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  public_data.dump
```

> `--disable-triggers`: 트리거(calculate_work_hours 등)가 import 중 실행되어 데이터를 변형하는 것을 방지합니다.

### 3-4. 시퀀스 리셋

serial 컬럼이 있는 경우 시퀀스를 리셋합니다:

```sql
-- 모든 시퀀스 확인 및 리셋
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name,
           pg_get_serial_sequence(c.table_name, c.column_name) as seq_name
    FROM information_schema.columns c
    WHERE c.column_default LIKE 'nextval%'
      AND c.table_schema = 'public'
  LOOP
    EXECUTE format(
      'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 1))',
      r.seq_name, r.column_name, r.table_name
    );
  END LOOP;
END $$;
```

### 3-5. 검증

양쪽 DB에서 실행 후 결과 비교:

```sql
SELECT 'employees' as tbl, COUNT(*) as cnt FROM employees
UNION ALL SELECT 'departments', COUNT(*) FROM departments
UNION ALL SELECT 'evaluation_targets', COUNT(*) FROM evaluation_targets
UNION ALL SELECT 'candidates', COUNT(*) FROM candidates
UNION ALL SELECT 'job_postings', COUNT(*) FROM job_postings
UNION ALL SELECT 'attendance_records', COUNT(*) FROM attendance_records
UNION ALL SELECT 'leave_requests', COUNT(*) FROM leave_requests
UNION ALL SELECT 'approval_documents', COUNT(*) FROM approval_documents
UNION ALL SELECT 'training_records', COUNT(*) FROM training_records
ORDER BY tbl;
```

---

## Phase 4: Storage 파일 마이그레이션 (당일, Phase 3과 병렬 가능)

### 4-1. Node.js 스크립트 작성 및 실행

`scripts/migrate-storage.mjs` 생성:

```javascript
import { createClient } from '@supabase/supabase-js'

// service_role 키 사용 (RLS 우회)
const source = createClient(
  'https://jlgdbofwlmhjayyjtyxv.supabase.co',
  'SOURCE_SERVICE_ROLE_KEY'
)
const dest = createClient(
  'https://ckzbzumycmgkcpyhlclb.supabase.co',
  'DEST_SERVICE_ROLE_KEY'
)

const BUCKETS = [
  'avatars',
  'resumes',
  'interview-recordings',
  'meeting-recordings',
  'chat-attachments'
]

async function migrateStorage() {
  for (const bucket of BUCKETS) {
    console.log(`\n=== Migrating bucket: ${bucket} ===`)

    const { data: files, error } = await source.storage
      .from(bucket)
      .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } })

    if (error) {
      console.error(`Error listing ${bucket}:`, error)
      continue
    }

    console.log(`Found ${files.length} files`)

    for (const file of files) {
      if (file.id === null) continue // 폴더인 경우 스킵

      try {
        const { data: blob, error: dlErr } = await source.storage
          .from(bucket)
          .download(file.name)

        if (dlErr) {
          console.error(`  Download failed: ${file.name}`, dlErr)
          continue
        }

        const { error: ulErr } = await dest.storage
          .from(bucket)
          .upload(file.name, blob, {
            contentType: file.metadata?.mimetype,
            upsert: true
          })

        if (ulErr) {
          console.error(`  Upload failed: ${file.name}`, ulErr)
          continue
        }

        console.log(`  OK: ${file.name}`)
      } catch (e) {
        console.error(`  Error: ${file.name}`, e.message)
      }
    }
  }

  console.log('\n=== Storage migration complete ===')
}

migrateStorage()
```

실행:
```bash
node scripts/migrate-storage.mjs
```

### 4-2. 검증

목적지 SQL Editor에서:
```sql
SELECT bucket_id, COUNT(*) FROM storage.objects GROUP BY bucket_id;
```
소스와 동일한 파일 수인지 확인

---

## Phase 5: 환경변수 업데이트 (당일, ~5분)

### 5-1. `.env` 파일 수정

```
VITE_SUPABASE_URL=https://ckzbzumycmgkcpyhlclb.supabase.co
VITE_SUPABASE_ANON_KEY=<새 프로젝트의 anon key>
```

> anon key는 목적지 Supabase Dashboard → Settings → API에서 확인

### 5-2. Cloudflare Pages 환경변수 업데이트

Cloudflare Dashboard에서:
1. Pages → interohrigin-hr2 → Settings → Environment variables
2. `VITE_SUPABASE_URL` 업데이트
3. `VITE_SUPABASE_ANON_KEY` 업데이트

### 5-3. 하드코딩된 스크립트 URL 업데이트 (7개 파일)

다음 파일들의 URL을 `ckzbzumycmgkcpyhlclb`로 변경:

| 파일 | 라인 |
|------|------|
| `scripts/check-tables.mjs` | 4 |
| `scripts/apply-migrations.mjs` | 4, 8 |
| `scripts/run-migrations-v2.mjs` | 3 |
| `scripts/run-migrations.mjs` | 3 |
| `scripts/verify-and-setup.mjs` | 4, 9 |
| `scripts/create-test-accounts.mjs` | 16 |
| `scripts/insert-work-samples.mjs` | 5 |

> `src/lib/supabase.ts`는 `import.meta.env`에서 읽으므로 코드 변경 불필요

---

## Phase 6: 배포 (당일)

```bash
npm run build:cf && wrangler pages deploy dist
```

또는 git push로 자동 배포가 설정되어 있다면 커밋+푸시

---

## Phase 7: 검증 테스트

### 필수 테스트 체크리스트

- [ ] **로그인**: admin@interohrigin.com 계정으로 로그인
- [ ] **직원 목록**: 모든 직원이 표시되는지 확인
- [ ] **평가**: 기존 평가 데이터 조회 가능 확인
- [ ] **근태**: 출퇴근 기록 확인, calculate_work_hours 트리거 작동
- [ ] **연차 신청**: 신청 후 update_leave_balance 트리거 확인
- [ ] **전자 결재**: 새 문서 생성 시 generate_doc_number 트리거 확인
- [ ] **채용**: 공고/후보자 조회, 이력서 다운로드 (Storage)
- [ ] **실시간**: 브라우저 2개로 realtime 업데이트 확인
- [ ] **아바타 업로드**: public 버킷 작동 확인
- [ ] **게시판**: 글 작성/조회
- [ ] **캘린더**: 일정 등록/조회

---

## Phase 8: 롤백 전략

### 즉시 롤백 (0 다운타임)

문제 발생 시:
1. Cloudflare Pages 환경변수를 **원래 값으로** 되돌림
2. 재배포
3. `.env`도 원래 값으로 복원

> 소스 FREE 프로젝트는 그대로 유지되므로 즉시 복구 가능

### 소스 유지 기간

- 전환 후 **최소 7일간** 소스 프로젝트 유지
- 이 기간 에러 로그 모니터링

### 되돌릴 수 없는 시점 (Point of No Return)

새 프로젝트에서 사용자가 **새 데이터를 입력하기 시작하면** 돌이킬 수 없음
→ **주말 야간(KST)**에 전환 권장

---

## Phase 9: 후속 작업 (D+1 ~ D+7)

- [ ] Cloudflare Pages 에러 로그 모니터링
- [ ] 스크립트 7개 하드코딩 URL 업데이트 커밋
- [ ] 7일간 문제 없으면 소스 FREE 프로젝트 일시중지/삭제 고려

---

## 예상 다운타임

| 작업 | 소요 시간 | 다운타임 필요? |
|------|----------|--------------|
| 스키마 마이그레이션 (Phase 1) | 30~45분 | X (사전) |
| Auth 마이그레이션 (Phase 2) | 30~60분 | X (사전) |
| 데이터 export/import (Phase 3) | 30~60분 | **O** |
| Storage 마이그레이션 (Phase 4) | 30~60분 | X (병렬) |
| 환경변수 + 배포 (Phase 5~6) | 5~10분 | **O** |
| **실제 다운타임** | **~15~20분** | |

**권장 전환 시점**: 주말 야간 (KST) — HR 플랫폼 사용이 가장 적은 시간

---

## 전체 체크리스트 요약

```
사전 준비 (D-2)
[ ] 양쪽 인증정보 수집 완료
[ ] pg 도구 설치
[ ] 소스 전체 백업 완료
[ ] 소스 인벤토리 기록 (테이블, 행 수, 사용자 수, 파일 수)

스키마 (D-1)
[ ] Extensions 활성화
[ ] 마이그레이션 001~055 실행
[ ] v6 마이그레이션 2개 실행
[ ] 스키마 검증 통과

Auth (D-1)
[ ] auth.users 내보내기 + 가져오기
[ ] auth.identities 내보내기 + 가져오기
[ ] Auth 사용자 수 일치 확인

전환 당일
[ ] 사용자 점검 공지
[ ] 데이터 export + import
[ ] Storage 파일 마이그레이션
[ ] 행 수 / 파일 수 검증
[ ] .env 업데이트
[ ] Cloudflare 환경변수 업데이트
[ ] 배포
[ ] 검증 테스트 통과
[ ] 전환 완료 공지

후속 (D+1 ~ D+7)
[ ] 에러 로그 모니터링
[ ] 스크립트 URL 업데이트 커밋
[ ] 소스 프로젝트 정리
```
