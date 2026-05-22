-- 119: chat-attachments 버킷의 결재 본문 인라인 이미지 공개 읽기 허용
--
-- 문제:
--   결재 신청 시 RichEditor 가 본문에 삽입한 이미지(영수증 등)는
--   storage 'chat-attachments' 버킷에 업로드되고 publicUrl 로 src 설정됨.
--   그런데 버킷이 public 이 아니면 결재자/외부 공유 페이지에서 이미지가 깨져 보임
--   (스크린샷: 증빙 자료 영역 빈 박스만 표시).
--
-- 해결:
--   storage.buckets 의 public 플래그를 true 로 설정하면 supabase 가
--   자동으로 anon SELECT 를 허용하므로 publicUrl 이 정상 동작한다.
--   (storage.objects 의 POLICY 직접 생성은 권한이 필요해 일반 마이그레이션
--    에서 불가 — buckets 의 public 토글만으로 충분)
--
-- 보안:
--   publicUrl 은 timestamp + random36 경로라 추측 불가 → 사실상 비공개 유지
--   더 엄격하면 후속에서 별도 'approval-inline-images' 버킷 분리 가능

INSERT INTO storage.buckets (id, name, public)
  VALUES ('chat-attachments', 'chat-attachments', true)
  ON CONFLICT (id) DO UPDATE SET public = true;
