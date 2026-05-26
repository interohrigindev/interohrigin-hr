-- 127: 잘못 분류된 source_channel 백필 — 파견업체 JSON 인데 direct 로 박힌 케이스
--
-- 배경:
--   apply.tsx 가 ?source=direct 로 진입한 후 폼에서 "에이전시 동의" 체크박스만
--   눌러 isAgency=true 가 된 경우, source_channel 은 그대로 'direct' 로 저장되고
--   source_detail 에만 {"agency":..., "contact":..., "email":...} JSON 이 저장되는
--   버그가 있었음. 외부 공유 페이지에서 "지원자 직접 지원" 라벨 아래에 raw JSON
--   이 노출되는 회귀 발생 (2026-05-26 대표 보고).
--
-- 코드 fix (동일 푸시):
--   · apply.tsx: isAgency 인 경우 source_channel 자동 보정 ('agency' or 'headhunter')
--   · candidate-share.tsx / candidate-report.tsx: JSON 파싱하여 업체명/담당자/이메일 분리 표시
--
-- 본 마이그레이션:
--   기존에 잘못 박힌 candidates 행의 source_channel 을 'agency' 로 일괄 보정.
--   safe-cast 함수를 사용하여 JSON parse 실패 시 NULL 반환 (예외 차단).

BEGIN;

-- ─── 안전 JSON cast helper (예외 차단) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public._try_jsonb(p_text text)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN p_text::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- ─── 백필 ───────────────────────────────────────────────────────────────
UPDATE public.candidates
SET source_channel = 'agency'
WHERE source_detail IS NOT NULL
  AND (source_channel IS NULL OR source_channel = 'direct')
  AND trim(source_detail) LIKE '{%'
  AND (
    public._try_jsonb(source_detail) IS NOT NULL
    AND (
      public._try_jsonb(source_detail) ? 'agency'
      OR public._try_jsonb(source_detail) ? 'contact'
      OR public._try_jsonb(source_detail) ? 'email'
    )
  );

-- helper 정리 (재사용 불필요)
DROP FUNCTION IF EXISTS public._try_jsonb(text);

COMMIT;

-- 영향 확인 SQL (배포 후 실행 권장):
-- SELECT id, name, source_channel, left(source_detail, 80) AS detail_preview
-- FROM candidates
-- WHERE source_detail LIKE '{%'
-- ORDER BY created_at DESC LIMIT 30;
