/**
 * 헤더 종 아이콘 — 인앱 알림 인박스
 *  - 60초 polling 으로 새 알림 자동 갱신
 *  - 미읽음 카운트 빨간 배지 표시
 *  - 드롭다운: 최근 30건 + 읽음 처리
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatDate } from '@/lib/utils'

interface InboxItem {
  id: string
  subject: string | null
  body: string | null
  related_entity_type: string | null
  related_entity_id: string | null
  sent_at: string
  read_at: string | null
  status: string
}

// PDCA #6 Phase 3 — Design Ref: §5.1
// approval_* 3종은 :id placeholder 를 related_entity_id 로 치환하여 navigate
const RELATED_ROUTE: Record<string, string> = {
  leave_promotion: '/my/leave-promotion',
  overtime_request: '/my/overtime',
  anonymous_report: '/admin/system/anonymous-reports',
  approval_pending: '/admin/approval/:id',
  approval_completed: '/admin/approval/:id',
  approval_rejected: '/admin/approval/:id',
}

function resolveRoute(template: string, id: string | null): string | null {
  if (!template.includes(':id')) return template
  if (!id) return null
  return template.replace(':id', id)
}

const POLL_MS = 60_000

export function NotificationBell() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  async function load() {
    if (!profile?.id) return
    setLoading(true)
    const { data } = await supabase.rpc('list_my_inbox', { p_limit: 30 })
    setItems((data || []) as InboxItem[])
    setLoading(false)
  }

  useEffect(() => {
    if (!profile?.id) return
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [profile?.id])

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function markRead(id: string) {
    await supabase.rpc('mark_notification_read', { p_delivery_id: id })
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, read_at: new Date().toISOString() } : it)))
  }

  async function markAllRead() {
    const unread = items.filter((it) => !it.read_at)
    await Promise.all(unread.map((it) => supabase.rpc('mark_notification_read', { p_delivery_id: it.id })))
    setItems((prev) => prev.map((it) => ({ ...it, read_at: it.read_at || new Date().toISOString() })))
  }

  function openItem(item: InboxItem) {
    if (!item.read_at) markRead(item.id)
    const template = item.related_entity_type ? RELATED_ROUTE[item.related_entity_type] : null
    if (!template) return
    const route = resolveRoute(template, item.related_entity_id)
    if (route) {
      navigate(route)
      setOpen(false)
    }
  }

  const unreadCount = items.filter((it) => !it.read_at).length

  if (!profile?.id) return null

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center rounded-lg p-2 text-gray-600 hover:bg-gray-100"
        aria-label="알림"
        title="알림"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center ring-2 ring-white shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 sm:w-96 max-h-[70vh] bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
            <span className="text-sm font-semibold text-gray-800">알림 ({items.length})</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-600 hover:underline flex items-center gap-0.5">
                <Check className="h-3 w-3" /> 모두 읽음
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {loading && items.length === 0 && (
              <div className="text-center py-6 text-xs text-gray-400">불러오는 중...</div>
            )}
            {!loading && items.length === 0 && (
              <div className="text-center py-8 text-xs text-gray-400">받은 알림이 없습니다</div>
            )}
            {items.map((it) => {
              const isUnread = !it.read_at
              const tpl = it.related_entity_type ? RELATED_ROUTE[it.related_entity_type] : null
              const hasRoute = !!(tpl && resolveRoute(tpl, it.related_entity_id))
              return (
                <button
                  key={it.id}
                  onClick={() => openItem(it)}
                  className={`block w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 ${isUnread ? 'bg-blue-50/40' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm break-keep ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {it.subject || '(제목 없음)'}
                      </div>
                      <div className="text-xs text-gray-500 line-clamp-2 mt-0.5 break-keep">
                        {it.body ? it.body.replace(/<[^>]+>/g, '').slice(0, 100) : ''}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-400">{formatDate(it.sent_at, 'MM.dd HH:mm')}</span>
                        {hasRoute && <ExternalLink className="h-3 w-3 text-brand-400" />}
                      </div>
                    </div>
                    {isUnread && <span className="mt-1 h-2 w-2 rounded-full bg-rose-500 shrink-0" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
