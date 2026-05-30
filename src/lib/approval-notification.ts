/**
 * 결재 통합 알림 디스패처 (PDCA #6 — Phase 1)
 * Design Ref: §4.1 — 4개 시점 1:1 매핑 + 메타 lookup 공통 helper
 *
 * 호출처:
 *  - notifyApprovalSubmitted: daily-report.tsx 송신, approval.tsx 신규 결재 생성 후
 *  - notifyApprovalStepAdvanced: approval.tsx — 같은 step 모두 완료 후 다음 step 이동 시
 *  - notifyApprovalFinalApproved: approval.tsx — nextStep > total_steps
 *  - notifyApprovalRejected: approval.tsx — action === 'rejected'
 *
 * 채널 정책 (Plan SC-01~05, FR-01~05, FR-10~12):
 *  - 모든 발송은 Promise.allSettled — 결재 액션 무차단 (silent fail)
 *  - in_app: recipient_uid 만 필요 (UI 헤더 종이 polling)
 *  - email: employees.email lookup 필수
 *  - push: recipient_uid 만 필요 (서버에서 push_subscriptions 조회)
 *  - kakao_work: Phase 7 에서 추가 (현재는 sender 가 채널 미지원시 자동 skip)
 *
 * relatedEntity type 컨벤션 (Design §4.4):
 *  - approval_pending   — 결재자에게 (도착)
 *  - approval_completed — 작성자에게 (최종 승인)
 *  - approval_rejected  — 작성자에게 (반려)
 *
 * NotificationBell RELATED_ROUTE 에 위 3개 키 매핑 → /admin/approval/:id 로 자동 navigate.
 */

import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notification-sender'
import {
  approvalRequestEmail,
  approvalCompletedEmail,
  approvalRejectedEmail,
} from '@/lib/email-templates'

// ────────────────────────────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────────────────────────────

interface ApprovalDocMeta {
  id: string
  title: string
  doc_type: string
  requester_id: string
  current_step: number
  total_steps: number
}

interface ApproverInfo {
  uid: string
  email: string | null
  name: string | null
}

// ────────────────────────────────────────────────────────────────────
// 라벨 (UI 와 통일 — approval.tsx DOC_TYPE_CONFIG 와 동기)
// ────────────────────────────────────────────────────────────────────

const DOC_TYPE_LABEL: Record<string, string> = {
  leave: '연차/반차/조퇴 신청',
  overtime: '연장/야간/휴일 근무',
  business_trip: '출장 신청',
  expense: '지출결의서',
  purchase: '사무용품 요청',
  daily_report: '일일 업무보고',
  general: '일반 결재',
}

function docTypeLabel(type: string): string {
  return DOC_TYPE_LABEL[type] || type
}

// ────────────────────────────────────────────────────────────────────
// 환경 — 이메일 절대 링크
// ────────────────────────────────────────────────────────────────────

function appUrl(): string {
  // Design Ref: §5.2 — 이메일 CTA 절대 URL. returnTo 자동 복귀를 위해 절대 경로 필수.
  return (import.meta.env.VITE_APP_URL as string | undefined) || 'https://hr.interohrigin.com'
}

function approvalLink(docId: string): string {
  return `${appUrl()}/admin/approval/${docId}`
}

// ────────────────────────────────────────────────────────────────────
// 내부 helper — 메타 / 결재자 조회
// ────────────────────────────────────────────────────────────────────

async function loadApprovalMeta(documentId: string): Promise<ApprovalDocMeta | null> {
  const { data, error } = await supabase
    .from('approval_documents')
    .select('id, title, doc_type, requester_id, current_step, total_steps')
    .eq('id', documentId)
    .maybeSingle()
  if (error || !data) {
    console.warn('[approval-notification] 문서 메타 조회 실패:', error?.message)
    return null
  }
  return data as ApprovalDocMeta
}

/**
 * 지정 step_order 의 pending approver 들 정보 (uid + email + name) 일괄 조회
 */
async function loadApproversAtStep(
  documentId: string,
  stepOrder: number,
): Promise<ApproverInfo[]> {
  // 1) approval_steps 에서 해당 step 의 pending approver_id 목록
  const { data: stepRows, error: stepErr } = await supabase
    .from('approval_steps')
    .select('approver_id, action')
    .eq('document_id', documentId)
    .eq('step_order', stepOrder)
  if (stepErr || !stepRows) {
    console.warn('[approval-notification] approval_steps 조회 실패:', stepErr?.message)
    return []
  }
  // 결재자 중 아직 pending 인 사람만 알림 대상 (이미 처리한 사람은 본인 행위로 알 수 있음)
  const pendingIds = Array.from(
    new Set(stepRows.filter((r: any) => r.action === 'pending').map((r: any) => r.approver_id as string)),
  )
  if (pendingIds.length === 0) return []

  // 2) employees 에서 이메일/이름 일괄 lookup (Design Ref: §7.2 — 단일 in 쿼리)
  return await loadEmployees(pendingIds)
}

