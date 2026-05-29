-- 139_emergency_reason_type.sql
-- F1-3: SOS(긴급연차) 신청 사유 유형 선택 단계 추가
--   reason_type: illness(갑작스러운 질병) / family(가족 경조사) / accident(교통사고) / other(기타)
--   기존 reason(자유서술)은 유지. reason_type 은 유형 분류용(통계/정책 단계강화 F3 연계).
-- emergency_leave_requests 는 ALTER 금지 대상 아님.
ALTER TABLE public.emergency_leave_requests
  ADD COLUMN IF NOT EXISTS reason_type text;

COMMENT ON COLUMN public.emergency_leave_requests.reason_type IS
  'F1-3: SOS 사유 유형 (illness/family/accident/other). reason=자유서술 별도.';
