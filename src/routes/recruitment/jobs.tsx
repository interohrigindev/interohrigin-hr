import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Link2, Copy, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useJobPostings, useJobPostingMutations, useDepartments } from '@/hooks/useRecruitment'
import { POSTING_STATUS_LABELS, POSTING_STATUS_COLORS, EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LEVEL_LABELS } from '@/lib/recruitment-constants'
import type { PostingStatus, JobPosting } from '@/types/recruitment'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

const DEPT_COLORS = [
  { bar: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
  { bar: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700' },
  { bar: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  { bar: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
  { bar: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700' },
  { bar: 'bg-cyan-500', bg: 'bg-cyan-50', text: 'text-cyan-700' },
]

export default function RecruitmentJobs() {
  const navigate = useNavigate()
  const { postings, loading, refetch } = useJobPostings()
  const { departments, loading: deptLoading } = useDepartments()
  const { deletePosting } = useJobPostingMutations()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)

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

  function copyApplyLink(postingId: string) {
    const url = `${window.location.origin}/apply/${postingId}`
    navigator.clipboard.writeText(url)
    toast('지원 링크가 복사되었습니다.', 'info')
  }

  // 부서별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, { deptName: string; postings: JobPosting[] }>()
    for (const p of postings) {
      const deptId = p.department_id || '__none__'
      const deptName = departments.find((d) => d.id === deptId)?.name || '부서 미지정'
      if (!map.has(deptId)) map.set(deptId, { deptName, postings: [] })
      map.get(deptId)!.postings.push(p)
    }
    // 부서 미지정 마지막으로 정렬
    const sorted = [...map.entries()].sort((a, b) => {
      if (a[0] === '__none__') return 1
      if (b[0] === '__none__') return -1
      return a[1].deptName.localeCompare(b[1].deptName)
    })
    return sorted
  }, [postings, departments])

  // 최초 로드 시 공고가 있는 부서 자동 펼침
  if (!initialized && !loading && !deptLoading) {
    const initial = new Set<string>()
    grouped.forEach(([deptId, group]) => {
      if (group.postings.length > 0) initial.add(deptId)
    })
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

  if (loading || deptLoading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">채용공고 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">부서별 채용공고를 관리합니다</p>
        </div>
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
          {grouped.map(([deptId, group], di) => {
            const color = DEPT_COLORS[di % DEPT_COLORS.length]
            const isOpen = expanded.has(deptId)
            const activeCount = group.postings.filter((p) => p.status === 'open').length

            return (
              <Card key={deptId} className="overflow-hidden">
                {/* 부서 헤더 */}
                <button
                  onClick={() => toggleExpand(deptId)}
                  className={`w-full flex items-center gap-3 px-4 py-3 ${color.bg} hover:opacity-90 transition-opacity`}
                >
                  <div className={`w-1.5 h-6 rounded-full ${color.bar}`} />
                  {isOpen
                    ? <ChevronDown className={`h-4 w-4 ${color.text}`} />
                    : <ChevronRight className={`h-4 w-4 ${color.text}`} />
                  }
                  <span className={`text-sm font-bold ${color.text}`}>{group.deptName}</span>
                  <Badge variant="default" className="text-[10px]">
                    {group.postings.length}개 공고
                  </Badge>
                  {activeCount > 0 && (
                    <Badge variant="success" className="text-[10px]">
                      채용중 {activeCount}
                    </Badge>
                  )}
                  <span className="ml-auto text-[10px] text-gray-400">
                    {isOpen ? '접기' : '펼치기'}
                  </span>
                </button>

                {/* 공고 서브 블록 */}
                {isOpen && (
                  <CardContent className="py-3 space-y-2">
                    {group.postings.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors"
                      >
                        <div
                          className="flex-1 cursor-pointer min-w-0"
                          onClick={() => navigate(`/admin/recruitment/jobs/${p.id}`)}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium text-gray-900 text-sm">{p.title}</h4>
                            <Badge variant="default" className={POSTING_STATUS_COLORS[p.status as PostingStatus] || ''}>
                              {POSTING_STATUS_LABELS[p.status as PostingStatus] || p.status}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500 mt-0.5">
                            {p.position && <span>{p.position}</span>}
                            <span>{EMPLOYMENT_TYPE_LABELS[p.employment_type] || p.employment_type}</span>
                            <span>{EXPERIENCE_LEVEL_LABELS[p.experience_level] || p.experience_level}</span>
                            {p.deadline && <span>마감: {formatDate(p.deadline, 'yyyy.MM.dd')}</span>}
                          </div>
                        </div>

                        <div className="flex gap-1 shrink-0 ml-2">
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
                    ))}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
