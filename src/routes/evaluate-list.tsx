import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useEvaluationPeriods, useTargetsList } from '@/hooks/useEvaluation'
import { supabase } from '@/lib/supabase'
import { PageSpinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import {
  EVALUATION_STATUS_LABELS,
  EVALUATION_STATUS_COLORS,
  ROLE_LABELS,
} from '@/lib/constants'
import type { EmployeeRole } from '@/types/database'
import { ClipboardList } from 'lucide-react'

// 역할별 평가 가능한 최소 target status
const ROLE_REQUIRED_STATUS: Record<string, string> = {
  leader: 'self_done',
  director: 'leader_done',
  division_head: 'leader_done',
  ceo: 'director_done',
}

const STATUS_ORDER = [
  'pending', 'self_done', 'leader_done',
  'director_done', 'ceo_done', 'completed',
]

export default function EvaluateList() {
  const { profile } = useAuth()
  const { activePeriod, loading: periodLoading } = useEvaluationPeriods()
  const { targets, loading: targetsLoading } = useTargetsList(activePeriod?.id ?? null)
  const navigate = useNavigate()

  const [deptMap, setDeptMap] = useState<Record<string, string>>({})
  const [deptLoading, setDeptLoading] = useState(true)

  useEffect(() => {
    async function fetchDepts() {
      const { data } = await supabase.from('departments').select('id, name')
      const map: Record<string, string> = {}
      data?.forEach((d) => { map[d.id] = d.name })
      setDeptMap(map)
      setDeptLoading(false)
    }
    fetchDepts()
  }, [])

  if (periodLoading || targetsLoading || deptLoading) return <PageSpinner />

  if (!activePeriod) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-lg font-medium text-gray-600">현재 진행 중인 평가 기간이 없습니다</p>
      </div>
    )
  }

  const myRole = profile?.role as EmployeeRole | undefined
  const requiredStatus = myRole ? ROLE_REQUIRED_STATUS[myRole] : null

  // CEO: 부서 내 모든 target이 director_done 이상인 부서만 표시
  const ceoReadyDepts = new Set<string>()
  if (myRole === 'ceo') {
    const deptTargets: Record<string, typeof targets> = {}
    targets.forEach((t) => {
      const dId = t.employee.department_id ?? '__none__'
      if (!deptTargets[dId]) deptTargets[dId] = []
      deptTargets[dId].push(t)
    })
    const directorDoneIdx = STATUS_ORDER.indexOf('director_done')
    for (const [dId, dts] of Object.entries(deptTargets)) {
      const allReady = dts.every(
        (t) => STATUS_ORDER.indexOf(t.status) >= directorDoneIdx
      )
      if (allReady) ceoReadyDepts.add(dId)
    }
  }

  const filteredTargets = targets.filter((t) => {
    if (!myRole || !requiredStatus) return false
    if (myRole === 'leader' && t.employee.department_id !== profile?.department_id) return false
    // CEO: 부서단위 필터
    if (myRole === 'ceo') {
      const dId = t.employee.department_id ?? '__none__'
      if (!ceoReadyDepts.has(dId)) return false
    }
    const targetIdx = STATUS_ORDER.indexOf(t.status)
    const requiredIdx = STATUS_ORDER.indexOf(requiredStatus)
    return targetIdx >= requiredIdx
  })

  function getMyEvalStatus(targetStatus: string): 'done' | 'current' | 'waiting' {
    if (!myRole) return 'waiting'
    const roleDoneStatus = `${myRole}_done`
    const targetIdx = STATUS_ORDER.indexOf(targetStatus)
    const doneIdx = STATUS_ORDER.indexOf(roleDoneStatus)
    if (doneIdx === -1) return 'waiting'
    if (targetIdx > doneIdx) return 'done'
    return 'current'
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          {activePeriod.year}년 {activePeriod.quarter}분기 평가
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {myRole ? ROLE_LABELS[myRole] : ''} · 평가 대상 {filteredTargets.length}명
        </p>
      </div>

      {filteredTargets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white p-12">
          <ClipboardList className="h-12 w-12 text-gray-300" />
          <p className="text-gray-500">현재 평가할 대상이 없습니다</p>
          <p className="text-sm text-gray-400">
            직원의 이전 단계 평가가 완료되면 평가를 시작할 수 있습니다
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>평가 대상 목록</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-6 py-3 font-medium text-gray-500">직원명</th>
                    <th className="px-6 py-3 font-medium text-gray-500">부서</th>
                    <th className="px-6 py-3 font-medium text-gray-500">현재 상태</th>
                    <th className="px-6 py-3 font-medium text-gray-500">내 평가</th>
                    <th className="px-6 py-3 font-medium text-gray-500">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTargets.map((t) => {
                    const evalStatus = getMyEvalStatus(t.status)
                    return (
                      <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {t.employee.name}
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {t.employee.department_id
                            ? deptMap[t.employee.department_id] ?? '-'
                            : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              EVALUATION_STATUS_COLORS[t.status] ?? ''
                            }`}
                          >
                            {EVALUATION_STATUS_LABELS[t.status] ?? t.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {evalStatus === 'done' ? (
                            <Badge variant="success">완료</Badge>
                          ) : (
                            <Badge variant="warning">평가 필요</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Button
                            size="sm"
                            variant={evalStatus === 'done' ? 'outline' : 'primary'}
                            onClick={() => navigate(`/evaluate/${t.employee_id}`)}
                          >
                            {evalStatus === 'done' ? '조회' : '평가하기'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
