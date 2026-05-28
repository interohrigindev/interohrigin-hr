-- 135: 반복업무 (recurring-task) — PDCA #5, Do module-1 (DB + RPC + cron)
--
-- 흐름 (Design §2.2):
--   1. 관리자/등록자가 반복업무 템플릿(recurring_tasks) 등록 (매주 요일배열 | 매월 일자)
--   2. [자정 pg_cron] materialize_recurring_occurrences() → 오늘+내일 발생 인스턴스 멱등 INSERT
--   3. [30분 외부 cron → CF Function] pick_recurring_reminders() → 내일 발생 + 알림시각 매칭분
--      선별·마킹 후 반환 → CF Function 이 send-email 로 담당자 전날 알림
--   4. 담당자가 전용 체크 화면에서 occurrence.status = done/in_progress 체크
--      → 당일 일일보고(daily-report.tsx fetchData)에 자동 반영 (module-4)
--   5. [마감 후 외부 cron → CF Function] pick_recurring_missed() → 발생일 지났는데 pending
--      → status='missed' 전이 + 본인/관리자 알림 대상 반환
--
-- 절대 규칙: 기존 테이블 ALTER 0 (신규 테이블만). CREATE ... IF NOT EXISTS 멱등.
-- 트리거 재사용: public.update_updated_at() (migration 120/134 와 동일 공통 함수).
-- RLS: 본인 + 관리자(role IN director/division_head/ceo/admin/hr_admin — hr_admin 포함, PDCA #3 교훈).
-- cron 발송 컬럼(reminder_sent_at/missed_notified_at)·occurrence INSERT 는 SECURITY DEFINER RPC 전용.
-- KST: cron 은 UTC 실행 → 날짜 계산은 (now() AT TIME ZONE 'Asia/Seoul')::date 로 명시.

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. recurring_tasks (반복 템플릿)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.recurring_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  assignee_id   uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  department    text,

  -- 주기: weekly(요일 복수) | monthly(특정 일자)
  recur_type    text NOT NULL CHECK (recur_type IN ('weekly','monthly')),
  weekdays      int[],        -- weekly 시 0=일 ~ 6=토 (복수 가능)
  month_day     int CHECK (month_day BETWEEN 1 AND 31),  -- monthly 시 1~31 (말일 보정은 RPC)

  -- 전날 알림 발송 시각 (설정값, 기본 09:00 KST)
  reminder_time time NOT NULL DEFAULT '09:00:00',

  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- 주기 정합성: weekly 면 weekdays 필수(비어있지 않음), monthly 면 month_day 필수
  CONSTRAINT recur_weekly_has_weekdays CHECK (
    recur_type <> 'weekly' OR (weekdays IS NOT NULL AND array_length(weekdays, 1) >= 1)
  ),
  CONSTRAINT recur_monthly_has_day CHECK (
    recur_type <> 'monthly' OR month_day IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS recur_tasks_active_idx
  ON public.recurring_tasks (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS recur_tasks_assignee_idx
  ON public.recurring_tasks (assignee_id);

DROP TRIGGER IF EXISTS trg_recurring_tasks_updated_at ON public.recurring_tasks;
CREATE TRIGGER trg_recurring_tasks_updated_at
  BEFORE UPDATE ON public.recurring_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 2. recurring_task_occurrences (발생 인스턴스)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.recurring_task_occurrences (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id        uuid NOT NULL REFERENCES public.recurring_tasks(id) ON DELETE CASCADE,
  occurrence_date    date NOT NULL,
  assignee_id        uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  -- 진행여부: pending(미체크) → in_progress | done | missed(발생일 지나도 미완료)
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','in_progress','done','missed')),
  completed_at       timestamptz,
  note               text,

  -- 발송 멱등 플래그 (cron RPC 가 마킹)
  reminder_sent_at   timestamptz,   -- 전날 알림 발송 시각
  missed_notified_at timestamptz,   -- 미진행 알림 발송 시각

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- 멱등: 동일 템플릿의 동일 발생일은 1건만 (materialize 재실행 안전)
  UNIQUE (template_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS recur_occ_date_assignee_idx
  ON public.recurring_task_occurrences (occurrence_date, assignee_id);
CREATE INDEX IF NOT EXISTS recur_occ_status_idx
  ON public.recurring_task_occurrences (status, occurrence_date);

DROP TRIGGER IF EXISTS trg_recurring_occ_updated_at ON public.recurring_task_occurrences;
CREATE TRIGGER trg_recurring_occ_updated_at
  BEFORE UPDATE ON public.recurring_task_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 3. RLS
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.recurring_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_task_occurrences ENABLE ROW LEVEL SECURITY;

-- ─── recurring_tasks ───────────────────────────────────────────
-- SELECT: 담당자 본인 + 등록자 + 관리자
DROP POLICY IF EXISTS "recur_tasks_select" ON public.recurring_tasks;
CREATE POLICY "recur_tasks_select"
ON public.recurring_tasks FOR SELECT TO authenticated
USING (
  assignee_id = auth.uid()
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.employees e
             WHERE e.id = auth.uid()
               AND e.role IN ('director','division_head','ceo','admin','hr_admin'))
);

-- INSERT: 관리자 또는 등록자 본인(created_by = self)
DROP POLICY IF EXISTS "recur_tasks_insert" ON public.recurring_tasks;
CREATE POLICY "recur_tasks_insert"
ON public.recurring_tasks FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.employees e
              WHERE e.id = auth.uid()
                AND e.role IN ('leader','director','division_head','ceo','admin','hr_admin'))
);

-- UPDATE: 관리자 또는 등록자 (비활성/수정). 담당자 본인은 템플릿 편집 불가(관리 객체)
DROP POLICY IF EXISTS "recur_tasks_update" ON public.recurring_tasks;
CREATE POLICY "recur_tasks_update"
ON public.recurring_tasks FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.employees e
             WHERE e.id = auth.uid()
               AND e.role IN ('director','division_head','ceo','admin','hr_admin'))
)
WITH CHECK (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.employees e
             WHERE e.id = auth.uid()
               AND e.role IN ('director','division_head','ceo','admin','hr_admin'))
);

