import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, BarChart3, CheckCircle, ChevronDown, ChevronRight, EyeOff, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useRecruitmentStats, useCandidates, useJobPostings } from '@/hooks/useRecruitment'
import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_COLORS, POSTING_STATUS_LABELS, POSTING_STATUS_COLORS } from '@/lib/recruitment-constants'
import type { CandidateStatus, PostingStatus } from '@/types/recruitment'
import { formatDate } from '@/lib/utils'

/* ─── 공고 상태별 컬러 (헤더 배경) ─── */
const POSTING_HEADER_COLORS: Record<string, { bar: string; bg: string; text: string }> = {
  open: { bar: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
  draft: { bar: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
  closed: { bar: 'bg-gray-400', bg: 'bg-gray-50', text: 'text-gray-600' },
  cancelled: { bar: 'bg-red-400', bg: 'bg-red-50', text: 'text-red-600' },
}

const DEFAULT_HEADER_COLOR = { bar: 'bg-gray-400', bg: 'bg-gray-50', text: 'text-gray-600' }

/* ─── 지원자 카드 상태별 스타일 ─── */
const CANDIDATE_CARD_STYLES: Record<string, { border: string; bg: string }> = {
  applied: { border: 'border-gray-200', bg: 'bg-gray-50/30' },
  resume_reviewed: { border: 'border-blue-200', bg: 'bg-blue-50/30' },
  survey_sent: { border: 'border-indigo-200', bg: 'bg-indigo-50/30' },
  survey_done: { border: 'border-violet-200', bg: 'bg-violet-50/30' },
  interview_scheduled: { border: 'border-amber-200', bg: 'bg-amber-50/30' },
  video_done: { border: 'border-orange-200', bg: 'bg-orange-50/30' },
  face_to_face_scheduled: { border: 'border-purple-200', bg: 'bg-purple-50/30' },
  face_to_face_done: { border: 'border-brand-200', bg: 'bg-brand-50/30' },
  processing: { border: 'border-yellow-200', bg: 'bg-yellow-50/30' },
  analyzed: { border: 'border-teal-200', bg: 'bg-teal-50/30' },
  decided: { border: 'border-cyan-200', bg: 'bg-cyan-50/30' },
  hired: { border: 'border-green-200', bg: 'bg-green-50/30' },
  rejected: { border: 'border-red-200', bg: 'bg-red-50/30' },
}

const DEFAULT_CARD_STYLE = { border: 'border-gray-200', bg: 'bg-gray-50/30' }

export default function RecruitmentDashboard() {
  const navigate = useNavigate()
  const { stats, loading: statsLoading } = useRecruitmentStats()
  const { candidates, loading: candLoading } = useCandidates()
  const { postings, loading: postLoading } = useJobPostings()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)
  const [showRejected, setShowRejected] = useState(false)

  if (statsLoading || candLoading || postLoading) return <PageSpinner />

  const statCards = [
    { label: '진행중 공고', value: stats.openPostings, icon: Briefcase, color: 'text-brand-600' },
    { label: '총 지원자', value: stats.totalCandidates, icon: Users, color: 'text-blue-600' },
    { label: '분석 완료', value: stats.analyzedCandidates, icon: BarChart3, color: 'text-amber-600' },
    { label: '합격자', value: stats.hiredCandidates, icon: CheckCircle, color: 'text-green-600' },
  ]

  // 채용공고별 지원자 그룹핑
  const candidatesByPosting = new Map<string, { title: string; status: string; deadline: string | null; candidates: typeof candidates }>()

  postings.forEach((p) => {
    candidatesByPosting.set(p.id, {
      title: p.title,
      status: p.status,
      deadline: p.deadline,
      candidates: [],
    })
  })

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

  // 최초 로드 시 지원자가 있는 공고 자동 펼침
  if (!initialized) {
    const initial = new Set<string>()
    candidatesByPosting.forEach((group, id) => {
      if (group.candidates.length > 0) initial.add(id)
    })
    if (unassigned.length > 0) initial.add('__unassigned__')
    setExpanded(initial)
    setInitialized(true)
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 불합격 필터
  const filterCandidates = (list: typeof candidates) =>
    showRejected ? list : list.filter((c) => c.status !== 'rejected')

  // 불합격 제외 시 전체 숨겨진 수
  const hiddenRejectedCount = candidates.filter((c) => c.status === 'rejected').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">채용 대시보드</h1>
        <Button onClick={() => navigate('/admin/recruitment/jobs/new')}>
          새 채용공고
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} className="border-l-4" style={{ borderLeftColor: 'var(--tw-border-opacity)' }}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-gray-500">{s.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">{s.value}</p>
                </div>
                <s.icon className={`h-8 w-8 ${s.color} opacity-50`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 공고별 지원자 현황 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>채용공고별 지원자 현황</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">총 {candidates.length}명</span>
              <Button
                variant={showRejected ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setShowRejected(!showRejected)}
              >
                {showRejected ? <Eye className="h-3.5 w-3.5 mr-1" /> : <EyeOff className="h-3.5 w-3.5 mr-1" />}
                {showRejected ? '불합격 포함 중' : `불합격 지원자 포함`}
                {!showRejected && hiddenRejectedCount > 0 && (
                  <span className="ml-1 text-[10px]">({hiddenRejectedCount})</span>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {candidatesByPosting.size === 0 && unassigned.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">등록된 채용공고가 없습니다.</p>
          ) : (
            <>
              {Array.from(candidatesByPosting.entries()).map(([postingId, group]) => {
                const isOpen = expanded.has(postingId)
                const filtered = filterCandidates(group.candidates)
                const newCount = filtered.filter((c) => isNew(c.created_at)).length
                const headerColor = POSTING_HEADER_COLORS[group.status] || DEFAULT_HEADER_COLOR

                return (
                  <div key={postingId} className="rounded-lg overflow-hidden border border-gray-200">
                    {/* 공고 헤더 */}
                    <button
                      className={`w-full flex items-center gap-3 px-4 py-3 ${headerColor.bg} hover:opacity-90 transition-opacity`}
                      onClick={() => toggleExpand(postingId)}
                    >
                      <div className={`w-1.5 h-6 rounded-full ${headerColor.bar}`} />
                      {isOpen
                        ? <ChevronDown className={`h-4 w-4 ${headerColor.text}`} />
                        : <ChevronRight className={`h-4 w-4 ${headerColor.text}`} />
                      }
                      <span className={`font-medium text-sm truncate ${headerColor.text}`}>{group.title}</span>
                      <Badge variant="default" className={POSTING_STATUS_COLORS[group.status as PostingStatus] || ''}>
                        {POSTING_STATUS_LABELS[group.status as PostingStatus] || group.status}
                      </Badge>
                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                        {newCount > 0 && (
                          <Badge variant="default" className="bg-red-500 text-white text-[10px] px-1.5 py-0.5">
                            NEW +{newCount}
                          </Badge>
                        )}
                        <span className="text-xs text-gray-500">{filtered.length}명</span>
                        <span className="text-[10px] text-gray-400">{isOpen ? '접기' : '펼치기'}</span>
                      </div>
                    </button>

                    {/* 지원자 카드 그리드 */}
                    {isOpen && filtered.length > 0 && (
                      <div className="p-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                          {filtered
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((c) => {
                              const cardStyle = CANDIDATE_CARD_STYLES[c.status as string] || DEFAULT_CARD_STYLE
                              return (
                                <button
                                  key={c.id}
                                  className={`relative p-3 rounded-lg border-2 text-left transition-all hover:shadow-md ${cardStyle.border} ${cardStyle.bg}`}
                                  onClick={() => navigate(`/admin/recruitment/candidates/${c.id}`)}
                                >
                                  {isNew(c.created_at) && (
                                    <span className="absolute -top-1.5 -left-1.5 px-1 py-0.5 rounded text-[9px] font-bold bg-red-500 text-white leading-none">
                                      NEW
                                    </span>
                                  )}
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-[11px] font-bold text-brand-700 shrink-0">
                                      {c.name[0]}
                                    </div>
                                    <span className="font-medium text-gray-900 text-xs truncate">{c.name}</span>
                                  </div>
                                  <Badge variant="default" className={`${CANDIDATE_STATUS_COLORS[c.status as CandidateStatus] || ''} text-[10px]`}>
                                    {CANDIDATE_STATUS_LABELS[c.status as CandidateStatus] || c.status}
                                  </Badge>
                                  <p className="text-[10px] text-gray-400 mt-1">{formatDate(c.created_at, 'MM/dd')}</p>
                                </button>
                              )
                            })}
                        </div>
                      </div>
                    )}
                    {isOpen && filtered.length === 0 && (
                      <div className="px-4 py-3">
                        <p className="text-xs text-gray-400">
                          {group.candidates.length > 0 && !showRejected
                            ? '불합격 지원자만 있습니다. 상단 토글로 확인하세요.'
                            : '지원자가 없습니다.'}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* 미배정 지원자 */}
              {unassigned.length > 0 && (() => {
                const filtered = filterCandidates(unassigned)
                if (filtered.length === 0 && !showRejected) return null
                const isOpen = expanded.has('__unassigned__')
                return (
                  <div className="rounded-lg overflow-hidden border border-gray-200">
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:opacity-90 transition-opacity"
                      onClick={() => toggleExpand('__unassigned__')}
                    >
                      <div className="w-1.5 h-6 rounded-full bg-gray-400" />
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 text-gray-500" />
                        : <ChevronRight className="h-4 w-4 text-gray-500" />
                      }
                      <span className="font-medium text-gray-500 text-sm">공고 미배정</span>
                      <span className="ml-auto text-xs text-gray-500">{filtered.length}명</span>
                    </button>
                    {isOpen && filtered.length > 0 && (
                      <div className="p-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                          {filtered
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((c) => {
                              const cardStyle = CANDIDATE_CARD_STYLES[c.status as string] || DEFAULT_CARD_STYLE
                              return (
                                <button
                                  key={c.id}
                                  className={`relative p-3 rounded-lg border-2 text-left transition-all hover:shadow-md ${cardStyle.border} ${cardStyle.bg}`}
                                  onClick={() => navigate(`/admin/recruitment/candidates/${c.id}`)}
                                >
                                  {isNew(c.created_at) && (
                                    <span className="absolute -top-1.5 -left-1.5 px-1 py-0.5 rounded text-[9px] font-bold bg-red-500 text-white leading-none">
                                      NEW
                                    </span>
                                  )}
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-[11px] font-bold text-brand-700 shrink-0">
                                      {c.name[0]}
                                    </div>
                                    <span className="font-medium text-gray-900 text-xs truncate">{c.name}</span>
                                  </div>
                                  <Badge variant="default" className={`${CANDIDATE_STATUS_COLORS[c.status as CandidateStatus] || ''} text-[10px]`}>
                                    {CANDIDATE_STATUS_LABELS[c.status as CandidateStatus] || c.status}
                                  </Badge>
                                  <p className="text-[10px] text-gray-400 mt-1">{formatDate(c.created_at, 'MM/dd')}</p>
                                </button>
                              )
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
