-- 128: resumes 버킷 인증 사용자 INSERT/SELECT/UPDATE/DELETE 정책 보강
--
-- ⚠️ 영구 차단 목표:
--   "두 번 다시 이력서 업로드 실패가 발생하지 않게" (대표 지시, 2026-05-26)
--
-- 배경:
--   `resumes` 버킷의 RLS 정책은 000_consolidated_complete_schema.sql:2857 에 의해
--     CREATE POLICY "resumes_anon_upload" ON storage.objects
--     FOR INSERT TO anon WITH CHECK (bucket_id = 'resumes')
--   ← anon (외부 공개 폼 지원) INSERT 만 허용.
--   인증된 직원(인사담당 / 임원 / 팀장)의 INSERT 정책 없음.
--
--   결과: CandidateAddDialog (지원자 추가 — 외부 이력서 등록) 에서
--     supabase.storage.from('resumes').upload(...) 호출 시
--     `new row violates row-level security policy` 에러로 차단.
--
--   외부 공개 지원(apply.tsx, anon 컨텍스트) 은 정상 작동했기 때문에
--     이 버그가 표면화되지 않다가, 인사담당이 강송이 후보자(해외사업) 이력서를
--     수동 등록하려다 노출됨. 잠재적으로 처음부터 막혀있던 흐름.
--
-- 정책 (CLAUDE.md ROLE_HIERARCHY 기반):
--   채용 권한 = admin / ceo / director / division_head / hr_admin / leader
--     · INSERT  : 위 6개 역할 + anon (외부 공개 지원 유지)
--     · SELECT  : 위 6개 역할 (Signed URL 생성 시 필요)
--     · UPDATE  : 위 6개 역할 (upsert: true 옵션 지원)
--     · DELETE  : admin / hr_admin / ceo / director / division_head (운영자 권한)
--
-- ⚠️ 권한 주의 (119 마이그레이션 7501999 회고):
--   storage.objects 의 POLICY 는 일부 Supabase 환경에서 owner 권한 필요.
--   본 SQL 이 권한 부족으로 실패하면 Dashboard > Storage > resumes > Policies 에서
--   수동으로 동일 정책을 등록해야 함 (하단 GUI 가이드 참고).

BEGIN;

-- ─── INSERT (신규 업로드) ──────────────────────────────────────────────
DROP POLICY IF EXISTS "resumes_internal_insert" ON storage.objects;
CREATE POLICY "resumes_internal_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('ceo', 'admin', 'director', 'division_head', 'hr_admin', 'leader')
    )
  );

-- ─── SELECT (조회/Signed URL) ──────────────────────────────────────────
DROP POLICY IF EXISTS "resumes_internal_select" ON storage.objects;
CREATE POLICY "resumes_internal_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('ceo', 'admin', 'director', 'division_head', 'hr_admin', 'leader')
    )
  );

-- ─── UPDATE (upsert / 메타데이터 수정) ─────────────────────────────────
DROP POLICY IF EXISTS "resumes_internal_update" ON storage.objects;
CREATE POLICY "resumes_internal_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('ceo', 'admin', 'director', 'division_head', 'hr_admin', 'leader')
    )
  )
  WITH CHECK (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('ceo', 'admin', 'director', 'division_head', 'hr_admin', 'leader')
    )
  );

-- ─── DELETE (운영자만) ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "resumes_internal_delete" ON storage.objects;
CREATE POLICY "resumes_internal_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('ceo', 'admin', 'director', 'division_head', 'hr_admin')
    )
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️ SQL 권한 부족 (42501) 발생 시 Dashboard 수동 등록 가이드:
-- ═══════════════════════════════════════════════════════════════════════
-- Supabase Dashboard > Storage > resumes 버킷 > Policies 탭
-- → "New Policy" 4회 클릭하여 아래 4개 정책 등록:
--
-- 【정책 1】 resumes_internal_insert
--   Allowed operation : INSERT
--   Target roles      : authenticated
--   USING expression  : (비워둠)
--   WITH CHECK        : (
--     EXISTS (SELECT 1 FROM public.employees e
--             WHERE e.id = auth.uid()
--             AND e.role IN ('ceo','admin','director','division_head','hr_admin','leader'))
--   )
--
-- 【정책 2】 resumes_internal_select — Allowed: SELECT, USING = (위 EXISTS)
-- 【정책 3】 resumes_internal_update — Allowed: UPDATE, USING + CHECK = (위 EXISTS)
-- 【정책 4】 resumes_internal_delete — Allowed: DELETE, USING = (admin/hr_admin/ceo/director/division_head)
--
-- 확인 SQL (적용 후):
-- SELECT polname FROM pg_policy
-- WHERE polrelid = 'storage.objects'::regclass
--   AND polname LIKE 'resumes_%'
-- ORDER BY polname;
-- ═══════════════════════════════════════════════════════════════════════