async function loadEmployees(uids: string[]): Promise<ApproverInfo[]> {
  if (uids.length === 0) return []
  const { data, error } = await supabase
    .from('employees')
    .select('id, email, name')
    .in('id', uids)
  if (error || !data) {
    console.warn('[approval-notification] employees 조회 실패:', error?.message)
    return uids.map((uid) => ({ uid, email: null, name: null }))
  }
  const map = new Map<string, { email: string | null; name: string | null }>()
  for (const row of data as any[]) {
    map.set(row.id as string, { email: row.email ?? null, name: row.name ?? null })
  }
  return uids.map((uid) => ({
    uid,
    email: map.get(uid)?.email ?? null,
    name: map.get(uid)?.name ?? null,
  }))
}

// ────────────────────────────────────────────────────────────────────
// 3채널(+kakao_work) 동시 발송 — silent fail (Plan SC-10, FR-10)
// ────────────────────────────────────────────────────────────────────

/**
 * 단일 수신자에게 in_app + push + email + (kakao_work) 동시 발송.
 * - 결재 액션 무차단: Promise.allSettled, throw 없음.
 * - 실패는 notification_deliveries.status='failed' 로만 기록.
 * - kakao_work 채널: Phase 7 에서 sender 가 추가되면 자동 동작. 현재는 sender 가 미지원 응답.
 */
async function sendAllChannels(
  recipient: ApproverInfo,
  subject: string,
  htmlBody: string,
  relatedEntity: { type: string; id: string },
): Promise<void> {
  const tasks: Promise<unknown>[] = []

  // in_app — uid 만 있으면 발송
  tasks.push(
    sendNotification({
      channel: 'in_app',
      recipientUid: recipient.uid,
      subject,
      body: htmlBody,
      relatedEntity,
    }),
  )

  // push — uid 만 있으면 발송 (서버에서 push_subscriptions 조회)
  tasks.push(
    sendNotification({
      channel: 'push',
      recipientUid: recipient.uid,
      subject,
      body: htmlBody,
      relatedEntity,
    }),
  )

  // email — email 있을 때만 발송
  if (recipient.email) {
    tasks.push(
      sendNotification({
        channel: 'email',
        recipientUid: recipient.uid,
        recipientEmail: recipient.email,
        subject,
        body: htmlBody,
        relatedEntity,
      }),
    )
  }

  // kakao_work — Phase 7 활성화 후 자동. 현재 channel 분기 미구현이라 sender 가 'skipped' 로 기록.
  // Design Ref: §7.2 — plug-and-play. uid 만 있어도 호출 가능 (서버에서 매핑 lookup).
  tasks.push(
    sendNotification({
      channel: 'kakao_work',
      recipientUid: recipient.uid,
      subject,
      body: htmlBody,
      relatedEntity,
    }),
  )

  await Promise.allSettled(tasks)
}

// ────────────────────────────────────────────────────────────────────
// (1) 결재 송신 → 1단계 결재자 N명에게
// ────────────────────────────────────────────────────────────────────

/**
 * Plan SC-02 — 결재 송신 시 1단계 결재자에게 도착 통보.
 * @param documentId 신규 생성된 approval_documents.id (current_step=1 가정)
 */
export async function notifyApprovalSubmitted(documentId: string): Promise<void> {
  try {
    const meta = await loadApprovalMeta(documentId)
    if (!meta) return

    const approvers = await loadApproversAtStep(documentId, 1)
    if (approvers.length === 0) return

    // 신청자 이름 (메일 본문에 표시)
    const [requester] = await loadEmployees([meta.requester_id])
    const requesterName = requester?.name || '신청자'

    const link = approvalLink(meta.id)
    const docType = docTypeLabel(meta.doc_type)
    const subject = `[인터오리진] ${docType} 결재 요청 — ${meta.title}`

    const tasks = approvers.map((recipient) => {
      const { html } = approvalRequestEmail({
        docTitle: meta.title,
        requesterName,
        docType,
        link,
        recipientName: recipient.name || '결재자',
      })
      return sendAllChannels(recipient, subject, html, {
        type: 'approval_pending',
        id: meta.id,
      })
    })
    await Promise.allSettled(tasks)
  } catch (err) {
    console.warn('[approval-notification] notifyApprovalSubmitted 실패:', err)
  }
}

