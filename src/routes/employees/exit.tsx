import { useState, useEffect, useCallback } from 'react'
import { UserX, Building2, Calendar, Phone, Mail } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'

interface InactiveEmployee {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  department_id: string | null
  department_name: string | null
  team_name: string | null
  updated_at: string
}

const ROLE_LABELS: Record<string, string> = {
  employee: '사원',
  leader: '팀장',
  director: '이사',
  division_head: '본부장',
  ceo: '대표',
  admin: '관리자',
}

export default function ExitManage() {
  const [loading, setLoading] = useState(true)
  const [inactiveEmployees, setInactiveEmployees] = useState<InactiveEmployee[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [empRes, deptRes] = await Promise.all([
      supabase
        .from('employees')
        .select('id, name, email, phone, role, department_id, updated_at')
        .eq('is_active', false)
        .order('updated_at', { ascending: false }),
      supabase.from('departments').select('id, name, parent_id'),
    ])

    if (empRes.data && deptRes.data) {
      const depts = deptRes.data as { id: string; name: string; parent_id: string | null }[]
      const enriched: InactiveEmployee[] = empRes.data.map((emp: any) => {
        const dept = depts.find((d) => d.id === emp.department_id)
        // department_id가 팀(parent_id 있음)이면 팀명과 부서명 분리
        let department_name: string | null = null
        let team_name: string | null = null
        if (dept) {
          if (dept.parent_id) {
            team_name = dept.name
            const parent = depts.find((d) => d.id === dept.parent_id)
            department_name = parent?.name || null
          } else {
            department_name = dept.name
          }
        }
        return { ...emp, department_name, team_name }
      })
      setInactiveEmployees(enriched)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">퇴사 관리</h1>

      <Card>
        <CardContent className="py-4 text-center">
          <p className="text-2xl font-bold text-gray-600">{inactiveEmployees.length}</p>
          <p className="text-xs text-gray-500">퇴사 / 비활성 직원</p>
        </CardContent>
      </Card>

      {inactiveEmployees.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserX className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">퇴사 또는 비활성화된 직원이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserX className="h-4 w-4 text-gray-600" /> 퇴사 / 비활성 직원 목록
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {inactiveEmployees.map((emp) => (
                <div key={emp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{emp.name}</p>
                      <Badge variant="default" className="text-[10px]">
                        {ROLE_LABELS[emp.role] || emp.role}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      {emp.department_name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {emp.department_name}
                          {emp.team_name && ` / ${emp.team_name}`}
                        </span>
                      )}
                      {emp.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {emp.email}
                        </span>
                      )}
                      {emp.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {emp.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> 비활성화: {new Date(emp.updated_at).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  </div>
                  <Badge variant="default" className="bg-gray-200 text-gray-600 shrink-0">비활성</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
