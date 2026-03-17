import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Link2, Copy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useJobPosting, useCandidates, useJobPostingMutations } from '@/hooks/useRecruitment'
import {
  POSTING_STATUS_LABELS, POSTING_STATUS_COLORS,
  CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_COLORS,
  SOURCE_CHANNEL_LABELS, SOURCE_CHANNEL_COLORS,
  EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LEVEL_LABELS,
} from '@/lib/recruitment-constants'
import type { PostingStatus, CandidateStatus, SourceChannel } from '@/types/recruitment'
import { formatDate } from '@/lib/utils'

const SOURCE_CHANNELS = ['direct', 'job_korea', 'headhunter', 'referral', 'university', 'agency'] as const

export default function RecruitmentJobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { posting, loading: postLoading } = useJobPosting(id)
  const { candidates, loading: candLoading } = useCandidates(id)
  const { updatePosting } = useJobPostingMutations()
  const [, setStatusUpdating] = useState(false)

  function copyLink(source?: string, ref?: string) {
    const base = `${window.location.origin}/apply/${id}`
    let url = base
    if (source) {
      url += `?source=${source}`
      if (ref) url += `&ref=${ref}`
    }
    navigator.clipboard.writeText(url)
    toast('링크가 복사되었습니다.', 'info')
  }

  async function handleStatusChange(newStatus: string) {
    if (!id) return
    setStatusUpdating(true)
    const { error } = await updatePosting(id, { status: newStatus } as any)
    if (error) {
      toast('상태 변경 실패', 'error')
    } else {
      toast('상태가 변경되었습니다.', 'success')
      window.location.reload()
    }
    setStatusUpdating(false)
  }

  if (postLoading || candLoading) return <PageSpinner />
  if (!posting) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">공고를 찾을 수 없습니다.</p>
        <Button variant="ghost" onClick={() => navigate('/admin/recruitment/jobs')} className="mt-4">
          목록으로
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/recruitment/jobs')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{posting.title}</h1>
            <Badge variant="default" className={POSTING_STATUS_COLORS[posting.status as PostingStatus] || ''}>
              {POSTING_STATUS_LABELS[posting.status as PostingStatus]}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {EMPLOYMENT_TYPE_LABELS[posting.employment_type]} · {EXPERIENCE_LEVEL_LABELS[posting.experience_level]}
            {posting.salary_range && ` · ${posting.salary_range}`}
            {posting.deadline && ` · 마감: ${formatDate(posting.deadline, 'yyyy.MM.dd')}`}
          </p>
        </div>
        <Select
          value={posting.status}
          onChange={(e) => handleStatusChange(e.target.value)}
          options={Object.entries(POSTING_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 공고 내용 */}
        <div className="lg:col-span-2 space-y-6">
          {posting.description && (
            <Card>
              <CardHeader><CardTitle>직무 설명</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{posting.description}</p>
              </CardContent>
            </Card>
          )}

          {posting.requirements && (
            <Card>
              <CardHeader><CardTitle>자격 요건</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{posting.requirements}</p>
              </CardContent>
            </Card>
          )}

          {posting.ai_questions && (posting.ai_questions as string[]).length > 0 && (
            <Card>
              <CardHeader><CardTitle>AI 면접 질문</CardTitle></CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                  {(posting.ai_questions as string[]).map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* 지원자 목록 */}
          <Card>
            <CardHeader>
              <CardTitle>지원자 ({candidates.length}명)</CardTitle>
            </CardHeader>
            <CardContent>
              {candidates.length === 0 ? (
                <p className="text-gray-400 text-sm">아직 지원자가 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-medium text-gray-500">이름</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500">유입경로</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500">상태</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500">지원일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c) => (
                        <tr
                          key={c.id}
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => navigate(`/admin/recruitment/candidates/${c.id}`)}
                        >
                          <td className="py-2.5 px-3 font-medium text-gray-900">{c.name}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant="default" className={SOURCE_CHANNEL_COLORS[c.source_channel as SourceChannel] || ''}>
                              {SOURCE_CHANNEL_LABELS[c.source_channel as SourceChannel]}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge variant="default" className={CANDIDATE_STATUS_COLORS[c.status as CandidateStatus] || ''}>
                              {CANDIDATE_STATUS_LABELS[c.status as CandidateStatus]}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-gray-500">
                            {formatDate(c.created_at, 'MM/dd')}
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

        {/* 사이드바: 유입경로별 링크 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-4 w-4" /> 지원 링크
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {SOURCE_CHANNELS.map((source) => (
                <div key={source} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">
                    {SOURCE_CHANNEL_LABELS[source as SourceChannel]}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyLink(source === 'direct' ? undefined : source)}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> 복사
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 유입경로별 통계 */}
          <Card>
            <CardHeader>
              <CardTitle>유입 통계</CardTitle>
            </CardHeader>
            <CardContent>
              {candidates.length === 0 ? (
                <p className="text-gray-400 text-sm">데이터 없음</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(
                    candidates.reduce((acc, c) => {
                      acc[c.source_channel] = (acc[c.source_channel] || 0) + 1
                      return acc
                    }, {} as Record<string, number>)
                  )
                    .sort(([, a], [, b]) => b - a)
                    .map(([source, count]) => (
                      <div key={source} className="flex items-center justify-between text-sm">
                        <Badge variant="default" className={SOURCE_CHANNEL_COLORS[source as SourceChannel] || ''}>
                          {SOURCE_CHANNEL_LABELS[source as SourceChannel]}
                        </Badge>
                        <span className="font-medium text-gray-700">{count}명</span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