-- DELETE: 관리자 또는 등록자 (보통은 is_active=false soft, 물리삭제도 허용)
DROP POLICY IF EXISTS "recur_tasks_delete" ON public.recurring_tasks;
CREATE POLICY "recur_tasks_delete"
ON public.recurring_tasks FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.employees e
             WHERE e.id = auth.uid()
               AND e.role IN ('director','division_head','ceo','admin','hr_admin'))
);

-- ─── recurring_task_occurrences ────────────────────────────────
-- SELECT: 담당자 본인 + 관리자 (occurrence 직접 조회 + 일일보고 반영용)
DROP POLICY IF EXISTS "recur_occ_select" ON public.recurring_task_occurrences;
CREATE POLICY "recur_occ_select"
ON public.recurring_task_occurrences FOR SELECT TO authenticated
USING (
  assignee_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.employees e
             WHERE e.id = auth.uid()
               AND e.role IN ('director','division_head','ceo','admin','hr_admin'))
);

-- UPDATE(본인): 진행여부 체크 — status/note/completed_at.
--   cron 발송 컬럼(reminder_sent_at/missed_notified_at)은 일반 UPDATE 로도 건드릴 수 있으나
--   화면 코드는 status/note/completed_at 만 갱신. 발송 마킹은 SECURITY DEFINER RPC 가 수행.
--   (status 를 'missed' 로 사용자가 임의 설정하지 못하도록 WITH CHECK 로 제한)
DROP POLICY IF EXISTS "recur_occ_update_self" ON public.recurring_task_occurrences;
CREATE POLICY "recur_occ_update_self"
ON public.recurring_task_occurrences FOR UPDATE TO authenticated
USING (assignee_id = auth.uid())
WITH CHECK (assignee_id = auth.uid() AND status IN ('pending','in_progress','done'));

