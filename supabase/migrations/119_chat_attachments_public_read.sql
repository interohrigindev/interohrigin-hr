-- 119: chat-attachments 버킷의 결재 본문 인라인 이미지 공개 읽기 허용
--
-- 문제:
--   결재 신청 시 RichEditor 가 본문에 삽입한 이미지(영수증 등)는
--   storage 'chat-attachments' 버킷에 업로드되고 publicUrl 로 src 설정됨.
--   그런데 버킷이 public 이 아니면 결재자/외부 공유 페이지에서 이미지가 깨져 보임
--   (스크린샷: 증빙 자료 영역 빈 박스만 표시).
--
-- 해결:
--   1) chat-attachments 버킷을 public 으로 변경 (publicUrl 정상 작동)
--   2) 멱등 처리 — 이미 public 이면 noop
--
-- 보안:
--   - 결재 본문/채팅 첨부 모두 사내용 자료. publicUrl 은 추측 불가능한 랜덤 경로
--     (timestamp + random36) 라 사실상 비공개 유지
--   - 권한이 더 엄격해야 한다면 후속 마이그레이션으로 별도 'approval-inline-images'
--     public 버킷 + RichEditor uploadBucket prop 분리로 전환 가능

INSERT INTO storage.buckets (id, name, public)
  VALUES ('chat-attachments', 'chat-attachments', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

-- 명시적 anon SELECT 정책도 함께 (storage.objects 레벨)
-- (이미 동일 정책이 있으면 DROP IF EXISTS 후 재생성)
DROP POLICY IF EXISTS "chat_attachments_public_read" ON storage.objects;

CREATE POLICY "chat_attachments_public_read" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'chat-attachments');

COMMENT ON POLICY "chat_attachments_public_read" ON storage.objects IS
  '결재 본문 인라인 이미지/채팅 첨부 공개 읽기 — publicUrl 정상 작동을 위해 필요';
