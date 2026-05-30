-- 143: 결재 알림 dedupe + 조회 인덱스 (PDCA #6 — 결재 통합 알림 시스템)
-- Design Ref: §3.2 — 매일 cron 의 (recipient_uid, related_entity_id, sent_at) 중복 방지
-- Plan SC-09, FR-09 — 매일 09시(KST 08:30) cron 의 같은 (uid, doc_id, date) 1회 보장

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_dedupe
  ON public.notification_deliveries (recipient_uid, related_entity_id, sent_at DESC)
  WHERE related_entity_type IN ('approval_pending', 'approval_completed', 'approval_rejected');

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_approval
  ON public.notification_deliveries (related_entity_type, sent_at DESC)
  WHERE related_entity_type LIKE 'approval_%';
