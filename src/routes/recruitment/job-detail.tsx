import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Link2, Copy, MapPin, Clock, Users, Banknote, CalendarDays, Building2, Phone, Mail, User, Briefcase, ListChecks, Gift, ChevronRight, Pencil, Sparkles } from 'lucide-react'
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

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-900">{value}</p>
      </div>
    </div>
  )
}

function TextSection({ title, content }: { title: string; content: string | null | undefined }) {
  if (!content) return null
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
      <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-4">
        {content}
      </div>
    </div>
  )
}

export default function RecruitmentJobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { posting, loading: postLoading } = useJobPosting(id)
  const { candidates, loading: candLoading } = useCandidates(id)
  const { updatePosting } = useJobPostingMutations()
  const [, setStatusUpdating] = useState(false)

  function copyLink(source?: string) {
    const base = `${window.location.origin}/apply/${id}`
    const url = source ? `${base}?source=${source}` : base
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
        <Button variant="ghost" onClick={() => navigate('/admin/recruitment/jobs')} className="mt-4">목록으로</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/recruitment/jobs')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-500">채용공고</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 break-words">{posting.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="default" className={POSTING_STATUS_COLORS[posting.status as PostingStatus] || ''}>
                {POSTING_STATUS_LABELS[posting.status as PostingStatus]}
              </Badge>
              <span className="text-sm text-gray-500">
                {EMPLOYMENT_TYPE_LABELS[posting.employment_type]} · {EXPERIENCE_LEVEL_LABELS[posting.experience_level]}
                {posting.salary_range && ` · ${posting.salary_range}`}
                {posting.deadline && ` · 마감: ${formatDate(posting.deadline, 'yyyy.MM.dd')}`}
              </span>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => navigate(`/admin/recruitment/jobs/new?edit=${id}`)}>
              <Pencil className="h-4 w-4 mr-1" /> 수정
            </Button>
            <Select
              value={posting.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              options={Object.entries(POSTING_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ─── 공고 상세 내용 (2/3 영역) ─── */}
        <div className="lg:col-span-2 space-y-6">

          {/* 요약 카드 */}
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <InfoRow icon={Briefcase} label="고용 형태" value={EMPLOYMENT_TYPE_LABELS[posting.employment_type]} />
                <InfoRow icon={ChevronRight} label="경력 수준" value={EXPERIENCE_LEVEL_LABELS[posting.experience_level]} />
                <InfoRow icon={Users} label="채용 인원" value={posting.headcount ? `${posting.headcount}명` : null} />
                <InfoRow icon={Banknote} label="연봉 범위" value={posting.salary_range} />
                <InfoRow icon={CalendarDays} label="마감일" value={posting.deadline ? formatDate(posting.deadline, 'yyyy.MM.dd') : '상시 채용'} />
                <InfoRow icon={MapPin} label="근무지" value={posting.location} />
                <InfoRow icon={Clock} label="근무시간" value={posting.work_hours} />
                <InfoRow icon={Building2} label="포지션" value={posting.position} />
              </div>
            </CardContent>
          </Card>

          {/* 회사/팀 소개 */}
          {(posting.company_intro || posting.team_intro) && (
            <Card>
              <CardHeader><CardTitle>회사 / 팀 소개</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <TextSection title="회사 소개" content={posting.company_intro} />
                <TextSection title="팀 소개" content={posting.team_intro} />
              </CardContent>
            </Card>
          )}

          {/* 담당 업무 */}
          <Card>
            <CardHeader><CardTitle>직무 상세</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <TextSection title="담당 업무" content={posting.description} />
              <TextSection title="자격 요건 (필수)" content={posting.requirements} />
              <TextSection title="우대 사항" content={posting.preferred} />
            </CardContent>
          </Card>

          {/* 복리후생 */}
          {posting.benefits && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Gift className="h-4 w-4" /> 복리후생</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{posting.benefits}</div>
              </CardContent>
            </Card>
          )}

          {/* 전형 절차 */}
          {posting.hiring_process && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ListChecks className="h-4 w-4" /> 채용 전형</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{posting.hiring_process}</div>
              </CardContent>
            </Card>
          )}

          {/* 채용 담당자 */}
          {(posting.contact_name || posting.contact_email || posting.contact_phone) && (
            <Card>
              <CardHeader><CardTitle>채용 담당자</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-6">
                  {posting.contact_name && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-700">{posting.contact_name}</span>
                    </div>
                  )}
                  {posting.contact_email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <a href={`mailto:${posting.contact_email}`} className="text-brand-600 hover:underline">{posting.contact_email}</a>
                    </div>
                  )}
                  {posting.contact_phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-700">{posting.contact_phone}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI 면접 질문 */}
          {posting.ai_questions && (posting.ai_questions as string[]).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-brand-600" />
                  AI 추천 면접 질문 ({(posting.ai_questions as string[]).length}개)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-400 mb-3">면접 시 활용할 수 있는 AI 추천 질문입니다.</p>
                <ol className="space-y-2">
                  {(posting.ai_questions as string[]).map((q, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-bold">{i + 1}</span>
                      <span className="text-gray-700 pt-0.5">{q}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* 지원자 목록 */}
          <Card>
            <CardHeader><CardTitle>지원자 ({candidates.length}명)</CardTitle></CardHeader>
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
                        <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/recruitment/candidates/${c.id}`)}>
                          <td className="py-2.5 px-3 font-medium text-gray-900">{c.name}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant="default" className={SOURCE_CHANNEL_COLORS[c.source_channel as SourceChannel] || ''}>{SOURCE_CHANNEL_LABELS[c.source_channel as SourceChannel]}</Badge>
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge variant="default" className={CANDIDATE_STATUS_COLORS[c.status as CandidateStatus] || ''}>{CANDIDATE_STATUS_LABELS[c.status as CandidateStatus]}</Badge>
                          </td>
                          <td className="py-2.5 px-3 text-gray-500">{formatDate(c.created_at, 'MM/dd')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── 사이드바 (1/3 영역) ─── */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> 지원 링크</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {SOURCE_CHANNELS.map((source) => (
                <div key={source} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{SOURCE_CHANNEL_LABELS[source as SourceChannel]}</span>
                  <Button variant="ghost" size="sm" onClick={() => copyLink(source === 'direct' ? undefined : source)}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> 복사
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>유입 통계</CardTitle></CardHeader>
            <CardContent>
              {candidates.length === 0 ? (
                <p className="text-gray-400 text-sm">데이터 없음</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(
                    candidates.reduce((acc, c) => { acc[c.source_channel] = (acc[c.source_channel] || 0) + 1; return acc }, {} as Record<string, number>)
                  ).sort(([, a], [, b]) => b - a).map(([source, count]) => (
                    <div key={source} className="flex items-center justify-between text-sm">
                      <Badge variant="default" className={SOURCE_CHANNEL_COLORS[source as SourceChannel] || ''}>{SOURCE_CHANNEL_LABELS[source as SourceChannel]}</Badge>
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
