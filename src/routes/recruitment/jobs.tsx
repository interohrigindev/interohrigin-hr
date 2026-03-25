import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Link2, Copy } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useJobPostings, useJobPostingMutations } from '@/hooks/useRecruitment'
import { POSTING_STATUS_LABELS, POSTING_STATUS_COLORS, EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LEVEL_LABELS } from '@/lib/recruitment-constants'
import type { PostingStatus } from '@/types/recruitment'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

export default function RecruitmentJobs() {
  const navigate = useNavigate()
  const { postings, loading, refetch } = useJobPostings()
  const { deletePosting } = useJobPostingMutations()
  const { toast } = useToast()

  async function handleDelete(id: string, title: string) {
    if (!confirm(`"${title}" 공고를 삭제하시겠습니까?`)) return
    const { error } = await deletePosting(id)
    if (error) {
      toast('삭제 실패: ' + error.message, 'error')
    } else {
      toast('채용공고가 삭제되었습니다.', 'success')
      refetch()
    }
  }

  function copyApplyLink(postingId: string, source?: string) {
    const base = `${window.location.origin}/apply/${postingId}`
    const url = source ? `${base}?source=${source}` : base
    navigator.clipboard.writeText(url)
    toast('지원 링크가 복사되었습니다.', 'info')
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">채용공고 관리</h1>
        <Button onClick={() => navigate('/admin/recruitment/jobs/new')}>
          <Plus className="h-4 w-4 mr-1" /> 새 공고
        </Button>
      </div>

      {postings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-400 mb-4">등록된 채용공고가 없습니다.</p>
            <Button onClick={() => navigate('/admin/recruitment/jobs/new')}>
              첫 채용공고 만들기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {postings.map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => navigate(`/admin/recruitment/jobs/${p.id}`)}>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{p.title}</h3>
                      <Badge variant="default" className={POSTING_STATUS_COLORS[p.status as PostingStatus] || ''}>
                        {POSTING_STATUS_LABELS[p.status as PostingStatus] || p.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                      {p.position && <span>{p.position}</span>}
                      <span>{EMPLOYMENT_TYPE_LABELS[p.employment_type] || p.employment_type}</span>
                      <span>{EXPERIENCE_LEVEL_LABELS[p.experience_level] || p.experience_level}</span>
                      {p.deadline && <span>마감: {formatDate(p.deadline, 'yyyy.MM.dd')}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => copyApplyLink(p.id)} title="지원 링크 복사">
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/recruitment/jobs/new?clone=${p.id}`)} title="공고 복제">
                      <Copy className="h-4 w-4 text-brand-600" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/recruitment/jobs/new?edit=${p.id}`)} title="수정">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id, p.title)} title="삭제">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
