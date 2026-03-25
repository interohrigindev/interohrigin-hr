import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, BarChart3, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useRecruitmentStats } from '@/hooks/useRecruitment'
import { useCandidates, useJobPostings } from '@/hooks/useRecruitment'
import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_COLORS, POSTING_STATUS_LABELS, POSTING_STATUS_COLORS } from '@/lib/recruitment-constants'
import type { CandidateStatus, PostingStatus } from '@/types/recruitment'
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

  // 채용공고별 지원자 그룹핑
  const candidatesByPosting = new Map<string, { title: string; status: string; deadline: string | null; candidates: typeof candidates }>()

  // 공고별 그룹 초기화
  postings.forEach((p) => {
    candidatesByPosting.set(p.id, {
      title: p.title,
      status: p.status,
      deadline: p.deadline,
      candidates: [],
    })
  })

  // 미배정 그룹
  const unassigned: typeof candidates = []

  candidates.forEach((c) => {
    if (c.job_posting_id && candidatesByPosting.has(c.job_posting_id)) {
      candidatesByPosting.get(c.job_posting_id)!.candidates.push(c)
    } else {
      unassigned.push(c)
    }
  })

  // NEW 판별 (48시간 이내)
  const isNew = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime()
    return diff < 48 * 60 * 60 * 1000
  }

  // 풀다운 상태 관리
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    // 지원자가 있는 공고는 기본 펼침
    candidatesByPosting.forEach((group, id) => {
      if (group.candidates.length > 0) initial.add(id)
    })
    if (unassigned.length > 0) initial.add('__unassigned__')
    return initial
  })

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

      {/* 채용공고별 지원자 현황 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>채용공고별 지원자 현황</CardTitle>
            <span className="text-sm text-gray-500">총 {candidates.length}명</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {candidatesByPosting.size === 0 && unassigned.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">등록된 채용공고가 없습니다.</p>
          ) : (
            <>
              {Array.from(candidatesByPosting.entries()).map(([postingId, group]) => {
                const isOpen = expanded.has(postingId)
                const newCount = group.candidates.filter((c) => isNew(c.created_at)).length
                return (
                  <div key={postingId} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left"
                      onClick={() => toggleExpand(postingId)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                        <span className="font-medium text-gray-900 text-sm truncate">{group.title}</span>
                        <Badge variant="default" className={POSTING_STATUS_COLORS[group.status as PostingStatus] || ''}>
                          {POSTING_STATUS_LABELS[group.status as PostingStatus] || group.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {newCount > 0 && (
                          <Badge variant="default" className="bg-red-500 text-white text-xs px-1.5 py-0.5">
                            NEW +{newCount}
                          </Badge>
                        )}
                        <span className="text-sm text-gray-500">{group.candidates.length}명</span>
                      </div>
                    </button>
                    {isOpen && group.candidates.length > 0 && (
                      <div className="border-t border-gray-100">
                        {group.candidates
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                          .map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0"
                            onClick={() => navigate(`/admin/recruitment/candidates/${c.id}`)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium text-gray-900 text-sm">{c.name}</span>
                              {isNew(c.created_at) && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 leading-none">
                                  NEW
                                </span>
                              )}
                              <span className="text-xs text-gray-400 hidden sm:inline">{c.email}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="default" className={CANDIDATE_STATUS_COLORS[c.status as CandidateStatus] || ''}>
                                {CANDIDATE_STATUS_LABELS[c.status as CandidateStatus] || c.status}
                              </Badge>
                              <span className="text-xs text-gray-400 w-12 text-right">
                                {formatDate(c.created_at, 'MM/dd')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {isOpen && group.candidates.length === 0 && (
                      <div className="border-t border-gray-100 px-4 py-3">
                        <p className="text-xs text-gray-400">지원자가 없습니다.</p>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* 미배정 지원자 */}
              {unassigned.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => toggleExpand('__unassigned__')}
                  >
                    <div className="flex items-center gap-2">
                      {expanded.has('__unassigned__') ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <span className="font-medium text-gray-500 text-sm">공고 미배정</span>
                    </div>
                    <span className="text-sm text-gray-500">{unassigned.length}명</span>
                  </button>
                  {expanded.has('__unassigned__') && (
                    <div className="border-t border-gray-100">
                      {unassigned
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0"
                          onClick={() => navigate(`/admin/recruitment/candidates/${c.id}`)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-gray-900 text-sm">{c.name}</span>
                            {isNew(c.created_at) && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 leading-none">
                                NEW
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="default" className={CANDIDATE_STATUS_COLORS[c.status as CandidateStatus] || ''}>
                              {CANDIDATE_STATUS_LABELS[c.status as CandidateStatus] || c.status}
                            </Badge>
                            <span className="text-xs text-gray-400 w-12 text-right">
                              {formatDate(c.created_at, 'MM/dd')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
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
  )
}
