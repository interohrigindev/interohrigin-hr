-- 146: 프로젝트 담당자 변경 결재 워크플로 (2026-06-01)
-- 사용자 요구: 현 담당자 → 인수담당자 승낙 → 부서 리더·임원 합의 → manager_id 변경
-- 옵션 A: 기존 approval_documents 시스템 재활용
--
-- 흐름:
--   step 0 (신청자) = 현 담당자
--   step 1          = 인수 담당자 (assignee role)
--   step 2 (병렬)   = 부서 리더 + 부서 임원 → 둘 다 approved 되어야 진행
--   최종 승인       = 트리거가 project_boards.manager_id 자동 업데이트
--
-- 회수 정책: 양도자 수시 회수 가능 (기존 approval withdraw 로직 재사용)
-- 거절 정책: 인수자 또는 리더/임원 누구든 반려 시 즉시 전체 반려 (기존 결재 정책)
-- 관리자 우회: admin/ceo 는 결재 거치지 않고 즉시 manager_id 변경 가능 (클라이언트 가드)

BEGIN;

-- ============================================================
-- 1. content jsonb 활용 — 별도 컬럼 추가 없음
--    저장 형식: content = {
--      "project_id": "uuid",
--      "project_name": "string",
--      "from_manager_id": "uuid",
--      "from_manager_name": "string",
--      "to_manager_id": "uuid",
--      "to_manager_name": "string",
--      "reason": "string"
--    }
-- ============================================================

-- ============================================================
-- 2. 트리거: 최종 승인 시 project_boards.manager_id 자동 변경
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_project_owner_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_to_manager_id uuid;
  v_from_manager_id uuid;
BEGIN
  -- 이 함수는 approval_documents 의 AFTER UPDATE 에서만 호출됨
  -- doc_type='project_owner_transfer' 이고 OLD.status != 'approved' 였다가 NEW.status='approved' 가 된 경우에만 처리
  IF NEW.doc_type IS DISTINCT FROM 'project_owner_transfer' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' THEN
    -- 중복 호출 방지
    RETURN NEW;
  END IF;

  -- content 에서 필수 필드 추출
  BEGIN
    v_project_id      := (NEW.content->>'project_id')::uuid;
    v_to_manager_id   := (NEW.content->>'to_manager_id')::uuid;
    v_from_manager_id := (NEW.content->>'from_manager_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[apply_project_owner_transfer] content uuid 파싱 실패 doc=%, content=%', NEW.id, NEW.content;
    RETURN NEW;
  END;

  IF v_project_id IS NULL OR v_to_manager_id IS NULL THEN
    RAISE WARNING '[apply_project_owner_transfer] 필수 필드 누락 doc=%, project=%, to=%',
      NEW.id, v_project_id, v_to_manager_id;
    RETURN NEW;
  END IF;

  -- 무결성 검사 — 현재 담당자가 변경 요청 당시와 같은지
  -- (다른 결재로 이미 바뀐 케이스 방지)
  IF v_from_manager_id IS NOT NULL THEN
    PERFORM 1 FROM public.project_boards
      WHERE id = v_project_id AND manager_id = v_from_manager_id;
    IF NOT FOUND THEN
      RAISE WARNING '[apply_project_owner_transfer] 현 담당자 불일치 — 다른 경로로 이미 변경됨. project=%, expected_from=%',
        v_project_id, v_from_manager_id;
      -- 그래도 인수자로 변경 (사용자 의도 존중)
    END IF;
  END IF;

  UPDATE public.project_boards
    SET manager_id = v_to_manager_id,
        updated_at = now()
    WHERE id = v_project_id;

  IF NOT FOUND THEN
    RAISE WARNING '[apply_project_owner_transfer] project_boards 행 없음 — project=%', v_project_id;
  ELSE
    RAISE NOTICE '[apply_project_owner_transfer] OK project=% manager: % → %',
      v_project_id, v_from_manager_id, v_to_manager_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_project_owner_transfer ON public.approval_documents;
CREATE TRIGGER trg_apply_project_owner_transfer
  AFTER UPDATE OF status ON public.approval_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_project_owner_transfer();

COMMENT ON FUNCTION public.apply_project_owner_transfer() IS
  'project_owner_transfer 결재 최종 승인 시 project_boards.manager_id 자동 업데이트 — 145 후속, 2026-06-01';

-- ============================================================
-- 3. 검증 쿼리 (참고용)
-- ============================================================
-- 신규 doc_type 의 결재 조회:
--   SELECT id, title, status, current_step, total_steps, content
--   FROM approval_documents WHERE doc_type = 'project_owner_transfer'
--   ORDER BY created_at DESC LIMIT 5;
--
-- 트리거 작동 테스트:
--   UPDATE approval_documents SET status = 'approved' WHERE id = '<test doc>';
--   SELECT manager_id FROM project_boards WHERE id = '<project>';

COMMIT;
