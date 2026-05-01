import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GraduationCap, ChevronRight, Clock, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { PageSpinner } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { OJTProgram, OJTEnrollment } from '@/types/employee-lifecycle'
import { formatDate } from '@/lib/utils'

const STATUS_LABEL: Record<string, string> = {
  enrolled: '등록됨',
  in_progress: '진행 중',
  completed: '완료',
  dropped: '중단',
}
const STATUS_VARIANT: Record<string, 'default' | 'primary' | 'success' | 'danger'> = {
  enrolled: 'default',
  in_progress: 'primary',
  completed: 'success',
  dropped: 'danger',
}

type EnrollWithProgram = OJTEnrollment & { program?: OJTProgram }

export default function MyOJT() {
  const { profile } = useAuth()
  const [enrollments, setEnrollments] = useState<EnrollWithProgram[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) return
    ;(async () => {
      const { data: enrolls } = await supabase
        .from('ojt_enrollments')
        .select('*')
        .eq('employee_id', profile.id)
        .order('created_at', { ascending: false })

      const programIds = (enrolls || []).map((e) => e.program_id)
      let programMap: Record<string, OJTProgram> = {}
      if (programIds.length > 0) {
        const { data: programs } = await supabase
          .from('ojt_programs')
          .select('*')
          .in('id', programIds)
        for (const p of (programs || []) as OJTProgram[]) programMap[p.id] = p
      }

      const enriched: EnrollWithProgram[] = (enrolls || []).map((e) => ({ ...(e as OJTEnrollment), program: programMap[e.program_id] }))
      setEnrollments(enriched)
      setLoading(false)
    })()
  }, [profile?.id])

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-brand-500" />
          내 OJT
        </h1>
        <p className="text-sm text-gray-500 mt-1">배정된 OJT 프로그램과 주차별 보고서를 확인할 수 있습니다.</p>
      </div>

      {enrollments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <GraduationCap className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">배정된 OJT 프로그램이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enrollments.map((enr) => {
            const p = enr.program
            const completedModules = Object.keys((enr.progress || {}) as Record<string, unknown>).length
            const totalModules = p?.modules?.length || 0
            const percent = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0
            return (
              <Link
                key={enr.id}
                to={`/my/ojt/${enr.program_id}`}
                className="block group"
              >
                <Card className="h-full hover:border-brand-300 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{p?.name || '(삭제된 프로그램)'}</CardTitle>
                      <Badge variant={STATUS_VARIANT[enr.status]}>{STATUS_LABEL[enr.status]}</Badge>
                    </div>
                    {p?.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {p?.duration_days || 0}일</span>
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> 모듈 {completedModules}/{totalModules}</span>
                    </div>
                    {totalModules > 0 && <ProgressBar value={percent} max={100} size="sm" />}
                    <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                      <span>등록일 {formatDate(enr.created_at, 'yyyy.MM.dd')}</span>
                      <span className="flex items-center gap-0.5 text-brand-600 group-hover:translate-x-0.5 transition-transform">
                        보러 가기 <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
