/**
 * HR 이벤트 → 메신저 시스템 알림 자동 발송
 *
 * 사용처: approval.tsx, leave.tsx, training.tsx 등에서
 * 승인/반려/교육 미이수 시 호출
 */

import { supabase } from '@/lib/supabase'

type NotificationType = 'system' | 'urgent_alert' | 'task_update'

/**
 * 특정 직원에게 시스템 메시지를 발송합니다.
 * DM 채팅방이 없으면 생성하지 않고 조용히 실패합니다.
 */
export async function sendSystemNotification(
  targetUserId: string,
  content: string,
  messageType: NotificationType = 'system',
) {
  try {
    // 1. 대상 직원이 참여한 DM 방 찾기 (AI Bot 방 우선)
    const { data: rooms } = await supabase
      .from('chat_room_members')
      .select('room_id, chat_rooms!inner(type)')
      .eq('user_id', targetUserId)

    if (!rooms || rooms.length === 0) return

    // AI Bot 방 또는 첫 번째 DM 방 선택
    const aiRoom = rooms.find((r: any) => r.chat_rooms?.type === 'ai_bot')
    const dmRoom = rooms.find((r: any) => r.chat_rooms?.type === 'dm')
    const targetRoom = aiRoom || dmRoom

    if (!targetRoom) return

    // 2. 시스템 메시지 삽입
    await supabase.from('messages').insert({
      room_id: targetRoom.room_id,
      sender_id: null,  // null = 시스템 메시지
      content,
      message_type: messageType,
    })

    // 3. 안읽음 수 증가
    await supabase
      .from('chat_room_members')
      .update({ unread_count: (supabase as any).raw?.('unread_count + 1') || 1 })
      .eq('room_id', targetRoom.room_id)
      .eq('user_id', targetUserId)

  } catch (err) {
    console.error('시스템 알림 발송 실패:', err)
  }
}

/**
 * 부서 채팅방에 시스템 메시지를 발송합니다.
 */
export async function sendDepartmentNotification(
  department: string,
  content: string,
  messageType: NotificationType = 'system',
) {
  try {
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('type', 'department')
      .eq('linked_department', department)
      .limit(1)
      .single()

    if (!room) return

    await supabase.from('messages').insert({
      room_id: room.id,
      sender_id: null,
      content,
      message_type: messageType,
    })
  } catch (err) {
    console.error('부서 알림 발송 실패:', err)
  }
}

// ─── 편의 함수들 ─────────────────────────────────────────────────

/** 결재 승인/반려 알림 */
export function notifyApprovalResult(
  targetUserId: string,
  title: string,
  status: 'approved' | 'rejected',
  approverName: string,
) {
  const emoji = status === 'approved' ? '✅' : '❌'
  const action = status === 'approved' ? '승인' : '반려'
  return sendSystemNotification(
    targetUserId,
    `${emoji} [전자결재] "${title}" 건이 ${approverName}님에 의해 ${action}되었습니다.`,
  )
}

/** 연차 승인/반려 알림 */
export function notifyLeaveResult(
  targetUserId: string,
  leaveType: string,
  dates: string,
  status: 'approved' | 'rejected',
) {
  const emoji = status === 'approved' ? '🏖️' : '❌'
  const action = status === 'approved' ? '승인' : '반려'
  return sendSystemNotification(
    targetUserId,
    `${emoji} [연차] ${leaveType} (${dates})이(가) ${action}되었습니다.`,
  )
}

/** 긴급 업무 배정 알림 */
export function notifyUrgentTask(
  targetUserId: string,
  taskTitle: string,
  deadline: string,
) {
  return sendSystemNotification(
    targetUserId,
    `🚨 [긴급업무] "${taskTitle}"이(가) 배정되었습니다. 마감: ${deadline}`,
    'urgent_alert',
  )
}

/** 교육 미이수 리마인드 */
export function notifyTrainingReminder(
  targetUserId: string,
  trainingName: string,
  year: number,
) {
  return sendSystemNotification(
    targetUserId,
    `📚 [교육] ${year}년 "${trainingName}" 미이수 상태입니다. 빠른 수료를 부탁드립니다.`,
  )
}
