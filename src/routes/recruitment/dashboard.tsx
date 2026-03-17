import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, BarChart3, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useRecruitmentStats } from '@/hooks/useRecruitment'
import { useCandidates, useJobPostings } from '@/hooks/useRecruitment'
import { SOURCE_CHANNEL_LABELS, SOURCE_CHANNEL_COLORS, CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_COLORS, POSTING_STATUS_LABELS, POSTING_STATUS_COLORS } from '@/lib/recruitment-constants'
import type { SourceChannel, CandidateStatus, PostingStatus } from '@/types/recruitment'
import { formatDate } from '@/lib/utils'

export default function RecruitmentDashboard() {
  const navigate = useNavigate()
  const { stats, loading: statsLoading } = useRecruitmentStats()
  const { candidates, loading: candLoading } = useCandidates()
  const { postings, loading: postLoading } = useJobPostings()

  if (statsLoading || candLoading || postLoading) return <PageSpinner />

  const statCards = [
    { label: '진행중 공고', value: stats.openPostings, icon: Briefcase, color: 'text-brand-600' },
    { label: '총 지원자', value: stats.totalCandidates, icon: Users, color: 'text-blue-600' },
    { label: '분석 완료', value: stats.analyzedCandidates, icon: BarChart3, color: 'text-amber-600' },
    { label: '합격자', value: stats.hiredCandidates, icon: CheckCircle, color: 'text-green-600' },
  ]

  const recentCandidates = candidates.slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">채용 대시보드</h1>
        <Button onClick={() => navigate('/admin/recruitment/jobs/new')}>
          새 채용공고
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{s.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{s.value}</p>
                </div>
                <s.icon className={`h-10 w-10 ${s.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 유입경로별 통계 */}
        <Card>
          <CardHeader>
            <CardTitle>유입경로별 지원 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(stats.sourceBreakdown).length === 0 ? (
              <p className="text-gray-400 text-sm">아직 지원자가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(stats.sourceBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([source, count]) => {
                    const total = stats.totalCandidates || 1
                    const pct = Math.round((count / total) * 100)
                    return (
                      <div key={source} className="flex items-center gap-3">
                        <Badge variant="default" className={SOURCE_CHANNEL_COLORS[source as SourceChannel] || ''}>
                          {SOURCE_CHANNEL_LABELS[source as SourceChannel] || source}
                        </Badge>
                        <div className="flex-1">
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-brand-500 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-medium text-gray-700 w-16 text-right">
                          {count}명 ({pct}%)
                        </span>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 진행중 공고 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>채용공고</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/recruitment/jobs')}>
                전체 보기
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {postings.length === 0 ? (
              <p className="text-gray-400 text-sm">등록된 채용공고가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {postings.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/recruitment/jobs/${p.id}`)}
                  >
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{p.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.deadline ? `마감: ${formatDate(p.deadline, 'MM/dd')}` : '마감일 미정'}
                      </p>
                    </div>
                    <Badge variant="default" className={POSTING_STATUS_COLORS[p.status as PostingStatus] || ''}>
                      {POSTING_STATUS_LABELS[p.status as PostingStatus] || p.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 최근 지원자 */}
      <Card>
        <CardHeader>
          <CardTitle>최근 지원자</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCandidates.length === 0 ? (
            <p className="text-gray-400 text-sm">아직 지원자가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">이름</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">이메일</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">유입경로</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">상태</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">지원일</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCandidates.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/admin/recruitment/candidates/${c.id}`)}
                    >
                      <td className="py-2.5 px-3 font-medium text-gray-900">{c.name}</td>
                      <td className="py-2.5 px-3 text-gray-600">{c.email}</td>
                      <td className="py-2.5 px-3">
                        <Badge variant="default" className={SOURCE_CHANNEL_COLORS[c.source_channel as SourceChannel] || ''}>
                          {SOURCE_CHANNEL_LABELS[c.source_channel as SourceChannel] || c.source_channel}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="default" className={CANDIDATE_STATUS_COLORS[c.status as CandidateStatus] || ''}>
                          {CANDIDATE_STATUS_LABELS[c.status as CandidateStatus] || c.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-gray-500">
                        {formatDate(c.created_at, 'MM/dd HH:mm')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
