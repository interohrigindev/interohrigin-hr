import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, BarChart3, CheckCircle, ChevronDown, ChevronRight, EyeOff, Eye, Trophy, UserPlus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useRecruitmentStats, useCandidates, useJobPostings } from '@/hooks/useRecruitment'
import { supabase } from '@/lib/supabase'
import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_COLORS, POSTING_STATUS_LABELS, POSTING_STATUS_COLORS } from '@/lib/recruitment-constants'
import type { CandidateStatus, PostingStatus } from '@/types/recruitment'
import type { Department } from '@/types/database'
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
  const { toast } = useToast()
  const { stats, loading: statsLoading } = useRecruitmentStats()
  const { candidates, loading: candLoading, refetch: refetchCandidates } = useCandidates()
  const { postings, loading: postLoading } = useJobPostings()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)
  const [showRejected, setShowRejected] = useState(false)
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null)

  // ─── 직원 등록 다이얼로그 ────────────────────────────────
  const [departments, setDepartments] = useState<Department[]>([])
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false)
  const [registerCandidate, setRegisterCandidate] = useState<{ id: string; name: string; email: string; phone?: string } | null>(null)
  const [registerForm, setRegisterForm] = useState({
    name: '', email: '', phone: '', department_id: '', role: 'employee', start_date: '',
  })

  useEffect(() => {
    supabase.from('departments').select('*').then(({ data }) => { if (data) setDepartments(data) })
  }, [])

  function openRegisterDialog(c: { id: string; name: string; email: string; phone?: string }) {
    setRegisterCandidate(c)
    setRegisterForm({
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      department_id: '',
      role: 'employee',
      start_date: new Date().toISOString().slice(0, 10),
    })
    setRegisterDialogOpen(true)
  }

  async function handleRegisterEmployee() {
    if (!registerForm.name.trim() || !registerForm.email.trim()) {
      toast('이름과 이메일은 필수입니다.', 'error')
      return
    }
    const { data: newEmp, error } = await supabase.from('employees').insert({
      name: registerForm.name,
      email: registerForm.email,
      phone: registerForm.phone || null,
      department_id: registerForm.department_id || null,
      role: registerForm.role,
      is_active: true,
    }).select().single()

    if (error) {
      toast('직원 등록 실패: ' + error.message, 'error')
      return
    }
    // 후보자 상태를 hired로 업데이트
    if (registerCandidate?.id) {
      await supabase.from('candidates').update({ status: 'hired' }).eq('id', registerCandidate.id)
    }
    toast(`${registerForm.name}님이 직원으로 등록되었습니다. (ID: ${newEmp.id})`, 'success')
    setRegisterDialogOpen(false)
    refetchCandidates?.()
  }

  if (statsLoading || candLoading || postLoading) return <PageSpinner />

  const statCards = [
    { key: 'openPostings', label: '진행중 공고', value: stats.openPostings, icon: Briefcase, color: 'text-brand-600', ring: 'ring-brand-400' },
    { key: 'totalCandidates', label: '총 지원자', value: stats.totalCandidates, icon: Users, color: 'text-blue-600', ring: 'ring-blue-400' },
    { key: 'analyzed', label: '분석 완료', value: stats.analyzedCandidates, icon: BarChart3, color: 'text-amber-600', ring: 'ring-amber-400' },
    { key: 'hired', label: '합격자', value: stats.hiredCandidates, icon: CheckCircle, color: 'text-green-600', ring: 'ring-green-400' },
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">채용 대시보드</h1>
        <Button className="shrink-0" onClick={() => navigate('/admin/recruitment/jobs/new')}>
          새 채용공고
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((s) => (
          <Card
            key={s.key}
            className={`border-l-4 cursor-pointer transition-shadow ${activeStatCard === s.key ? `ring-2 ${s.ring} shadow-md` : 'hover:shadow-sm'}`}
            onClick={() => setActiveStatCard(activeStatCard === s.key ? null : s.key)}
          >
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

      {/* 클릭한 카드의 풀다운 블록 */}
      {activeStatCard === 'openPostings' && (
        <Card className="border-brand-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-brand-700">
                <Briefcase className="h-5 w-5" /> 진행중 공고 ({stats.openPostings}건)
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setActiveStatCard(null)}>닫기</Button>
            </div>
          </CardHeader>
          <CardContent>
            {postings.filter((p) => p.status === 'open').length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">진행중인 공고가 없습니다.</p>
            ) : (
              <div className="divide-y">
                {postings.filter((p) => p.status === 'open').map((p) => {
                  const pCandidates = candidates.filter((c) => c.job_posting_id === p.id)
                  return (
                    <div key={p.id} className="flex items-center justify-between py-3 px-2 hover:bg-brand-50/50 cursor-pointer rounded-lg transition-colors" onClick={() => navigate(`/admin/recruitment/jobs/${p.id}`)}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                          <Briefcase className="h-4 w-4 text-brand-600" />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-gray-900">{p.title}</p>
                          <p className="text-xs text-gray-500">마감: {p.deadline ? formatDate(p.deadline) : '미정'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="primary">{pCandidates.length}명 지원</Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeStatCard === 'totalCandidates' && (
        <Card className="border-blue-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-blue-700">
                <Users className="h-5 w-5" /> 전체 지원자 ({candidates.length}명)
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setActiveStatCard(null)}>닫기</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {candidates.slice(0, 20).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((c) => {
                const posting = postings.find((p) => p.id === c.job_posting_id)
                return (
                  <div key={c.id} className="flex items-center justify-between py-3 px-2 hover:bg-blue-50/50 cursor-pointer rounded-lg transition-colors" onClick={() => navigate(`/admin/recruitment/candidates/${c.id}`)}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">{c.name[0]}</div>
                      <div>
                        <p className="font-medium text-sm text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-500">{posting?.title || '공고 미배정'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className={`${CANDIDATE_STATUS_COLORS[c.status as CandidateStatus] || ''} text-[10px]`}>
                        {CANDIDATE_STATUS_LABELS[c.status as CandidateStatus] || c.status}
                      </Badge>
                      <span className="text-[10px] text-gray-400">{formatDate(c.created_at, 'MM/dd')}</span>
                    </div>
                  </div>
                )
              })}
              {candidates.length > 20 && <p className="text-xs text-gray-400 text-center py-2">최근 20명만 표시됩니다.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {activeStatCard === 'analyzed' && (
        <Card className="border-amber-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-amber-700">
                <BarChart3 className="h-5 w-5" /> 분석 완료 ({stats.analyzedCandidates}명)
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setActiveStatCard(null)}>닫기</Button>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const analyzed = candidates.filter((c) => ['resume_reviewed', 'survey_sent', 'survey_done', 'interview_scheduled', 'video_done', 'face_to_face_scheduled', 'face_to_face_done', 'analyzed', 'decided', 'hired'].includes(c.status))
              return analyzed.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">분석 완료된 지원자가 없습니다.</p>
              ) : (
                <div className="divide-y">
                  {analyzed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((c) => {
                    const posting = postings.find((p) => p.id === c.job_posting_id)
                    return (
                      <div key={c.id} className="flex items-center justify-between py-3 px-2 hover:bg-amber-50/50 cursor-pointer rounded-lg transition-colors" onClick={() => navigate(`/admin/recruitment/candidates/${c.id}`)}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700">{c.name[0]}</div>
                          <div>
                            <p className="font-medium text-sm text-gray-900">{c.name}</p>
                            <p className="text-xs text-gray-500">{posting?.title || '공고 미배정'}</p>
                          </div>
                        </div>
                        <Badge variant="default" className={`${CANDIDATE_STATUS_COLORS[c.status as CandidateStatus] || ''} text-[10px]`}>
                          {CANDIDATE_STATUS_LABELS[c.status as CandidateStatus] || c.status}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </CardContent>
        </Card>
      )}

      {activeStatCard === 'hired' && (
        <Card className="border-green-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-green-700">
                <Trophy className="h-5 w-5" /> 합격자 목록 ({stats.hiredCandidates}명)
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setActiveStatCard(null)}>닫기</Button>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const hired = candidates.filter((c) => c.status === 'hired')
              return hired.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">합격자가 없습니다.</p>
              ) : (
                <div className="divide-y">
                  {hired.map((c) => {
                    const posting = postings.find((p) => p.id === c.job_posting_id)
                    return (
                      <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 px-2 hover:bg-green-50/50 rounded-lg transition-colors">
                        <div className="flex items-center gap-3 cursor-pointer min-w-0" onClick={() => navigate(`/admin/recruitment/candidates/${c.id}`)}>
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-gray-900 truncate">{c.name}</p>
                            <p className="text-xs text-gray-500 truncate">{posting?.title || '공고 미배정'} · {c.email}</p>
                          </div>
                        </div>
                        <Button size="sm" className="shrink-0 self-end sm:self-auto" onClick={(e) => { e.stopPropagation(); openRegisterDialog({ id: c.id, name: c.name, email: c.email, phone: c.phone || '' }) }}>
                          <UserPlus className="h-3 w-3 mr-1" /> 직원 등록
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </CardContent>
        </Card>
      )}

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
      {/* ─── 직원 등록 다이얼로그 ──────────────────────────── */}
      <Dialog
        open={registerDialogOpen}
        onClose={() => setRegisterDialogOpen(false)}
        title="직원 등록"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <Input label="이름 *" value={registerForm.name} onChange={(e) => setRegisterForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label="이메일 *" type="email" value={registerForm.email} onChange={(e) => setRegisterForm((p) => ({ ...p, email: e.target.value }))} />
          <Input label="전화번호" value={registerForm.phone} onChange={(e) => setRegisterForm((p) => ({ ...p, phone: e.target.value }))} />
          <Select
            label="부서"
            value={registerForm.department_id}
            onChange={(e) => setRegisterForm((p) => ({ ...p, department_id: e.target.value }))}
            options={[{ value: '', label: '미정' }, ...departments.filter((d) => !d.parent_id).map((d) => ({ value: d.id, label: d.name }))]}
          />
          <Select
            label="역할"
            value={registerForm.role}
            onChange={(e) => setRegisterForm((p) => ({ ...p, role: e.target.value }))}
            options={[
              { value: 'employee', label: '사원' },
              { value: 'leader', label: '팀장' },
              { value: 'director', label: '이사' },
            ]}
          />
          <Input label="입사일" type="date" value={registerForm.start_date} onChange={(e) => setRegisterForm((p) => ({ ...p, start_date: e.target.value }))} />
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setRegisterDialogOpen(false)}>취소</Button>
            <Button onClick={handleRegisterEmployee}>
              <UserPlus className="h-4 w-4 mr-1" /> 직원 등록
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
