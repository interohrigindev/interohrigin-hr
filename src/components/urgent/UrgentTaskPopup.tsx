/**
 * D3-2: 긴급업무 30분 간격 팝업 알림
 * - 오른쪽 하단에 토스트 형태로 노출
 * - 사용자가 닫으면 30분 뒤 재노출 (localStorage 기록)
 * - P1/P2 + 본인 담당 + 마감 당일·초과 미완료 건이 있을 때만 표시
 */
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, X, ArrowRight } from 'lucide-react'

const POPUP_COOLDOWN_MS = 30 * 60 * 1000 // 30분
const CHECK_INTERVAL_MS = 60 * 1000       // 60초마다 상태 체크
const DISMISS_KEY = 'urgent-popup-dismissed-at'

interface UrgentTaskLite {
  id: string
  title: string
  priority: number
  deadline: string | null
  status: string
}

export function UrgentTaskPopup() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [tasks, setTasks] = useState<UrgentTaskLite[]>([])

  useEffect(() => {
    if (!profile?.id) return

    async function check() {
      // 최근 dismiss 시각이 30분 이내면 skip
      const dismissed = Number(localStorage.getItem(DISMISS_KEY) || '0')
      if (Date.now() - dismissed < POPUP_COOLDOWN_MS) {
        setVisible(false)
        return
      }

      // 내가 담당자로 지정된 P1/P2 + 마감 당일·초과 + 미완료
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('urgent_tasks')
        .select('id, title, priority, deadline, status, assigned_to')
        .contains('assigned_to', [profile!.id])
        .neq('status', 'completed')
        .lte('priority', 2)
        .lte('deadline', today)
        .order('priority', { ascending: true })
        .limit(5)

      const list = (data || []) as UrgentTaskLite[]
      if (list.length > 0) {
        setTasks(list)
        setVisible(true)
      } else {
        setVisible(false)
      }
    }

    check()
    const id = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [profile?.id])

  function handleClose() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  function handleOpen() {
    navigate('/admin/urgent')
    handleClose()
  }

  if (!visible || tasks.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] animate-in slide-in-from-bottom-4">
      <div className="bg-white border-2 border-red-300 rounded-xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-red-500 to-orange-500 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-white" />
            <p className="text-sm font-bold text-white">긴급 업무 알림 ({tasks.length}건)</p>
          </div>
          <button onClick={handleClose} className="text-white/80 hover:text-white shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-3 space-y-1.5 max-h-60 overflow-y-auto">
          {tasks.map((t) => {
            const today = new Date().toISOString().slice(0, 10)
            const overdue = t.deadline && t.deadline < today
            return (
              <div
                key={t.id}
                onClick={handleOpen}
                className="flex items-center gap-2 px-2.5 py-2 bg-red-50 border border-red-100 rounded-md cursor-pointer hover:bg-red-100 transition-colors"
              >
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                  t.priority === 1 ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'
                }`}>
                  P{t.priority}
                </span>
                <span className="text-sm text-gray-800 font-medium flex-1 truncate">{t.title}</span>
                <span className={`text-[10px] shrink-0 ${overdue ? 'text-red-600 font-bold' : 'text-amber-600'}`}>
                  {overdue ? '초과' : '오늘'}
                </span>
              </div>
            )
          })}
        </div>
        <div className="px-3 pb-3">
          <button
            onClick={handleOpen}
            className="w-full py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-md flex items-center justify-center gap-1 transition-colors"
          >
            전체 보기 <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <p className="text-[10px] text-gray-400 text-center mt-1.5">30분 후 다시 알림</p>
        </div>
      </div>
    </div>
  )
}
