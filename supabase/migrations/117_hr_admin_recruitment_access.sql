-- 117: 인사담당(hr_admin) 에게 채용 지원자(candidates) SELECT/UPDATE 권한 부여
--
-- 문제 진단:
--   - candidates 테이블의 select 정책이 public.is_admin() 만 허용
--   - is_admin() 정의: role IN ('director','division_head','ceo','admin') — hr_admin 제외
--   - 결과: 인사담당(role='hr_admin') 로그인 시 채용 대시보드에서 후보자가 0건만 보임
--     (job_postings, resume_analysis, interview_schedules 등 다른 채용 테이블은 모두
--      USING (true) 라 hr_admin 도 정상 조회됨 — candidates 한 테이블만 막혀 있음)
--
-- 해결:
--   is_admin() 함수 자체는 그대로 두고(다른 모듈 권한 폭발 방지),
--   candidates 테이블에만 hr_admin 허용 정책을 별도 추가.
--   SELECT + UPDATE 둘 다 허용 (지원자 상태 변경/면접관 코멘트 추가 등 작업 필요).
--   DELETE 는 보수적으로 admin 권한 유지.

-- ─── SELECT: hr_admin 허용 ──────────────────────────────────
DROP POLICY IF EXISTS "candidates_select_hr" ON public.candidates;

CREATE POLICY "candidates_select_hr" ON public.candidates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = auth.uid() AND role = 'hr_admin'
    )
  );

COMMENT ON POLICY "candidates_select_hr" ON public.candidates IS
  '인사담당(hr_admin) 의 채용 지원자 SELECT 허용 — 기존 is_admin() 정책 보완';

-- ─── UPDATE: hr_admin 허용 ──────────────────────────────────
DROP POLICY IF EXISTS "candidates_update_hr" ON public.candidates;

CREATE POLICY "candidates_update_hr" ON public.candidates
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = auth.uid() AND role = 'hr_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = auth.uid() AND role = 'hr_admin'
    )
  );

COMMENT ON POLICY "candidates_update_hr" ON public.candidates IS
  '인사담당(hr_admin) 의 채용 지원자 UPDATE 허용 — 상태 변경/코멘트/답변 기록 등';