-- UPDATE(관리자): 모니터링/보정
DROP POLICY IF EXISTS "recur_occ_update_admin" ON public.recurring_task_occurrences;
CREATE POLICY "recur_occ_update_admin"
ON public.recurring_task_occurrences FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.employees e
          WHERE e.id = auth.uid()
            AND e.role IN ('director','division_head','ceo','admin','hr_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e
          WHERE e.id = auth.uid()
            AND e.role IN ('director','division_head','ceo','admin','hr_admin'))
);

-- INSERT/DELETE: 일반 사용자 차단 (occurrence 생성은 materialize RPC 전용, 삭제는 CASCADE)
DROP POLICY IF EXISTS "recur_occ_no_insert" ON public.recurring_task_occurrences;
CREATE POLICY "recur_occ_no_insert"
ON public.recurring_task_occurrences FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "recur_occ_no_delete" ON public.recurring_task_occurrences;
CREATE POLICY "recur_occ_no_delete"
ON public.recurring_task_occurrences FOR DELETE TO authenticated
USING (false);

-- ════════════════════════════════════════════════════════════════
-- 4. RPC — materialize / reminder / missed (모두 SECURITY DEFINER)
-- ════════════════════════════════════════════════════════════════

-- ─── 4.1 materialize_recurring_occurrences ─────────────────────
-- 활성 템플릿을 순회하며 "오늘 + 내일" 발생일에 해당하면 occurrence 멱등 INSERT.
-- weekly: 발생일의 요일(0=일~6=토, KST)이 weekdays 에 포함되면 발생.
-- monthly: 발생일의 일자가 month_day 와 같으면 발생.
--          말일 보정 — month_day 가 해당 월 말일보다 크면 말일에 발생(예: 31 → 2월은 28/29).
-- 자정 pg_cron 또는 admin 이 호출. net.http_post 불요 (DB INSERT 만).
CREATE OR REPLACE FUNCTION public.materialize_recurring_occurrences(
  p_dry_run boolean DEFAULT false
)
RETURNS TABLE (
  template_id     uuid,
  occurrence_date date,
  assignee_id     uuid,
  action_taken    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   text;
  v_today  date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_tpl    record;
  v_target date;
  v_match  boolean;
  v_eff_day int;     -- 말일 보정된 실제 발생 일자
  v_month_last int;  -- 대상 월의 말일
  v_rowcount int;    -- ON CONFLICT 후 실제 INSERT 된 행 수 (0 또는 1)
BEGIN
  -- 권한: cron(service_role, auth.uid() IS NULL) 또는 관리자
  SELECT role INTO v_role FROM public.employees WHERE id = auth.uid();
  IF auth.uid() IS NOT NULL AND v_role IS NOT NULL
     AND v_role NOT IN ('director','division_head','ceo','admin','hr_admin') THEN
    RAISE EXCEPTION 'forbidden: admin or service role only';
  END IF;

  FOR v_tpl IN
    SELECT * FROM public.recurring_tasks WHERE is_active = true
  LOOP
    -- 오늘(0), 내일(1) 두 날짜 검사
    FOR i IN 0..1 LOOP
      v_target := v_today + i;
      v_match := false;

      IF v_tpl.recur_type = 'weekly' THEN
        -- EXTRACT(DOW) : 0=일 ~ 6=토 (weekdays 와 동일 컨벤션)
        IF EXTRACT(DOW FROM v_target)::int = ANY (v_tpl.weekdays) THEN
          v_match := true;
        END IF;

      ELSIF v_tpl.recur_type = 'monthly' THEN
        -- 대상 월의 말일
        v_month_last := EXTRACT(DAY FROM
          (date_trunc('month', v_target) + interval '1 month - 1 day'))::int;
        v_eff_day := LEAST(v_tpl.month_day, v_month_last);
        IF EXTRACT(DAY FROM v_target)::int = v_eff_day THEN
          v_match := true;
        END IF;
      END IF;

      IF v_match THEN
        v_rowcount := 0;
        IF NOT p_dry_run THEN
          INSERT INTO public.recurring_task_occurrences
            (template_id, occurrence_date, assignee_id, status)
          VALUES
            (v_tpl.id, v_target, v_tpl.assignee_id, 'pending')
          ON CONFLICT (template_id, occurrence_date) DO NOTHING;
          GET DIAGNOSTICS v_rowcount = ROW_COUNT;
        END IF;

        template_id     := v_tpl.id;
        occurrence_date := v_target;
        assignee_id     := v_tpl.assignee_id;
        action_taken    := CASE
                             WHEN p_dry_run THEN 'would_insert'
                             WHEN v_rowcount > 0 THEN 'inserted'
                             ELSE 'exists'
                           END;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;

  RETURN;
END;
$$;

-- ─── 4.2 pick_recurring_reminders ──────────────────────────────
-- 내일 발생 occurrence 중, 해당 템플릿 reminder_time 이 현재 KST 시:분과 같은
-- 30분 버킷에 속하고 아직 미발송(reminder_sent_at IS NULL) 인 것을 선별.
-- 한 트랜잭션에서 reminder_sent_at 을 마킹하고 발송 대상(담당자 이메일 포함)을 반환.
-- CF Function 이 결과를 받아 send-email. 마킹 선행 → CF 재시도 시 중복 발송 방지(멱등).
CREATE OR REPLACE FUNCTION public.pick_recurring_reminders()
RETURNS TABLE (
  occurrence_id   uuid,
  template_id     uuid,
  occurrence_date date,
  title           text,
  description     text,
  assignee_id     uuid,
  assignee_name   text,
  assignee_email  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role     text;
  v_tomorrow date := ((now() AT TIME ZONE 'Asia/Seoul')::date) + 1;
  -- 현재 KST 시각을 30분 버킷의 시작으로 내림 (예: 09:17 → 09:00, 09:42 → 09:30)
  v_now_kst  time := (now() AT TIME ZONE 'Asia/Seoul')::time;
  v_bucket_start time := make_time(
    EXTRACT(HOUR FROM v_now_kst)::int,
    CASE WHEN EXTRACT(MINUTE FROM v_now_kst)::int < 30 THEN 0 ELSE 30 END,
    0);
  v_bucket_end time := v_bucket_start + interval '30 minutes';
BEGIN
  -- 권한: service role 또는 관리자
  SELECT role INTO v_role FROM public.employees WHERE id = auth.uid();
  IF auth.uid() IS NOT NULL AND v_role IS NOT NULL
     AND v_role NOT IN ('director','division_head','ceo','admin','hr_admin') THEN
    RAISE EXCEPTION 'forbidden: admin or service role only';
  END IF;

  RETURN QUERY
  WITH due AS (
    UPDATE public.recurring_task_occurrences o
    SET reminder_sent_at = now()
    FROM public.recurring_tasks t, public.employees e
    WHERE o.template_id = t.id
      AND o.assignee_id = e.id
      AND o.occurrence_date = v_tomorrow
      AND o.reminder_sent_at IS NULL
      AND o.status <> 'done'
      AND e.is_active = true
      AND e.email IS NOT NULL
      -- reminder_time 이 현재 30분 버킷에 속함
      AND t.reminder_time >= v_bucket_start
      AND t.reminder_time <  v_bucket_end
    RETURNING o.id, o.template_id, o.occurrence_date, o.assignee_id,
              t.title, t.description, e.name AS ename, e.email AS eemail
  )
  SELECT d.id, d.template_id, d.occurrence_date, d.title, d.description,
         d.assignee_id, d.ename, d.eemail
  FROM due d;
END;
$$;

-- ─── 4.3 pick_recurring_missed ─────────────────────────────────
-- 발생일이 지났는데(어제 이전) 아직 done 이 아닌 occurrence 를 'missed' 로 전이하고,
-- 미통지(missed_notified_at IS NULL) 건을 선별·마킹해 본인 알림 대상으로 반환.
-- 관리자 알림 수신자는 CF Function 이 별도 조회(role IN ...)하여 함께 발송.
CREATE OR REPLACE FUNCTION public.pick_recurring_missed()
RETURNS TABLE (
  occurrence_id   uuid,
  template_id     uuid,
  occurrence_date date,
  title           text,
  assignee_id     uuid,
  assignee_name   text,
  assignee_email  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  text;
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  SELECT role INTO v_role FROM public.employees WHERE id = auth.uid();
  IF auth.uid() IS NOT NULL AND v_role IS NOT NULL
     AND v_role NOT IN ('director','division_head','ceo','admin','hr_admin') THEN
    RAISE EXCEPTION 'forbidden: admin or service role only';
  END IF;

  -- 1) 발생일 지났는데 미완료 → missed 로 전이 (pending/in_progress 만)
  UPDATE public.recurring_task_occurrences
  SET status = 'missed'
  WHERE occurrence_date < v_today
    AND status IN ('pending','in_progress');

  -- 2) missed 이고 미통지 → 마킹 + 본인 알림 대상 반환
  RETURN QUERY
  WITH notify AS (
    UPDATE public.recurring_task_occurrences o
    SET missed_notified_at = now()
    FROM public.recurring_tasks t, public.employees e
    WHERE o.template_id = t.id
      AND o.assignee_id = e.id
      AND o.status = 'missed'
      AND o.missed_notified_at IS NULL
      AND e.is_active = true
      AND e.email IS NOT NULL
    RETURNING o.id, o.template_id, o.occurrence_date, o.assignee_id,
              t.title, e.name AS ename, e.email AS eemail
  )
  SELECT n.id, n.template_id, n.occurrence_date, n.title,
         n.assignee_id, n.ename, n.eemail
  FROM notify n;
END;
$$;

-- 권한 부여 (service_role = cron/CF Function, authenticated = 관리자 수동 트리거)
GRANT EXECUTE ON FUNCTION public.materialize_recurring_occurrences(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pick_recurring_reminders() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pick_recurring_missed() TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- 5. 코멘트
-- ════════════════════════════════════════════════════════════════
COMMENT ON TABLE public.recurring_tasks IS
  '반복업무 템플릿 — 매주(weekdays int[]) | 매월(month_day) 주기. 프로젝트와 분리된 1급 객체. PDCA #5.';
COMMENT ON TABLE public.recurring_task_occurrences IS
  '반복업무 발생 인스턴스 — materialize RPC 가 오늘+내일분 멱등 생성. status pending→in_progress|done|missed. UNIQUE(template_id,occurrence_date).';
COMMENT ON COLUMN public.recurring_tasks.weekdays IS 'weekly 시 0=일~6=토 (EXTRACT(DOW) 컨벤션), 복수 가능';
COMMENT ON COLUMN public.recurring_tasks.reminder_time IS '전날 알림 발송 시각(KST). pick_recurring_reminders 가 30분 버킷 매칭.';
COMMENT ON FUNCTION public.materialize_recurring_occurrences(boolean) IS
  '활성 템플릿의 오늘+내일 발생 occurrence 멱등 INSERT. 자정 pg_cron 호출. p_dry_run=true 시 시뮬레이션.';
COMMENT ON FUNCTION public.pick_recurring_reminders() IS
  '내일 발생 + reminder_time 30분버킷 매칭 + 미발송분 선별·마킹 후 반환. 외부 cron→CF Function 이 호출해 send-email.';
COMMENT ON FUNCTION public.pick_recurring_missed() IS
  '발생일 경과 미완료 → missed 전이 + 미통지분 선별·마킹 후 본인 알림 대상 반환. 외부 cron→CF Function.';

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- 6. pg_cron — materialize 자정 스케줄 (메인이 db-exec 로 적용)
--    reminder/missed 는 외부 cron→CF Function 경로이므로 pg_cron 불요.
--    아래는 별도 실행 권장 (cron 확장이 활성화된 세션에서):
-- ════════════════════════════════════════════════════════════════
-- SELECT cron.schedule(
--   'recurring_materialize',
--   '0 15 * * *',                         -- UTC 15:00 = KST 자정 00:00
--   $$ SELECT public.materialize_recurring_occurrences(false); $$
-- );
-- 재적용(스케줄 변경) 시: SELECT cron.unschedule('recurring_materialize'); 후 재등록.