// ────────────────────────────────────────────────────────────────────
// (2) 단계 전환 → 다음 단계 결재자 N명에게
// ────────────────────────────────────────────────────────────────────

/**
 * Plan SC-03 — 같은 step 모든 결재자가 승인하여 다음 step 으로 진행 시 호출.
 * @param documentId 결재 문서 id
 * @param toStepOrder 진행한 다음 step_order (이 step 의 pending approver 가 수신 대상)
 */
export async function notifyApprovalStepAdvanced(
  documentId: string,
  toStepOrder: number,
): Promise<void> {
  try {
    const meta = await loadApprovalMeta(documentId)
    if (!meta) return

    const approvers = await loadApproversAtStep(documentId, toStepOrder)
    if (approvers.length === 0) return

    const [requester] = await loadEmployees([meta.requester_id])
    const requesterName = requester?.name || '신청자'

    const link = approvalLink(meta.id)
    const docType = docTypeLabel(meta.doc_type)
    const subject = `[인터오리진] ${docType} 결재 요청 — ${meta.title}`

    const tasks = approvers.map((recipient) => {
      const { html } = approvalRequestEmail({
        docTitle: meta.title,
        requesterName,
        docType,
        link,
        recipientName: recipient.name || '결재자',
        // Plan FR-02 — 다음 단계 결재자에게 "이전 단계 승인 후 도착" 컨텍스트 전달
        stepInfo: `${toStepOrder}/${meta.total_steps}단계`,
      })
      return sendAllChannels(recipient, subject, html, {
        type: 'approval_pending',
        id: meta.id,
      })
    })
    await Promise.allSettled(tasks)
  } catch (err) {
    console.warn('[approval-notification] notifyApprovalStepAdvanced 실패:', err)
  }
}

// ────────────────────────────────────────────────────────────────────
// (3) 최종 승인 → 작성자에게
// ────────────────────────────────────────────────────────────────────

/**
 * Plan SC-04 — 최종 승인 (nextStep > total_steps) 시 작성자에게 통보.
 */
export async function notifyApprovalFinalApproved(documentId: string): Promise<void> {
  try {
    const meta = await loadApprovalMeta(documentId)
    if (!meta) return

    const [requester] = await loadEmployees([meta.requester_id])
    if (!requester) return

    const link = approvalLink(meta.id)
    const docType = docTypeLabel(meta.doc_type)
    const subject = `[인터오리진] ${docType} 결재 완료 — ${meta.title}`

    const { html } = approvalCompletedEmail({
      docTitle: meta.title,
      docType,
      link,
      requesterName: requester.name || '신청자',
    })
    await sendAllChannels(requester, subject, html, {
      type: 'approval_completed',
      id: meta.id,
    })
  } catch (err) {
    console.warn('[approval-notification] notifyApprovalFinalApproved 실패:', err)
  }
}

// ────────────────────────────────────────────────────────────────────
// (4) 반려 → 작성자에게
// ────────────────────────────────────────────────────────────────────

/**
 * Plan SC-05 — 반려 시 작성자에게 사유 포함 통보.
 * @param rejectedBy.uid 반려자의 uid (employees.id)
 * @param rejectedBy.name 반려자 이름 (조회 비용 줄이려 caller 에서 전달)
 * @param reason 반려 사유 (nullable)
 */
export async function notifyApprovalRejected(
  documentId: string,
  rejectedBy: { uid: string; name: string },
  reason: string | null,
): Promise<void> {
  try {
    const meta = await loadApprovalMeta(documentId)
    if (!meta) return

    const [requester] = await loadEmployees([meta.requester_id])
    if (!requester) return

    const link = approvalLink(meta.id)
    const docType = docTypeLabel(meta.doc_type)
    const subject = `[인터오리진] ${docType} 결재 반려 — ${meta.title}`

    const { html } = approvalRejectedEmail({
      docTitle: meta.title,
      docType,
      link,
      requesterName: requester.name || '신청자',
      rejectedByName: rejectedBy.name,
      reason: reason || '(사유 미입력)',
    })
    await sendAllChannels(requester, subject, html, {
      type: 'approval_rejected',
      id: meta.id,
    })
  } catch (err) {
    console.warn('[approval-notification] notifyApprovalRejected 실패:', err)
  }
}
