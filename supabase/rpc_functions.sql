-- ============================================================
-- RPC Functions for Performance Optimization
-- Supabase Dashboard > SQL Editor에서 실행하세요
-- ============================================================

-- 1. 채팅방 목록 조회 (N+1 쿼리 해소)
-- useRealtimeRooms.ts에서 사용
CREATE OR REPLACE FUNCTION get_my_chat_rooms(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  description text,
  linked_project_id uuid,
  linked_department text,
  is_ai_enabled boolean,
  is_archived boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  unread_count integer,
  is_pinned boolean,
  is_muted boolean,
  last_message text,
  member_count bigint,
  dm_partner_name text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.type,
    r.description,
    r.linked_project_id,
    r.linked_department,
    r.is_ai_enabled,
    r.is_archived,
    r.created_by,
    r.created_at,
    r.updated_at,
    r.last_message_at,
    COALESCE(crm.unread_count, 0)::integer,
    COALESCE(crm.is_pinned, false),
    COALESCE(crm.is_muted, false),
    (
      SELECT m.content
      FROM messages m
      WHERE m.room_id = r.id AND m.is_deleted = false
      ORDER BY m.created_at DESC
      LIMIT 1
    ),
    (
      SELECT COUNT(*)
      FROM chat_room_members cm2
      WHERE cm2.room_id = r.id
    ),
    CASE
      WHEN r.type = 'dm' THEN (
        SELECT e.name
        FROM chat_room_members cm3
        JOIN employees e ON e.id = cm3.user_id
        WHERE cm3.room_id = r.id AND cm3.user_id != p_user_id
        LIMIT 1
      )
      ELSE NULL
    END
  FROM chat_room_members crm
  JOIN chat_rooms r ON r.id = crm.room_id
  WHERE crm.user_id = p_user_id
    AND r.is_archived = false
  ORDER BY
    COALESCE(crm.is_pinned, false) DESC,
    r.last_message_at DESC NULLS LAST;
END;
$$;

-- 2. 등급 분포 조회 (평가 대시보드용)
-- useDashboard.ts에서 사용 (선택적)
CREATE OR REPLACE FUNCTION get_grade_distribution(p_period_id uuid)
RETURNS TABLE (
  grade text,
  count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vs.grade,
    COUNT(*)
  FROM v_evaluation_summary vs
  WHERE vs.period_id = p_period_id
    AND vs.grade IS NOT NULL
  GROUP BY vs.grade
  ORDER BY
    CASE vs.grade
      WHEN 'S' THEN 1
      WHEN 'A' THEN 2
      WHEN 'B' THEN 3
      WHEN 'C' THEN 4
      WHEN 'D' THEN 5
      ELSE 6
    END;
END;
$$;

-- 권한 설정
GRANT EXECUTE ON FUNCTION get_my_chat_rooms(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_chat_rooms(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_grade_distribution(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_grade_distribution(uuid) TO service_role;
